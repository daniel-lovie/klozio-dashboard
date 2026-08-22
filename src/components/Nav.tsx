"use client";
import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";

// Grouped, because seven links in one flat row is a graveyard: the operator cannot tell which of them
// is today's work. Production is what the shop does daily; the rest is where you go to check on it.
// /plan and /usage still exist and still work; they are off the bar because the operator does not use
// them (2026-08-22). Removing the routes would break links already sent and saved.
const LINKS = [
  { href: "/", label: "Takvim", group: "uretim" },
  { href: "/chat", label: "Agent", group: "uretim" },
  { href: "/portfolio", label: "Portföy", group: "kayit" },
  { href: "/orders", label: "Siparişler", group: "kayit" },
  { href: "/analytics", label: "Analytics", group: "kayit" },
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
    if (v === "__none__") return;
    if (v === "__new__") { router.push("/shops/new"); return; }
    if (v === "__settings__") { router.push("/shops/settings"); return; }
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
  //
  // A user with NO shops must not land on "__new__" as the current value. A <select> fires onChange only
  // when the value CHANGES, so preselecting it made "＋ Yeni mağaza…" already-selected and clicking it
  // did nothing at all — for the one person who needs it most, a brand-new account with nothing else to
  // pick. The placeholder holds the slot instead, so choosing "new" is a real change.
  const value = shops.some((s) => s.id === active) ? active : (shops[0]?.id ?? "__none__");

  const links = isAdmin ? [...LINKS, { href: "/users", label: "Kullanıcılar", group: "kayit" }] : LINKS;

  return (
    <nav className="sticky top-0 z-40 border-b border-line bg-raised/85 backdrop-blur-md">
      {/* One row on a phone: shop selector, then the menu button. Eight links in a non-wrapping flex row
          pushed the last three off a 375px screen with no scrollbar and no hint they existed. */}
      <div className="mx-auto flex max-w-[1200px] items-center gap-2 px-4 py-2.5 sm:px-6">
        <select
          value={String(value)}
          onChange={(e) => switchShop(e.target.value)}
          disabled={busy}
          title={shops.length > 1 ? `${shops.length} mağaza` : undefined}
          className="h-9 min-w-0 max-w-[45vw] flex-none truncate rounded border border-line-strong bg-raised px-2.5 text-sm font-semibold disabled:opacity-60 sm:mr-1 sm:max-w-none"
        >
          {/* "could not be loaded" is what an operator with shops sees when a fetch fails; a new account
              has no shops because it has not made one yet, and telling them something broke sends them
              looking for a fault instead of at the option below. */}
          {shops.length === 0 && <option value="__none__">mağaza yok — aşağıdan oluştur</option>}
          {shops.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
          <option value="__new__">＋ Yeni mağaza…</option>
          {shops.length > 0 && <option value="__settings__">⚙ Mağaza ayarları…</option>}
        </select>

        <div className="hidden items-center gap-0.5 md:flex">
          {links.map((l, i) => (
            <span key={l.href} className="flex items-center">
              {/* A hairline where the group changes: it separates doing from checking without adding
                  another row of chrome. */}
              {i > 0 && links[i - 1].group !== l.group && (
                <span aria-hidden className="mx-2 h-4 w-px bg-line" />
              )}
              <Link href={l.href}
                aria-current={activeLink(l.href) ? "page" : undefined}
                className={`relative rounded px-3 py-1.5 text-sm transition ${activeLink(l.href)
                  ? "font-medium text-ink"
                  : "text-ink-soft hover:bg-sunken hover:text-ink"}`}>
                {l.label}
                {/* The active page is marked by an underline in the accent, not a filled dark pill:
                    a pill that heavy competes with the page content it is supposed to introduce. */}
                {activeLink(l.href) && (
                  <span aria-hidden className="absolute inset-x-3 -bottom-[11px] h-0.5 rounded-full bg-accent" />
                )}
              </Link>
            </span>
          ))}
        </div>

        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label="Menü"
          className="ml-auto h-9 rounded border border-line-strong px-3 text-sm md:hidden">
          {open ? "✕" : "☰"} <span className="ml-1">{links.find((l) => activeLink(l.href))?.label ?? "Menü"}</span>
        </button>

        <button
          onClick={signOut}
          className="ml-auto hidden h-9 rounded px-3 text-sm text-ink-soft transition hover:bg-sunken hover:text-ink md:block">
          Çıkış
        </button>
      </div>

      {open && (
        <div className="border-t border-line bg-raised px-4 pb-3 pt-2 md:hidden">
          <div className="grid grid-cols-2 gap-1.5">
            {links.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)}
                className={`rounded px-3 py-2.5 text-sm ${activeLink(l.href)
                  ? "bg-accent text-accent-ink font-medium"
                  : "border border-line text-ink-soft"}`}>
                {l.label}
              </Link>
            ))}
          </div>
          <button onClick={signOut}
            className="mt-2 w-full rounded border border-line px-3 py-2.5 text-sm text-ink-soft">
            Çıkış
          </button>
        </div>
      )}
    </nav>
  );
}
