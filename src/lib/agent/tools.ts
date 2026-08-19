/** Tool definitions + executors for the web agent. Every call is logged to events. */
import { pool, logEvent } from "../db";
import { etsyRaw } from "../etsy";
import { shopifyGql } from "../shopify";
import { printfulRaw } from "../printful";
import { draftProduct } from "./draft-product";

/**
 * Run the model's SQL confined to one shop.
 *
 * The tool takes free-form SQL, so no amount of prompting confines it — "filter by shop_id" is a
 * request, not a boundary, and one forgotten WHERE reads every tenant's catalogue. Two things make it
 * a boundary instead:
 *
 *   - `SET LOCAL ROLE klozio_agent` — the application connects as `postgres`, which is superuser and
 *     owner of every table, and row-level security is bypassed entirely for a superuser. Policies
 *     without this role switch would be decoration. The role also has no grant at all on etsy_tokens,
 *     hf_tokens or shops, so live OAuth tokens and every API key in the platform are unreachable.
 *   - `SET LOCAL app.shop_id` — the value the policies compare against. It is the shop the request is
 *     already authorised for, never anything the model chose.
 *
 * Both are LOCAL: they die with the transaction, so a leaked role cannot outlive one statement. If the
 * shop cannot be resolved the query is refused rather than run unconfined.
 */
async function agentQuery(sql: string, params?: any[]) {
  const { currentShopId, NO_SHOP } = await import("../shops");
  const shopId = await currentShopId();
  if (!shopId || shopId === NO_SHOP) {
    throw new Error("aktif magaza cozulemedi — sorgu calistirilmadi");
  }
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE klozio_agent");
    await client.query("SELECT set_config('app.shop_id', $1, true)", [String(shopId)]);
    const res = await client.query(sql, params);
    await client.query("COMMIT");
    return res;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    // The pool hands this connection to the next caller, which may be the publisher running as
    // postgres. RESET makes sure the restricted role does not travel with it.
    await client.query("RESET ROLE").catch(() => {});
    client.release();
  }
}

/** Run channel work under the ACTIVE shop's credentials.
 *
 * lib/etsy.ts reads its keys from the async-local shop context and falls back to the environment, which
 * is Klozio (shop 1). The agent's etsy and printful tools called straight through, so an operator working
 * on the second shop had their agent talking to the FIRST shop's Etsy account — the SQL side was confined
 * by row-level security while the API side was not.
 */
async function withShop<T>(fn: () => Promise<T>): Promise<T> {
  const { currentShopId, NO_SHOP } = await import("../shops");
  const { runWithShop } = await import("../shop-context");
  const shopId = await currentShopId();
  if (!shopId || shopId === NO_SHOP) throw new Error("aktif magaza cozulemedi — cagri yapilmadi");
  return runWithShop(shopId, fn);
}

/** Anthropic-hosted tools. They execute on Anthropic's side inside the same request — there is nothing to
 *  dispatch in execTool, and their results arrive as content blocks. Dynamic filtering runs code execution
 *  under the hood, which is why `code_execution` must NOT be declared alongside them: a second execution
 *  environment confuses the model. web_fetch only retrieves URLs already present in the conversation, so
 *  search is what puts them there — the pair is declared together or neither works. */
export const SERVER_TOOLS = [
  { type: "web_search_20260209", name: "web_search", max_uses: 8 },
  { type: "web_fetch_20260209", name: "web_fetch", max_uses: 5 },
];

