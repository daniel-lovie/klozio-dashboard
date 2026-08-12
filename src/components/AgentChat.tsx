"use client";
import { useEffect, useRef, useState } from "react";
import { JobBar } from "./JobBar";
import { ApprovalCard } from "./ApprovalCard";

type Ask = { question: string; options: string[]; multi?: boolean; allow_other?: boolean };
type Msg = { role: "user" | "assistant"; text: string; tools?: string[]; images?: number;
             previews?: string[]; ask?: Ask };
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
  const [drawer, setDrawer] = useState(false);
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

  /** Send a specific text — an option chip, or a decision from the approval card — through the same path
   *  as the keyboard, so all three behave identically. */
  const sendText = (text: string) => send(text);

  async function send(override?: string) {
    const text = (override ?? input).trim();
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
          else if (ev.t === "ask") last.ask = ev.d;
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

  async function removeSession(id: number) {
    if (!confirm("Bu sohbet tamamen silinsin mi?")) return;
    await fetch(`/api/agent/sessions?id=${id}`, { method: "DELETE" });
    await loadSessions();
    // Only reload the transcript when the open session is the one that went; deleting an old thread from
    // the list should not throw away what is on screen.
    if (id === chatId) { setChatId(null); await loadHistory(); }
  }

  const when = (iso: string) => {
    const d = new Date(iso), now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    return sameDay
      ? d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
  };

  /** The session list. Rendered twice — as a fixed column on a desktop and as a drawer on a phone — from
   *  one function, because a list that exists in two copies gets fixed in one of them. */
  const sessionList = (
    <div className="flex h-full flex-col">
      <button onClick={() => { newSession(); setDrawer(false); }}
        className="mb-2 flex items-center gap-2 rounded-lg border border-espresso/20 px-3 py-2 text-sm font-medium hover:bg-white">
        <span className="text-base leading-none">＋</span> Yeni sohbet
      </button>
      <div className="mb-1 px-1 text-[11px] font-medium uppercase tracking-wide text-muted">Sohbetler</div>
      <div className="flex-1 space-y-0.5 overflow-y-auto">
        {sessions.length === 0 && <p className="px-1 text-xs text-muted">henüz sohbet yok</p>}
        {sessions.map((s) => (
          <div key={s.id}
            className={`group flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm ${
              s.id === chatId ? "bg-espresso text-white" : "hover:bg-espresso/10"}`}>
            <button
              onClick={() => { setChatId(s.id); loadHistory(s.id); setDrawer(false); }}
              className="min-w-0 flex-1 truncate text-left">
              {s.title || "(başlıksız)"}
              <span className={`ml-1 text-[11px] ${s.id === chatId ? "text-white/60" : "text-muted"}`}>
                {when(s.updated_at)}
              </span>
            </button>
            <button
              onClick={() => removeSession(s.id)}
              title="sohbeti sil"
              className={`shrink-0 rounded px-1 text-xs opacity-0 group-hover:opacity-100 ${
                s.id === chatId ? "text-white/70" : "text-muted"}`}>
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex h-[calc(100vh-170px)] gap-4 sm:h-[calc(100vh-150px)]">
      <aside className="hidden w-56 shrink-0 border-r border-espresso/10 pr-3 md:block">
        {sessionList}
      </aside>

      {/* Phone: the same list as a drawer. A permanent 224px column would leave the conversation about
          150px wide on a 375px screen. */}
      {drawer && (
        <div className="fixed inset-0 z-50 flex md:hidden" onClick={() => setDrawer(false)}>
          <div className="h-full w-64 bg-ivory p-3 shadow-xl" onClick={(e) => e.stopPropagation()}>
            {sessionList}
          </div>
          <div className="flex-1 bg-espresso/20" />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
      <div className="mb-2 flex items-center gap-2">
        <button onClick={() => setDrawer(true)}
          className="rounded-md border border-espresso/25 px-2.5 py-1 text-xs md:hidden">☰ sohbetler</button>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {sessions.find((s) => s.id === chatId)?.title || "Yeni sohbet"}
        </span>
        <button onClick={clearSession} className="rounded-md border border-espresso/25 px-2.5 py-1 text-xs">temizle</button>
      </div>

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
              {m.ask && (
                <div className="mt-2 border-t border-espresso/10 pt-2">
                  <div className="mb-1.5 text-[13px] font-medium">{m.ask.question}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {m.ask.options.map((o) => (
                      <button key={o} disabled={busy} onClick={() => sendText(o)}
                        className="rounded-full border border-espresso/25 bg-white/70 px-3 py-1 text-xs hover:bg-white disabled:opacity-50">
                        {o}
                      </button>
                    ))}
                  </div>
                  {m.ask.allow_other !== false && (
                    <p className="mt-1.5 text-[11px] text-muted">ya da kendi cevabını yaz</p>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>

      {/* Production progress sits directly above the composer: it belongs next to the conversation that
          starts it, and at the BOTTOM because that is where the eye already is — pinned above the
          transcript it scrolled out of view the moment the answer grew. Renders nothing when idle. */}
      <div className="mt-2">
        {/* Approval first: it is a decision waiting on the operator, progress is only information. */}
        <ApprovalCard onDecision={(m) => sendText(m)} />
        <JobBar />
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
        <button onClick={() => send()} disabled={busy}
          className="rounded-xl bg-espresso px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {busy ? "…" : "Gönder"}
        </button>
      </div>
      </div>
    </div>
  );
}
