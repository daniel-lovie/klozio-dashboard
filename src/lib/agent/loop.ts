/** Anthropic tool-use loop with streaming. Yields UI events; persists the thread. */
import { q, one } from "../db";
import { AGENT_SYSTEM } from "./prompt";
import { TOOL_DEFS, execTool } from "./tools";

const MODEL = process.env.PERSONALIZER_MODEL || "claude-opus-5";
const MAX_STEPS = 25;

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
      model: MODEL, max_tokens: 4096, stream: true,
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
        cur = ev.content_block; curJson = "";
        if (cur.type === "tool_use") cur = { type: "tool_use", id: cur.id, name: cur.name, input: {} };
        else cur = { type: "text", text: "" };
      } else if (ev.type === "content_block_delta") {
        if (ev.delta.type === "text_delta") { cur.text += ev.delta.text; yield { kind: "text", text: ev.delta.text }; }
        else if (ev.delta.type === "input_json_delta") curJson += ev.delta.partial_json;
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

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      let assistant: any = null;
      for await (const ev of streamOnce(messages, apiKey)) {
        if (ev.kind === "text") yield { t: "text", d: ev.text };
        else assistant = ev;
      }
      if (!assistant?.content?.length) {
        // A cut-off stream yields nothing. Storing it poisons the thread, so fail loudly instead.
        throw new Error("model bos yanit dondu (akis kesildi) — tekrar deneyin");
      }
      messages.push({ role: "assistant", content: assistant.content });
      const u = assistant.usage ?? { input_tokens: 0, output_tokens: 0, cache_read: 0, cache_write: 0 };
      // opus per MTok: in $15, cache write $18.75, cache read $1.50, out $75; BYO key -> their bill
      const cost = byo ? 0 : (u.input_tokens * 15 + u.cache_write * 18.75 + u.cache_read * 1.5 + u.output_tokens * 75) / 1_000_000;
      q(`INSERT INTO usage_events (shop_id, provider, kind, model, input_tokens, output_tokens, cache_read, cache_write, cost_usd, meta)
         VALUES ($1,'anthropic','chat',$2,$3,$4,$5,$6,$7,$8)`,
        [shopId, MODEL, u.input_tokens, u.output_tokens, u.cache_read, u.cache_write,
         cost.toFixed(5), JSON.stringify({ byo })]).catch(() => {});
      if (assistant.stopReason !== "tool_use") break;

      const results: any[] = [];
      for (const block of assistant.content.filter((b: any) => b.type === "tool_use")) {
        const { result, summary } = await execTool(block.name, block.input);
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
