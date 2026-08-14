"use client";
/**
 * Rate designs. Built for speed and for a phone, because five people rating a few hundred designs only
 * happens if each judgement costs a second — a form with a submit button would not get finished.
 *
 * One design at a time, on the garment colour it would ship on, with the keyboard bound to the two
 * answers that matter. No title, no price, no slug the rater could look up: the point is a reaction to
 * the artwork, and anything else on screen is a thumb on the scale.
 */
import { useCallback, useEffect, useState } from "react";

type Card = { id: number; slug: string; rated: number; total: number; done?: boolean };

const SHIRTS: { name: string; css: string }[] = [
  { name: "Pepper", css: "#3c3c3e" },
  { name: "Ivory", css: "#efe8d8" },
  { name: "Moss", css: "#6b7250" },
];

export default function RatePage() {
  const [token, setToken] = useState("");
  const [rater, setRater] = useState("");
  const [card, setCard] = useState<Card | null>(null);
  const [shirt, setShirt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    const u = new URL(window.location.href);
    setToken(u.searchParams.get("t") ?? "");
    setRater(localStorage.getItem("klozio_rater") ?? "");
  }, []);

  const load = useCallback(async (t: string, who: string) => {
    if (!t || !who) return;
    setErr("");
    const r = await fetch(`/api/rate/next?t=${encodeURIComponent(t)}&rater=${encodeURIComponent(who)}`);
    if (!r.ok) { setErr(r.status === 403 ? "Bağlantı geçersiz." : "Bir şey ters gitti."); return; }
    setCard(await r.json());
  }, []);

  useEffect(() => { if (token && rater) load(token, rater); }, [token, rater, load]);

  const vote = useCallback(async (verdict: "accepted" | "rejected") => {
    if (!card || card.done || busy) return;
    setBusy(true);
    try {
      const r = await fetch("/api/rate/vote", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ t: token, rater, product_id: card.id, verdict }),
      });
      if (!r.ok) { setErr("Oy kaydedilemedi — tekrar dene."); return; }
      await load(token, rater);
    } finally { setBusy(false); }
  }, [card, busy, token, rater, load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key.toLowerCase() === "d") vote("rejected");
      if (e.key === "ArrowRight" || e.key.toLowerCase() === "l") vote("accepted");
      if (e.key === " ") { e.preventDefault(); setShirt((s) => (s + 1) % SHIRTS.length); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [vote]);

  if (!token) return <Shell><p className="text-neutral-400">Bu sayfaya oylama bağlantısıyla girilir.</p></Shell>;

  if (!rater) {
    return (
      <Shell>
        <h1 className="text-xl font-semibold mb-2">Adın?</h1>
        <p className="text-neutral-400 text-sm mb-4">
          Oyların kimin olduğunu ayırt edebilmek için. Beş kişinin aynı şeye evet demesi bir sinyal;
          tek kişinin demesi bir tercih.
        </p>
        <form onSubmit={(e) => {
          e.preventDefault();
          const v = (new FormData(e.currentTarget).get("n") as string || "").trim();
          if (v) { localStorage.setItem("klozio_rater", v); setRater(v); }
        }}>
          <input name="n" autoFocus placeholder="Adın"
                 className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 mb-3" />
          <button className="w-full rounded-lg bg-white text-black font-medium py-2">Başla</button>
        </form>
      </Shell>
    );
  }

  if (err) return <Shell><p className="text-red-400">{err}</p></Shell>;
  if (!card) return <Shell><p className="text-neutral-400">Yükleniyor…</p></Shell>;

  if (card.done) {
    return (
      <Shell>
        <h1 className="text-xl font-semibold mb-1">Bitti 🎉</h1>
        <p className="text-neutral-400">{card.rated} tasarım oyladın. Teşekkürler.</p>
      </Shell>
    );
  }

  const s = SHIRTS[shirt];
  return (
    <Shell>
      <div className="flex items-center justify-between text-xs text-neutral-400 mb-3">
        <span>{card.rated} / {card.total}</span>
        <button onClick={() => setShirt((x) => (x + 1) % SHIRTS.length)}
                className="rounded-full border border-neutral-700 px-3 py-1">
          {s.name} · değiştir
        </button>
      </div>

      <div className="rounded-2xl overflow-hidden mb-4 flex items-center justify-center aspect-square"
           style={{ background: s.css }}>
        {/* key forces a fresh <img> per design so the previous one never lingers under a slow load */}
        <img key={card.id} src={`/api/rate/image/${card.id}?t=${encodeURIComponent(token)}`}
             alt="" className="max-h-full max-w-full object-contain p-6" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => vote("rejected")} disabled={busy}
                className="rounded-xl border border-neutral-700 py-4 text-lg disabled:opacity-40">
          👎 Beğenmedim
        </button>
        <button onClick={() => vote("accepted")} disabled={busy}
                className="rounded-xl bg-white text-black font-medium py-4 text-lg disabled:opacity-40">
          👍 Beğendim
        </button>
      </div>
      <p className="text-center text-xs text-neutral-500 mt-3">
        ← beğenmedim · → beğendim · boşluk: gömlek rengi
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}
