import { expect, openHarness, test } from "./fixtures.mjs";

test("real browser SES hardens the completed public capability graph", async ({
  page,
  browserLedger,
}) => {
  await openHarness(page, browserLedger);

  const result = await page.evaluate(() => {
    const mount = document.querySelector("#mount");
    if (!(mount instanceof HTMLElement)) throw new Error("host fixture is incomplete");
    const root = mount.attachShadow({ mode: "open" });
    const safeDocument = globalThis.arkPublicAPI.createSafeDocument(root);
    const input = safeDocument.createInput();
    const guest = new Compartment({ safeDocument });
    const guestDiv = guest.evaluate("safeDocument.createDiv()");

    return {
      compartment: typeof Compartment === "function",
      document: Object.isFrozen(safeDocument),
      input: Object.isFrozen(input),
      inputMethod: Object.isFrozen(input.getValue),
      style: Object.isFrozen(input.style),
      styleMethod: Object.isFrozen(input.style.set),
      guestDiv: Object.isFrozen(guestDiv),
    };
  });

  expect(result).toEqual({
    compartment: true,
    document: true,
    input: true,
    inputMethod: true,
    style: true,
    styleMethod: true,
    guestDiv: true,
  });
});
