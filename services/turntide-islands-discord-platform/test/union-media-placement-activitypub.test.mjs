import assert from "node:assert/strict";
import test from "node:test";
import { EMPTY_WITNESS_ROOT, identifyJsonSemanticContent } from "@red-cup-engineering/computer-content-engineering-services-section/semantic-content-identity";

import { identifyTurntideDiscordPlatformRecord as semanticId } from "../src/turntide-software-system/discord-platform-record-semantic-content.mjs";
// TTIUnionMediaPlacementRequest / TTIUnionMediaPlacementRequestAdmission cross the boundary into
// @causeway-services/turntide-union-media-syndication-service, which self-addresses under its own
// "turntide-islands.record" objectKind -- distinct from this app's "turntide-islands.discord-platform-record".
const unionMediaSemanticId = (value) => identifyJsonSemanticContent({ objectKind: "turntide-islands.record", value, witnessRoot: EMPTY_WITNESS_ROOT }).token;
const semanticBytes = (value) => identifyJsonSemanticContent({ objectKind: "rsc-quiescent.a2a-json", value, witnessRoot: EMPTY_WITNESS_ROOT }).bytes;
import { UNION_MEDIA_DESTINATION_PROOF_CATEGORY, UNION_MEDIA_INTENT_CONTRACT } from "../src/turntide-software-system/union-media-intent.mjs";
import { UNION_MEDIA_ENTERPRISE_AUTH_CATEGORY, UNION_MEDIA_ENTERPRISE_AUTH_CONTRACT } from "../src/turntide-software-system/union-media-enterprise-authentication.mjs";
import { UNION_MEDIA_PLACEMENT_REQUEST_CATEGORY, UNION_MEDIA_PLACEMENT_REQUEST_CONTRACT, admitAuthenticatedUnionMediaPlacementRequest, createUnionMediaPlacementActivityPubCallbacks, loadUnionMediaActivityPubTreaty, validateDeployableUnionMediaActivityPubTreaty } from "../src/turntide-software-system/union-media-placement-activitypub.mjs";

const enterprise = "urn:ame:youtube-channel-enterprise", now = new Date("2026-07-22T01:00:00.000Z"), senderOrigin = "https://youtube.example/", senderActor = `${senderOrigin}actors/youtube-channel-enterprise`, senderCard = `${senderOrigin}.well-known/agent-card.json`, receiverOrigin = "https://tti.example/", receiverActor = `${receiverOrigin}actors/union-media`, receiverCard = `${receiverOrigin}.well-known/agent-card.json`;
const addressed = (body) => Object.freeze({ ...body, id: semanticId(body) });
const unionMediaAddressed = (body) => Object.freeze({ ...body, id: unionMediaSemanticId(body) });
const carrier = { extract(activity, expected) { if (activity?.actor !== expected.expectedActor || activity?.to !== expected.expectedRecipient || activity?.agentCard !== expected.expectedAgentCard || typeof activity?.sen !== "string") throw new Error("synthetic verified carrier expectation mismatch"); return { type: activity.type, objectBytes: Buffer.from(activity.sen, "base64") }; } };

function fixture({ recordDelay = 0 } = {}) {
  const proof = addressed({ type: "TTIUnionMediaDestinationControlAdmission", version: 1, status: "qualified-destination-controlled-lead", contract: UNION_MEDIA_INTENT_CONTRACT, productId: "tti-union-media-syndication-2026-01", experimentId: "EXP-UNION-MEDIA-001", recordedAt: "2026-07-22T00:00:00.000Z", intentId: "ni:///sha-256;AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", representativePseudonym: "urn:tti:representative:test", verificationSubmissionPseudonym: "urn:tti:verification:test", declaration: { enterprise, destination: { scheme: "https", host: "youtube.example", path: "/watch/example" }, resourceClass: "compute", destinationControlled: true, enterpriseAuthenticated: false, representativeAuthorityVerified: false }, evidence: { protocol: "dns-txt-v1", matchingTxtObserved: true }, measurement: { qualifiedAdvertiserLead: true, authenticatedBid: false }, creativeApproved: false, bidAdmitted: false });
  const authentication = addressed({ type: "TTIUnionMediaEnterpriseAuthenticationAdmission", version: 1, status: "authenticated-for-one-later-placement-request", contract: UNION_MEDIA_ENTERPRISE_AUTH_CONTRACT, productId: "tti-union-media-syndication-2026-01", recordedAt: "2026-07-22T00:10:00.000Z", enterprise, account: "eip155:31337:0x86c16921b9c4a1d687e5b46cfb0168278450c396", representativePseudonym: proof.representativePseudonym, destinationProofId: proof.id, intentId: proof.intentId, delegationRequestId: "ni:///sha-256;BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB", scope: "authenticate-enterprise-and-representative-for-one-later-placement-request", expiresAt: "2026-07-29T00:00:00.000Z", measurement: { authenticatedEnterpriseDemand: true, authenticatedPlacementRequest: false, authenticatedBid: false }, placementRequestAdmitted: false, bidAdmitted: false, publicationPromised: false, revenueRecognized: false, profitRecognized: false });
  const rows = new Map([[UNION_MEDIA_DESTINATION_PROOF_CATEGORY, [proof]], [UNION_MEDIA_ENTERPRISE_AUTH_CATEGORY, [authentication]], [UNION_MEDIA_PLACEMENT_REQUEST_CATEGORY, []]]), writes = [];
  const store = { records(category) { return rows.get(category) ?? []; }, async record(value) { if (recordDelay) await new Promise((resolve) => setTimeout(resolve, recordDelay)); writes.push(value); rows.get(value.category).push(value.record); } };
  const request = requestFor(authentication.id);
  const callbacks = createUnionMediaPlacementActivityPubCallbacks({ origin: receiverOrigin, identifier: "union-media", agentCard: receiverCard, senders: { [enterprise]: { actor: senderActor, agentCard: senderCard } }, carrier, store, now: () => now });
  return { proof, authentication, request, rows, writes, store, callbacks };
}

