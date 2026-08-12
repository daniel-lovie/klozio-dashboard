/** Tool definitions + executors for the web agent. Every call is logged to events. */
import { pool, logEvent } from "../db";
import { etsyRaw } from "../etsy";
import { shopifyGql } from "../shopify";
import { printfulRaw } from "../printful";

/**
 * Run the model's SQL confined to one shop.
 *
 * The tool takes free-form SQL, so no amount of prompting confines it — "filter by shop_id" is a
 * request, not a boundary, and one forgotten WHERE reads every tenant's catalogue. Two things make it
 * a boundary instead:
 *
 *   - `SET LOCAL ROLE klozio_agent` — the application connects as `postgres`, which is superuser and
 *     owner of every table, and row-level security is bypassed entirely for a superuser. Policies
 *     without this role switch would be decoration. The role also has no grant at all on etsy_tokens,
 *     hf_tokens or shops, so live OAuth tokens and every API key in the platform are unreachable.
 *   - `SET LOCAL app.shop_id` — the value the policies compare against. It is the shop the request is
 *     already authorised for, never anything the model chose.
 *
 * Both are LOCAL: they die with the transaction, so a leaked role cannot outlive one statement. If the
 * shop cannot be resolved the query is refused rather than run unconfined.
 */
async function agentQuery(sql: string, params?: any[]) {
  const { currentShopId, NO_SHOP } = await import("../shops");
  const shopId = await currentShopId();
  if (!shopId || shopId === NO_SHOP) {
    throw new Error("aktif magaza cozulemedi — sorgu calistirilmadi");
  }
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE klozio_agent");
    await client.query("SELECT set_config('app.shop_id', $1, true)", [String(shopId)]);
    const res = await client.query(sql, params);
    await client.query("COMMIT");
    return res;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    // The pool hands this connection to the next caller, which may be the publisher running as
    // postgres. RESET makes sure the restricted role does not travel with it.
    await client.query("RESET ROLE").catch(() => {});
    client.release();
  }
}

/** Run channel work under the ACTIVE shop's credentials.
 *
 * lib/etsy.ts reads its keys from the async-local shop context and falls back to the environment, which
 * is Klozio (shop 1). The agent's etsy and printful tools called straight through, so an operator working
 * on the second shop had their agent talking to the FIRST shop's Etsy account — the SQL side was confined
 * by row-level security while the API side was not.
 */
async function withShop<T>(fn: () => Promise<T>): Promise<T> {
  const { currentShopId, NO_SHOP } = await import("../shops");
  const { runWithShop } = await import("../shop-context");
  const shopId = await currentShopId();
  if (!shopId || shopId === NO_SHOP) throw new Error("aktif magaza cozulemedi — cagri yapilmadi");
  return runWithShop(shopId, fn);
}

