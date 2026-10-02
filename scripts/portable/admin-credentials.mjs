import { chmod, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { randomBytes, scryptSync } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as readline from "node:readline/promises";
import {
  PROJECT_ROOT,
  argumentValue,
  pathExists,
  readEnvFile,
  requireSupportedNode
} from "./shared.mjs";

function credentialPathFor(environment) {
  const configuredPath = environment.SAMPLEDB_ADMIN_CREDENTIAL_PATH?.trim();
  if (configuredPath) {
    return path.resolve(PROJECT_ROOT, configuredPath);
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "SampleDB", "admin-credential.json");
  }
  if (process.platform === "win32") {
    return path.join(
      environment.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"),
      "SampleDB",
      "admin-credential.json"
    );
  }
  return path.join(
    environment.XDG_STATE_HOME || path.join(os.homedir(), ".local", "state"),
    "sampledb",
    "admin-credential.json"
  );
}

async function resolvedCredentialPath(args = []) {
  const explicitPath = argumentValue(args, "--path");
  if (explicitPath) {
    return path.resolve(PROJECT_ROOT, explicitPath);
  }
  const fileEnvironment = await readEnvFile();
  return credentialPathFor({ ...fileEnvironment, ...process.env });
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const digest = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${digest}`;
}

async function promptText(question, defaultValue = "") {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(defaultValue ? `${question} [${defaultValue}] ` : question);
  rl.close();
  return answer.trim() || defaultValue;
}

async function promptSecret(question) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
    throw new Error("需要在交互式终端中设置管理员密码。\n");
  }

  process.stdout.write(question);
  const wasRaw = process.stdin.isRaw;
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");

  return new Promise((resolve, reject) => {
    let value = "";
    const finish = (error) => {
      process.stdin.off("data", onData);
      process.stdin.setRawMode(wasRaw);
      process.stdout.write("\n");
      if (error) {
        reject(error);
      } else {
        resolve(value);
      }
    };
    const onData = (chunk) => {
      const character = String(chunk);
      if (character === "\u0003") {
        finish(new Error("已取消管理员凭据初始化。\n"));
      } else if (character === "\r" || character === "\n") {
        finish();
      } else if (character === "\u007f" || character === "\b") {
        value = value.slice(0, -1);
      } else if (!character.startsWith("\u001b")) {
        value += character;
      }
    };
    process.stdin.on("data", onData);
  });
}

async function readCredential(credentialPath) {
  if (!(await pathExists(credentialPath))) {
    return null;
  }
  const { readFile } = await import("node:fs/promises");
  try {
    const parsed = JSON.parse(await readFile(credentialPath, "utf8"));
    if (
      parsed?.version === 1 &&
      typeof parsed.username === "string" &&
      typeof parsed.displayName === "string" &&
      typeof parsed.passwordHash === "string" &&
      parsed.passwordHash.startsWith("scrypt$")
    ) {
      return parsed;
    }
  } catch {
    // Continue with a clear error below so an invalid credential file is never silently overwritten.
  }
  throw new Error(`管理员凭据文件格式无效：${credentialPath}\n`);
}

async function writeCredential(credentialPath, credential) {
  const directory = path.dirname(credentialPath);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700).catch(() => undefined);
  const temporaryPath = path.join(directory, `.admin-credential-${process.pid}-${Date.now()}.tmp`);
  await writeFile(temporaryPath, `${JSON.stringify(credential, null, 2)}\n`, { mode: 0o600 });
  await chmod(temporaryPath, 0o600).catch(() => undefined);
  await rename(temporaryPath, credentialPath);
}

export async function ensureAdminCredential() {
  requireSupportedNode();
  const credentialPath = await resolvedCredentialPath();
  const existing = await readCredential(credentialPath);
  if (existing) {
    return { credentialPath, created: false, credential: existing };
  }
  if (!process.stdin.isTTY) {
    throw new Error(`未找到管理员凭据文件：${credentialPath}\n请在交互式终端执行启动命令完成初始化。\n`);
  }

  console.log("\n首次启动：请设置独立保存的管理员账号。密码不会保存为明文。\n");
  const username = await promptText("管理员用户名：", "admin");
  if (!/^[A-Za-z0-9_.-]{2,64}$/.test(username)) {
    throw new Error("管理员用户名只能包含字母、数字、点、下划线或连字符，长度为 2–64。\n");
  }
  const displayName = await promptText("管理员显示名称：", username);
  const password = await promptSecret("管理员密码（至少 10 位，输入不回显）：");
  if (password.length < 10) {
    throw new Error("管理员密码至少需要 10 位。\n");
  }
  const confirmation = await promptSecret("再次输入管理员密码：");
  if (password !== confirmation) {
    throw new Error("两次输入的管理员密码不一致。\n");
  }

  const now = new Date().toISOString();
  const credential = {
    version: 1,
    username,
    displayName,
    passwordHash: hashPassword(password),
    createdAt: now,
    updatedAt: now
  };
  await writeCredential(credentialPath, credential);
  console.log(`\n管理员凭据已独立保存：${credentialPath}`);
  console.log(`如需重置，停止服务后执行：sudo rm -f "${credentialPath}"\n`);
  return { credentialPath, created: true, credential };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--show-path")) {
    console.log(await resolvedCredentialPath(args));
    return;
  }
  if (args.includes("--reset")) {
    const credentialPath = await resolvedCredentialPath(args);
    await rm(credentialPath, { force: true });
    console.log(`已删除管理员凭据文件：${credentialPath}`);
    return;
  }
  await ensureAdminCredential();
}

const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : "";
const currentFile = fileURLToPath(import.meta.url);
if (invokedFile === currentFile) {
  main().catch((error) => {
    console.error(`\n管理员初始化失败：${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
