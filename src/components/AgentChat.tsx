"use client";
import { useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; text: string; tools?: string[] };

export default function AgentChat() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/agent/chat").then((r) => r.json()).then((j) => setMsgs(j.messages ?? [])).catch(() => {});
  }, []);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput(""); setBusy(true);
    setMsgs((m) => [...m, { role: "user", text }, { role: "assistant", text: "", tools: [] }]);

    const res = await fetch("/api/agent/chat", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text }),
    });
    if (!res.ok || !res.body) {
      setMsgs((m) => { const c = [...m]; c[c.length - 1] = { role: "assistant", text: `Hata: ${res.status} — Anthropic kredisi/anahtar eksik olabilir.` }; return c; });
      setBusy(false); return;
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        if (!line.startsWith("data: ")) continue;
        let ev: any; try { ev = JSON.parse(line.slice(6)); } catch { continue; }
        setMsgs((m) => {
          const c = [...m]; const last = { ...c[c.length - 1] };
          if (ev.t === "text") last.text += ev.d;
          else if (ev.t === "tool") last.tools = [...(last.tools ?? []), ev.d];
          else if (ev.t === "error") last.text += `\n\n⚠️ ${ev.d}`;
          c[c.length - 1] = last; return c;
        });
      }
    }
    setBusy(false);
  }

  async function reset() {
    if (!confirm("Konuşma geçmişi silinsin mi?")) return;
    await fetch("/api/agent/chat", { method: "DELETE" });
    setMsgs([]);
  }

  return (
    <div className="flex h-[calc(100vh-140px)] flex-col">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-muted">
          Tam yetkili operasyon agent&apos;ı — fikir üretimi, onay, redo, schedule, sipariş, fiyat: hepsi buradan.
        </p>
        <button onClick={reset} className="rounded-md border border-espresso/25 px-2.5 py-1 text-xs">Temizle</button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto rounded-xl border border-espresso/15 bg-white/60 p-4">
        {msgs.length === 0 && (
          <div className="text-sm text-muted">
            <p className="mb-2 font-medium">Örnekler:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>&quot;pet nişi için 5 konsept üret, draft bırak&quot;</li>
              <li>&quot;üretim kuyruğunda ne var, hangi ürünler ready?&quot;</li>
              <li>&quot;emb-c6&apos;yı redo yap: make the design 20% smaller&quot;</li>
              <li>&quot;bekleyen siparişleri özetle, Printful draft&apos;ları kontrol et&quot;</li>
              <li>&quot;yarın 10:00 CT&apos;ye şu ürünleri schedule&apos;la ve onayla&quot;</li>
            </ul>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm whitespace-pre-wrap ${
              m.role === "user" ? "bg-espresso text-white" : "bg-amber-50 border border-espresso/10"}`}>
              {(m.tools ?? []).length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1">
                  {m.tools!.map((t, j) => (
                    <span key={j} className="rounded bg-espresso/10 px-1.5 py-0.5 font-mono text-[10px]">{t}</span>
                  ))}
                </div>
              )}
              {m.text || (busy && i === msgs.length - 1 ? "…" : "")}
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>

      <div className="mt-3 flex gap-2">
        <textarea
          value={input} onChange={(e) => setInput(e.target.value)} rows={2}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Agent'a yaz… (Enter = gönder, Shift+Enter = yeni satır)"
          className="flex-1 rounded-xl border border-espresso/20 bg-white/80 px-3 py-2 text-sm"
        />
        <button onClick={send} disabled={busy}
          className="rounded-xl bg-espresso px-4 text-sm font-medium text-white disabled:opacity-50">
          {busy ? "Çalışıyor…" : "Gönder"}
        </button>
      </div>
    </div>
  );
}
