import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputFlag = process.argv.indexOf("--output");

if (outputFlag !== -1 && !process.argv[outputFlag + 1]) {
  throw new Error("--output requires a directory");
}

const outputDirectory =
  outputFlag === -1 ? undefined : resolve(repositoryRoot, process.argv[outputFlag + 1]);

function run(command, args, cwd, options = {}) {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    env: options.env ?? process.env,
    stdio: options.capture ? ["ignore", "pipe", "inherit"] : "inherit",
  });
}

const status = run(
  "git",
  ["status", "--porcelain", "--untracked-files=all"],
  repositoryRoot,
  { capture: true },
).trim();

if (status !== "") {
  throw new Error("package smoke tests require a clean committed working tree");
}

const temporaryRoot = mkdtempSync(join(tmpdir(), "ark-package-smoke-"));
const archivePath = join(temporaryRoot, "source.tar");
const sourceDirectory = join(temporaryRoot, "source");
const consumerDirectory = join(temporaryRoot, "consumer");
const isolatedHome = join(temporaryRoot, "home");
const isolatedCache = join(temporaryRoot, "npm-cache");

mkdirSync(sourceDirectory, { recursive: true });
mkdirSync(consumerDirectory, { recursive: true });
mkdirSync(isolatedHome, { recursive: true });
mkdirSync(isolatedCache, { recursive: true });

const isolatedEnvironment = {
  ...process.env,
  HOME: isolatedHome,
  NPM_CONFIG_AUDIT: "false",
  NPM_CONFIG_CACHE: isolatedCache,
  NPM_CONFIG_FUND: "false",
  NPM_CONFIG_UPDATE_NOTIFIER: "false",
};

try {
  run(
    "git",
    ["archive", "--format=tar", `--output=${archivePath}`, "HEAD"],
    repositoryRoot,
  );
  run("tar", ["--extract", "--file", archivePath, "--directory", sourceDirectory], repositoryRoot);

  if (existsSync(join(sourceDirectory, "dist"))) {
    throw new Error("the pristine Git archive unexpectedly contains dist/");
  }

  run("npm", ["ci", "--no-audit", "--no-fund"], sourceDirectory, {
    env: isolatedEnvironment,
  });

  if (existsSync(join(sourceDirectory, "dist"))) {
    throw new Error("npm ci created dist/ before the package prepack lifecycle");
  }

  const packOutput = run("npm", ["pack", "--silent"], sourceDirectory, {
    capture: true,
    env: isolatedEnvironment,
  });
  const tarballName = packOutput
    .trim()
    .split(/\r?\n/u)
    .findLast((line) => line.endsWith(".tgz"));

  if (!tarballName) {
    throw new Error(`npm pack did not report a tarball: ${packOutput}`);
  }

  const tarballPath = join(sourceDirectory, tarballName);
  const archiveListing = run("tar", ["--list", "--file", tarballPath], sourceDirectory, {
    capture: true,
  });
  const archiveEntries = new Set(archiveListing.trim().split(/\r?\n/u));
  const requiredEntries = [
    "package/LICENSE",
    "package/README.md",
    "package/RELEASING.md",
    "package/dist/index.d.ts",
    "package/dist/index.js",
    "package/dist/index.js.map",
    "package/package.json",
    "package/src/index.ts",
    "package/tsconfig.json",
    "package/tsup.config.ts",
  ];

  for (const requiredEntry of requiredEntries) {
    if (!archiveEntries.has(requiredEntry)) {
      throw new Error(`packed artifact is missing ${requiredEntry}`);
    }
  }

  if ([...archiveEntries].some((entry) => entry.includes("bun.lockb"))) {
    throw new Error("packed artifact still contains the retired Bun lockfile");
  }

  const packedManifest = JSON.parse(
    run(
      "tar",
      ["--extract", "--to-stdout", "--file", tarballPath, "package/package.json"],
      sourceDirectory,
      { capture: true },
    ),
  );

  if (packedManifest.sideEffects !== false) {
    throw new Error("packed manifest must declare sideEffects: false");
  }

  if (packedManifest.peerDependencies?.typescript) {
    throw new Error("packed manifest must not impose a consumer TypeScript peer");
  }

  if (packedManifest.devDependencies?.["@types/bun"]) {
    throw new Error("packed manifest must not depend on unbounded Bun types");
  }

  const sourceMap = JSON.parse(
    run(
      "tar",
      ["--extract", "--to-stdout", "--file", tarballPath, "package/dist/index.js.map"],
      sourceDirectory,
      { capture: true },
    ),
  );

  if (!Array.isArray(sourceMap.sourcesContent) || sourceMap.sourcesContent.length === 0) {
    throw new Error("packed JavaScript source map does not contain source content");
  }

  writeFileSync(
    join(consumerDirectory, "package.json"),
    `${JSON.stringify({ name: "package-smoke-consumer", private: true, type: "module" }, null, 2)}\n`,
  );
  run(
    "npm",
    ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--offline", tarballPath],
    consumerDirectory,
    { env: isolatedEnvironment },
  );

  writeFileSync(
    join(consumerDirectory, "runtime-smoke.mjs"),
    `import * as api from "ark-of-atrahasis";

if (typeof api.createSafeDocument !== "function") {
  throw new Error("installed ESM package does not export createSafeDocument");
}

const resolved = import.meta.resolve("ark-of-atrahasis");
if (!resolved.includes("/node_modules/ark-of-atrahasis/dist/index.js")) {
  throw new Error(\`runtime resolved outside the installed tarball: \${resolved}\`);
}
`,
  );
  run("node", ["runtime-smoke.mjs"], consumerDirectory, { env: isolatedEnvironment });

  writeFileSync(
    join(consumerDirectory, "declarations-smoke.ts"),
    `import {
  createSafeDocument,
  type SafeDocument,
  type SafeElement,
} from "ark-of-atrahasis";

const factory: (root: ShadowRoot) => SafeDocument = createSafeDocument;
declare const safeDocument: SafeDocument;
const element: SafeElement = safeDocument.createDiv();
element.setText("declaration smoke");
void factory;
void element;
`,
  );
  writeFileSync(
    join(consumerDirectory, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          lib: ["ES2022", "DOM"],
          module: "NodeNext",
          moduleResolution: "NodeNext",
          noEmit: true,
          skipLibCheck: false,
          strict: true,
          target: "ES2022",
        },
        files: ["declarations-smoke.ts"],
      },
      null,
      2,
    )}\n`,
  );
  run(
    join(sourceDirectory, "node_modules", ".bin", "tsc"),
    ["--project", join(consumerDirectory, "tsconfig.json")],
    consumerDirectory,
    { env: isolatedEnvironment },
  );

  const digest = createHash("sha256").update(readFileSync(tarballPath)).digest("hex");

  if (outputDirectory) {
    mkdirSync(outputDirectory, { recursive: true });
    const verifiedArtifact = join(outputDirectory, basename(tarballPath));
    copyFileSync(tarballPath, verifiedArtifact);
    console.log(`Verified ${verifiedArtifact} (sha256 ${digest})`);
  } else {
    console.log(`Verified ${tarballName} (sha256 ${digest})`);
  }
} finally {
  rmSync(temporaryRoot, { force: true, recursive: true });
}
