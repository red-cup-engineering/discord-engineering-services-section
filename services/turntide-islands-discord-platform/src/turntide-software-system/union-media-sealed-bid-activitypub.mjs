import { admitJsonSemanticContent, EMPTY_WITNESS_ROOT, identifyJsonSemanticContent } from "@red-cup-engineering/computer-content-engineering-services-section/semantic-content-identity";
import { isNiUri } from "@red-cup-engineering/uri-services-section/ni-uri";
import { identifyTurntideDiscordPlatformRecord as semanticId } from "./discord-platform-record-semantic-content.mjs";
// Objects that cross the boundary into @causeway-services/turntide-union-media-syndication-service (bid, cycle,
// editorial admission, placement admission, and the bid admission it produces/records) are self-addressed
// under that service's own "turntide-islands.record" objectKind, not this app's local
// "turntide-islands.discord-platform-record" convention -- the two are different semantic-identity namespaces.
// The resource-fulfillment-authority admission stays on this app's local convention: it is purely app-domain
// and never validated by the syndication service itself.
const unionMediaSemanticId = (value) => identifyJsonSemanticContent({ objectKind: "turntide-islands.record", value, witnessRoot: EMPTY_WITNESS_ROOT }).token;
import { } from "./settlement-witness.mjs";
// @ts-expect-error The TTI-root management die is canonical JavaScript and intentionally remains outside the app compiler root.
import { admitUnionMediaBid, UNION_MEDIA_BID_INGRESS_CONTRACT, UNION_MEDIA_CONTRACT } from "./union-media-syndication.mjs";
import { UNION_MEDIA_PLACEMENT_REQUEST_CATEGORY, UNION_MEDIA_PLACEMENT_REQUEST_CONTRACT } from "./union-media-placement-activitypub.mjs";

export const UNION_MEDIA_AUCTION_CYCLE_CATEGORY = "tti-union-media-auction-cycle-v1";
export const UNION_MEDIA_EDITORIAL_ADMISSION_CATEGORY = "tti-union-media-editorial-admission-v1";
export const UNION_MEDIA_RESOURCE_AUTHORITY_CATEGORY = "tti-union-media-resource-fulfillment-authority-v1";
export const UNION_MEDIA_BID_ADMISSION_CATEGORY = "tti-union-media-bid-admission-v1";
export const UNION_MEDIA_SEALED_BID_CONTRACT = UNION_MEDIA_BID_INGRESS_CONTRACT;

const writeLocks = new Map();

export function unionMediaBidFromBytes(bytes) {
  const value = admitJsonSemanticContent({ bytes, objectKind: "rsc-quiescent.a2a-json" }).value;
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("Union Media ActivityPub value is not one sealed bid");
  return value;
}

