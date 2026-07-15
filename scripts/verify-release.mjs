import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  assertVersionAdvancesLatest,
  parseStableVersion,
} from "./stable-version.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

export function verifyReleaseMetadata({ changelog, manifest, tag }) {
  if (tag !== `v${manifest.version}`) {
    throw new Error(`release tag ${tag} does not match package version ${manifest.version}`);
  }

  parseStableVersion(manifest.version);

  if (!/^npm@\d+\.\d+\.\d+$/u.test(manifest.packageManager ?? "")) {
    throw new Error("packageManager must pin an exact npm version before release");
  }

  const releaseHeading = new RegExp(
    `^## \\[${escapeRegExp(manifest.version)}\\] - \\d{4}-\\d{2}-\\d{2}$`,
    "gmu",
  );
  const releaseMatch = releaseHeading.exec(changelog);
  if (!releaseMatch) {
    throw new Error(`CHANGELOG.md has no dated ${manifest.version} release heading`);
  }

  const unreleasedMatch = /^## \[Unreleased\][ \t]*$/gmu.exec(changelog);
  if (!unreleasedMatch) {
    throw new Error(
      `CHANGELOG.md must keep an empty Unreleased heading immediately before the ${manifest.version} release heading`,
    );
  }

  const nextHeading = /^## .+$/gmu;
  nextHeading.lastIndex = unreleasedMatch.index + unreleasedMatch[0].length;
  const nextHeadingMatch = nextHeading.exec(changelog);
  if (nextHeadingMatch?.index !== releaseMatch.index) {
    throw new Error(
      `CHANGELOG.md must keep an empty Unreleased heading immediately before the ${manifest.version} release heading`,
    );
  }

  const unreleasedContents = changelog.slice(
    unreleasedMatch.index + unreleasedMatch[0].length,
    releaseMatch.index,
  );
  if (unreleasedContents.trim() !== "") {
    throw new Error(
      `CHANGELOG.md has unpromoted content above the ${manifest.version} release heading`,
    );
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
  assertVersionAdvancesLatest({ latest, name, version });
  return "unpublished";
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
