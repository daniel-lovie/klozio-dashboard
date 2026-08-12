"use client";
import { useEffect, useRef, useState } from "react";
import { JobBar } from "./JobBar";

type Msg = { role: "user" | "assistant"; text: string; tools?: string[]; images?: number; previews?: string[] };
type Session = { id: number; title: string | null; updated_at: string; messages_n: number };
type Attachment = { id: string; name: string; dataUrl: string };

const MAX_ATTACH = 4;

/** A reference image is the fastest way to say what "good" means, so the composer takes files, a paste
 *  from the clipboard and a drop — whichever the operator reaches for first. */
export default function AgentChat() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [chatId, setChatId] = useState<number | null>(null);
  const [attach, setAttach] = useState<Attachment[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function loadSessions() {
    const j = await fetch("/api/agent/sessions").then((r) => r.json()).catch(() => null);
    if (j?.sessions) setSessions(j.sessions);
  }

  async function loadHistory(id?: number | null) {
    const url = id ? `/api/agent/chat?chatId=${id}` : "/api/agent/chat";
    const j = await fetch(url).then((r) => r.json()).catch(() => null);
    if (!j) return;
    setMsgs(j.messages ?? []);
    if (j.chatId) setChatId(j.chatId);
  }

  useEffect(() => { loadSessions(); loadHistory(); }, []);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  function addFiles(files: FileList | File[]) {
    const imgs = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!imgs.length) return;
    setNote(null);
    for (const f of imgs.slice(0, MAX_ATTACH)) {
      const reader = new FileReader();
      reader.onload = () => setAttach((a) => {
        if (a.length >= MAX_ATTACH) { setNote(`en fazla ${MAX_ATTACH} görsel`); return a; }
        return [...a, { id: `${Date.now()}-${f.name}`, name: f.name, dataUrl: String(reader.result) }];
      });
      reader.readAsDataURL(f);
    }
  }

  async function send() {
    const text = input.trim();
    if ((!text && attach.length === 0) || busy) return;
    const sending = attach;
    setInput(""); setAttach([]); setBusy(true); setNote(null);
    setMsgs((m) => [
      ...m,
      { role: "user", text, images: sending.length, previews: sending.map((a) => a.dataUrl) },
      { role: "assistant", text: "", tools: [] },
    ]);

    const res = await fetch("/api/agent/chat", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text, chatId,
        images: sending.map((a) => ({ data: a.dataUrl })),
      }),
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
    loadSessions();                       // the title is set from the first message; refresh the list
  }

  async function newSession() {
    const j = await fetch("/api/agent/sessions", { method: "POST" }).then((r) => r.json()).catch(() => null);
    if (!j?.id) { setNote("yeni sohbet açılamadı"); return; }
    setChatId(j.id); setMsgs([]); setAttach([]);
    loadSessions();
  }

  async function clearSession() {
    if (!confirm("Bu sohbetin geçmişi silinsin mi? Diğer sohbetler etkilenmez.")) return;
    await fetch(`/api/agent/chat?chatId=${chatId ?? ""}`, { method: "DELETE" });
    setMsgs([]); loadSessions();
  }

  async function deleteSession() {
    if (!chatId) return;
    if (!confirm("Bu sohbet tamamen silinsin mi?")) return;
    await fetch(`/api/agent/sessions?id=${chatId}`, { method: "DELETE" });
    setChatId(null);
    await loadSessions();
    await loadHistory();                  // falls back to the newest remaining session
  }

  const label = (s: Session) =>
    `${s.title || "(başlıksız)"} · ${new Date(s.updated_at).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}`;

  return (
    <div className="flex h-[calc(100vh-190px)] flex-col sm:h-[calc(100vh-160px)]">
      {/* Session bar. A select rather than a sidebar: it is the one control that works the same on a
          phone and on a desktop, and this screen is used on both. */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <select
          value={chatId ?? ""}
          onChange={(e) => { const id = Number(e.target.value); setChatId(id); loadHistory(id); }}
          className="min-w-0 max-w-[60vw] flex-1 truncate rounded-md border border-espresso/20 bg-white/80 px-2 py-1 text-sm sm:max-w-xs">
          {sessions.length === 0 && <option value="">sohbet yok</option>}
          {sessions.map((s) => <option key={s.id} value={s.id}>{label(s)}</option>)}
        </select>
        <button onClick={newSession} className="rounded-md border border-espresso/25 px-2.5 py-1 text-xs">+ yeni</button>
        <button onClick={clearSession} className="rounded-md border border-espresso/25 px-2.5 py-1 text-xs">temizle</button>
        <button onClick={deleteSession} className="rounded-md border border-espresso/25 px-2.5 py-1 text-xs text-muted">sil</button>
      </div>

      {/* Production progress lives HERE, next to the conversation that starts it — it used to sit up by
          the nav, far from the screen the operator is actually watching while a design builds. */}
      <JobBar />

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
        className="flex-1 space-y-3 overflow-y-auto rounded-xl border border-espresso/15 bg-white/60 p-3 sm:p-4">
        {msgs.length === 0 && (
          <div className="text-sm text-muted">
            <p className="mb-2 font-medium">Örnekler:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>&quot;pet nişi için 5 konsept üret, draft bırak&quot;</li>
              <li>Bir görsel ekle + &quot;bunun gibi bir tasarım yap ama gravür stilinde ve yazı altta olsun&quot;</li>
              <li>&quot;emb-c6&apos;yı redo yap: make the design 20% smaller&quot;</li>
              <li>&quot;şu ürünün fiyatını 24.99 yap&quot; · &quot;başlığını şöyle değiştir&quot;</li>
            </ul>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div className={`max-w-[90%] whitespace-pre-wrap rounded-xl px-3 py-2.5 text-sm sm:max-w-[85%] sm:px-3.5 ${
              m.role === "user" ? "bg-espresso text-white" : "border border-espresso/10 bg-amber-50"}`}>
              {(m.tools ?? []).length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1">
                  {m.tools!.map((t, j) => (
                    <span key={j} className="rounded bg-espresso/10 px-1.5 py-0.5 font-mono text-[10px]">{t}</span>
                  ))}
                </div>
              )}
              {m.previews?.length ? (
                <div className="mb-2 flex flex-wrap gap-1">
                  {m.previews.map((src, j) => (
                    <img key={j} src={src} alt="" className="h-16 w-16 rounded object-cover" />
                  ))}
                </div>
              ) : m.images ? (
                // History does not carry the bytes back, so past turns show a count rather than a
                // thumbnail — better than pretending the image is gone.
                <div className="mb-1 text-[11px] opacity-70">🖼 {m.images} görsel</div>
              ) : null}
              {m.text || (busy && i === msgs.length - 1 ? "…" : "")}
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>

      {attach.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {attach.map((a) => (
            <div key={a.id} className="relative">
              <img src={a.dataUrl} alt={a.name} className="h-14 w-14 rounded border border-espresso/20 object-cover" />
              <button
                onClick={() => setAttach((x) => x.filter((y) => y.id !== a.id))}
                className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-espresso text-[10px] text-white">
                ✕
              </button>
            </div>
          ))}
          <span className="text-xs text-muted">{attach.length}/{MAX_ATTACH}</span>
        </div>
      )}
      {note && <p className="mt-1 text-xs text-red-800">{note}</p>}

      <div className="mt-2 flex items-end gap-2">
        <input ref={fileInput} type="file" accept="image/*" multiple hidden
               onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
        <button onClick={() => fileInput.current?.click()} title="Görsel ekle"
                className="rounded-xl border border-espresso/25 px-3 py-2 text-sm">📎</button>
        <textarea
          value={input} onChange={(e) => setInput(e.target.value)} rows={2}
          onPaste={(e) => {
            const files = Array.from(e.clipboardData.files);
            if (files.length) { e.preventDefault(); addFiles(files); }
          }}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Agent'a yaz… görsel yapıştırabilir veya sürükleyebilirsin"
          className="min-w-0 flex-1 rounded-xl border border-espresso/20 bg-white/80 px-3 py-2 text-sm"
        />
        <button onClick={send} disabled={busy}
          className="rounded-xl bg-espresso px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {busy ? "…" : "Gönder"}
        </button>
      </div>
    </div>
  );
}
