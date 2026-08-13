/** Catalogue health: the standards this shop states, measured, with the offending products named.
 *
 * Every rule here was already written down — the margin floors, the AI disclosure policy, Etsy's tag and
 * title limits — and none of it was ever checked anywhere the operator could see. The margin columns in
 * particular sat NULL on 269 of 271 products, so the product page showed a dash and nobody could know that
 * most of the catalogue was priced under the 55% gross floor. A standard nobody measures is a preference.
 *
 * Read-only. Nothing here edits a product; it says what is wrong and links to it.
 */
import { isLoggedIn } from "@/lib/auth";
import { q } from "@/lib/db";
import { currentShopId } from "@/lib/shops";

export const dynamic = "force-dynamic";

const GROSS_FLOOR = 55;
const NET_FLOOR = 40;
const TITLE_MAX = 140;      // Etsy rejects longer
const TAGS_REQUIRED = 13;
const TAG_MAX = 20;
const DISCLOSURE_HEAD = 600;

type Check = {
  key: string; label: string; severity: "high" | "medium"; why: string; sql: string;
  /** Where a row of this check points. Orders are not products; sending both to /product/:id would take the
   *  operator to whatever product happens to share that id. */
  href?: (id: number) => string;
};

/** Each check returns id + slug + detail. Kept as SQL so the whole audit is one round trip. */
const CHECKS: Check[] = [
  {
    key: "margin_gross",
    label: "brüt marj tabanın altında",
    severity: "high",
    why: `Gerçek maliyetle (üretici + etiket) %${GROSS_FLOOR} brüt tutmuyor. Bu ürün satıldıkça para kaybettirir.`,
    sql: `SELECT id, slug, gross_margin_pct::text || '% · en az ' ||
                 to_char((pod_cost_cents + coalesce(label_cost_cents,0)) / ${(1 - GROSS_FLOOR / 100).toFixed(2)}
                         / 100.0, 'FM999.00') || ' olmali' AS detail
            FROM products
           WHERE shop_id = $1 AND gross_margin_pct IS NOT NULL AND gross_margin_pct < ${GROSS_FLOOR}`,
  },
  {
    key: "margin_net",
    label: "net marj tabanın altında",
    severity: "high",
    why: `Etsy komisyonları düşüldükten sonra %${NET_FLOOR} altında kalıyor.`,
    sql: `SELECT id, slug, net_margin_pct::text || '%' AS detail
            FROM products
           WHERE shop_id = $1 AND net_margin_pct IS NOT NULL AND net_margin_pct < ${NET_FLOOR}`,
  },
  {
    key: "disclosure",
    label: "AI açıklaması ilk 600 karakterde yok",
    severity: "high",
    why: "Etsy 2026 Ocak'tan beri uyguluyor; gömülü beyan ilan kaldırma sebebi.",
    sql: `SELECT id, slug, 'beyan yok ya da çok aşağıda' AS detail
            FROM products
           WHERE shop_id = $1 AND coalesce(description,'') <> ''
             AND position('AI' in left(description, ${DISCLOSURE_HEAD})) = 0
             AND left(description, ${DISCLOSURE_HEAD}) !~* 'artificial intelligence'`,
  },
  {
    key: "title_len",
    label: "başlık Etsy limitini aşıyor",
    severity: "high",
    why: `${TITLE_MAX} karakteri aşan başlık yayına alınamaz.`,
    sql: `SELECT id, slug, length(title)::text || ' karakter' AS detail
            FROM products WHERE shop_id = $1 AND length(title) > ${TITLE_MAX}`,
  },
  {
    key: "tag_count",
    label: "tag sayısı 13 değil",
    severity: "medium",
    why: "13 tag'in tamamı kullanılmazsa arama yüzeyi boş kalır.",
    sql: `SELECT id, slug, coalesce(array_length(tags,1),0)::text || ' tag' AS detail
            FROM products
           WHERE shop_id = $1 AND etsy_listing_id IS NOT NULL
             AND coalesce(array_length(tags,1),0) <> ${TAGS_REQUIRED}`,
  },
  {
    key: "tag_len",
    label: "tag 20 karakteri aşıyor",
    severity: "medium",
    why: "Etsy 20 karakterden uzun tag'i reddeder.",
    sql: `SELECT id, slug, (SELECT string_agg(t, ', ') FROM unnest(tags) t WHERE length(t) > ${TAG_MAX}) AS detail
            FROM products
           WHERE shop_id = $1 AND EXISTS (SELECT 1 FROM unnest(tags) t WHERE length(t) > ${TAG_MAX})`,
  },
  {
    key: "no_images",
    label: "yayında ama görseli yok",
    severity: "high",
    why: "Görselsiz ilan satmaz ve Etsy'de gömülür.",
    sql: `SELECT id, slug, 'görsel yok' AS detail
            FROM products p
           WHERE shop_id = $1 AND etsy_listing_id IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM product_images i WHERE i.product_id = p.id)`,
  },
  {
    key: "ready_no_print",
    label: "hazır görünüyor ama baskı dosyası yok",
    severity: "high",
    why: "Sipariş geldiğinde üreticiye gönderecek dosya yok demektir.",
    sql: `SELECT id, slug, 'baskı dosyası yok' AS detail
            FROM products
           WHERE shop_id = $1 AND design_state = 'ready' AND print_file IS NULL`,
  },
  {
    key: "order_unsent",
    href: () => "/orders",
    label: "sipariş üreticiye gönderilmedi",
    severity: "high",
    why: "Ödenmiş sipariş bekliyor. Fiziksel adımların hiçbirini biz yapmadığımız için gecikme doğrudan yoruma yazılır — alıcı sormadan biz haber vermeliyiz.",
    sql: `SELECT id, coalesce(sku, receipt_id::text) AS slug,
                 'sipariş ' || to_char(ordered_at, 'DD.MM') || ' · ' ||
                 extract(day from now() - ordered_at)::int || ' gündür bekliyor' AS detail
            FROM fulfillment_orders
           WHERE shop_id = $1 AND status = 'new' AND is_paid
             AND ordered_at < now() - interval '24 hours'`,
  },
  {
    key: "order_untracked",
    href: () => "/orders",
    label: "üreticide ama takip numarası yok",
    severity: "medium",
    why: "Üretici üç günden uzun süredir kargo numarası vermedi; alıcı nerede olduğunu göremiyor.",
    sql: `SELECT id, coalesce(sku, receipt_id::text) AS slug,
                 extract(day from now() - ordered_at)::int || ' gün' AS detail
            FROM fulfillment_orders
           WHERE shop_id = $1 AND status = 'sent_to_producer' AND tracking_code IS NULL
             AND ordered_at < now() - interval '72 hours'`,
  },
  {
    key: "low_dpi",
    label: "baskı dosyası 300 PPI'ın altında",
    severity: "medium",
    why: "10 inçlik baskıda 3000 px gerekir; altı yumuşak basar.",
    sql: `SELECT id, slug, print_file_w || 'x' || print_file_h || ' px · ' ||
                 to_char(greatest(print_file_w, print_file_h) / 300.0, 'FM990.0') || ' inç' AS detail
            FROM products
           WHERE shop_id = $1 AND print_file IS NOT NULL
             AND greatest(print_file_w, print_file_h) < 2850`,
  },
];

export async function GET() {
  if (!(await isLoggedIn())) return new Response("unauthorized", { status: 401 });
  const shopId = await currentShopId();

  const results = await Promise.all(CHECKS.map(async (c) => {
    const rows = await q<any>(`${c.sql} ORDER BY 1 LIMIT 200`, [shopId]);
    return {
      key: c.key, label: c.label, severity: c.severity, why: c.why,
      count: rows.length,
      // Capped, and the cap is stated rather than silently truncating — a list that stops at 12 without
      // saying so reads as "that is all of them".
      products: rows.slice(0, 12).map((r) => ({
        id: Number(r.id), slug: r.slug, detail: r.detail,
        href: (c.href ?? ((id: number) => `/product/${id}`))(Number(r.id)),
      })),
    };
  }));

  const total = await q<any>(`SELECT count(*)::int n FROM products WHERE shop_id = $1`, [shopId]);
  return Response.json({
    products: total[0]?.n ?? 0,
    findings: results.filter((r) => r.count > 0).sort((a, b) =>
      (a.severity === b.severity ? b.count - a.count : a.severity === "high" ? -1 : 1)),
    clean: results.filter((r) => r.count === 0).map((r) => r.label),
  });
}
