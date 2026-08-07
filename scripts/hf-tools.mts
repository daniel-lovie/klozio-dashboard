import { callTool } from "../worker/hf.ts";
// tools/list is not exposed through callTool, so reach the RPC layer the same way it does
const mod: any = await import("../worker/hf.ts");
const res = await (async () => {
  // callTool initialises the session; use a harmless call first
  try { await callTool("job_status", { jobId: "00000000-0000-0000-0000-000000000000", sync: false }); } catch {}
  return null;
})();
