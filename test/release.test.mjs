import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  assertNpmProvenance,
  finalizeGitHubRelease,
  inspectRegistryTarball,
  prepareGitHubRelease,
  publishOrResumeNpm,
} from "../scripts/release-recovery.mjs";
import {
  inspectVersionForRelease,
  verifyAnnotatedTagAtHead,
  verifyReleaseMetadata,
} from "../scripts/verify-release.mjs";
import {
  assertVersionAdvancesLatest,
  compareStableVersions,
  parseStableVersion,
} from "../scripts/stable-version.mjs";
import { extractReadmeFences } from "../scripts/readme-examples.mjs";

const manifest = {
  name: "ark-of-atrahasis",
  packageManager: "npm@11.18.0",
  version: "0.4.0",
};
const changelog = "## [Unreleased]\n\n## [0.4.0] - 2026-07-15\n";
const releaseWorkflow = readFileSync(
  new URL("../.github/workflows/release.yml", import.meta.url),
  "utf8",
);
const releaseRecoverySource = readFileSync(
  new URL("../scripts/release-recovery.mjs", import.meta.url),
  "utf8",
);

function createRecoveryFixture() {
  const directory = mkdtempSync(join(tmpdir(), "ark-release-recovery-test-"));
  const artifactBase = "ark-of-atrahasis-0.4.0";
  const files = new Map([
    [`${artifactBase}.tgz`, Buffer.from("verified npm tarball\n")],
    [`${artifactBase}.sbom.cdx.json`, Buffer.from('{"bomFormat":"CycloneDX"}\n')],
    [`${artifactBase}.sha256`, Buffer.from("verified checksums\n")],
  ]);
  for (const [name, contents] of files) writeFileSync(join(directory, name), contents);
  const artifacts = [...files].map(([name, contents], index) => ({
    digest: `sha256:${createHash("sha256").update(contents).digest("hex")}`,
    id: index + 10,
    name,
    size: contents.length,
    state: "uploaded",
  }));
  return {
    artifactBase,
    artifacts,
    directory,
    tarball: files.get(`${artifactBase}.tgz`),
    tarballPath: join(directory, `${artifactBase}.tgz`),
  };
}

function draftRelease(overrides = {}) {
  return {
    draft: true,
    id: 1,
    immutable: false,
    name: "v0.4.0",
    prerelease: false,
    published_at: null,
    tag_name: "v0.4.0",
    ...overrides,
  };
}

function createFakeGitHub({ assets = [], commitSha = "release-commit", releases = [] } = {}) {
  const state = {
    assets: assets.map((asset) => ({ ...asset })),
    calls: { create: 0, delete: 0, update: 0, upload: 0 },
    commitSha,
    releases: releases.map((release) => ({ ...release })),
  };
  const github = {
    rest: {
      git: {
        getRef: async () => ({
          data: { object: { sha: "annotated-tag", type: "tag" } },
        }),
        getTag: async () => ({
          data: { object: { sha: state.commitSha, type: "commit" } },
        }),
      },
      repos: {
        createRelease: async (parameters) => {
          state.calls.create += 1;
          const release = draftRelease({
            name: parameters.name,
            tag_name: parameters.tag_name,
          });
          state.releases.push(release);
          return { data: { ...release } };
        },
        deleteReleaseAsset: async ({ asset_id }) => {
          state.calls.delete += 1;
          state.assets = state.assets.filter((asset) => asset.id !== asset_id);
        },
        listReleaseAssets: async ({ page }) => ({
          data: page === 1 ? state.assets.map((asset) => ({ ...asset })) : [],
        }),
        listReleases: async ({ page }) => ({
          data: page === 1 ? state.releases.map((release) => ({ ...release })) : [],
        }),
        updateRelease: async ({ release_id }) => {
          state.calls.update += 1;
          const release = state.releases.find((candidate) => candidate.id === release_id);
          Object.assign(release, {
            draft: false,
            published_at: "2026-07-15T12:00:00Z",
          });
          return { data: { ...release } };
        },
        uploadReleaseAsset: async ({ data, name }) => {
          state.calls.upload += 1;
          const asset = {
            digest: `sha256:${createHash("sha256").update(data).digest("hex")}`,
            id: 100 + state.calls.upload,
            name,
            size: data.length,
            state: "uploaded",
          };
          state.assets.push(asset);
          return { data: { ...asset } };
        },
      },
    },
  };
  return { github, state };
}

