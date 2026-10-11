import { readFileSync } from "node:fs";
import { publicTurntideContentPath } from "./env.mjs";
import { ACTIVITYSTREAMS_CONTEXT } from "@red-cup-engineering/activitypub-services-section/activitystreams";

const ORIGIN = "https://turntide-islands.561.group/";
const ACTOR = `${ORIGIN}actors/union-media`;
const SUBJECT = "acct:union-media@turntide-islands.561.group";
const manifestPath = () => publicTurntideContentPath(process.env, "configurations", "union-media-origin-route-manifest.json");

export function loadUnionMediaOriginRouteManifest(file = manifestPath()) {
  return Object.freeze(JSON.parse(readFileSync(file, "utf8")));
}

export function unionMediaOriginHttpResponse(request, _source = process.env) {
  const url = new URL(request.url ?? "/", "http://localhost"), method = request.method ?? "GET";
  const known = new Set([
    "/.well-known/webfinger", "/.well-known/nodeinfo", "/nodeinfo/2.1", "/actors/union-media",
    "/actors/union-media/outbox", "/actors/union-media/inbox", "/inbox",
    "/.well-known/agent-card.json", "/.well-known/jwks.json", "/.well-known/tti-union-media-origin.json",
  ]);
  if (!known.has(url.pathname)) return null;
  const expectedMethod = ["/actors/union-media/inbox", "/inbox"].includes(url.pathname) ? "POST" : "GET";
  if (method !== expectedMethod) return response(405, "application/json; charset=utf-8", { type: "TTIUnionMediaOriginMethodRefusal", version: 1, reason: "method-not-admitted-for-origin-route", path: url.pathname, requiredMethod: expectedMethod, durableMutation: false }, { allow: expectedMethod });

  if (url.pathname === "/.well-known/webfinger") {
    if (url.searchParams.size !== 1 || url.searchParams.get("resource") !== SUBJECT) return response(404, "application/jrd+json; charset=utf-8", { type: "TTIUnionMediaWebFingerRefusal", version: 1, reason: "resource-not-exactly-admitted", durableMutation: false });
    return response(200, "application/jrd+json; charset=utf-8", { subject: SUBJECT, aliases: [ACTOR], links: [{ rel: "self", type: "application/activity+json", href: ACTOR }] }, publicCache());
  }
  if (url.search !== "") return response(404, "application/json; charset=utf-8", { type: "TTIUnionMediaOriginQueryRefusal", version: 1, reason: "query-not-admitted-for-origin-route", path: url.pathname, durableMutation: false });
  if (url.pathname === "/.well-known/nodeinfo") return response(200, "application/json; charset=utf-8", { links: [{ rel: "http://nodeinfo.diaspora.software/ns/schema/2.1", href: `${ORIGIN}nodeinfo/2.1` }] }, publicCache());
  if (url.pathname === "/nodeinfo/2.1") return response(200, "application/json; profile=\"http://nodeinfo.diaspora.software/ns/schema/2.1#\"; charset=utf-8", { version: "2.1", software: { name: "turntide-islands", version: "0.0.0" }, protocols: [], services: { inbound: [], outbound: [] }, openRegistrations: false, usage: { users: { total: 0, activeMonth: 0, activeHalfyear: 0 }, localPosts: 0, localComments: 0 }, metadata: { actor: ACTOR, intendedProtocol: "activitypub", businessAdmissions: 0, carrierActive: false, publicDeploymentClaimed: false } }, publicCache());
  if (url.pathname === "/actors/union-media") return response(200, "application/activity+json; charset=utf-8", { "@context": ACTIVITYSTREAMS_CONTEXT, id: ACTOR, type: "Service", preferredUsername: "union-media", name: "Turntide Islands Union Media", summary: "TTI's sponsored Union enterprise distribution actor. Discovery is ready; signed delivery remains unavailable until a carrier is accepted.", inbox: `${ACTOR}/inbox`, outbox: `${ACTOR}/outbox`, endpoints: { sharedInbox: `${ORIGIN}inbox` }, manuallyApprovesFollowers: true, discoverable: false }, publicCache());
  if (url.pathname === "/actors/union-media/outbox") return response(200, "application/activity+json; charset=utf-8", { "@context": ACTIVITYSTREAMS_CONTEXT, id: `${ACTOR}/outbox`, type: "OrderedCollection", totalItems: 0, orderedItems: [] }, publicCache());
  // union-media-placement-activitypub.mts and union-media-sealed-bid-activitypub.mts
  // are the ready ingress handlers for this inbox — complete and tested, wired
  // nowhere, awaiting the carrier acceptance content/contracts/union-media-activitypub-carrier-proposal.json proposes.
  if (["/actors/union-media/inbox", "/inbox"].includes(url.pathname)) return unavailable("TTIUnionMediaInboxCarrierRefusal", "hired-signature-verification-carrier-unavailable", { path: url.pathname, bodyRead: false, callbackInvoked: false, durableMutation: false }, { connection: "close" });
  if (url.pathname === "/.well-known/agent-card.json") return unavailable("TTIUnionMediaAgentCardReadinessRefusal", "signed-agent-card-not-provisioned", { requiredOrigin: ORIGIN, requiredJwks: `${ORIGIN}.well-known/jwks.json`, durableMutation: false });
  if (url.pathname === "/.well-known/jwks.json") return unavailable("TTIUnionMediaAgentCardJwksReadinessRefusal", "signed-agent-card-jwks-not-provisioned", { privateKeyAccepted: false, durableMutation: false });
  return response(200, "application/json; charset=utf-8", loadUnionMediaOriginRouteManifest(), publicCache());
}

function unavailable(type, reason, fields, extraHeaders = {}) {
  return response(503, "application/json; charset=utf-8", { type, version: 1, status: "unavailable", reason, ...fields, advertiserRequestAdmitted: false, bidAdmitted: false, revenueRecognized: false, profitRecognized: false }, { "cache-control": "no-store", "retry-after": "900", ...extraHeaders });
}
function publicCache() { return { "cache-control": "public, max-age=300" }; }
function response(status, contentType, body, headers) { return Object.freeze({ status, contentType, ...(headers === undefined ? {} : { headers: Object.freeze({ ...headers }) }), body: Object.freeze(body) }); }
