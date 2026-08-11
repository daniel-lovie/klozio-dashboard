/**
 * Deployment healthcheck. Unauthenticated on purpose, and it touches nothing.
 *
 * The healthcheck used to point at /login, which returned 200 while the shared password was the login.
 * Adding Clerk turned that page into a redirect, so the platform stopped seeing a 200 and marked a
 * perfectly healthy container as a failed deploy — the app was fine and the probe was measuring a page
 * whose job had changed. A dedicated endpoint cannot drift like that.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true });
}
