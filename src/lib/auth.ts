import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";

const COOKIE = "klozio_session";

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not set");
  return s;
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

export function makeToken(): string {
  // 7 day session, single user — the payload is just an expiry
  const exp = String(Date.now() + 7 * 24 * 3600 * 1000);
  return `${exp}.${sign(exp)}`;
}

export function verifyToken(token: string | undefined): boolean {
  if (!token) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig) return false;
  if (Number(exp) < Date.now()) return false;
  const expected = sign(exp);
  try {
    return timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

export function checkPassword(input: string): boolean {
  const pw = process.env.DASHBOARD_PASSWORD;
  if (!pw) throw new Error("DASHBOARD_PASSWORD is not set");
  const a = Buffer.from(input);
  const b = Buffer.from(pw);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Is there a signed-in operator?
 *
 * Thirty-five route handlers and pages call this, so the auth provider changes here rather than in
 * thirty-five files. When Clerk is configured it is the only authority; the shared-password path stays
 * for the pre-Clerk single-operator mode and for local work without Clerk keys — it is selected by the
 * ABSENCE of Clerk configuration, never as a fallback when a Clerk check fails, because a fallback that
 * triggers on failure is a way in.
 */
export async function isLoggedIn(): Promise<boolean> {
  if (process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    const { auth } = await import("@clerk/nextjs/server");
    const { userId } = await auth();
    return !!userId;
  }
  const c = await cookies();
  return verifyToken(c.get(COOKIE)?.value);
}

export const SESSION_COOKIE = COOKIE;
