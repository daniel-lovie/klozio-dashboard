"use client";
import { useState } from "react";

const NEXT: Record<string, { to: string; label: string }[]> = {
  new:              [{ to: "generating", label: "Start generation" }, { to: "ready", label: "Stock design — skip to ready" }],
  generating:       [{ to: "qa", label: "Generated — to QA" }],
  qa:               [{ to: "ready", label: "QA passed" }, { to: "generating", label: "Regenerate" }],
  ready:            [{ to: "sent_to_producer", label: "Sent to producer" }],
  sent_to_producer: [{ to: "shipped", label: "Shipped (tracking below)" }],
  shipped:          [{ to: "done", label: "Done" }],
  problem:          [{ to: "new", label: "Reopen" }],
};
const PILL: Record<string, string> = {
  new: "bg-amber-100 text-amber-900", generating: "bg-blue-100 text-blue-900",
  qa: "bg-purple-100 text-purple-900", ready: "bg-emerald-100 text-emerald-900",
  sent_to_producer: "bg-teal-100 text-teal-900", shipped: "bg-espresso/10",
  done: "bg-neutral-100 text-neutral-600", problem: "bg-red-100 text-red-900",
};

export function PollButton() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  return (
    <span className="inline-flex items-center gap-2">
      <button disabled={busy} className="rounded-lg bg-espresso px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        onClick={async () => {
          setBusy(true);
          const res = await fetch("/api/orders/poll", { method: "POST" });
          const j = await res.json().catch(() => ({}));
          setBusy(false);
          setMsg(res.ok ? `${j.inserted} new · ${j.receipts} receipts` : j.error || "failed");
          if (res.ok && j.inserted > 0) location.reload();
        }}>
        {busy ? "Polling…" : "Poll Etsy now"}
      </button>
      {msg && <span className="text-xs text-muted">{msg}</span>}
    </span>
  );
}

export function OrderRow({ row, at }: { row: any; at: string }) {
  const [busy, setBusy] = useState(false);
  const [tracking, setTracking] = useState(row.tracking_code ?? "");

  async function move(status: string) {
    setBusy(true);
    const res = await fetch(`/api/orders/${row.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, tracking_code: tracking || undefined }),
    });
    setBusy(false);
    if (res.ok) location.reload();
  }

  return (
    <div className="rounded-xl border border-espresso/15 bg-white/60 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${PILL[row.status]}`}>{row.status}</span>
        <span className="text-xs text-muted">#{row.id} · {at}</span>
        <span className="rounded bg-espresso/10 px-1.5 py-0.5 text-[11px]">{row.slot ?? "?"} · {row.slug ?? row.etsy_listing_id}</span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{row.title ?? "(unknown listing)"}</span>
        <span className="text-xs">{row.colorway ?? "?"} / {row.size ?? "?"} × {row.quantity}</span>
      </div>

      {row.personalization && (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm">
          <span className="font-semibold">Personalization (print EXACTLY):</span>{" "}
          <span className="font-mono">{row.personalization}</span>
        </p>
      )}
      <div className="mt-2 grid gap-2 text-xs text-muted sm:grid-cols-2">
        <pre className="whitespace-pre-wrap font-sans">{row.ship_to}</pre>
        <div>
          {row.producer_order_id && <p>producer: {row.producer_order_id}</p>}
          {row.note && <p>note: {row.note}</p>}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {(NEXT[row.status] ?? []).map((n) => (
          <button key={n.to} disabled={busy} onClick={() => move(n.to)}
            className="rounded-md border border-espresso/25 px-2.5 py-1 text-xs disabled:opacity-50">
            {n.label}
          </button>
        ))}
        {row.status === "sent_to_producer" && (
          <input value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="tracking code"
            className="rounded-md border border-espresso/20 px-2 py-1 text-xs" />
        )}
        <button disabled={busy} onClick={() => move("problem")}
          className="ml-auto rounded-md border border-red-300 px-2.5 py-1 text-xs text-red-800 disabled:opacity-50">
          Problem
        </button>
      </div>
    </div>
  );
}
