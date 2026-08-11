/** Higgsfield access for the personalizer agent, via the same MCP server the
 *  local pipeline uses (https://mcp.higgsfield.ai/mcp, Streamable HTTP).
 *
 *  Auth: OAuth tokens live in the hf_tokens table (seeded from the operator's
 *  session; refresh_token rotates like Etsy's — always persist what comes back).
 *  Protocol: minimal MCP client — initialize once per session, then tools/call.
 *  Every JSON-RPC response can be `text/event-stream`; parse both shapes.
 */
import pg from "pg";

const MCP_URL = "https://mcp.higgsfield.ai/mcp";
// The account the platform pays for. A tenant without its own connection falls back to it.
const PLATFORM_SHOP_ID = Number(process.env.HF_PLATFORM_SHOP_ID || 1);
const TOKEN_URL = "https://mcp.higgsfield.ai/oauth2/token";

function db() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const isLocal = /localhost|127\.0\.0\.1/.test(url);
  return new pg.Client({ connectionString: url, ssl: isLocal ? undefined : { rejectUnauthorized: false } });
}

/**
 * Which shop's Higgsfield account to spend. HF_SHOP_ID is set by the caller (the batch runner passes
 * the campaign's shop); absent, it falls back to the platform account.
 *
 * This used to read `WHERE id=1` unconditionally, so ANY shop generating a design spent the operator's
 * Higgsfield credit — a second tenant's images were billed to the first. The table already carried
 * shop_id; only this query did not use it.
 */
function shopId(): number {
  const v = Number(process.env.HF_SHOP_ID);
  return Number.isFinite(v) && v > 0 ? v : PLATFORM_SHOP_ID;
}

async function loadToken(): Promise<{ access: string; refresh: string; clientId: string; expiresAt: Date; shop: number }> {
  const c = db(); await c.connect();
  try {
    const want = shopId();
    // The shop's own account first; the platform account only as an explicit fallback, so a tenant that
    // has not connected Higgsfield still works and the cost is knowingly ours.
    const r = await c.query(
      `SELECT access_token, refresh_token, client_id, expires_at, shop_id FROM hf_tokens
        WHERE shop_id = $1 OR shop_id = $2
        ORDER BY (shop_id = $1) DESC LIMIT 1`, [want, PLATFORM_SHOP_ID]);
    if (!r.rows.length) throw new Error(`hf_tokens: shop ${want} icin token yok — scripts/seed-hf-tokens.mts`);
    const row = r.rows[0];
    if (row.shop_id !== want) {
      console.warn(`[hf] shop ${want} kendi Higgsfield hesabini baglamamis; platform hesabi kullanildi`);
    }
    return { access: row.access_token, refresh: row.refresh_token, clientId: row.client_id,
             expiresAt: new Date(row.expires_at), shop: row.shop_id };
  } finally { await c.end(); }
}

