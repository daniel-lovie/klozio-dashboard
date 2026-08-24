/**
 * Manual look at the trend pipeline, without waiting for 19:00.
 *
 *   npx tsx scripts/trends.mts              # scan, judge, store, print
 *   npx tsx scripts/trends.mts --draw       # ...and draft into the opted-in shops
 */
import { recordScan, runTrendRound, trendShops } from "../src/lib/trend-pipeline";
import { hasSerpApi } from "../src/lib/trends/sources";
import { risingTrends, hasDataForSeo } from "../src/lib/trends/rising";
import { q } from "../src/lib/db";

const draw = process.argv.includes("--draw");
console.log(`kesif: ${hasSerpApi() ? "SerpApi" : "RSS (ucretsiz)"} · tohumlu: ${hasDataForSeo() ? "DataForSEO" : "kapali"}`);

if (process.argv.includes("--rising")) {
  if (!hasDataForSeo()) { console.log("DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD tanimli degil"); process.exit(1); }
  const r = await risingTrends();
  console.log(`${r.length} yukselen sorgu`);
  for (const t of r.slice(0, 40)) console.log(`  ${String(t.increasePct ?? "").padStart(5)}  ${t.categories[0] ?? "-"}  ${t.term}`);
  process.exit(0);
}

if (draw) {
  const shops = await trendShops();
  console.log(JSON.stringify(await runTrendRound(shops), null, 1));
} else {
  console.log(JSON.stringify(await recordScan(), null, 1));
}
const rows = await q<any>(
  `SELECT verdict, count(*)::int n FROM trend_seen WHERE first_seen > now() - interval '96 hours' GROUP BY 1`);
console.table(rows);
process.exit(0);
