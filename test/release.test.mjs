import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  verifyAnnotatedTagAtHead,
  verifyReleaseMetadata,
  verifyVersionCanPublish,
} from "../scripts/verify-release.mjs";

const manifest = {
  name: "ark-of-atrahasis",
  packageManager: "npm@11.18.0",
  version: "0.4.0",
};
const changelog = "## [0.4.0] - 2026-07-15\n";
const releaseWorkflow = readFileSync(
  new URL("../.github/workflows/release.yml", import.meta.url),
  "utf8",
);

test("release metadata binds the tag to a dated changelog version", () => {
  assert.doesNotThrow(() => verifyReleaseMetadata({ changelog, manifest, tag: "v0.4.0" }));
  assert.throws(
    () => verifyReleaseMetadata({ changelog, manifest, tag: "v0.4.1" }),
    /does not match package version/u,
  );
  assert.throws(
    () => verifyReleaseMetadata({ changelog: "## [Unreleased]\n", manifest, tag: "v0.4.0" }),
    /no dated 0\.4\.0 release heading/u,
  );
  assert.throws(
    () =>
      verifyReleaseMetadata({
        changelog: "## [0.4.0-rc.1] - 2026-07-10\n",
        manifest: { ...manifest, version: "0.4.0-rc.1" },
        tag: "v0.4.0-rc.1",
      }),
    /must be a stable release version/u,
  );
});

test("release metadata in the repository is synchronized at 0.4.0", () => {
  const sourceManifest = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );
  const shrinkwrap = JSON.parse(
    readFileSync(new URL("../npm-shrinkwrap.json", import.meta.url), "utf8"),
  );
  const sourceChangelog = readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8");

  assert.equal(sourceManifest.version, "0.4.0");
  assert.equal(shrinkwrap.version, sourceManifest.version);
  assert.equal(shrinkwrap.packages[""].version, sourceManifest.version);
  assert.doesNotThrow(() =>
    verifyReleaseMetadata({
      changelog: sourceChangelog,
      manifest: sourceManifest,
      tag: "v0.4.0",
    }),
  );
});

test("annotated release tags must resolve to the checked-out HEAD", () => {
  const repository = mkdtempSync(join(tmpdir(), "ark-release-tag-test-"));
  const git = (...args) =>
    execFileSync("git", args, { cwd: repository, encoding: "utf8", stdio: "pipe" });

  try {
    git("init", "--quiet");
    git("config", "user.email", "release-test@example.invalid");
    git("config", "user.name", "Release Test");
    writeFileSync(join(repository, "release.txt"), "first\n");
    git("add", "release.txt");
    git("commit", "--quiet", "-m", "first");
    git("tag", "--annotate", "v0.4.0", "--message", "0.4.0");
    git("tag", "v0.4.1");

    assert.doesNotThrow(() => verifyAnnotatedTagAtHead("v0.4.0", repository));
    assert.throws(
      () => verifyAnnotatedTagAtHead("v0.4.1", repository),
      /must be an annotated tag/u,
    );

    writeFileSync(join(repository, "release.txt"), "second\n");
    git("add", "release.txt");
    git("commit", "--quiet", "-m", "second");
    assert.throws(
      () => verifyAnnotatedTagAtHead("v0.4.0", repository),
      /does not resolve to checked-out HEAD/u,
    );
  } finally {
    rmSync(repository, { force: true, recursive: true });
  }
});

test("registry preflight distinguishes an unpublished version from failures", async () => {
  const unpublishedNextVersion = async (url) =>
    url.endsWith("/0.4.0")
      ? { status: 404 }
      : { json: async () => ({ "dist-tags": { latest: "0.3.1" } }), status: 200 };
  await assert.doesNotReject(
    verifyVersionCanPublish(manifest.name, manifest.version, unpublishedNextVersion),
  );
  await assert.rejects(
    verifyVersionCanPublish(manifest.name, manifest.version, async () => ({ status: 200 })),
    /already present/u,
  );
  await assert.rejects(
    verifyVersionCanPublish(manifest.name, manifest.version, async () => ({ status: 503 })),
    /unexpected HTTP 503/u,
  );
  await assert.rejects(
    verifyVersionCanPublish(manifest.name, "0.3.0", async (url) =>
      url.endsWith("/0.3.0")
        ? { status: 404 }
        : { json: async () => ({ "dist-tags": { latest: "0.3.1" } }), status: 200 },
    ),
    /would not advance/u,
  );
});

