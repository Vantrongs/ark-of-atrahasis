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

const npmExecPath = process.env.npm_execpath;

if (!npmExecPath) {
  throw new Error("run package smoke tests through npm so the pinned npm CLI can be verified");
}

function runNpm(args, cwd, options = {}) {
  return run(process.execPath, [npmExecPath, ...args], cwd, options);
}

function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

function readArchiveEntry(tarballPath, entry, cwd) {
  return run(
    "tar",
    ["--extract", "--to-stdout", "--file", tarballPath, entry],
    cwd,
    { capture: true },
  );
}

function parseTarballName(packOutput) {
  const tarballName = packOutput
    .trim()
    .split(/\r?\n/u)
    .findLast((line) => line.endsWith(".tgz"));

  if (!tarballName) {
    throw new Error(`npm pack did not report a tarball: ${packOutput}`);
  }

  return tarballName;
}

const sourceManifest = JSON.parse(readFileSync(join(repositoryRoot, "package.json"), "utf8"));
const packageManagerMatch = /^npm@(\d+\.\d+\.\d+)$/u.exec(sourceManifest.packageManager ?? "");

if (process.version !== "v22.22.2") {
  throw new Error(`package smoke tests require Node.js v22.22.2, received ${process.version}`);
}

if (!packageManagerMatch) {
  throw new Error("packageManager must pin an exact npm version");
}

const actualNpmVersion = runNpm(["--version"], repositoryRoot, { capture: true }).trim();

