import { one } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isLoggedIn())) return new Response("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const row = await one<{ bytes: Buffer; mime: string }>(
    `SELECT bytes, mime FROM product_images WHERE id=$1`, [Number(id)]
  );
  if (!row) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(row.bytes), {
    headers: { "Content-Type": row.mime, "Cache-Control": "private, max-age=3600" },
  });
}
