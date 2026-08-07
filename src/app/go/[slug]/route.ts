/** Tracked outbound redirect: /go/mama -> the Etsy listing, logging every real hit.
 *
 *  Why this exists: Etsy can't host a Pixel and its listing-stats API lags by a day or more, so
 *  neither side tells us today how many people actually reached the listing. Meta's
 *  inline_link_clicks counts taps that never finish loading; a hit here means the browser really
 *  followed through. The gap between the two is our accidental-tap rate. */
import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { createHash } from "crypto";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug: raw } = await ctx.params;
  const url = new URL(req.url);

  // Trailing punctuation gets pasted in with the URL more often than not — all four ads in the first
  // TTRPG batch went live pointing at "/go/crest-emb," because a comma came along from the copy.
  // A 404 there means every paid click is wasted, so tolerate it rather than being strict.
  const slug = decodeURIComponent(raw).trim().replace(/[),.;:'"]+$/, "");

  const dest = await q<{ target_url: string }>(
    `SELECT target_url FROM short_links WHERE slug = $1`, [slug],
  );
  if (!dest[0]) return NextResponse.json({ error: "unknown link", slug }, { status: 404 });

  // Carry any campaign params the ad platform appended onto the Etsy URL.
  const target = new URL(dest[0].target_url);
  for (const [k, v] of url.searchParams) if (!target.searchParams.has(k)) target.searchParams.set(k, v);

  const h = req.headers;
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim();
  // Hashed, not stored raw: we only need to tell visitors apart, never to identify them.
  const ipHash = ip ? createHash("sha256").update(ip).digest("hex").slice(0, 16) : null;

  try {
    await q(
      `INSERT INTO short_links_clicks (slug, ip_hash, user_agent, referrer, query)
       VALUES ($1, $2, $3, $4, $5)`,
      [slug, ipHash, (h.get("user-agent") ?? "").slice(0, 400),
       (h.get("referer") ?? "").slice(0, 300), url.search.slice(0, 300)],
    );
  } catch {
    // Never let logging cost us a customer — redirect regardless.
  }
  return NextResponse.redirect(target.toString(), 302);
}
