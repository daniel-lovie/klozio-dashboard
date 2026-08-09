/** Producer agent — autonomous design/mockup generation after content approval.
 *  Spec: docs/producer-agent-spec.md. Shares the personalizer's loop, HF client and DB pool. */
import pg from "pg";
import { spawnSync } from "child_process";
import { writeFileSync, readFileSync, unlinkSync, existsSync } from "fs";
import { callTool, jobIdOf, rawUrlOf, statusOf } from "./hf.ts";
import { forcedJson } from "./anthropic.ts";

const scriptPath = (f: string) => new URL(`../scripts/${f}`, import.meta.url).pathname;

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

  /** Build the listing images the way the batch pipeline does: composited onto our own licensed
   *  blank photographs, at the placement the product is actually fulfilled at, plus the colour
   *  chart. Replaces three AI-generated mockups a product (~$0.54) that knew none of the rules —
   *  they rendered type, ignored the thread palette, and showed a full-front print on garments
   *  stitched as a 4-inch chest badge. Two production paths that disagree is the defect. */
  async function buildImages(productId: number): Promise<number> {
    const proc = spawnSync("python3", [scriptPath("produce_images.py"), String(productId)],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    if (proc.status !== 0) {
      throw new Error("image build failed: " + (proc.stdout + proc.stderr).slice(0, 300));
    }
    const line = proc.stdout.trim().split("\n").pop() ?? "{}";
    return JSON.parse(line).images ?? 0;
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

  /** Store the print file only. Images are built from it afterwards by produce_images.py, which
   *  owns the composition rules — this used to insert three AI mockups plus a static colour chart. */
  async function storePrintFile(p: any, printPng: Buffer): Promise<void> {
    const d = pngDims(printPng);
    await q(`UPDATE products SET print_file=$2, print_file_name=$3, print_file_w=$4, print_file_h=$5,
               print_dpi=$6, design_state='ready', redo_note=NULL, updated_at=now() WHERE id=$1`,
      [p.id, printPng, `${p.slug}-print.png`, d.w, d.h, Math.round(d.w / 9.5)]);
  }

  async function produce(p: any): Promise<void> {
    // design-less products (e.g. embroidered hats): mockup prompts fully describe the
    // stitched result — no design generation, no print file, straight to mockups.
    if (!p.design_prompt) {
      // Design-less products were hats whose mockup prompts described the stitched result, so an
      // image model drew the whole product. There are no hat blanks to composite onto, and drawing
      // a product we then have to match is the opposite of showing what we ship. Stop with the
      // reason on the row rather than produce something unusable.
      await log(p.id, "produce-error", "design_prompt yok: sapka/tasarimsiz urun icin blank yok");
      await q(`UPDATE products SET design_state='error',
                 redo_note='design_prompt gerekli — tasarimsiz uretim kaldirildi (blank mockup yok)'
               WHERE id=$1`, [p.id]);
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
        // the print file has to be stored before the images are built: they are composited FROM it
        await storePrintFile(p, printPng);
        const n = await buildImages(p.id);
        await log(p.id, "images-ok", { count: n });
        await q(`INSERT INTO events (product_id, kind, detail) VALUES ($1,'agent_generated',$2)`,
          [p.id, `design+print+${n} blank-composited images${p.redo_note ? " (redo)" : ""}`]);
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
