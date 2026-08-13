import { redirect } from "next/navigation";
import Link from "next/link";
import { isLoggedIn } from "@/lib/auth";
import Calendar from "@/components/Calendar";
import { HealthPanel } from "@/components/HealthPanel";

export default async function Home() {
  if (!(await isLoggedIn())) redirect("/login");
  return (
    <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8">
      {/* wrap, not overflow: three fixed-width pills in a non-wrapping row pushed Portfolio off a phone */}
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <Link href="/plan" className="rounded-lg bg-espresso/10 px-3 py-1.5 font-medium">
          Plan <span className="hidden sm:inline">— ilanları gözden geçir</span>
        </Link>
        <Link href="/orders" className="rounded-lg border border-espresso/25 px-3 py-1.5">Orders</Link>
        <Link href="/portfolio" className="rounded-lg border border-espresso/25 px-3 py-1.5">Portfolio</Link>
      </div>
      <HealthPanel />
      <Calendar />
    </main>
  );
}
