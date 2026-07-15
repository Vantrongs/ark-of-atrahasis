import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

const host = "127.0.0.1";
const port = 4173;
const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));

const page = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Ark browser acceptance harness</title>
    <link rel="icon" href="data:,">
  </head>
  <body>
    <form id="host-form" action="/unapproved/form-submit" method="get">
      <input id="host-control" name="shared-name" value="host-value">
      <div id="mount"></div>
      <button id="host-submit" type="submit">host submit</button>
    </form>
    <p id="outside-sentinel" data-state="host-owned">outside-original</p>
    <iframe id="foreign-realm" src="/iframe.html"></iframe>
    <script src="/ses/lockdown.umd.min.js"></script>
    <script>lockdown();</script>
    <script type="module">
      import { createSafeDocument } from "/dist/index.js";
      const createHardenedSafeDocument = (root, options = {}) => {
        return createSafeDocument(root, { ...options, harden });
      };
      globalThis.arkPublicAPI = harden({
        createSafeDocument: createHardenedSafeDocument,
      });
      globalThis.arkHarnessReady = true;
    </script>
  </body>
</html>`;

const iframePage = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Foreign realm</title></head>
  <body><div id="foreign-mount"></div></body>
</html>`;

const pixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${host}:${port}`);
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  response.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin");

  try {
    if (url.pathname === "/" || url.pathname === "/health" || url.pathname === "/barrier") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(url.pathname === "/" ? page : "ok");
      return;
    }
    if (url.pathname === "/ses/lockdown.umd.min.js") {
      const artifact = await readFile(`${repositoryRoot}node_modules/ses/dist/lockdown.umd.min.js`);
      response.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
      response.end(artifact);
      return;
    }
    if (url.pathname === "/iframe.html") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(iframePage);
      return;
    }
    if (url.pathname === "/dist/index.js") {
      const artifact = await readFile(`${repositoryRoot}dist/index.js`);
      response.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
      response.end(artifact);
      return;
    }
    if (url.pathname === "/allowed/pixel.png") {
      response.writeHead(200, { "Content-Type": "image/png" });
      response.end(pixel);
      return;
    }
    if (url.pathname === "/hostile-worker.js") {
      response.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
      response.end(`onmessage = ({ data }) => {
  const progress = new BigInt64Array(data);
  Atomics.store(progress, 1, 1n);
  postMessage("started");
  // The browser proof observes indefinitely scheduled isolated work. The
  // Chromium build bundled with Playwright 1.61.1 in this gate did not preempt
  // an unyielding Atomics loop; the Node witness covers hard CPU-bound termination.
  setInterval(() => {
    Atomics.add(progress, 0, 1n);
  }, 1);
};
`);
      return;
    }

    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("not found");
  } catch (error) {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(error instanceof Error ? error.message : "server failure");
  }
});

server.listen(port, host);

let closing = false;
function closeServer() {
  if (closing) return;
  closing = true;
  server.close((error) => {
    process.exitCode = error ? 1 : 0;
  });
  server.closeAllConnections();
}

process.on("SIGINT", closeServer);
process.on("SIGTERM", closeServer);