async function refreshToken(): Promise<string> {
  const t = await loadToken();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: t.refresh, client_id: t.clientId }),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`hf token refresh failed ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  const c = db(); await c.connect();
  try {
    await c.query(
      `UPDATE hf_tokens SET access_token=$1, refresh_token=COALESCE($2, refresh_token),
              expires_at=now() + ($3 || ' seconds')::interval, updated_at=now() WHERE shop_id=$4`,
      [json.access_token, json.refresh_token ?? null, String(json.expires_in ?? 3600), t.shop]
    );
  } finally { await c.end(); }
  return json.access_token as string;
}

async function accessToken(): Promise<string> {
  const t = await loadToken();
  if (t.expiresAt.getTime() - Date.now() > 5 * 60 * 1000) return t.access;
  return refreshToken();
}

let sessionId: string | null = null;
let rpcId = 0;

function parseBody(text: string): any {
  // Streamable HTTP may answer as SSE ("event: message\ndata: {...}") or plain JSON.
  if (text.startsWith("event:") || text.includes("\ndata:") || text.startsWith("data:")) {
    const datas = text.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim());
    for (const d of datas.reverse()) { try { return JSON.parse(d); } catch { /* keep looking */ } }
    throw new Error("unparseable SSE body: " + text.slice(0, 200));
  }
  return JSON.parse(text);
}

async function rpc(method: string, params: any, tok: string, retried = false): Promise<any> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    authorization: `Bearer ${tok}`,
  };
  if (sessionId) headers["mcp-session-id"] = sessionId;
  const res = await fetch(MCP_URL, {
    method: "POST", headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  if (res.status === 401 && !retried) {
    const fresh = await refreshToken();
    sessionId = null;
    if (method !== "initialize") await init(fresh);
    return rpc(method, params, fresh, true);
  }
  const sid = res.headers.get("mcp-session-id");
  if (sid) sessionId = sid;
  const text = await res.text();
  if (!res.ok) throw new Error(`mcp ${method} ${res.status}: ${text.slice(0, 300)}`);
  if (res.status === 202 || !text.trim()) return null; // notifications
  const body = parseBody(text);
  if (body.error) throw new Error(`mcp ${method} error: ${JSON.stringify(body.error).slice(0, 300)}`);
  return body.result;
}

async function init(tok: string) {
  await rpc("initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "klozio-personalizer", version: "1.0" },
  }, tok);
  await rpc("notifications/initialized", {}, tok).catch(() => null);
}

export type HfUsageSink = (u: { tool: string; model?: string }) => void;
let hfSink: HfUsageSink | null = null;
export function setHfUsageSink(fn: HfUsageSink) { hfSink = fn; }

export async function callTool(name: string, args: any): Promise<any> {
  if (arguments.length && (name === "generate_image" || name === "apps_invoke")) {
    try { hfSink?.({ tool: name, model: (args as any)?.params?.model }); } catch {}
  }
  const tok = await accessToken();
  if (!sessionId) await init(tok);
  const result = await rpc("tools/call", { name, arguments: args }, tok);
  // MCP tool result: content[] of text blocks; our tools return JSON text
  const texts = (result?.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text);
  const joined = texts.join("\n");
  if (result?.isError) throw new Error(`tool ${name} failed: ${joined.slice(0, 400)}`);
  try { return JSON.parse(joined); } catch { return { _raw: joined }; }
}


const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
/** Tool results may come back as human text instead of JSON — extract ids/urls robustly. */
export function jobIdOf(gen: any): string | null {
  return gen?.results?.[0]?.id ?? gen?.id ?? (typeof gen?._raw === "string" ? (gen._raw.match(UUID_RE)?.[0] ?? null) : null);
}
export function rawUrlOf(st: any): string | null {
  // video jobs come back as plain text with just the CDN link — grab any media URL first
  if (typeof st?._raw === "string") {
    const m = st._raw.match(/https:\/\/\S+?\.(mp4|webm|png|jpg|jpeg|svg)/i);
    if (m) return m[0];
  }
  const g = st?.generation ?? st;
  return g?.results?.rawUrl ?? (typeof st?._raw === "string" ? (st._raw.match(/https:\/\/[^\s)"']+\.(png|svg|jpg|webp)/i)?.[0] ?? null) : null);
}
export function statusOf(st: any): string {
  const g = st?.generation ?? st;
  if (g?.status) return g.status;
  const raw = typeof st?._raw === "string" ? st._raw.toLowerCase() : "";
  // Failure words only count when they are the STATUS — raw text can innocently
  // contain "nsfw": false or the word "error" elsewhere (cost a real outage 2026-08-03).
  const m = raw.match(/status['"\s:=]+(completed|nsfw|failed|error|in_progress|pending|queued|processing)/);
  if (m) return m[1];
  if (raw.includes("completed")) return "completed";
  for (const s of ["in_progress", "processing", "pending", "queued"]) if (raw.includes(s)) return s;
  if (/\b(nsfw|moderat)/.test(raw) && !raw.includes("false")) return "nsfw";
  if (raw.includes("failed")) return "failed";
  return "unknown";
}

/** Upload a PNG buffer as generation input; returns media_id. */
export async function uploadPng(buf: Buffer, filename: string): Promise<string> {
  const up = await callTool("media_upload", { filename, content_type: "image/png" });
  let u = up.uploads?.[0] ?? up;
  if (!u.upload_url && typeof up._raw === "string") {
    u = { upload_url: up._raw.match(/https:\/\/upload[^\s"']+/)?.[0], media_id: up._raw.match(UUID_RE)?.[0] };
  }
  if (!u.upload_url || !u.media_id) throw new Error("media_upload response unusable: " + JSON.stringify(up).slice(0, 200));
  const put = await fetch(u.upload_url, { method: "PUT", headers: { "content-type": "image/png" }, body: new Uint8Array(buf) });
  if (!put.ok) throw new Error(`presigned PUT ${put.status}`);
  await callTool("media_confirm", { type: "image", media_id: u.media_id });
  return u.media_id as string;
}

/** Generate with nano_banana_pro from a media reference; poll to completion; return rawUrl. */
export async function generateSwap(mediaId: string, prompt: string): Promise<string> {
  const gen = await callTool("generate_image", {
    params: {
      model: "nano_banana_pro", prompt, aspect_ratio: "1:1", resolution: "4k",
      medias: [{ role: "image", value: mediaId }],
    },
  });
  const jobId = jobIdOf(gen);
  if (!jobId) throw new Error("no job id from generate_image: " + JSON.stringify(gen).slice(0, 200));
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 8000));
    const st = await callTool("job_status", { jobId, sync: true });
    const status = statusOf(st);
    if (status === "completed") {
      const url = rawUrlOf(st);
      if (!url) throw new Error("completed without rawUrl");
      return url;
    }
    if (["failed", "nsfw", "error"].includes(status)) throw new Error(`generation ${status}`);
  }
  throw new Error("generation timed out");
}
