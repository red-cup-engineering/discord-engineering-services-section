import assert from "node:assert/strict";
import test from "node:test";
import { EMPTY_WITNESS_ROOT, identifyJsonSemanticContent } from "@red-cup-engineering/computer-content-address-engineering-services-section/semantic-content-identity";

import { identifyTurntideDiscordPlatformRecord as semanticId } from "../src/turntide-software-system/discord-platform-record-semantic-content.mjs";
// TTIUnionMediaPlacementRequestAdmission / TTIUnionMediaEditorialAdmission / TTIUnionMediaAuctionCycle /
// TTIUnionMediaAgentResourceBid / TTIUnionMediaBidAdmission all cross the boundary into
// @causeway-services/turntide-union-media-syndication-service, which self-addresses under its own
// "turntide-islands.record" objectKind -- distinct from this app's "turntide-islands.discord-platform-record".
// TTIUnionMediaResourceFulfillmentAuthorityAdmission stays on the app-local convention below: it is purely
// app-domain and never validated by the syndication service.
const unionMediaSemanticId = (value) => identifyJsonSemanticContent({ objectKind: "turntide-islands.record", value, witnessRoot: EMPTY_WITNESS_ROOT }).token;
const semanticBytes = (value) => identifyJsonSemanticContent({ objectKind: "rsc-quiescent.a2a-json", value, witnessRoot: EMPTY_WITNESS_ROOT }).bytes;
import { UNION_MEDIA_PLACEMENT_REQUEST_CATEGORY } from "../src/turntide-software-system/union-media-placement-activitypub.mjs";
import { UNION_MEDIA_AUCTION_CYCLE_CATEGORY, UNION_MEDIA_BID_ADMISSION_CATEGORY, UNION_MEDIA_EDITORIAL_ADMISSION_CATEGORY, UNION_MEDIA_RESOURCE_AUTHORITY_CATEGORY, UNION_MEDIA_SEALED_BID_CONTRACT, admitAuthenticatedUnionMediaBid, createUnionMediaSealedBidActivityPubCallbacks } from "../src/turntide-software-system/union-media-sealed-bid-activitypub.mjs";

const enterprise = "urn:ame:youtube-channel-enterprise", syndicationContract = "ni:///sha-256;_3Vr73uJvicSjls4LCZoNspuAKpUl2RFKC0auMcGfS4", now = new Date("2026-07-22T01:00:00.000Z");
const senderOrigin = "https://youtube.example/", senderActor = `${senderOrigin}actors/youtube-channel-enterprise`, senderCard = `${senderOrigin}.well-known/agent-card.json`, receiverOrigin = "https://tti.example/", receiverActor = `${receiverOrigin}actors/union-media`, receiverCard = `${receiverOrigin}.well-known/agent-card.json`;
const reviewer = "urn:ame:turntide-islands:editorial-desk", assayer = "urn:ame:turntide-islands:resource-desk";
const addressed = (body) => Object.freeze({ ...body, id: semanticId(body) });
const unionMediaAddressed = (body) => Object.freeze({ ...body, id: unionMediaSemanticId(body) });
const carrier = { extract(activity, expected) { if (activity?.actor !== expected.expectedActor || activity?.to !== expected.expectedRecipient || activity?.agentCard !== expected.expectedAgentCard || typeof activity?.sen !== "string") throw new Error("synthetic verified carrier expectation mismatch"); return { type: activity.type, objectBytes: Buffer.from(activity.sen, "base64") }; } };

