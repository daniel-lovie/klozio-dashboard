/** Confirm the Printful draft — THIS is the step that charges the Printful account. */
import { NextResponse } from "next/server";
import { isLoggedIn } from "@/lib/auth";
import { confirmPrintfulOrder } from "@/lib/printful-fulfill";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isLoggedIn())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  try {
    await confirmPrintfulOrder(Number(id));
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
