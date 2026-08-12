/** Repairs that keep a stored conversation replayable.
 *
 * These live apart from the agent loop for one reason: they are the code that decides whether a thread
 * lives or dies, and they need to be runnable on a captured history with no database, no API key, and no
 * network. `scripts/check-agent-history.mts` does exactly that against the real message that took the
 * production thread down on 2026-08-12. A fix nobody can re-run is a fix nobody can trust.
 *
 * Pure functions, no imports. Do not add a second copy of any of this in the loop.
 */

/** A thinking block the API will reject: its required field is missing.
 *
 * This is the shape that killed a thread. A streaming bug stored thinking text under `text` instead of
 * `thinking`, the block was persisted, and from then on every single turn died with a permanent 400
 * ("messages.N.content.0.thinking.thinking: Field required") — the operator saw an agent that had simply
 * stopped answering. Repairing on load matters more than fixing the writer: rows written by the old code
 * are still in the database, and a thread nobody can use is worse than a thread missing one reasoning
 * block.
 *
 * Only malformed blocks go. A well-formed thinking block must be replayed unchanged, signature included —
 * the API rejects a tampered one, and dropping them can break block ordering.
 */
export function malformedThinking(b: any): boolean {
  if (b?.type === "thinking") return typeof b.thinking !== "string";
  if (b?.type === "redacted_thinking") return typeof b.data !== "string";
  return false;
}

/** Make a message list satisfy the API's content and tool-pairing contracts, whatever slicing did to it.
 *
 * A tool_result does not ride in its own message — it is content inside a USER message. So "trim until
 * the first user message" is not a clean boundary: it happily leaves a tool_result whose tool_use was
 * dropped by the window slice, and the API answers 400 "unexpected tool_use_id found in tool_result
 * blocks". That failure is permanent rather than transient, because the broken prefix is what gets
 * persisted and replayed on every later message — the operator sees the agent die on every attempt and
 * clearing the chat is the only way out.
 *
 * Both ends of the round trip slice a window (40 on load, 60 on save), so both ends need this. Every
 * repair here exists because its absence produced exactly one symptom: an agent that stopped answering.
 */
export function sanitiseHistory(messages: any[]): any[] {
  const out: any[] = [];
  let offered = new Set<string>();          // tool_use ids the previous assistant message asked for
  for (const m of messages) {
    if (m?.role === "assistant") {
      const blocks = (Array.isArray(m.content) ? m.content : []).filter((b: any) => !malformedThinking(b));
      offered = new Set(blocks.filter((b: any) => b?.type === "tool_use").map((b: any) => b.id));
      if (typeof m.content === "string" ? m.content.length > 0 : blocks.length > 0) {
        out.push(Array.isArray(m.content) ? { ...m, content: blocks } : m);
      }
      continue;
    }
    if (!Array.isArray(m?.content)) {
      if (typeof m?.content === "string" && m.content.length) out.push(m);
      offered = new Set();
      continue;
    }
    const kept = m.content.filter((b: any) => b?.type !== "tool_result" || offered.has(b.tool_use_id));
    if (kept.length) out.push({ ...m, content: kept });
    offered = new Set();
  }
  // Second pass: a tool_use must be answered by tool_results in the very next message. Dropping only
  // the ones at the tail was not enough — anything appended afterwards (an error note, a nudge) leaves
  // an unanswered tool_use stranded mid-history, and the API rejects that with "tool_use ids were found
  // without tool_result blocks" on every later turn. Same permanent-400 failure, different position.
  const paired: any[] = [];
  for (let i = 0; i < out.length; i++) {
    const m = out[i];
    if (m.role !== "assistant" || !Array.isArray(m.content)) { paired.push(m); continue; }
    const next = out[i + 1];
    const answered = new Set(
      (next && next.role === "user" && Array.isArray(next.content) ? next.content : [])
        .filter((b: any) => b?.type === "tool_result")
        .map((b: any) => b.tool_use_id),
    );
    const blocks = m.content.filter((b: any) => b?.type !== "tool_use" || answered.has(b.id));
    if (blocks.length) paired.push({ ...m, content: blocks });
  }
  return paired;
}
