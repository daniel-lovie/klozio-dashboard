/**
 * The design itself, small enough to rate quickly.
 *
 * The print file is a transparent PNG of several megabytes; sending that for every card would make the
 * queue unusable on a phone, which is where four of the five raters will be. It is resized here and the
 * transparency is kept, so the page can put it on a garment colour rather than baking one in — the
 * rater should be judging the design, not our choice of shirt.
 */
import { one } from "@/lib/db";
import { checkRateToken } from "@/lib/rate-token";
import sharp from "sharp";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const url = new URL(req.url);
  if (!checkRateToken(url.searchParams.get("t"))) return new Response("forbidden", { status: 403 });
  const { id } = await ctx.params;
  const row = await one<{ print_file: Buffer }>(
    `SELECT print_file FROM products WHERE id=$1 AND print_file IS NOT NULL`, [Number(id)]);
  if (!row) return new Response("not found", { status: 404 });
  const png = await sharp(row.print_file)
    .resize({ width: 900, height: 900, fit: "inside", withoutEnlargement: true })
    .png({ compressionLevel: 8 }).toBuffer();
  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=86400" },
  });
}
