import { performance } from "node:perf_hooks";
import { Worker } from "node:worker_threads";
import { expect, test } from "vitest";

const workerSource = `
  const { parentPort, workerData } = require("node:worker_threads");
  const progress = new BigInt64Array(workerData);
  Atomics.store(progress, 1, 1n);
  parentPort.postMessage("started");
  for (;;) Atomics.add(progress, 0, 1n);
`;

test("Node terminates an unyielding isolated Worker after proven shared progress", async () => {
  const progress = new BigInt64Array(new SharedArrayBuffer(16));
  const worker = new Worker(workerSource, { eval: true, workerData: progress.buffer });
  let terminated = false;
  try {
    const started = await new Promise((resolve, reject) => {
      worker.once("message", resolve);
      worker.once("error", reject);
    });
    expect(started).toBe("started");

    const observed = new Set();
    const deadline = performance.now() + 2_000;
    while (observed.size < 2 && performance.now() < deadline) {
      observed.add(Atomics.load(progress, 0));
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(observed.size).toBeGreaterThanOrEqual(2);

    await worker.terminate();
    terminated = true;
    const stoppedAt = Atomics.load(progress, 0);
    await new Promise((resolve) => setTimeout(resolve, 75));
    expect(Atomics.load(progress, 0)).toBe(stoppedAt);
    expect(stoppedAt).toBeGreaterThan(0n);
  } finally {
    if (!terminated) await worker.terminate();
  }
});
