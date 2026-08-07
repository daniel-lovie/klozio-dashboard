/** Generate the TTRPG guild-patch emblem for the personalised embroidered tee.
 *
 *  Rules this follows (from the ai-design skill):
 *   - AI draws the ORNAMENT ONLY. No text in the prompt or the output — the character name / class /
 *     level are stitched per order by the personalizer, and AI-rendered type is unsellable.
 *   - No brand, franchise or game name anywhere in the prompt. A twenty-sided die, a sword and a
 *     laurel are genre vocabulary; anything recognisable would be our infringement, not the model's.
 *   - Embroidery, not DTF: flat solid shapes, no gradients, no hairlines, and few enough colours to
 *     map onto Printful's thread palette (max 6 per thread_colors.py).
 *  Raw outputs are kept unedited for the provenance archive.
 */
import { callTool, jobIdOf, statusOf, rawUrlOf } from "../worker/hf.ts";
import { writeFile, mkdir } from "node:fs/promises";

const OUT = "/Users/omer/Documents/code/etsy/pipeline/ttrpg-guild/raw";

const SHARED =
  "flat vector emblem, bold graphic patch design, screen-print style, " +
  "flat solid colors only, no gradients, no shading, no soft edges, hard clean edges, " +
  "thick confident line weight, bold overall silhouette that reads at small size, " +
  "centered composition, transparent background, no text, no letters, no numbers, " +
  "palette limited to six flat colors: cream, deep rust red, forest green, charcoal black, muted gold, dusty blue";

const VARIANTS: Record<string, string> = {
  v1_die_laurel:
    "a twenty-sided polyhedral die seen face-on at the centre, encircled by a symmetrical laurel wreath, " +
    "a small five-pointed star above the wreath, " + SHARED,
  v2_die_sword:
    "a twenty-sided polyhedral die at the centre with a straight longsword crossed behind it and a " +
    "feather quill crossed the other way, forming an X behind the die, simple banner ribbon beneath, " + SHARED,
  v3_shield_crest:
    "a simple heraldic shield crest, a twenty-sided polyhedral die centred on the shield face, " +
    "two small flanking torches, a plain ribbon banner across the bottom left empty, " + SHARED,
  v4_dice_stack:
    "three polyhedral dice arranged in a tight triangular cluster, a twenty-sided die largest in front, " +
    "a thin circular border ring around the cluster, small sparkle marks, " + SHARED,
};

async function gen(name: string, prompt: string) {
  const job = await callTool("generate_image", {
    params: { model: "nano_banana_pro", prompt, aspect_ratio: "1:1", resolution: "4k" },
  });
  const id = jobIdOf(job);
  if (!id) throw new Error(`${name}: no job id — ${JSON.stringify(job).slice(0, 200)}`);
  process.stdout.write(`  ${name}: job ${id.slice(0, 8)} `);
  for (let i = 0; i < 45; i++) {
    await new Promise((r) => setTimeout(r, 8000));
    const st = await callTool("job_status", { jobId: id, sync: true });
    const s = statusOf(st);
    if (s === "completed") {
      const url = rawUrlOf(st);
      if (!url) throw new Error("completed without url");
      const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
      await writeFile(`${OUT}/${name}.png`, buf);
      console.log(`✓ ${(buf.length / 1024).toFixed(0)}kb`);
      return { name, url, prompt };
    }
    if (["failed", "nsfw", "error"].includes(s)) throw new Error(`${name}: ${s}`);
    process.stdout.write(".");
  }
  throw new Error(`${name}: timed out`);
}

await mkdir(OUT, { recursive: true });
const done: any[] = [];
for (const [name, prompt] of Object.entries(VARIANTS)) {
  try { done.push(await gen(name, prompt)); }
  catch (e: any) { console.log(`✗ ${name}: ${e.message.slice(0, 120)}`); }
}
await writeFile(`${OUT}/prompts.json`, JSON.stringify({ model: "nano_banana_pro", variants: VARIANTS, produced: done }, null, 2));
console.log(`\n${done.length}/${Object.keys(VARIANTS).length} üretildi -> ${OUT}`);
