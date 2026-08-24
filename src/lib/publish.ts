/**
 * The publish pipeline: takes an approved schedule row and puts the product live on Etsy.
 *
 * Two paths:
 *   A) product has no etsy_listing_id  -> create draft, upload images, set inventory, activate
 *   B) product already drafted on Etsy -> activate (and top up images/inventory if missing)
 *
 * Safety rules baked in:
 *   - only rows with status='approved' are ever published
 *   - an overdue row still publishes. Approval IS the decision to publish, and a clock that ran out
 *     while nobody was looking does not withdraw it (operator, 2026-08-24). The refusal this replaces
 *     turned "the scheduler was asleep" into a failed launch the operator had to find and re-approve
 *   - a crude DB lock (locked_at) stops two tickers double-publishing the same row
 */
import fs from "fs";
import path from "path";
import { q, one, logEvent } from "./db";
import { runWithShop, shopCtx, hasEtsy } from "./shop-context";
import {
  createDraftListing,
  setListingPersonalization,
  uploadListingImage,
  uploadListingVideo,
  updateInventory,
  activateListing,
  setReturnPolicy,
  getListing,
  apiGet,
} from "./etsy";

const PERSONALIZATION_INSTRUCTIONS =
  "Type the exact text to print (names/year). Spelling & capitalization print exactly as typed. Text only, no photos.";

/** Per-product wording when it exists, the generic line otherwise. The generic line says "print"
 *  and "names/year", which is wrong on an embroidered product and meaningless on one that asks for
 *  something other than a name — a stitched character crest, for instance. Etsy caps this field at
 *  120 characters, so an over-long placeholder is truncated rather than allowed to fail the call. */
function personalizationText(p: { personalization_instructions?: string | null }): string {
  // NOT personalization_placeholder: that column holds the token the personalizer swaps out of the
  // design (e.g. "KAELEN"), which would be nonsense shown to a buyer as instructions.
  const custom = (p.personalization_instructions ?? "").trim();
  return custom ? custom.slice(0, 120) : PERSONALIZATION_INSTRUCTIONS;
}

export type DueRow = {
  schedule_id: number;
  product_id: number;
  scheduled_at: string;
  attempts: number;
};



/**
 * How late is late enough to say something about it.
 *
 * This used to be a REFUSAL: past the window a due row went to 'failed' and stayed there until a human
 * re-approved it. The reasoning was that a scheduler asleep for a month must not wake up and dump every
 * backdated launch at once — a real risk, but the wrong lever. The rate is already bounded (5 rows a
 * tick from the scheduler, 10 from the cron endpoint), and the cost of the refusal fell entirely on the
 * ordinary case: a launch approved for 15:00 and reached at 18:30 failed, and the operator had to go
 * find out why.
 *
 * So it is a log line now, not a gate. Being late is worth noticing; it is not worth cancelling a
 * decision a human already made.
 */
function lateNoticeMs() {
  return Number(process.env.PUBLISH_LATE_NOTICE_MINUTES || 180) * 60 * 1000;
}

/**
 * "Exceeded daily rate limit" is not a failed publish. It is a closed door.
 *
 * Etsy's daily quota is per app, and the publisher treated the 429 like any other error: revert to
 * approved, retry on the next 60-second tick, three times, then mark the product FAILED forever. Six
 * approved products have died this way already — four on 20 Aug and two tonight — each burning three
 * more requests against the very quota that was exhausted, which is the worst possible response to
 * running out of quota.
 *
 * So a daily 429 now closes the shop until the quota resets, and does not spend an attempt: the product
 * never got a turn, so it must not be charged for one.
 */
function isDailyRateLimit(err: string): boolean {
  return /\(429\)/.test(err) && /daily rate limit/i.test(err);
}

/** Etsy's daily counters reset at midnight UTC, so that is when the door opens again. */
function nextQuotaResetISO(): string {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  return d.toISOString();
}

