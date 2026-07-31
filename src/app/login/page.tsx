"use client";
import { useState } from "react";

export default function Login() {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    const res = await fetch("/api/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw }),
    });
    setBusy(false);
    if (res.ok) location.href = "/";
    else setErr((await res.json().catch(() => ({}))).error || "Login failed");
  }

  return (
    <main className="grid min-h-screen place-items-center px-6">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-espresso/15 bg-white/70 p-8 shadow-sm">
        <div className="mb-1 text-2xl font-semibold tracking-tight">Klozio</div>
        <p className="mb-6 text-sm text-muted">Publishing dashboard</p>
        <input
          type="password" value={pw} onChange={(e) => setPw(e.target.value)}
          placeholder="Password" autoFocus
          className="mb-3 w-full rounded-lg border border-espresso/20 bg-white px-3 py-2 outline-none focus:border-amber"
        />
        {err && <p className="mb-3 text-sm text-red-700">{err}</p>}
        <button disabled={busy}
          className="w-full rounded-lg bg-espresso py-2 font-medium text-ivory disabled:opacity-50">
          {busy ? "Checking…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