function fixture({ recordDelay = 0, placementActor = senderActor, editorialChanges = {}, authorityChanges = {}, nowValue = now } = {}) {
  const placement = unionMediaAddressed({ type: "TTIUnionMediaPlacementRequestAdmission", version: 3, status: "admitted-awaiting-editorial-review", recordedAt: "2026-07-22T00:10:00.000Z", requestId: "ni:///sha-256;AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", authenticationId: "ni:///sha-256;BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB", destinationProofId: "ni:///sha-256;CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC", advertiser: enterprise, advertiserActivityPubActor: placementActor, productId: "tti-union-media-syndication-2026-01", contract: syndicationContract, ingressContract: "ni:///sha-256;lA86YpfReCyssDxcPqC0ooB-OscHHYoPe13BWmHB8jQ", campaignId: "youtube-pilot", creative: { headline: "A source-grounded explainer", body: "A bounded announcement", destination: "https://youtube.example/watch/example", displayName: "YouTube Channel Enterprise" }, rightsAttested: true, clearSponsorshipRequired: true, correctionContact: enterprise, authenticationConsumedForOneRequest: true, creativeApproved: false, editorialDecisionCreated: false, bidAdmitted: false, resourceTransferObserved: false, inventoryReserved: false, publicationAuthorized: false, cashRevenueRecognized: false, monetaryProfitRecognized: false, legalEffect: "placement-request-intake-only" });
  const editorial = unionMediaAddressed({ type: "TTIUnionMediaEditorialAdmission", version: 1, status: "creative-approved-for-future-cycle-bidding", recordedAt: "2026-07-22T00:15:00.000Z", requestAdmissionId: placement.id, requestId: placement.requestId, authenticationId: placement.authenticationId, advertiser: enterprise, productId: placement.productId, contract: syndicationContract, campaignId: placement.campaignId, creative: placement.creative, correctionContact: enterprise, reviewer, evidence: ["TTI editorial desk admitted the bounded synthetic creative"], creativeApproved: true, bidAdmitted: false, inventoryReserved: false, resourceTransferObserved: false, publicationAuthorized: false, cashRevenueRecognized: false, monetaryProfitRecognized: false, ...editorialChanges });
  const cycle = unionMediaAddressed({ type: "TTIUnionMediaAuctionCycle", version: 3, status: "open", recordedAt: "2026-07-22T00:15:00.000Z", productId: "tti-union-media-syndication-2026-01", contract: syndicationContract, publicationAt: "2026-07-22T01:15:00.000Z", opensAt: "2026-07-22T00:15:00.000Z", closesAt: "2026-07-22T01:10:00.000Z", valuationPolicy: { testFixture: true }, sellerAsk: null, reserve: null, commonDenomination: null, maximumWinners: 1 });
  const authority = addressed({ type: "TTIUnionMediaResourceFulfillmentAuthorityAdmission", version: 1, status: "admitted-provider-fulfillment-authority", contract: UNION_MEDIA_SEALED_BID_CONTRACT, provider: enterprise, assayer, recordedAt: "2026-07-22T00:20:00.000Z", resourceClass: "compute", unit: "inference-output-token", maximumQuantity: 1000, capability: "urn:capability:bounded-inference", rights: "TTI may consume the exact capability once for its own contracted operation", fulfillmentContract: "urn:contract:bounded-inference:v1", evidenceId: "ni:///sha-256;AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", validThrough: "2026-07-22T02:00:00.000Z", ...authorityChanges });
  const resourceOffer = { type: "AgentResourceCommitment", resourceClass: authority.resourceClass, description: "Bounded inference capacity", quantity: 500, unit: authority.unit, capability: authority.capability, rights: authority.rights, fulfillmentContract: authority.fulfillmentContract, fulfillmentAuthority: authority.id, validThrough: "2026-07-22T02:00:00.000Z", monetaryClaim: false, x402Applicable: false };
  const bid = bidFor(cycle.id, editorial.id, resourceOffer);
  const rows = new Map([[UNION_MEDIA_PLACEMENT_REQUEST_CATEGORY, [placement]], [UNION_MEDIA_EDITORIAL_ADMISSION_CATEGORY, [editorial]], [UNION_MEDIA_AUCTION_CYCLE_CATEGORY, [cycle]], [UNION_MEDIA_RESOURCE_AUTHORITY_CATEGORY, [authority]], [UNION_MEDIA_BID_ADMISSION_CATEGORY, []]]), writes = [];
  const store = { records(category) { return rows.get(category) ?? []; }, async record(value) { if (recordDelay) await new Promise((resolve) => setTimeout(resolve, recordDelay)); writes.push(value); rows.get(value.category).push(value.record); } };
  const callbacks = createUnionMediaSealedBidActivityPubCallbacks({ origin: receiverOrigin, identifier: "union-media", agentCard: receiverCard, senders: { [enterprise]: { actor: senderActor, agentCard: senderCard } }, carrier, store, authorizedEditorialReviewer: reviewer, authorizedAuthorityAssayer: assayer, now: () => nowValue });
  return { placement, editorial, cycle, authority, resourceOffer, bid, rows, writes, store, callbacks };
}

function bidFor(cycleId, creativeAdmissionId, resourceOffer, changes = {}) { return unionMediaAddressed({ type: "TTIUnionMediaAgentResourceBid", version: 1, contract: syndicationContract, ingressContract: UNION_MEDIA_SEALED_BID_CONTRACT, bidder: enterprise, cycleId, creativeAdmissionId, resourceOffer, ...changes }); }
function envelope(bid, origin = senderOrigin, identifier = "youtube-channel-enterprise", recipient = receiverActor, card = senderCard) { return { type: "Create", actor: new URL(`/actors/${identifier}`, origin).href, to: recipient, agentCard: card, sen: semanticBytes(bid).toString("base64") }; }

