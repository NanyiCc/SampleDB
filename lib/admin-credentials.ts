import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type StoredAdminCredential = {
  version: 1;
  username: string;
  displayName: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
};

export function adminCredentialPath(environment: NodeJS.ProcessEnv = process.env) {
  const configuredPath = environment.SAMPLEDB_ADMIN_CREDENTIAL_PATH?.trim();
  if (configuredPath) {
    return path.resolve(/* turbopackIgnore: true */ configuredPath);
  }

  if (process.platform === "darwin") {
    return path.join(
      /* turbopackIgnore: true */ os.homedir(),
      "Library",
      "Application Support",
      "SampleDB",
      "admin-credential.json"
    );
  }
  if (process.platform === "win32") {
    return path.join(
      environment.LOCALAPPDATA || path.join(/* turbopackIgnore: true */ os.homedir(), "AppData", "Local"),
      "SampleDB",
      "admin-credential.json"
    );
  }
  return path.join(
    environment.XDG_STATE_HOME || path.join(/* turbopackIgnore: true */ os.homedir(), ".local", "state"),
    "sampledb",
    "admin-credential.json"
  );
}

function isStoredAdminCredential(value: unknown): value is StoredAdminCredential {
  if (!value || typeof value !== "object") {
    return false;
  }
  const credential = value as Record<string, unknown>;
  return (
    credential.version === 1 &&
    typeof credential.username === "string" &&
    credential.username.trim().length > 0 &&
    typeof credential.displayName === "string" &&
    credential.displayName.trim().length > 0 &&
    typeof credential.passwordHash === "string" &&
    credential.passwordHash.startsWith("scrypt$") &&
    typeof credential.createdAt === "string" &&
    typeof credential.updatedAt === "string"
  );
}

export async function readStoredAdminCredential(): Promise<StoredAdminCredential | null> {
  const credentialPath = adminCredentialPath();
  try {
    const content = await readFile(/* turbopackIgnore: true */ credentialPath, "utf8");
    const parsed: unknown = JSON.parse(content);
    if (!isStoredAdminCredential(parsed)) {
      throw new Error("格式不正确");
    }
    return parsed;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return null;
    }
    throw new Error(`无法读取管理员凭据文件 ${credentialPath}：${error instanceof Error ? error.message : String(error)}`);
  }
}
