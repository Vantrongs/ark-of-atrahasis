import assert from "node:assert/strict";
import test from "node:test";

import {
  verifyReleaseMetadata,
  verifyVersionCanPublish,
} from "../scripts/verify-release.mjs";

const manifest = {
  name: "ark-of-atrahasis",
  packageManager: "npm@11.18.0",
  version: "0.3.1",
};
const changelog = "## [0.3.1] - 2026-07-10\n";

test("release metadata binds the tag to a dated changelog version", () => {
  assert.doesNotThrow(() => verifyReleaseMetadata({ changelog, manifest, tag: "v0.3.1" }));
  assert.throws(
    () => verifyReleaseMetadata({ changelog, manifest, tag: "v0.3.2" }),
    /does not match package version/u,
  );
  assert.throws(
    () => verifyReleaseMetadata({ changelog: "## [Unreleased]\n", manifest, tag: "v0.3.1" }),
    /no dated 0\.3\.1 release heading/u,
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

test("registry preflight distinguishes an unpublished version from failures", async () => {
  const unpublishedNextVersion = async (url) =>
    url.endsWith("/0.3.2")
      ? { status: 404 }
      : { json: async () => ({ "dist-tags": { latest: "0.3.1" } }), status: 200 };
  await assert.doesNotReject(
    verifyVersionCanPublish(manifest.name, "0.3.2", unpublishedNextVersion),
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
