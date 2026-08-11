/** Anthropic tool-use loop with streaming. Yields UI events; persists the thread. */
import { q, one } from "../db";
import { AGENT_SYSTEM } from "./prompt";
import { TOOL_DEFS, execTool } from "./tools";

// Sonnet by default, not Opus. Measured on this agent's own traffic, a step costs $0.248 on Opus and the
// bill is dominated by output tokens ($75/MTok) and cache traffic; the same step on Sonnet is roughly a
// fifth of that, and the work here — read some rows, write product copy, run SQL — is not what Opus is
// for. Override per deployment with PERSONALIZER_MODEL if a task genuinely needs the bigger model.
const MODEL = process.env.PERSONALIZER_MODEL || "claude-sonnet-5";
const MAX_STEPS = 25;

/** USD per million tokens, per model. Keep in step with the vendor's price list. */
const RATES: Record<string, { in: number; cacheWrite: number; cacheRead: number; out: number }> = {
  "claude-opus-5":   { in: 15,   cacheWrite: 18.75, cacheRead: 1.5,  out: 75 },
  "claude-sonnet-5": { in: 3,    cacheWrite: 3.75,  cacheRead: 0.3,  out: 15 },
  "claude-haiku-4-5-20251001": { in: 1, cacheWrite: 1.25, cacheRead: 0.1, out: 5 },
};

/**
 * What one model call cost.
 *
 * This used to be Opus rates inlined at the call site, so pointing MODEL at a cheaper model would have
 * kept charging Opus prices on the page the billing is based on. An unknown model falls back to the most
 * expensive rates: over-reporting is recoverable, under-reporting means invoicing below cost.
 */
function stepCost(model: string, u: { input_tokens: number; output_tokens: number; cache_read: number; cache_write: number }): number {
  const r = RATES[model] ?? RATES["claude-opus-5"];
  return (u.input_tokens * r.in + u.cache_write * r.cacheWrite
          + u.cache_read * r.cacheRead + u.output_tokens * r.out) / 1_000_000;
}

// Turkish present-continuous / future forms of the verbs this agent uses for work it is about to do.
// Matching these in a closing message that changed nothing is how an unkept promise gets caught.
//
// The stem list alone was not enough. Watched live, the agent looped for four turns on exactly the two
// phrasings it did not cover — "Şimdi gerçekten INSERT ediyorum" and "Şimdi INSERT'i çalıştırıyorum" —
// because "ed" and "çalıştır" are generic stems that also carry read-only work ("kontrol ediyorum").
// Naming the SQL verb is the specific signal: a closing message that says INSERT/UPDATE/DELETE while
// nothing was written is an unkept promise whatever verb wraps it.
const PROMISE =
  /\b(yaz|üret|uret|ekle|hazırl|hazirl|oluştur|olustur|planl|gir|kayded|aç|ac|kur|başlat|baslat)(ıyorum|iyorum|uyorum|üyorum|acağım|ecegim|eceğim|acagim)\b/i;
// No closing \b: Turkish glues suffixes straight onto the borrowed word, with or without an apostrophe
// ("INSERT'i çalıştırıyorum", "INSERTleri"), and \b would only match the bare form.
const PROMISED_SQL = /\b(insert|update|delete)/i;

function promisedWork(said: string): boolean {
  return PROMISE.test(said) || PROMISED_SQL.test(said);
}

export type AgentEvent =
  | { t: "text"; d: string }
  | { t: "tool"; d: string }
  | { t: "error"; d: string }
  | { t: "done" };

async function* streamOnce(messages: any[], apiKey: string): AsyncGenerator<
  { kind: "text"; text: string } | { kind: "assistant"; content: any[]; stopReason: string; usage: { input_tokens: number; output_tokens: number; cache_read: number; cache_write: number } }
