/** Cut the baked-in checkerboard out of the TTRPG emblems.
 *
 *  nano_banana_pro answers "transparent background" by DRAWING a checkerboard — the file comes back
 *  RGB with no alpha channel. On a garment that prints as a grey grid, so the cutout is mandatory,
 *  not cosmetic. Verified after the fact: alpha must exist and the corners must be fully clear.
 */
import { callTool, jobIdOf, statusOf, rawUrlOf, uploadPng } from "../worker/hf.ts";
import { readFile, writeFile } from "node:fs/promises";

const DIR = "/Users/omer/Documents/code/etsy/pipeline/ttrpg-guild";

for (const name of ["v2_die_sword", "v3_shield_crest"]) {
  process.stdout.write(`${name}: yukleniyor `);
  const buf = await readFile(`${DIR}/raw/${name}.png`);
  const mediaId = await uploadPng(buf, `${name}.png`);
  process.stdout.write(`media ${mediaId.slice(0, 8)} · arka plan siliniyor `);

  const job = await callTool("remove_background", { params: { media_id: mediaId, media_type: "image" } });
  const id = jobIdOf(job);
  if (!id) { console.log(`✗ job id yok: ${JSON.stringify(job).slice(0, 160)}`); continue; }

  let saved = false;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 7000));
    const st = await callTool("job_status", { jobId: id, sync: true });
    const s = statusOf(st);
    if (s === "completed") {
      const url = rawUrlOf(st);
      if (!url) { console.log("✗ url yok"); break; }
      const out = Buffer.from(await (await fetch(url)).arrayBuffer());
      await writeFile(`${DIR}/${name}_cutout.png`, out);
      console.log(`✓ ${(out.length / 1024).toFixed(0)}kb`);
      saved = true;
      break;
    }
    if (["failed", "nsfw", "error"].includes(s)) { console.log(`✗ ${s}`); break; }
    process.stdout.write(".");
  }
  if (!saved) console.log(" (tamamlanmadi)");
}
