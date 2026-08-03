/** Public (HMAC-signed) design file endpoint — Printful fetches embroidery PNGs from here.
 *  No session auth: Printful's servers are the caller. The signature is keyed off
 *  PRINTFUL_API_KEY server-side, so the URL can't be forged without the key. */
import { NextResponse } from "next/server";
import crypto from "crypto";
import { one } from "@/lib/db";
import { pfFileSig } from "@/lib/printful-fulfill";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sig = new URL(req.url).searchParams.get("sig") ?? "";
  const want = pfFileSig(Number(id));
  const ok = sig.length === want.length &&
    crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want));
  if (!ok) return NextResponse.json({ error: "bad signature" }, { status: 403 });

  const row = await one<{ print_file: Buffer; print_file_name: string | null }>(
    `SELECT print_file, print_file_name FROM products WHERE id=$1 AND print_file IS NOT NULL`,
    [Number(id)]);
  if (!row) return NextResponse.json({ error: "no file" }, { status: 404 });

  return new NextResponse(new Uint8Array(row.print_file), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `inline; filename="${row.print_file_name ?? `design-${id}.png`}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
