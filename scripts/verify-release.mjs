import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

export function verifyReleaseMetadata({ changelog, manifest, tag }) {
  if (tag !== `v${manifest.version}`) {
    throw new Error(`release tag ${tag} does not match package version ${manifest.version}`);
  }

  if (!/^\d+\.\d+\.\d+$/u.test(manifest.version)) {
    throw new Error(`package version ${manifest.version} must be a stable release version`);
  }

  if (!/^npm@\d+\.\d+\.\d+$/u.test(manifest.packageManager ?? "")) {
    throw new Error("packageManager must pin an exact npm version before release");
  }

  const releaseHeading = new RegExp(
    `^## \\[${escapeRegExp(manifest.version)}\\] - \\d{4}-\\d{2}-\\d{2}$`,
    "mu",
  );
  if (!releaseHeading.test(changelog)) {
    throw new Error(`CHANGELOG.md has no dated ${manifest.version} release heading`);
  }
}

export function verifyAnnotatedTagAtHead(tag, cwd = repositoryRoot) {
  const ref = `refs/tags/${tag}`;
  const tagType = execFileSync("git", ["cat-file", "-t", ref], {
    cwd,
    encoding: "utf8",
  }).trim();
  if (tagType !== "tag") {
    throw new Error(`release ref ${ref} must be an annotated tag`);
  }

  const taggedCommit = execFileSync("git", ["rev-list", "-n", "1", ref], {
    cwd,
    encoding: "utf8",
  }).trim();
  const head = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd,
    encoding: "utf8",
  }).trim();
  if (taggedCommit !== head) {
    throw new Error(`release tag ${tag} does not resolve to checked-out HEAD`);
  }
}

export async function inspectVersionForRelease(name, version, fetchImplementation = fetch) {
  const encodedName = encodeURIComponent(name).replaceAll("%2F", "%2f");
  const encodedVersion = encodeURIComponent(version);
  const response = await fetchImplementation(
    `https://registry.npmjs.org/${encodedName}/${encodedVersion}`,
    {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (response.status === 200) {
    const metadata = await response.json();
    if (
      metadata?.name !== name ||
      metadata?.version !== version ||
      !/^sha512-[A-Za-z0-9+/]+={0,2}$/u.test(metadata?.dist?.integrity ?? "") ||
      !/^[0-9a-f]{40}$/u.test(metadata?.dist?.shasum ?? "") ||
      typeof metadata?.dist?.tarball !== "string"
    ) {
      throw new Error(`${name}@${version} has invalid npm registry metadata`);
    }
    return "published";
  }
  if (response.status !== 404) {
    throw new Error(`npm registry returned unexpected HTTP ${response.status}`);
  }

  const packageResponse = await fetchImplementation(`https://registry.npmjs.org/${encodedName}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (packageResponse.status === 404) return "unpublished";
  if (packageResponse.status !== 200) {
    throw new Error(`npm registry returned unexpected HTTP ${packageResponse.status}`);
  }

  const latest = (await packageResponse.json())?.["dist-tags"]?.latest;
  if (typeof latest !== "string" || !/^\d+\.\d+\.\d+$/u.test(latest)) {
    throw new Error("npm registry has no valid stable latest dist-tag");
  }
  if (compareStableVersions(version, latest) <= 0) {
    throw new Error(`${name}@${version} would not advance the current latest version ${latest}`);
  }
  return "unpublished";
}

function compareStableVersions(left, right) {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    const difference = leftParts[index] - rightParts[index];
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

async function main() {
  const tag = process.argv[2];
  if (!tag) throw new Error("usage: node scripts/verify-release.mjs <tag>");

  const manifest = JSON.parse(readFileSync(joinRoot("package.json"), "utf8"));
  const changelog = readFileSync(joinRoot("CHANGELOG.md"), "utf8");

  verifyReleaseMetadata({ changelog, manifest, tag });
  verifyAnnotatedTagAtHead(tag);
  const registryState = await inspectVersionForRelease(manifest.name, manifest.version);
  console.log(
    `Verified release candidate ${manifest.name}@${manifest.version} at ${tag}; ` +
      `registry state is ${registryState}`,
  );
}

function joinRoot(path) {
  return resolve(repositoryRoot, path);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) await main();
