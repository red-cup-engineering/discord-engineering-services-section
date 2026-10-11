#!/usr/bin/env node
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { env } from "./env.mjs";
import { unionMediaOriginHttpResponse } from "./union-media-origin.mjs";

export async function serveUnionMediaOrigin(options = {}) {
  const source = options.env ?? process.env;
  const host = options.host ?? env("TTI_UNION_MEDIA_ORIGIN_HOST", source) ?? "127.0.0.1";
  const port = options.port ?? Number(env("TTI_UNION_MEDIA_ORIGIN_PORT", source) ?? 18849);
  const server = createServer((req, res) => {
    const result = unionMediaOriginHttpResponse({ method: req.method, url: req.url }, source);
    if (result === null) {
      res.writeHead(404, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      res.end(`${JSON.stringify({ type: "TTIUnionMediaOriginRouteRefusal", version: 1, reason: "path-not-admitted-by-origin-manifest", durableMutation: false })}\n`);
      return;
    }
    res.writeHead(result.status, { "content-type": result.contentType, ...result.headers });
    res.end(`${JSON.stringify(result.body, null, 2)}\n`);
  });
  server.requestTimeout = 5_000;
  server.headersTimeout = 5_000;
  server.keepAliveTimeout = 1_000;
  server.maxRequestsPerSocket = 16;
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => { server.off("error", reject); resolve(); });
  });
  const address = server.address(), actualPort = typeof address === "object" && address !== null ? address.port : port;
  options.log?.(`[turntide-islands union-media-origin] http://${host}:${actualPort}`);
  return Object.freeze({ server, host, port: actualPort, close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) });
}

function isMain() { return process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href; }
if (isMain()) {
  serveUnionMediaOrigin({ log: (message) => process.stderr.write(`${message}\n`) }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
