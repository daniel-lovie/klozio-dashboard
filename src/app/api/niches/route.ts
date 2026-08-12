/** Register a niche in this shop's portfolio, or move one between stages.
 *
 * The portfolio page used to answer "how do I choose a niche?" with "add a row to catalog/niches.csv and
 * run npm run db:seed" — a shell instruction on a screen the operator reaches from a phone, for a table
 * that was still empty while the catalogue already carried 47 distinct niches. The decision it describes is
 * real; the way to record it was missing.
 */
import { NextResponse } from "next/server";
import { isLoggedIn } from "@/lib/auth";
import { q, logEvent } from "@/lib/db";
import { currentShopId, NO_SHOP } from "@/lib/shops";

const STAGES = ["candidate", "validating", "scaling", "harvesting", "retired"] as const;
const MAX_SLOTS = Number(process.env.MAX_NICHE_SLOTS || 3);

async function shop() {
  const id = await currentShopId();
  if (!id || id === NO_SHOP) throw new Error("aktif mağaza çözülemedi");
  return id;
}

export async function POST(req: Request) {
  if (!(await isLoggedIn())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const shopId = await shop();
    const b = await req.json().catch(() => ({}));
    const slug = String(b.slug ?? "").trim();
    const family = String(b.family ?? "").trim() || slug;
    const stage = STAGES.includes(b.stage) ? b.stage : "candidate";
    if (!slug) return NextResponse.json({ error: "slug gerekli" }, { status: 400 });

    // The slot budget is the whole point of the portfolio, so it is enforced here and not only described
    // on the page: a limit that lives in prose is a suggestion.
    if (stage === "validating" || stage === "scaling") {
      const busy = await q<{ n: string }>(
        `SELECT count(*)::text AS n FROM niches
          WHERE shop_id=$1 AND stage IN ('validating','scaling') AND slug <> $2`, [shopId, slug]);
      if (Number(busy[0]?.n ?? 0) >= MAX_SLOTS) {
        return NextResponse.json({
          error: `slot dolu (${MAX_SLOTS}/${MAX_SLOTS}) — yeni niş başlatmak için birini scaling'e terfi ettir ya da retired yap`,
        }, { status: 409 });
      }
    }

    await q(
      `INSERT INTO niches (shop_id, slug, family, stage, entered_stage)
            VALUES ($1,$2,$3,$4, CURRENT_DATE)
       ON CONFLICT (shop_id, slug) DO UPDATE
         SET family = EXCLUDED.family,
             stage = EXCLUDED.stage,
             -- only restamp when the stage actually moved, or "days in stage" resets on every edit
             entered_stage = CASE WHEN niches.stage <> EXCLUDED.stage THEN CURRENT_DATE
                                  ELSE niches.entered_stage END,
             updated_at = now()`,
      [shopId, slug, family, stage]);
    await logEvent("niche_stage", { detail: `${slug} → ${stage} (shop ${shopId})` });
    return NextResponse.json({ ok: true, slug, stage });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e).slice(0, 200) }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  if (!(await isLoggedIn())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const shopId = await shop();
    const slug = String(new URL(req.url).searchParams.get("slug") ?? "").trim();
    if (!slug) return NextResponse.json({ error: "slug gerekli" }, { status: 400 });
    // Removing a niche from the portfolio does not touch the products that carry it — the row here is a
    // decision record, and deleting a decision must never delete the work.
    await q(`DELETE FROM niches WHERE shop_id=$1 AND slug=$2`, [shopId, slug]);
    await logEvent("niche_stage", { detail: `${slug} portföyden çıkarıldı (shop ${shopId})` });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e).slice(0, 200) }, { status: 500 });
  }
}
