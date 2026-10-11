import { readFileSync } from "node:fs";
import { admitJsonSemanticContent } from "@red-cup-engineering/computer-content-engineering-services-section/semantic-content-identity";
import { EMPTY_WITNESS_ROOT, identifyJsonSemanticContent } from "@red-cup-engineering/computer-content-engineering-services-section/semantic-content-identity";
import { identifyTurntideDiscordPlatformRecord as semanticId } from "./discord-platform-record-semantic-content.mjs";
// Objects that cross the boundary into @causeway-services/turntide-union-media-syndication-service (the placement
// request itself, and the TTIUnionMediaPlacementRequestAdmission it produces/records) are self-addressed under
// that service's own "turntide-islands.record" objectKind, not this app's "turntide-islands.discord-platform-record"
// convention -- the two are different semantic-identity namespaces and must not be conflated.
const unionMediaSemanticId = (value) => identifyJsonSemanticContent({ objectKind: "turntide-islands.record", value, witnessRoot: EMPTY_WITNESS_ROOT }).token;
import { } from "./settlement-witness.mjs";
// @ts-expect-error This TTI-root management die is canonical JavaScript and intentionally remains outside the app compiler root.
import { admitUnionMediaPlacementRequest, UNION_MEDIA_PLACEMENT_INGRESS_CONTRACT } from "./union-media-syndication.mjs";
import { publicTurntideContentPath } from "./env.mjs";
import { UNION_MEDIA_DESTINATION_PROOF_CATEGORY, UNION_MEDIA_INTENT_CONTRACT, UNION_MEDIA_PRODUCT } from "./union-media-intent.mjs";
import { UNION_MEDIA_ENTERPRISE_AUTH_CATEGORY, UNION_MEDIA_ENTERPRISE_AUTH_CONTRACT } from "./union-media-enterprise-authentication.mjs";
import { ACTIVITYSTREAMS_CONTEXT } from "@red-cup-engineering/activitypub-services-section/activitystreams";

export const UNION_MEDIA_PLACEMENT_REQUEST_CATEGORY = "tti-union-media-placement-request-admission-v1";
export const UNION_MEDIA_PLACEMENT_REQUEST_CONTRACT = UNION_MEDIA_PLACEMENT_INGRESS_CONTRACT;
const TTI_ACTOR = "urn:ame:turntide-islands";
const treatyPath = () => publicTurntideContentPath(process.env, "contracts", "union-media-activitypub-treaty.json");
const writeLocks = new Map();

export function loadUnionMediaActivityPubTreaty(file = treatyPath()) { return JSON.parse(readFileSync(file, "utf8")); }

export function unionMediaPlacementRequestFromBytes(bytes) {
  const value = admitJsonSemanticContent({ bytes, objectKind: "rsc-quiescent.a2a-json" }).value;
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("Union Media ActivityPub value is not one placement request");
  return value;
}

