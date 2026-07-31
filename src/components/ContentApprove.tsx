"use client";
import { useState } from "react";

type Status = "draft" | "approved" | "rejected";

const PILL: Record<Status, string> = {
  draft: "bg-espresso/10 text-espresso",
  approved: "bg-emerald-100 text-emerald-900",
  rejected: "bg-red-100 text-red-900",
};

/** Per-listing content approval. Approving does not schedule anything — it marks the
 *  copy as ready so artwork can be generated for it. */
export function ContentApprove({
  productId, status, note,
}: { productId: number; status: Status; note: string | null }) {
  const [busy, setBusy] = useState(false);
  const [st, setSt] = useState<Status>(status);
  const [msg, setMsg] = useState<string | null>(null);
  const [showNote, setShowNote] = useState(false);
  const [text, setText] = useState(note ?? "");

  async function set(next: Status, withNote = false) {
    setBusy(true); setMsg(null);
    const res = await fetch(`/api/products/${productId}/content`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next, note: withNote ? text : undefined }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg(j.error || "Failed"); return; }
    setSt(next); setShowNote(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${PILL[st]}`}>{st}</span>

      {st !== "approved" && (
        <button disabled={busy} onClick={() => set("approved")}
          className="rounded-md bg-emerald-700 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50">
          Approve content
        </button>
      )}
      {st === "approved" && (
        <button disabled={busy} onClick={() => set("draft")}
          className="rounded-md border border-espresso/25 px-2.5 py-1 text-xs disabled:opacity-50">
          Undo
        </button>
      )}
      {st !== "rejected" && (
        <button disabled={busy} onClick={() => setShowNote((v) => !v)}
          className="rounded-md border border-red-300 px-2.5 py-1 text-xs text-red-800 disabled:opacity-50">
          Reject / note
        </button>
      )}

      {showNote && (
        <div className="mt-1 flex w-full items-start gap-2">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2}
            placeholder="What should change? (kept with the listing so the rewrite has your reason)"
            className="flex-1 rounded-md border border-espresso/20 bg-white px-2 py-1 text-xs" />
          <button disabled={busy} onClick={() => set("rejected", true)}
            className="rounded-md bg-red-700 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50">
            Save
          </button>
        </div>
      )}
      {note && !showNote && <span className="text-[11px] text-muted">note: {note}</span>}
      {msg && <span className="text-[11px] text-red-700">{msg}</span>}
    </div>
  );
}

/** Slot- or date-scoped bulk approval. */
export function BulkApprove({ slot, date, label }: { slot?: string; date?: string; label: string }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<number | null>(null);

  async function go(status: Status) {
    setBusy(true);
    const res = await fetch("/api/plan/content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot, date, status }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) { setDone(j.count); location.reload(); }
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <button disabled={busy} onClick={() => go("approved")}
        className="rounded-md bg-emerald-700/90 px-2 py-0.5 text-[11px] font-medium text-white disabled:opacity-50">
        Approve {label}
      </button>
      <button disabled={busy} onClick={() => go("draft")}
        className="rounded-md border border-espresso/20 px-2 py-0.5 text-[11px] disabled:opacity-50">
        reset
      </button>
      {done !== null && <span className="text-[11px] text-muted">{done} updated</span>}
    </span>
  );
}
