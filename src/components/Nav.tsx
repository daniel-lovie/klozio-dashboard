"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const LINKS = [
  { href: "/", label: "Takvim" },
  { href: "/plan", label: "Plan" },
  { href: "/portfolio", label: "Portföy" },
  { href: "/chat", label: "Agent 🤖" },
  { href: "/orders", label: "Siparişler" },
  { href: "/analytics", label: "Analytics 📊" },
  { href: "/usage", label: "Kullanım" },
];

function cookieShopId(): number {
  const m = typeof document !== "undefined" ? document.cookie.match(/(?:^|; )shop_id=(\d+)/) : null;
  return m ? Number(m[1]) : 1;
}

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [shops, setShops] = useState<{ id: number; name: string }[]>([]);
  const [current, setCurrent] = useState(1);

  useEffect(() => {
    setCurrent(cookieShopId());
    fetch("/api/shops").then((r) => (r.ok ? r.json() : { shops: [] }))
      .then((j) => setShops(j.shops ?? [])).catch(() => {});
  }, []);

  if (pathname === "/login") return null;

  const active = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  async function switchShop(v: string) {
    if (v === "__new__") { router.push("/shops/new"); return; }
    await fetch("/api/shops/switch", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: Number(v) }),
    });
    location.reload();
  }

  return (
    <nav className="sticky top-0 z-40 border-b border-espresso/15 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-[1200px] items-center gap-1 px-6 py-2.5">
        <select
          value={current}
          onChange={(e) => switchShop(e.target.value)}
          className="mr-4 rounded-md border border-espresso/20 bg-white/80 px-2 py-1 text-sm font-semibold"
        >
          {(shops.length ? shops : [{ id: 1, name: "Klozio" }]).map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
          <option value="__new__">＋ Yeni mağaza…</option>
        </select>
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