function createFakeRegistry(fixture, overrides = {}) {
  const state = {
    integrity: `sha512-${createHash("sha512").update(fixture.tarball).digest("base64")}`,
    latest: "0.3.1",
    metadataName: manifest.name,
    metadataVersion: manifest.version,
    published: false,
    shasum: createHash("sha1").update(fixture.tarball).digest("hex"),
    tarballBytes: fixture.tarball,
    ...overrides,
  };
  const tarballUrl = "https://registry.npmjs.org/ark-of-atrahasis/-/ark-of-atrahasis-0.4.0.tgz";
  const packageUrl = "https://registry.npmjs.org/ark-of-atrahasis";
  const versionUrl = `${packageUrl}/0.4.0`;
  const fetchImplementation = async (input) => {
    const url = String(input);
    if (url === tarballUrl) {
      return {
        arrayBuffer: async () => Uint8Array.from(state.tarballBytes).buffer,
        status: 200,
      };
    }
    if (url === packageUrl) {
      return {
        json: async () => ({ "dist-tags": { latest: state.latest } }),
        status: 200,
      };
    }
    if (url !== versionUrl) return { status: 404 };
    if (!state.published) return { status: 404 };
    return {
      json: async () => ({
        dist: {
          integrity: state.integrity,
          shasum: state.shasum,
          tarball: tarballUrl,
        },
        name: state.metadataName,
        version: state.metadataVersion,
      }),
      status: 200,
    };
  };
  return { fetchImplementation, state };
}

function githubRecoveryOptions(fixture, fake, registryState = "missing") {
  return {
    artifactBase: fixture.artifactBase,
    artifactsDirectory: fixture.directory,
    commitSha: "release-commit",
    github: fake.github,
    owner: "Vantrongs",
    registryState,
    repo: "ark-of-atrahasis",
    tag: "v0.4.0",
  };
}

function npmRecoveryOptions(fixture, registry, releaseState) {
  return {
    attempts: 2,
    delayImplementation: (callback) => callback(),
    fetchImplementation: registry.fetchImplementation,
    name: manifest.name,
    releaseState,
    tarballPath: fixture.tarballPath,
    verifyProvenanceImplementation: async () => {},
    version: manifest.version,
  };
}

function createProvenanceAudit(fixture) {
  const repository = "https://github.com/Vantrongs/ark-of-atrahasis";
  const ref = "refs/tags/v0.4.0";
  const statement = {
    _type: "https://in-toto.io/Statement/v1",
    predicate: {
      buildDefinition: {
        buildType: "https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1",
        externalParameters: {
          workflow: {
            path: ".github/workflows/release.yml",
            ref,
            repository,
          },
        },
        internalParameters: { github: { event_name: "push" } },
        resolvedDependencies: [
          {
            digest: { gitCommit: "a".repeat(40) },
            uri: `git+${repository}@${ref}`,
          },
        ],
      },
      runDetails: {
        builder: { id: "https://github.com/actions/runner/github-hosted" },
        metadata: { invocationId: `${repository}/actions/runs/123/attempts/1` },
      },
    },
    predicateType: "https://slsa.dev/provenance/v1",
    subject: [
      {
        digest: {
          sha512: createHash("sha512").update(fixture.tarball).digest("hex"),
        },
        name: `pkg:npm/${manifest.name}@${manifest.version}`,
      },
    ],
  };
  const attestation = {
    bundle: {
      dsseEnvelope: {
        payload: Buffer.from(JSON.stringify(statement)).toString("base64"),
      },
    },
    predicateType: "https://slsa.dev/provenance/v1",
  };
  return {
    auditResult: {
      invalid: [],
      missing: [],
      verified: [
        {
          attestationBundles: [attestation],
          attestations: {
            provenance: { predicateType: "https://slsa.dev/provenance/v1" },
          },
          name: manifest.name,
          version: manifest.version,
        },
      ],
    },
    commitSha: "a".repeat(40),
    name: manifest.name,
    ref,
    repository,
    statement,
    tarballPath: fixture.tarballPath,
    version: manifest.version,
    workflowPath: ".github/workflows/release.yml",
  };
}

