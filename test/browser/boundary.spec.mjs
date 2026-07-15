import {
  expect,
  expectNoUnapprovedActivity,
  flushBrowserWork,
  openHarness,
  test,
} from "./fixtures.mjs";

test("denied image, link, media, and form actions leave the host and browser ledger unchanged", async ({
  page,
  browserLedger,
}) => {
  await openHarness(page, browserLedger);

  const before = await page.evaluate(() => {
    const outside = document.querySelector("#outside-sentinel");
    const mount = document.querySelector("#mount");
    if (!(outside instanceof HTMLElement) || !(mount instanceof HTMLElement)) {
      throw new Error("host fixture is incomplete");
    }
    const root = mount.attachShadow({ mode: "open" });
    const safeDocument = globalThis.arkPublicAPI.createSafeDocument(root);
    const image = safeDocument.createImage();
    const anchor = safeDocument.createAnchor();
    const video = safeDocument.createVideo();
    const audio = safeDocument.createAudio();
    const button = safeDocument.createButton();
    const input = safeDocument.createInput();
    const textarea = safeDocument.createTextarea();

    const decisions = [
      image.setSrc("/unapproved/image.png"),
      anchor.setHref("/unapproved/navigation"),
      video.setSrc("/unapproved/video.mp4"),
      video.setPoster("/unapproved/poster.png"),
      audio.setSrc("/unapproved/audio.mp3"),
    ].map((decision) => ({
      allowed: decision.allowed,
      code: decision.allowed ? null : decision.error.code,
    }));

    anchor.setText("denied navigation");
    button.setText("guest submit");
    for (const node of [image, anchor, video, audio, button, input, textarea]) {
      safeDocument.appendChild(node);
    }
    const physicalInput = root.querySelector("input");
    const physicalTextarea = root.querySelector("textarea");
    const physicalButton = root.querySelector("button");
    if (!(physicalInput instanceof HTMLInputElement) ||
        !(physicalTextarea instanceof HTMLTextAreaElement) ||
        !(physicalButton instanceof HTMLButtonElement)) {
      throw new Error("safe form controls were not created");
    }
    const forbidden = ["form", "formaction", "formenctype", "formmethod", "formnovalidate", "formtarget", "name"];
    const controlDefaults = {
      inputAutocomplete: physicalInput.autocomplete,
      textareaAutocomplete: physicalTextarea.autocomplete,
      buttonType: physicalButton.type,
      formsNull: [physicalInput.form, physicalTextarea.form, physicalButton.form].every((value) => value === null),
      forbiddenAbsent: [physicalInput, physicalTextarea, physicalButton].every((control) => (
        forbidden.every((name) => !control.hasAttribute(name))
      )),
    };
    input.setName("shared-name");
    input.setValue("guest-value");

    return {
      controlDefaults,
      decisions,
      outsideHTML: outside.outerHTML,
      rootHTML: root.innerHTML,
    };
  });

  await page.locator("#mount").locator("button").click();
  await page.locator("#mount").locator("a").click({ force: true });
  await flushBrowserWork(page);

  const after = await page.evaluate(() => {
    const outside = document.querySelector("#outside-sentinel");
    const form = document.querySelector("#host-form");
    const hostControl = document.querySelector("#host-control");
    if (!(outside instanceof HTMLElement) || !(form instanceof HTMLFormElement)) {
      throw new Error("host fixture is incomplete");
    }
    return {
      outsideHTML: outside.outerHTML,
      formAction: form.action,
      formValues: new FormData(form).getAll("shared-name"),
      namedControlIsHostControl: form.elements.namedItem("shared-name") === hostControl,
    };
  });

  expect(before.decisions).toEqual([
    { allowed: false, code: "ERR_URL_DENIED" },
    { allowed: false, code: "ERR_URL_DENIED" },
    { allowed: false, code: "ERR_URL_DENIED" },
    { allowed: false, code: "ERR_URL_DENIED" },
    { allowed: false, code: "ERR_URL_DENIED" },
  ]);
  expect(before.controlDefaults).toEqual({
    inputAutocomplete: "off",
    textareaAutocomplete: "off",
    buttonType: "button",
    formsNull: true,
    forbiddenAbsent: true,
  });
  expect(before.rootHTML).not.toContain("/unapproved/");
  expect(after.outsideHTML).toBe(before.outsideHTML);
  expect(after.formValues).toEqual(["host-value"]);
  expect(after.namedControlIsHostControl).toBe(true);
  expect(after.formAction).toBe("http://127.0.0.1:4173/unapproved/form-submit");
  expectNoUnapprovedActivity(browserLedger);
});

