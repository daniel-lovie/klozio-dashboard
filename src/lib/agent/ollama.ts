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

/**
 * The eye, kept separate from the brain.
 *
 * The text model has no vision, and `toOllama` was dropping image blocks on the floor — so asked
 * "can you see my design?" it answered, correctly, that it could not, having been handed nothing.
 * Worse, a tool result carrying an image (which is the entire point of `look`) fell through to
 * JSON.stringify and poured raw base64 into the prompt.
 *
 * A vision model DESCRIBES; it does not take over. Swapping the agent for a VLM would trade tool
 * calling — the thing this agent is made of — for eyesight it needs on a minority of turns. So images
 * are turned into words once, by a small model, and the words go to the agent that can act on them.
 */
const VISION_MODEL = (process.env.LOCAL_VISION_MODEL || "qwen2.5vl:7b").trim();

/** What the agent needs to know about a picture, in the terms it works in. */
const VISION_BRIEF =
  "Describe this image as a design brief for a t-shirt graphic, in English, in at most 90 words. "
  + "Cover: the subject, the composition, the illustration style, the colour palette by name, whether "
  + "any words or lettering appear (quote them), and the background. State only what you can see.";

/**
 * Descriptions are cached by image content for the life of the process.
 *
 * History is replayed in full on every turn, so a reference image pasted once would otherwise be
 * re-described on every step of every later turn — several seconds and a model load each time, for an
 * answer that cannot have changed.
 */
const seen = new Map<string, string>();
const VISION_MAX = 400;

function imageKey(data: string): string {
  let h = 0;
  for (let i = 0; i < data.length; i += 97) h = (h * 31 + data.charCodeAt(i)) | 0;
  return `${data.length}:${h}`;
}

async function describeImage(b64: string, mime: string): Promise<string> {
  const key = imageKey(b64);
  const hit = seen.get(key);
  if (hit) return hit;
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 180_000);
    const res = await fetch(`${OLLAMA}/api/chat`, {
      method: "POST", signal: c.signal,
      headers: ollamaHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({
        // A short hold, deliberately. Ollama runs one model at a time on this box (the memory rule that
        // keeps diffusion and the LLM from colliding), so loading the eye evicts the brain and the next
        // step pays for a reload. 60s is long enough for several images in one turn and short enough
        // that the memory is back before the operator's next question.
        model: VISION_MODEL, stream: false, keep_alive: "60s",
        messages: [{ role: "user", content: VISION_BRIEF, images: [b64] }],
      }),
    });
    clearTimeout(t);
    if (!res.ok) throw new Error(`${res.status}`);
    const j: any = await res.json();
    const text = String(j?.message?.content ?? "").trim().slice(0, 1200);
    if (!text) throw new Error("empty");
    const out = `[image the operator attached (${mime}), described by the vision model: ${text}]`;
    if (seen.size > VISION_MAX) seen.clear();   // a plain bound; these are cheap to recompute
    seen.set(key, out);
    return out;
  } catch (e: any) {
    // Saying so is the point. Dropping the image silently is what produced an agent that claimed it
    // could not see while nobody knew the pipe was disconnected.
    return `[an image is attached but it could not be read (${String(e?.message ?? e).slice(0, 60)}). `
         + "Tell the operator you cannot see it and ask them to describe it.]";
  }
}

/**
 * Replace every image block with words, before the messages reach a model that cannot see.
 *
 * Runs over the whole history because the history is what gets replayed; the cache keeps that from
 * costing anything after the first time.
 */
