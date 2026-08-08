/** Worn mockups for the crest pair, with the placeholder name visible.
 *  House rule (user, 2026-08-07): the Etsy cover must always be the product ON A PERSON. */
import { callTool, jobIdOf, statusOf, rawUrlOf, uploadPng } from "../worker/hf.ts";
import { readFile, writeFile } from "node:fs/promises";
const DIR="/Users/omer/Documents/code/etsy/pipeline/ttrpg-guild";
const JOBS: [string,string,string][] = [
 ["B2_shield_emb_ph.png","B2_emb_worn_ph",
  "product photograph: a person from the shoulders down wearing a dark charcoal garment-dyed heavyweight cotton " +
  "t-shirt with the shield emblem from the reference image embroidered on the left chest. The ribbon clearly " +
  "shows the stitched name KAELEN and the die face shows 20, exactly as in the reference. Seated at a wooden " +
  "table with polyhedral dice and an open notebook softly out of focus, warm indoor evening light, waist-up " +
  "crop, no face visible, colours exactly as in the reference, no other text anywhere"],
 ["B2_shield_final_ph.png","B2_dtf_worn_ph",
  "product photograph: a person from the shoulders down wearing a butter-yellow garment-dyed heavyweight cotton " +
  "t-shirt with the shield emblem from the reference image printed large and centred on the chest. The ribbon " +
  "clearly shows the name KAELEN and the die shows 20, exactly as in the reference. Standing against a warm " +
  "neutral wall, relaxed casual fit, soft daylight, waist-up crop, no face visible, colours exactly as in the " +
  "reference, no other text anywhere"],
];
const cache=new Map<string,string>();
for (const [art,name,prompt] of JOBS){
  if(!cache.has(art)) cache.set(art, await uploadPng(await readFile(`${DIR}/${art}`), art));
  const job=await callTool("generate_image",{params:{model:"nano_banana_pro",prompt,
    aspect_ratio:"1:1",resolution:"4k",medias:[{role:"image",value:cache.get(art)}]}});
  const id=jobIdOf(job); if(!id){console.log(`${name}: job yok`); continue;}
  for(let i=0;i<50;i++){
    await new Promise(r=>setTimeout(r,8000));
    const st=await callTool("job_status",{jobId:id,sync:true}); const s=statusOf(st);
    if(s==="completed"){ const u=rawUrlOf(st);
      if(u) await writeFile(`${DIR}/mockups/${name}.png`, Buffer.from(await (await fetch(u)).arrayBuffer()));
      console.log(`✓ ${name}`); break; }
    if(["failed","nsfw","error"].includes(s)){ console.log(`✗ ${name} ${s}`); break; }
  }
}
console.log("bitti");
