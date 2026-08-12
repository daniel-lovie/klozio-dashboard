/** Anthropic tool-use loop with streaming. Yields UI events; persists the thread. */
import { q, one } from "../db";
import { AGENT_SYSTEM } from "./prompt";
import { TOOL_DEFS, execTool } from "./tools";
import { sanitiseHistory } from "./history";

// Sonnet by default, not Opus. The bill is dominated by output tokens and cache traffic, and the work
// here — read some rows, write product copy, run SQL — is not what Opus is for. Opus 5 output is $25/MTok
// against Sonnet 5's $15, so the gap is narrower than it was when this comment first cited $75, but the
// reasoning holds. Override per deployment with PERSONALIZER_MODEL if a task genuinely needs the bigger
// model; re-measure before assuming the old ~5x cost ratio still applies.
const MODEL = process.env.PERSONALIZER_MODEL || "claude-sonnet-5";
const MAX_STEPS = 25;
/** Inline image generations allowed per turn. Each one costs minutes; see the cap in the tool loop. */
const MAX_PRODUCE_PER_TURN = 2;

/** USD per million tokens, per model. Keep in step with the vendor's price list. */
const RATES: Record<string, { in: number; cacheWrite: number; cacheRead: number; out: number }> = {
  // Opus 5 is $5/$25, not the $15/$75 this table used to carry — those were Opus 4.1 rates, one
  // generation stale. It mattered beyond the Opus row: an unknown model falls back to this entry, so
  // every unrecognised model was invoiced at three times its real output price.
  "claude-opus-5":   { in: 5,    cacheWrite: 6.25,  cacheRead: 0.5,  out: 25 },
  // Sticker price. Sonnet 5 runs an introductory $2/$10 through 2026-08-31, so this over-reports by
  // about a third until then — left alone deliberately, per the over-reporting rule below.
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
      //
      // 16000 then turned out to be too tight for a different reason: max_tokens is a ceiling on
      // thinking AND response text together. One step spent all 16000 inside a thinking block and
      // emitted no text and no tool call at all, which is what bricked the thread on 2026-08-12.
      model: MODEL, max_tokens: 32000, stream: true,
      // Say what we want instead of inheriting it. Leaving `thinking` unset does NOT mean "no
      // thinking" on Sonnet 5 — it runs adaptive thinking, a silent change from Sonnet 4.6 where the
      // same omission meant thinking off. This loop was using the feature without knowing it.
      thinking: { type: "adaptive" },
      // Sonnet 5 defaults to effort "high". This workload is SQL plus product copy, and "medium" is
      // about where Sonnet 4.6's "high" sat — enough for the job and cheaper per turn. Worth measuring
      // "low" against the golden cases before going further down.
      output_config: { effort: "medium" },
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
        // Build each block in the shape the API will accept back. Coercing everything that was not a
        // tool_use into a text block is what bricked a thread: a thinking block's text belongs in a
        // `thinking` field, and one stored under `text` instead is rejected for ever after with
        // "messages.N.content.0.thinking.thinking: Field required" — on every later turn, because the
        // malformed block is what gets persisted and replayed.
        curJson = "";
        const type = ev.content_block?.type || "text";
        if (type === "tool_use") {
          cur = { type: "tool_use", id: ev.content_block.id, name: ev.content_block.name, input: {} };
        } else if (type === "thinking") {
          cur = { type: "thinking", thinking: ev.content_block?.thinking ?? "" };
        } else if (type === "redacted_thinking") {
          cur = { type: "redacted_thinking", data: ev.content_block?.data ?? "" };
        } else {
          cur = { type, text: ev.content_block?.text ?? "" };
        }
      } else if (ev.type === "content_block_delta") {
        const d = ev.delta ?? {};
        if (d.type === "text_delta") { cur.text += d.text; yield { kind: "text", text: d.text }; }
        else if (d.type === "input_json_delta") curJson += d.partial_json;
        // Thinking is not shown to the operator, but it must count as content so an answer that
        // consists of reasoning plus a tool call is not mistaken for an empty response.
        else if (d.type === "thinking_delta") cur.thinking = (cur.thinking ?? "") + (d.thinking ?? "");
        else if (d.type === "signature_delta") cur.signature = d.signature;
      } else if (ev.type === "content_block_stop") {
        if (cur?.type === "tool_use") { try { cur.input = curJson ? JSON.parse(curJson) : {}; } catch { cur.input = {}; } }
        // Drop blocks the API would reject on the way back, per type. An empty text block is rejected.
        // An empty THINKING block is not junk: with thinking.display defaulting to "omitted" the text
        // is empty by design and only the signature comes back, and that block still has to be echoed
        // unchanged. So keep a thinking block that carries either text or a signature, and drop only
        // the one that carries neither.
        const keep = cur && (
          cur.type === "thinking" ? Boolean(cur.thinking || cur.signature)
          : cur.type === "redacted_thinking" ? Boolean(cur.data)
          : cur.type === "text" ? Boolean(cur.text)
          : true);
        if (keep) content.push(cur);
        cur = null;
      } else if (ev.type === "message_delta") {
        if (ev.delta?.stop_reason) stopReason = ev.delta.stop_reason;
        if (ev.usage?.output_tokens) usage.output_tokens = ev.usage.output_tokens;
      }
    }
  }
  yield { kind: "assistant", content, stopReason, usage };
}

