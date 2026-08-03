import "./globals.css";
import { Nav } from "@/components/Nav";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Klozio — Publishing Dashboard" };

// The publish ticker is started from src/instrumentation.ts (runs at server startup in
// BOTH dev and production). Do not start it here: in `next dev` this module is only
// loaded on the first request, so an unattended server would never publish.

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased"><Nav />{children}</body>
    </html>
  );
}