test("admits one private exact bid, returns exact replay, and exposes no auction book or economic effect", async () => {
  const f = fixture(), first = await f.callbacks.onActivity({ jsonLd: envelope(f.bid) }), replay = await f.callbacks.onActivity({ jsonLd: envelope(f.bid) });
  assert.equal(first.type, "TTIUnionMediaSealedBidAcknowledgement"); assert.equal(replay.bidAdmissionId, first.bidAdmissionId); assert.equal(f.writes.length, 1);
  assert.deepEqual(await f.callbacks.listOutbox(), { items: [] }); assert.equal("resourceOffer" in first, false); assert.equal("ranking" in first, false); assert.equal(first.competitorDataDisclosed, false);
  const admission = f.rows.get(UNION_MEDIA_BID_ADMISSION_CATEGORY)[0]; assert.equal(admission.resourceOfferId, unionMediaSemanticId(f.resourceOffer));
  for (const field of ["awardFormed", "resourceTransferObserved", "publicationAuthorized", "cashRevenueRecognized", "monetaryProfitRecognized"]) assert.equal(admission[field], false);
});

test("refuses foreign senders, actor drift, authority mismatch, bidder utility, money, and late arrival without mutation", async () => {
  const f = fixture();
  await assert.rejects(f.callbacks.onActivity({ jsonLd: envelope(f.bid, "https://foreign.example/", "foreign", receiverActor, senderCard) }), /no TTI Union Media treaty/u);
  const actorDrift = fixture({ placementActor: "https://prior.example/actors/youtube" });
  assert.match((await admitAuthenticatedUnionMediaBid(actorDrift.bid, { enterprise, activityPubActor: senderActor, authorizedEditorialReviewer: reviewer, authorizedAuthorityAssayer: assayer, now, store: actorDrift.store })).reasons.join(" "), /actor-binding/u);
  const editorialDrift = fixture({ editorialChanges: { creative: { headline: "Changed after placement admission" } } });
  assert.match((await admitAuthenticatedUnionMediaBid(editorialDrift.bid, { enterprise, activityPubActor: senderActor, authorizedEditorialReviewer: reviewer, authorizedAuthorityAssayer: assayer, now, store: editorialDrift.store })).reasons.join(" "), /actor-binding/u);
  const changedCapability = bidFor(f.cycle.id, f.editorial.id, { ...f.resourceOffer, capability: "urn:capability:unadmitted" });
  assert.match((await admitAuthenticatedUnionMediaBid(changedCapability, { enterprise, activityPubActor: senderActor, authorizedEditorialReviewer: reviewer, authorizedAuthorityAssayer: assayer, now, store: f.store })).reasons.join(" "), /authority-invalid/u);
  for (const changed of [{ utilityScore: 999 }, { resourceOffer: { ...f.resourceOffer, monetaryClaim: true } }]) {
    const candidate = bidFor(f.cycle.id, f.editorial.id, f.resourceOffer, changed);
    assert.equal((await admitAuthenticatedUnionMediaBid(candidate, { enterprise, activityPubActor: senderActor, authorizedEditorialReviewer: reviewer, authorizedAuthorityAssayer: assayer, now, store: f.store })).type, "TTIUnionMediaBidRefusal");
  }
  const late = fixture({ nowValue: new Date("2026-07-22T01:11:00.000Z") });
  await assert.rejects(late.callbacks.onActivity({ jsonLd: envelope(late.bid) }), /bid-outside-cycle-window/u);
  assert.equal(f.writes.length, 0); assert.equal(late.writes.length, 0);
});

test("serializes concurrent changed bids so one enterprise occupies at most one cycle input", async () => {
  const f = fixture({ recordDelay: 20 }), other = bidFor(f.cycle.id, f.editorial.id, { ...f.resourceOffer, description: "A changed resource offer" });
  const settled = await Promise.allSettled([f.callbacks.onActivity({ jsonLd: envelope(f.bid) }), f.callbacks.onActivity({ jsonLd: envelope(other) })]);
  assert.equal(settled.filter((row) => row.status === "fulfilled").length, 1); assert.equal(settled.filter((row) => row.status === "rejected").length, 1);
  assert.equal(f.writes.length, 1); assert.equal(f.rows.get(UNION_MEDIA_BID_ADMISSION_CATEGORY).length, 1);
});
