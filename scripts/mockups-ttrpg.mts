/** Mockups per listing type.
 *
 *  Two artwork variants exist for a reason: the embroidery files are drawn in Printful's actual
 *  thread colours (bright gold, navy) so the stitched product matches its photo, while the DTF files
 *  keep the softer original palette. Photographing the wrong file would misrepresent the product,
 *  so each pair is shot from its own artwork — and print listings get printed-look shots, not
 *  thread texture.
 */
import { callTool, jobIdOf, statusOf, rawUrlOf, uploadPng } from "../worker/hf.ts";
import { readFile, writeFile, mkdir } from "node:fs/promises";
const DIR="/Users/omer/Documents/code/etsy/pipeline/ttrpg-guild";
const OUT=`${DIR}/mockups`;
await mkdir(OUT,{recursive:true});

const EMB_MACRO = "product photograph: the emblem in the reference image embroidered on the left chest of a folded " +
  "butter-yellow garment-dyed heavyweight cotton t-shirt, visible satin stitch thread texture with slightly raised " +
  "relief, tight macro at a shallow angle, soft natural window light, neutral linen underneath, shallow depth of " +
  "field, colours exactly as in the reference, no text anywhere";
const EMB_LIFE = "product photograph: a person from the shoulders down wearing a dark charcoal garment-dyed heavyweight " +
  "cotton t-shirt with the emblem from the reference image embroidered small on the left chest, seated at a wooden " +
  "table with polyhedral dice and an open notebook softly out of focus, warm indoor evening light, waist-up crop, " +
  "no face visible, colours exactly as in the reference, no text anywhere";
const DTF_FRONT = "product photograph: the emblem in the reference image printed large and centred on the chest of a " +
  "dark charcoal garment-dyed heavyweight cotton t-shirt laid flat on pale linen, soft-hand print that sits in the " +
  "fabric with visible cotton texture through it, straight-on overhead shot, even soft daylight, colours exactly as " +
  "in the reference, no text anywhere";
const DTF_LIFE = "product photograph: a person from the shoulders down wearing a butter-yellow garment-dyed heavyweight " +
  "cotton t-shirt with the emblem from the reference image printed large and centred on the chest, standing against " +
  "a warm neutral wall, relaxed casual fit, soft daylight, waist-up crop, no face visible, colours exactly as in the " +
  "reference, no text anywhere";

const JOBS: [string,string,string][] = [
  ["A_laurel_20_emb.png",  "A_emb_macro",   EMB_MACRO],
  ["A_laurel_20_emb.png",  "A_emb_life",    EMB_LIFE],
  ["B2_shield_emb.png",    "B_emb_macro",   EMB_MACRO],
  ["B2_shield_emb.png",    "B_emb_life",    EMB_LIFE],
  ["A_laurel_20_print.png","A_dtf_front",   DTF_FRONT],
  ["A_laurel_20_print.png","A_dtf_life",    DTF_LIFE],
  ["B2_shield_final.png",  "B_dtf_front",   DTF_FRONT],
  ["B2_shield_final.png",  "B_dtf_life",    DTF_LIFE],
];

const cache = new Map<string,string>();
for (const [art, name, prompt] of JOBS) {
  if (!cache.has(art)) cache.set(art, await uploadPng(await readFile(`${DIR}/${art}`), art));
  const job = await callTool("generate_image", { params: {
    model:"nano_banana_pro", prompt, aspect_ratio:"1:1", resolution:"4k",
    medias:[{role:"image", value:cache.get(art)}] } });
  const id = jobIdOf(job);
  if (!id) { console.log(`${name}: job yok`); continue; }
  let ok=false;
  for (let i=0;i<50;i++){
    await new Promise(r=>setTimeout(r,8000));
    const st=await callTool("job_status",{jobId:id,sync:true}); const s=statusOf(st);
    if (s==="completed"){ const u=rawUrlOf(st);
      if(u){ await writeFile(`${OUT}/${name}.png`, Buffer.from(await (await fetch(u)).arrayBuffer())); ok=true; }
      break; }
    if (["failed","nsfw","error"].includes(s)) break;
  }
  console.log(`${ok?"✓":"✗"} ${name}`);
}
console.log("mockuplar bitti");
