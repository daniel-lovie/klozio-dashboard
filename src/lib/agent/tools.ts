/** Tool definitions + executors for the web agent. Every call is logged to events. */
import { pool, logEvent } from "../db";
import { etsyRaw } from "../etsy";
import { shopifyGql } from "../shopify";
import { printfulRaw } from "../printful";

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
        title: { type: "string" },
        description: { type: "string" },
        tags: { type: "array", items: { type: "string" }, description: "en fazla 13, her biri <=20 karakter" },
      },
      required: ["product_id"],
    },
  },
  {
    name: "read_file",
    description: "Depodaki bir dosyayi ya da klasoru oku. Kod, script, skill dokumani, CLAUDE.md — hepsi. "
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
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    child.on("error", (e) => resolve({ error: String(e?.message ?? e) }));
    child.on("close", () => {
      const line = out.trim().split("\n").filter(Boolean).pop() ?? "";
      try { resolve(JSON.parse(line)); }
      catch { resolve({ error: (err || out || "cikti okunamadi").slice(0, 300) }); }
    });
  });
}

export async function execTool(name: string, input: any):
  Promise<{ result: string; summary: string; blocks?: any[] }> {
  try {
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
      blocked_warning: "Bu satirlarda design_model BOS: kuyruk onlari alir ama uretim 'Invalid input at "
        + "params' ile patlar. UPDATE products SET design_model='nano_banana_pro' ile duzelt, sonra "
        + "design_state=NULL yaparak kuyruga geri koy. Kullaniciya bunlarin uretilmeyecegini soyle.",
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
    `SELECT id, slug, title, price_cents, etsy_listing_id, etsy_state, colorways, sizes, quantity
       FROM products WHERE id = $1`, [pid]);
  const p = cur.rows?.[0];
  // RLS makes an out-of-shop product indistinguishable from a missing one, which is the point.
  if (!p) throw new Error(`urun ${pid} bu magazada bulunamadi`);

  // Placeholders, not string building: the values come from the model, and hand-escaping a title with an
  // apostrophe in it is exactly the kind of thing that works until it does not.
  const sets: string[] = [];
  const vals: any[] = [];
  const changed: string[] = [];
  const put = (col: string, v: any) => { vals.push(v); sets.push(`${col}=$${vals.length}`); };

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
    if (t.length < 10 || t.length > 140) throw new Error(`title ${t.length} karakter — Etsy siniri 140, playbook 125-140`);
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
  return withShop(async () => {
    if (!hasEtsy()) {
      return { product_id: pid, changed, etsy: "magazanin Etsy baglantisi yok — sadece veritabani guncellendi", verified: null };
    }
    if (changed.some((c) => c !== "price")) {
      await updateListingFields(listingId, {
        title: input.title !== undefined ? String(input.title).trim() : undefined,
        description: input.description !== undefined ? String(input.description) : undefined,
        tags: input.tags !== undefined ? input.tags : undefined,
      });
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