> {
  // request-time copy: cache breakpoint on the last message caches the whole conversation prefix
  const send = messages.map((m, i) => {
    if (i !== messages.length - 1) return m;
    const content = typeof m.content === "string"
      ? [{ type: "text", text: m.content, cache_control: { type: "ephemeral" } }]
      : m.content.map((b: any, j: number) =>
          j === m.content.length - 1 ? { ...b, cache_control: { type: "ephemeral" } } : b);
    return { ...m, content };
  });
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      // 4096 truncated any answer longer than a couple of concepts: the model hit the ceiling
      // mid-sentence, stop_reason came back "max_tokens", the loop treated it as a finished turn and
      // the operator got half a reply. Five product concepts with titles, descriptions, tags and
      // prompts is comfortably more than 4k tokens.
      model: MODEL, max_tokens: 16000, stream: true,
      // cache breakpoint on the system block caches tools+system (~90% input cost cut)
      system: [{ type: "text", text: AGENT_SYSTEM, cache_control: { type: "ephemeral" } }],
      tools: TOOL_DEFS, messages: send,
    }),
  });
  if (!res.ok || !res.body) {
    const err = await res.text().catch(() => "");
    throw new Error(`Anthropic ${res.status}: ${err.slice(0, 300)}`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const content: any[] = [];
  let stopReason = "end_turn";
  const usage = { input_tokens: 0, output_tokens: 0, cache_read: 0, cache_write: 0 };
  let cur: any = null;
  let curJson = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2);
      const line = chunk.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      let ev: any;
      try { ev = JSON.parse(line.slice(6)); } catch { continue; }
      if (ev.type === "error") {
        // Anthropic reports mid-stream failures (overloaded_error, api_error) as an event, not an
        // HTTP status. Ignoring it left `content` empty, the turn ended silently, and the empty
        // assistant message was then persisted — which the API rejects, so every later turn failed
        // too. One dropped event was turning a transient hiccup into a permanently broken thread.
        throw new Error(`Anthropic stream error: ${JSON.stringify(ev.error ?? ev).slice(0, 200)}`);
      } else if (ev.type === "message_start") {
        usage.input_tokens += ev.message?.usage?.input_tokens ?? 0;
        usage.cache_read += ev.message?.usage?.cache_read_input_tokens ?? 0;
        usage.cache_write += ev.message?.usage?.cache_creation_input_tokens ?? 0;
      } else if (ev.type === "content_block_start") {
        // Keep the block's real type. This used to coerce everything that was not a tool_use into an
        // empty text block, and the next branch only accumulated `text_delta` — so a `thinking` block
        // arrived, collected nothing, and was dropped as empty. A response made of thinking plus a cut
        // therefore came back with NO content at all, which surfaced to the operator as "model boş
        // yanıt döndü" on a request that had in fact been answered.
        curJson = "";
        cur = ev.content_block?.type === "tool_use"
          ? { type: "tool_use", id: ev.content_block.id, name: ev.content_block.name, input: {} }
          : { type: ev.content_block?.type || "text", text: ev.content_block?.text ?? "" };
      } else if (ev.type === "content_block_delta") {
        const d = ev.delta ?? {};
        if (d.type === "text_delta") { cur.text += d.text; yield { kind: "text", text: d.text }; }
        else if (d.type === "input_json_delta") curJson += d.partial_json;
        // Thinking is not shown to the operator, but it must count as content so an answer that
        // consists of reasoning plus a tool call is not mistaken for an empty response.
        else if (d.type === "thinking_delta") cur.text = (cur.text ?? "") + (d.thinking ?? "");
        else if (d.type === "signature_delta") cur.signature = d.signature;
      } else if (ev.type === "content_block_stop") {
        if (cur?.type === "tool_use") { try { cur.input = curJson ? JSON.parse(curJson) : {}; } catch { cur.input = {}; } }
        // empty text blocks are rejected by the API when echoed back — drop them
        if (cur && !(cur.type === "text" && !cur.text)) content.push(cur);
        cur = null;
      } else if (ev.type === "message_delta") {
        if (ev.delta?.stop_reason) stopReason = ev.delta.stop_reason;
        if (ev.usage?.output_tokens) usage.output_tokens = ev.usage.output_tokens;
      }
    }
  }
  yield { kind: "assistant", content, stopReason, usage };
}

