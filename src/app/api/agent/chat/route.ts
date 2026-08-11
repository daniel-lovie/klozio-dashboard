/** Web agent chat: POST {message} -> SSE stream of agent events. DELETE resets the thread. */
import { isLoggedIn } from "@/lib/auth";
import { q } from "@/lib/db";
import { runAgentTurn } from "@/lib/agent/loop";
import { currentShopId, getShop } from "@/lib/shops";

// A turn that researches and then writes several product concepts runs well past five minutes; the
// old ceiling cut it off mid-answer.
export const maxDuration = 800;

export async function POST(req: Request) {
  if (!(await isLoggedIn())) return new Response("unauthorized", { status: 401 });
  const { message } = await req.json().catch(() => ({ message: "" }));
  if (!message?.trim()) return new Response("empty", { status: 400 });

  const shopId = await currentShopId();
  const shop = await getShop(shopId);
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // Heartbeat. While a tool runs — a slow SQL query over the managed database, a Printful call —
      // no bytes flow to the browser, and an idle connection is exactly what a proxy closes. A comment
      // line every fifteen seconds keeps it open and is ignored by the EventSource parser.
      let alive = true;
      const beat = setInterval(() => {
        if (!alive) return;
        try { controller.enqueue(enc.encode(": ping\n\n")); } catch { alive = false; }
      }, 15000);
      try {
        for await (const ev of runAgentTurn(String(message), shopId, shop?.name ?? "Klozio", shop?.creds?.anthropic_api_key)) {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(ev)}\n\n`));
        }
      } catch (e: any) {
        controller.enqueue(enc.encode(`data: ${JSON.stringify({ t: "error", d: String(e?.message ?? e) })}\n\n`));
      } finally {
        alive = false;
        clearInterval(beat);
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive",
      // Without this an intermediate proxy may buffer the whole response and the operator sees nothing
      // until the turn ends, which is indistinguishable from a hang.
      "X-Accel-Buffering": "no",
    },
  });
}

export async function DELETE() {
  if (!(await isLoggedIn())) return new Response("unauthorized", { status: 401 });
  const sid = await currentShopId();
  await q(`UPDATE agent_chats SET messages='[]', updated_at=now() WHERE shop_id=$1`, [sid]);
  return Response.json({ ok: true });
}

export async function GET() {
  if (!(await isLoggedIn())) return new Response("unauthorized", { status: 401 });
  const sid = await currentShopId();
  const rows = await q<any>(`SELECT messages FROM agent_chats WHERE shop_id=$1 ORDER BY id LIMIT 1`, [sid]);
  const msgs = (rows[0]?.messages ?? [])
    .filter((m: any) => typeof m.content === "string" || (Array.isArray(m.content) && m.content.some((b: any) => b.type === "text")))
    .map((m: any) => ({
      role: m.role,
      // Strip the injected shop banner. It is context for the model, not something the operator wrote,
      // and echoing it back rendered every request twice — once with the banner, once without.
      text: (typeof m.content === "string" ? m.content
        : m.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join(""))
        .replace(/^\[Aktif mağaza:[^\]]*\]\n?/, ""),
    }))
    .filter((m: any) => m.text?.trim());
  return Response.json({ messages: msgs });
}