export const TOOL_DEFS = [
  {
    name: "sql",
    description: "Run a SQL statement on the Klozio Postgres (single source of truth). Returns rows as JSON. Use SELECT to inspect before any write. Always use WHERE on UPDATE/DELETE.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "The SQL to execute" } },
      required: ["query"],
    },
  },
  {
    name: "produce",
    description: "TEK bir urunun tasarimini ve 7-9 ilan gorselini uretir (Higgsfield ~$0.03 + kompozit). "
      + "content_status='approved' ve design_prompt dolu olmali. Zaten gorseli olan urunu tekrar uretmez. "
      + "PAHALI VE YAVAS: bir cagri DAKIKALAR surer ve bu turu bloklar; tur basina en fazla 2 cagri kabul "
      + "edilir. SADECE tek bir urunu yeniden denemek icin kullan (ornek: design_state='error' olan bir "
      + "urun duzeltildikten sonra). TOPLU URETIM ICIN KULLANMA — onayli satirlari INSERT et, producer "
      + "dongusu 90 sn'de bir birini alir; ilerlemeyi 'production_status' ile bildir.",
    input_schema: {
      type: "object",
      properties: {
        product_id: { type: "number", description: "products.id" },
        stage: { type: "string", enum: ["artwork", "all"],
                 description: "artwork = tasarimi ve tek onizleme karesini uret, ONAY BEKLE (parti isinde ilk urun icin bunu kullan). all = tam set." },
      },
      required: ["product_id"],
    },
  },
  {
    name: "ask",
    description: "Operatore TIKLANABILIR secenekli kisa bir soru sor. Brief alirken kullan (DTF mi nakis mi, "
      + "konu ne, yazi olsun mu gibi). Soruyu sorduktan sonra TURU BITIR — cevap sonraki mesaj olarak gelir. "
      + "Ayni turda birden fazla soru sorma; tek soru, net secenekler.",
    input_schema: {
      type: "object",
      properties: {
        question: { type: "string" },
        options: { type: "array", items: { type: "string" }, description: "2-6 kisa secenek" },
        multi: { type: "boolean", description: "birden fazla secilebilir mi" },
        allow_other: { type: "boolean", description: "operator kendi cevabini yazabilir (varsayilan true)" },
      },
      required: ["question", "options"],
    },
  },
  {
    name: "production_status",
    description: "Uretim kuyrugunun durumu: design_state'e gore urun sayilari, kuyrukta bekleyen "
      + "(approved + design_prompt dolu + gorseli yok) urun sayisi ve tahmini bitis suresi, son hatalar "
      + "(redo_note ile). Uretmez, sadece okur ve ucretsizdir. Kullanici 'ne oldu / nerede kaldi / "
      + "hazir mi' diye sordugunda BUNU cagir; urun uretmeye kalkma.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "draft_product",
    description: "TEK bir urunu eksiksiz olarak olusturur (products satiri + istege bagli schedule). "
      + "Toplu istekte (\"5 tasarim uret\") HER URUN ICIN AYRI CAGIR — elle INSERT yazma, ham SQL ile "
      + "products'a INSERT reddedilir. Alanlarin hepsi dogrulanir ve biri eksikse satir HIC yazilmaz: "
      + "title 125-140, tam 13 cok-kelimeli tag, DTF'te hook zorunlu (hooksuz satiri uretim kuyrugu "
      + "almaz), design_prompt >=120 karakter ve icinde YAZI istegi olamaz, aciklamanin ustunde AI "
      + "beyani, fiyat anchor olarak 18-26 bandina denk gelmeli. Geri okur ve ne yazildigini dondurur. "
      + "schedule satiri her zaman 'pending' acilir — onayi operator verir.",
    input_schema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "'{hat}-c{n}-v1' (ornek: pet-c1-v1), kucuk harf ve tire" },
        niche: { type: "string", description: "alici kitlesi, birkac kelime" },
        technique: { type: "string", enum: ["dtf", "embroidery"], description: "varsayilan dtf" },
        title: { type: "string", description: "125-140 karakter, virgulle ayrilmis, ana anahtar kelime ilk 40 karakterde bolunmeden" },
        description: { type: "string", description: "ilk paragrafta AI beyani ZORUNLU" },
        tags: { type: "array", items: { type: "string" }, description: "tam 13, her biri <=20 karakter ve COK KELIMELI" },
        hook: { type: "string", description: "DTF'te tasarima dizilecek slogan (zorunlu, <=60 karakter). Tarif cumlesi degil." },
        design_prompt: { type: "string", description: "ne cizilecek: konu, kompozisyon, stil, palet, arka plan. Yazi/harf isteme." },
        design_model: { type: "string", description: "varsayilan gpt_image_2 (yedek yol okur; cizimi yerel Juggernaut yapar)" },
        price_cents: { type: "number", description: "ANCHOR fiyat; varsayilan 3570 = aliciya $24.99" },
        personalised: { type: "boolean" },
        hero_colorway: { type: "string", description: "kapak rengi, varsayilan Pepper" },
        scheduled_at: { type: "string", description: "ISO tarih-saat; verilirse 'pending' schedule satiri acilir" },
      },
      required: ["slug", "niche", "title", "description", "tags", "design_prompt"],
    },
  },
  {
    name: "update_product",
    description: "Bir urunun fiyatini/basligini/aciklamasini/etiketlerini degistirir ve CANLI ilana da yazar. "
      + "Fiyat Etsy'de ilanin uzerinde degil envanter tekliflerinde durur; bu arac dogru yere yazar ve "
      + "beden ek ucretlerini korur. Sadece verdigin alanlar degisir. Fiyat degisikligi para politikasina "
      + "tabidir: kullanici bu konusmada acikca istemediyse cagirma.",
    input_schema: {
      type: "object",
      properties: {
        product_id: { type: "number", description: "products.id" },
        price_cents: { type: "number", description: "yeni cikis fiyati, kurus (ornek 2999 = $29.99)" },
        // The band is in the schema because it is enforced: a title under 125 throws before anything is
        // written, and the model had no way to learn that except by failing the call.
        title: { type: "string", description: "125-140 karakter (140 Etsy'nin siniri, 125 calisma bandinin alt ucu) — daha kisasi reddedilir" },
        description: { type: "string" },
        tags: { type: "array", items: { type: "string" }, description: "en fazla 13, her biri <=20 karakter" },
      },
      required: ["product_id"],
    },
  },
  {
    name: "read_file",
    description: "dashboard/ altindaki dosya ve klasorleri oku: kod, scriptler, agent mantigi ve agent-knowledge/ altindaki skill dokumanlari (INDEX.md ile basla). Depo kokundeki CLAUDE.md ve .claude/skills/ erisimin disinda; agent-knowledge onlarin ulasabildigin kopyasi. "
      + "Bir seyin NASIL calistigini merak ediyorsan tahmin etme, kaynagi oku. Klasor verirsen icerigini listeler. "
      + "Gizli dosyalar (.env, anahtarlar) reddedilir.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "repo koku goreli, orn 'scripts/batch_runner.py' ya da 'scripts'" },
        offset: { type: "number", description: "bu satirdan basla (1'den). Buyuk dosyayi parca parca oku." },
        limit: { type: "number", description: "kac satir (varsayilan 400)" },
      },
      required: ["path"],
    },
  },
  {
    name: "run_script",
    description: "scripts/ altindaki bir Python scriptini calistir ve ciktisini al. Denetim, olcum, toplu "
      + "duzeltme, yeniden adlandirma — bu projenin isi bu scriptlerle yapilir. Ornekler: "
      + "audit_pipeline.py (tam katalog denetimi), fit_titles.py (kuru calisma; --apply ile yazar), "
      + "upscale_print_files.py --limit 5, clean_print_files.py. "
      + "180 sn siniri var: uzun isleri --limit ile parcala. produce_product.py YASAK — onun icin 'produce' kullan. "
      + "KOD DEGISTIREMEZSIN: dosya yazma araci yok ve keyfi python calistiramazsin.",
    input_schema: {
      type: "object",
      properties: {
        script: { type: "string", description: "orn 'audit_pipeline.py'" },
        args: { type: "array", items: { type: "string" }, description: "orn ['--limit','5']" },
      },
      required: ["script"],
    },
  },
  {
    name: "look",
    description: "URUNE BAK. Uretilen kapak/detay/model karesini ya da baski dosyasini GORSEL olarak dondurur; "
      + "gozunle degerlendirmen gereken her seyde kullan (tasarim iyi mi, arka plan temiz mi, yazi okunuyor mu). "
      + "Baski dosyasi HAM DONMEZ: zemini seffaf oldugu icin kumas renginin uzerine dusurulup verilir — ham "
      + "RGBA'ya bakmak bu projede uc kez yanlis teshis verdirdi. 'on' ile baska bir kumas rengi isteyebilirsin.",
    input_schema: {
      type: "object",
      properties: {
        product_id: { type: "number" },
        what: { type: "string", enum: ["cover", "detail", "model", "print", "emb_render"],
                description: "varsayilan cover. print = baskiya giden dosya." },
        on: { type: "string", description: "Ivory | Pepper | Black | White | Bay | Moss (sadece print icin)" },
      },
      required: ["product_id"],
    },
  },
  {
    name: "measure",
    description: "URUNU OLC. Saklanan baski dosyasindan hesaplanir, kolondan okunmaz: cozunurluk ve 300 PPI'da "
      + "kac inc, opak oran, KENAR TEMASI (kirpilma), kalan anahtar renk pikseli, soluk arka plaka orani, her "
      + "kumas rengine karsi kontrast ve hero'nun okunur olup olmadigi, bir de alicinin ODEDIGI fiyattan marj. "
      + "'Temiz mi' sorusuna cevap vermeden once bunu cagir — hattin bastigi sayiyi aktarmak olcum degildir.",
    input_schema: {
      type: "object",
      properties: { product_id: { type: "number" } },
      required: ["product_id"],
    },
  },
  {
    name: "etsy",
    description: "Authenticated Etsy v3 API call. path is relative to /v3/application (e.g. /listings/123 or /shops/{shop_id}/listings). Body only for POST/PUT/PATCH.",
    input_schema: {
      type: "object",
      properties: {
        method: { type: "string", enum: ["GET", "POST", "PUT", "PATCH", "DELETE"] },
        path: { type: "string" },
        body: { type: "object" },
      },
      required: ["method", "path"],
    },
  },
  {
    name: "shopify",
    description: "Shopify Admin GraphQL (2026-07) against zzsvpu-dx.myshopify.com. Provide the query and optional variables.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string" }, variables: { type: "object" } },
      required: ["query"],
    },
  },
  {
    name: "printful",
    description: "Printful API call, store-scoped (embroidery fulfillment). path e.g. /orders or /orders/123. NOTE: /orders/{id}/confirm CHARGES MONEY — only on explicit user request.",
    input_schema: {
      type: "object",
      properties: {
        method: { type: "string", enum: ["GET", "POST", "DELETE"] },
        path: { type: "string" },
        body: { type: "object" },
      },
      required: ["method", "path"],
    },
  },
] as const;

