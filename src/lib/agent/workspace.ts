/**
 * Reading the repository and running its own scripts — everything the operator can do except change code.
 *
 * The restriction is enforced here rather than asked for in the prompt, because "do not modify code" is not
 * something a model can be trusted to honour once it holds an interpreter: one `python3 -c` with an open()
 * and the rule is gone. So there is no write tool, no shell, and no arbitrary interpreter. What exists is
 * read access to the repository and permission to run the scripts the repository already ships — which is
 * how the work actually gets done here anyway.
 *
 * Secrets are refused rather than trusted to a prompt line. A .env read is a credential leak into a chat
 * transcript that gets stored in Postgres and re-sent on later turns.
 */
import { spawn } from "child_process";
import { readFile, readdir, stat } from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const MAX_CHARS = 60_000;
const RUN_TIMEOUT_MS = 180_000;

/** Paths that never leave the server, whatever the model asks for. */
const DENIED = [
  /(^|\/)\.env/i,
  /(^|\/)\.git(\/|$)/,
  /node_modules(\/|$)/,
  /\.(pem|key|p12|pfx)$/i,
  /(^|\/)tokens?\.json$/i,
];

export function resolveInRepo(rel: string): string | null {
  const p = path.resolve(ROOT, rel);
  // path.resolve collapses ".." so a traversal attempt lands outside ROOT and is caught by the prefix test.
  if (p !== ROOT && !p.startsWith(ROOT + path.sep)) return null;
  const relative = path.relative(ROOT, p);
  if (DENIED.some((re) => re.test(relative) || re.test(rel))) return null;
  return p;
}

export async function readRepoFile(rel: string, offset = 0, limit = 0):
  Promise<{ ok: boolean; text: string }> {
  const p = resolveInRepo(rel);
  if (!p) return { ok: false, text: `ERROR: '${rel}' okunamaz (repo disi ya da gizli dosya)` };
  try {
    const s = await stat(p);
    if (s.isDirectory()) {
      const names = await readdir(p, { withFileTypes: true });
      return {
        ok: true,
        text: names.map((d) => (d.isDirectory() ? `${d.name}/` : d.name)).sort().join("\n"),
      };
    }
    if (s.size > 4_000_000) return { ok: false, text: `ERROR: dosya cok buyuk (${Math.round(s.size / 1e6)}MB)` };
    // A binary read comes back as mojibake that looks like a corrupted file rather than the wrong request.
    if (/\.(png|jpe?g|webp|gif|ico|woff2?|ttf|otf|zip|pdf)$/i.test(p)) {
      return { ok: false, text: `ERROR: '${rel}' ikili bir dosya. Urun gorseli icin 'look' aracini kullan.` };
    }
    const body = await readFile(p, "utf8");
    // Line ranges, because the interesting part of a thousand-line script is rarely the first third and a
    // silent truncation reads as "that is the whole file".
    if (offset > 0 || limit > 0) {
      const lines = body.split("\n");
      const from = Math.max(0, (offset || 1) - 1);
      const take = limit > 0 ? limit : 400;
      const slice = lines.slice(from, from + take);
      const head = `[${rel} · ${from + 1}-${Math.min(from + take, lines.length)} / ${lines.length} satir]\n`;
      return { ok: true, text: head + slice.join("\n") };
    }
    return body.length > MAX_CHARS
      ? { ok: true, text: `${body.slice(0, MAX_CHARS)}\n\n… kesildi (${body.length} karakter). `
                          + `Gerisi icin offset/limit ver.` }
      : { ok: true, text: body };
  } catch (e: any) {
    return { ok: false, text: `ERROR: ${String(e?.message ?? e).slice(0, 200)}` };
  }
}

