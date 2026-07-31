/**
 * Seed the dashboard from what already exists in the repo:
 *   - OAuth token  <- ../../.etsy_token.json
 *   - products     <- ../../pipeline/<niche>/listings/*-submit-spec.json
 *   - images       <- the image paths named in each spec (read as bytes into Postgres)
 *   - print file   <- pipeline/<niche>/designs/<slug>/final.png
 *   - schedule     <- one pending row per product, spread over upcoming weekdays
 *
 * Idempotent: re-running updates products by slug instead of duplicating them.
 */
import { readFileSync, existsSync, readdirSync } from "fs";
import { join, basename, dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", ".."); // /Users/.../code/etsy
const url = process.env.DATABASE_URL || "postgres://klozio:klozio@localhost:5433/klozio";
const isLocal = /localhost|127\.0\.0\.1/.test(url);
const db = new pg.Client({ connectionString: url, ssl: isLocal ? undefined : { rejectUnauthorized: false } });
await db.connect();

// ---------------------------------------------------------------- token
const tokenPath = join(ROOT, ".etsy_token.json");
if (existsSync(tokenPath)) {
  const t = JSON.parse(readFileSync(tokenPath, "utf8"));
  await db.query(
    `INSERT INTO etsy_tokens (id, access_token, refresh_token, expires_at, scopes)
     VALUES (1,$1,$2,$3,$4)
     ON CONFLICT (id) DO UPDATE SET access_token=$1, refresh_token=$2, expires_at=$3, scopes=$4, updated_at=now()`,
    [t.access_token, t.refresh_token, new Date(t.expires_at_ms ?? Date.now()).toISOString(), t.scopes ?? null]
  );
  console.log("✅ Etsy token seeded from .etsy_token.json");
} else {
  console.warn("⚠️  no .etsy_token.json found — publishing will fail until a token exists");
}

// ---------------------------------------------------------------- pngs
function pngSize(buf: Buffer): { w: number; h: number } | null {
  if (buf.length < 24 || buf.readUInt32BE(12) !== 0x49484452) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}
function jpgSize(buf: Buffer): { w: number; h: number } | null {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}
const dims = (p: string, buf: Buffer) =>
  (p.endsWith(".png") ? pngSize(buf) : jpgSize(buf)) ?? { w: 0, h: 0 };

function roleFor(file: string): { role: string; label: string | null } {
  const f = basename(file).toLowerCase();
  if (f.includes("cover") || f.includes("hero")) return { role: "cover", label: labelFrom(f) };
  if (f.includes("detail")) return { role: "detail", label: null };
  if (f.includes("size")) return { role: "size-guide", label: null };
  if (f.includes("trust")) return { role: "trust", label: null };
  if (/pepper|moss|jean|berry|ivory|butter|navy/.test(f)) return { role: "colorway", label: labelFrom(f) };
  return { role: "other", label: null };
}
function labelFrom(f: string): string | null {
  for (const c of ["pepper", "moss", "blue-jean", "bluejean", "berry", "ivory", "butter", "navy"]) {
    if (f.includes(c)) return c.replace("-", " ").replace(/\b\w/g, (m) => m.toUpperCase()).replace("Bluejean", "Blue Jean");
  }
  return null;
}

// ---------------------------------------------------------------- products
const pipeline = join(ROOT, "pipeline");
const niches = existsSync(pipeline)
  ? readdirSync(pipeline, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
  : [];

let seeded = 0;
const productIds: number[] = [];

for (const niche of niches) {
  const listingsDir = join(pipeline, niche, "listings");
  if (!existsSync(listingsDir)) continue;
  const specs = readdirSync(listingsDir).filter((f) => f.endsWith("submit-spec.json"));

  for (const specFile of specs) {
    const spec = JSON.parse(readFileSync(join(listingsDir, specFile), "utf8"));
    const slug = `${niche}--${specFile.replace("-submit-spec.json", "")}`;
    const colorways: string[] = spec.variations?.colorways ?? (spec.variations?.color_name ? [spec.variations.color_name] : []);
    const sizes: string[] = Object.keys(spec.variations?.sizes ?? { S: 1, M: 1, L: 1, XL: 1, "2X": 1, "3X": 1 });

    // economics: same validated model for every product until per-product costs exist
    const priceCents = Math.round((spec.price ?? 26) * 100);
    const podCents = 600, labelCents = 500;
    // matches pod-fulfillment/references/cost-model.md exactly:
    //   COGS  = producer all-in + shipping label
    //   GROSS = (price - COGS) / price            <- the researched 55% floor applies here
    //   NET   = (revenue - COGS - Etsy fees) / revenue, revenue includes shipping we charge
    const cogs = podCents + labelCents;
    const revenue = priceCents + (priceCents < 3000 ? labelCents : 0); // buyer pays ship under $30
    const fees = 20 + Math.round(0.065 * revenue) + Math.round(0.03 * revenue) + 25;
    const gross = ((priceCents - cogs) / priceCents) * 100;
    const net = ((revenue - cogs - fees) / revenue) * 100;

    const { rows } = await db.query(
      `INSERT INTO products (slug, niche, title, description, tags, materials, price_cents, quantity,
          taxonomy_id, blank, print_method, colorways, sizes, pod_cost_cents, label_cost_cents,
          gross_margin_pct, net_margin_pct, seo_score, etsy_listing_id, etsy_state)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       ON CONFLICT (slug) DO UPDATE SET
         title=EXCLUDED.title, description=EXCLUDED.description, tags=EXCLUDED.tags,
         price_cents=EXCLUDED.price_cents, colorways=EXCLUDED.colorways, sizes=EXCLUDED.sizes,
         gross_margin_pct=EXCLUDED.gross_margin_pct, net_margin_pct=EXCLUDED.net_margin_pct,
         seo_score=COALESCE(EXCLUDED.seo_score, products.seo_score),
         etsy_listing_id=COALESCE(EXCLUDED.etsy_listing_id, products.etsy_listing_id),
         -- NEVER downgrade live state on re-seed: the spec file says "draft" forever, but the
         -- listing may already be active. Re-seeding must not rewrite reality.
         etsy_state=COALESCE(products.etsy_state, EXCLUDED.etsy_state),
         updated_at=now()
       RETURNING id`,
      [slug, niche, spec.title, spec.description, spec.tags ?? [], spec.materials ?? ["cotton"],
       priceCents, spec.quantity ?? 999, spec.taxonomy_id ?? 482, "Comfort Colors 1717", "DTF",
       colorways, sizes, podCents, labelCents, gross.toFixed(2), net.toFixed(2), spec.seo_score ?? null,
       spec.etsy_listing_id ?? null, spec.etsy_listing_id ? 'draft' : null]
    );
    const pid = rows[0].id as number;
    productIds.push(pid);

    // images (replace so re-seeding picks up regenerated mockups)
    await db.query(`DELETE FROM product_images WHERE product_id=$1`, [pid]);
    let rank = 0;
    for (const rel of spec.images ?? []) {
      const abs = join(ROOT, rel);
      if (!existsSync(abs)) { console.warn(`  ⚠️  missing image ${rel}`); continue; }
      const buf = readFileSync(abs);
      const { w, h } = dims(abs, buf);
      const { role, label } = roleFor(abs);
      rank++;
      await db.query(
        `INSERT INTO product_images (product_id, rank, role, label, filename, mime, width, height, bytes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [pid, rank, role, label, basename(abs), abs.endsWith(".png") ? "image/png" : "image/jpeg", w, h, buf]
      );
    }

    // print file
    const designsDir = join(pipeline, niche, "designs");
    if (existsSync(designsDir)) {
      for (const d of readdirSync(designsDir)) {
        const f = join(designsDir, d, "final.png");
        if (existsSync(f)) {
          const buf = readFileSync(f);
          const { w, h } = dims(f, buf);
          await db.query(
            `UPDATE products SET print_file_name=$2, print_file=$3, print_file_w=$4, print_file_h=$5, print_dpi=300 WHERE id=$1`,
            [pid, `${d}/final.png`, buf, w, h]
          );
          break;
        }
      }
    }

    console.log(`✅ ${slug}  (${rank} images, ${colorways.length || 1}×${sizes.length} variations)`);
    seeded++;
  }
}

// ---------------------------------------------------------------- schedule
// one pending launch each, on upcoming weekdays at 09:00 local
const { rows: existing } = await db.query(`SELECT product_id FROM schedule`);
const already = new Set(existing.map((r: any) => r.product_id));
const SHOP_TZ = process.env.SHOP_TIMEZONE || 'America/Chicago';
let offset = 1;
for (const pid of productIds) {
  if (already.has(pid)) continue;
  // 09:00 in the SHOP's timezone (producer + buyers are US Central), computed in SQL so
  // the DST offset is always right rather than hardcoded.
  const { rows: sr } = await db.query(
    `INSERT INTO schedule (product_id, scheduled_at, status)
     VALUES ($1, ((date_trunc('day', now() AT TIME ZONE $3) + ($2 || ' days')::interval + INTERVAL '9 hours')
                  AT TIME ZONE $3), 'pending')
     RETURNING to_char(scheduled_at AT TIME ZONE $3, 'YYYY-MM-DD HH24:MI') AS shown`,
    [pid, offset, SHOP_TZ]
  );
  console.log(`   scheduled product ${pid} -> ${sr[0].shown} ${SHOP_TZ}`);
  offset++;
}

// ---------------------------------------------------------------- niche portfolio
{
  const nf = join(ROOT, "catalog", "niches.csv");
  if (existsSync(nf)) {
    // skip comment lines — the registry is intentionally empty until research names a niche
    const all = readFileSync(nf, "utf8").trim().split("\n").filter((l) => !l.startsWith("#"));
    const [head, ...lines] = all;
    const cols = head.split(",");
    // minimal CSV parse: handles the quoted notes field
    const parse = (line: string) => {
      const out: string[] = []; let cur = ""; let q = false;
      for (const ch of line) {
        if (ch === '"') q = !q;
        else if (ch === "," && !q) { out.push(cur); cur = ""; }
        else cur += ch;
      }
      out.push(cur);
      return Object.fromEntries(cols.map((c, i) => [c, out[i] ?? ""]));
    };
    let n = 0;
    for (const line of lines) {
      const r = parse(line);
      if (!r.niche_slug) continue;
      await db.query(
        `INSERT INTO niches (slug, family, stage, slot, entered_stage, decision_due, views_to_date, sales_to_date, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (slug) DO UPDATE SET family=EXCLUDED.family, stage=EXCLUDED.stage, slot=EXCLUDED.slot,
           entered_stage=EXCLUDED.entered_stage, decision_due=EXCLUDED.decision_due, notes=EXCLUDED.notes,
           updated_at=now()`,
        [r.niche_slug, r.family, r.stage || "candidate", r.slot ? Number(r.slot) : null,
         r.entered_stage || null, r.decision_due || null,
         Number(r.views_to_date || 0), Number(r.sales_to_date || 0), r.notes || null]
      );
      n++;
    }
    console.log(n ? `✅ ${n} niches seeded into the portfolio`
                  : "○ niche registry is empty — no niche selected yet (by design)");
  }
}

console.log(`\n${seeded} product(s) seeded.`);
await db.end();