const clip = (s: string, n = 12000) => (s.length > n ? s.slice(0, n) + `\n…[${s.length - n} chars clipped]` : s);

/** Run one of the measurement scripts and return its single JSON line. Same spawn pattern as produce:
 *  the Python side owns the image maths, and duplicating it in TS is how two answers start disagreeing. */
async function runScript(script: string, args: string[]): Promise<any> {
  const { spawn } = await import("child_process");
  const { join } = await import("path");
  return new Promise((resolve) => {
    const child = spawn("python3", [join(process.cwd(), "scripts", script), ...args],
                        { env: process.env, cwd: process.cwd() });
    let out = "", err = "";
    // A hung script here blocked the turn until the 800s request ceiling killed the whole thing, which
    // also discards the transcript persist in the loop's finally. workspace.ts has had this guard from
    // the start; these two spawns did not.
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      child.kill("SIGKILL");
      resolve({ error: `${script} 180sn icinde bitmedi, durduruldu` });
    }, 180_000);
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    child.on("error", (e) => {
      if (done) return;
      done = true; clearTimeout(timer);
      resolve({ error: String(e?.message ?? e) });
    });
    child.on("close", () => {
      if (done) return;
      done = true; clearTimeout(timer);
      const line = out.trim().split("\n").filter(Boolean).pop() ?? "";
      try { resolve(JSON.parse(line)); }
      catch { resolve({ error: (err || out || "cikti okunamadi").slice(0, 300) }); }
    });
  });
}

/** Calls refused at the tool layer, not in the prompt.
 *
 * workspace.ts argues that a rule living only in the prompt stops being a rule the moment a tool permits
 * the thing — and then these three tools were left as raw pass-throughs with delete, publish and a paid
 * confirm one call away. The line drawn here is REVERSIBILITY: what can be undone stays behind the prompt
 * rules, what cannot is refused. Creating a draft is recoverable; deleting a listing, charging a card, and
 * dropping rows are not.
 */
/** The query with comments and string literals removed, lowercased.
 *
 *  Every guard below used to test the raw string, which meant a leading comment, a CTE, a schema prefix or
 *  a quoted literal walked past all of them — and the WHERE clause counted as part of the SET clause, so
 *  legitimate updates filtering on a protected column were refused while the real writes got through.
 *
 *  This is a single left-to-right pass, NOT a chain of .replace() calls. The chained version stripped
 *  comments before string literals, so a `--` or a `/*` INSIDE a quoted string deleted the rest of the
 *  query from the guard's view while Postgres still ran every character of it:
 *
 *      select 1 where 'a--'='a--'; delete from products where 1=1   -> guard saw "select 1 where 'a"
 *
 *  Both the multi-statement check and the DELETE check passed that, and node-pg's simple protocol runs
 *  both statements. Order of operations is the whole defence: a tokenizer consumes whichever construct
 *  opens first, so nothing can hide inside anything else.
 */
function tokeniseSql(raw: string): { text: string; unterminated: boolean } {
  const s = String(raw ?? "");
  let out = "";
  let i = 0;
  let unterminated = false;
  while (i < s.length) {
    const two = s.slice(i, i + 2);
    if (two === "--") {                                   // line comment
      const nl = s.indexOf("\n", i);
      i = nl === -1 ? s.length : nl + 1;
      out += " ";
      continue;
    }
    if (two === "/*") {                                   // block comment; Postgres nests them
      let depth = 1;
      i += 2;
      while (i < s.length && depth > 0) {
        if (s.slice(i, i + 2) === "/*") { depth++; i += 2; }
        else if (s.slice(i, i + 2) === "*/") { depth--; i += 2; }
        else i++;
      }
      if (depth > 0) unterminated = true;
      out += " ";
      continue;
    }
    const c = s[i];
    if (c === "'") {                                      // string literal, '' is an escaped quote
      i++;
      let closed = false;
      while (i < s.length) {
        if (s[i] === "'") {
          if (s[i + 1] === "'") { i += 2; continue; }
          i++; closed = true; break;
        }
        i++;
      }
      if (!closed) unterminated = true;
      out += "''";
      continue;
    }
    if (c === '"') {                                      // quoted identifier -> bare, so "products" hits
      i++;
      let id = "";
      let closed = false;
      while (i < s.length) {
        if (s[i] === '"') {
          if (s[i + 1] === '"') { id += '"'; i += 2; continue; }
          i++; closed = true; break;
        }
        id += s[i]; i++;
      }
      if (!closed) unterminated = true;
      out += id;
      continue;
    }
    if (c === "$") {                                      // dollar quoting: $$x$$ / $tag$x$tag$
      const m = /^\$([A-Za-z_]\w*)?\$/.exec(s.slice(i));   // $1 placeholders do not match and fall through
      if (m) {
        const tag = m[0];
        const end = s.indexOf(tag, i + tag.length);
        if (end === -1) { unterminated = true; i = s.length; }
        else i = end + tag.length;
        out += "''";
        continue;
      }
    }
    out += c;
    i++;
  }
  return { text: out.replace(/\s+/g, " ").trim().toLowerCase(), unterminated };
}