export const TOOL_DEFS = [
  {
    name: "sql",
    description: "Run a SQL statement on the Klozio Postgres (single source of truth). Returns rows as JSON. Use SELECT to inspect before any write. Always use WHERE on UPDATE/DELETE.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "The SQL to execute" } },
      required: ["query"],
    },
  },
  {
    name: "produce",
    description: "Onayli bir urunun tasarimini ve 7-9 ilan gorselini uretir (Higgsfield ~$0.03 + kompozit). "
      + "content_status='approved' ve design_prompt dolu olmali. Zaten gorseli olan urunu tekrar uretmez. "
      + "Bir urun icin product_id, birden fazlasi icin slug listesi degil TEK id ver; her cagri bir urun.",
    input_schema: {
      type: "object",
      properties: { product_id: { type: "number", description: "products.id" } },
      required: ["product_id"],
    },
  },
  {
    name: "update_product",
    description: "Bir urunun fiyatini/basligini/aciklamasini/etiketlerini degistirir ve CANLI ilana da yazar. "
      + "Fiyat Etsy'de ilanin uzerinde degil envanter tekliflerinde durur; bu arac dogru yere yazar ve "
      + "beden ek ucretlerini korur. Sadece verdigin alanlar degisir. Fiyat degisikligi para politikasina "
      + "tabidir: kullanici bu konusmada acikca istemediyse cagirma.",
    input_schema: {
      type: "object",
      properties: {
        product_id: { type: "number", description: "products.id" },
        price_cents: { type: "number", description: "yeni cikis fiyati, kurus (ornek 2999 = $29.99)" },
        title: { type: "string" },
        description: { type: "string" },
        tags: { type: "array", items: { type: "string" }, description: "en fazla 13, her biri <=20 karakter" },
      },
      required: ["product_id"],
    },
  },
  {
    name: "etsy",
    description: "Authenticated Etsy v3 API call. path is relative to /v3/application (e.g. /listings/123 or /shops/{shop_id}/listings). Body only for POST/PUT/PATCH.",
    input_schema: {
      type: "object",
      properties: {
        method: { type: "string", enum: ["GET", "POST", "PUT", "PATCH", "DELETE"] },
        path: { type: "string" },
        body: { type: "object" },
      },
      required: ["method", "path"],
    },
  },
  {
    name: "shopify",
    description: "Shopify Admin GraphQL (2026-07) against zzsvpu-dx.myshopify.com. Provide the query and optional variables.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string" }, variables: { type: "object" } },
      required: ["query"],
    },
  },
  {
    name: "printful",
    description: "Printful API call, store-scoped (embroidery fulfillment). path e.g. /orders or /orders/123. NOTE: /orders/{id}/confirm CHARGES MONEY — only on explicit user request.",
    input_schema: {
      type: "object",
      properties: {
        method: { type: "string", enum: ["GET", "POST", "DELETE"] },
        path: { type: "string" },
        body: { type: "object" },
      },
      required: ["method", "path"],
    },
  },
] as const;

const clip = (s: string, n = 12000) => (s.length > n ? s.slice(0, n) + `\n…[${s.length - n} chars clipped]` : s);

export async function execTool(name: string, input: any): Promise<{ result: string; summary: string }> {
  try {
    if (name === "sql") {
      const q = String(input.query ?? "");
      const res = await agentQuery(q);
      const rows = (res.rows ?? []).slice(0, 200);
      await logEvent("agent_tool", { detail: `sql: ${q.slice(0, 180)}` });
      const summary = `sql ▸ ${res.command ?? "OK"} ${res.rowCount ?? rows.length}`;
      return { result: clip(JSON.stringify({ command: res.command, rowCount: res.rowCount, rows })), summary };
    }
    if (name === "produce") {
      // Same entrypoint the scheduler uses. The agent gets no private path to image building: one
      // implementation, or the version nobody tested is the one customers see.
      const pid = Number(input.product_id);
      const { produceOne } = await import("../producer");
      const out = await produceOne(pid);
      await logEvent("agent_tool", { detail: `produce ${pid}: ${out.ok ? "ok" : out.out.slice(0, 120)}` });
      return { result: clip(JSON.stringify(out)), summary: `produce ▸ ${pid} ${out.ok ? "ok" : "hata"}` };
    }
    if (name === "update_product") {
      const out = await updateProduct(input);
      await logEvent("agent_tool", { productId: Number(input.product_id), detail: `update_product: ${out.changed.join(", ") || "degisiklik yok"}` });
      return { result: clip(JSON.stringify(out)), summary: `update ▸ ${input.product_id} ${out.changed.join("+") || "-"}` };
    }
    if (name === "etsy") {
      const out = await withShop(() => etsyRaw(input.method, input.path, input.body));
      await logEvent("agent_tool", { detail: `etsy ${input.method} ${input.path}` });
      return { result: clip(JSON.stringify(out)), summary: `etsy ▸ ${input.method} ${input.path}` };
    }
    if (name === "shopify") {
      const out = await withShop(() => shopifyGql(input.query, input.variables ?? {}));
      await logEvent("agent_tool", { detail: `shopify gql: ${String(input.query).slice(0, 140)}` });
      return { result: clip(JSON.stringify(out)), summary: "shopify ▸ gql" };
    }
    if (name === "printful") {
      const out = await withShop(() => printfulRaw(input.method, input.path, input.body));
      await logEvent("agent_tool", { detail: `printful ${input.method} ${input.path}` });
      return { result: clip(JSON.stringify(out)), summary: `printful ▸ ${input.method} ${input.path}` };
    }
    return { result: `unknown tool ${name}`, summary: `? ${name}` };
  } catch (e: any) {
    const msg = String(e?.message ?? e).slice(0, 1200);
    return { result: `ERROR: ${msg}${advice(name, e)}`, summary: `${name} ▸ HATA` };
  }
}

