import { copyFile, mkdir, readFile, rm, writeFile, cp } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stage = path.join(root, ".pages-build");
const output = path.join(root, "dist", "pages");
const basePath = process.env.PAGES_BASE_PATH ?? "/SampleDB";
if (basePath !== "" && !/^\/[A-Za-z0-9._-]+$/.test(basePath)) {
  throw new Error(
    "PAGES_BASE_PATH must be empty or a single /repository segment.",
  );
}

// Build only the browser workspace. Never copy credentials, SQLite, APIs or proxy.
await rm(stage, { recursive: true, force: true });
const frontendFiles = [
  "app/components/workspace.tsx",
  "app/components/workspace.css",
  "app/layout.tsx",
  "app/globals.css",
  "lib/workspace-model.ts",
  "lib/domain.ts",
  "lib/lab-form-config.ts", // FieldConfig is imported as a type only.
  "lab-form-config.json",
  "package.json",
];
for (const file of frontendFiles) {
  const destination = path.join(stage, file);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(path.join(root, file), destination);
}
await writeFile(
  path.join(stage, "app/page.tsx"),
  'import Workspace from "./components/workspace";\nexport default function Page() { return <Workspace demo published />; }\n',
);
await mkdir(path.join(stage, "app/demo"), { recursive: true });
await writeFile(
  path.join(stage, "app/demo/page.tsx"),
  'export { default } from "../page";\n',
);
await writeFile(
  path.join(stage, "next.config.mjs"),
  `export default ${JSON.stringify({
    output: "export",
    trailingSlash: true,
    basePath,
    images: { unoptimized: true },
    env: { NEXT_PUBLIC_PAGES_BASE_PATH: basePath },
  })};\n`,
);
const tsconfig = JSON.parse(
  await readFile(path.join(root, "tsconfig.json"), "utf8"),
);
tsconfig.exclude = ["node_modules"];
await writeFile(
  path.join(stage, "tsconfig.json"),
  JSON.stringify(tsconfig, null, 2),
);
const result = spawnSync(
  process.execPath,
  [
    path.join(root, "node_modules/next/dist/bin/next"),
    "build",
    stage,
    "--webpack",
  ],
  {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  },
);
if (result.status !== 0) process.exit(result.status ?? 1);
await rm(output, { recursive: true, force: true });
await mkdir(path.dirname(output), { recursive: true });
await cp(path.join(stage, "out"), output, { recursive: true });
await writeFile(path.join(output, ".nojekyll"), "");
console.log(`Static workspace ready: ${output} (base path ${basePath || "/"})`);
