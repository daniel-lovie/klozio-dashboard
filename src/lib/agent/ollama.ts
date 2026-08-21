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
  // Two clocks, because a hang and a slow answer look identical from here and only one is a fault.
  //
  // COLD START is the slow one: loading Qwen off disk takes ~115s before a single token appears, so a
  // first-byte budget shorter than that would reject a healthy machine every time it had been idle.
  //
  // SILENCE is the fault. The chat agent lost a turn on 2026-08-19 this way: a tool finished, the next
  // request never reached the Spark, and the loop sat on a fetch with no deadline until the request
  // itself died fourteen minutes later — no answer, no error, a spinner that never stopped. The cloud
  // path has always retried a cut stream; this path had nothing to cut it. Once tokens are flowing a
  // gap this long is not a slow model, it is a connection that is never coming back, and throwing hands
  // the turn to the retry-then-fall-back-to-cloud logic that already exists in loop.ts.
  // The first-byte budget has to cover a COLD load, and cold here is not the 115s of an idle machine.
  // The worker evicts the text model whenever an image job needs the GPU — sequential tenancy is the
  // rule that keeps a 128GB box off its memory ceiling — so a chat turn that lands during production
  // waits for a reload while ComfyUI still holds the card. At 180s that read as "stream cut", retried
  // twice, and then fell through to a cloud path this deployment does not have (2026-08-21). Silence
  // before the first token is a slow machine; silence after it is a dead connection, and only the
  // second is a fault.
  const FIRST_BYTE_MS = 420_000;
  const IDLE_MS = 90_000;

  const abort = new AbortController();
  let timer = setTimeout(() => abort.abort(), FIRST_BYTE_MS);
  const bump = (ms: number) => { clearTimeout(timer); timer = setTimeout(() => abort.abort(), ms); };

  const res = await fetch(`${OLLAMA}/api/chat`, {
    method: "POST",
    signal: abort.signal,
    headers: ollamaHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({
      model: MODEL, stream: true, keep_alive: "10m",
      tools: toolsForOllama(tools),
      messages: toOllama(messages, system),
    }),
  }).catch((e: any) => {
    clearTimeout(timer);
    throw e?.name === "AbortError"
      ? new Error(`Ollama ${FIRST_BYTE_MS / 1000}sn icinde yanit vermedi`)
      : e;
  });
  if (!res.ok || !res.body) {
    clearTimeout(timer);
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
    let done: boolean, value: Uint8Array | undefined;
    try {
      ({ done, value } = await reader.read());
    } catch (e: any) {
      clearTimeout(timer);
      throw e?.name === "AbortError"
        ? new Error(`Ollama akisi ${IDLE_MS / 1000}sn sessiz kaldi`)
        : e;
    }
    if (done) break;
    // Every chunk resets the deadline, so a long answer is never cut short — only a stalled one is.
    bump(IDLE_MS);
    buf += dec.decode(value!, { stream: true });
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

  clearTimeout(timer);

  // A tool call the model TYPED instead of calling.
  //
  // Qwen does this: asked which style to use, it produced the literal characters
  // {"name": "ask", "arguments": {"question": ..., "options": [...]}} as its answer, and the operator
  // was shown raw JSON where a row of buttons belonged. Nothing failed — the model believed it had
  // asked, the app believed it had answered, and the turn ended.
  //
  // It is salvaged rather than refused because the model's INTENT is unambiguous and the alternative
  // is losing the turn. Only when no real tool call came through, and only when the parse yields a tool
  // this agent actually has: a message that merely quotes JSON stays a message.
  if (!calls.length) {
    const typed = typedToolCall(text, tools);
    if (typed) {
      calls = [{ function: { name: typed.name, arguments: typed.args } }];
      text = "";
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

/**
 * Recover a tool call the model wrote as text.
 *
 * Three shapes seen from Qwen: a bare object, one inside ```json fences, and one inside the
 * <tool_call> tags its chat template uses. The braces are matched by scanning rather than by regex,
 * because a nested object — which `ask` always has — ends a lazy pattern at the wrong place.
 */
function typedToolCall(raw: string, tools: readonly any[]):
    { name: string; args: any } | null {
  const known = new Set(tools.map((t: any) => t?.name).filter(Boolean));
  let s = raw.trim();
  if (!s) return null;
  const tag = /<tool_call>([\s\S]*?)<\/tool_call>/.exec(s);
  if (tag) s = tag[1].trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();

  const start = s.indexOf("{");
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false, end = -1;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (esc) { esc = false; continue; }
    if (ch === "\\") { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) { end = i + 1; break; }
  }
  if (end < 0) return null;

  // Text around the object means prose that happens to quote JSON, not a call. Ten characters of
  // slack covers a trailing newline or a stray period, not a sentence.
  if (start > 10 || s.length - end > 10) return null;

  let obj: any;
  try { obj = JSON.parse(s.slice(start, end)); } catch { return null; }
  const name = obj?.name ?? obj?.tool ?? obj?.function?.name;
  if (typeof name !== "string" || !known.has(name)) return null;
  const args = obj?.arguments ?? obj?.parameters ?? obj?.input ?? obj?.function?.arguments ?? {};
  return { name, args: typeof args === "string" ? safeParse(args) : (args ?? {}) };
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
