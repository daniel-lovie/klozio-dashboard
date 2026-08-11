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
async function agentQuery(sql: string) {
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
    const res = await client.query(sql);
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
    if (name === "etsy") {
      const out = await etsyRaw(input.method, input.path, input.body);
      await logEvent("agent_tool", { detail: `etsy ${input.method} ${input.path}` });
      return { result: clip(JSON.stringify(out)), summary: `etsy ▸ ${input.method} ${input.path}` };
    }
    if (name === "shopify") {
      const out = await shopifyGql(input.query, input.variables ?? {});
      await logEvent("agent_tool", { detail: `shopify gql: ${String(input.query).slice(0, 140)}` });
      return { result: clip(JSON.stringify(out)), summary: "shopify ▸ gql" };
    }
    if (name === "printful") {
      const out = await printfulRaw(input.method, input.path, input.body);
      await logEvent("agent_tool", { detail: `printful ${input.method} ${input.path}` });
      return { result: clip(JSON.stringify(out)), summary: `printful ▸ ${input.method} ${input.path}` };
    }
    return { result: `unknown tool ${name}`, summary: `? ${name}` };
  } catch (e: any) {
    const msg = String(e?.message ?? e).slice(0, 1200);
    return { result: `ERROR: ${msg}${advice(name, e)}`, summary: `${name} ▸ HATA` };
  }
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
