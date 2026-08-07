/** Second pass on the laurel + d20 badge.
 *
 *  Two changes from v1, both deliberate:
 *   1. **Blank die faces.** v1's faces carried AI-rendered numerals — 14 appeared twice and 10/12 came
 *      out inverted and malformed. A player spots that instantly. The "20" gets hand-set afterwards
 *      with a licensed font; the model must not draw digits at all.
 *   2. **Chunkier laurel.** v1's wreath had ~30 small leaves with hairline outlines. Stitched at a
 *      3.5-4" left chest that detail collapses, so we ask for far fewer, much larger leaves and
 *      thick outlines throughout.
 *  Also leaves the bottom of the wreath open, which is where the personalised character line goes.
 */
import { callTool, jobIdOf, statusOf, rawUrlOf } from "../worker/hf.ts";
import { writeFile, mkdir } from "node:fs/promises";

const OUT = "/Users/omer/Documents/code/etsy/pipeline/ttrpg-guild/raw2";

const SHARED =
  "flat vector emblem, bold graphic patch design, screen-print style, " +
  "flat solid colors only, no gradients, no shading, hard clean edges, " +
  "very thick bold outlines, chunky simplified shapes, minimal internal detail, " +
  "bold overall silhouette that reads at small size, centered composition, " +
  "transparent background, " +
  "NO text, NO letters, NO numbers, NO numerals, completely blank empty die faces, " +
  "palette limited to five flat colors: cream, muted gold, deep rust red, forest green, charcoal black";

const VARIANTS: Record<string, string> = {
  w1_laurel_open:
    "a large twenty-sided polyhedral die seen face-on at the centre with completely blank unmarked faces, " +
    "framed by a simplified laurel wreath of only twelve large chunky leaves, six on each side, " +
    "the wreath open at the bottom with a clear empty gap, a small solid five-pointed star at the top, " + SHARED,
  w2_laurel_ring:
    "a large twenty-sided polyhedral die with completely blank unmarked faces at the centre, " +
    "surrounded by a thick solid circular ring, twelve large chunky laurel leaves arranged around the " +
    "outside of the ring, wide clear gap at the bottom of the ring, " + SHARED,
  w3_hex_badge:
    "a large twenty-sided polyhedral die with completely blank unmarked faces centred inside a bold " +
    "hexagonal badge outline, two thick chunky laurel branches flanking the lower half, " +
    "wide empty space across the bottom of the badge, " + SHARED,
};

async function gen(name: string, prompt: string) {
  const job = await callTool("generate_image", {
    params: { model: "nano_banana_pro", prompt, aspect_ratio: "1:1", resolution: "4k" },
  });
  const id = jobIdOf(job);
  if (!id) throw new Error(`no job id: ${JSON.stringify(job).slice(0, 160)}`);
  process.stdout.write(`  ${name}: ${id.slice(0, 8)} `);
  for (let i = 0; i < 45; i++) {
    await new Promise((r) => setTimeout(r, 8000));
    const st = await callTool("job_status", { jobId: id, sync: true });
    const s = statusOf(st);
    if (s === "completed") {
      const url = rawUrlOf(st);
      if (!url) throw new Error("completed without url");
      await writeFile(`${OUT}/${name}.png`, Buffer.from(await (await fetch(url)).arrayBuffer()));
      // Cut the drawn-in checkerboard immediately — the raw is RGB with no alpha.
      const cut = await callTool("remove_background", { params: { media_id: id, media_type: "image" } });
      const cid = jobIdOf(cut);
      if (cid) {
        for (let k = 0; k < 30; k++) {
          await new Promise((r) => setTimeout(r, 7000));
          const cs = await callTool("job_status", { jobId: cid, sync: true });
          if (statusOf(cs) === "completed") {
            const cu = rawUrlOf(cs);
            if (cu) await writeFile(`${OUT}/${name}_cutout.png`, Buffer.from(await (await fetch(cu)).arrayBuffer()));
            break;
          }
          if (["failed", "error", "nsfw"].includes(statusOf(cs))) break;
        }
      }
      console.log("✓");
      return { name, prompt, jobId: id };
    }
    if (["failed", "nsfw", "error"].includes(s)) throw new Error(s);
    process.stdout.write(".");
  }
  throw new Error("timed out");
}

await mkdir(OUT, { recursive: true });
const done: any[] = [];
for (const [n, p] of Object.entries(VARIANTS)) {
  try { done.push(await gen(n, p)); } catch (e: any) { console.log(`✗ ${n}: ${e.message.slice(0, 110)}`); }
}
await writeFile(`${OUT}/prompts.json`, JSON.stringify({ model: "nano_banana_pro", variants: VARIANTS, produced: done }, null, 2));
console.log(`\n${done.length}/${Object.keys(VARIANTS).length} -> ${OUT}`);
