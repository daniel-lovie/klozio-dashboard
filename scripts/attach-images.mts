/**
 * Attach a generated image set + print file to a product, by slug.
 *
 *   npm run db:attach -- <slug> <dir>
 *
 * Expects in <dir>: mockup-cover.png, mockup-hanging.png, mockup-model.png, final.png
 * The colour chart (assets/comfort-colors-1717-color-chart.jpeg) is attached as rank 4
 * on every product — buyers pick their shade from it.
 *
 * Replaces any existing image set for the product (idempotent re-run).
 */
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import imageSizeOf from "image-size";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const url = process.env.DATABASE_URL || "postgres://klozio:klozio@localhost:5433/klozio";
const isLocal = /localhost|127\.0\.0\.1/.test(url);
const db = new pg.Client({ connectionString: url, ssl: isLocal ? undefined : { rejectUnauthorized: false } });

const [slug, dir] = process.argv.slice(2);
if (!slug || !dir) {
  console.error("usage: npm run db:attach -- <slug> <dir>");
  process.exit(1);
}

await db.connect();
const { rows: [p] } = await db.query(
  `SELECT id, hero_colorway FROM products WHERE slug=$1`, [slug]);
if (!p) { console.error(`no product with slug ${slug}`); process.exit(1); }

function dims(buf: Buffer) {
  try { const d = (imageSizeOf as any)(buf); return { w: d.width ?? null, h: d.height ?? null }; }
  catch { return { w: null, h: null }; }
}

// Mockups ship as JPEG (photographic content, no transparency): the 2k PNGs run 6-7MB and
// our own image spec flags >1MB uploads as failure-prone. JPEG q90 lands ~500KB.
function pick(base: string) {
  const jpg = join(dir, `${base}.jpg`);
  return existsSync(jpg) ? { file: jpg, mime: "image/jpeg" } : { file: join(dir, `${base}.png`), mime: "image/png" };
}
const set = [
  { rank: 1, role: "cover",   label: p.hero_colorway, ...pick("mockup-cover") },
  { rank: 2, role: "hanging", label: p.hero_colorway, ...pick("mockup-hanging") },
  { rank: 3, role: "model",   label: p.hero_colorway, ...pick("mockup-model") },
  { rank: 4, role: "colorway-chart", label: "All 22 colors",
    file: join(ROOT, "assets", "comfort-colors-1717-color-chart.jpeg"), mime: "image/jpeg" },
];

await db.query(`DELETE FROM product_images WHERE product_id=$1`, [p.id]);
for (const s of set) {
  if (!existsSync(s.file)) { console.error(`missing ${s.file}`); process.exit(1); }
  const bytes = readFileSync(s.file);
  const { w, h } = dims(bytes);
  await db.query(
    `INSERT INTO product_images (product_id, rank, role, label, filename, mime, width, height, bytes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [p.id, s.rank, s.role, s.label, s.file.split("/").pop(), s.mime, w, h, bytes]);
  console.log(`  rank ${s.rank} ${s.role} ${(bytes.length / 1024).toFixed(0)}KB ${w}x${h}`);
}

// print file onto the product row (producer handoff pulls it from here)
const printPath = join(dir, "final.png");
if (existsSync(printPath)) {
  const buf = readFileSync(printPath);
  const { w, h } = dims(buf);
  await db.query(
    `UPDATE products SET print_file=$2, print_file_name=$3, print_file_w=$4, print_file_h=$5, print_dpi=$6
      WHERE id=$1`,
    [p.id, buf, `${slug}-print.png`, w, h, w ? Math.round(w / 10) : null]);
  console.log(`  print file ${(buf.length / 1024).toFixed(0)}KB ${w}x${h} (~${w ? Math.round(w / 10) : "?"} DPI @10in)`);
}

const { rows: [n] } = await db.query(
  `SELECT count(*)::int AS imgs FROM product_images WHERE product_id=$1`, [p.id]);
console.log(`✅ ${slug}: ${n.imgs} images attached`);
await db.end();
