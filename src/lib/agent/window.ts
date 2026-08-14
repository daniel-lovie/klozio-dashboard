/**
 * Which slice of a long transcript gets sent back to the model, and where that slice is allowed to start.
 *
 * This lives in its own file because it kept breaking silently. It was written inside loop.ts, which
 * imports the database, the prompt and every tool, so nothing could import it to test it — the invariant
 * "a history never opens on an assistant message" was asserted in a comment and checked by nobody, and it
 * was false twice in a row. scripts/check-agent-history.mts now fails on it instead.
 */

/** The tail we keep, plus one message that must survive the slice whatever its age.
 *
 *  Pinning is a SAVE-side job only. Pinning on load as well looked like the same fix applied twice, but
 *  `find(role === "user")` over stored history returns whichever user-role message comes first — and a
 *  tool_result is also role "user", so it usually pinned a tool_result (inert, dropped by sanitise) and
 *  when it did find a real question it re-pinned that ALREADY ANSWERED question to the head of every
 *  later turn, for ever. That is the stale-question teleport this pin was written to remove.
 *
 *  `pinned` must be an ELEMENT of `all` — identity, not an equal-looking copy, or it is prepended on top
 *  of itself and the model reads the question twice.
 */
export function keepWindow(all: any[], n: number, pinned: any | null): any[] {
  const tail = all.slice(-n);
  return pinned && !tail.includes(pinned) ? [pinned, ...tail] : tail;
}

/** A real operator turn — not a tool_result, which also carries role "user".
 *
 *  This distinction is the whole point: `role === "user"` accepted a tool_result as the window boundary,
 *  so nothing was trimmed, and sanitiseHistory then deleted that orphaned tool_result and left the window
 *  opening on an assistant message — the exact shape the trim exists to prevent, and the common shape for
 *  a tool-heavy turn rather than an edge case.
 */
export function isUserTurn(m: any): boolean {
  if (m?.role !== "user") return false;
  if (typeof m.content === "string") return true;
  return Array.isArray(m.content) && m.content.length > 0
    && !m.content.some((b: any) => b?.type === "tool_result");
}

/** Drop leading messages until the history opens on a real user turn, because the API rejects anything
 *  else. Must run AFTER sanitiseHistory: repairing orphans can itself expose an assistant head, so
 *  trimming first only measured a shape that the repair then changed.
 *
 *  Returns [] when there is no user turn at all — a window made entirely of assistant messages cannot be
 *  sent, and on load the caller appends the operator's new question straight after this. */
export function startAtUserTurn(msgs: any[]): any[] {
  const i = msgs.findIndex(isUserTurn);
  return i < 0 ? [] : msgs.slice(i);
}
