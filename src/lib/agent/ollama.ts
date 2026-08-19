/**
 * The chat agent, served by Qwen on the Spark instead of Anthropic.
 *
 * This is a TRANSLATION LAYER, not a second agent. It speaks Anthropic's message shape outward —
 * content blocks, `tool_use`, `tool_result` — so loop.ts, history.ts and tools.ts are untouched, and
 * the fifteen hundred lines of tool handling and history repair that already work keep working. Only
 * the wire format underneath changes.
 *
 * What is genuinely lost, and there is no way around it: SERVER_TOOLS. `web_search` and `web_fetch`
 * run inside Anthropic's infrastructure. A local model has no such thing, so an agent on this path
 * cannot search the web. Every other tool in this codebase runs on our side and is unaffected.
 *
 * Verified before the port was written rather than after: asked three questions with two tools
 * offered, Qwen3 30B-A3B called `sql` for a count, `produce` with the right product id, and correctly
 * called nothing at all for a greeting.
 */

const OLLAMA = process.env.OLLAMA_URL || "http://127.0.0.1:11434";

/**
 * Ollama itself has no authentication, so the Spark publishes it through a bearer-token gate
 * (`ops/ollama_auth_proxy.py`) and the public hostname answers 401 without this header. Locally the
 * variable is unset and we talk to the loopback port directly, which is why it is optional rather
 * than required — an empty token must not turn a working local setup into a 401.
 */
const OLLAMA_TOKEN = (process.env.OLLAMA_TOKEN || "").trim();

function ollamaHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return OLLAMA_TOKEN ? { ...extra, authorization: `Bearer ${OLLAMA_TOKEN}` } : { ...extra };
}
const MODEL = process.env.LOCAL_TEXT_MODEL || "qwen3:30b-a3b";

type Block = { type: string; [k: string]: any };

/** Anthropic tool definitions -> the OpenAI-style shape Ollama expects. */
export function toolsForOllama(defs: readonly any[]) {
  return defs.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.input_schema },
  }));
}

/**
 * Anthropic messages -> Ollama messages.
 *
 * The tricky part is tool results. Anthropic carries them as blocks inside a USER message, keyed by
 * tool_use_id; Ollama wants a separate message with role "tool". Flattening them in the wrong order
 * is what makes a model answer the previous question, so each result is emitted as its own message in
 * the order the assistant asked for them.
 */
export function toOllama(messages: any[], system: string) {
  const out: any[] = [{ role: "system", content: system }];
  for (const m of messages) {
    if (typeof m.content === "string") {
      out.push({ role: m.role, content: m.content });
      continue;
    }
    const blocks: Block[] = m.content ?? [];
    if (m.role === "assistant") {
      const text = blocks.filter((b) => b.type === "text").map((b) => b.text).join("");
      const calls = blocks.filter((b) => b.type === "tool_use").map((b) => ({
        function: { name: b.name, arguments: b.input ?? {} },
      }));
      const msg: any = { role: "assistant", content: text };
      if (calls.length) msg.tool_calls = calls;
      out.push(msg);
      continue;
    }
    const results = blocks.filter((b) => b.type === "tool_result");
    const text = blocks.filter((b) => b.type === "text").map((b) => b.text).join("");
    if (text) out.push({ role: "user", content: text });
    for (const r of results) {
      const c = typeof r.content === "string"
        ? r.content
        : (r.content ?? []).map((x: any) => x?.text ?? JSON.stringify(x)).join("\n");
      out.push({ role: "tool", content: c });
    }
  }
  return out;
}

let idCounter = 0;
function toolId() {
  idCounter += 1;
  return `toolu_local_${Date.now().toString(36)}_${idCounter}`;
}

/**
 * One turn, streamed, in the same generator shape loop.ts already consumes.
 *
 * Ollama streams NDJSON rather than SSE, and it emits tool calls only on the final object, so text is
 * forwarded as it arrives and the assistant turn is assembled at the end.
 */
export async function* streamOllama(messages: any[], system: string, tools: readonly any[]): AsyncGenerator<
  { kind: "text"; text: string } |
  { kind: "assistant"; content: any[]; stopReason: string;
    usage: { input_tokens: number; output_tokens: number; cache_read: number; cache_write: number; searches: number } }
> {
  const res = await fetch(`${OLLAMA}/api/chat`, {
    method: "POST",
    headers: ollamaHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({
      model: MODEL, stream: true, keep_alive: "10m",
      tools: toolsForOllama(tools),
      messages: toOllama(messages, system),
    }),
  });
  if (!res.ok || !res.body) {
    const err = await res.text().catch(() => "");
    throw new Error(`Ollama ${res.status}: ${err.slice(0, 300)}`);
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let text = "";
  let calls: any[] = [];
  let inTokens = 0, outTokens = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let ev: any;
      try { ev = JSON.parse(line); } catch { continue; }
      const chunk = ev?.message?.content ?? "";
      if (chunk) { text += chunk; yield { kind: "text", text: chunk }; }
      if (ev?.message?.tool_calls?.length) calls = ev.message.tool_calls;
      if (ev?.done) {
        inTokens = ev.prompt_eval_count ?? 0;
        outTokens = ev.eval_count ?? 0;
      }
    }
  }

  const content: any[] = [];
  if (text.trim()) content.push({ type: "text", text });
  for (const c of calls) {
    const args = typeof c.function?.arguments === "string"
      ? safeParse(c.function.arguments)
      : (c.function?.arguments ?? {});
    content.push({ type: "tool_use", id: toolId(), name: c.function?.name, input: args });
  }
  yield {
    kind: "assistant",
    content,
    stopReason: calls.length ? "tool_use" : "end_turn",
    // No prompt caching on this path, so the cache figures are honestly zero rather than copied
    // across from a provider that does have it.
    usage: { input_tokens: inTokens, output_tokens: outTokens,
             cache_read: 0, cache_write: 0, searches: 0 },
  };
}

function safeParse(s: string) {
  try { return JSON.parse(s); } catch { return {}; }
}

/** Is the chat agent configured to run locally, and is the model actually there? */
export async function ollamaReady(timeout = 3000): Promise<boolean> {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), timeout);
    const r = await fetch(`${OLLAMA}/api/tags`, { signal: c.signal, headers: ollamaHeaders() });
    clearTimeout(t);
    if (!r.ok) return false;
    const d: any = await r.json();
    return (d.models ?? []).some((m: any) => String(m.name).startsWith(MODEL.split(":")[0]));
  } catch {
    return false;
  }
}
