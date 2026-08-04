/** Shopify connectivity + catalog snapshot — proof the web app can reach the store. */
import { NextResponse } from "next/server";
import { isLoggedIn } from "@/lib/auth";
import { shopifyStatus } from "@/lib/shopify";

export async function GET() {
  if (!(await isLoggedIn())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await shopifyStatus());
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 502 });
  }
}