export async function admitAuthenticatedUnionMediaPlacementRequest(request, input) {
  const priorByRequest = ((await input.store.records(UNION_MEDIA_PLACEMENT_REQUEST_CATEGORY))).find((row) => row.requestId === request.id);
  if (priorByRequest !== undefined) return unionMediaSelfAddressed(request) && unionMediaSelfAddressed(priorByRequest) && request.advertiser === input.enterprise && request.authenticationId === priorByRequest.authenticationId && priorByRequest.advertiser === input.enterprise && priorByRequest.advertiserActivityPubActor === input.activityPubActor ? priorByRequest : refusal(["placement-exact-replay-body-or-sender-mismatch"]);
  const reasons = [], authenticationId = String(request.authenticationId ?? "");
  const authentication = ((await input.store.records(UNION_MEDIA_ENTERPRISE_AUTH_CATEGORY))).find((row) => row.id === authenticationId);
  if (authentication === undefined) reasons.push("placement-authentication-not-found");
  else if (!selfAddressed(authentication) || authentication.type !== "TTIUnionMediaEnterpriseAuthenticationAdmission" || authentication.contract !== UNION_MEDIA_ENTERPRISE_AUTH_CONTRACT || authentication.status !== "authenticated-for-one-later-placement-request" || authentication.enterprise !== input.enterprise || authentication.scope !== "authenticate-enterprise-and-representative-for-one-later-placement-request" || authentication.placementRequestAdmitted !== false) reasons.push("placement-authentication-invalid-or-enterprise-mismatched");
  if (authentication !== undefined && (typeof authentication.expiresAt !== "string" || (input.now ?? new Date()).getTime() >= Date.parse(authentication.expiresAt))) reasons.push("placement-authentication-expired");
  const proof = authentication === undefined ? undefined : ((await input.store.records(UNION_MEDIA_DESTINATION_PROOF_CATEGORY))).find((row) => row.id === authentication.destinationProofId);
  if (proof === undefined) reasons.push("placement-destination-proof-not-found");
  else if (!selfAddressed(proof) || proof.type !== "TTIUnionMediaDestinationControlAdmission" || proof.contract !== UNION_MEDIA_INTENT_CONTRACT || proof.status !== "qualified-destination-controlled-lead" || proof.intentId !== authentication?.intentId || proof.representativePseudonym !== authentication?.representativePseudonym || (proof.declaration)?.enterprise !== input.enterprise || (proof.declaration)?.destinationControlled !== true) reasons.push("placement-destination-proof-invalid-or-unbound");
  const consumed = ((await input.store.records(UNION_MEDIA_PLACEMENT_REQUEST_CATEGORY))).find((row) => row.authenticationId === authenticationId);
  if (consumed !== undefined) reasons.push("placement-authentication-already-consumed-by-different-request");
  if (reasons.length > 0) return refusal(reasons);
  return admitUnionMediaPlacementRequest(request, { authenticatedActor: input.enterprise, expectedAuthenticationId: authenticationId, expectedDestination: (proof.declaration).destination, destinationProofId: proof.id, advertiserActivityPubActor: input.activityPubActor, now: input.now });
}

export function unionMediaPlacementRequestRecorderFromSettlementWitness(store) {
  if (typeof store?.records !== "function" || typeof store?.record !== "function") throw new TypeError("Union Media placement request requires TTI settlement-store witness authority");
  return async (admission) => withAuthenticationLock(admission.authenticationId, async () => {
    if (!unionMediaSelfAddressed(admission) || admission.type !== "TTIUnionMediaPlacementRequestAdmission" || admission.ingressContract !== UNION_MEDIA_PLACEMENT_REQUEST_CONTRACT || admission.authenticationConsumedForOneRequest !== true || admission.creativeApproved !== false) throw new Error("Union Media placement-request admission is invalid or effect-expanded");
    const rows = (await store.records(UNION_MEDIA_PLACEMENT_REQUEST_CATEGORY));
    const sameRequest = rows.find((row) => row.requestId === admission.requestId);
    if (sameRequest !== undefined) { if (sameRequest.id !== admission.id) throw new Error("Union Media placement-request replay conflict"); return sameRequest; }
    const consumed = rows.find((row) => row.authenticationId === admission.authenticationId);
    if (consumed !== undefined) throw new Error("Union Media authentication already consumed by another placement request");
    await store.record({ category: UNION_MEDIA_PLACEMENT_REQUEST_CATEGORY, recordedAt: String(admission.recordedAt), record: admission, assertions: [
      { subject: admission.id, predicate: "urn:emsenn:venture:admitted-union-media-placement-request", object: { kind: "literal", value: "true", datatype: "http://www.w3.org/2001/XMLSchema#boolean" } },
      { subject: admission.authenticationId, predicate: "urn:emsenn:venture:consumed-for-union-media-placement-request", object: { kind: "iri", value: admission.id } },
    ] });
    return admission;
  });
}

