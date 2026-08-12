/** Web agent chat: POST {message, images?, chatId?} -> SSE stream of agent events.
 *
 *  Images are normalised HERE rather than trusted from the browser: a phone photo is 4000px and several
 *  megabytes, which costs tokens for detail no reader of a t-shirt reference needs, and a client that can
 *  choose the size is a client that can send a 30MB payload.
 */
import { isLoggedIn } from "@/lib/auth";
import { q } from "@/lib/db";
import { runAgentTurn } from "@/lib/agent/loop";
import { currentShopId, getShop } from "@/lib/shops";
import { resolveSession } from "@/lib/agent/sessions";
import sharp from "sharp";

const MAX_IMAGES = 4;
const MAX_INCOMING_BYTES = 12 * 1024 * 1024;
/** Anthropic reads up to ~1568px on the long edge at full fidelity; a reference design needs less. */
const MAX_EDGE = 1024;

async function normalise(list: any[]): Promise<{ mime: string; data: string }[]> {
  const out: { mime: string; data: string }[] = [];
  for (const raw of list.slice(0, MAX_IMAGES)) {
    const b64 = String(raw?.data ?? "").replace(/^data:[^,]+,/, "");
    if (!b64) continue;
    const buf = Buffer.from(b64, "base64");
    if (!buf.length || buf.length > MAX_INCOMING_BYTES) continue;
    const jpeg = await sharp(buf).rotate()                    // honour EXIF orientation, phones need it
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82 }).toBuffer();
    out.push({ mime: "image/jpeg", data: jpeg.toString("base64") });
  }
  return out;
}

// A turn that researches and then writes several product concepts runs well past five minutes; the
// old ceiling cut it off mid-answer.
export const maxDuration = 800;

export async function POST(req: Request) {
  if (!(await isLoggedIn())) return new Response("unauthorized", { status: 401 });
  const body = await req.json().catch(() => ({}));
  const message = String(body?.message ?? "");
  const rawImages = Array.isArray(body?.images) ? body.images : [];
  // An image with no words is still a request ("bunun gibi yap"), so text is only required when nothing
  // is attached.
  if (!message.trim() && !rawImages.length) return new Response("empty", { status: 400 });

  const shopId = await currentShopId();
  const shop = await getShop(shopId);
  const chatId = await resolveSession(shopId, Number(body?.chatId) || null);
  let images: { mime: string; data: string }[] = [];
  try {
    images = await normalise(rawImages);
  } catch {
    return new Response("gorsel okunamadi", { status: 400 });
  }
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
        for await (const ev of runAgentTurn(message, shopId, shop?.name ?? "Klozio",
                                           shop?.creds?.anthropic_api_key, { chatId, images })) {
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

export async function DELETE(req: Request) {
  if (!(await isLoggedIn())) return new Response("unauthorized", { status: 401 });
  const sid = await currentShopId();
  const chatId = await resolveSession(sid, Number(new URL(req.url).searchParams.get("chatId")) || null);
  // Clears THIS session only. Clearing used to hit every row of the shop, so tidying one conversation
  // erased the others.
  await q(`UPDATE agent_chats SET messages='[]', title=NULL, updated_at=now() WHERE id=$1 AND shop_id=$2`,
          [chatId, sid]);
  return Response.json({ ok: true, chatId });
}

export async function GET(req: Request) {
  if (!(await isLoggedIn())) return new Response("unauthorized", { status: 401 });
  const sid = await currentShopId();
  const chatId = await resolveSession(sid, Number(new URL(req.url).searchParams.get("chatId")) || null);
  const rows = await q<any>(`SELECT messages FROM agent_chats WHERE id=$1`, [chatId]);
  const msgs = (rows[0]?.messages ?? [])
    .filter((m: any) => typeof m.content === "string" || (Array.isArray(m.content) && m.content.some((b: any) => b.type === "text")))
    .map((m: any) => ({
      role: m.role,
      // Count attachments instead of shipping the base64 back: the history endpoint runs on every page
      // load and a few reference photos would make it megabytes.
      images: Array.isArray(m.content) ? m.content.filter((b: any) => b.type === "image").length : 0,
      // Strip the injected shop banner. It is context for the model, not something the operator wrote,
      // and echoing it back rendered every request twice — once with the banner, once without.
      text: (typeof m.content === "string" ? m.content
        : m.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join(""))
        .replace(/^\[Aktif mağaza:[^\]]*\]\n?/, ""),
    }))
    .filter((m: any) => m.text?.trim());
  return Response.json({ chatId, messages: msgs });
}
