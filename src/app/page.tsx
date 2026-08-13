import { redirect } from "next/navigation";
import Link from "next/link";
import { isLoggedIn } from "@/lib/auth";
import Calendar from "@/components/Calendar";
import { HealthPanel } from "@/components/HealthPanel";
import { Overview } from "@/components/Overview";

export default async function Home() {
  if (!(await isLoggedIn())) redirect("/login");
  return (
    <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8">
      {/* A page needs to say what it is. The dashboard opened straight onto a calendar grid with no
          heading, so the first thing the operator saw was data with no frame around it. */}
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold sm:text-2xl">Bugün</h1>
          <p className="mt-0.5 text-sm text-ink-soft">
            Yayın takvimi, katalog sağlığı ve bekleyen işler
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link href="/plan"
                className="inline-flex h-9 items-center rounded bg-accent px-3.5 font-medium text-accent-ink shadow-sm transition hover:brightness-110">
            İlanları gözden geçir
          </Link>
          <Link href="/chat"
                className="inline-flex h-9 items-center rounded border border-line-strong bg-raised px-3.5 transition hover:bg-sunken">
            Agent
          </Link>
        </div>
      </header>

      <Overview />
      <HealthPanel />
      <Calendar />
    </main>
  );
}
