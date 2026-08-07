/** Re-shoot the shield mockups against the final artwork (big die, ribbon, artifacts cleared). */
import { callTool, jobIdOf, statusOf, rawUrlOf, uploadPng } from "../worker/hf.ts";
import { readFile, writeFile } from "node:fs/promises";
const DIR="/Users/omer/Documents/code/etsy/pipeline/ttrpg-guild";
const mid = await uploadPng(await readFile(`${DIR}/B2_shield_final.png`), "B2.png");
const SHOTS: [string,string][] = [
  ["B2_macro",
   "product photograph: the shield emblem in the reference image embroidered onto the left chest of a folded " +
   "butter-yellow garment-dyed heavyweight cotton t-shirt, the ribbon banner embroidered blank and empty, " +
   "visible satin stitch thread texture with a slightly raised relief, tight macro close-up at a shallow angle, " +
   "soft natural window light, neutral linen surface underneath, shallow depth of field, no text anywhere"],
  ["B2_lifestyle",
   "product photograph: a person from the shoulders down wearing a dark charcoal garment-dyed heavyweight cotton " +
   "t-shirt with the shield emblem from the reference image embroidered small on the left chest, casual relaxed fit, " +
   "seated at a wooden table with polyhedral dice and an open notebook softly out of focus, warm indoor evening " +
   "light, waist-up crop, no face visible, no text anywhere"],
];
for (const [name, prompt] of SHOTS) {
  process.stdout.write(`  ${name} `);
  const job = await callTool("generate_image", { params: {
    model: "nano_banana_pro", prompt, aspect_ratio: "1:1", resolution: "4k",
    medias: [{ role: "image", value: mid }] } });
  const id = jobIdOf(job); if (!id) { console.log("✗"); continue; }
  for (let i=0;i<50;i++){
    await new Promise(r=>setTimeout(r,8000));
    const st=await callTool("job_status",{jobId:id,sync:true}); const s=statusOf(st);
    if (s==="completed"){ const u=rawUrlOf(st); if(u) await writeFile(`${DIR}/mockups/${name}.png`, Buffer.from(await (await fetch(u)).arrayBuffer())); console.log("✓"); break; }
    if (["failed","nsfw","error"].includes(s)){ console.log(`✗ ${s}`); break; }
    process.stdout.write(".");
  }
}
