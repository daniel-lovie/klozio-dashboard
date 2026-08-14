/**
 * The shared link that lets someone rate designs without an account.
 *
 * Clerk protects the dashboard, and it should: it holds prices, margins, Etsy credentials and a tool
 * that can write to a live shop. But the people whose taste is worth collecting are not going to be
 * given accounts on it, so rating needs its own door — one that opens onto exactly one thing.
 *
 * A shared secret in the URL is enough here, and deliberately so. What it grants is: see a design,
 * record a verdict. It cannot read a price, a title, an Etsy listing id, or anything about the shop.
 * If the link leaks, the worst case is votes from strangers — recoverable, because every vote carries
 * a rater name and can be filtered out afterwards.
 */
import { createHmac, timingSafeEqual } from "crypto";

export function rateSecret(): string {
  // Falls back to the session secret so the feature works without a second variable to forget. It is a
  // DIFFERENT token though, derived rather than reused, so a leaked rating link is never a session.
  const s = process.env.RATE_SECRET || process.env.SESSION_SECRET;
  if (!s) throw new Error("RATE_SECRET / SESSION_SECRET is not set");
  return createHmac("sha256", s).update("design-rating-v1").digest("hex").slice(0, 32);
}

export function checkRateToken(t: string | null | undefined): boolean {
  if (!t) return false;
  const expected = rateSecret();
  // Length-safe compare: timingSafeEqual throws on a length mismatch, which would itself leak length.
  const a = Buffer.from(String(t));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** A rater name we are willing to store: short, printable, and not a way to smuggle markup. */
export function cleanRater(raw: unknown): string {
  return String(raw ?? "").replace(/[^\p{L}\p{N} _.-]/gu, "").trim().slice(0, 40);
}
