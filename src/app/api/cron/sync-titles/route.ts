import { NextResponse } from "next/server";
import { isLoggedIn } from "@/lib/auth";
import { q } from "@/lib/db";
import { runWithShop } from "@/lib/shop-context";
import { getListing, updateListingFields } from "@/lib/etsy";

/** Push locally-corrected titles onto the live listings that carry the old ones.
 *
 * 300 titles were refitted to the 80-95 band in the database and 85 of those rows are live, so until this
 * runs the buyer still sees the old 126-character title. It lives in the app rather than in a script
 * because Etsy authentication — token refresh, per-shop credentials — is here, and a second copy of that
 * is exactly the kind of duplication that publishes to the wrong shop.
 *
 * Safe to re-run. Etsy is asked what each title is now and a listing that already matches is skipped
 * rather than PATCHed, and every write is read back: Etsy returns 200 and can still store something else,
 * so trusting the status code is how a listing ends up silently unchanged.
 *
 * Defaults to a dry run. Pass apply=1 to write.
 */
async function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") || "";
  if (secret && header === `Bearer ${secret}`) return true;
  return isLoggedIn();
}

type Row = { id: number; slug: string; title: string; etsy_listing_id: string; shop_id: number };

export async function POST(req: Request) {
  if (!(await authorized(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const apply = url.searchParams.get("apply") === "1";
  const limit = Math.min(Number(url.searchParams.get("limit") || 0) || 500, 500);

  const rows = await q<Row>(
    `SELECT id, slug, title, etsy_listing_id, coalesce(shop_id, 1) AS shop_id
       FROM products
      WHERE etsy_listing_id IS NOT NULL AND title IS NOT NULL
      ORDER BY id LIMIT $1`, [limit]);

  let same = 0, sent = 0, pending = 0;
  const problems: string[] = [];
  const changed: string[] = [];

  for (const r of rows) {
    const listingId = Number(r.etsy_listing_id);
    try {
      await runWithShop(Number(r.shop_id), async () => {
        const live: any = await getListing(listingId);
        if (String(live?.title ?? "") === r.title) { same++; return; }
        if (!apply) { pending++; changed.push(r.slug); return; }

        await updateListingFields(listingId, { title: r.title });
        const after: any = await getListing(listingId);
        const stored = String(after?.title ?? "");
        if (stored !== r.title) {
          // Say HOW it differs. Etsy normalises titles — it collapses punctuation and rejects some
          // characters outright — and "different" without the stored value leaves nothing to act on.
          problems.push(`${r.slug}: Etsy sakladi -> ${stored}`);
          return;
        }
        sent++;
        changed.push(r.slug);
      });
    } catch (e: any) {
      problems.push(`${r.slug}: ${String(e?.message ?? e).slice(0, 140)}`);
    }
    // Etsy rate-limits per second and this work is not urgent.
    await new Promise((res) => setTimeout(res, 300));
  }

  return NextResponse.json({
    checked: rows.length, same, sent, pending, failed: problems.length,
    problems: problems.slice(0, 20), changed: changed.slice(0, 40), applied: apply,
  });
}
export const GET = POST;
export const maxDuration = 800;
