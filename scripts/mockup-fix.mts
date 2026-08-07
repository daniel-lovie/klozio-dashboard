/** Re-shoot the two mockups that failed QA.
 *
 *  A_emb_macro came back with a BLANK die face — the model silently dropped the "20", which is the
 *  one symbol this audience reads, and that file was going to be the cover. A_dtf_front read as a
 *  giant patch lying on fabric rather than a t-shirt. Both prompts now state the numeral explicitly
 *  and describe the whole garment in frame.
 */
import { callTool, jobIdOf, statusOf, rawUrlOf, uploadPng } from "../worker/hf.ts";
import { readFile, writeFile } from "node:fs/promises";
const DIR="/Users/omer/Documents/code/etsy/pipeline/ttrpg-guild";
const JOBS: [string,string,string][] = [
 ["A_laurel_20_emb.png","A_emb_macro",
  "product photograph: the emblem in the reference image embroidered on the left chest of a folded butter-yellow " +
  "garment-dyed heavyweight cotton t-shirt. The centre face of the twenty-sided die clearly shows the number 20, " +
  "exactly as in the reference image — do not leave the die face blank. Visible satin stitch thread texture with " +
  "slightly raised relief, macro at a shallow angle, soft natural window light, neutral linen underneath, colours " +
  "exactly as in the reference, no other text anywhere"],
 ["A_laurel_20_print.png","A_dtf_front",
  "product photograph: a complete dark charcoal garment-dyed heavyweight cotton t-shirt laid flat on pale linen, the " +
  "whole garment visible with collar, both sleeves and hem in frame, the emblem from the reference image printed " +
  "centred on the chest at about a third of the shirt width. The centre face of the die clearly shows the number 20 " +
  "exactly as in the reference. Soft-hand print with cotton texture showing through, straight-on overhead shot, even " +
  "soft daylight, colours exactly as in the reference, no other text anywhere"],
];
const cache=new Map<string,string>();
for (const [art,name,prompt] of JOBS){
  if(!cache.has(art)) cache.set(art, await uploadPng(await readFile(`${DIR}/${art}`), art));
  const job=await callTool("generate_image",{params:{model:"nano_banana_pro",prompt,aspect_ratio:"1:1",
    resolution:"4k", medias:[{role:"image",value:cache.get(art)}]}});
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
console.log("duzeltme bitti");