if (actualNpmVersion !== packageManagerMatch[1]) {
  throw new Error(
    `package smoke tests require npm ${packageManagerMatch[1]}, received ${actualNpmVersion}`,
  );
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
const rebuildDirectory = join(temporaryRoot, "rebuild");
const isolatedHome = join(temporaryRoot, "home");
const isolatedCache = join(temporaryRoot, "npm-cache");
const emptyConsumerCache = join(temporaryRoot, "consumer-npm-cache");

mkdirSync(sourceDirectory, { recursive: true });
mkdirSync(consumerDirectory, { recursive: true });
mkdirSync(rebuildDirectory, { recursive: true });
mkdirSync(isolatedHome, { recursive: true });
mkdirSync(isolatedCache, { recursive: true });
mkdirSync(emptyConsumerCache, { recursive: true });

const isolatedEnvironment = {
  ...process.env,
  HOME: isolatedHome,
  NPM_CONFIG_AUDIT: "false",
  NPM_CONFIG_CACHE: isolatedCache,
  NPM_CONFIG_FUND: "false",
  NPM_CONFIG_UPDATE_NOTIFIER: "false",
};
const offlineRebuildEnvironment = {
  ...isolatedEnvironment,
  NPM_CONFIG_OFFLINE: "true",
  NPM_CONFIG_REGISTRY: "http://127.0.0.1:9/",
};
const offlineConsumerEnvironment = {
  ...offlineRebuildEnvironment,
  NPM_CONFIG_CACHE: emptyConsumerCache,
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

  if (!existsSync(join(sourceDirectory, "npm-shrinkwrap.json"))) {
    throw new Error("the pristine source archive is missing the publishable build lockfile");
  }

  runNpm(
    ["ci", "--ignore-scripts", "--no-audit", "--no-fund"],
    sourceDirectory,
    { env: isolatedEnvironment },
  );

  if (existsSync(join(sourceDirectory, "dist"))) {
    throw new Error("npm ci created dist/ before the package prepack lifecycle");
  }

  const firstTarballName = parseTarballName(
    runNpm(["pack", "--silent"], sourceDirectory, {
      capture: true,
      env: isolatedEnvironment,
    }),
  );
  const firstTarballPath = join(sourceDirectory, firstTarballName);
  const firstTarballDigest = sha256(readFileSync(firstTarballPath));

  rmSync(firstTarballPath);

  const tarballName = parseTarballName(
    runNpm(["pack", "--silent"], sourceDirectory, {
      capture: true,
      env: isolatedEnvironment,
    }),
  );
  const tarballPath = join(sourceDirectory, tarballName);
  const tarballDigest = sha256(readFileSync(tarballPath));

  if (tarballName !== firstTarballName || tarballDigest !== firstTarballDigest) {
    throw new Error("two consecutive npm prepack builds did not produce byte-identical tarballs");
  }

  const archiveListing = run("tar", ["--list", "--file", tarballPath], sourceDirectory, {
    capture: true,
  });
  const archiveEntries = new Set(archiveListing.trim().split(/\r?\n/u));
  const trackedCorrespondingSource = run(
    "git",
    ["ls-tree", "-r", "--name-only", "HEAD", "src", "scripts", "test"],
    repositoryRoot,
    { capture: true },
  )
    .trim()
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((entry) => `package/${entry}`);
  const requiredEntries = [
    "package/CHANGELOG.md",
    "package/LICENSE",
    "package/README.md",
    "package/RELEASING.md",
    "package/dist/index.d.ts",
    "package/dist/index.js",
    "package/dist/index.js.map",
    "package/npm-shrinkwrap.json",
    "package/package.json",
    "package/tsconfig.json",
    "package/tsup.config.ts",
    ...trackedCorrespondingSource,
  ];

  for (const requiredEntry of requiredEntries) {
    if (!archiveEntries.has(requiredEntry)) {
      throw new Error(`packed artifact is missing ${requiredEntry}`);
    }
  }

  const forbiddenEntries = ["bun.lockb", "package-lock.json", "node_modules/"];
  if (
    [...archiveEntries].some(
      (entry) =>
        entry.startsWith("package/.git") ||
        entry.startsWith("package/.github/") ||
        forbiddenEntries.some((forbiddenEntry) => entry.includes(forbiddenEntry)),
    )
  ) {
    throw new Error("packed artifact contains repository-only or retired package-manager data");
  }

  const packedManifest = JSON.parse(
    readArchiveEntry(tarballPath, "package/package.json", sourceDirectory),
  );

  if (packedManifest.name !== sourceManifest.name || packedManifest.version !== sourceManifest.version) {
    throw new Error("packed manifest identity differs from the committed source manifest");
  }

  if (packedManifest.sideEffects !== false) {
    throw new Error("packed manifest must declare sideEffects: false");
  }

  if (
    packedManifest.repository?.url !==
      "git+https://github.com/notwindstone/ark-of-atrahasis.git" ||
    packedManifest.homepage !== "https://github.com/notwindstone/ark-of-atrahasis#readme" ||
    packedManifest.bugs?.url !== "https://github.com/notwindstone/ark-of-atrahasis/issues"
  ) {
    throw new Error("packed manifest must identify the canonical upstream repository, not a fork");
  }

  if (
    packedManifest.publishConfig?.provenance !== true ||
    packedManifest.publishConfig?.registry !== "https://registry.npmjs.org/"
  ) {
    throw new Error("packed manifest must require npm registry provenance");
  }

  if (packedManifest.peerDependencies?.typescript) {
    throw new Error("packed manifest must not impose a consumer TypeScript peer");
  }

  if (packedManifest.devDependencies?.["@types/bun"]) {
    throw new Error("packed manifest must not depend on unbounded Bun types");
  }

  if (
    packedManifest.devDependencies?.typescript !== "6.0.3" ||
    packedManifest.devDependencies?.["typescript-current"] !== "npm:typescript@7.0.2" ||
    packedManifest.devDependencies?.["typescript-min"] !== "npm:typescript@5.0.4"
  ) {
    throw new Error(
      "packed manifest must pin the build, current, and minimum TypeScript versions",
    );
  }

  const packedLock = JSON.parse(
    readArchiveEntry(tarballPath, "package/npm-shrinkwrap.json", sourceDirectory),
  );

  if (
    packedLock.lockfileVersion !== 3 ||
    packedLock.packages?.[""]?.name !== packedManifest.name ||
    packedLock.packages?.[""]?.version !== packedManifest.version ||
    JSON.stringify(packedLock.packages?.[""]?.devDependencies) !==
      JSON.stringify(packedManifest.devDependencies)
  ) {
    throw new Error("published build lockfile is not synchronized with the packed manifest");
  }

  for (const [dependencyPath, dependency] of Object.entries(packedLock.packages)) {
    if (!dependencyPath || dependency.link) continue;
    if (typeof dependency.integrity !== "string") {
      throw new Error(`locked dependency ${dependencyPath} has no integrity digest`);
    }
    if (
      typeof dependency.resolved !== "string" ||
      !dependency.resolved.startsWith("https://registry.npmjs.org/")
    ) {
      throw new Error(`locked dependency ${dependencyPath} is not pinned to the npm registry`);
    }
  }

  const sourceMap = JSON.parse(
    readArchiveEntry(tarballPath, "package/dist/index.js.map", sourceDirectory),
  );

  if (
    !Array.isArray(sourceMap.sources) ||
    !Array.isArray(sourceMap.sourcesContent) ||
    sourceMap.sources.length === 0 ||
    sourceMap.sources.length !== sourceMap.sourcesContent.length ||
    sourceMap.sources.some((source) => /^(?:\/|file:|[A-Za-z]:)/u.test(source)) ||
    sourceMap.sourcesContent.some((source) => typeof source !== "string")
  ) {
    throw new Error("packed JavaScript source map must contain complete, relative source content");
  }

  writeFileSync(
    join(consumerDirectory, "package.json"),
    `${JSON.stringify({ name: "package-smoke-consumer", private: true, type: "module" }, null, 2)}\n`,
  );
  runNpm(
    ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--offline", tarballPath],
    consumerDirectory,
    { env: offlineConsumerEnvironment },
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
  run("node", ["runtime-smoke.mjs"], consumerDirectory, {
    env: offlineConsumerEnvironment,
  });

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

  const compilers = [
    { directory: "typescript-min", label: "minimum", version: "5.0.4" },
    { directory: "typescript-current", label: "current", version: "7.0.2" },
  ];

  for (const compiler of compilers) {
    const compilerPath = join(sourceDirectory, "node_modules", compiler.directory, "bin", "tsc");
    const reportedVersion = run(process.execPath, [compilerPath, "--version"], consumerDirectory, {
      capture: true,
      env: offlineConsumerEnvironment,
    }).trim();

    if (reportedVersion !== `Version ${compiler.version}`) {
      throw new Error(
        `${compiler.label} TypeScript resolved to ${reportedVersion}, expected ${compiler.version}`,
      );
    }

    run(
      process.execPath,
      [compilerPath, "--project", join(consumerDirectory, "tsconfig.json")],
      consumerDirectory,
      { env: offlineConsumerEnvironment },
    );
  }

  run("tar", ["--extract", "--file", tarballPath, "--directory", rebuildDirectory], sourceDirectory);
  const rebuildPackageDirectory = join(rebuildDirectory, "package");
  rmSync(join(rebuildPackageDirectory, "dist"), { force: true, recursive: true });
  runNpm(
    ["ci", "--ignore-scripts", "--no-audit", "--no-fund", "--offline"],
    rebuildPackageDirectory,
    { env: offlineRebuildEnvironment },
  );
  runNpm(["run", "build"], rebuildPackageDirectory, {
    env: offlineRebuildEnvironment,
  });

  for (const artifact of ["index.d.ts", "index.js", "index.js.map"]) {
    const packedContents = readArchiveEntry(
      tarballPath,
      `package/dist/${artifact}`,
      sourceDirectory,
    );
    const rebuiltContents = readFileSync(join(rebuildPackageDirectory, "dist", artifact), "utf8");
    if (rebuiltContents !== packedContents) {
      throw new Error(`packed dist/${artifact} is not reproducible from the included source and lockfile`);
    }
  }

  const sbom = JSON.parse(
    runNpm(
      ["sbom", "--package-lock-only", "--sbom-format", "cyclonedx", "--sbom-type", "library"],
      sourceDirectory,
      { capture: true, env: isolatedEnvironment },
    ),
  );

  // npm derives the root component name from the temporary directory even
  // though its purl/bom-ref use package.json. Normalize that presentation-only
  // field so the published SBOM names the artifact it actually describes.
  if (sbom.metadata?.component) {
    sbom.metadata.component.name = packedManifest.name;
    sbom.metadata.component.version = packedManifest.version;
  }

  if (
    sbom.bomFormat !== "CycloneDX" ||
    sbom.metadata?.component?.name !== packedManifest.name ||
    sbom.metadata?.component?.version !== packedManifest.version ||
    sbom.metadata?.component?.["bom-ref"] !==
      `${packedManifest.name}@${packedManifest.version}` ||
    !Array.isArray(sbom.components) ||
    sbom.components.length === 0
  ) {
    throw new Error("generated CycloneDX SBOM does not describe the packed release");
  }

  if (outputDirectory) {
    mkdirSync(outputDirectory, { recursive: true });
    const verifiedArtifact = join(outputDirectory, basename(tarballPath));
    const artifactBaseName = basename(tarballPath, ".tgz");
    const sbomName = `${artifactBaseName}.sbom.cdx.json`;
    const sbomContents = `${JSON.stringify(sbom, null, 2)}\n`;
    const checksumName = `${artifactBaseName}.sha256`;

    copyFileSync(tarballPath, verifiedArtifact);
    writeFileSync(join(outputDirectory, sbomName), sbomContents);
    writeFileSync(
      join(outputDirectory, checksumName),
      `${tarballDigest}  ${basename(tarballPath)}\n${sha256(sbomContents)}  ${sbomName}\n`,
    );
    console.log(`Verified ${verifiedArtifact} (sha256 ${tarballDigest})`);
  } else {
    console.log(`Verified ${tarballName} (sha256 ${tarballDigest})`);
  }
} finally {
  rmSync(temporaryRoot, { force: true, recursive: true });
}
