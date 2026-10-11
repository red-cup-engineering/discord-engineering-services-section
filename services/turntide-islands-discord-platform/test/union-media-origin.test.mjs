import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { publicTurntideContentPath } from "../src/turntide-software-system/env.mjs";
import { serveUnionMediaOrigin } from "../src/turntide-software-system/serve-union-media-origin.mjs";
import { loadUnionMediaOriginRouteManifest, unionMediaOriginHttpResponse } from "../src/turntide-software-system/union-media-origin.mjs";

const origin = "https://turntide-islands.561.group/";
const actor = `${origin}actors/union-media`;

test("origin manifest and implementation expose the same bounded routes", () => {
  const manifest = loadUnionMediaOriginRouteManifest();
  const checkedIn = JSON.parse(readFileSync(publicTurntideContentPath({}, "configurations", "union-media-origin-route-manifest.json"), "utf8"));
  assert.deepEqual(manifest, checkedIn);
  for (const route of manifest.routes) assert.notEqual(unionMediaOriginHttpResponse({ method: route.method, url: route.path }), null, `${route.method} ${route.path}`);
  assert.equal(unionMediaOriginHttpResponse({ method: "GET", url: "/not-an-origin-route" }), null);
});

test("exact WebFinger, NodeInfo, actor, and empty outbox discovery are locally ready", () => {
  const webfinger = unionMediaOriginHttpResponse({ method: "GET", url: `/.well-known/webfinger?resource=${encodeURIComponent("acct:union-media@turntide-islands.561.group")}` });
  assert.equal(webfinger.status, 200); assert.equal(webfinger.body.subject, "acct:union-media@turntide-islands.561.group"); assert.equal(webfinger.body.links[0].href, actor);
  assert.equal(unionMediaOriginHttpResponse({ method: "GET", url: "/.well-known/webfinger?resource=acct:other@example.test" }).status, 404);
  const nodeInfo = unionMediaOriginHttpResponse({ method: "GET", url: "/nodeinfo/2.1" });
  assert.equal(nodeInfo.status, 200); assert.deepEqual(nodeInfo.body.protocols, []); assert.equal(nodeInfo.body.metadata.intendedProtocol, "activitypub"); assert.equal(nodeInfo.body.metadata.carrierActive, false); assert.equal(nodeInfo.body.metadata.publicDeploymentClaimed, false);
  const actorResponse = unionMediaOriginHttpResponse({ method: "GET", url: "/actors/union-media" });
  assert.equal(actorResponse.status, 200); assert.equal(actorResponse.body.id, actor); assert.equal(actorResponse.body.discoverable, false); assert.equal(actorResponse.body.publicKey, undefined);
  const outbox = unionMediaOriginHttpResponse({ method: "GET", url: "/actors/union-media/outbox" });
  assert.equal(outbox.status, 200); assert.equal(outbox.body.totalItems, 0); assert.deepEqual(outbox.body.orderedItems, []);
});

test("raw inbox, signed Agent Card, and JWKS routes fail closed without reading or admitting input", () => {
  for (const path of ["/actors/union-media/inbox", "/inbox"]) {
    const result = unionMediaOriginHttpResponse({ method: "POST", url: path });
    assert.equal(result.status, 503); assert.equal(result.body.bodyRead, false); assert.equal(result.body.callbackInvoked, false); assert.equal(result.body.advertiserRequestAdmitted, false); assert.equal(result.headers["retry-after"], "900"); assert.equal(result.headers.connection, "close");
  }
  const card = unionMediaOriginHttpResponse({ method: "GET", url: "/.well-known/agent-card.json" });
  assert.equal(card.status, 503); assert.equal(card.body.reason, "signed-agent-card-not-provisioned");
  const jwks = unionMediaOriginHttpResponse({ method: "GET", url: "/.well-known/jwks.json" });
  assert.equal(jwks.status, 503); assert.equal(jwks.body.privateKeyAccepted, false);
  const wrongMethod = unionMediaOriginHttpResponse({ method: "GET", url: "/inbox" });
  assert.equal(wrongMethod.status, 405); assert.equal(wrongMethod.headers.allow, "POST");
});

test("dedicated least-authority HTTP process serves only origin routes and refuses raw delivery", async () => {
  const running = await serveUnionMediaOrigin({ port: 0 });
  try {
    await new Promise((resolve) => setTimeout(resolve, 25));
    const base = `http://${running.host}:${running.port}`;
    const actorResponse = await fetch(`${base}/actors/union-media`, { headers: { accept: "application/activity+json" } });
    assert.equal(actorResponse.status, 200); assert.equal(actorResponse.headers.get("content-type"), "application/activity+json; charset=utf-8"); assert.equal((await actorResponse.json()).id, actor);
    const refused = await fetch(`${base}/actors/union-media/inbox`, { method: "POST", headers: { "content-type": "application/activity+json" }, body: "not-json-and-never-read" });
    assert.equal(refused.status, 503); assert.equal((await refused.json()).bodyRead, false);
    const unrelated = await fetch(`${base}/summary.json`); assert.equal(unrelated.status, 404); assert.equal((await unrelated.json()).reason, "path-not-admitted-by-origin-manifest");
  } finally { await running.close(); }
});