export async function admitAuthenticatedUnionMediaBid(bid, input) {
  const priorAdmissions = (await input.store.records(UNION_MEDIA_BID_ADMISSION_CATEGORY));
  const priorByBid = priorAdmissions.find((row) => row.bidId === bid?.id);
  if (priorByBid !== undefined) {
    const priorEditorial = ((await input.store.records(UNION_MEDIA_EDITORIAL_ADMISSION_CATEGORY))).find((row) => row.id === priorByBid.creativeAdmissionId);
    const priorPlacement = priorEditorial === undefined ? undefined : ((await input.store.records(UNION_MEDIA_PLACEMENT_REQUEST_CATEGORY))).find((row) => row.id === priorEditorial.requestAdmissionId);
    return unionMediaSelfAddressed(bid) && unionMediaSelfAddressed(priorByBid) && priorByBid.bidder === input.enterprise && priorByBid.cycleId === bid.cycleId && validEditorialAdmission(priorEditorial, input.enterprise, input.authorizedEditorialReviewer) && validPlacementBinding(priorPlacement, priorEditorial, input.enterprise, input.activityPubActor) ? priorByBid : refusal(["sealed-bid-exact-replay-body-or-sender-mismatch"]);
  }
  const priorByEnterpriseCycle = priorAdmissions.find((row) => row.bidder === input.enterprise && row.cycleId === bid?.cycleId);
  const reasons = [];
  if (priorByEnterpriseCycle !== undefined) reasons.push("sealed-bid-enterprise-cycle-already-consumed-by-different-bid");

  const now = input.now ?? new Date();
  const cycle = ((await input.store.records(UNION_MEDIA_AUCTION_CYCLE_CATEGORY))).find((row) => row.id === bid?.cycleId);
  if (cycle === undefined) reasons.push("sealed-bid-cycle-not-found");
  else if (!unionMediaSelfAddressed(cycle) || cycle.type !== "TTIUnionMediaAuctionCycle" || cycle.version !== 3 || cycle.status !== "open" || cycle.contract !== UNION_MEDIA_CONTRACT) reasons.push("sealed-bid-cycle-invalid-or-not-open");

  const editorial = ((await input.store.records(UNION_MEDIA_EDITORIAL_ADMISSION_CATEGORY))).find((row) => row.id === bid?.creativeAdmissionId);
  if (editorial === undefined) reasons.push("sealed-bid-editorial-admission-not-found");
  else if (!validEditorialAdmission(editorial, input.enterprise, input.authorizedEditorialReviewer)) reasons.push("sealed-bid-editorial-admission-invalid-or-foreign");

  const placement = editorial === undefined ? undefined : ((await input.store.records(UNION_MEDIA_PLACEMENT_REQUEST_CATEGORY))).find((row) => row.id === editorial.requestAdmissionId);
  if (placement === undefined) reasons.push("sealed-bid-placement-request-admission-not-found");
  else if (!validPlacementBinding(placement, editorial, input.enterprise, input.activityPubActor)) reasons.push("sealed-bid-placement-request-actor-binding-invalid");

  const resource = bid?.resourceOffer;
  const authority = ((await input.store.records(UNION_MEDIA_RESOURCE_AUTHORITY_CATEGORY))).find((row) => row.id === resource?.fulfillmentAuthority);
  if (authority === undefined) reasons.push("sealed-bid-resource-fulfillment-authority-not-found");
  else if (!validResourceAuthority(authority, resource, input.enterprise, input.authorizedAuthorityAssayer, now)) reasons.push("sealed-bid-resource-fulfillment-authority-invalid-or-mismatched");

  if (reasons.length > 0 || cycle === undefined || editorial === undefined) return refusal(reasons);
  return admitUnionMediaBid(bid, cycle, editorial, { authenticatedActor: input.enterprise, observedEditorialAdmissionId: editorial.id, authorizedEditorialReviewer: input.authorizedEditorialReviewer, now });
}

export function unionMediaBidRecorderFromSettlementWitness(store) {
  if (typeof store?.records !== "function" || typeof store?.record !== "function") throw new TypeError("Union Media sealed bid requires TTI settlement-store witness authority");
  return async (admission) => withBidLock(`${admission.cycleId}\0${admission.bidder}`, async () => {
    if (!unionMediaSelfAddressed(admission) || admission.type !== "TTIUnionMediaBidAdmission" || admission.version !== 3 || admission.status !== "sealed-admitted-awaiting-tti-valuation" || admission.awardFormed !== false || admission.resourceTransferObserved !== false || admission.publicationAuthorized !== false || admission.cashRevenueRecognized !== false || admission.monetaryProfitRecognized !== false) throw new Error("Union Media bid admission is invalid or effect-expanded");
    const rows = (await store.records(UNION_MEDIA_BID_ADMISSION_CATEGORY));
    const sameBid = rows.find((row) => row.bidId === admission.bidId);
    if (sameBid !== undefined) { if (sameBid.id !== admission.id || sameBid.bidder !== admission.bidder || sameBid.cycleId !== admission.cycleId) throw new Error("Union Media sealed-bid replay conflict"); return sameBid; }
    if (rows.some((row) => row.bidder === admission.bidder && row.cycleId === admission.cycleId)) throw new Error("Union Media enterprise cycle already consumed by another sealed bid");
    await store.record({ category: UNION_MEDIA_BID_ADMISSION_CATEGORY, recordedAt: String(admission.recordedAt), record: admission, assertions: [
      { subject: admission.id, predicate: "urn:emsenn:venture:admitted-private-union-media-bid", object: { kind: "literal", value: "true", datatype: "http://www.w3.org/2001/XMLSchema#boolean" } },
      { subject: admission.bidder, predicate: "urn:emsenn:venture:consumed-union-media-cycle-bid", object: { kind: "iri", value: admission.cycleId } },
    ] });
    return admission;
  });
}

