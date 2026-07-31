import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const url = process.env.DATABASE_URL || "postgres://klozio:klozio@localhost:5433/klozio";
const isLocal = /localhost|127\.0\.0\.1/.test(url);
const client = new pg.Client({ connectionString: url, ssl: isLocal ? undefined : { rejectUnauthorized: false } });

await client.connect();
if (process.argv.includes("--reset")) {
  console.log("dropping tables…");
  await client.query(`DROP TABLE IF EXISTS events, schedule, product_images, products, etsy_tokens CASCADE`);
}
const sql = readFileSync(join(__dirname, "..", "db", "schema.sql"), "utf8");
await client.query(sql);
console.log("✅ schema applied");
await client.end();
// A lingering pg/SSL handle kept the process alive on Railway, so the `&& next start`
// chain never ran and the healthcheck starved. Exit explicitly.
process.exit(0);
