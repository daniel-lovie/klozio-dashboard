"use client";
import Link from "next/link";
import { useState } from "react";
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

type ShopOption = { id: number; name: string };

/**
 * The shop list and the active shop arrive as props from the server layout — deliberately, not via a
 * client fetch. Fetching them here left a window where the selector showed one hardcoded shop, which
 * looks exactly like having one shop; the operator could not reach the second store at all and had no
 * signal that anything failed. If the list is empty now, it is empty because the server said so.
 */
export function Nav({ shops, active, isAdmin = false, clerk = false }:
  { shops: ShopOption[]; active: number; isAdmin?: boolean; clerk?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  // No shop selector on the auth screens: there is nobody to select for yet.
  if (pathname === "/login" || pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up")) {
    return null;
  }

  const activeLink = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  async function switchShop(v: string) {
    if (v === "__new__") { router.push("/shops/new"); return; }
    setBusy(true);
    const res = await fetch("/api/shops/switch", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: Number(v) }),
    }).catch(() => null);
    if (!res?.ok) { setBusy(false); alert("Mağaza değiştirilemedi — tekrar dene"); return; }
    location.reload();
  }

  async function signOut() {
    // With Clerk the session lives in Clerk's cookie, so clearing ours would leave the user signed in and
    // looking at a login page that redirects them straight back.
    if (clerk) { window.location.href = "/sign-out"; return; }
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
  }

  // The active shop must be in the list or the select falls back to its first option and silently
  // displays the wrong store as current.
  const value = shops.some((s) => s.id === active) ? active : (shops[0]?.id ?? "__new__");

  const links = isAdmin ? [...LINKS, { href: "/users", label: "Kullanıcılar" }] : LINKS;

  return (
    <nav className="sticky top-0 z-40 border-b border-espresso/15 bg-white/80 backdrop-blur">
      {/* One row on a phone: shop selector, then the menu button. Eight links in a non-wrapping flex row
          pushed the last three off a 375px screen with no scrollbar and no hint they existed. */}
      <div className="mx-auto flex max-w-[1200px] items-center gap-2 px-4 py-2.5 sm:px-6">
        <select
          value={String(value)}
          onChange={(e) => switchShop(e.target.value)}
          disabled={busy}
          title={shops.length > 1 ? `${shops.length} mağaza` : undefined}
          className="min-w-0 max-w-[45vw] flex-none truncate rounded-md border border-espresso/20 bg-white/80 px-2 py-1 text-sm font-semibold disabled:opacity-60 sm:mr-2 sm:max-w-none"
        >
          {shops.length === 0 && <option value="__none__">mağaza listesi alınamadı</option>}
          {shops.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
          <option value="__new__">＋ Yeni mağaza…</option>
        </select>

        <div className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href}
              className={`rounded-md px-3 py-1.5 text-sm ${activeLink(l.href)
                ? "bg-espresso text-white"
                : "text-espresso/80 hover:bg-espresso/10"}`}>
              {l.label}
            </Link>
          ))}
        </div>

        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label="Menü"
          className="ml-auto rounded-md border border-espresso/20 px-3 py-1.5 text-sm md:hidden">
          {open ? "✕" : "☰"} <span className="ml-1">{links.find((l) => activeLink(l.href))?.label ?? "Menü"}</span>
        </button>

        <button
          onClick={signOut}
          className="ml-auto hidden rounded-md px-3 py-1.5 text-sm text-espresso/60 hover:bg-espresso/10 md:block">
          Çıkış
        </button>
      </div>

      {open && (
        <div className="border-t border-espresso/10 bg-white/95 px-4 pb-3 pt-2 md:hidden">
          <div className="grid grid-cols-2 gap-1.5">
            {links.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)}
                className={`rounded-md px-3 py-2 text-sm ${activeLink(l.href)
                  ? "bg-espresso text-white"
                  : "border border-espresso/15 text-espresso/80"}`}>
                {l.label}
              </Link>
            ))}
          </div>
          <button onClick={signOut}
            className="mt-2 w-full rounded-md border border-espresso/15 px-3 py-2 text-sm text-espresso/60">
            Çıkış
          </button>
        </div>
      )}
    </nav>
  );
}