test("raw host reparent, adopt, and detach-to-external placement revoke before guest mutation", async ({
  page,
  browserLedger,
}) => {
  await openHarness(page, browserLedger);

  const result = await page.evaluate(() => {
    const outside = document.querySelector("#outside-sentinel");
    const iframe = document.querySelector("#foreign-realm");
    if (!(outside instanceof HTMLElement) || !(iframe instanceof HTMLIFrameElement)) {
      throw new Error("host fixture is incomplete");
    }
    const foreignDocument = iframe.contentDocument;
    if (!foreignDocument) throw new Error("foreign document is unavailable");

    const runCase = (kind) => {
      const host = document.createElement("div");
      const external = kind === "adopt"
        ? foreignDocument.createElement("section")
        : document.createElement("section");
      document.body.append(host);
      if (kind === "adopt") foreignDocument.body.append(external);
      else document.body.append(external);
      const root = host.attachShadow({ mode: "open" });
      const safeDocument = globalThis.arkPublicAPI.createSafeDocument(root);
      const wrapper = safeDocument.createDiv();
      safeDocument.appendChild(wrapper);
      const raw = root.firstElementChild;
      if (!(raw instanceof Element)) throw new Error("owned element was not mounted");

      if (kind === "reparent") external.append(raw);
      if (kind === "adopt") {
        foreignDocument.adoptNode(raw);
        external.append(raw);
      }
      if (kind === "detach-to-external") {
        wrapper.detach();
        external.append(raw);
      }

      const errors = [];
      try {
        wrapper.setText("guest mutation");
      } catch (error) {
        errors.push(error?.code);
      }
      try {
        wrapper.setTitle("second mutation");
      } catch (error) {
        errors.push(error?.code);
      }

      return {
        kind,
        errors,
        ownerIsForeign: raw.ownerDocument === foreignDocument,
        text: raw.textContent,
        title: raw.getAttribute("title"),
        externalHTML: external.innerHTML,
      };
    };

    return {
      before: outside.outerHTML,
      cases: [runCase("reparent"), runCase("adopt"), runCase("detach-to-external")],
      after: outside.outerHTML,
    };
  });

  await flushBrowserWork(page);

  expect(result.after).toBe(result.before);
  expect(result.cases).toEqual([
    {
      kind: "reparent",
      errors: ["PLACEMENT_VIOLATION", "NODE_REVOKED"],
      ownerIsForeign: false,
      text: "",
      title: null,
      externalHTML: "<div></div>",
    },
    {
      kind: "adopt",
      errors: ["PLACEMENT_VIOLATION", "NODE_REVOKED"],
      ownerIsForeign: true,
      text: "",
      title: null,
      externalHTML: "<div></div>",
    },
    {
      kind: "detach-to-external",
      errors: ["PLACEMENT_VIOLATION", "NODE_REVOKED"],
      ownerIsForeign: false,
      text: "",
      title: null,
      externalHTML: "<div></div>",
    },
  ]);
  expectNoUnapprovedActivity(browserLedger);
});

test("host sink policy grants one image request while navigation and media remain denied", async ({
  page,
  browserLedger,
}) => {
  await openHarness(page, browserLedger);

  const decisions = await page.evaluate(() => {
    const mount = document.querySelector("#mount");
    if (!(mount instanceof HTMLElement)) throw new Error("host fixture is incomplete");
    const root = mount.attachShadow({ mode: "open" });
    const safeDocument = globalThis.arkPublicAPI.createSafeDocument(root, {
      urlPolicy: {
        baseURL: "http://127.0.0.1:4173/",
        sinks: {
          "image.src": {
            allowedOrigins: ["http://127.0.0.1:4173"],
            allowedProtocols: ["http:"],
            allowQuery: true,
          },
        },
      },
    });
    const image = safeDocument.createImage();
    const anchor = safeDocument.createAnchor();
    const video = safeDocument.createVideo();
    const imageDecision = image.setSrc("/allowed/pixel.png?case=per-sink");
    const anchorDecision = anchor.setHref("/unapproved/navigation");
    const videoDecision = video.setSrc("/unapproved/video.mp4");
    anchor.setText("denied navigation");
    safeDocument.appendChild(image);
    safeDocument.appendChild(anchor);
    safeDocument.appendChild(video);

    const summarize = (decision) => ({
      allowed: decision.allowed,
      code: decision.allowed ? null : decision.error.code,
      url: decision.allowed ? decision.url : null,
    });
    return [summarize(imageDecision), summarize(anchorDecision), summarize(videoDecision)];
  });

  await page.locator("#mount").locator("img").evaluate(async (image) => {
    if (image.complete && image.naturalWidth > 0) return;
    await new Promise((resolve, reject) => {
      image.addEventListener("load", resolve, { once: true });
      image.addEventListener("error", () => reject(new Error("approved image failed")), {
        once: true,
      });
    });
  });
  await page.locator("#mount").locator("a").click({ force: true });
  await flushBrowserWork(page);

  expect(decisions).toEqual([
    {
      allowed: true,
      code: null,
      url: "http://127.0.0.1:4173/allowed/pixel.png?case=per-sink",
    },
    { allowed: false, code: "ERR_URL_DENIED", url: null },
    { allowed: false, code: "ERR_URL_DENIED", url: null },
  ]);
  expect(
    browserLedger.requests.filter(({ url }) => new URL(url).pathname === "/allowed/pixel.png"),
    `expected one approved image request; actual ledger: ${JSON.stringify(browserLedger.requests)}`,
  ).toEqual([
    {
      method: "GET",
      resourceType: "image",
      url: "http://127.0.0.1:4173/allowed/pixel.png?case=per-sink",
    },
  ]);
  expectNoUnapprovedActivity(browserLedger, ["/allowed/pixel.png"]);
});