export function createUnionMediaSealedBidActivityPubCallbacks(input) {
  const receiverActor = actorUrl(input.origin, input.identifier), record = unionMediaBidRecorderFromSettlementWitness(input.store);
  if (!httpsOrLoopback(receiverActor) || !httpsOrLoopback(input.agentCard) || !input.senders || Object.values(input.senders).some((sender) => !httpsOrLoopback(sender.actor) || !httpsOrLoopback(sender.agentCard)) || typeof input.carrier?.extract !== "function" || !ttiAuthority(input.authorizedEditorialReviewer) || !ttiAuthority(input.authorizedAuthorityAssayer)) throw new Error("Union Media sealed-bid face requires exact treaties, TTI authorities, and one hired verified SEN carrier");
  return Object.freeze({
    async listOutbox() { return Object.freeze({ items: [] }); },
    async onActivity(arrival) {
      const federated = arrival?.jsonLd, treaty = treatyForActor(federated?.actor, input.senders);
      if (treaty === null) throw new Error("verified ActivityPub sender has no TTI Union Media treaty");
      const [enterprise, sender] = treaty;
      const projection = input.carrier.extract(federated, { expectedActor: sender.actor, expectedRecipient: receiverActor, expectedAgentCard: sender.agentCard });
      if (projection.type !== "Create") throw new Error("Union Media sealed-bid ingress requires ActivityStreams Create");
      const bid = unionMediaBidFromBytes(projection.objectBytes);
      const result = await admitAuthenticatedUnionMediaBid(bid, { enterprise, activityPubActor: sender.actor, authorizedEditorialReviewer: input.authorizedEditorialReviewer, authorizedAuthorityAssayer: input.authorizedAuthorityAssayer, now: input.now?.(), store: input.store });
      if (result.type !== "TTIUnionMediaBidAdmission") throw new Error(`TTI Union Media sealed bid refused: ${result.reasons.join(",")}`);
      const admission = await record(result);
      return Object.freeze({ type: "TTIUnionMediaSealedBidAcknowledgement", version: 1, status: "sealed-private-awaiting-tti-valuation", bidAdmissionId: admission.id, cycleId: admission.cycleId, bidder: admission.bidder, competitorDataDisclosed: false, awardFormed: false, resourceTransferObserved: false, publicationAuthorized: false, cashRevenueRecognized: false, monetaryProfitRecognized: false });
    },
  });
}

function validResourceAuthority(authority, resource, enterprise, authorizedAssayer, now) {
  const exactFields = ["assayer", "capability", "contract", "evidenceId", "fulfillmentContract", "id", "maximumQuantity", "provider", "recordedAt", "resourceClass", "rights", "status", "type", "unit", "validThrough", "version"];
  const recordedAt = new Date(authority.recordedAt), authorityValidThrough = new Date(authority.validThrough), offerValidThrough = new Date(resource?.validThrough);
  return Object.keys(authority).sort().join("\0") === exactFields.sort().join("\0") && selfAddressed(authority) && authority.type === "TTIUnionMediaResourceFulfillmentAuthorityAdmission" && authority.version === 1 && authority.status === "admitted-provider-fulfillment-authority" && authority.contract === UNION_MEDIA_SEALED_BID_CONTRACT && authority.provider === enterprise && authority.assayer === authorizedAssayer && ttiAuthority(authority.assayer) && authority.resourceClass === resource?.resourceClass && authority.unit === resource?.unit && Number.isFinite(authority.maximumQuantity) && authority.maximumQuantity >= resource?.quantity && authority.capability === resource?.capability && authority.rights === resource?.rights && authority.fulfillmentContract === resource?.fulfillmentContract && resource?.fulfillmentAuthority === authority.id && isNiUri(authority.evidenceId) && Number.isFinite(recordedAt.getTime()) && recordedAt <= now && Number.isFinite(authorityValidThrough.getTime()) && Number.isFinite(offerValidThrough.getTime()) && authorityValidThrough >= offerValidThrough;
}