/** Claim due rows atomically so concurrent tickers don't collide. */
export async function claimDue(limit = 5): Promise<DueRow[]> {
  const rows = await q<DueRow>(
    `UPDATE schedule s
        SET status = 'publishing', locked_at = now(), attempts = s.attempts + 1
      WHERE s.id IN (
        SELECT sc.id FROM schedule sc
          JOIN products p ON p.id = sc.product_id
         WHERE sc.status = 'approved'
           AND sc.scheduled_at <= now()
           AND (sc.locked_at IS NULL OR sc.locked_at < now() - INTERVAL '15 minutes')
           -- Skip any shop whose daily quota is spent. Trying anyway cannot succeed and each attempt
           -- digs the hole deeper.
           AND NOT EXISTS (
             SELECT 1 FROM events e
              WHERE e.kind = 'etsy_quota_spent'
                AND e.detail = 'shop ' || p.shop_id::text
                AND e.created_at > date_trunc('day', now() AT TIME ZONE 'UTC')
           )
         ORDER BY sc.scheduled_at
         LIMIT $1
         FOR UPDATE SKIP LOCKED
      )
      RETURNING s.id AS schedule_id, s.product_id, s.scheduled_at, s.attempts`,
    [limit]
  );
  return rows;
}

export async function publishOne(row: DueRow): Promise<{ ok: boolean; listingId?: number; error?: string }> {
  const { schedule_id, product_id } = row;
  const shopRow = await one<{ shop_id: number }>(`SELECT shop_id FROM products WHERE id=$1`, [product_id]);
  return runWithShop(shopRow?.shop_id ?? 1, async () => {
    // Publishing is the one step that genuinely needs the channel connected. Say so plainly rather
    // than failing deep inside an API call.
    if (!hasEtsy()) {
      throw new Error(`shop ${shopRow?.shop_id ?? 1}: Etsy baglantisi yok — yayinlamadan once baglayin`);
    }
    return publishOneInner(row);
  });
}

