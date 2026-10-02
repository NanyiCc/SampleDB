import path from "node:path";
import * as readline from "node:readline/promises";
import {
  PROJECT_ROOT,
  argumentValue,
  commandFor,
  localNetworkAddresses,
  pathExists,
  requireSupportedNode,
  run
} from "./shared.mjs";
import { ensureAdminCredential } from "./admin-credentials.mjs";

async function chooseMode(args) {
  if (args.includes("--local") && args.includes("--lan")) {
    throw new Error("--local 与 --lan 不能同时使用。\n");
  }
  if (args.includes("--local")) {
    return "local";
  }
  if (args.includes("--lan")) {
    return "lan";
  }
  if (!process.stdin.isTTY) {
    throw new Error("请在非交互环境中明确指定 --local 或 --lan。\n");
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question("选择启动范围：1) 仅本机  2) 内网开放  [1] ");
  rl.close();
  return answer.trim() === "2" ? "lan" : "local";
}

function portFrom(args) {
  const value = argumentValue(args, "--port") ?? "3000";
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("--port 必须是 1 到 65535 的整数。\n");
  }
  return port;
}

async function main() {
  requireSupportedNode();
  if (!(await pathExists(path.join(PROJECT_ROOT, ".next", "BUILD_ID")))) {
    throw new Error("未找到生产构建。请先执行 npm run build，或在迁移包中执行 npm run portable:restore。\n");
  }

  const args = process.argv.slice(2);
  await ensureAdminCredential();
  const mode = await chooseMode(args);
  const port = portFrom(args);

  const host = mode === "lan" ? "0.0.0.0" : "127.0.0.1";
  console.log("");
  if (mode === "local") {
    console.log(`仅本机访问： http://127.0.0.1:${port}`);
  } else {
    console.log(`本机访问： http://127.0.0.1:${port}`);
    const addresses = localNetworkAddresses();
    for (const address of addresses) {
      console.log(`内网访问： http://${address}:${port}`);
    }
    console.log("请确保系统防火墙允许同一内网访问该端口。\n");
  }

  await run(commandFor("npm"), ["run", "start:next", "--", "-H", host, "-p", String(port)]);
}

main().catch((error) => {
  console.error(`\n启动失败：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