function validEditorialAdmission(editorial, enterprise, authorizedReviewer) {
  return editorial !== undefined && unionMediaSelfAddressed(editorial) && editorial.type === "TTIUnionMediaEditorialAdmission" && editorial.version === 1 && editorial.status === "creative-approved-for-future-cycle-bidding" && editorial.contract === UNION_MEDIA_CONTRACT && editorial.productId === "tti-union-media-syndication-2026-01" && editorial.creativeApproved === true && editorial.bidAdmitted === false && editorial.advertiser === enterprise && editorial.reviewer === authorizedReviewer && ttiAuthority(editorial.reviewer);
}
function validPlacementBinding(placement, editorial, enterprise, activityPubActor) {
  return placement !== undefined && editorial !== undefined && unionMediaSelfAddressed(placement) && placement.type === "TTIUnionMediaPlacementRequestAdmission" && placement.version === 3 && placement.status === "admitted-awaiting-editorial-review" && placement.contract === UNION_MEDIA_CONTRACT && placement.ingressContract === UNION_MEDIA_PLACEMENT_REQUEST_CONTRACT && placement.productId === "tti-union-media-syndication-2026-01" && placement.advertiser === enterprise && placement.advertiserActivityPubActor === activityPubActor && placement.authenticationConsumedForOneRequest === true && placement.creativeApproved === false && placement.bidAdmitted === false && editorial.requestAdmissionId === placement.id && editorial.requestId === placement.requestId && editorial.authenticationId === placement.authenticationId && editorial.campaignId === placement.campaignId && editorial.correctionContact === placement.correctionContact && sameSemanticValue(editorial.creative, placement.creative);
}

function treatyForActor(actor, senders) { return Object.entries(senders).find(([, sender]) => sender.actor === actor) ?? null; }
function actorUrl(origin, identifier) { return new URL(`/actors/${identifier}`, new URL(origin)).href; }
function httpsOrLoopback(value) { try { if (typeof value !== "string") return false; const url = new URL(value); return url.protocol === "https:" || (url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname)); } catch { return false; } }
function ttiAuthority(value) { return typeof value === "string" && /^urn:ame:turntide-islands(?::[a-z0-9-]+)?$/u.test(value); }
function sameSemanticValue(left, right) { try { return semanticId(left) === semanticId(right); } catch { return false; } }
function selfAddressed(value) { try { const { id, ...body } = value; return typeof id === "string" && id === semanticId(body); } catch { return false; } }
function unionMediaSelfAddressed(value) { try { const { id, ...body } = value; return typeof id === "string" && id === unionMediaSemanticId(body); } catch { return false; } }
function refusal(reasons) { return Object.freeze({ type: "TTIUnionMediaBidRefusal", version: 1, reasons: [...new Set(reasons)], durableMutation: false, bidAdmitted: false, inventoryReserved: false, awardFormed: false, resourceTransferObserved: false, publicationAuthorized: false, cashRevenueRecognized: false, monetaryProfitRecognized: false }); }
async function withBidLock(key, operation) { const prior = writeLocks.get(key) ?? Promise.resolve(); let release; const mine = new Promise((resolve) => { release = resolve; }), queued = prior.then(() => mine); writeLocks.set(key, queued); await prior; try { return await operation(); } finally { release(); if (writeLocks.get(key) === queued) writeLocks.delete(key); } }