function normaliseSql(raw: string): string {
  return tokeniseSql(raw).text;
}

/** Does this string carry more than one statement? node-pg's simple protocol runs them all in one call,
 *  which turned "select 1; delete from products" into a total bypass of the checks below — verified
 *  against the live database, including with an empty values array, which does NOT force one statement. */
function isMultiStatement(sql: string): boolean {
  const body = normaliseSql(sql).replace(/;\s*$/, "");
  return body.includes(";");
}

/** The SET clause only — everything between SET and the first WHERE/RETURNING/FROM at depth zero. */
function setClause(sql: string): string {
  const m = /\bset\b(.*)$/.exec(sql);
  if (!m) return "";
  return m[1].split(/\bwhere\b|\breturning\b|\bfrom\b/)[0];
}

function refuseIrreversible(name: string, input: any): string | null {
  const method = String(input?.method ?? "").toUpperCase();
  const path = String(input?.path ?? "");
  if (name === "etsy" && method === "DELETE") {
    return "ERROR: Etsy'de silme bu araçla yapılamaz — geri alınamaz. Ne silineceğini operatöre yaz ve onay iste.";
  }
  if (name === "printful" && method === "POST" && /\/confirm\b/.test(path)) {
    return "ERROR: Printful confirm PARA ÇEKER ve geri alınamaz. Operatörün açık talebi olmadan çağrılamaz.";
  }
  if (name === "shopify" && /\bmutation\b/i.test(String(input?.query ?? ""))
      // Shopify mutation names are camelCase — productDelete, collectionDelete,
      // productVariantsBulkDelete — so a \bdelete\b word boundary matched none of them and blocked only
      // the one spelling that is not a real mutation. Tested against the raw document it then went the
      // other way and refused legitimate writes: a $removeTags variable, a metafield key "remove_bg", and
      // a description reading "Remove before washing" each blocked the whole mutation. Strings and
      // variable names are not field names, so they come out first; what is left is the query itself.
      && /(delete|destroy|remove)/i
        .test(String(input?.query ?? "").replace(/"""[\s\S]*?"""|"(?:[^"\\]|\\.)*"/g, '""')
                                        .replace(/\$\w+/g, "$v"))) {
    return "ERROR: Shopify silme/kaldirma mutasyonu bu araçla yapılamaz — geri alınamaz. Operatöre sor.";
  }
  if (name === "printful" && method === "DELETE") {
    return "ERROR: Printful'da silme geri alınamaz — operatöre sor.";
  }
  // The general tool was beating the specific ones: across 306 logged calls the agent reached for raw sql
  // 88% of the time and used update_product exactly never — so every safety rule built into that tool (the
  // Etsy price living in inventory offerings rather than on the listing, the tag and title limits, the
  // read-back) never applied. Writing prompt rules did not change it. Refuse the four columns that tool
  // owns; everything else in the schema is still fair game for raw sql.
  // An unterminated quote or block comment means the tokenizer lost the query, and a guard reading a
  // half-parsed string is worse than no guard: it reports safe. Refuse rather than guess.
  if (name === "sql" && tokeniseSql(String(input?.query ?? "")).unterminated) {
    return "ERROR: SQL'de kapanmamis tirnak ya da /* yorumu var — sorgu ayristirilamadi, guvenlik "
      + "kontrolleri calistirilamaz. Tirnaklari kapat ve tekrar gonder.";
  }
  if (name === "sql" && isMultiStatement(String(input?.query ?? ""))) {
    return "ERROR: tek cagrida tek SQL ifadesi. Birden fazla ifade tek seferde calisir ve guvenlik "
      + "kontrollerini atlar; ifadeleri ayri cagrilara bol.";
  }
  const q = name === "sql" ? normaliseSql(String(input?.query ?? "")) : "";
  const set = name === "sql" ? setClause(q) : "";
  if (name === "sql"
      // Any schema, not just public: `update klozio.products set title=…` walked past a (public\.)? test.
      && /\bupdate\s+(only\s+)?(\w+\.)?products\b/.test(q)
      // Two spellings of the same write. `SET (title, description) = (…)` is valid Postgres and never puts
      // a protected column directly before an `=`, so the single-column test alone missed it entirely.
      && (/\b(price_cents|title|description|tags)\s*=/.test(set)
          || /\(\s*[^)]*\b(price_cents|title|description|tags)\b[^)]*\)\s*=/.test(set))) {
    return "ERROR: products.price_cents / title / description / tags ham SQL ile degistirilemez — "
      + "update_product aracini kullan. Sebebi: Etsy fiyati ilanin uzerinde degil ENVANTER TEKLIFLERINDE "
      + "duruyor, yani sadece satiri guncellersen bizim kayit yeni fiyati der, alici eskisini oder ve bu "
      + "ilk yanlis siparise kadar gorunmez. update_product ayrica basligi/tag'i limitlere gore dogrular "
      + "ve yazdiktan sonra ilani geri okur.";
  }
  // Same lesson as the price/title guard above, learned the same way: the general tool beat the
  // specific one. A hand-written INSERT carrying a dozen columns fails PARTIALLY and silently — five
  // rows went in on 2026-08-19 with title, tags and price filled and design_prompt, hook and
  // design_model empty, looking finished at content_status='approved'. draft_product refuses such a
  // row outright and says which field is wrong, which raw SQL cannot do.
  if (name === "sql" && /\binsert\s+into\s+(only\s+)?(\w+\.)?products\b/.test(q)) {
    return "ERROR: products'a ham SQL ile INSERT yapilamaz — draft_product aracini kullan, her urun icin "
      + "bir cagri. Sebebi: elle yazilan cok kolonlu INSERT kismen basarili olur, design_prompt/hook/"
      + "design_model bos kalir ve satir 'approved' gorunur ama uretim kuyrugu onu hic almaz. "
      + "draft_product eksik alani soyler ve satiri hic yazmaz.";
  }
  // `drop\s+(table|column)` was narrower than the anchored /^(delete|truncate|drop)/ it replaced: drop
  // index, view, schema, database and function all became reachable while the change was being sold as a
  // fix. `drop <word>` covers every object type there will ever be; a column literally named "drop" is not
  // a risk this schema has.
  if (name === "sql" && /(^|\s|\()(delete\s+from|truncate|drop\s+\w+|alter\s+table)\b/.test(q)) {
    return "ERROR: DELETE/TRUNCATE/DROP bu araçla yapılamaz. Bir satırı kaldırmak yerine durumunu değiştir "
      + "(content_status='draft' gibi); gerçekten silinmesi gerekiyorsa neyin ve neden silineceğini yaz, "
      + "operatör çalıştırsın. Yanlış ürünün iptal edildiği olay tam olarak buydu.";
  }
  return null;
}

