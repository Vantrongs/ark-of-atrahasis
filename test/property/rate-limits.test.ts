// @vitest-environment jsdom

import fc from "fast-check";
import { afterEach, describe, expect, it } from "vitest";
import { createControlledOwnerClock } from "../support/controlled-owner-clock.ts";
import { createTestSafeDocument as createSafeDocument } from "../support/create-safe-document.ts";
import {
  assertStableBoundaryError,
  captureThrown,
  propertyParameters,
} from "../support/property-config.ts";

const RUNS = 160;
const MONOTONIC_TIMESTAMPS = fc.array(
  fc.integer({ min: 0, max: 40 }),
  { minLength: 1, maxLength: 64 },
).map((deltas) => {
  let timestamp = 0;
  return deltas.map((delta) => {
    timestamp += delta;
    return timestamp;
  });
});

interface FixedWindowModel {
  count: number;
  startedAt?: number;
}

function accepts(
  model: FixedWindowModel,
  timestamp: number,
  limit: number,
  windowMs: number,
): boolean {
  if (model.startedAt === undefined || timestamp - model.startedAt >= windowMs) {
    model.startedAt = timestamp;
    model.count = 0;
  }
  if (model.count >= limit) return false;
  model.count += 1;
  return true;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("generated fixed-window rate models", () => {
  it("matches the operation model across monotonic windows and exact rejections", () => {
    fc.assert(fc.property(
      fc.integer({ min: 0, max: 8 }),
      fc.integer({ min: 1, max: 120 }),
      MONOTONIC_TIMESTAMPS,
      (limit, windowMs, timestamps) => {
        const clock = createControlledOwnerClock();
        try {
          const safeDocument = createSafeDocument(clock.root, {
            quotas: { nodes: 128, operations: 1_000 },
            rates: { operations: { limit, windowMs } },
          });
          const model: FixedWindowModel = { count: 0 };
          for (const timestamp of timestamps) {
            clock.set(timestamp);
            if (accepts(model, timestamp, limit, windowMs)) {
              expect(() => safeDocument.createDiv()).not.toThrow();
            } else {
              assertStableBoundaryError(
                captureThrown(() => safeDocument.createDiv()),
                "RATE_LIMIT_EXCEEDED",
              );
            }
          }
        } finally {
          clock.restore();
        }
      },
    ), propertyParameters(RUNS));
  });

  it("matches the request-attempt model for denied calls independently of operations", () => {
    fc.assert(fc.property(
      fc.integer({ min: 0, max: 8 }),
      fc.integer({ min: 1, max: 120 }),
      MONOTONIC_TIMESTAMPS,
      (limit, windowMs, timestamps) => {
        const clock = createControlledOwnerClock();
        try {
          const safeDocument = createSafeDocument(clock.root, {
            quotas: { operations: 1_000, requestAttempts: 1_000 },
            rates: {
              operations: { limit: 1_000, windowMs: 1 },
              requestAttempts: { limit, windowMs },
            },
          });
          const image = safeDocument.createImage();
          const model: FixedWindowModel = { count: 0 };
          for (const timestamp of timestamps) {
            clock.set(timestamp);
            if (accepts(model, timestamp, limit, windowMs)) {
              expect(image.setSrc("https://denied.example/image.png").allowed).toBe(false);
            } else {
              assertStableBoundaryError(
                captureThrown(() => image.setSrc("https://denied.example/image.png")),
                "RATE_LIMIT_EXCEEDED",
              );
            }
          }
        } finally {
          clock.restore();
        }
      },
    ), propertyParameters(RUNS));
  });
});
