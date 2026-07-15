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
    <script type="module">
      import { createSafeDocument } from "/dist/index.js";
      globalThis.arkPublicAPI = Object.freeze({ createSafeDocument });
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

  try {
    if (url.pathname === "/" || url.pathname === "/health" || url.pathname === "/barrier") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(url.pathname === "/" ? page : "ok");
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
      response.end("postMessage('started'); for (;;) {}\n");
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