/** One image the operator attached, already normalised by the route. */
export type TurnImage = { mime: string; data: string };

export async function* runAgentTurn(
  userText: string,
  shopId = 1,
  shopName = "Klozio",
  byoKey?: string,
  opts: { chatId?: number; images?: TurnImage[] } = {},
): AsyncGenerator<AgentEvent> {
  const apiKey = byoKey || process.env.ANTHROPIC_API_KEY || "";
  const byo = !!byoKey;
  const { resolveSession, titleFromFirstMessage } = await import("./sessions");
  const chatId = await resolveSession(shopId, opts.chatId);
  const row = await one<{ messages: any[] }>(`SELECT messages FROM agent_chats WHERE id=$1`, [chatId]);
  // Slice the window first, then repair what the slice broke. Doing it the other way round would let a
  // freshly orphaned tool_result through.
  let messages: any[] = sanitiseHistory((row?.messages ?? []).slice(-40));
  const banner = `[Aktif mağaza: ${shopName} (shop_id=${shopId}) — tüm SQL sorgularında bu mağazaya filtrele]\n${userText}`;
  // Images go BEFORE the text: the model reads the reference first and then the instruction about it,
  // which is the order the operator means when they paste an example and say "like this, but…".
  messages.push(opts.images?.length
    ? {
        role: "user",
        content: [
          ...opts.images.map((im) => ({
            type: "image",
            source: { type: "base64", media_type: im.mime, data: im.data },
          })),
          { type: "text", text: banner },
        ],
      }
    : { role: "user", content: banner });
  await titleFromFirstMessage(chatId, userText);

  let wrote = false;                  // did this turn change anything, or only read?
  let nudges = 0;                     // how many times we have pushed it to keep its word
  let produceCalls = 0;               // image generations run inline this turn (see the cap below)
  let finished = false;               // did the model answer, or did we run out of steps?

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
        // Retrying is for transient failures. A 400 invalid_request means the payload itself is wrong —
        // a malformed history, a tool schema, too many tokens — and the same payload will be rejected
        // every time. Retrying it three times only delays the error the operator needs to see.
        if (/\b400\b|invalid_request_error/i.test(String(lastErr?.message ?? ""))) break;
        if (attempt < 3) {
          // Say it out loud: text from the failed attempt may already be on screen, and a silent
          // restart would read as the agent repeating itself for no reason.
          yield { t: "tool", d: `akis kesildi, tekrar deneniyor (${attempt}/3)` };
          await new Promise((r) => setTimeout(r, 1500 * attempt));
        }
      }
      if (!assistant?.content?.length) {
        throw new Error(lastErr?.message
          ? `model yanit vermedi: ${String(lastErr.message).slice(0, 200)}`
          : "model bos yanit dondu (akis 3 kez kesildi) — istegi bolerek deneyin");
      }
      // Echo the turn back as received. Thinking blocks are part of that contract: on the same model
      // they must be replayed unchanged, signature included — the API rejects a tampered one, and
      // dropping them can break block ordering.
      //
      // There used to be a fallback here that pushed the raw content when this filter came back empty.
      // That is precisely how a malformed thinking block reached the history and poisoned every later
      // turn: the filter excluded thinking, went empty, and the fallback put the block back. An empty
      // result now means nothing usable was returned, which the check above already treats as an error.
      const echo = assistant.content.filter((b: any) =>
        b.type === "text" || b.type === "tool_use" || b.type === "thinking" || b.type === "redacted_thinking");
      messages.push({ role: "assistant", content: echo });
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
        finished = true;      // answered in prose; the loop is done, not out of steps
        break;
      }

      const results: any[] = [];
      for (const block of assistant.content.filter((b: any) => b.type === "tool_use")) {
        // `produce` blocks the turn for minutes per product — one Higgsfield call plus seven composites.
        // Asked for fifty designs, the model reached for it fifty times, which fits neither MAX_STEPS nor
        // the 800s request ceiling: the turn could only die. Prompting alone can't guarantee restraint on
        // a number, so cap it here and hand the model the queue instead. Batches belong to the producer
        // ticker, which drains approved rows at one per 90s without anyone waiting on a request.
        if (block.name === "produce" && produceCalls >= MAX_PRODUCE_PER_TURN) {
          const refusal = `ERROR: bu turda ${MAX_PRODUCE_PER_TURN} 'produce' cagrisi siniri asildi. `
            + "Toplu uretim bu aracin isi degil: content_status='approved' ve design_prompt dolu satirlari "
            + "INSERT et, producer dongusu 90 sn'de bir birini alir. Durumu 'production_status' ile bildir.";
          yield { t: "tool", d: "produce ▸ tur siniri — kuyruga yonlendirildi" };
          results.push({ type: "tool_result", tool_use_id: block.id, content: refusal });
          continue;
        }
        if (block.name === "produce") produceCalls++;
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
    // Running out of steps used to end the turn in silence: no event, no note, just `done`. After a
    // reload the operator saw their question with no answer under it and no way to tell a hung request
    // from an exhausted one. Say so, and persist it — the model should also know why it was cut off.
    // Keyed on `finished` rather than the step count, because a turn that answers on the very last step
    // has also used all of them and is not truncated.
    if (!finished) {
      const note = `⚠️ Adim siniri doldu (${MAX_STEPS}). Is yarim kalmis olabilir — kalan kismi tekrar isteyin.`;
      yield { t: "error", d: note };
      messages.push({ role: "assistant", content: [{ type: "text", text: note }] });
    }
  } catch (e: any) {
    const note = `⚠️ ${String(e?.message ?? e).slice(0, 400)}`;
    yield { t: "error", d: note };
    // Keep the failure in the transcript. The error event is only an SSE frame, so reloading the page
    // erased it and left three unanswered questions on screen — which is how a thread that was loudly
    // reporting a 400 on every turn looked, to the operator, like an agent that had frozen.
    messages.push({ role: "assistant", content: [{ type: "text", text: note }] });
  } finally {
    // Never persist a message the API will reject on the next turn: an empty content array, a tool_use
    // whose result never arrived, or a tool_result the window slice separated from its tool_use.
    const clean = sanitiseHistory(messages.slice(-60));
    await q(`UPDATE agent_chats SET messages=$1, updated_at=now() WHERE id=$2`, [JSON.stringify(clean), chatId]);
  }
  yield { t: "done" };
}
