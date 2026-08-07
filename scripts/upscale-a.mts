/** A's artwork came off a 2048px cutout — 204 DPI at a 10" chest print, visibly soft. Upscale it
 *  with a real upscaler rather than stretching, per the design rules. */
import { callTool, jobIdOf, statusOf, rawUrlOf, uploadPng } from "../worker/hf.ts";
import { readFile, writeFile } from "node:fs/promises";
const DIR="/Users/omer/Documents/code/etsy/pipeline/ttrpg-guild";
const mid = await uploadPng(await readFile(`${DIR}/A_laurel_20.png`), "A_laurel_20.png");
const job = await callTool("upscale_image", { params: { provider: "bytedance", image_id: mid, width: 2048, height: 2048, resolution: "4k" } });
const id = jobIdOf(job);
if (!id) { console.log("job id yok:", JSON.stringify(job).slice(0,220)); process.exit(1); }
for (let i=0;i<45;i++){
  await new Promise(r=>setTimeout(r,8000));
  const st=await callTool("job_status",{jobId:id,sync:true}); const s=statusOf(st);
  if (s==="completed"){ const u=rawUrlOf(st);
    if(!u){ console.log("url yok"); break; }
    await writeFile(`${DIR}/A_laurel_20_4k.png`, Buffer.from(await (await fetch(u)).arrayBuffer()));
    console.log("✓ upscale hazir"); break; }
  if (["failed","error","nsfw"].includes(s)){ console.log("✗",s); break; }
  process.stdout.write(".");
}
