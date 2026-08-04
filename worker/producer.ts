/** Producer agent — autonomous design/mockup generation after content approval.
 *  Spec: docs/producer-agent-spec.md. Shares the personalizer's loop, HF client and DB pool. */
import pg from "pg";
import { spawnSync } from "child_process";
import { writeFileSync, readFileSync, unlinkSync, existsSync } from "fs";
import { callTool, jobIdOf, rawUrlOf, statusOf } from "./hf.ts";
import { forcedJson } from "./anthropic.ts";

const scriptPath = (f: string) => new URL(`../scripts/${f}`, import.meta.url).pathname;
const CHART = new URL("../assets/comfort-colors-1717-color-chart.jpeg", import.meta.url).pathname;

export function makeProducer(pool: pg.Pool) {
  const q = async (sql: string, params: any[] = []) => (await pool.query(sql, params)).rows;

  const log = async (pid: number, stage: string, detail: any) => {
    await q(`UPDATE products SET agent_log = agent_log || $2::jsonb WHERE id=$1`,
      [pid, JSON.stringify([{ t: new Date().toISOString(), stage, detail }])]);
    console.log(`[product ${pid}] ${stage}:`, typeof detail === "string" ? detail.slice(0, 160) : JSON.stringify(detail).slice(0, 160));
  };

  async function claim(): Promise<any | null> {
    const rows = await q(`
      UPDATE products p SET design_state='generating', updated_at=now()
      WHERE p.id = (
        SELECT pr.id FROM products pr
        WHERE (pr.design_prompt IS NOT NULL OR pr.mockup_prompt IS NOT NULL)
          AND pr.id NOT IN (SELECT product_id FROM schedule WHERE status='published')
          AND (
            (pr.content_status='approved' AND pr.design_state IS NULL
              AND NOT EXISTS (SELECT 1 FROM product_images i WHERE i.product_id=pr.id))
            OR pr.design_state='redo'
            OR (pr.design_state='generating' AND pr.updated_at < now() - interval '30 minutes')
          )
        ORDER BY pr.id LIMIT 1 FOR UPDATE SKIP LOCKED)
      RETURNING p.*`);
    return rows[0] ?? null;
  }

  async function generateDesign(p: any): Promise<{ jobId: string; file: Buffer; isSvg: boolean }> {
    const params: any = { model: p.design_model, prompt: p.design_prompt, aspect_ratio: "1:1" };
    if (p.redo_note) params.prompt += ` REVISION REQUEST from the reviewer — you MUST honor it: ${p.redo_note}`;
    const dp = typeof p.design_params === "string" ? JSON.parse(p.design_params || "{}") : (p.design_params ?? {});
    if (p.design_model === "recraft_v4_1") {
      if (dp.colors) params.colors = dp.colors;
      if (dp.background_color) params.background_color = dp.background_color;
      if (dp.model_type) params.model_type = dp.model_type;
    } else {
      params.resolution = "4k";
    }
    const gen = await callTool("generate_image", { params });
    const jobId = jobIdOf(gen);
    if (!jobId) throw new Error("no design job id: " + JSON.stringify(gen).slice(0, 150));
    for (let i = 0; i < 45; i++) {
      await new Promise((r) => setTimeout(r, 8000));
      const st = await callTool("job_status", { jobId, sync: true });
      const status = statusOf(st);
      if (status === "completed") {
        const url = rawUrlOf(st);
        if (!url) throw new Error("design completed without rawUrl");
        const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
        return { jobId, file: buf, isSvg: url.includes(".svg") };
      }
      if (["failed", "nsfw", "error"].includes(status)) throw new Error(`design ${status}`);
    }
    throw new Error("design generation timeout");
  }

  async function generateMockup(designJobId: string | null, prompt: string): Promise<Buffer> {
    const params: any = { model: "nano_banana_pro", prompt, aspect_ratio: "1:1", resolution: "2k" };
    if (designJobId) params.medias = [{ role: "image", value: designJobId }];
    const gen = await callTool("generate_image", { params });
    const jobId = jobIdOf(gen);
    if (!jobId) throw new Error("no mockup job id");
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 8000));
      const st = await callTool("job_status", { jobId, sync: true });
      const status = statusOf(st);
      if (status === "completed") {
        const url = rawUrlOf(st);
        if (!url) throw new Error("mockup completed without rawUrl");
        return Buffer.from(await (await fetch(url)).arrayBuffer());
      }
      if (["failed", "nsfw", "error"].includes(status)) throw new Error(`mockup ${status}`);
    }
    throw new Error("mockup timeout");
  }

  function toJpeg(png: Buffer, tag: string): { buf: Buffer; w: number; h: number } {
    const tin = `/tmp/prod-${tag}.png`, tout = `/tmp/prod-${tag}.jpg`;
    writeFileSync(tin, png);
    const r = spawnSync("python3", ["-c", `
from PIL import Image
im = Image.open('${tin}').convert('RGB')
im.save('${tout}', 'JPEG', quality=88, optimize=True)
print(im.size[0], im.size[1])`], { encoding: "utf8" });
    if (r.status !== 0) throw new Error("jpeg convert failed: " + r.stderr.slice(0, 150));
    const [w, h] = r.stdout.trim().split(" ").map(Number);
    const buf = readFileSync(tout);
    unlinkSync(tin); unlinkSync(tout);
    return { buf, w, h };
  }

  function pngDims(buf: Buffer): { w: number; h: number } {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }

  /** Cover thumbnails are ads, not mood shots (see .claude/skills/listing-covers). */
  function coverTexts(p: any): { banner: string; strip: string } {
    const pers = !!p.personalised;
    if (p.slot === "EMB") return {
      banner: pers ? "CUSTOM EMBROIDERY · YOUR NAMES STITCHED" : "REAL EMBROIDERY · NOT A PRINT",
      strip: "COMFORT COLORS 1717 · REAL STITCHING · S-4XL" };
    if (p.slot === "EMBH") return {
      banner: pers ? "CUSTOM EMBROIDERED DAD HAT" : "EMBROIDERED DAD HAT · NOT A PRINT",
      strip: "YUPOONG 6245CM · 10 COLORS · ADJUSTABLE" };
    return {
      banner: pers ? "PERSONALIZED WITH YOUR NAMES" : "COMFORT COLORS GARMENT-DYED TEE",
      strip: "COMFORT COLORS 1717 · 22 COLORS · S-4XL" };
  }

  function adStyleCover(jpeg: Buffer, p: any): Buffer {
    const tin = `/tmp/prod-${p.id}-cov-in.jpg`, tout = `/tmp/prod-${p.id}-cov-out.jpg`;
    writeFileSync(tin, jpeg);
    const { banner, strip } = coverTexts(p);
    const script = new URL("../scripts/make_cover.py", import.meta.url).pathname;
    const r = spawnSync("python3", [script, tin, tout, "--banner", banner, "--strip", strip], { encoding: "utf8" });
    if (r.status !== 0) { console.log(`[product ${p.id}] cover overlay failed, using plain:`, (r.stderr || "").slice(0, 120)); return jpeg; }
    const out = readFileSync(tout);
    unlinkSync(tin); unlinkSync(tout);
    return out;
  }

  async function visionQaDesign(p: any, printPng: Buffer): Promise<string | null> {
    // best-effort: skipped silently when Anthropic is unavailable/unfunded
    try {
      const v = await forcedJson({
        system: "You QA a t-shirt print design. Check that ALL text in the image is correctly spelled English (per the brief), no duplicated or mangled words, no stray color patches.",
        user: [
          { type: "text", text: `Brief (what the design should contain):\n${p.design_prompt.slice(0, 900)}` },
          { type: "image", source: { type: "base64", media_type: "image/png", data: printPng.toString("base64") } },
        ],
        toolName: "design_qa",
        schema: { type: "object", properties: { ok: { type: "boolean" }, problems: { type: "string" } }, required: ["ok", "problems"] },
      });
      return v.ok ? null : String(v.problems || "unspecified");
    } catch (e: any) {
      console.log(`[product ${p.id}] vision QA skipped:`, String(e).slice(0, 100));
      return null;
    }
  }

  async function attach(p: any, printPng: Buffer | null, mocks: Buffer[]): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`DELETE FROM product_images WHERE product_id=$1`, [p.id]);
      const roles = ["cover", "hanging", "model"];
      for (let i = 0; i < 3; i++) {
        const { buf, w, h } = toJpeg(mocks[i], `${p.id}-${roles[i]}`);
        const finalBuf = i === 0 ? adStyleCover(buf, p) : buf;
        await client.query(
          `INSERT INTO product_images (product_id, rank, role, label, filename, mime, width, height, bytes)
           VALUES ($1,$2,$3,$4,$5,'image/jpeg',$6,$7,$8)`,
          [p.id, i + 1, roles[i], i === 0 ? "ad-style cover" : p.hero_colorway, `mockup-${roles[i]}.jpg`, w, h, finalBuf]);
      }
      if (existsSync(CHART) && String(p.blank || "").includes("Comfort Colors")) {
        const chart = readFileSync(CHART);
        await client.query(
          `INSERT INTO product_images (product_id, rank, role, label, filename, mime, width, height, bytes)
           VALUES ($1,4,'colorway-chart','All 22 colors','color-chart.jpeg','image/jpeg',2000,2000,$2)`,
          [p.id, chart]);
        const sizeChart = new URL("../assets/cc1717-size-chart.png", import.meta.url).pathname;
        if (existsSync(sizeChart)) {
          await client.query(
            `INSERT INTO product_images (product_id, rank, role, label, filename, mime, width, height, bytes)
             VALUES ($1,5,'size-chart','CC1717 size chart','cc1717-size-chart.png','image/png',2000,2000,$2)`,
            [p.id, readFileSync(sizeChart)]);
        }
      }
      if (printPng) {
        const d = pngDims(printPng);
        await client.query(
          `UPDATE products SET print_file=$2, print_file_name=$3, print_file_w=$4, print_file_h=$5,
                  print_dpi=$6, design_state='ready', redo_note=NULL, updated_at=now() WHERE id=$1`,
          [p.id, printPng, `${p.slug}-print.png`, d.w, d.h, Math.round(d.w / 9.5)]);
      } else {
        await client.query(
          `UPDATE products SET design_state='ready', redo_note=NULL, updated_at=now() WHERE id=$1`, [p.id]);
      }
      await client.query("COMMIT");
    } catch (e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
  }

  async function produce(p: any): Promise<void> {
    // design-less products (e.g. embroidered hats): mockup prompts fully describe the
    // stitched result — no design generation, no print file, straight to mockups.
    if (!p.design_prompt) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const mocks: Buffer[] = [];
          for (const prompt of [p.mockup_prompt, p.mockup_prompt_hanging, p.mockup_prompt_model]) {
            if (!prompt) throw new Error("missing mockup prompt");
            const withNote = p.redo_note ? prompt + ` REVISION REQUEST from the reviewer — you MUST honor it: ${p.redo_note}` : prompt;
            mocks.push(await generateMockup(null, withNote));
          }
          await attach(p, null, mocks);
          await q(`INSERT INTO events (product_id, kind, detail) VALUES ($1,'agent_generated',$2)`,
            [p.id, `3 mockups by producer agent (design-less)${p.redo_note ? " (redo)" : ""}`]);
          return log(p.id, "ready", { slug: p.slug, designless: true });
        } catch (e: any) {
          await log(p.id, "produce-error", String(e).slice(0, 250));
          if (attempt === 2) await q(`UPDATE products SET design_state='error', updated_at=now() WHERE id=$1`, [p.id]);
        }
      }
      return;
    }
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await log(p.id, "design-gen", { model: p.design_model, attempt, redo: !!p.redo_note });
        const d = await generateDesign(p);
        await q(`UPDATE products SET design_job_id=$2 WHERE id=$1`, [p.id, d.jobId]);
        const tin = `/tmp/design-${p.id}.${d.isSvg ? "svg" : "png"}`, tout = `/tmp/design-${p.id}-final.png`;
        writeFileSync(tin, d.file);
        const proc = spawnSync("python3", [scriptPath("process_design.py"), d.isSvg ? "svg" : "png", tin, tout], { encoding: "utf8" });
        if (proc.status !== 0) throw new Error("print processing failed: " + (proc.stdout + proc.stderr).slice(0, 180));
        const printPng = readFileSync(tout);
        unlinkSync(tin); unlinkSync(tout);
        await log(p.id, "print-ok", proc.stdout.trim());
        const qaProblem = await visionQaDesign(p, printPng);
        if (qaProblem) throw new Error("design QA: " + qaProblem);
        const mocks: Buffer[] = [];
        for (const prompt of [p.mockup_prompt, p.mockup_prompt_hanging, p.mockup_prompt_model]) {
          if (!prompt) throw new Error("missing mockup prompt");
          mocks.push(await generateMockup(d.jobId, prompt));
        }
        await log(p.id, "mockups-ok", { count: mocks.length });
        await attach(p, printPng, mocks);
        await q(`INSERT INTO events (product_id, kind, detail) VALUES ($1,'agent_generated',$2)`,
          [p.id, `design+print+3 mockups by producer agent${p.redo_note ? " (redo)" : ""}`]);
        return log(p.id, "ready", { slug: p.slug });
      } catch (e: any) {
        await log(p.id, "produce-error", String(e).slice(0, 250));
        if (attempt === 2) {
          await q(`UPDATE products SET design_state='error', updated_at=now() WHERE id=$1`, [p.id]);
        }
      }
    }
  }

  return async function tickProducer(): Promise<boolean> {
    const p = await claim();
    if (!p) return false;
    await log(p.id, "claimed", { slug: p.slug, state: p.design_state });
    await produce(p).catch(async (e) => {
      await log(p.id, "unhandled", String(e).slice(0, 200));
      await q(`UPDATE products SET design_state='error' WHERE id=$1`, [p.id]);
    });
    return true;
  };
}
