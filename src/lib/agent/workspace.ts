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

export async function readRepoFile(rel: string): Promise<{ ok: boolean; text: string }> {
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
    const body = await readFile(p, "utf8");
    return body.length > MAX_CHARS
      ? { ok: true, text: `${body.slice(0, MAX_CHARS)}\n\n… kesildi (${body.length} karakter)` }
      : { ok: true, text: body };
  } catch (e: any) {
    return { ok: false, text: `ERROR: ${String(e?.message ?? e).slice(0, 200)}` };
  }
}

/** produce_product.py is excluded on purpose: `produce` already wraps it with the per-turn cap that keeps
 *  one request from spending twenty minutes of image generation. A second door around a limit is no limit. */
const SCRIPT_DENY = new Set(["produce_product.py"]);

export async function runRepoScript(name: string, args: string[]):
  Promise<{ ok: boolean; text: string }> {
  if (!/^[\w.-]+\.py$/.test(name) || SCRIPT_DENY.has(name)) {
    return { ok: false, text: `ERROR: '${name}' calistirilamaz. scripts/ altindaki bir .py dosyasi ver; `
      + `produce_product.py haric (onun icin 'produce' aracini kullan).` };
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