/** Scripts the agent may not run, and why.
 *
 * produce_product.py: `produce` already wraps it with the per-turn cap that keeps one request from spending
 * twenty minutes of image generation. A second door around a limit is no limit.
 *
 * The rest publish, reprice, or push to a storefront. CLAUDE.md makes those explicit-approval actions, and
 * the whole argument for building this tool layer was that a rule living only in the prompt stops being a
 * rule the moment a tool permits the thing. Leaving a one-call path to "go live" and trusting the prompt to
 * hold it would repeat exactly the mistake this file exists to avoid. The operator runs these.
 */
const SCRIPT_DENY = new Map<string, string>([
  ["produce_product.py", "toplu/tekil uretim icin 'produce' aracini kullan (tur basina 2 cagri siniri)"],
  ["reprice_personalized_emb.py", "fiyat degistirir — acik talep ister, operator calistirir"],
  ["requeue_etsy.py", "Etsy'ye yazar — acik onay ister"],
  ["resync_etsy_images.py", "Etsy'ye gorsel yukler — acik onay ister"],
  ["publish_ttrpg.py", "yayina alir — acik onay ister"],
  ["shopify_golive.py", "magazayi yayina alir — acik onay ister"],
  ["shopify_port.py", "Shopify'a urun yazar — acik onay ister"],
  ["shopify_cleanup.py", "Shopify'da siler — acik onay ister"],
  ["shopify_homepage.py", "vitrini degistirir — acik onay ister"],
  ["shopify_home_images.py", "vitrini degistirir — acik onay ister"],
  ["shopify_hero_gaming.py", "vitrini degistirir — acik onay ister"],
  ["shopify_register_webhook.py", "magaza ayari degistirir — acik onay ister"],
  ["seed_ttrpg.py", "toplu veri tohumlar — operator calistirir"],
]);

export async function runRepoScript(name: string, args: string[]):
  Promise<{ ok: boolean; text: string }> {
  if (!/^[\w.-]+\.py$/.test(name)) {
    return { ok: false, text: `ERROR: '${name}' gecerli bir script adi degil; scripts/ altindaki bir .py ver.` };
  }
  const denied = SCRIPT_DENY.get(name);
  if (denied) {
    return { ok: false, text: `ERROR: '${name}' bu araçla calistirilamaz — ${denied}.` };
  }
  const p = resolveInRepo(path.join("scripts", name));
  if (!p) return { ok: false, text: `ERROR: '${name}' bulunamadi` };
  try {
    await stat(p);
  } catch {
    return { ok: false, text: `ERROR: scripts/${name} yok` };
  }

  return new Promise((resolve) => {
    // spawn with an argument array, never a shell string: there is no line for an argument to escape into.
    const child = spawn("python3", [p, ...args.map(String)], { cwd: ROOT, env: process.env });
    let out = "", err = "", done = false;
    const timer = setTimeout(() => {
      if (done) return;
      child.kill("SIGKILL");
      done = true;
      resolve({ ok: false, text:
        `ERROR: ${name} ${RUN_TIMEOUT_MS / 1000}sn icinde bitmedi ve durduruldu. Uzun isleri parcala — `
        + `cogu script --limit alir.\n--- o ana kadarki cikti ---\n${(out + err).slice(-4000)}` });
    }, RUN_TIMEOUT_MS);

    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    child.on("error", (e) => {
      if (done) return;
      done = true; clearTimeout(timer);
      resolve({ ok: false, text: `ERROR: ${String(e?.message ?? e).slice(0, 200)}` });
    });
    child.on("close", (code) => {
      if (done) return;
      done = true; clearTimeout(timer);
      // stderr is where these scripts report progress, so it is part of the answer, not an error channel.
      const body = [out.trim(), err.trim()].filter(Boolean).join("\n--- stderr ---\n");
      const clipped = body.length > MAX_CHARS ? `${body.slice(0, MAX_CHARS)}\n… kesildi` : body;
      resolve({ ok: code === 0, text: `exit=${code}\n${clipped || "(cikti yok)"}` });
    });
  });
}
