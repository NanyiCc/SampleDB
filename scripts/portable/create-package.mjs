import { cp, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import os from "node:os";
import path from "node:path";
import * as readline from "node:readline/promises";
import {
  PROJECT_ROOT,
  argumentValue,
  commandFor,
  pathExists,
  requireSupportedNode,
  run,
  timestamp
} from "./shared.mjs";

const EXCLUDED_DIRECTORIES = new Set([
  ".agents",
  ".codex",
  ".git",
  ".next",
  ".pages-build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "portable-packages"
]);

function shouldCopy(source) {
  const relative = path.relative(PROJECT_ROOT, source);
  if (!relative) {
    return true;
  }

  const parts = relative.split(path.sep);
  if (parts.some((part) => EXCLUDED_DIRECTORIES.has(part))) {
    return false;
  }

  const name = path.basename(source);
  if (name === ".env" || (name.startsWith(".env.") && name !== ".env.example")) {
    return false;
  }
  return name !== ".DS_Store" && !name.endsWith(".tsbuildinfo");
}

async function confirmDatabaseSnapshot(args) {
  if (args.includes("--yes")) {
    return;
  }

  if (!process.stdin.isTTY) {
    throw new Error("非交互环境请加入 --yes，并确保网页服务已停止后再打包数据库。\n");
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question("请确认网页服务已停止，以保证数据库快照完整。继续打包？[y/N] ");
  rl.close();
  if (!/^y(es)?$/i.test(answer.trim())) {
    throw new Error("已取消打包。请先停止网页服务后重试。\n");
  }
}

function sha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function main() {
  requireSupportedNode();
  const args = process.argv.slice(2);
  const databasePath = path.join(PROJECT_ROOT, "prisma", "dev.db");
  if (!(await pathExists(databasePath))) {
    throw new Error("未找到 prisma/dev.db，无法创建包含现有数据的迁移包。\n");
  }

  await confirmDatabaseSnapshot(args);

  const outputOption = argumentValue(args, "--output");
  const outputDirectory = path.resolve(PROJECT_ROOT, outputOption ?? "portable-packages");
  const packageName = `SampleDB-portable-${timestamp()}`;
  const stagingDirectory = await mkdtemp(path.join(os.tmpdir(), "sampledb-portable-"));
  const projectCopy = path.join(stagingDirectory, packageName);
  const archivePath = path.join(outputDirectory, `${packageName}.tar.gz`);

  await mkdir(outputDirectory, { recursive: true });

  try {
    await cp(PROJECT_ROOT, projectCopy, { recursive: true, filter: shouldCopy });
    const database = await stat(path.join(projectCopy, "prisma", "dev.db"));
    const manifest = {
      formatVersion: 1,
      application: "SampleDB",
      createdAt: new Date().toISOString(),
      nodeVersion: process.version,
      database: {
        path: "prisma/dev.db",
        bytes: database.size
      },
      excluded: [
        ".env and .env.* (contains secrets)",
        "node_modules",
        ".next",
        ".pages-build",
        ".git",
        "portable-packages"
      ]
    };
    await writeFile(path.join(projectCopy, "portable-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

    await run("tar", ["-czf", archivePath, "-C", stagingDirectory, packageName]);
    const checksum = await sha256(archivePath);
    await writeFile(path.join(outputDirectory, `${packageName}.sha256`), `${checksum}  ${path.basename(archivePath)}\n`);

    console.log("\n迁移包已创建：");
    console.log(`  ${archivePath}`);
    console.log(`校验文件：${archivePath.replace(/\.tar\.gz$/, ".sha256")}`);
    console.log("说明：数据库、代码、表单配置和实验限制配置已包含；.env 已排除。\n");
  } finally {
    await rm(stagingDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`\n打包失败：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
