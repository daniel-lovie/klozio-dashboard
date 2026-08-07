/** Shield variant sized for embroidery, plus the product mockups for both designs.
 *
 *  Why the shield gets regenerated: on the first shield the die occupies a small part of the badge,
 *  so the "20" — the one symbol this audience actually reads — would stitch out illegibly at a 3.5-4"
 *  left chest. This pass makes the die dominate the shield face and keeps the ribbon empty for the
 *  personalised character line.
 *
 *  Mockups reference the finished design file (role "image") so the emblem in the photo is our
 *  artwork rather than something the model reinvents.
 */
import { callTool, jobIdOf, statusOf, rawUrlOf, uploadPng } from "../worker/hf.ts";
import { readFile, writeFile, mkdir } from "node:fs/promises";

const DIR = "/Users/omer/Documents/code/etsy/pipeline/ttrpg-guild";
const MOCK = `${DIR}/mockups`;

async function poll(id: string, label: string, out: string, cut = false) {
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 8000));
    const st = await callTool("job_status", { jobId: id, sync: true });
    const s = statusOf(st);
    if (s === "completed") {
      const url = rawUrlOf(st);
      if (!url) throw new Error("completed without url");
      await writeFile(out, Buffer.from(await (await fetch(url)).arrayBuffer()));
      console.log(`✓ ${label}`);
      if (cut) {
        const c = await callTool("remove_background", { params: { media_id: id, media_type: "image" } });
        const cid = jobIdOf(c);
        if (cid) {
          for (let k = 0; k < 30; k++) {
            await new Promise((r) => setTimeout(r, 7000));
            const cs = await callTool("job_status", { jobId: cid, sync: true });
            if (statusOf(cs) === "completed") {
              const cu = rawUrlOf(cs);
              if (cu) await writeFile(out.replace(".png", "_cutout.png"), Buffer.from(await (await fetch(cu)).arrayBuffer()));
              break;
            }
            if (["failed", "error", "nsfw"].includes(statusOf(cs))) break;
          }
        }
      }
      return true;
    }
    if (["failed", "nsfw", "error"].includes(s)) { console.log(`✗ ${label}: ${s}`); return false; }
    process.stdout.write(".");
  }
  console.log(`✗ ${label}: zaman asimi`);
  return false;
}

async function gen(prompt: string, label: string, out: string, mediaId?: string, cut = false) {
  process.stdout.write(`  ${label} `);
  const params: any = { model: "nano_banana_pro", prompt, aspect_ratio: "1:1", resolution: "4k" };
  if (mediaId) params.medias = [{ role: "image", value: mediaId }];
  const job = await callTool("generate_image", { params });
  const id = jobIdOf(job);
  if (!id) { console.log(`✗ job id yok`); return false; }
  return poll(id, label, out, cut);
}

await mkdir(MOCK, { recursive: true });

// 1. shield, die enlarged so the numeral survives a stitch-out
await gen(
  "a heraldic shield crest badge, a very large twenty-sided polyhedral die filling almost the entire " +
  "shield face with completely blank unmarked faces, a plain empty ribbon banner across the bottom of " +
  "the shield, no torches, " +
  "flat vector emblem, bold graphic patch design, screen-print style, flat solid colors only, " +
  "no gradients, no shading, hard clean edges, very thick bold outlines, chunky simplified shapes, " +
  "bold silhouette that reads at small size, centered composition, transparent background, " +
  "NO text, NO letters, NO numbers, NO numerals, " +
  "palette limited to five flat colors: cream, muted gold, deep rust red, forest green, charcoal black",
  "B_big_die", `${MOCK}/../B_shield_bigdie.png`, undefined, true,
);

// 2. mockups from the finished artwork
for (const [key, file] of [["A", "A_laurel_20.png"], ["B", "B_shield_20.png"]] as const) {
  const mid = await uploadPng(await readFile(`${DIR}/${file}`), file);
  await gen(
    "product photograph: the emblem in the reference image embroidered onto the left chest of a folded " +
    "butter-yellow garment-dyed heavyweight cotton t-shirt, visible satin stitch thread texture with a " +
    "slightly raised relief, tight macro close-up at a shallow angle, soft natural window light, " +
    "neutral linen surface underneath, shallow depth of field, no text anywhere, no watermark",
    `${key}_macro`, `${MOCK}/${key}_macro.png`, mid,
  );
  await gen(
    "product photograph: a person from the shoulders down wearing a dark charcoal garment-dyed " +
    "heavyweight cotton t-shirt with the emblem from the reference image embroidered small on the left " +
    "chest, casual relaxed fit, seated at a wooden table with dice and a notebook softly out of focus " +
    "in the background, warm indoor evening light, waist-up crop, no face visible, no text anywhere",
    `${key}_lifestyle`, `${MOCK}/${key}_lifestyle.png`, mid,
  );
}
console.log("\nbitti ->", MOCK);
