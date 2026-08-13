/** Generic Higgsfield CLI so the Python batch runner can reach the MCP client in worker/hf.ts.
 *
 *  Every existing design-*.mts hardcodes one campaign's prompts, which is why they were only ever
 *  run in ones and twos. This exposes the same three primitives — upload, generate, remove_background
 *  — with the prompt supplied per call, and nothing else. All the auth, SSE parsing and status
 *  heuristics stay in worker/hf.ts.
 *
 *  Usage: node --experimental-strip-types scripts/hf_gen.mts '<json>'
 *    {"op":"generate","prompt":"...","out":"/abs/path.png","ref":"/abs/ref.png"?,"model":"nano_banana_pro"?,
 *     "aspect_ratio":"1:1"?,"resolution":"4k"?}
 *    {"op":"remove_bg","src":"/abs/in.png","out":"/abs/out.png"}
 *    {"op":"upscale","src":"/abs/in.png","out":"/abs/out.png","width":3000?,"height":3000?}
 *  Prints one JSON line: {"ok":true,"out":"...","calls":N,"model":"...","job_id":"..."}
 */
import { callTool, jobIdOf, statusOf, rawUrlOf, uploadPng } from "../worker/hf.ts";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

type Args = {
  op: "generate" | "remove_bg" | "upscale";
  prompt?: string; out: string; src?: string; ref?: string;
  model?: string; aspect_ratio?: string; resolution?: string; quality?: string;
  width?: number; height?: number;
  poll_ms?: number; poll_max?: number;
};

const a: Args = JSON.parse(process.argv[2] ?? "{}");
if (!a.op || !a.out) { console.log(JSON.stringify({ ok: false, error: "op and out are required" })); process.exit(2); }

async function download(url: string, out: string) {
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, Buffer.from(await (await fetch(url)).arrayBuffer()));
}

/** Poll to completion. `nsfw` is a terminal state here, not an error to retry — the moderator
 *  will keep returning it for the same prompt, so the runner should surface it and move on. */
async function poll(jobId: string, everyMs: number, tries: number): Promise<string> {
  for (let i = 0; i < tries; i++) {
    await new Promise((r) => setTimeout(r, everyMs));
    const st = await callTool("job_status", { jobId, sync: true });
    const s = statusOf(st);
    if (s === "completed") {
      const url = rawUrlOf(st);
      if (!url) throw new Error("completed without rawUrl");
      return url;
    }
    if (["failed", "nsfw", "error"].includes(s)) throw new Error(`job ${s}`);
  }
  throw new Error("job timed out");
}

try {
  const everyMs = a.poll_ms ?? 8000;
  const tries = a.poll_max ?? 50;
  const model = a.model ?? "nano_banana_pro";
  let calls = 0;   // billable Higgsfield jobs, for the cost line and usage_events
  let jobId = "";

  if (a.op === "generate") {
    if (!a.prompt) throw new Error("prompt required");
    const params: any = { model, prompt: a.prompt, aspect_ratio: a.aspect_ratio ?? "1:1", resolution: a.resolution ?? "4k" };
    // gpt_image_2 prices by quality tier (low/medium/high), so it has to be reachable from the spec
    if (a.quality) params.quality = a.quality;
    if (a.ref) params.medias = [{ role: "image", value: await uploadPng(await readFile(a.ref), "ref.png") }];
    const job = await callTool("generate_image", { params });
    calls++;
    jobId = jobIdOf(job) ?? "";
    if (!jobId) throw new Error("no job id from generate_image");
    await download(await poll(jobId, everyMs, tries), a.out);
  } else if (a.op === "upscale") {
    // Raising an existing print file rather than generating a new one. The design is already approved and,
    // for the live ones, already photographed into eight mockups — regenerating would hand the buyer a
    // different shirt from the one in the listing. This keeps the artwork and only adds pixels.
    if (!a.src) throw new Error("src required");
    const mediaId = await uploadPng(await readFile(a.src), "src.png");
    // The API asks for an explicit target, not a tier: image_id plus the pixel size wanted. 3000 is the
    // print envelope — 10 inches at 300 PPI — so this is the exact size the producer prints, not a guess.
    const side = a.width ?? 3000;
    const job = await callTool("upscale_image", {
      params: { image_id: mediaId, width: side, height: a.height ?? side } });
    calls++;
    jobId = jobIdOf(job) ?? "";
    if (!jobId) throw new Error("no job id from upscale_image");
    await download(await poll(jobId, everyMs, tries), a.out);
  } else {
    if (!a.src) throw new Error("src required");
    const mediaId = await uploadPng(await readFile(a.src), "src.png");
    const job = await callTool("remove_background", { params: { media_id: mediaId, media_type: "image" } });
    calls++;
    jobId = jobIdOf(job) ?? "";
    if (!jobId) throw new Error("no job id from remove_background");
    await download(await poll(jobId, everyMs, tries), a.out);
  }
  console.log(JSON.stringify({ ok: true, out: a.out, calls, model, job_id: jobId }));
} catch (e: any) {
  console.log(JSON.stringify({ ok: false, error: String(e?.message ?? e).slice(0, 300) }));
  process.exit(1);
}
