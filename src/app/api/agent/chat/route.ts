/** Web agent chat: POST {message} -> SSE stream of agent events. DELETE resets the thread. */
import { isLoggedIn } from "@/lib/auth";
import { q } from "@/lib/db";
import { runAgentTurn } from "@/lib/agent/loop";

export const maxDuration = 300;

export async function POST(req: Request) {
  if (!(await isLoggedIn())) return new Response("unauthorized", { status: 401 });
  const { message } = await req.json().catch(() => ({ message: "" }));
  if (!message?.trim()) return new Response("empty", { status: 400 });

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const ev of runAgentTurn(String(message))) {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(ev)}\n\n`));
        }
      } catch (e: any) {
        controller.enqueue(enc.encode(`data: ${JSON.stringify({ t: "error", d: String(e?.message ?? e) })}\n\n`));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}

export async function DELETE() {
  if (!(await isLoggedIn())) return new Response("unauthorized", { status: 401 });
  await q(`UPDATE agent_chats SET messages='[]', updated_at=now() WHERE id=1`);
  return Response.json({ ok: true });
}

export async function GET() {
  if (!(await isLoggedIn())) return new Response("unauthorized", { status: 401 });
  const rows = await q<any>(`SELECT messages FROM agent_chats WHERE id=1`);
  const msgs = (rows[0]?.messages ?? [])
    .filter((m: any) => typeof m.content === "string" || (Array.isArray(m.content) && m.content.some((b: any) => b.type === "text")))
    .map((m: any) => ({
      role: m.role,
      text: typeof m.content === "string" ? m.content
        : m.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join(""),
    }))
    .filter((m: any) => m.text?.trim());
  return Response.json({ messages: msgs });
}