/** Change a product's price or copy in one place, and carry it to the live listing.
 *
 * The agent could already run `UPDATE products SET price_cents=...` — and that is exactly the problem:
 * on Etsy the price lives in the inventory offerings, not on the listing, so our row would say $24.99
 * while every buyer still paid the old price. Nobody would notice until a sale came in at the wrong
 * amount. Same for the copy: a title in our database that never reached Etsy is a lie we tell ourselves.
 *
 * So the write is one operation: validate against the platform's limits BEFORE touching anything, write
 * the row, push to the channel, then read the listing back and compare. Size upcharges survive because
 * this calls the same updateInventory the publisher uses rather than a second copy of the price maths.
 */
async function updateProduct(input: any): Promise<{
  product_id: number; changed: string[]; etsy: string; verified: any; note?: string;
}> {
  const pid = Number(input.product_id);
  if (!Number.isFinite(pid)) throw new Error("product_id gecersiz");

  const cur = await agentQuery(
    `SELECT id, slug, title, price_cents, etsy_listing_id, etsy_state, colorways, sizes, quantity
       FROM products WHERE id = $1`, [pid]);
  const p = cur.rows?.[0];
  // RLS makes an out-of-shop product indistinguishable from a missing one, which is the point.
  if (!p) throw new Error(`urun ${pid} bu magazada bulunamadi`);

  // Placeholders, not string building: the values come from the model, and hand-escaping a title with an
  // apostrophe in it is exactly the kind of thing that works until it does not.
  const sets: string[] = [];
  const vals: any[] = [];
  const changed: string[] = [];
  const put = (col: string, v: any) => { vals.push(v); sets.push(`${col}=$${vals.length}`); };

  if (input.price_cents !== undefined) {
    const cents = Math.round(Number(input.price_cents));
    if (!Number.isFinite(cents) || cents < 300 || cents > 50000) {
      throw new Error(`price_cents ${input.price_cents} makul aralikta degil (300-50000 kurus)`);
    }
    if (cents !== p.price_cents) { put("price_cents", cents); changed.push("price"); }
  }
  if (input.title !== undefined) {
    const t = String(input.title).trim();
    // Etsy rejects over 140 and the copy playbook wants 125-140; refusing here beats a 400 mid-write.
    if (t.length < 10 || t.length > 140) throw new Error(`title ${t.length} karakter — Etsy siniri 140, playbook 125-140`);
    if (t !== p.title) { put("title", t); changed.push("title"); }
  }
  if (input.description !== undefined) {
    const d = String(input.description);
    if (d.trim().length < 40) throw new Error("description cok kisa (>=40 karakter)");
    put("description", d); changed.push("description");
  }
  if (input.tags !== undefined) {
    const tags = (Array.isArray(input.tags) ? input.tags : []).map((s: any) => String(s).trim()).filter(Boolean);
    if (!tags.length || tags.length > 13) throw new Error(`tags ${tags.length} adet — Etsy en fazla 13 kabul eder`);
    const tooLong = tags.filter((t: string) => t.length > 20);
    if (tooLong.length) throw new Error(`Etsy etiketi 20 karakteri gecemez: ${tooLong.join(", ")}`);
    put("tags", tags); changed.push("tags");
  }
  if (!sets.length) {
    return { product_id: pid, changed: [], etsy: "atlandi", verified: null, note: "istenen degerler zaten boyle" };
  }

  vals.push(pid);
  await agentQuery(`UPDATE products SET ${sets.join(", ")}, updated_at=now() WHERE id = $${vals.length}`, vals);

  if (!p.etsy_listing_id) {
    return { product_id: pid, changed, etsy: "ilan yok — yayinlanınca bu degerlerle gider", verified: null };
  }

  const listingId = Number(p.etsy_listing_id);
  const { updateListingFields, updateInventory, getListing } = await import("../etsy");
  const { shopCtx, hasEtsy } = await import("../shop-context");
  return withShop(async () => {
    if (!hasEtsy()) {
      return { product_id: pid, changed, etsy: "magazanin Etsy baglantisi yok — sadece veritabani guncellendi", verified: null };
    }
    if (changed.some((c) => c !== "price")) {
      await updateListingFields(listingId, {
        title: input.title !== undefined ? String(input.title).trim() : undefined,
        description: input.description !== undefined ? String(input.description) : undefined,
        tags: input.tags !== undefined ? input.tags : undefined,
      });
    }
    if (changed.includes("price")) {
      await updateInventory(listingId, {
        colorways: p.colorways ?? [],
        sizes: p.sizes ?? ["S", "M", "L", "XL", "2X", "3X"],
        priceCents: Math.round(Number(input.price_cents)),
        quantity: p.quantity ?? 999,
        readinessStateId: shopCtx().readinessStateId,
        skuPrefix: (p.slug || "SKU").slice(0, 12).toUpperCase().replace(/[^A-Z0-9]/g, ""),
      });
    }
    // "Sent" is not "applied". Read the listing back and report what Etsy actually holds.
    const live: any = await getListing(listingId).catch(() => null);
    return {
      product_id: pid,
      changed,
      etsy: `listing ${listingId} guncellendi`,
      verified: live ? {
        title: live.title,
        price: live.price ? `${live.price.amount / live.price.divisor} ${live.price.currency_code}` : null,
        state: live.state,
      } : "ilan geri okunamadi — elle dogrula",
    };
  });
}

