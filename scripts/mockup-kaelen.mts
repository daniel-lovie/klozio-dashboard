/** Re-shoot the crest hero with the placeholder name in the ribbon.
 *
 *  The listing photos show an EMPTY banner while the product now carries the buyer's name there. An
 *  empty ribbon does not communicate the offer — the single strongest signal on a personalised
 *  listing is seeing a name in the place your name will go. Same artwork the personalizer swaps, so
 *  photo and product agree.
 */
import { callTool, jobIdOf, statusOf, rawUrlOf, uploadPng } from "../worker/hf.ts";
import { readFile, writeFile } from "node:fs/promises";
const DIR="/Users/omer/Documents/code/etsy/pipeline/ttrpg-guild";
const JOBS: [string,string,string][] = [
 ["B2_shield_emb_ph.png","B2_emb_macro_ph",
  "product photograph: the shield emblem in the reference image embroidered on the left chest of a folded " +
  "butter-yellow garment-dyed heavyweight cotton t-shirt. The ribbon banner clearly shows the stitched name " +
  "KAELEN and the die face shows the number 20, exactly as in the reference. Visible satin stitch thread " +
  "texture with slightly raised relief, macro at a shallow angle, soft natural window light, neutral linen " +
  "underneath, colours exactly as in the reference, no other text anywhere"],
 ["B2_shield_final_ph.png","B2_dtf_front_ph",
  "product photograph: a complete dark charcoal garment-dyed heavyweight cotton t-shirt laid flat on pale " +
  "linen, whole garment visible with collar, sleeves and hem in frame, the shield emblem from the reference " +
  "image printed centred on the chest at about a third of the shirt width. The ribbon clearly shows the name " +
  "KAELEN and the die shows 20, exactly as in the reference. Soft-hand print with cotton texture showing " +
  "through, straight-on overhead shot, even soft daylight, colours exactly as in the reference, no other text"],
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
