import {
  expect,
  expectNoUnapprovedActivity,
  flushBrowserWork,
  openHarness,
  test,
} from "./fixtures.mjs";

test("real browser SES hardens the completed public capability graph", async ({
  page,
  browserLedger,
}) => {
  await openHarness(page, browserLedger);

  const state = await page.evaluateHandle(() => {
    const mount = document.querySelector("#mount");
    if (!(mount instanceof HTMLElement)) throw new Error("host fixture is incomplete");
    const root = mount.attachShadow({ mode: "open" });
    const safeDocument = globalThis.arkPublicAPI.createSafeDocument(root, {
      stylePolicy: { allowedProperties: ["color"] },
    });
    const input = safeDocument.createInput();
    const guest = new Compartment({ safeDocument });
    guest.evaluate(`
      globalThis.div = safeDocument.createDiv();
      div.setId("browser-trace");
      div.setText("guest trace");
      div.style.set("color", "red");
      safeDocument.appendChild(div);
      globalThis.image = safeDocument.createImage();
      globalThis.denied = image.setSrc("https://attacker.test/ses.png");
      safeDocument.appendChild(image);
      image.detach();
      safeDocument.appendChild(image);
      globalThis.clicks = 0;
      globalThis.cleanup = div.onClick(event => {
        globalThis.snapshot = event;
        globalThis.clicks += 1;
      });
    `);
    const guestDiv = guest.evaluate("div");
    const rawDiv = root.querySelector("div");
    if (!(rawDiv instanceof HTMLElement)) throw new Error("guest trace div is missing");
    rawDiv.dispatchEvent(new MouseEvent("click", { cancelable: true }));
    return { root, safeDocument, guest, input, guestDiv };
  });
  try {
    const live = await state.evaluate(({ root, safeDocument, guest, input, guestDiv }) => ({
      compartment: typeof Compartment === "function",
      document: Object.isFrozen(safeDocument),
      input: Object.isFrozen(input),
      inputMethod: Object.isFrozen(input.getValue),
      style: Object.isFrozen(input.style),
      styleMethod: Object.isFrozen(input.style.set),
      guestDiv: Object.isFrozen(guestDiv),
      trace: {
        lookup: guest.evaluate('safeDocument.getElement("browser-trace") === div'),
        style: guest.evaluate('div.style.get("color")'),
        denied: guest.evaluate("({ allowed: denied.allowed, code: denied.error.code })"),
        imageReattached: root.querySelector("img") !== null,
        clicks: guest.evaluate("clicks"),
        eventFrozen: guest.evaluate("Object.isFrozen(snapshot)"),
        targetFrozen: guest.evaluate("Object.isFrozen(snapshot.target)"),
        controlClosed: guest.evaluate("snapshot.preventDefault() === false"),
        cleanupFrozen: guest.evaluate("Object.isFrozen(cleanup)"),
      },
    }));
    await flushBrowserWork(page);
    expectNoUnapprovedActivity(browserLedger);

    const terminal = await state.evaluate(({ root, safeDocument, guest }) => {
      safeDocument.dispose();
      const disposed = guest.evaluate(`
        try {
          div.getText();
          null;
        } catch (error) {
          ({ code: error.code, frozen: Object.isFrozen(error) });
        }
      `);
      return { disposed, rootEmpty: root.childNodes.length === 0 };
    });
    await flushBrowserWork(page);

    expect(live).toEqual({
      compartment: true,
      document: true,
      input: true,
      inputMethod: true,
      style: true,
      styleMethod: true,
      guestDiv: true,
      trace: {
        lookup: true,
        style: "red",
        denied: { allowed: false, code: "ERR_URL_DENIED" },
        imageReattached: true,
        clicks: 1,
        eventFrozen: true,
        targetFrozen: true,
        controlClosed: true,
        cleanupFrozen: true,
      },
    });
    expect(terminal).toEqual({
      disposed: { code: "DOCUMENT_DISPOSED", frozen: true },
      rootEmpty: true,
    });
    expectNoUnapprovedActivity(browserLedger);
  } finally {
    await state.dispose();
  }
});

