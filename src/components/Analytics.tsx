"use client";
import { useState } from "react";

export function SnapshotButton() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  return (
    <span className="inline-flex items-center gap-2">
      <button disabled={busy}
        className="rounded-lg bg-espresso px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        onClick={async () => {
          setBusy(true);
          const res = await fetch("/api/cron/stats", { method: "POST" });
          const j = await res.json().catch(() => ({}));
          setBusy(false);
          setMsg(res.ok ? `✓ ${JSON.stringify(j.shops ?? j)}` : j.error ?? "hata");
          if (res.ok) location.reload();
        }}>
        {busy ? "Çekiliyor…" : "Şimdi güncelle"}
      </button>
      {msg && <span className="text-xs text-muted">{msg}</span>}
    </span>
  );
}
