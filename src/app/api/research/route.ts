/** What is selling in a phrase on Etsy, and how it is drawn. Read-only research; writes nothing. */
import { NextResponse } from "next/server";
import { isLoggedIn } from "@/lib/auth";
import { readStyle } from "@/lib/trends/style";
import { hasEverBee } from "@/lib/trends/everbee";

export const maxDuration = 300;

export async function GET(req: Request) {
  if (!(await isLoggedIn())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!hasEverBee()) return NextResponse.json({ error: "EverBee kimlik bilgileri yok" }, { status: 400 });
  const phrase = (new URL(req.url).searchParams.get("q") || "").trim();
  if (!phrase) return NextResponse.json({ error: "q gerekli" }, { status: 400 });
  return NextResponse.json(await readStyle(phrase, { winners: 4 }));
}