export async function execTool(name: string, input: any):
  Promise<{ result: string; summary: string; blocks?: any[] }> {
  try {
    const refusal = refuseIrreversible(name, input);
    if (refusal) {
      await logEvent("agent_tool", { detail: `REDDEDILDI ${name}: ${refusal.slice(0, 90)}` });
      return { result: refusal, summary: `${name} ▸ reddedildi (geri alinamaz)` };
    }
    if (name === "sql") {
      const q = String(input.query ?? "");
      const res = await agentQuery(q);
      const rows = (res.rows ?? []).slice(0, 200);
      await logEvent("agent_tool", { detail: `sql: ${q.slice(0, 180)}` });
      const summary = `sql ▸ ${res.command ?? "OK"} ${res.rowCount ?? rows.length}`;
      return { result: clip(JSON.stringify({ command: res.command, rowCount: res.rowCount, rows })), summary };
    }
    if (name === "produce") {
      // Same entrypoint the scheduler uses. The agent gets no private path to image building: one
      // implementation, or the version nobody tested is the one customers see.
      const pid = Number(input.product_id);
      const stage = input.stage === "artwork" ? "artwork" : "all";
      const { produceOne } = await import("../producer");
      const out = await produceOne(pid, stage);
      await logEvent("agent_tool", { detail: `produce ${pid}: ${out.ok ? "ok" : out.out.slice(0, 120)}` });
      return { result: clip(JSON.stringify(out)), summary: `produce ▸ ${pid} ${out.ok ? "ok" : "hata"}` };
    }
    if (name === "read_file") {
      const { readRepoFile } = await import("./workspace");
      const rel = String(input.path ?? "");
      const r = await readRepoFile(rel, Number(input.offset) || 0, Number(input.limit) || 0);
      await logEvent("agent_tool", { detail: `read_file ${rel}` });
      // Source files run well past the 12k default clip, and a file cut to a third silently answers the
      // wrong question. Reads get their own, larger ceiling; offset/limit is how the rest is reached.
      return { result: clip(r.text, 45_000), summary: `read_file ▸ ${rel}${r.ok ? "" : " (red)"}` };
    }
    if (name === "run_script") {
      const { runRepoScript } = await import("./workspace");
      const script = String(input.script ?? "");
      const args = Array.isArray(input.args) ? input.args.map(String) : [];
      const r = await runRepoScript(script, args);
      await logEvent("agent_tool", { detail: `run_script ${script} ${args.join(" ")}`.slice(0, 180) });
      return { result: clip(r.text, 30_000), summary: `run_script ▸ ${script} ${r.ok ? "ok" : "hata"}` };
    }
    if (name === "look") {
      const pid = Number(input.product_id);
      const what = String(input.what ?? "cover");
      const args = [String(pid), what, ...(input.on ? ["--on", String(input.on)] : [])];
      const r = await runScript("look_product.py", args);
      if (r?.error || !r?.data) {
        return { result: `ERROR: ${r?.error ?? "gorsel alinamadi"}`, summary: `look ▸ ${pid} hata` };
      }
      await logEvent("agent_tool", { detail: `look ${pid} ${what}` });
      // The image travels as a real content block. Returning a description instead would be the same
      // blindness this tool exists to end.
      return {
        result: `${r.slug} · ${what} · ${r.px?.[0]}x${r.px?.[1]}. ${r.note ?? ""}`,
        summary: `look ▸ ${r.slug} ${what}`,
        blocks: [
          { type: "image", source: { type: "base64", media_type: r.media_type, data: r.data } },
          { type: "text", text: `${r.slug} · ${what}. ${r.note ?? ""}` },
        ],
      };
    }
    if (name === "measure") {
      const pid = Number(input.product_id);
      const r = await runScript("measure_product.py", [String(pid)]);
      await logEvent("agent_tool", { detail: `measure ${pid}` });
      const pf = r?.print_file;
      const summary = pf
        ? `measure ▸ ${r.slug} ${pf.px?.[0]}px · kenar %${pf.edge_contact_pct} · kalan ${pf.leftover_key_px}`
        : `measure ▸ ${r?.slug ?? pid}`;
      return { result: clip(JSON.stringify(r)), summary };
    }
    if (name === "production_status") {
      const out = await productionStatus();
      return {
        result: clip(JSON.stringify(out)),
        summary: `durum ▸ ${out.queued} kuyrukta · ${out.by_state.ready ?? 0} hazir · ${out.by_state.error ?? 0} hata`,
      };
    }
    if (name === "ask") {
      // The question itself is the side effect: the loop turns this call into an `ask` event and the UI
      // renders the options as buttons. Nothing is stored, and the answer arrives as the operator's next
      // message — so the only useful thing to tell the model is to stop talking and wait.
      const q = String(input.question ?? "").trim();
      const opts = (Array.isArray(input.options) ? input.options : []).map((o: any) => String(o)).filter(Boolean);
      if (!q || opts.length < 2) {
        return { result: "ERROR: question ve en az 2 option gerekli", summary: "ask ▸ gecersiz" };
      }
      return {
        result: "Soru operatore secenekleriyle gosterildi. TURU BITIR ve cevabi bekle — cevap bir sonraki "
          + "kullanici mesaji olarak gelecek. Tekrar sorma, tahmin etme.",
        summary: `soru ▸ ${q.slice(0, 40)}`,
      };
    }
    if (name === "draft_product") {
      const { currentShopId } = await import("../shops");
      const shopId = await currentShopId();
      const out = await draftProduct(input, shopId);
      await logEvent("agent_tool", { productId: out.id, detail: `draft_product: ${out.slug}` });
      return { result: clip(JSON.stringify(out)), summary: `taslak ▸ ${out.slug} (${out.id})` };
    }
    if (name === "update_product") {
      const out = await updateProduct(input);
      await logEvent("agent_tool", { productId: Number(input.product_id), detail: `update_product: ${out.changed.join(", ") || "degisiklik yok"}` });
      return { result: clip(JSON.stringify(out)), summary: `update ▸ ${input.product_id} ${out.changed.join("+") || "-"}` };
    }
    if (name === "etsy") {
      const out = await withShop(() => etsyRaw(input.method, input.path, input.body));
      await logEvent("agent_tool", { detail: `etsy ${input.method} ${input.path}` });
      return { result: clip(JSON.stringify(out)), summary: `etsy ▸ ${input.method} ${input.path}` };
    }
    if (name === "shopify") {
      const out = await withShop(() => shopifyGql(input.query, input.variables ?? {}));
      await logEvent("agent_tool", { detail: `shopify gql: ${String(input.query).slice(0, 140)}` });
      return { result: clip(JSON.stringify(out)), summary: "shopify ▸ gql" };
    }
    if (name === "printful") {
      const out = await withShop(() => printfulRaw(input.method, input.path, input.body));
      await logEvent("agent_tool", { detail: `printful ${input.method} ${input.path}` });
      return { result: clip(JSON.stringify(out)), summary: `printful ▸ ${input.method} ${input.path}` };
    }
    return { result: `unknown tool ${name}`, summary: `? ${name}` };
  } catch (e: any) {
    const msg = String(e?.message ?? e).slice(0, 1200);
    return { result: `ERROR: ${msg}${advice(name, e)}`, summary: `${name} ▸ HATA` };
  }
}

