/** Chat sessions: list, create, delete. One thread per shop was a database rule, not a decision. */
import { isLoggedIn } from "@/lib/auth";
import { currentShopId, NO_SHOP } from "@/lib/shops";
import { listSessions, createSession, deleteSession } from "@/lib/agent/sessions";

async function shop() {
  const id = await currentShopId();
  if (!id || id === NO_SHOP) throw new Error("aktif mağaza çözülemedi");
  return id;
}

export async function GET() {
  if (!(await isLoggedIn())) return new Response("unauthorized", { status: 401 });
  try {
    return Response.json({ sessions: await listSessions(await shop()) });
  } catch (e: any) {
    return Response.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}

export async function POST() {
  if (!(await isLoggedIn())) return new Response("unauthorized", { status: 401 });
  try {
    return Response.json({ id: await createSession(await shop()) });
  } catch (e: any) {
    return Response.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  if (!(await isLoggedIn())) return new Response("unauthorized", { status: 401 });
  try {
    const id = Number(new URL(req.url).searchParams.get("id"));
    if (!id) return Response.json({ error: "id gerekli" }, { status: 400 });
    // Scoped by shop inside the query: the id comes from the browser, so ownership is checked in SQL
    // rather than assumed from the fact that the caller is signed in.
    await deleteSession(await shop(), id);
    return Response.json({ ok: true });
  } catch (e: any) {
    return Response.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
