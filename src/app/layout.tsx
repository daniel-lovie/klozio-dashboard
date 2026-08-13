import "./globals.css";
import { Inter } from "next/font/google";
import { Nav } from "@/components/Nav";
import { listShops, currentShopId } from "@/lib/shops";
import { isLoggedIn } from "@/lib/auth";
import { clerkConfigured, clerkClientConfigured, me } from "@/lib/user";
import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Klozio — Publishing Dashboard",
  description: "Etsy ve Shopify icin tasarim, ilan ve siparis operasyonu",
};

// The app had no font at all: it rendered in whatever the browser defaults to, which is most of why a
// carefully built interface still looked unfinished. Self-hosted by Next at build time, so there is no
// runtime request to Google and no layout shift.
const sans = Inter({
  subsets: ["latin", "latin-ext"],       // latin-ext carries the Turkish characters this UI is written in
  display: "swap",
  variable: "--font-sans",
});

// The publish ticker is started from src/instrumentation.ts (runs at server startup in
// BOTH dev and production). Do not start it here: in `next dev` this module is only
// loaded on the first request, so an unattended server would never publish.

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The shop list is resolved on the server and handed to the nav as a prop. It used to be fetched
  // from /api/shops in a useEffect, which meant the selector's first paint was a hardcoded "Klozio" —
  // indistinguishable from an account that genuinely has one shop. A second store existed with 244
  // products in it and the operator had no way to reach it, or to tell that anything had gone wrong.
  let shops: { id: number; name: string }[] = [];
  let active = 1;
  let isAdmin = false;
  try {
    if (await isLoggedIn()) {
      shops = (await listShops()).map((s) => ({ id: s.id, name: s.name }));
      active = await currentShopId();
      if (clerkConfigured()) isAdmin = !!(await me())?.isAdmin;
    }
  } catch {
    shops = [];                       // nav renders an explicit error rather than a plausible lie
  }
  const body = (
    <html lang="tr" className={sans.variable}>
      <body className="min-h-screen font-sans antialiased">
        <Nav shops={shops} active={active} isAdmin={isAdmin} clerk={clerkConfigured()} />
        {children}
      </body>
    </html>
  );
  // Pass the publishable key EXPLICITLY rather than relying on NEXT_PUBLIC_* inlining.
  //
  // That inlining happens at build time, and the platform build did not always receive the value as a
  // build arg — the deploy reported success while the served page contained no Clerk at all, so the
  // sign-in screen rendered our heading and nothing else. Read from process.env here, in a server
  // component, and the key comes from the running container's environment: switching between the
  // development and production Clerk instances is then a variable change and a restart, with no
  // rebuild and nothing baked into an image.
  const pk = process.env.CLERK_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  return pk ? <ClerkProvider publishableKey={pk}>{body}</ClerkProvider> : body;
}