/** Turn a database error the agent cannot see the cause of into an instruction it can act on.
 *
 * RLS hides other shops' rows; products.slug is unique GLOBALLY. So a duplicate-key failure points at a
 * row the agent is not allowed to read, its own SELECT says the slug is free, and it has nothing to go on
 * — watched live it burned four turns guessing prefixes and gave up. The constraint stays (operator
 * scripts look products up by slug alone), so the error has to carry the way out with it.
 */
function advice(name: string, e: any): string {
  const code = e?.code as string | undefined;
  const detail = `${e?.constraint ?? ""} ${e?.message ?? ""}`;
  if (code === "23505" && /slug/i.test(detail)) {
    return "\n\nNOT: slug BENZERSIZLIGI TUM MAGAZALAR ICIN GECERLI ve RLS yuzunden cakisan satiri "
      + "goremezsin — kendi SELECT'in bos donse de slug dolu olabilir. Tahmin etme: "
      + "`SELECT next_free_slug('istedigin-slug')` cagir, dondugu degeri kullan.";
  }
  if (code === "42501" || /permission denied/i.test(detail)) {
    return "\n\nNOT: bu satir baska bir magazaya ait ya da rolunun yetkisi yok. Kendi magazanin "
      + "verisiyle devam et; baska magazaya erismeye calismak yerine durumu bildir.";
  }
  if (name === "sql") {
    // The agent read a rolled-back transaction as a partial write — "muhtemelen zaten insert edilmişti
    // kısmen" — and then reasoned from a state that never existed. Every sql call is one transaction.
    return "\n\nNOT: bu cagri tek bir transaction icinde kosar; hata alinca TAMAMEN geri alindi. "
      + "Kismi yazma diye bir sey yok — sifirdan tekrar dene.";
  }
  return "";
}
