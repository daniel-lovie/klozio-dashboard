// Frees the dev port if a previous server is still holding it.
// EADDRINUSE on 3010 was a recurring papercut; this removes it.
import { execSync } from "child_process";
const port = process.env.PORT || 3010;
try {
  const pids = execSync(`lsof -ti:${port}`, { stdio: ["ignore", "pipe", "ignore"] })
    .toString().trim().split("\n").filter(Boolean);
  if (pids.length) {
    execSync(`kill -9 ${pids.join(" ")}`);
    console.log(`[freeport] killed stale listener on :${port} (pid ${pids.join(", ")})`);
  }
} catch { /* nothing listening — the normal case */ }
