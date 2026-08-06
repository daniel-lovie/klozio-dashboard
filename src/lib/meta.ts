/**
 * Meta Marketing API — read performance, act on creatives.
 *
 * Auth: a System User token (never expires) with ads_management + ads_read, stored in
 * META_SYSTEM_TOKEN. Etsy can't host a Pixel, so Meta only knows clicks — spend/clicks come
 * from here and get paired with Etsy-side orders in /analytics to produce CAC.
 */
const API = "https://graph.facebook.com/v23.0";

function token(): string {
  const t = process.env.META_SYSTEM_TOKEN;
  if (!t) throw new Error("META_SYSTEM_TOKEN not set");
  return t;
}
function account(): string {
  const a = process.env.META_AD_ACCOUNT_ID;
  if (!a) throw new Error("META_AD_ACCOUNT_ID not set");
  return a.startsWith("act_") ? a : `act_${a}`;
}

async function get(path: string, params: Record<string, string> = {}) {
  const qs = new URLSearchParams({ ...params, access_token: token() });
  const res = await fetch(`${API}${path}?${qs}`, { cache: "no-store" });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok || j.error) throw new Error(`meta ${path}: ${JSON.stringify(j.error ?? j).slice(0, 300)}`);
  return j;
}

async function post(path: string, body: Record<string, string>) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...body, access_token: token() }),
  });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok || j.error) throw new Error(`meta POST ${path}: ${JSON.stringify(j.error ?? j).slice(0, 300)}`);
  return j;
}

export type AdRow = {
  day: string; campaign_name: string; adset_name: string; ad_name: string;
  impressions: number; clicks: number; spend: number; reach: number; ctr: number; cpc: number;
};

/** Per-ad insights for the last N days INCLUDING today — Meta's `last_7d` preset silently
 *  excludes the current day, which hides a campaign launched today. */
export async function adInsights(days = 7): Promise<AdRow[]> {
  const until = new Date();
  const since = new Date(until.getTime() - days * 86400_000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const j = await get(`/${account()}/insights`, {
    level: "ad",
    fields: "campaign_name,adset_name,ad_name,impressions,clicks,spend,reach,ctr,cpc",
    time_increment: "1",
    time_range: JSON.stringify({ since: fmt(since), until: fmt(until) }),
    limit: "200",
  });
  return (j.data ?? []).map((r: any) => ({
    day: r.date_start,
    campaign_name: r.campaign_name ?? "", adset_name: r.adset_name ?? "", ad_name: r.ad_name ?? "",
    impressions: Number(r.impressions ?? 0), clicks: Number(r.clicks ?? 0),
    spend: Number(r.spend ?? 0), reach: Number(r.reach ?? 0),
    ctr: Number(r.ctr ?? 0), cpc: Number(r.cpc ?? 0),
  }));
}

export async function listCampaigns() {
  const j = await get(`/${account()}/campaigns`, {
    fields: "id,name,effective_status,objective,daily_budget", limit: "50",
  });
  return j.data ?? [];
}

export async function listAds() {
  const j = await get(`/${account()}/ads`, {
    fields: "id,name,effective_status,adset{id,name,daily_budget}", limit: "100",
  });
  return j.data ?? [];
}

/** Pause/resume a single ad — the kill switch for a creative that fails its CTR gate. */
export async function setAdStatus(adId: string, status: "ACTIVE" | "PAUSED") {
  return post(`/${adId}`, { status });
}

/** Change an ad set's daily budget (cents, Meta expects minor units as a string). */
export async function setAdSetBudget(adSetId: string, dailyBudgetCents: number) {
  return post(`/${adSetId}`, { daily_budget: String(Math.round(dailyBudgetCents)) });
}
