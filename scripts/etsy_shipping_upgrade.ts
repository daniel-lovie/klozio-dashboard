/**
 * Add the paid delivery upgrade to a shop's shipping profile.
 *
 * The upgrade lives on the PROFILE, not on a listing, so one call covers every listing that uses it —
 * and every listing published later. There is nothing to backfill.
 *
 * Two things worth knowing before running it:
 *
 *   THE CLOCK IS OURS, NOT UPS'S. The upgrade sells a faster CARRIER. Our standard profile already
 *   quotes 3-6 days delivery, so 3 Day Select would be almost indistinguishable from it and the buyer
 *   would have paid for nothing. 2nd Day Air is the slowest class that visibly beats the standard
 *   option. The processing time before the parcel is handed over is not covered by any carrier class —
 *   a rush order still has to be picked up, printed and dispatched the same day to mean anything.
 *
 *   $6 IS A PRICE, NOT A COST RECOVERY. A UPS 2nd Day Air label for a boxed tee costs more than $6 at
 *   the rates this shop can see; the difference comes out of the item margin. That is the operator's
 *   call, made 2026-08-17, and it is deliberate — the upgrade exists to win the buyer who needs it by
 *   a date, not to earn on shipping.
 *
 *   npx tsx scripts/etsy_shipping_upgrade.ts --shop 1
 *   npx tsx scripts/etsy_shipping_upgrade.ts --shop 1 --apply
 */
import { apiGet, etsyRaw, getShippingProfiles, shopId } from "../src/lib/etsy";
import { runWithShop } from "../src/lib/shop-context";

const UPGRADE_NAME = "Rush service + UPS shipping";
const PRICE = 6.0;
// Each extra item in the same parcel adds nothing: the shirts ship in one box.
const SECONDARY_PRICE = 0.0;
const CARRIER = "UPS";
const MAIL_CLASS = "two_day"; // UPS 2nd Day Air®

async function run(apply: boolean) {
  const carriers: any = await apiGet("/shipping-carriers?origin_country_iso=US");
  const ups = carriers.results.find((c: any) => c.name === CARRIER);
  if (!ups) throw new Error(`${CARRIER} tasiyicisi bulunamadi`);
  const cls = ups.domestic_classes.find((m: any) => m.mail_class_key === MAIL_CLASS);
  if (!cls) throw new Error(`${CARRIER} icin ${MAIL_CLASS} sinifi yok`);

  const profiles: any = await getShippingProfiles();
  console.log(`shop ${shopId()} · ${profiles.results.length} kargo profili\n`);

  let changed = 0;
  for (const p of profiles.results) {
    const existing = (p.shipping_profile_upgrades || []).find(
      (u: any) => u.upgrade_name === UPGRADE_NAME
    );
    console.log(`profil ${p.shipping_profile_id}  "${p.title}"`);
    if (existing) {
      console.log(`   zaten var: ${existing.upgrade_name} $${existing.price?.amount / 100}`);
      continue;
    }
    console.log(`   eklenecek: "${UPGRADE_NAME}"  $${PRICE.toFixed(2)}  ${ups.name} ${cls.name}`);
    if (!apply) continue;

    await etsyRaw(
      "POST",
      `/shops/${shopId()}/shipping-profiles/${p.shipping_profile_id}/upgrades`,
      {
        type: "0", // domestic
        upgrade_name: UPGRADE_NAME,
        price: PRICE,
        secondary_price: SECONDARY_PRICE,
        shipping_carrier_id: ups.shipping_carrier_id,
        mail_class: MAIL_CLASS,
      }
    );
    changed++;
    console.log("   -> eklendi");
  }

  if (!apply) {
    console.log("\nDRY RUN. Uygulamak icin --apply");
    return;
  }

  // Read it back. Etsy accepts the POST and returns 200 for shapes it then stores differently, so the
  // profile is re-fetched and the upgrade confirmed rather than assumed.
  const after: any = await getShippingProfiles();
  const live = after.results.flatMap((p: any) =>
    (p.shipping_profile_upgrades || [])
      .filter((u: any) => u.upgrade_name === UPGRADE_NAME)
      .map((u: any) => ({ profile: p.shipping_profile_id, price: u.price?.amount / 100, id: u.upgrade_id }))
  );
  console.log(`\n${changed} profile eklendi. Etsy'de dogrulanan:`);
  for (const u of live) console.log(`   profil ${u.profile}  upgrade ${u.id}  $${u.price}`);
  if (!live.length) {
    console.error("DOGRULANAMADI: Etsy profilde upgrade gostermiyor.");
    process.exit(1);
  }
}

// The shop is an ARGUMENT, never inherited. Every Etsy credential, profile id and upgrade lives under
// one shop, and a script that silently uses whichever shop the ambient context happens to hold will
// eventually write the wrong one's storefront.
const argv = process.argv.slice(2);
const shop = argv.includes("--shop") ? Number(argv[argv.indexOf("--shop") + 1]) : 1;
const apply = argv.includes("--apply");

runWithShop(shop, () => run(apply)).catch((e) => {
  console.error(e);
  process.exit(1);
});