export function createUnionMediaPlacementActivityPubCallbacks(input) {
  const receiverActor = actorUrl(input.origin, input.identifier), record = unionMediaPlacementRequestRecorderFromSettlementWitness(input.store);
  if (!httpsOrLoopback(receiverActor) || !httpsOrLoopback(input.agentCard) || !input.senders || Object.values(input.senders).some((sender) => !httpsOrLoopback(sender.actor) || !httpsOrLoopback(sender.agentCard)) || typeof input.carrier?.extract !== "function") throw new Error("Union Media ActivityPub face requires exact actor and Agent Card treaties plus one hired verified SEN carrier");
  return Object.freeze({
    async listOutbox() { return Object.freeze({ items: [] }); },
    async onActivity(arrival) {
      const federated = arrival?.jsonLd, treaty = treatyForActor(federated?.actor, input.senders);
      if (treaty === null) throw new Error("verified ActivityPub sender has no TTI Union Media treaty");
      const [enterprise, sender] = treaty;
      const projection = input.carrier.extract(federated, { expectedActor: sender.actor, expectedRecipient: receiverActor, expectedAgentCard: sender.agentCard });
      if (projection.type !== "Create") throw new Error("Union Media placement ingress requires ActivityStreams Create");
      const request = unionMediaPlacementRequestFromBytes(projection.objectBytes);
      const result = await admitAuthenticatedUnionMediaPlacementRequest(request, { enterprise, activityPubActor: sender.actor, now: input.now?.(), store: input.store });
      if (result.type !== "TTIUnionMediaPlacementRequestAdmission") throw new Error(`TTI Union Media placement request refused: ${result.reasons.join(",")}`);
      return record(result);
    },
  });
}

export function validateDeployableUnionMediaActivityPubTreaty(treaty = loadUnionMediaActivityPubTreaty()) {
  const reasons = [];
  if (treaty?.type !== "TTIUnionMediaActivityPubTreaty" || treaty?.version !== 1 || treaty?.carrierProvider !== "urn:ame:activitypub-services-section") reasons.push("activitypub-treaty-type-or-provider-invalid");
  if (!httpsOnly(treaty?.origin) || !/^[a-z0-9][a-z0-9._-]*$/u.test(treaty?.identifier ?? "") || !httpsOnly(treaty?.actor) || treaty?.actor !== actorUrl(treaty?.origin, treaty?.identifier) || !httpsOnly(treaty?.agentCard)) reasons.push("activitypub-treaty-receiver-not-public-https");
  const senders = treaty?.senders;
  if (!senders || typeof senders !== "object" || Object.values(senders).some((sender) => !httpsOnly(sender?.actor) || !httpsOnly(sender?.agentCard))) reasons.push("activitypub-treaty-sender-identity-incomplete");
  if (reasons.length > 0) throw new Error(reasons.join(","));
  return Object.freeze({ origin: treaty.origin, identifier: treaty.identifier, agentCard: treaty.agentCard, senders: Object.fromEntries(Object.entries(senders).map(([enterprise, sender]) => [enterprise, { actor: sender.actor, agentCard: sender.agentCard }])) });
}

function treatyForActor(actor, senders) { return Object.entries(senders).find(([, sender]) => sender.actor === actor) ?? null; }
function actorUrl(origin, identifier) { return new URL(`/actors/${identifier}`, new URL(origin)).href; }
function httpsOnly(value) { try { return typeof value === "string" && new URL(value).protocol === "https:"; } catch { return false; } }
function httpsOrLoopback(value) { try { if (typeof value !== "string") return false; const url = new URL(value); return url.protocol === "https:" || (url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname)); } catch { return false; } }
function selfAddressed(value) { try { const { id, ...body } = value; return typeof id === "string" && id === semanticId(body); } catch { return false; } }
function unionMediaSelfAddressed(value) { try { const { id, ...body } = value; return typeof id === "string" && id === unionMediaSemanticId(body); } catch { return false; } }
function refusal(reasons) { return Object.freeze({ type: "TTIUnionMediaPlacementRequestRefusal", version: 1, reasons: [...new Set(reasons)], durableMutation: false, authenticationConsumed: false, creativeApproved: false, bidAdmitted: false, inventoryReserved: false, resourceTransferObserved: false, publicationAuthorized: false, revenueRecognized: false, profitRecognized: false }); }
async function withAuthenticationLock(key, operation) { const prior = writeLocks.get(key) ?? Promise.resolve(); let release; const mine = new Promise((resolve) => { release = resolve; }), queued = prior.then(() => mine); writeLocks.set(key, queued); await prior; try { return await operation(); } finally { release(); if (writeLocks.get(key) === queued) writeLocks.delete(key); } }
