/**
 * Clerk session handling for every request.
 *
 * `clerkMiddleware` only makes the session available; it does not protect anything by itself. The
 * pages and route handlers still call isLoggedIn(), and shop access is decided by membership in
 * lib/user.ts — this file exists so those calls have a session to read.
 *
 * The publish ticker and the order poll run inside the same process but not inside a request, so they
 * are unaffected.
 */
import { clerkMiddleware } from "@clerk/nextjs/server";

/**
 * The publishable key is passed explicitly, and it is read from CLERK_PUBLISHABLE_KEY — deliberately
 * WITHOUT the NEXT_PUBLIC_ prefix.
 *
 * NEXT_PUBLIC_* values are inlined at build time. The platform build did not receive the value as a
 * build arg, so the middleware bundle was compiled with `undefined` and every request died with
 * "@clerk/nextjs: Missing publishableKey" — the deploy reported success because the healthcheck path is
 * excluded from this matcher, and only the pages 500'd. A plain server variable is read from the running
 * container instead, so switching between Clerk instances is a variable change and a restart.
 */
const publishableKey =
  process.env.CLERK_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

// A no-op handler: this middleware only attaches the session. Authorisation happens in the pages and
// in lib/user.ts. The handler argument exists because this Clerk version has no options-only overload.
export default clerkMiddleware(async () => {}, publishableKey ? { publishableKey } : {});

export const config = {
  // Everything except Next's own assets, files with an extension, and two paths that must never depend
  // on the auth provider:
  //
  //   api/health — the deployment probe. It arrives on an internal hostname, not the site's domain, and
  //     production Clerk keys are bound to a domain; letting the probe run through Clerk made a healthy
  //     container fail its healthcheck and the platform kept serving the previous build. A liveness
  //     check that can be broken by the login system is not a liveness check.
  //   api/etsy/callback — Etsy redirects the seller back here with no session of ours yet.
  matcher: ["/((?!_next|api/health|api/etsy/callback|.*\\..*).*)"],
};
