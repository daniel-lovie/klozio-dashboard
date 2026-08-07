/** Public privacy policy — required to switch the Meta app out of Development mode
 *  (Meta refuses ad-creative creation from a dev-mode app). Intentionally unauthenticated. */
export const metadata = { title: "Privacy Policy — Klozio" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-[760px] px-6 py-12 text-[15px] leading-relaxed">
      <h1 className="mb-2 text-2xl font-semibold">Privacy Policy</h1>
      <p className="mb-8 text-sm text-muted">Last updated: 7 August 2026</p>

      <p className="mb-4">
        This policy covers the internal operations tool used by Klozio and HillsByElgin
        (&quot;we&quot;) to manage our own online shops. The tool is not a consumer product: it is
        used by our own staff to publish product listings, process our orders and review our
        advertising performance.
      </p>

      <h2 className="mb-2 mt-8 text-lg font-semibold">What we access</h2>
      <ul className="mb-4 list-disc space-y-1 pl-6">
        <li>
          <strong>Marketplace data (Etsy):</strong> our own shop&apos;s listings and the orders
          placed with us, including the buyer name and shipping address needed to fulfil an order.
        </li>
        <li>
          <strong>Commerce data (Shopify):</strong> our own store&apos;s products, inventory and orders.
        </li>
        <li>
          <strong>Advertising data (Meta):</strong> aggregate performance of our own ad account —
          spend, impressions, clicks and cost metrics. We do not access any individual&apos;s
          personal data through Meta, and we do not build or upload audiences of individuals.
        </li>
        <li>
          <strong>Fulfilment data (Printful, Printinly):</strong> the order details required to
          produce and ship an item.
        </li>
      </ul>

      <h2 className="mb-2 mt-8 text-lg font-semibold">How we use it</h2>
      <p className="mb-4">
        Solely to run our shops: to create and update our listings, to produce and ship the orders
        our customers place, and to measure whether our own advertising is profitable. We do not
        sell, rent or share customer data with third parties, and we do not use it for any purpose
        unrelated to fulfilling an order.
      </p>

      <h2 className="mb-2 mt-8 text-lg font-semibold">Storage and retention</h2>
      <p className="mb-4">
        Data is stored in a private database hosted on Railway (United States) and is reachable only
        by authenticated members of our team. Order records are retained as long as required for
        customer service, returns and tax purposes; access credentials for connected platforms are
        stored as environment secrets and never exposed in our application.
      </p>

      <h2 className="mb-2 mt-8 text-lg font-semibold">Your choices</h2>
      <p className="mb-4">
        If you bought from us and want a copy of the personal data we hold about your order, or want
        it deleted where we are not required to keep it, contact us through our shop&apos;s Etsy
        message page and we will respond within 48 hours. Data you provided to Etsy or Shopify
        directly is also governed by their own privacy policies.
      </p>

      <h2 className="mb-2 mt-8 text-lg font-semibold">Contact</h2>
      <p>
        Reach us via the contact form on our Etsy shop:{" "}
        <a className="underline" href="https://www.etsy.com/shop/HillsByElgin">
          etsy.com/shop/HillsByElgin
        </a>
      </p>
    </main>
  );
}
