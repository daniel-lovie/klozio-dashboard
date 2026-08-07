/** Public terms page — the Meta app publish form asks for a Terms of Service URL alongside the
 *  privacy policy. Same audience as /privacy: this is an internal tool, not a consumer service. */
export const metadata = { title: "Terms of Service — Klozio" };

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-[760px] px-6 py-12 text-[15px] leading-relaxed">
      <h1 className="mb-2 text-2xl font-semibold">Terms of Service</h1>
      <p className="mb-8 text-sm text-muted">Last updated: 6 August 2026</p>

      <p className="mb-4">
        This tool is operated by Klozio for its own shops (including HillsByElgin). It is an
        internal operations application: it is not offered to the public, has no sign-ups, and sells
        nothing. Access is limited to authorised members of our team.
      </p>

      <h2 className="mb-2 mt-8 text-lg font-semibold">Permitted use</h2>
      <p className="mb-4">
        Authorised users may use the tool to publish and update our product listings, process and
        fulfil our orders, and review the performance of our own advertising. Any other use,
        including attempting to access it without authorisation, is prohibited.
      </p>

      <h2 className="mb-2 mt-8 text-lg font-semibold">Connected platforms</h2>
      <p className="mb-4">
        The tool connects to accounts we own on Etsy, Shopify, Meta, Printful and Printinly using
        credentials we control. Our use of those platforms is additionally governed by each
        platform&apos;s own terms, and nothing here overrides them.
      </p>

      <h2 className="mb-2 mt-8 text-lg font-semibold">Purchases from our shops</h2>
      <p className="mb-4">
        If you bought an item from us, your purchase is governed by the listing terms and the return
        policy shown on that marketplace at the time of sale — not by this page. Personalised,
        made-to-order items are produced to the details you supply, so please check spelling before
        ordering.
      </p>

      <h2 className="mb-2 mt-8 text-lg font-semibold">No warranty; changes</h2>
      <p className="mb-4">
        The tool is provided as-is for our internal use, with no warranty of availability or
        fitness for any purpose. We may change or withdraw it at any time. These terms may be
        updated; the date above reflects the current version.
      </p>

      <h2 className="mb-2 mt-8 text-lg font-semibold">Contact</h2>
      <p>
        Reach us through the contact form on our shop:{" "}
        <a className="underline" href="https://www.etsy.com/shop/HillsByElgin">
          etsy.com/shop/HillsByElgin
        </a>
      </p>
    </main>
  );
}