/** What the production queue is doing, without producing anything.
 *
 * The agent had no way to answer "what happened, where did it get to" other than by running `produce`
 * again — which costs minutes per product and blocks the turn. Asked for fifty designs it did exactly
 * that and the request died. This reads the same rows the producer claims, so the answer describes the
 * real queue rather than the agent's memory of what it inserted.
 *
 * The queue predicate is copied from producer.claim() and must stay identical to it: a status page that
 * counts a different set from the one the worker drains is worse than no status page.
 */
async function productionStatus(): Promise<{
  producer_enabled: boolean; warning?: string;
  by_state: Record<string, number>; queued: number; generating: number;
  interval_seconds: number; eta_minutes: number | null; recent_errors: any[];
  blocked_no_design_model?: any[]; blocked_warning?: string;
  wordless_no_hook?: any[]; wordless_warning?: string;
  prose_hook_dtf?: any[]; prose_hook_warning?: string;
}> {
  const states = await agentQuery(
    `SELECT COALESCE(design_state, 'none') AS state, count(*)::int AS n
       FROM products GROUP BY 1 ORDER BY 1`);
  const by_state: Record<string, number> = {};
  for (const r of states.rows ?? []) by_state[r.state] = r.n;

  const queued = await agentQuery(
    `SELECT count(*)::int AS n FROM products p
      WHERE p.content_status = 'approved'
        AND (p.design_state IS NULL OR p.design_state = 'redo')
        AND p.design_prompt IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM product_images g WHERE g.product_id = p.id)`);

  const errors = await agentQuery(
    `SELECT id, slug, left(redo_note, 240) AS redo_note, updated_at
       FROM products WHERE design_state = 'error' ORDER BY updated_at DESC LIMIT 10`);

  // Rows that look queued but can never produce. The queue claims on design_prompt alone, so a row with
  // no design_model is picked up, hands a null model to the image tool, fails validation twice and parks
  // as 'error'. Measured: of the products with a null design_model, none has ever reached 'ready'. Report
  // them apart from the queue — a count that includes them is a promise the queue cannot keep.
  const blocked = await agentQuery(
    `SELECT id, slug FROM products
      WHERE content_status = 'approved' AND design_prompt IS NOT NULL AND design_model IS NULL
      ORDER BY id LIMIT 20`);

  // Rows that will produce, but weakly. An empty hook makes the producer skip two steps in silence: the
  // slogan is never typeset onto the artwork, and the measured garment pick never runs either — it lives
  // inside set_type, after the hook check. The row still reaches 'ready', so nothing surfaces this except
  // looking at the finished product. Reported apart from `blocked`: these are a quality warning, not a
  // failure, and conflating the two would make a wordless product look like a broken one.
  //
  // Embroidery is excluded, not overlooked: produce_product.py never calls set_type for it, so an empty
  // hook changes nothing there. Warning about it would be noise on 37 products that are correct.
  const wordless = await agentQuery(
    `SELECT id, slug FROM products
      WHERE content_status = 'approved' AND design_prompt IS NOT NULL
        AND technique <> 'embroidery'
        AND COALESCE(hook, '') = ''
        AND (design_state IS NULL OR design_state IN ('redo', 'generating'))
      ORDER BY id LIMIT 20`);

  // The opposite mistake, and the more expensive one: a DTF hook written as a descriptive sentence
  // instead of a slogan. set_type lays the hook onto the artwork verbatim, so re-producing one of these
  // prints a whole sentence on the shirt. Currently latent — all 14 such products came out of the old
  // pipeline, which never typeset anything — which is exactly why it needs surfacing: the danger only
  // appears the moment someone redoes a row that has looked fine for weeks. Two of them are live on Etsy.
  // The heuristic is deliberately loose (sentence-style opener, prose punctuation, or simply long); a
  // false positive costs one question, a false negative costs a misprinted garment.
  const proseHook = await agentQuery(
    `SELECT id, slug, left(hook, 80) AS hook, design_state, etsy_listing_id IS NOT NULL AS live
       FROM products
      WHERE technique <> 'embroidery' AND COALESCE(hook, '') <> ''
        AND (hook ~ '^(A|An|The|That|Your)\\s+[a-z]' OR length(hook) > 60 OR hook ~ '[,;:]\\s+[a-z]')
      ORDER BY id LIMIT 20`);

  const n = queued.rows?.[0]?.n ?? 0;
  // The ticker takes one product per pass, so the queue drains at the tick interval — not in parallel.
  const intervalSeconds = Number(process.env.PRODUCER_INTERVAL_MS || 90000) / 1000;
  // Whether anything will actually drain the queue. The agent is told to insert approved rows and let
  // the ticker produce them, so if the ticker is off that instruction becomes a promise nothing keeps —
  // rows pile up and the operator is told work is under way. Report the flag and let the agent say so.
  const producerEnabled = process.env.ENABLE_PRODUCER !== "false";
  return {
    producer_enabled: producerEnabled,
    ...(producerEnabled ? {} : {
      warning: "URETIM TICKER'I KAPALI (ENABLE_PRODUCER=false): kuyruk kendiliginden bosalmaz. "
        + "Kullaniciya bunu ACIKCA soyle — satirlari yazdiysan bile uretim baslamayacak.",
    }),
    by_state,
    queued: n,
    generating: by_state.generating ?? 0,
    interval_seconds: intervalSeconds,
    eta_minutes: n ? Math.ceil((n * intervalSeconds) / 60) : null,
    recent_errors: errors.rows ?? [],
    ...((blocked.rows ?? []).length ? {
      blocked_no_design_model: blocked.rows,
      // This used to tell the agent to write 'nano_banana_pro' — the one model the prompt forbids, for a
      // measured reason (a pale sticker plate over half the canvas). 179 of 296 rows carry that value, and
      // since design_model is what the Etsy AI-disclosure archive cites as proof of authorship, the archive
      // names a model that did not draw the file. produce_product.py hardcodes gpt_image_2 regardless.
      blocked_warning: "Bu satirlarda design_model BOS: kuyruk onlari alir ama uretim 'Invalid input at "
        + "params' ile patlar. UPDATE products SET design_model='gpt_image_2' ile duzelt (uretim zaten "
        + "bunu kullaniyor; nano_banana_pro YAZMA — solgun sticker plakasi uretiyor ve arsivde yanlis "
        + "model kaydi birakir), sonra design_state=NULL yaparak kuyruga geri koy. Kullaniciya bunlarin "
        + "uretilmeyecegini soyle.",
    } : {}),
    ...((wordless.rows ?? []).length ? {
      wordless_no_hook: wordless.rows,
      wordless_warning: "Bu satirlarda hook BOS: uretilirler ama slogan tasarima DIZILMEZ ve olculmus "
        + "kumaş secimi hic kosmaz (pick_garment set_type'in icinde). Hata vermezler, 'ready' olurlar, "
        + "sadece zayif cikarlar. Uretime girmeden once UPDATE products SET hook='...' ile duzelt.",
    } : {}),
    ...((proseHook.rows ?? []).length ? {
      prose_hook_dtf: proseHook.rows,
      prose_hook_warning: "Bu DTF satirlarinda hook bir SLOGAN degil TARIF cumlesi. set_type hook'u "
        + "tisorte OLDUGU GIBI dizer, yani bunlardan biri redo edilirse tisortte o cumle basilir. "
        + "Bugun zararsizlar cunku hepsi yazi dizmeyen eski yoldan uretildi. BIRINI YENIDEN URETMEDEN "
        + "ONCE hook'u kisa bir slogana cevir; 'live=true' olanlar Etsy'de aktif, onlarda operatore sor.",
    } : {}),
  };
}

