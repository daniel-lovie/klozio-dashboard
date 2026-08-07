import { callTool, jobIdOf, statusOf, rawUrlOf, uploadPng } from "../worker/hf.ts";
import { readFile, writeFile } from "node:fs/promises";
const D="/Users/omer/Documents/code/etsy/pipeline/ttrpg-guild";
const mid = await uploadPng(await readFile(`${D}/raw/v1_die_laurel.png`), "v1.png");
const job = await callTool("remove_background", { params: { media_id: mid, media_type: "image" } });
const id = jobIdOf(job); if (!id) throw new Error("no job");
for (let i=0;i<40;i++){
  await new Promise(r=>setTimeout(r,7000));
  const st = await callTool("job_status",{jobId:id,sync:true});
  const s = statusOf(st);
  if (s==="completed"){ const u=rawUrlOf(st); if(!u) throw new Error("no url");
    await writeFile(`${D}/v1_die_laurel_cutout.png`, Buffer.from(await (await fetch(u)).arrayBuffer()));
    console.log("✓ v1 cutout hazir"); break; }
  if (["failed","error","nsfw"].includes(s)) throw new Error(s);
  process.stdout.write(".");
}
