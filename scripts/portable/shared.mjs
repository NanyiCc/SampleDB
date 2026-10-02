import { access, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));

export const PROJECT_ROOT = path.resolve(moduleDirectory, "../..");

export function timestamp() {
  const date = new Date();
  const parts = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
    String(date.getSeconds()).padStart(2, "0")
  ];
  return `${parts[0]}${parts[1]}${parts[2]}-${parts[3]}${parts[4]}${parts[5]}`;
}

export async function pathExists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

export function requireSupportedNode() {
  const major = Number(process.versions.node.split(".")[0]);
  if (!Number.isInteger(major) || major < 20) {
    throw new Error(`当前 Node.js 为 ${process.version}；请安装 Node.js 20 LTS 或更高版本。`);
  }
}

export function commandFor(command) {
  return process.platform === "win32" ? `${command}.cmd` : command;
}

export function run(command, args, { cwd = PROJECT_ROOT, env, input } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: env ? { ...process.env, ...env } : process.env,
      stdio: input === undefined ? "inherit" : ["pipe", "inherit", "inherit"],
      shell: false
    });

    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} 执行失败${signal ? `（信号：${signal}）` : `（退出码：${code}）`}`));
    });

    if (input !== undefined) {
      child.stdin.end(input);
    }
  });
}

export function argumentValue(args, name) {
  const index = args.indexOf(name);
  if (index === -1) {
    return null;
  }
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} 需要提供一个值。`);
  }
  return value;
}

export async function readEnvFile(filePath = path.join(PROJECT_ROOT, ".env")) {
  if (!(await pathExists(filePath))) {
    return {};
  }

  const result = {};
  const content = await readFile(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) {
      continue;
    }
    const [, key, rawValue] = match;
    const quote = rawValue[0];
    result[key] =
      (quote === '"' || quote === "'") && rawValue.endsWith(quote)
        ? rawValue.slice(1, -1)
        : rawValue;
  }
  return result;
}

export function localNetworkAddresses() {
  const addresses = [];
  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const network of interfaces ?? []) {
      if (network.family === "IPv4" && !network.internal) {
        addresses.push(network.address);
      }
    }
  }
  return [...new Set(addresses)];
}
