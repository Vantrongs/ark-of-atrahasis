import assert from "node:assert/strict";
import { test } from "vitest";

import { isSafeDOMError } from "../src/errors.ts";
import { createURLPolicy, type SafeURLPolicy } from "../src/url-policy.ts";

const policy: SafeURLPolicy = {
  baseURL: "https://cdn.example.test/assets/",
  sinks: {
    "image.src": {
      allowedOrigins: ["https://cdn.example.test"],
      allowedProtocols: ["https:"],
      allowFragment: true,
    },
    "video.src": {
      allowedOrigins: ["https://media.example.test:8443"],
      allowedProtocols: ["https:"],
      allowQuery: true,
      maxLength: 4096,
    },
  },
};

test("URL policy denies every sink by default", () => {
  const engine = createURLPolicy();
  for (const sink of [
    "anchor.href",
    "image.src",
    "video.src",
    "video.poster",
    "audio.src",
    "source.src",
  ] as const) {
    const decision = engine.decide(sink, "https://cdn.example.test/a");
    assert.equal(decision.allowed, false, sink);
    if (!decision.allowed) {
      assert.equal(decision.error.code, "ERR_URL_DENIED");
      assert.equal(decision.error.operation, sink);
      assert.equal(Object.hasOwn(decision.error, "stack"), false);
      assert.equal(Object.isFrozen(decision.error), true);
    }
  }
});

test("URL policy is per-sink and returns only the canonical URL", () => {
  const engine = createURLPolicy(policy);

  assert.deepEqual(engine.decide("image.src", "kitten/../cat.png#preview"), {
    allowed: true,
    url: "https://cdn.example.test/assets/cat.png#preview",
  });

  const wrongSink = engine.decide("anchor.href", "https://cdn.example.test/cat.png");
  assert.equal(wrongSink.allowed, false);
  const wrongOrigin = engine.decide("image.src", "https://other.example.test/cat.png");
  assert.equal(wrongOrigin.allowed, false);
  const wrongPort = engine.decide("video.src", "https://media.example.test/movie.mp4");
  assert.equal(wrongPort.allowed, false);
  assert.equal(
    engine.decide("video.src", "https://media.example.test:8443/movie.mp4?quality=hd").allowed,
    true,
  );
});

test("URL policy denies scheme, credentials, query, fragment, and malformed URLs unless granted", () => {
  const engine = createURLPolicy(policy);
  for (const input of [
    "http://cdn.example.test/cat.png",
    "https://user:secret@cdn.example.test/cat.png",
    "https://cdn.example.test/cat.png?secret=1",
    "https://cdn.example.test:444/cat.png",
    "http://[::1",
  ]) {
    assert.equal(engine.decide("image.src", input).allowed, false, input);
  }
  assert.equal(engine.decide("video.src", "https://media.example.test:8443/a#x").allowed, false);
});

test("each enabled runtime decision normalizes attacker input exactly once", () => {
  class CountingURL extends URL {
    static constructions = 0;

    constructor(url: string | URL, base?: string | URL) {
      super(url, base);
      CountingURL.constructions += 1;
    }
  }

  const engine = createURLPolicy(policy, CountingURL);
  const afterCompilation = CountingURL.constructions;
  const decision = engine.decide("image.src", "./cat.png#preview");

  assert.equal(decision.allowed, true);
  assert.equal(CountingURL.constructions - afterCompilation, 1);
});

test("URL decisions reject objects without invoking stateful coercion", () => {
  let coercions = 0;
  const stateful = {
    toString() {
      coercions += 1;
      return "https://cdn.example.test/first";
    },
    [Symbol.toPrimitive]() {
      coercions += 1;
      return "https://cdn.example.test/second";
    },
  };

  const decision = createURLPolicy(policy).decide("image.src", stateful);
  assert.equal(decision.allowed, false);
  assert.equal(coercions, 0);
});

test("invalid host policy throws only the stable library error", () => {
  assert.throws(
    () => createURLPolicy({ baseURL: "javascript:alert(1)", sinks: {} }),
    (error: unknown) => isSafeDOMError(error) && error.code === "ERR_INVALID_POLICY",
  );
  assert.throws(
    () => createURLPolicy({
      baseURL: "https://example.test/",
      sinks: { "image.src": { allowedOrigins: [] } },
    }),
    (error: unknown) => isSafeDOMError(error) && error.code === "ERR_INVALID_POLICY",
  );
});