/** Change a product's price or copy in one place, and carry it to the live listing.
 *
 * The agent could already run `UPDATE products SET price_cents=...` — and that is exactly the problem:
 * on Etsy the price lives in the inventory offerings, not on the listing, so our row would say $24.99
 * while every buyer still paid the old price. Nobody would notice until a sale came in at the wrong
 * amount. Same for the copy: a title in our database that never reached Etsy is a lie we tell ourselves.
 *
 * So the write is one operation: validate against the platform's limits BEFORE touching anything, write
 * the row, push to the channel, then read the listing back and compare. Size upcharges survive because
 * this calls the same updateInventory the publisher uses rather than a second copy of the price maths.
 */
async function updateProduct(input: any): Promise<{
  product_id: number; changed: string[]; etsy: string; verified: any; note?: string;
}> {
  const pid = Number(input.product_id);
  if (!Number.isFinite(pid)) throw new Error("product_id gecersiz");

  const cur = await agentQuery(
    `SELECT id, slug, title, description, tags, price_cents, etsy_listing_id, etsy_state,
            colorways, sizes, quantity
       FROM products WHERE id = $1`, [pid]);
  const p = cur.rows?.[0];
  // RLS makes an out-of-shop product indistinguishable from a missing one, which is the point.
  if (!p) throw new Error(`urun ${pid} bu magazada bulunamadi`);

  // Placeholders, not string building: the values come from the model, and hand-escaping a title with an
  // apostrophe in it is exactly the kind of thing that works until it does not.
  const sets: string[] = [];
  const vals: any[] = [];
  const changed: string[] = [];
  // What the row held before this call. The channel write happens after the row write and can fail, and a
  // half-applied edit is the exact drift this tool exists to prevent — our row saying $24.99 while every
  // buyer still pays the old price. Holding a DB transaction open across an HTTP call would be worse, so
  // the previous values are kept and put back instead.
  const prevCols: string[] = [];
  const prevVals: any[] = [];
  const put = (col: string, v: any) => {
    vals.push(v); sets.push(`${col}=$${vals.length}`);
    prevCols.push(col); prevVals.push((p as any)[col]);
  };

  if (input.price_cents !== undefined) {
    const cents = Math.round(Number(input.price_cents));
    if (!Number.isFinite(cents) || cents < 300 || cents > 50000) {
      throw new Error(`price_cents ${input.price_cents} makul aralikta degil (300-50000 kurus)`);
    }
    if (cents !== p.price_cents) { put("price_cents", cents); changed.push("price"); }
  }
  if (input.title !== undefined) {
    const t = String(input.title).trim();
    // Etsy rejects over 140 and the copy playbook wants 125-140; refusing here beats a 400 mid-write.
    // The validator accepted 10-140 while its own error text quoted 125-140, so it enforced neither. The
    // operating band is 125-140 (operator decision 2026-08-14); 140 is Etsy's hard limit.
    if (t.length > 140) throw new Error(`title ${t.length} karakter — Etsy siniri 140`);
    if (t.length < 125) throw new Error(`title ${t.length} karakter — calisma bandi 125-140, cok kisa. `
      + `Anahtar kelime obegi ekle; kirpma degil yazma isi.`);
    if (t !== p.title) { put("title", t); changed.push("title"); }
  }
  if (input.description !== undefined) {
    const d = String(input.description);
    if (d.trim().length < 40) throw new Error("description cok kisa (>=40 karakter)");
    put("description", d); changed.push("description");
  }
  if (input.tags !== undefined) {
    const tags = (Array.isArray(input.tags) ? input.tags : []).map((s: any) => String(s).trim()).filter(Boolean);
    if (!tags.length || tags.length > 13) throw new Error(`tags ${tags.length} adet — Etsy en fazla 13 kabul eder`);
    const tooLong = tags.filter((t: string) => t.length > 20);
    if (tooLong.length) throw new Error(`Etsy etiketi 20 karakteri gecemez: ${tooLong.join(", ")}`);
    put("tags", tags); changed.push("tags");
  }
  if (!sets.length) {
    return { product_id: pid, changed: [], etsy: "atlandi", verified: null, note: "istenen degerler zaten boyle" };
  }

  vals.push(pid);
  await agentQuery(`UPDATE products SET ${sets.join(", ")}, updated_at=now() WHERE id = $${vals.length}`, vals);

  if (!p.etsy_listing_id) {
    return { product_id: pid, changed, etsy: "ilan yok — yayinlanınca bu degerlerle gider", verified: null };
  }

  const listingId = Number(p.etsy_listing_id);
  const { updateListingFields, updateInventory, getListing } = await import("../etsy");
  const { shopCtx, hasEtsy } = await import("../shop-context");

  /** Put the row back the way it was, then say what happened. Reporting a failure while leaving the row
   *  changed is worse than either outcome alone: the operator reads "failed" and the database disagrees. */
  let sentFields = false;   // did the listing already take the title/description/tags write?
  const revert = async (why: string): Promise<never> => {
    try {
      const rv: any[] = [];
      const rs = prevCols.map((c, i) => { rv.push(prevVals[i]); return `${c}=$${rv.length}`; });
      rv.push(pid);
      await agentQuery(`UPDATE products SET ${rs.join(", ")}, updated_at=now() WHERE id = $${rv.length}`, rv);
    } catch (e: any) {
      throw new Error(`Etsy yazimi basarisiz (${why}) VE geri alma da basarisiz (${e?.message}) — `
        + `satir ile ilan AYRISTI, elle duzeltilmeli.`);
    }
    // Reported OUTSIDE the try, so the catch can only ever be about the revert UPDATE. Throwing the
    // report from inside meant the catch re-read it as a revert failure — the partial-write message did
    // not match the prefix the guard tested, so the one case it was written for came back to the operator
    // as "geri alma da basarisiz" when the revert had in fact succeeded.
    //
    // "Nothing changed" is only true when nothing reached Etsy. Title/description/tags go in one call and
    // price in another, so the first can land and the second fail — reverting the row then leaves the
    // listing holding the new title while our row holds the old one, and telling the operator that
    // nothing changed is the same drift this tool exists to prevent, pointing the other way.
    throw new Error(sentFields
      ? `Etsy yazimi kismen uygulandi (${why}): baslik/aciklama/tag ILANDA GUNCELLENDI ama fiyat `
        + `yazilamadi. Veritabani satiri eski haline donduruldu, yani SATIR ILE ILAN AYRISTI — elle `
        + `uzlastirilmali.`
      : `Etsy yazimi basarisiz (${why}) — veritabani satiri ESKI HALINE dondurüldu, hicbir sey `
        + `degismedi. Sebebi cozup tekrar dene.`);
  };

  return withShop(async () => {
    if (!hasEtsy()) {
      return { product_id: pid, changed, etsy: "magazanin Etsy baglantisi yok — sadece veritabani guncellendi", verified: null };
    }
    try {
    if (changed.some((c) => c !== "price")) {
      await updateListingFields(listingId, {
        title: input.title !== undefined ? String(input.title).trim() : undefined,
        description: input.description !== undefined ? String(input.description) : undefined,
        tags: input.tags !== undefined ? input.tags : undefined,
      });
      sentFields = true;
    }
    if (changed.includes("price")) {
      await updateInventory(listingId, {
        colorways: p.colorways ?? [],
        sizes: p.sizes ?? ["S", "M", "L", "XL", "2X", "3X"],
        priceCents: Math.round(Number(input.price_cents)),
        quantity: p.quantity ?? 999,
        readinessStateId: shopCtx().readinessStateId,
        skuPrefix: (p.slug || "SKU").slice(0, 12).toUpperCase().replace(/[^A-Z0-9]/g, ""),
      });
    }
    } catch (e: any) {
      await revert(String(e?.message ?? e).slice(0, 160));
    }
    // "Sent" is not "applied". Read the listing back and report what Etsy actually holds.
    const live: any = await getListing(listingId).catch(() => null);
    return {
      product_id: pid,
      changed,
      etsy: `listing ${listingId} guncellendi`,
      verified: live ? {
        title: live.title,
        price: live.price ? `${live.price.amount / live.price.divisor} ${live.price.currency_code}` : null,
        state: live.state,
      } : "ilan geri okunamadi — elle dogrula",
    };
  });
}

