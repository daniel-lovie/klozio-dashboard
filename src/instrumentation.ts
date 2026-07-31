/**
 * Next.js runs register() once at SERVER STARTUP, in both dev and production.
 *
 * This is the only correct place to start the publish ticker. Starting it from layout.tsx
 * module scope looked fine in production (the layout is loaded during the build/boot) but
 * silently did nothing in `next dev`, because dev compiles route modules lazily on the
 * first request — so an unattended dev server would never publish anything.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return; // skip the edge runtime
  const { startScheduler } = await import("./lib/scheduler");
  startScheduler();
}
