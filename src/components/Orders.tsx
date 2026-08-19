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
  cancelled:        [],
};
const PILL: Record<string, string> = {
  new: "bg-amber-100 text-amber-900", generating: "bg-accent-soft text-accent",
  qa: "bg-purple-100 text-purple-900", ready: "bg-ok text-ok",
  sent_to_producer: "bg-teal-100 text-teal-900", shipped: "bg-sunken",
  done: "bg-neutral-100 text-neutral-600", problem: "bg-danger-soft text-danger",
  cancelled: "bg-neutral-200 text-neutral-700",
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
  const [pfMsg, setPfMsg] = useState("");

  async function move(status: string) {
    setBusy(true);
    const res = await fetch(`/api/orders/${row.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, tracking_code: tracking || undefined }),
    });
    setBusy(false);
    if (res.ok) location.reload();
  }

  async function printful(action: "draft" | "confirm") {
    if (action === "confirm" && !confirm("Printful siparişi onaylanacak ve ücret kesilecek. Emin misin?")) return;
    setBusy(true);
    const res = await fetch(`/api/orders/${row.id}/printful-${action}`, { method: "POST" });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) location.reload();
    else setPfMsg(j.error ?? "failed");
  }

  return (
    <div className="rounded-lg border border-line bg-raised p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${PILL[row.status]}`}>{row.status}</span>
        {row.rush && (
          // The buyer paid for 2nd Day Air. Loud on purpose: this is the only order in the queue with a
          // deadline attached, and it is indistinguishable from the rest without a marker.
          <span className="rounded bg-danger px-2 py-0.5 text-[11px] font-semibold text-white"
            title="Alici 'Rush service + UPS shipping' aldi — bugun gonder, etiketi UPS 2nd Day Air olarak al">
            ⚡ RUSH · UPS 2nd Day
          </span>
        )}
        <span className="text-xs text-muted">#{row.id} · {at}</span>
        <span className="rounded bg-sunken px-1.5 py-0.5 text-[11px]">{row.slot ?? "?"} · {row.slug ?? row.etsy_listing_id}</span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{row.title ?? "(unknown listing)"}</span>
        <span className="text-xs">{row.colorway ?? "?"} / {row.size ?? "?"} × {row.quantity}</span>
        {row.is_paid === false && (
          <span className="rounded bg-amber-200 px-2 py-0.5 text-[11px] font-medium text-amber-900"
            title="Etsy ödemeyi onaylayana kadar üretim başlamaz">
            ⏳ {row.etsy_status ?? "ödeme bekliyor"}
          </span>
        )}
      </div>

      {row.interpreted_text && (
        <p className="mt-2 text-sm"><span className="font-semibold">Agent yorumu:</span>{" "}
          <span className="font-mono">{row.interpreted_text}</span>{" "}
          <a className="underline" href={`/api/orders/${row.id}/print`} target="_blank">baskıyı önizle</a>
        </p>
      )}
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
          <p className="mt-1">
            <a className="underline" href={`/api/orders/${row.id}/print`} target="_blank">baskı PNG önizle</a>
            {" · "}
            <a className="underline font-medium" href={`/api/orders/${row.id}/print?download=1`}>PNG indir ⬇</a>
          </p>
        </div>
      </div>

      {row.technique === "embroidery" && (
        <div className="mt-2 rounded-lg bg-teal-50 px-3 py-2 text-sm">
          <span className="font-semibold">Printful:</span>{" "}
          {row.printful_status === "confirmed" ? (
            <span>onaylandı · #{row.printful_order_id} üretimde 🧵</span>
          ) : row.printful_status === "draft" ? (
            <>
              <span>draft hazır · #{row.printful_order_id} (varyant + adres + tasarım yüklü)</span>
              <button disabled={busy} onClick={() => printful("confirm")}
                className="ml-2 rounded bg-teal-700 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50">
                Printful&apos;a Onayla (ücret kesilir)
              </button>
            </>
          ) : (
            <>
              <span className={row.printful_status === "failed" ? "text-danger" : ""}>
                {row.printful_status === "failed" ? `draft başarısız: ${row.printful_error}` : "draft yok"}
              </span>
              <button disabled={busy} onClick={() => printful("draft")}
                className="ml-2 rounded border border-teal-700 px-2.5 py-1 text-xs text-teal-800 disabled:opacity-50">
                Draft oluştur
              </button>
            </>
          )}
          {pfMsg && <span className="ml-2 text-xs text-danger">{pfMsg}</span>}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {(NEXT[row.status] ?? []).map((n) => (
          <button key={n.to} disabled={busy} onClick={() => move(n.to)}
            className="rounded border border-line-strong px-2.5 py-1 text-xs disabled:opacity-50">
            {n.label}
          </button>
        ))}
        {row.status === "sent_to_producer" && (
          <input value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="tracking code"
            className="rounded border border-line px-2 py-1 text-xs" />
        )}
        <button disabled={busy} onClick={() => move("problem")}
          className="ml-auto rounded border border-danger/25 px-2.5 py-1 text-xs text-danger disabled:opacity-50">
          Problem
        </button>
      </div>
    </div>
  );
}
