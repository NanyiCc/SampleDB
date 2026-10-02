import { commandFor, requireSupportedNode, run } from "./shared.mjs";
import { ensureAdminCredential } from "./admin-credentials.mjs";

async function main() {
  requireSupportedNode();
  const args = process.argv.slice(2);
  if (args.includes("--local") && args.includes("--lan")) {
    throw new Error("--local 与 --lan 不能同时使用。\n");
  }
  await ensureAdminCredential();
  const host = args.includes("--lan") ? "0.0.0.0" : "127.0.0.1";
  await run(commandFor("npx"), ["next", "dev", "-H", host, "-p", "3000"]);
}

main().catch((error) => {
  console.error(`\n开发服务启动失败：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
