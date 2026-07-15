import {
  expect,
  expectNoUnapprovedActivity,
  flushBrowserWork,
  openHarness,
  test,
} from "./fixtures.mjs";

test("a specific indefinitely progressing Worker stops after host termination", async ({
  page,
  browserLedger,
}) => {
  await openHarness(page, browserLedger);
  browserLedger.reset();

  const result = await page.evaluate(async () => {
    if (!crossOriginIsolated) throw new Error("harness must be cross-origin isolated");
    if (typeof SharedArrayBuffer !== "function") throw new Error("SharedArrayBuffer is unavailable");
    const progress = new BigInt64Array(new SharedArrayBuffer(16));
    const worker = new Worker("/hostile-worker.js");
    worker.postMessage(progress.buffer);
    const started = await new Promise((resolve, reject) => {
      worker.addEventListener("message", (event) => resolve(event.data), { once: true });
      worker.addEventListener("error", () => reject(new Error("hostile worker failed to start")), {
        once: true,
      });
    });

    const observed = [];
    const progressDeadline = performance.now() + 2_000;
    while (new Set(observed).size < 2 && performance.now() < progressDeadline) {
      observed.push(Atomics.load(progress, 0).toString());
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    if (new Set(observed).size < 2) throw new Error("Worker made no observable progress");

    worker.terminate();
    let stableValue;
    let consecutive = 0;
    const stopSamples = [];
    const stopStartedAt = performance.now();
    const stopDeadline = performance.now() + 2_000;
    while (consecutive < 6 && performance.now() < stopDeadline) {
      const sample = Atomics.load(progress, 0);
      stopSamples.push(sample.toString());
      if (stopSamples.length > 12) stopSamples.shift();
      if (sample === stableValue) consecutive += 1;
      else {
        stableValue = sample;
        consecutive = 1;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    if (consecutive < 6 || stableValue === undefined) {
      throw new Error(
        `Worker progress did not become stable after terminate(): ${JSON.stringify({
          consecutive,
          elapsed: performance.now() - stopStartedAt,
          stopSamples,
        })}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 75));
    const afterBoundedWait = Atomics.load(progress, 0);
    const pageThreadResponse = await new Promise((resolve) => {
      requestAnimationFrame(() => resolve("responsive"));
    });
    return {
      crossOriginIsolated,
      started,
      startedFlag: Atomics.load(progress, 1).toString(),
      distinctProgressSamples: new Set(observed).size,
      stable: afterBoundedWait === stableValue,
      stoppedAt: stableValue.toString(),
      pageThreadResponse,
    };
  });
  await flushBrowserWork(page);

  expect(result).toMatchObject({
    crossOriginIsolated: true,
    started: "started",
    startedFlag: "1",
    stable: true,
    pageThreadResponse: "responsive",
  });
  expect(result.distinctProgressSamples).toBeGreaterThanOrEqual(2);
  expect(BigInt(result.stoppedAt)).toBeGreaterThan(0n);
  const workerRequests = browserLedger.requests.filter(
    ({ url }) => new URL(url).pathname === "/hostile-worker.js",
  );
  expect(workerRequests).toHaveLength(1);
  expect(workerRequests[0]).toMatchObject({ method: "GET" });
  expect(["script", "xhr"]).toContain(workerRequests[0].resourceType);
  expectNoUnapprovedActivity(browserLedger, ["/hostile-worker.js"]);
});