async function publishOneInner(row: DueRow): Promise<{ ok: boolean; listingId?: number; error?: string }> {
  const { schedule_id, product_id } = row;
  await logEvent("publish_start", { scheduleId: schedule_id, productId: product_id });

  // Late is reported, not refused. See lateNoticeMs().
  const overdueBy = Date.now() - new Date(row.scheduled_at).getTime();
  if (overdueBy > lateNoticeMs()) {
    const mins = Math.round(overdueBy / 60000);
    await logEvent("publish_late", {
      scheduleId: schedule_id, productId: product_id,
      detail: `${mins} dk gecikmeli yayinlaniyor — onay verilmisti, saat kacirildi`,
    });
  }

  try {
    const p = await one<any>(`SELECT * FROM products WHERE id=$1`, [product_id]);
    if (!p) throw new Error(`product ${product_id} not found`);

    let listingId: number | null = p.etsy_listing_id ? Number(p.etsy_listing_id) : null;

    // ---- A) no draft yet: build it ----
    if (!listingId) {
      listingId = await createDraftListing({
        title: p.title,
        description: p.description,
        priceCents: p.price_cents,
        quantity: p.quantity,
        taxonomyId: p.taxonomy_id,
        tags: p.tags ?? [],
        materials: p.materials ?? ["cotton"],
        shippingProfileId: shopCtx().shippingProfileId,
        readinessStateId: shopCtx().readinessStateId,
        productionPartnerIds: shopCtx().productionPartnerIds,
        returnPolicyId: shopCtx().returnPolicyId,
        // 60 of the August-plan products are text-personalised; publishing them without
        // the personalisation box would ship a broken product page.
        personalization: p.personalised
          ? {
              required: true,
              // Etsy's dedicated personalization endpoint caps instructions at 120 chars
              instructions: personalizationText(p),
              charCountMax: 256,
            }
          : undefined,
      });
      await q(`UPDATE products SET etsy_listing_id=$2, etsy_state='draft' WHERE id=$1`, [product_id, listingId]);

      // The unstamped backup is a copy of the cover kept so the FREE SHIPPING stamp can be removed
      // without regenerating anything. It is not a listing photo, and branch B has always excluded it.
      // Branch A did not, and did not have to: stamping used to run only on listings that were already
      // live, so a brand-new draft never had a backup row to trip over. Since 2026-08-20 the stamp is
      // applied while the cover is made, which means every new product now reaches this line with one —
      // and without the filter Etsy would receive the same photo twice, the second time unstamped.
      // coalesce because role is nullable and `NULL <> 'x'` is NULL, which silently drops the image.
      const imgs = await q<any>(
        `SELECT rank, filename, mime, bytes FROM product_images
          WHERE product_id=$1 AND coalesce(role,'') <> 'cover_unstamped' ORDER BY rank`,
        [product_id]
      );
      if (imgs.length === 0) throw new Error("product has no images — Etsy requires at least one to go active");
      for (const img of imgs) {
        await uploadListingImage(listingId, img.rank, img.filename, img.mime, img.bytes as Buffer);
      }

      // CC1717 shirts carry the try-on video (best-effort — a video failure must not block launch)
      if (String(p.blank || "").includes("Comfort Colors")) {
        try {
          const vid = path.join(process.cwd(), "assets", "cc1717-tryon-720.mp4");
          if (fs.existsSync(vid)) await uploadListingVideo(listingId, "cc1717-tryon.mp4", fs.readFileSync(vid));
        } catch (e) {
          console.error(`listing ${listingId}: video upload failed (non-fatal):`, String(e).slice(0, 150));
        }
      }

    } else {
      // ---- B) draft exists: bring its images up to date before activating ----
      const live = await getListing(listingId).catch(() => null);
      if (!live) throw new Error(`Etsy listing ${listingId} not found — was it deleted?`);

      // This check used to count rows in OUR table and call that "make sure it has an image", which
      // verifies the wrong side of the transfer: attempt 1 can create the draft, upload two of eight
      // photos and die, and attempt 2 then reads eight rows locally, concludes all is well and
      // activates a listing showing one photo. `cryptid-m1-v1` went live on 2026-08-18 with 1 of 8.
      // Ask ETSY what it actually holds, and upload whatever is missing by rank.
      const ours = await q<any>(
        `SELECT rank, filename, mime, bytes FROM product_images
          WHERE product_id=$1 AND coalesce(role,'') <> 'cover_unstamped' ORDER BY rank`,
        [product_id]
      );
      if (ours.length === 0) {
        throw new Error("no images stored for this product; refusing to activate a listing we cannot verify");
      }
      const onEtsy = await apiGet(`/listings/${listingId}/images`).catch(() => null);
      const haveRanks = new Set<number>(
        ((onEtsy as any)?.results ?? []).map((x: any) => Number(x.rank))
      );
      const missing = ours.filter((img: any) => !haveRanks.has(Number(img.rank)));
      if (missing.length) {
        console.log(`listing ${listingId}: ${missing.length}/${ours.length} gorsel eksik, yukleniyor`);
        for (const img of missing) {
          await uploadListingImage(listingId, img.rank, img.filename, img.mime, img.bytes as Buffer);
        }
      }
      // Drafts created before return_policy_id was wired in (or created by hand in Shop Manager)
      // have it null, and Etsy refuses to activate them. Repair it rather than failing the launch.
      if (!live.return_policy_id) {
        await setReturnPolicy(listingId, shopCtx().returnPolicyId);
      }
      if (p.personalised) {
        await setListingPersonalization(listingId, {
          required: true,
          instructions: personalizationText(p),
          charCountMax: 256,
        });
      }
    }

    // Inventory is written on EVERY path, not just when the draft is created here.
    //
    // It used to live inside the "no draft yet" branch. That is fine on a first attempt and silently
    // wrong on a retry: attempt 1 creates the draft and stores etsy_listing_id, then fails somewhere
    // after; attempt 2 sees the id, takes the "draft exists" branch, skips this call entirely and
    // activates a listing carrying nothing but the single default offering Etsy creates with a draft.
    // Fifteen live listings went out that way on 2026-08-17 with no sizes, no colours and no Digital
    // PNG — every one of them a row with attempts = 2, every attempts = 1 row correct.
    //
    // The call is a PUT and is idempotent, so running it on the retry path costs one request and
    // removes the whole class of failure.
    await updateInventory(listingId, {
      colorways: p.colorways ?? [],
      sizes: p.sizes ?? ["S", "M", "L", "XL", "2X", "3X"],
      priceCents: p.price_cents,
      quantity: p.quantity,
      readinessStateId: shopCtx().readinessStateId,
      skuPrefix: (p.slug || "SKU").slice(0, 12).toUpperCase().replace(/[^A-Z0-9]/g, ""),
    });

    await activateListing(listingId);

    // A listing with one offering and no properties is the untouched draft shape, which is exactly what
    // the bug above produced. Refuse to call it published: better a failed row the operator can see
    // than a live listing a buyer cannot pick a size on.
    const inv = await apiGet(`/listings/${listingId}/inventory`).catch(() => null);
    const offerings = (inv as any)?.products?.length ?? 0;
    const wanted = (p.colorways?.length || 1) * (p.sizes?.length || 1);
    if (wanted > 1 && offerings < 2) {
      throw new Error(`inventory not applied: Etsy shows ${offerings} offering(s), expected ${wanted}`);
    }

    const verify = await getListing(listingId).catch(() => null);
    const state = verify?.state ?? "unknown";

    await q(
      `UPDATE schedule SET status='published', published_at=now(), last_error=NULL, locked_at=NULL WHERE id=$1`,
      [schedule_id]
    );
    await q(`UPDATE products SET etsy_state=$2 WHERE id=$1`, [product_id, state]);
    await logEvent("publish_ok", {
      scheduleId: schedule_id,
      productId: product_id,
      detail: `listing ${listingId} state=${state}`,
    });
    return { ok: true, listingId };
  } catch (e: any) {
    const err = String(e?.message ?? e).slice(0, 2000);

    if (isDailyRateLimit(err)) {
      // Hand the turn back, unspent, and close the shop until the counters roll over.
      const shop = await q<{ shop_id: number }>(`SELECT shop_id FROM products WHERE id = $1`, [product_id]);
      const shopId = shop[0]?.shop_id;
      await q(`UPDATE schedule SET status='approved', attempts = greatest(attempts - 1, 0),
                                   last_error=$2, locked_at=NULL WHERE id=$1`, [schedule_id, err]);
      if (shopId != null) {
        await q(`INSERT INTO events (kind, detail) SELECT 'etsy_quota_spent', $1
                  WHERE NOT EXISTS (SELECT 1 FROM events
                                     WHERE kind='etsy_quota_spent' AND detail=$1
                                       AND created_at > date_trunc('day', now() AT TIME ZONE 'UTC'))`,
                [`shop ${shopId}`]);
      }
      await logEvent("etsy_quota_wait", { scheduleId: schedule_id, productId: product_id,
        detail: `gunluk Etsy kotasi doldu — ${nextQuotaResetISO()} (UTC gece yarisi) sonrasi devam` });
      return { ok: false, error: err };
    }

    // give up after 3 attempts so we don't hammer the API
    const status = row.attempts >= 3 ? "failed" : "approved";
    await q(`UPDATE schedule SET status=$2, last_error=$3, locked_at=NULL WHERE id=$1`, [schedule_id, status, err]);
    await logEvent("publish_fail", { scheduleId: schedule_id, productId: product_id, detail: err });
    return { ok: false, error: err };
  }
}

export async function runDue(limit = 5) {
  const due = await claimDue(limit);
  const results: any[] = [];
  for (const row of due) {
    results.push({ scheduleId: row.schedule_id, ...(await publishOne(row)) });
  }
  return { claimed: due.length, results };
}