test("ownerDocument iframe realm works after ambient DOM constructors are poisoned", async ({
  page,
  browserLedger,
}) => {
  await openHarness(page, browserLedger);

  const result = await page.evaluate(() => {
    const iframe = document.querySelector("#foreign-realm");
    if (!(iframe instanceof HTMLIFrameElement)) throw new Error("foreign iframe is unavailable");
    const foreignDocument = iframe.contentDocument;
    const foreignWindow = iframe.contentWindow;
    const foreignMount = foreignDocument?.querySelector("#foreign-mount");
    if (!foreignDocument || !foreignWindow || !(foreignMount instanceof foreignWindow.HTMLElement)) {
      throw new Error("foreign realm fixture is incomplete");
    }
    const root = foreignMount.attachShadow({ mode: "open" });
    const PoisonedAmbientConstructor = function PoisonedAmbientConstructor() {
      throw new Error("ambient DOM constructor was used");
    };
    for (const name of [
      "AbortController",
      "Document",
      "Element",
      "Event",
      "HTMLElement",
      "ShadowRoot",
      "Text",
      "URL",
    ]) {
      Object.defineProperty(globalThis, name, {
        configurable: true,
        value: PoisonedAmbientConstructor,
      });
    }

    const safeDocument = globalThis.arkPublicAPI.createSafeDocument(root);
    const wrapper = safeDocument.createDiv();
    wrapper.setText("foreign realm content");
    safeDocument.appendChild(wrapper);

    return {
      ownerIsForeign: root.ownerDocument === foreignDocument,
      rootIsForeignShadowRoot: Object.prototype.isPrototypeOf.call(
        foreignWindow.ShadowRoot.prototype,
        root,
      ),
      rootHTML: root.innerHTML,
      wrapperText: wrapper.getText(),
    };
  });

  expect(result).toEqual({
    ownerIsForeign: true,
    rootIsForeignShadowRoot: true,
    rootHTML: "<div>foreign realm content</div>",
    wrapperText: "foreign realm content",
  });
  expectNoUnapprovedActivity(browserLedger);
});

test("hostile Worker infinite loop is terminable; same-thread DoS is intentionally out of scope", async ({
  page,
  browserLedger,
}) => {
  await openHarness(page, browserLedger);

  const result = await page.evaluate(async () => {
    // Never run the hostile loop on the page thread: same-thread availability
    // is not provided by this DOM capability and requires an isolation boundary.
    const worker = new Worker("/hostile-worker.js");
    const started = await new Promise((resolve, reject) => {
      worker.addEventListener("message", (event) => resolve(event.data), { once: true });
      worker.addEventListener("error", () => reject(new Error("hostile worker failed to start")), {
        once: true,
      });
    });
    worker.terminate();
    const pageThreadResponse = await new Promise((resolve) => {
      requestAnimationFrame(() => resolve("responsive"));
    });
    return { started, pageThreadResponse };
  });
  await flushBrowserWork(page);

  expect(result).toEqual({ started: "started", pageThreadResponse: "responsive" });
  const workerRequests = browserLedger.requests.filter(
    ({ url }) => new URL(url).pathname === "/hostile-worker.js",
  );
  expect(
    workerRequests.map(({ method, url }) => ({ method, url })),
    `expected one hostile Worker request; actual ledger: ${JSON.stringify(browserLedger.requests)}`,
  ).toEqual([
    {
      method: "GET",
      url: "http://127.0.0.1:4173/hostile-worker.js",
    },
  ]);
  expect(
    ["script", "xhr"],
    `expected a known Playwright Worker classification; actual ledger: ${JSON.stringify(workerRequests)}`,
  ).toContain(workerRequests[0].resourceType);
  expectNoUnapprovedActivity(browserLedger, ["/hostile-worker.js"]);
});