/** Turn a database error the agent cannot see the cause of into an instruction it can act on.
 *
 * RLS hides other shops' rows; products.slug is unique GLOBALLY. So a duplicate-key failure points at a
 * row the agent is not allowed to read, its own SELECT says the slug is free, and it has nothing to go on
 * — watched live it burned four turns guessing prefixes and gave up. The constraint stays (operator
 * scripts look products up by slug alone), so the error has to carry the way out with it.
 */
function advice(name: string, e: any): string {
  const code = e?.code as string | undefined;
  const detail = `${e?.constraint ?? ""} ${e?.message ?? ""}`;
  if (code === "23505" && /slug/i.test(detail)) {
    return "\n\nNOT: slug BENZERSIZLIGI TUM MAGAZALAR ICIN GECERLI ve RLS yuzunden cakisan satiri "
      + "goremezsin — kendi SELECT'in bos donse de slug dolu olabilir. Tahmin etme: "
      + "`SELECT next_free_slug('istedigin-slug')` cagir, dondugu degeri kullan.";
  }
  if (code === "42501" || /permission denied/i.test(detail)) {
    return "\n\nNOT: bu satir baska bir magazaya ait ya da rolunun yetkisi yok. Kendi magazanin "
      + "verisiyle devam et; baska magazaya erismeye calismak yerine durumu bildir.";
  }
  if (name === "sql") {
    // The agent read a rolled-back transaction as a partial write — "muhtemelen zaten insert edilmişti
    // kısmen" — and then reasoned from a state that never existed. Every sql call is one transaction.
    return "\n\nNOT: bu cagri tek bir transaction icinde kosar; hata alinca TAMAMEN geri alindi. "
      + "Kismi yazma diye bir sey yok — sifirdan tekrar dene.";
  }
  return "";
}