test("release workflow pins the exact no-cache Node and npm toolchain", () => {
  assert.match(releaseWorkflow, /push:\n {4}tags:\n {6}- "v\*\.\*\.\*"/u);
  assert.equal((releaseWorkflow.match(/node-version: 22\.22\.2/gu) ?? []).length, 2);
  assert.equal((releaseWorkflow.match(/npm@11\.18\.0/gu) ?? []).length, 2);
  assert.equal((releaseWorkflow.match(/package-manager-cache: false/gu) ?? []).length, 2);
  assert.doesNotMatch(releaseWorkflow, /^\s+cache:/mu);

  const expectedActionPins = new Map([
    ["actions/checkout", "9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0"],
    ["actions/setup-node", "820762786026740c76f36085b0efc47a31fe5020"],
    ["actions/upload-artifact", "043fb46d1a93c77aae656e7c1c64a875d1fc6a0a"],
    ["actions/download-artifact", "3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c"],
    ["actions/github-script", "3a2844b7e9c422d3c10d287c895573f7108da1b3"],
  ]);
  const actionUses = [...releaseWorkflow.matchAll(/^\s+uses: ([^@\s]+)@([^\s]+)/gmu)];

  assert.ok(actionUses.length > 0);
  for (const [, action, revision] of actionUses) {
    assert.match(revision, /^[0-9a-f]{40}$/u);
    assert.equal(revision, expectedActionPins.get(action), `unexpected pin for ${action}`);
  }
  assert.deepEqual(
    new Set(actionUses.map(([, action]) => action)),
    new Set(expectedActionPins.keys()),
  );
});

test("release workflow isolates write and OIDC authority in the protected job", () => {
  const publishStart = releaseWorkflow.indexOf("\n  publish:\n");
  assert.ok(publishStart > 0);
  const verifyJob = releaseWorkflow.slice(0, publishStart);
  const publishJob = releaseWorkflow.slice(publishStart);

  assert.match(releaseWorkflow, /permissions:\n {2}contents: read/u);
  assert.doesNotMatch(verifyJob, /id-token: write|contents: write|secrets\.|NODE_AUTH_TOKEN/u);
  assert.match(verifyJob, /persist-credentials: false/u);
  assert.match(publishJob, /needs: verify/u);
  assert.match(publishJob, /environment: npm/u);
  assert.match(
    publishJob,
    /permissions:\n {6}contents: write\n {6}id-token: write\n {4}steps:/u,
  );
  assert.doesNotMatch(publishJob, /actions\/checkout@/u);
  assert.doesNotMatch(publishJob, /secrets\.|NODE_AUTH_TOKEN|NPM_TOKEN/u);
});

test("release workflow hands off and publishes only the exact verified artifacts", () => {
  const metadataIndex = releaseWorkflow.indexOf('node scripts/verify-release.mjs "$GITHUB_REF_NAME"');
  const checkIndex = releaseWorkflow.indexOf('node "$NPM_CLI" run check');
  const packIndex = releaseWorkflow.indexOf('node "$NPM_CLI" run pack:verified');
  const uploadIndex = releaseWorkflow.indexOf("uses: actions/upload-artifact@");
  const downloadIndex = releaseWorkflow.indexOf("uses: actions/download-artifact@");
  const checksumIndex = releaseWorkflow.indexOf("sha256sum --check --strict");
  const npmPublishIndex = releaseWorkflow.indexOf('node "$NPM_CLI" publish');
  const draftIndex = releaseWorkflow.indexOf("github.rest.repos.createRelease");
  const assetIndex = releaseWorkflow.indexOf("github.rest.repos.uploadReleaseAsset");
  const releaseIndex = releaseWorkflow.indexOf("github.rest.repos.updateRelease");

  for (const [name, index] of Object.entries({
    assetIndex,
    checkIndex,
    checksumIndex,
    downloadIndex,
    draftIndex,
    metadataIndex,
    npmPublishIndex,
    packIndex,
    releaseIndex,
    uploadIndex,
  })) {
    assert.notEqual(index, -1, `release workflow is missing ${name}`);
  }

  assert.ok(metadataIndex < checkIndex);
  assert.ok(checkIndex < packIndex);
  assert.ok(packIndex < uploadIndex);
  assert.ok(uploadIndex < downloadIndex);
  assert.ok(downloadIndex < checksumIndex);
  assert.ok(checksumIndex < draftIndex);
  assert.ok(draftIndex < assetIndex);
  assert.ok(assetIndex < npmPublishIndex);
  assert.ok(npmPublishIndex < releaseIndex);
  assert.equal(
    (releaseWorkflow.match(/name: npm-release-\$\{\{ github\.sha \}\}/gu) ?? []).length,
    2,
  );
  assert.match(releaseWorkflow, /if-no-files-found: error/u);
  assert.match(releaseWorkflow, /checksum file must cover exactly two assets/u);
  assert.match(releaseWorkflow, /tarball identity does not match the release tag/u);
  assert.match(
    releaseWorkflow,
    /publish\n {10}"\.\/\.artifacts\/\$\{\{ steps\.artifacts\.outputs\.artifact-base \}\}\.tgz"\n {10}--ignore-scripts\n {10}--access public\n {10}--provenance/u,
  );
  assert.match(releaseWorkflow, /draft: true/u);
  assert.match(releaseWorkflow, /draft: false/u);

  const uploadPaths = releaseWorkflow.match(/path: \|\n((?: {12}\.artifacts\/[^\n]+\n){3})/u);
  const artifactOutput = ["$", "{{ steps.artifacts.outputs.artifact-base }}"].join("");
  assert.ok(uploadPaths);
  assert.deepEqual(uploadPaths[1].trim().split("\n").map((line) => line.trim()), [
    `.artifacts/${artifactOutput}.tgz`,
    `.artifacts/${artifactOutput}.sbom.cdx.json`,
    `.artifacts/${artifactOutput}.sha256`,
  ]);
});