export async function* runAgentTurn(userText: string, shopId = 1, shopName = "Klozio", byoKey?: string): AsyncGenerator<AgentEvent> {
  const apiKey = byoKey || process.env.ANTHROPIC_API_KEY || "";
  const byo = !!byoKey;
  await q(`INSERT INTO agent_chats (id, shop_id) SELECT COALESCE(max(id),0)+1, $1 FROM agent_chats
           HAVING NOT EXISTS (SELECT 1 FROM agent_chats WHERE shop_id=$1)
           ON CONFLICT (shop_id) DO NOTHING`, [shopId]);
  const row = await one<{ messages: any[] }>(`SELECT messages FROM agent_chats WHERE shop_id=$1 ORDER BY id LIMIT 1`, [shopId]);
  let messages: any[] = (row?.messages ?? []).slice(-40);
  // a dangling tool_use without its result breaks the API — trim to a clean boundary
  while (messages.length && messages[0].role !== "user") messages.shift();
  messages.push({ role: "user", content: `[Aktif mağaza: ${shopName} (shop_id=${shopId}) — tüm SQL sorgularında bu mağazaya filtrele]\n${userText}` });

  let wrote = false;                  // did this turn change anything, or only read?
  let nudges = 0;                     // how many times we have pushed it to keep its word

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      // Retry a cut stream instead of ending the turn. `overloaded_error`, an api_error and a dropped
      // connection all arrive mid-stream, and without a retry each one cost the operator the whole
      // request — including the research already done — and they had to retype it. Three attempts with
      // backoff turn a transient hiccup into a pause nobody has to act on.
      let assistant: any = null;
      let lastErr: any = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        assistant = null;
        try {
          for await (const ev of streamOnce(messages, apiKey)) {
            if (ev.kind === "text") yield { t: "text", d: ev.text };
            else assistant = ev;
          }
        } catch (e: any) {
          lastErr = e;
        }
        if (assistant?.content?.length) break;
        if (attempt < 3) {
          // Say it out loud: text from the failed attempt may already be on screen, and a silent
          // restart would read as the agent repeating itself for no reason.
          yield { t: "tool", d: `akis kesildi, tekrar deneniyor (${attempt}/3)` };
          await new Promise((r) => setTimeout(r, 1500 * attempt));
        }
      }
      if (!assistant?.content?.length) {
        throw new Error(lastErr?.message
          ? `model yanit vermedi (3 deneme): ${String(lastErr.message).slice(0, 200)}`
          : "model bos yanit dondu (akis 3 kez kesildi) — istegi bolerek deneyin");
      }
      // Echo back only what the API accepts on the next turn. Thinking blocks counted as content above
      // so a reasoning-only response is not mistaken for empty, but replaying them without extended
      // thinking enabled is rejected.
      const echo = assistant.content.filter((b: any) => b.type === "text" || b.type === "tool_use");
      messages.push({ role: "assistant", content: echo.length ? echo : assistant.content });
      const u = assistant.usage ?? { input_tokens: 0, output_tokens: 0, cache_read: 0, cache_write: 0 };
      // Rates are per model, not a constant. They were hardcoded to Opus, so changing MODEL to a cheaper
      // one would have kept billing customers Opus prices — the usage page is the billing base, and a
      // number that silently describes a different model is worse than no number.
      const cost = byo ? 0 : stepCost(MODEL, u);
      q(`INSERT INTO usage_events (shop_id, provider, kind, model, input_tokens, output_tokens, cache_read, cache_write, cost_usd, meta)
         VALUES ($1,'anthropic','chat',$2,$3,$4,$5,$6,$7,$8)`,
        [shopId, MODEL, u.input_tokens, u.output_tokens, u.cache_read, u.cache_write,
         cost.toFixed(5), JSON.stringify({ byo })]).catch(() => {});
      // Hitting the token ceiling is not the end of the turn. It used to break here, so a long answer
      // stopped mid-sentence and looked like the agent had finished.
      if (assistant.stopReason === "max_tokens") {
        yield { t: "tool", d: "uzunluk siniri, kaldigi yerden devam ediyor" };
        messages.push({ role: "user", content: "Cevabin uzunluk sinirina takildi. Kaldigin yerden devam et, bastan yazma." });
        continue;
      }
      if (assistant.stopReason !== "tool_use") {
        // A promise is not work. The model ended a turn with "5 konsepti yazıyorum" having run four
        // SELECTs and no INSERT; the turn closed, nothing was written, and the operator only found out
        // when the Plan page was empty. There is no "later" in a chat turn, so an unfulfilled
        // intention has to be turned back into work here rather than reported as done.
        const said = assistant.content.filter((b: any) => b.type === "text")
          .map((b: any) => b.text).join(" ");
        if (!wrote && nudges < 2 && promisedWork(said)) {
          nudges++;
          yield { t: "tool", d: "soz verildi ama yazilmadi — simdi yaptiriliyor" };
          messages.push({ role: "user", content:
            "Hicbir yazma islemi yapmadin, sadece okudun. Simdi gercekten yap: gerekli INSERT/UPDATE'leri "
            + "calistir, sonra ayni turda SELECT ile eklenen id'leri getir ve onlari yaz. Yapamiyorsan "
            + "nedenini soyle; 'yaziyorum' deyip bitirme." });
          continue;
        }
        break;
      }

      const results: any[] = [];
      for (const block of assistant.content.filter((b: any) => b.type === "tool_use")) {
        const { result, summary } = await execTool(block.name, block.input);
        // Remember whether this turn changed anything, so the promise check below can tell an answer
        // that did the work from one that only talked about it.
        if (block.name !== "sql" || /\b(insert|update|delete)\b/i.test(String(block.input?.query ?? block.input?.sql ?? ""))) {
          wrote = true;
        }
        yield { t: "tool", d: summary };
        results.push({ type: "tool_result", tool_use_id: block.id, content: result });
      }
      messages.push({ role: "user", content: results });
    }
  } catch (e: any) {
    yield { t: "error", d: String(e?.message ?? e).slice(0, 400) };
  } finally {
    // Never persist a message the API will reject on the next turn: an empty content array, or a
    // tool_use whose result never arrived.
    const clean = messages.filter((m: any) =>
      typeof m.content === "string" || (Array.isArray(m.content) && m.content.length > 0));
    while (clean.length && clean[clean.length - 1].role === "assistant"
           && clean[clean.length - 1].content?.some?.((b: any) => b.type === "tool_use")) {
      clean.pop();
    }
    await q(`UPDATE agent_chats SET messages=$1, updated_at=now() WHERE shop_id=$2`, [JSON.stringify(clean.slice(-60)), shopId]);
  }
  yield { t: "done" };
}
