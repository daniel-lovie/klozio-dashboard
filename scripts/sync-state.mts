/** Pull the live state of every linked listing from Etsy into the DB.
 *  The dashboard should never assert a state it hasn't verified. */
const base = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3010}`;
import pg from "pg";
const url = process.env.DATABASE_URL!;
const db = new pg.Client({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false } });
await db.connect();
const { rows: toks } = await db.query(`SELECT access_token FROM etsy_tokens WHERE id=1`);
const { rows } = await db.query(`SELECT id, slug, etsy_listing_id FROM products WHERE etsy_listing_id IS NOT NULL`);
for (const r of rows) {
  const res = await fetch(`https://openapi.etsy.com/v3/application/listings/${r.etsy_listing_id}`, {
    headers: { "x-api-key": process.env.ETSY_API_KEY!, Authorization: `Bearer ${toks[0].access_token}` },
  });
  if (!res.ok) { console.log(`  ${r.slug}: HTTP ${res.status}`); continue; }
  const v: any = await res.json();
  await db.query(`UPDATE products SET etsy_state=$2 WHERE id=$1`, [r.id, v.state]);
  console.log(`  ${r.slug} -> ${v.state}`);
}
await db.end();
