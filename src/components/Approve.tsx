"use client";
import { useState } from "react";
import { TZ_LABEL, SHOP_TZ } from "@/lib/fmt";

/** <input type="datetime-local"> is timezone-naive, so convert both ways through SHOP_TZ
 *  or the label lies about what the user is picking. */
function toLocalInput(iso: string) {
  const p: Record<string,string> = {};
  for (const part of new Intl.DateTimeFormat("en-CA", { timeZone: SHOP_TZ, year:"numeric", month:"2-digit",
      day:"2-digit", hour:"2-digit", minute:"2-digit", hour12:false }).formatToParts(new Date(iso)))
    if (part.type !== "literal") p[part.type] = part.value;
  return `${p.year}-${p.month}-${p.day}T${p.hour === "24" ? "00" : p.hour}:${p.minute}`;
}

/** Interpret a naive "YYYY-MM-DDTHH:mm" as a wall-clock time in SHOP_TZ and return a real instant. */
function fromLocalInput(v: string): string {
  const guess = new Date(`${v}:00Z`);
  const shown = new Date(new Date(guess).toLocaleString("en-US", { timeZone: SHOP_TZ }));
  const utcRef = new Date(new Date(guess).toLocaleString("en-US", { timeZone: "UTC" }));
  const offset = shown.getTime() - utcRef.getTime();
  return new Date(guess.getTime() - offset).toISOString();
}

export default function Approve({
  scheduleId, status, scheduledAt, lastError,
}: { scheduleId: number; status: string; scheduledAt: string; lastError: string | null }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [when, setWhen] = useState(() => toLocalInput(scheduledAt));

  async function call(url: string, method: string, body?: unknown) {
    setBusy(true); setMsg(null);
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg(j.error || "Failed"); return false; }
    location.reload();
    return true;
  }

  const published = status === "published";

  return (
    <div className="rounded-xl border border-espresso/15 bg-white/60 p-4">
      {lastError && (
        <div className="mb-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          <span className="font-medium">Last error: </span>{lastError}
        </div>
      )}

      {published ? (
        <p className="text-sm">
          Published. The scheduler will not touch this again.
        </p>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          {status === "pending" && (
            <button disabled={busy} onClick={() => call(`/api/schedule/${scheduleId}/approve`, "POST")}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              Approve for launch
            </button>
          )}
          {status === "approved" && (
            <>
              <span className="rounded-lg bg-emerald-100 px-3 py-2 text-sm text-emerald-900">
                Approved — publishes automatically at the scheduled time
              </span>
              <button disabled={busy} onClick={() => call(`/api/schedule/${scheduleId}/approve`, "DELETE")}
                className="rounded-lg border border-espresso/25 px-3 py-2 text-sm disabled:opacity-50">
                Un-approve
              </button>
            </>
          )}
          {status === "failed" && (
            <button disabled={busy} onClick={() => call(`/api/schedule/${scheduleId}/approve`, "POST")}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              Re-approve and retry
            </button>
          )}

          <div className="flex items-end gap-2">
            <label className="text-xs text-muted">
              <span className="mb-1 block">Launch date &amp; time ({TZ_LABEL})</span>
              <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)}
                className="rounded-lg border border-espresso/20 bg-white px-2 py-1.5 text-sm" />
            </label>
            <button disabled={busy}
              onClick={() => call(`/api/schedule/${scheduleId}/reschedule`, "POST",
                                  { scheduled_at: fromLocalInput(when) })}
              className="rounded-lg border border-espresso/25 px-3 py-2 text-sm disabled:opacity-50">
              Reschedule
            </button>
          </div>

          <button disabled={busy}
            onClick={() => confirm("Cancel this launch?") &&
              call(`/api/schedule/${scheduleId}/reschedule`, "POST", { cancel: true })}
            className="ml-auto rounded-lg border border-red-300 px-3 py-2 text-sm text-red-800 disabled:opacity-50">
            Cancel launch
          </button>
        </div>
      )}

      {!published && (
        <p className="mt-3 text-xs text-muted">
          Rescheduling resets approval on purpose — you re-confirm the new date. Nothing publishes unless it is
          approved <em>and</em> its time has arrived.
        </p>
      )}
      {msg && <p className="mt-2 text-sm text-red-700">{msg}</p>}
    </div>
  );
}
