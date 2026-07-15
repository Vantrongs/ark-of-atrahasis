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