test("real browser SES covers the browser-relevant strict acceptance matrix", async ({
  page,
  browserLedger,
}) => {
  await openHarness(page, browserLedger);

  const result = await page.evaluate(() => {
    const mount = document.querySelector("#mount");
    const hostForm = document.querySelector("#host-form");
    if (!(mount instanceof HTMLElement) || !(hostForm instanceof HTMLFormElement)) {
      throw new Error("host fixture is incomplete");
    }
    const hostFormBefore = [...new FormData(hostForm).entries()];
    const root = mount.attachShadow({ mode: "open" });
    const safeDocument = globalThis.arkPublicAPI.createSafeDocument(root, {
      stylePolicy: { allowedProperties: ["color"] },
    });

    const foreignHost = document.createElement("div");
    const quotaHost = document.createElement("div");
    foreignHost.style.contain = "paint";
    quotaHost.style.contain = "paint";
    document.body.append(foreignHost, quotaHost);
    const foreignRoot = foreignHost.attachShadow({ mode: "open" });
    const quotaRoot = quotaHost.attachShadow({ mode: "open" });
    const foreignDocument = globalThis.arkPublicAPI.createSafeDocument(foreignRoot);
    const quotaDocument = globalThis.arkPublicAPI.createSafeDocument(quotaRoot, {
      quotas: { nodes: 1 },
    });
    const foreignWrapper = foreignDocument.createDiv();
    const guest = new Compartment({ foreignWrapper, quotaDocument, safeDocument });

    guest.evaluate(`
      globalThis.capture = action => {
        try {
          action();
          return null;
        } catch (error) {
          return {
            code: error.code,
            frozen: Object.isFrozen(error),
            noCause: !Object.hasOwn(error, "cause"),
            noStack: !Object.hasOwn(error, "stack"),
            operation: error.operation,
          };
        }
      };
      globalThis.authority = {
        domGlobalsAbsent: [typeof document, typeof window, typeof Node, typeof Element]
          .every(value => value === "undefined"),
        rawKeysAbsent: ["root", "host", "ownerDocument", "defaultView"]
          .every(key => !Reflect.ownKeys(safeDocument).includes(key)),
      };
      globalThis.div = safeDocument.createDiv();
      div.setText("ses matrix");
      globalThis.styleAllowed = div.style.set("color", "red");
      globalThis.styleDenied = div.style.set("position", "fixed");
      safeDocument.appendChild(div);
      globalThis.image = safeDocument.createImage();
      globalThis.urlDenied = image.setSrc("https://attacker.test/ses-matrix.png");
      safeDocument.appendChild(image);

      globalThis.input = safeDocument.createInput();
      input.setId("ses-control");
      input.setName("ses-name");
      globalThis.passwordError = capture(() => input.setType("password"));
      safeDocument.appendChild(input);

      globalThis.button = safeDocument.createButton();
      safeDocument.appendChild(button);
      button.onClick(event => { globalThis.eventSnapshot = event; });
      globalThis.topologyError = capture(() => div.appendChild(div));
      globalThis.crossOwnerError = capture(() => safeDocument.appendChild(foreignWrapper));
      globalThis.numericError = capture(() => safeDocument.createCanvas().setWidth(Infinity));

      globalThis.quotaFirst = quotaDocument.createDiv();
      globalThis.quotaError = capture(() => quotaDocument.createSpan());
      quotaFirst.dispose();
      globalThis.quotaReplacement = quotaDocument.createSpan();
      globalThis.quotaReleaseWorked = quotaReplacement.getText() === "";
    `);

    const rawButton = root.querySelector("button");
    const rawInput = root.querySelector("input");
    if (!(rawButton instanceof HTMLButtonElement) || !(rawInput instanceof HTMLInputElement)) {
      throw new Error("SES matrix controls are missing");
    }
    const event = new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: false });
    Object.defineProperty(event, "ctrlKey", {
      configurable: true,
      get: () => { throw document.body; },
    });
    rawButton.dispatchEvent(event);

    const formIsolation = {
      autocomplete: rawInput.autocomplete,
      formNull: rawInput.form === null,
      hostFormUnchanged: JSON.stringify([...new FormData(hostForm).entries()])
        === JSON.stringify(hostFormBefore),
      type: rawInput.type,
    };
    const outside = document.createElement("section");
    document.body.append(outside);
    outside.append(rawInput);
    const placementError = guest.evaluate(`capture(() => input.getId())`);
    const terminalError = guest.evaluate(`capture(() => input.getValue())`);
    const placementCleanup = {
      idRemoved: !rawInput.hasAttribute("id"),
      nameRemoved: !rawInput.hasAttribute("name"),
      stillOutside: outside.firstElementChild === rawInput,
    };

    const guestResult = guest.evaluate(`({
      authority,
      crossOwnerError,
      event: {
        ctrlKey: eventSnapshot.ctrlKey,
        frozen: Object.isFrozen(eventSnapshot),
        targetFrozen: Object.isFrozen(eventSnapshot.target),
      },
      numericError,
      passwordError,
      quotaError,
      quotaReleaseWorked,
      styleAllowed,
      styleDenied,
      topologyError,
      urlDenied: { allowed: urlDenied.allowed, code: urlDenied.error.code },
    })`);

    safeDocument.dispose();
    foreignDocument.dispose();
    quotaDocument.dispose();
    outside.remove();
    foreignHost.remove();
    quotaHost.remove();
    return { formIsolation, guestResult, placementCleanup, placementError, terminalError };
  });

  await flushBrowserWork(page);
  expect(result).toMatchObject({
    formIsolation: {
      autocomplete: "off",
      formNull: true,
      hostFormUnchanged: true,
      type: "text",
    },
    guestResult: {
      authority: { domGlobalsAbsent: true, rawKeysAbsent: true },
      crossOwnerError: { code: "CROSS_OWNER", frozen: true, noCause: true, noStack: true },
      event: { ctrlKey: false, frozen: true, targetFrozen: true },
      numericError: { code: "ERR_INVALID_ARGUMENT", frozen: true, noCause: true, noStack: true },
      passwordError: { code: "ERR_INVALID_ARGUMENT", frozen: true, noCause: true, noStack: true },
      quotaError: { code: "QUOTA_EXCEEDED", frozen: true, noCause: true, noStack: true },
      quotaReleaseWorked: true,
      styleAllowed: true,
      styleDenied: false,
      topologyError: { code: "DOM_OPERATION_FAILED", frozen: true, noCause: true, noStack: true },
      urlDenied: { allowed: false, code: "ERR_URL_DENIED" },
    },
    placementCleanup: { idRemoved: true, nameRemoved: true, stillOutside: true },
    placementError: { code: "PLACEMENT_VIOLATION", frozen: true, noCause: true, noStack: true },
    terminalError: { code: "NODE_REVOKED", frozen: true, noCause: true, noStack: true },
  });
  expectNoUnapprovedActivity(browserLedger);
});