test("release metadata binds the tag to a dated changelog version", () => {
  assert.doesNotThrow(() => verifyReleaseMetadata({ changelog, manifest, tag: "v0.4.0" }));
  assert.throws(
    () => verifyReleaseMetadata({ changelog, manifest, tag: "v0.4.1" }),
    /does not match package version/u,
  );
  assert.throws(
    () =>
      verifyReleaseMetadata({
        changelog: "## [Unreleased]\n",
        manifest,
        tag: "v0.4.0",
      }),
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
  assert.throws(
    () =>
      verifyReleaseMetadata({
        changelog:
          "## [Unreleased]\n\n### Added\n\n- Release-bound change.\n\n## [0.4.0] - 2026-07-15\n",
        manifest,
        tag: "v0.4.0",
      }),
    /unpromoted content above the 0\.4\.0 release heading/u,
  );
  assert.throws(
    () =>
      verifyReleaseMetadata({
        changelog: "## [0.4.0] - 2026-07-15\n\n## [Unreleased]\n",
        manifest,
        tag: "v0.4.0",
      }),
    /Unreleased heading immediately before the 0\.4\.0 release heading/u,
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

test("one pure stable-version contract parses, compares, and enforces latest advancement", () => {
  assert.deepEqual(parseStableVersion("0.4.0"), [0n, 4n, 0n]);
  assert.equal(compareStableVersions("0.4.0", "0.3.99"), 1);
  assert.equal(compareStableVersions("1.0.0", "1.0.0"), 0);
  assert.equal(compareStableVersions("1.0.0", "2.0.0"), -1);
  assert.doesNotThrow(() =>
    assertVersionAdvancesLatest({
      latest: "0.3.1",
      name: "ark-of-atrahasis",
      version: "0.4.0",
    }),
  );
  for (const invalid of ["0.4", "v0.4.0", "0.4.0-rc.1", "01.4.0", "0.4.0.0"]) {
    assert.throws(() => parseStableVersion(invalid), /stable release version/u);
  }
  assert.throws(
    () =>
      assertVersionAdvancesLatest({
        latest: "0.4.0",
        name: "ark-of-atrahasis",
        version: "0.4.0",
      }),
    /would not advance/u,
  );
});

test("README fences are structurally classified so executable drift cannot be skipped", () => {
  const sourceReadme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  const fences = extractReadmeFences(sourceReadme);
  const executable = fences.filter((fence) => fence.executable);

  assert.equal(fences.length, 1);
  assert.equal(executable.length, 1);
  assert.equal(executable[0].language, "js");
  assert.match(executable[0].code, /createSafeDocument\(root/u);
  assert.doesNotMatch(executable[0].code, /npm run check/u);

  const classified = extractReadmeFences(
    "```js\nconsole.log('run');\n```\n\n```sh\nnpm test\n```\n\n```text\nreference\n```\n",
  );
  assert.deepEqual(
    classified.map(({ executable: isExecutable, language }) => ({
      executable: isExecutable,
      language,
    })),
    [
      { executable: true, language: "js" },
      { executable: true, language: "sh" },
      { executable: false, language: "text" },
    ],
  );
  assert.throws(() => extractReadmeFences("```js\nunclosed\n"), /unclosed README fence/u);
});

test("annotated release tags must resolve to the checked-out HEAD", () => {
  const repository = mkdtempSync(join(tmpdir(), "ark-release-tag-test-"));
  const git = (...args) =>
    execFileSync("git", args, {
      cwd: repository,
      encoding: "utf8",
      stdio: "pipe",
    });

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

test("registry preflight distinguishes a new version from a recoverable publication", async () => {
  const unpublishedNextVersion = async (url) =>
    url.endsWith("/0.4.0")
      ? { status: 404 }
      : {
          json: async () => ({ "dist-tags": { latest: "0.3.1" } }),
          status: 200,
        };
  assert.equal(
    await inspectVersionForRelease(manifest.name, manifest.version, unpublishedNextVersion),
    "unpublished",
  );
  assert.equal(
    await inspectVersionForRelease(manifest.name, manifest.version, async () => ({
      json: async () => ({
        dist: {
          integrity: `sha512-${"A".repeat(86)}==`,
          shasum: "a".repeat(40),
          tarball: "https://registry.npmjs.org/ark-of-atrahasis/-/ark-of-atrahasis-0.4.0.tgz",
        },
        name: manifest.name,
        version: manifest.version,
      }),
      status: 200,
    })),
    "published",
  );
  await assert.rejects(
    inspectVersionForRelease(manifest.name, manifest.version, async () => ({
      status: 503,
    })),
    /unexpected HTTP 503/u,
  );
  await assert.rejects(
    inspectVersionForRelease(manifest.name, "0.3.0", async (url) =>
      url.endsWith("/0.3.0")
        ? { status: 404 }
        : {
            json: async () => ({ "dist-tags": { latest: "0.3.1" } }),
            status: 200,
          },
    ),
    /would not advance/u,
  );
});

test("first release run publishes once and an exact completed rerun is a no-op", async () => {
  const fixture = createRecoveryFixture();
  const fake = createFakeGitHub();
  const registry = createFakeRegistry(fixture);
  let publicationCalls = 0;
  const publishImplementation = async () => {
    publicationCalls += 1;
    registry.state.published = true;
  };

  try {
    const prepared = await prepareGitHubRelease(githubRecoveryOptions(fixture, fake));
    assert.equal(prepared.state, "draft");
    assert.deepEqual(fake.state.calls, { create: 1, delete: 0, update: 0, upload: 3 });

    const npmResult = await publishOrResumeNpm({
      ...npmRecoveryOptions(fixture, registry, prepared.state),
      publishImplementation,
    });
    assert.deepEqual(npmResult, { published: true });
    const finalized = await finalizeGitHubRelease(githubRecoveryOptions(fixture, fake));
    assert.equal(finalized.state, "published");

    const rerun = await prepareGitHubRelease(
      githubRecoveryOptions(fixture, fake, "matching"),
    );
    assert.equal(rerun.state, "published");
    const rerunNpm = await publishOrResumeNpm({
      ...npmRecoveryOptions(fixture, registry, rerun.state),
      publishImplementation,
    });
    assert.deepEqual(rerunNpm, { published: false });
    await finalizeGitHubRelease(githubRecoveryOptions(fixture, fake));

    assert.equal(publicationCalls, 1);
    assert.deepEqual(fake.state.calls, { create: 1, delete: 0, update: 1, upload: 3 });
  } finally {
    rmSync(fixture.directory, { force: true, recursive: true });
  }
});

test("a failure after npm publication resumes the matching draft without republishing", async () => {
  const fixture = createRecoveryFixture();
  const fake = createFakeGitHub({
    assets: fixture.artifacts,
    releases: [draftRelease()],
  });
  const registry = createFakeRegistry(fixture, { published: true });
  let publicationCalls = 0;

  try {
    const prepared = await prepareGitHubRelease(
      githubRecoveryOptions(fixture, fake, "matching"),
    );
    const result = await publishOrResumeNpm({
      ...npmRecoveryOptions(fixture, registry, prepared.state),
      publishImplementation: async () => {
        publicationCalls += 1;
      },
    });
    assert.deepEqual(result, { published: false });
    await finalizeGitHubRelease(githubRecoveryOptions(fixture, fake));

    assert.equal(publicationCalls, 0);
    assert.deepEqual(fake.state.calls, { create: 0, delete: 0, update: 1, upload: 0 });
    assert.equal(fake.state.releases[0].draft, false);
  } finally {
    rmSync(fixture.directory, { force: true, recursive: true });
  }
});

test("an interrupted asset upload resumes only the missing exact assets", async () => {
  const fixture = createRecoveryFixture();
  const fake = createFakeGitHub({
    assets: fixture.artifacts.slice(0, 1),
    releases: [draftRelease()],
  });

  try {
    const prepared = await prepareGitHubRelease(githubRecoveryOptions(fixture, fake));
    assert.equal(prepared.state, "draft");
    assert.deepEqual(fake.state.calls, { create: 0, delete: 0, update: 0, upload: 2 });
    assert.deepEqual(
      fake.state.assets.map((asset) => asset.name).sort(),
      fixture.artifacts.map((asset) => asset.name).sort(),
    );
  } finally {
    rmSync(fixture.directory, { force: true, recursive: true });
  }
});

test("a draft release replaces only an expected empty starter asset", async () => {
  const fixture = createRecoveryFixture();
  const fake = createFakeGitHub({
    assets: [
      {
        ...fixture.artifacts[0],
        digest: null,
        size: 0,
        state: "starter",
      },
    ],
    releases: [draftRelease()],
  });

  try {
    const prepared = await prepareGitHubRelease(githubRecoveryOptions(fixture, fake));
    assert.equal(prepared.state, "draft");
    assert.deepEqual(fake.state.calls, { create: 0, delete: 1, update: 0, upload: 3 });
    assert.deepEqual(
      fake.state.assets.map((asset) => asset.name).sort(),
      fixture.artifacts.map((asset) => asset.name).sort(),
    );
  } finally {
    rmSync(fixture.directory, { force: true, recursive: true });
  }
});

test("GitHub recovery rejects conflicting tag, draft, asset, and published states", async (t) => {
  await t.test("tag commit", async () => {
    const fixture = createRecoveryFixture();
    const fake = createFakeGitHub({ commitSha: "other-commit" });
    try {
      await assert.rejects(
        prepareGitHubRelease(githubRecoveryOptions(fixture, fake)),
        /does not resolve to workflow commit/u,
      );
      assert.deepEqual(fake.state.calls, { create: 0, delete: 0, update: 0, upload: 0 });
    } finally {
      rmSync(fixture.directory, { force: true, recursive: true });
    }
  });

  await t.test("draft metadata", async () => {
    const fixture = createRecoveryFixture();
    const fake = createFakeGitHub({
      releases: [draftRelease({ name: "other" })],
    });
    try {
      await assert.rejects(
        prepareGitHubRelease(githubRecoveryOptions(fixture, fake)),
        /metadata does not exactly match/u,
      );
      assert.deepEqual(fake.state.calls, { create: 0, delete: 0, update: 0, upload: 0 });
    } finally {
      rmSync(fixture.directory, { force: true, recursive: true });
    }
  });

  await t.test("npm publication without a draft", async () => {
    const fixture = createRecoveryFixture();
    const fake = createFakeGitHub();
    try {
      await assert.rejects(
        prepareGitHubRelease(githubRecoveryOptions(fixture, fake, "matching")),
        /without a GitHub release draft to recover/u,
      );
      assert.deepEqual(fake.state.calls, { create: 0, delete: 0, update: 0, upload: 0 });
    } finally {
      rmSync(fixture.directory, { force: true, recursive: true });
    }
  });

  await t.test("asset digest", async () => {
    const fixture = createRecoveryFixture();
    const fake = createFakeGitHub({
      assets: [{ ...fixture.artifacts[0], digest: `sha256:${"0".repeat(64)}` }],
      releases: [draftRelease()],
    });
    try {
      await assert.rejects(
        prepareGitHubRelease(githubRecoveryOptions(fixture, fake)),
        /does not match the verified artifact/u,
      );
      assert.deepEqual(fake.state.calls, { create: 0, delete: 0, update: 0, upload: 0 });
    } finally {
      rmSync(fixture.directory, { force: true, recursive: true });
    }
  });

  await t.test("non-empty starter asset", async () => {
    const fixture = createRecoveryFixture();
    const fake = createFakeGitHub({
      assets: [
        {
          ...fixture.artifacts[0],
          digest: null,
          size: 0,
          state: "starter",
        },
        { ...fixture.artifacts[1], digest: null, state: "starter" },
      ],
      releases: [draftRelease()],
    });
    try {
      await assert.rejects(
        prepareGitHubRelease(githubRecoveryOptions(fixture, fake)),
        /conflicting starter asset/u,
      );
      assert.deepEqual(fake.state.calls, { create: 0, delete: 0, update: 0, upload: 0 });
    } finally {
      rmSync(fixture.directory, { force: true, recursive: true });
    }
  });

  await t.test("published release without npm", async () => {
    const fixture = createRecoveryFixture();
    const registry = createFakeRegistry(fixture);
    let publicationCalls = 0;
    try {
      await assert.rejects(
        publishOrResumeNpm({
          ...npmRecoveryOptions(fixture, registry, "published"),
          publishImplementation: async () => {
            publicationCalls += 1;
          },
        }),
        /has no matching npm publication/u,
      );
      assert.equal(publicationCalls, 0);
    } finally {
      rmSync(fixture.directory, { force: true, recursive: true });
    }
  });
});

test("npm recovery requires exact verified trusted-publish provenance", async (t) => {
  await t.test("accepts the exact signed workflow identity", () => {
    const fixture = createRecoveryFixture();
    try {
      assert.doesNotThrow(() => assertNpmProvenance(createProvenanceAudit(fixture)));
    } finally {
      rmSync(fixture.directory, { force: true, recursive: true });
    }
  });

  await t.test("rejects a missing provenance result before publication recovery", async () => {
    const fixture = createRecoveryFixture();
    const registry = createFakeRegistry(fixture, { published: true });
    const provenance = createProvenanceAudit(fixture);
    provenance.auditResult.verified = [];
    let publicationCalls = 0;
    try {
      await assert.rejects(
        publishOrResumeNpm({
          ...npmRecoveryOptions(fixture, registry, "draft"),
          publishImplementation: async () => {
            publicationCalls += 1;
          },
          verifyProvenanceImplementation: async () => {
            assertNpmProvenance(provenance);
          },
        }),
        /has no unique result/u,
      );
      assert.equal(publicationCalls, 0);
    } finally {
      rmSync(fixture.directory, { force: true, recursive: true });
    }
  });

  await t.test("rejects a provenance statement for another commit", () => {
    const fixture = createRecoveryFixture();
    const provenance = createProvenanceAudit(fixture);
    provenance.statement.predicate.buildDefinition.resolvedDependencies[0].digest.gitCommit =
      "b".repeat(40);
    provenance.auditResult.verified[0].attestationBundles[0].bundle.dsseEnvelope.payload =
      Buffer.from(JSON.stringify(provenance.statement)).toString("base64");
    try {
      assert.throws(
        () => assertNpmProvenance(provenance),
        /identity does not match the release workflow commit/u,
      );
    } finally {
      rmSync(fixture.directory, { force: true, recursive: true });
    }
  });

  await t.test("verifies provenance after a new publication becomes visible", async () => {
    const fixture = createRecoveryFixture();
    const registry = createFakeRegistry(fixture);
    let provenanceCalls = 0;
    try {
      const result = await publishOrResumeNpm({
        ...npmRecoveryOptions(fixture, registry, "draft"),
        publishImplementation: async () => {
          registry.state.published = true;
        },
        verifyProvenanceImplementation: async () => {
          provenanceCalls += 1;
        },
      });
      assert.deepEqual(result, { published: true });
      assert.equal(provenanceCalls, 1);
    } finally {
      rmSync(fixture.directory, { force: true, recursive: true });
    }
  });
});

test("npm recovery rejects conflicting version, digest, and tarball bytes", async (t) => {
  for (const [name, overrides, pattern] of [
    ["version", { metadataVersion: "0.4.1", published: true }, /metadata does not match/u],
    ["integrity", { integrity: "sha512-conflict", published: true }, /digest does not match/u],
    ["bytes", { published: true, tarballBytes: Buffer.from("different") }, /bytes do not match/u],
  ]) {
    await t.test(name, async () => {
      const fixture = createRecoveryFixture();
      const registry = createFakeRegistry(fixture, overrides);
      try {
        await assert.rejects(
          inspectRegistryTarball({
            fetchImplementation: registry.fetchImplementation,
            name: manifest.name,
            tarballPath: fixture.tarballPath,
            version: manifest.version,
          }),
          pattern,
        );
      } finally {
        rmSync(fixture.directory, { force: true, recursive: true });
      }
    });
  }

  await t.test("non-advancing new version", async () => {
    const fixture = createRecoveryFixture();
    const registry = createFakeRegistry(fixture, { latest: "0.4.1" });
    let publicationCalls = 0;
    try {
      await assert.rejects(
        publishOrResumeNpm({
          ...npmRecoveryOptions(fixture, registry, "draft"),
          publishImplementation: async () => {
            publicationCalls += 1;
          },
        }),
        /would not advance/u,
      );
      assert.equal(publicationCalls, 0);
    } finally {
      rmSync(fixture.directory, { force: true, recursive: true });
    }
  });
});

test("release workflow pins the exact no-cache Node and npm toolchain", () => {
  assert.match(releaseWorkflow, /push:\n {4}tags:\n {6}- "v\*\.\*\.\*"/u);
  assert.match(
    releaseWorkflow,
    /concurrency:\n {2}group: release\n {2}cancel-in-progress: false/u,
  );
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
  assert.match(publishJob, /permissions:\n {6}contents: write\n {6}id-token: write\n {4}steps:/u);
  assert.doesNotMatch(publishJob, /actions\/checkout@/u);
  assert.doesNotMatch(publishJob, /secrets\.|NODE_AUTH_TOKEN|NPM_TOKEN/u);
});

test("release workflow hands off and publishes only the exact verified artifacts", () => {
  const metadataIndex = releaseWorkflow.indexOf(
    'node scripts/verify-release.mjs "$GITHUB_REF_NAME"',
  );
  const checkIndex = releaseWorkflow.indexOf('node "$NPM_CLI" run check');
  const packIndex = releaseWorkflow.indexOf('node "$NPM_CLI" run pack:verified');
  const uploadIndex = releaseWorkflow.indexOf("uses: actions/upload-artifact@");
  const downloadIndex = releaseWorkflow.indexOf("uses: actions/download-artifact@");
  const checksumIndex = releaseWorkflow.indexOf("sha256sum --check --strict");
  const recoveryScriptIndex = releaseWorkflow.indexOf("package/scripts/release-recovery.mjs");
  const stableVersionScriptIndex = releaseWorkflow.indexOf("package/scripts/stable-version.mjs");
  const registryIndex = releaseWorkflow.indexOf("inspect-registry");
  const draftIndex = releaseWorkflow.indexOf("recovery.prepareGitHubRelease");
  const npmPublishIndex = releaseWorkflow.indexOf("publish-or-resume");
  const releaseIndex = releaseWorkflow.indexOf("recovery.finalizeGitHubRelease");

  for (const [name, index] of Object.entries({
    checkIndex,
    checksumIndex,
    downloadIndex,
    draftIndex,
    metadataIndex,
    npmPublishIndex,
    packIndex,
    recoveryScriptIndex,
    stableVersionScriptIndex,
    registryIndex,
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
  assert.ok(checksumIndex < recoveryScriptIndex);
  assert.ok(checksumIndex < stableVersionScriptIndex);
  assert.ok(recoveryScriptIndex < registryIndex);
  assert.match(
    releaseWorkflow,
    /RELEASE_RECOVERY_SCRIPT=\$RUNNER_TEMP\/release-scripts\/release-recovery\.mjs/u,
  );
  assert.ok(registryIndex < draftIndex);
  assert.ok(draftIndex < npmPublishIndex);
  assert.ok(npmPublishIndex < releaseIndex);
  assert.equal(
    (releaseWorkflow.match(/name: npm-release-\$\{\{ github\.sha \}\}/gu) ?? []).length,
    2,
  );
  assert.match(releaseWorkflow, /if-no-files-found: error/u);
  assert.match(releaseWorkflow, /checksum file must cover exactly two assets/u);
  assert.match(releaseWorkflow, /tarball identity does not match the release tag/u);
  assert.match(releaseWorkflow, /node "\$RELEASE_RECOVERY_SCRIPT" publish-or-resume/u);
  assert.match(releaseRecoverySource, /github\.rest\.repos\.createRelease/u);
  assert.match(releaseRecoverySource, /github\.rest\.repos\.uploadReleaseAsset/u);
  assert.match(releaseRecoverySource, /github\.rest\.repos\.updateRelease/u);
  assert.match(releaseRecoverySource, /"--ignore-scripts"/u);
  assert.match(releaseRecoverySource, /"--provenance"/u);
  assert.match(releaseRecoverySource, /process\.env\.NPM_CLI/u);

  const uploadPaths = releaseWorkflow.match(/path: \|\n((?: {12}\.artifacts\/[^\n]+\n){3})/u);
  const artifactOutput = ["$", "{{ steps.artifacts.outputs.artifact-base }}"].join("");
  assert.ok(uploadPaths);
  assert.deepEqual(
    uploadPaths[1]
      .trim()
      .split("\n")
      .map((line) => line.trim()),
    [
      `.artifacts/${artifactOutput}.tgz`,
      `.artifacts/${artifactOutput}.sbom.cdx.json`,
      `.artifacts/${artifactOutput}.sha256`,
    ],
  );
});
