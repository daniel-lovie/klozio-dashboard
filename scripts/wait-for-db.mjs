import { execSync } from "child_process";
process.stdout.write("waiting for postgres");
for (let i = 0; i < 40; i++) {
  try {
    execSync("docker exec klozio-db pg_isready -U klozio -d klozio", { stdio: "ignore" });
    console.log(" ✅");
    process.exit(0);
  } catch { process.stdout.write("."); await new Promise(r => setTimeout(r, 750)); }
}
console.error("\n❌ postgres did not become ready");
process.exit(1);
