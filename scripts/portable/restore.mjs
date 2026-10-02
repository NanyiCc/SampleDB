import { copyFile } from "node:fs/promises";
import path from "node:path";
import {
  PROJECT_ROOT,
  commandFor,
  pathExists,
  requireSupportedNode,
  run
} from "./shared.mjs";

async function ensureEnvironmentFile() {
  const envPath = path.join(PROJECT_ROOT, ".env");
  if (await pathExists(envPath)) {
    console.log("保留现有 .env 配置。\n");
    return;
  }

  const templatePath = path.join(PROJECT_ROOT, ".env.example");
  if (!(await pathExists(templatePath))) {
    throw new Error("没有找到 .env 或 .env.example，无法配置数据库与管理员账号。\n");
  }

  await copyFile(templatePath, envPath);
  console.log("已从 .env.example 创建 .env。请在内网开放前修改管理员密码。\n");
}

async function main() {
  requireSupportedNode();
  const args = process.argv.slice(2);
  const requiredFiles = ["package.json", "package-lock.json", "prisma/schema.prisma", "prisma/dev.db", "portable-manifest.json"];
  for (const file of requiredFiles) {
    if (!(await pathExists(path.join(PROJECT_ROOT, file)))) {
      throw new Error(`未找到 ${file}。请先解压完整的 SampleDB 迁移包，并在解压后的项目目录运行此命令。\n`);
    }
  }

  await ensureEnvironmentFile();
  console.log("安装锁定版本的依赖…\n");
  await run(commandFor("npm"), ["ci"]);
  console.log("\n生成数据库客户端并核对数据库结构…\n");
  await run(commandFor("npx"), ["prisma", "generate"]);
  await run(commandFor("npx"), ["prisma", "db", "push", "--skip-generate"]);
  console.log("\n构建生产版本…\n");
  await run(commandFor("npm"), ["run", "build"]);

  console.log("\n恢复完成。可执行 npm run portable:start 选择本机或内网启动模式。\n");

  if (args.includes("--start")) {
    const startArguments = [path.join(PROJECT_ROOT, "scripts", "portable", "start.mjs")];
    for (const argument of args) {
      if (argument !== "--start") {
        startArguments.push(argument);
      }
    }
    await run(process.execPath, startArguments);
  }
}

main().catch((error) => {
  console.error(`\n恢复失败：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
