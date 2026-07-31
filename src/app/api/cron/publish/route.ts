import { NextResponse } from "next/server";
import { runDue } from "@/lib/publish";
import { isLoggedIn } from "@/lib/auth";

async function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") || "";
  if (secret && header === `Bearer ${secret}`) return true;
  return isLoggedIn(); // let a logged-in human trigger it from the UI too
}

export async function POST(req: Request) {
  if (!(await authorized(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const out = await runDue(10);
  return NextResponse.json(out);
}
export const GET = POST;