export async function describeImages(messages: any[]): Promise<any[]> {
  const out: any[] = [];
  for (const m of messages) {
    if (typeof m.content === "string" || !Array.isArray(m.content)) { out.push(m); continue; }
    const blocks: any[] = [];
    for (const b of m.content) {
      if (b?.type === "image" && b?.source?.data) {
        blocks.push({ type: "text", text: await describeImage(b.source.data, b.source.media_type ?? "image") });
      } else if (b?.type === "tool_result" && Array.isArray(b.content)) {
        const parts: string[] = [];
        for (const x of b.content) {
          if (x?.type === "image" && x?.source?.data) {
            parts.push(await describeImage(x.source.data, x.source.media_type ?? "image"));
          } else parts.push(x?.text ?? JSON.stringify(x));
        }
        blocks.push({ ...b, content: parts.join("\n") });
      } else blocks.push(b);
    }
    out.push({ ...m, content: blocks });
  }
  return out;
}

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
      messages: toOllama(await describeImages(messages), system),
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

/**
 * One question, one answer, no tools, no history — for the pipeline code that wants a sentence from
 * the model rather than a conversation.
 *
 * Returns null instead of throwing, on every failure path including a cold load that runs long. Every
 * caller here has a deterministic fallback, and a model that is busy drawing must never be the reason
 * a nightly run fails. The timeout is generous for the same reason the chat path's is: this box serves
 * one model at a time, so a text prompt arriving while ComfyUI holds the GPU waits for a real load.
 */
export async function askLocal(
  prompt: string,
  opts: { system?: string; timeoutMs?: number; maxTokens?: number; schema?: object } = {},
): Promise<string | null> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), opts.timeoutMs ?? 240_000);
  try {
    const res = await fetch(`${OLLAMA}/api/chat`, {
      method: "POST", signal: c.signal,
      headers: ollamaHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({
        model: MODEL, stream: false, keep_alive: "5m",
        // Qwen3 reasons by default and puts that reasoning in a SEPARATE `thinking` field, so a short
        // num_predict was spent entirely on it and `content` came back empty — every call here returned
        // null and every caller silently took its fallback. Reasoning off, and the budget goes to the
        // answer. With it off the model still preambles in prose, which is why `schema` matters below.
        think: false,
        ...(opts.schema ? { format: opts.schema } : {}),
        options: { temperature: 0.2, num_predict: opts.maxTokens ?? 220 },
        messages: [
          ...(opts.system ? [{ role: "system", content: opts.system }] : []),
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    const raw = String(j?.message?.content ?? "").trim();
    return raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim() || null;
  } catch {
    return null;
  } finally { clearTimeout(t); }
}

/** askLocal with a JSON schema forced on the reply. Returns null on anything that will not parse. */
export async function askLocalJSON<T = any>(
  prompt: string,
  schema: object,
  opts: { system?: string; timeoutMs?: number; maxTokens?: number } = {},
): Promise<T | null> {
  const raw = await askLocal(prompt, { ...opts, schema });
  if (!raw) return null;
  try {
    return JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as T;
  } catch {
    return null;
  }
}

/**
 * Describe a picture that lives at a URL.
 *
 * The private `describeImage` above takes base64 out of a chat message; this is the same eye pointed at
 * the open web, which is what style research needs. It returns null rather than throwing, because every
 * caller has something sensible to do without it and a slow vision model must not fail a nightly run.
 */
export async function describeImageUrl(url: string, brief?: string): Promise<string | null> {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 30_000);
    let b64: string;
    try {
      const r = await fetch(url, { signal: c.signal, headers: { "user-agent": "klozio-research/1.0" } });
      if (!r.ok) return null;
      b64 = Buffer.from(await r.arrayBuffer()).toString("base64");
    } finally { clearTimeout(t); }

    const c2 = new AbortController();
    const t2 = setTimeout(() => c2.abort(), 180_000);
    try {
      const res = await fetch(`${OLLAMA}/api/chat`, {
        method: "POST", signal: c2.signal,
        headers: ollamaHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({
          model: VISION_MODEL, stream: false, keep_alive: "5m",
          options: { temperature: 0.2, num_predict: 220 },
          messages: [{ role: "user", content: brief ?? VISION_BRIEF, images: [b64] }],
        }),
      });
      if (!res.ok) return null;
      const j = await res.json();
      return String(j?.message?.content ?? "").trim() || null;
    } finally { clearTimeout(t2); }
  } catch {
    return null;
  }
}
