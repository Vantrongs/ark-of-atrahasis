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

test("opaque identifier and form namespace leaves host form, named access, and autofill state unchanged", async ({
  page,
  browserLedger,
}) => {
  await openHarness(page, browserLedger);

  const result = await page.evaluate(() => {
    const mount = document.querySelector("#mount");
    const hostForm = document.querySelector("#host-form");
    const hostControl = document.querySelector("#host-control");
    const outside = document.querySelector("#outside-sentinel");
    if (!(mount instanceof HTMLElement) ||
        !(hostForm instanceof HTMLFormElement) ||
        !(hostControl instanceof HTMLInputElement) ||
        !(outside instanceof HTMLElement)) {
      throw new Error("host fixture is incomplete");
    }
    hostControl.id = "shared-key";
    hostControl.name = "shared-key";
    hostControl.value = "host-value";
    hostControl.autocomplete = "email";
    const hostLabel = document.createElement("label");
    hostLabel.htmlFor = "shared-key";
    hostLabel.textContent = "host label";
    hostForm.prepend(hostLabel);

    const snapshotHost = () => ({
      formValues: new FormData(hostForm).getAll("shared-key"),
      namedItemIsHost: hostForm.elements.namedItem("shared-key") === hostControl,
      idLookupIsHost: document.getElementById("shared-key") === hostControl,
      nameLookupIsHostOnly: document.getElementsByName("shared-key").length === 1 &&
        document.getElementsByName("shared-key")[0] === hostControl,
      documentNamedIsHost: document["shared-key"] === hostControl,
      windowNamedIsHost: window["shared-key"] === hostControl,
      value: hostControl.value,
      checked: hostControl.checked,
      autocomplete: hostControl.autocomplete,
      controlHTML: hostControl.outerHTML,
      labelHTML: hostLabel.outerHTML,
      formAction: hostForm.action,
    });
    const before = snapshotHost();

    const root = mount.attachShadow({ mode: "open" });
    const safeDocument = globalThis.arkPublicAPI.createSafeDocument(root);
    const input = safeDocument.createInput();
    const textarea = safeDocument.createTextarea();
    const select = safeDocument.createSelect();
    const option = safeDocument.createOption();
    const button = safeDocument.createButton();
    const radioA = safeDocument.createInput();
    const radioB = safeDocument.createInput();
    const label = safeDocument.createLabel();
    const described = safeDocument.createDiv();
    const cell = safeDocument.createTh();

    input.setId("shared-key");
    textarea.setId("textarea-key");
    select.setId("select-key");
    button.setId("button-key");
    for (const control of [input, textarea, select, button]) control.setName("shared-key");
    option.setValue("safe-option");
    option.setText("safe option");
    select.appendChild(option);
    radioA.setType("radio");
    radioB.setType("radio");
    radioA.setName("radio-choice");
    radioB.setName("radio-choice");
    label.setFor("shared-key");
    label.setText("safe label");
    described.setAria("controls", "shared-key textarea-key");
    cell.setHeaders("shared-key textarea-key");
    for (const node of [
      label,
      input,
      textarea,
      select,
      button,
      radioA,
      radioB,
      described,
      cell,
    ]) {
      safeDocument.appendChild(node);
    }

    const secondMount = document.createElement("div");
    document.body.append(secondMount);
    const secondRoot = secondMount.attachShadow({ mode: "open" });
    const secondDocument = globalThis.arkPublicAPI.createSafeDocument(secondRoot);
    const secondInput = secondDocument.createInput();
    secondInput.setId("shared-key");
    secondInput.setName("shared-key");
    secondDocument.appendChild(secondInput);

    const physicalInput = root.querySelector("input");
    const physicalTextarea = root.querySelector("textarea");
    const physicalSelect = root.querySelector("select");
    const physicalButton = root.querySelector("button");
    const physicalLabel = root.querySelector("label");
    const physicalRadios = [...root.querySelectorAll('input[type="radio"]')];
    const physicalDescribed = root.querySelector("div");
    const physicalCell = root.querySelector("th");
    const secondPhysicalInput = secondRoot.querySelector("input");
    if (!(physicalInput instanceof HTMLInputElement) ||
        !(physicalTextarea instanceof HTMLTextAreaElement) ||
        !(physicalSelect instanceof HTMLSelectElement) ||
        !(physicalButton instanceof HTMLButtonElement) ||
        !(physicalLabel instanceof HTMLLabelElement) ||
        !(physicalDescribed instanceof HTMLElement) ||
        !(physicalCell instanceof HTMLTableCellElement) ||
        !(secondPhysicalInput instanceof HTMLInputElement) ||
        physicalRadios.length !== 2) {
      throw new Error("safe namespace controls were not created");
    }

    const namespaceValues = [
      physicalInput.id,
      physicalInput.name,
      physicalTextarea.id,
      physicalTextarea.name,
      physicalSelect.id,
      physicalSelect.name,
      physicalButton.id,
      physicalButton.name,
      physicalLabel.htmlFor,
      physicalDescribed.getAttribute("aria-controls") ?? "",
      physicalCell.headers,
    ];
    const tokenPattern = /^aoa-[in]-[0-9a-f]{48}(?: aoa-i-[0-9a-f]{48})*$/;
    const namespaceValuesOpaque = namespaceValues.every((value) => (
      tokenPattern.test(value) && !value.includes("shared-key")
    ));
    const perDocumentOpaque = physicalInput.id !== secondPhysicalInput.id &&
      physicalInput.name !== secondPhysicalInput.name;
    const sameNameWithinDocument = [
      physicalTextarea.name,
      physicalSelect.name,
      physicalButton.name,
    ].every((value) => value === physicalInput.name);

    physicalLabel.click();
    const labelTargetsSafeInput = root.activeElement === physicalInput;
    physicalRadios[0].click();
    physicalRadios[1].click();
    const radioGroupingPreserved = physicalRadios[0].checked === false &&
      physicalRadios[1].checked === true;
    physicalInput.focus();
    physicalInput.value = "guest-value";
    physicalInput.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      data: "x",
      inputType: "insertText",
    }));
    physicalButton.click();

    const autofillFacing = {
      autocompleteOff: [
        physicalInput.autocomplete,
        physicalTextarea.autocomplete,
        physicalSelect.autocomplete,
      ].every((value) => value === "off"),
      namesAreOpaque: [physicalInput, physicalTextarea, physicalSelect].every((control) => (
        /^aoa-n-[0-9a-f]{48}$/.test(control.name) && control.name !== "shared-key"
      )),
      idsAreOpaque: [physicalInput, physicalTextarea, physicalSelect].every((control) => (
        /^aoa-i-[0-9a-f]{48}$/.test(control.id) && !control.id.includes("shared-key")
      )),
      formsNull: [physicalInput, physicalTextarea, physicalSelect, physicalButton]
        .every((control) => control.form === null),
      buttonType: physicalButton.type,
    };

    document.body.append(physicalInput);
    label.getFor();
    let revokedCode = null;
    try {
      input.getId();
    } catch (error) {
      revokedCode = error?.code ?? null;
    }
    const reparentCleanup = {
      idRemoved: !physicalInput.hasAttribute("id"),
      nameRemoved: !physicalInput.hasAttribute("name"),
      revokedCode,
      lookupNull: safeDocument.getElement("shared-key") === null,
    };

    return {
      before,
      after: snapshotHost(),
      namespaceValuesOpaque,
      perDocumentOpaque,
      sameNameWithinDocument,
      labelTargetsSafeInput,
      radioGroupingPreserved,
      localLookupCanonical: safeDocument.getElement("textarea-key") === textarea,
      logicalGetters: {
        id: textarea.getId(),
        for: label.getFor(),
        headers: cell.getHeaders(),
        aria: described.getAria("controls"),
      },
      autofillFacing,
      reparentCleanup,
    };
  });

  await flushBrowserWork(page);
  expect(result.after).toEqual(result.before);
  expect(result).toMatchObject({
    namespaceValuesOpaque: true,
    perDocumentOpaque: true,
    sameNameWithinDocument: true,
    labelTargetsSafeInput: true,
    radioGroupingPreserved: true,
    localLookupCanonical: true,
    logicalGetters: {
      id: "textarea-key",
      for: "shared-key",
      headers: "shared-key textarea-key",
      aria: "shared-key textarea-key",
    },
    autofillFacing: {
      autocompleteOff: true,
      namesAreOpaque: true,
      idsAreOpaque: true,
      formsNull: true,
      buttonType: "button",
    },
    reparentCleanup: {
      idRemoved: true,
      nameRemoved: true,
      revokedCode: "NODE_REVOKED",
      lookupNull: true,
    },
  });
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
