import {
  expect,
  expectNoUnapprovedActivity,
  flushBrowserWork,
  openHarness,
  test,
} from "./fixtures.mjs";

test("an unyielding Worker stops after host termination while the page stays responsive", async ({
  page,
  browserLedger,
  browserName,
}) => {
  await openHarness(page, browserLedger);
  browserLedger.reset();

  const beforeTermination = await page.evaluate(async () => {
    if (!crossOriginIsolated) throw new Error("harness must be cross-origin isolated");
    if (typeof SharedArrayBuffer !== "function") throw new Error("SharedArrayBuffer is unavailable");
    const progress = new Uint32Array(new SharedArrayBuffer(8));
    const worker = new Worker("/hostile-worker.js");
    worker.postMessage(progress.buffer);
    const started = await new Promise((resolve, reject) => {
      worker.addEventListener("message", (event) => resolve(event.data), { once: true });
      worker.addEventListener("error", (event) => {
        reject(new Error(event.message || "hostile worker failed to start"));
      }, { once: true });
    });

    const observed = [];
    const progressDeadline = performance.now() + 2_000;
    while (new Set(observed).size < 2 && performance.now() < progressDeadline) {
      observed.push(Atomics.load(progress, 0));
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    if (new Set(observed).size < 2) throw new Error("Worker made no observable progress");

    const pageThreadResponse = await new Promise((resolve) => {
      requestAnimationFrame(() => resolve("responsive"));
    });
    worker.terminate();
    globalThis.__arkTerminatedWorker = { progress, worker };
    return {
      crossOriginIsolated,
      started,
      startedFlag: Atomics.load(progress, 1),
      distinctProgressSamples: new Set(observed).size,
      pageThreadResponse,
    };
  });

  // Chromium's worker implementation schedules forced script termination after
  // a two-second grace period. Keep that wait outside a long inspector
  // evaluation so the browser's parent-thread termination task can run.
  await page.waitForTimeout(browserName === "chromium" ? 2_500 : 100);
  const stoppedAt = await page.evaluate(() => {
    return Atomics.load(globalThis.__arkTerminatedWorker.progress, 0);
  });
  await page.waitForTimeout(100);
  const result = await page.evaluate(() => {
    const state = globalThis.__arkTerminatedWorker;
    const afterBoundedWait = Atomics.load(state.progress, 0);
    const pageThreadResponse = document.readyState;
    state.worker.terminate();
    delete globalThis.__arkTerminatedWorker;
    return { afterBoundedWait, pageThreadResponse };
  });
  await flushBrowserWork(page);

  expect(beforeTermination).toMatchObject({
    crossOriginIsolated: true,
    started: "entered-unyielding-loop",
    startedFlag: 1,
    pageThreadResponse: "responsive",
  });
  expect(beforeTermination.distinctProgressSamples).toBeGreaterThanOrEqual(2);
  expect(stoppedAt).toBeGreaterThan(0);
  expect(result.afterBoundedWait).toBe(stoppedAt);
  expect(result.pageThreadResponse).toBe("complete");
  const workerRequests = browserLedger.requests.filter(
    ({ url }) => new URL(url).pathname === "/hostile-worker.js",
  );
  expect(workerRequests).toHaveLength(1);
  expect(workerRequests[0]).toMatchObject({ method: "GET" });
  expect(["script", "xhr"]).toContain(workerRequests[0].resourceType);
  expectNoUnapprovedActivity(browserLedger, ["/hostile-worker.js"]);
});
