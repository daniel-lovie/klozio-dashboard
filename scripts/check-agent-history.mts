/** Regression check for the repairs in src/lib/agent/history.ts.
 *
 * On 2026-08-12 the Klozio agent stopped answering. The cause was one stored message: a thinking block
 * whose text had been written under `text` instead of `thinking`. Every turn after it replayed that block
 * and died with a permanent 400, and because errors were never persisted, a page reload showed only
 * unanswered questions — an agent that looked frozen.
 *
 * Deleting the row unblocked the thread; it did not fix anything. This asserts the CODE removes it, so the
 * thread cannot be bricked the same way again — and so a future refactor of sanitiseHistory has something
 * to fail against.
 *
 * Run: node --experimental-strip-types scripts/check-agent-history.mts
 * No database, no API key, no network.
 */
import { sanitiseHistory, malformedThinking } from "../src/lib/agent/history.ts";

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { console.log(`  ok   ${name}`); return; }
  failures++;
  console.error(`  FAIL ${name}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
}

// The exact block that took production down: type "thinking", text instead of thinking, real signature.
const POISONED = { type: "thinking", text: "", signature: "x".repeat(120) };

console.log("malformedThinking");
check("catches the production block", malformedThinking(POISONED));
check("catches redacted_thinking without data", malformedThinking({ type: "redacted_thinking" }));
check("passes a well-formed thinking block", !malformedThinking({ type: "thinking", thinking: "", signature: "s" }));
check("passes text and tool_use", !malformedThinking({ type: "text", text: "hi" }) && !malformedThinking({ type: "tool_use", id: "t1" }));

console.log("sanitiseHistory · the production failure");
{
  // The shape as persisted: the poisoned assistant message, then the max_tokens continuation nudge.
  const out = sanitiseHistory([
    { role: "user", content: "50 tasarim uret" },
    { role: "assistant", content: [POISONED] },
    { role: "user", content: "Cevabin uzunluk sinirina takildi. Kaldigin yerden devam et." },
  ]);
  const blocks = out.flatMap((m: any) => Array.isArray(m.content) ? m.content : []);
  check("the poisoned block is gone", !blocks.some((b: any) => malformedThinking(b)), blocks);
  // Its message carried nothing else, so the message itself must not survive as an empty content array —
  // the API rejects that too.
  check("its now-empty message is dropped", out.length === 2, out.map((m: any) => m.role));
}

console.log("sanitiseHistory · well-formed thinking survives");
{
  const good = { type: "thinking", thinking: "", signature: "sig-abc" };
  const out = sanitiseHistory([
    { role: "user", content: "merhaba" },
    { role: "assistant", content: [good, { type: "text", text: "selam" }] },
  ]);
  const kept = (out[1]?.content ?? []).find((b: any) => b.type === "thinking");
  check("kept with its signature intact", kept?.signature === "sig-abc", kept);
}

console.log("sanitiseHistory · tool pairing");
{
  // An unanswered tool_use with something appended after it. The old code only trimmed the tail, so a
  // trailing error note left this stranded mid-history and the next turn 400'd on it.
  const out = sanitiseHistory([
    { role: "user", content: "durum?" },
    { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "sql", input: {} }] },
    { role: "assistant", content: [{ type: "text", text: "⚠️ hata" }] },
  ]);
  const uses = out.flatMap((m: any) => Array.isArray(m.content) ? m.content : []).filter((b: any) => b.type === "tool_use");
  check("unanswered tool_use dropped even when not last", uses.length === 0, out);
  check("the appended note survives", out.some((m: any) => (m.content ?? []).some?.((b: any) => b.text?.includes("hata"))));
}
{
  const out = sanitiseHistory([
    { role: "user", content: "durum?" },
    { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "sql", input: {} }] },
    { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "[]" }] },
  ]);
  const uses = out.flatMap((m: any) => Array.isArray(m.content) ? m.content : []).filter((b: any) => b.type === "tool_use");
  check("an answered tool_use is kept", uses.length === 1, out);
}
{
  // A tool_result whose tool_use the window slice cut away.
  const out = sanitiseHistory([
    { role: "user", content: [{ type: "tool_result", tool_use_id: "orphan", content: "[]" }] },
    { role: "assistant", content: [{ type: "text", text: "ok" }] },
  ]);
  const results = out.flatMap((m: any) => Array.isArray(m.content) ? m.content : []).filter((b: any) => b.type === "tool_result");
  check("orphaned tool_result dropped", results.length === 0, out);
}

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
