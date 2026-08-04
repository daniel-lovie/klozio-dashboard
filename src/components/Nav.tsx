"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const LINKS = [
  { href: "/", label: "Takvim" },
  { href: "/plan", label: "Plan" },
  { href: "/portfolio", label: "Portföy" },
  { href: "/chat", label: "Agent 🤖" },
  { href: "/orders", label: "Siparişler" },
];

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  if (pathname === "/login") return null;

  const active = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <nav className="sticky top-0 z-40 border-b border-espresso/15 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-[1200px] items-center gap-1 px-6 py-2.5">
        <span className="mr-4 text-sm font-semibold tracking-wide">Klozio</span>
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href}
            className={`rounded-md px-3 py-1.5 text-sm ${active(l.href)
              ? "bg-espresso text-white"
              : "text-espresso/80 hover:bg-espresso/10"}`}>
            {l.label}
          </Link>
        ))}
        <button
          onClick={async () => { await fetch("/api/logout", { method: "POST" }); router.push("/login"); }}
          className="ml-auto rounded-md px-3 py-1.5 text-sm text-espresso/60 hover:bg-espresso/10">
          Çıkış
        </button>
      </div>
    </nav>
  );
}
