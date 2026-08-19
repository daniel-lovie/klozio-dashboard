import { redirect } from "next/navigation";
import Link from "next/link";
import { isLoggedIn } from "@/lib/auth";
import { q } from "@/lib/db";
import { currentShopId } from "@/lib/shops";
import { fmtDateTime } from "@/lib/fmt";
import { OrderRow, PollButton } from "@/components/Orders";

export default async function OrdersPage() {
  if (!(await isLoggedIn())) redirect("/login");

  const shopId = await currentShopId();
  const rows = await q<any>(
    `SELECT f.*, p.slug, p.title, p.personalised, p.hero_colorway, p.slot, p.technique
       FROM fulfillment_orders f LEFT JOIN products p ON p.id=f.product_id
      WHERE f.shop_id=${shopId}
      ORDER BY CASE WHEN f.status IN ('done','shipped') THEN 1 ELSE 0 END,
               -- A buyer who paid for rush is the one order in the queue with a clock on it, so it
               -- sorts above everything still open. Finished orders keep plain date order.
               CASE WHEN f.rush AND f.status NOT IN ('done','shipped') THEN 0 ELSE 1 END,
               f.ordered_at DESC NULLS LAST`);

  const active = rows.filter((r) => !["done", "shipped"].includes(r.status));

  return (
    <main className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Fulfillment queue</h1>
          <p className="mt-1 text-sm text-muted">
            new → generating → qa → ready → sent to producer → shipped. Personalised orders regenerate the
            print with the buyer&apos;s exact text before QA. Producer submission is manual until the
            Printinly API is wired in.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PollButton />
          <Link href="/" className="rounded-lg border border-espresso/25 px-3 py-1.5 text-sm">Calendar</Link>
        </div>
      </header>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-espresso/15 bg-white/60 p-6 text-sm text-muted">
          No orders yet. &quot;Poll Etsy now&quot; pulls paid orders from the last 30 days; after launch,
          run it on a schedule (or the ticker can call it).
        </p>
      ) : (
        <>
          <p className="mb-3 text-sm text-muted">{active.length} active · {rows.length} total</p>
          <div className="space-y-3">
            {rows.map((r) => <OrderRow key={r.id} row={JSON.parse(JSON.stringify(r))} at={r.ordered_at ? fmtDateTime(r.ordered_at) : "—"} />)}
          </div>
        </>
      )}
    </main>
  );
}
