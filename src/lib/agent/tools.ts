/** Tool definitions + executors for the web agent. Every call is logged to events. */
import { pool, logEvent } from "../db";
import { etsyRaw } from "../etsy";
import { shopifyGql } from "../shopify";
import { printfulRaw } from "../printful";

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
      const res = await pool().query(q);
      const rows = (res.rows ?? []).slice(0, 200);
      await logEvent("agent_tool", { detail: `sql: ${q.slice(0, 180)}` });
      const summary = `sql ▸ ${res.command ?? "OK"} ${res.rowCount ?? rows.length}`;
      return { result: clip(JSON.stringify({ command: res.command, rowCount: res.rowCount, rows })), summary };
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
    return { result: `ERROR: ${msg}`, summary: `${name} ▸ HATA` };
  }
}