function requestFor(authenticationId, changes = {}) { return unionMediaAddressed({ type: "TTIUnionMediaPlacementRequest", version: 2, target: "urn:ame:turntide-islands", productId: "tti-union-media-syndication-2026-01", contract: "ni:///sha-256;_3Vr73uJvicSjls4LCZoNspuAKpUl2RFKC0auMcGfS4", ingressContract: UNION_MEDIA_PLACEMENT_REQUEST_CONTRACT, advertiser: enterprise, authenticationId, campaignId: "youtube-pilot-campaign", headline: "A source-grounded explainer", body: "A new accountable explainer is ready to watch.", destination: "https://youtube.example/watch/example", displayName: "YouTube Channel Enterprise", rightsAttestation: "ADVERTISER-OWNS-CREATIVE-AND-DESTINATION-RIGHTS", sponsorshipAcknowledgement: "AGREE-CLEAR-SPONSORSHIP-DISCLOSURE", correctionContact: enterprise, ...changes }); }
function envelope(request, origin = senderOrigin, identifier = "youtube-channel-enterprise", recipient = receiverActor, card = senderCard) { return { type: "Create", actor: new URL(`/actors/${identifier}`, origin).href, to: recipient, agentCard: card, sen: semanticBytes(request).toString("base64") }; }

test("honestly refuses undeployable treaty state", () => {
  const treaty = loadUnionMediaActivityPubTreaty();
  assert.equal(treaty.status, "awaiting-public-host-and-first-advertiser-activitypub-identity");
  assert.throws(() => validateDeployableUnionMediaActivityPubTreaty(treaty), /sender-identity-incomplete/u);
});

test("admits one exact treatied SEN placement request, returns exact replay, and creates no editorial or economic effect", async () => {
  const f = fixture(), first = await f.callbacks.onActivity({ jsonLd: envelope(f.request) }), replay = await f.callbacks.onActivity({ jsonLd: envelope(f.request) });
  assert.equal(first.type, "TTIUnionMediaPlacementRequestAdmission"); assert.equal(replay.id, first.id); assert.equal(f.writes.length, 1);
  assert.equal(first.authenticationId, f.authentication.id); assert.equal(first.destinationProofId, f.proof.id); assert.equal(first.authenticationConsumedForOneRequest, true);
  for (const field of ["creativeApproved", "bidAdmitted", "inventoryReserved", "resourceTransferObserved", "publicationAuthorized", "cashRevenueRecognized", "monetaryProfitRecognized"]) assert.equal(first[field], false);
  const forgedReplay = { ...f.request, body: "Changed bytes falsely naming the old receipt", id: f.request.id };
  await assert.rejects(f.callbacks.onActivity({ jsonLd: envelope(forgedReplay) }), /replay-body-or-sender-mismatch/u); assert.equal(f.writes.length, 1);
});

test("refuses untreatied actor, changed destination, expired authentication, and conflicting one-use replay without mutation", async () => {
  const f = fixture();
  await assert.rejects(f.callbacks.onActivity({ jsonLd: envelope(f.request, "https://foreign.example/", "foreign", receiverActor, senderCard) }), /no TTI Union Media treaty/u);
  for (const changed of [{ destination: "https://youtube.example/watch/other" }, { body: "Hello @everyone" }]) { const result = (await admitAuthenticatedUnionMediaPlacementRequest(requestFor(f.authentication.id, changed), { enterprise, activityPubActor: senderActor, now, store: f.store })); assert.equal(result.type, "TTIUnionMediaPlacementRequestRefusal"); }
  const stale = fixture(), expired = (await admitAuthenticatedUnionMediaPlacementRequest(stale.request, { enterprise, activityPubActor: senderActor, now: new Date("2026-07-30T00:00:00.000Z"), store: stale.store })); assert.match(expired.reasons.join(" "), /expired/u);
  await f.callbacks.onActivity({ jsonLd: envelope(f.request) });
  const conflict = (await admitAuthenticatedUnionMediaPlacementRequest(requestFor(f.authentication.id, { campaignId: "different-campaign" }), { enterprise, activityPubActor: senderActor, now, store: f.store })); assert.match(conflict.reasons.join(" "), /already-consumed/u); assert.equal(f.writes.length, 1);
});

test("serializes concurrent changed requests so one authentication creates at most one admission", async () => {
  const f = fixture({ recordDelay: 20 }), other = requestFor(f.authentication.id, { campaignId: "other-campaign" });
  const settled = await Promise.allSettled([f.callbacks.onActivity({ jsonLd: envelope(f.request) }), f.callbacks.onActivity({ jsonLd: envelope(other) })]);
  assert.equal(settled.filter((row) => row.status === "fulfilled").length, 1); assert.equal(settled.filter((row) => row.status === "rejected").length, 1); assert.equal(f.writes.length, 1); assert.equal(f.rows.get(UNION_MEDIA_PLACEMENT_REQUEST_CATEGORY).length, 1);
});
