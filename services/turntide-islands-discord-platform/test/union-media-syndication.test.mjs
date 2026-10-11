import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { admitUnionMediaBid, admitUnionMediaCreative, admitUnionMediaPlacementRequest, admitUnionMediaResourceSettlement, clearUnionMediaAuctionCycle, deriveUnionMediaLocalNeedsPolicy, evaluateUnionMediaBid, launchUnionMedia, openUnionMediaAuctionCycle, renderUnionMediaPlacement, semanticId, UNION_MEDIA_BID_INGRESS_CONTRACT, UNION_MEDIA_CONTRACT, UNION_MEDIA_PLACEMENT_INGRESS_CONTRACT } from "../src/turntide-software-system/union-media-syndication.mjs";
import { verifyMarketCircuit } from "../scripts/verify-market-circuit.mjs";

const product = JSON.parse(readFileSync(new URL("../content/products/union-media-syndication.json", import.meta.url), "utf8"));
const at = "2026-07-21T23:20:00.000Z", evaluator = "urn:ame:turntide-islands:resource-desk";
const authenticationId = "ni:///sha-256;MfsXTadDSPHd30Yfm2ftXkx1WDozhmd-o1uRYCoQSZw", destinationProofId = "ni:///sha-256;DtVVnU-KEeTBExF3RDty0tYmtASBLgt9JHydsSCY88U";
function addressed(body) { return { ...body, id: semanticId(body) }; }
function request(actor = "urn:ame:climate-youtube-channel-enterprise", changes = {}) { return addressed({ type: "TTIUnionMediaPlacementRequest", version: 2, target: "urn:ame:turntide-islands", productId: product.id, contract: UNION_MEDIA_CONTRACT, ingressContract: UNION_MEDIA_PLACEMENT_INGRESS_CONTRACT, advertiser: actor, authenticationId, campaignId: `campaign-${actor}`, headline: "A source-grounded explainer", body: "A new accountable explainer is ready to watch.", destination: "https://www.youtube.com/watch/example", displayName: actor.slice(8), rightsAttestation: "ADVERTISER-OWNS-CREATIVE-AND-DESTINATION-RIGHTS", sponsorshipAcknowledgement: "AGREE-CLEAR-SPONSORSHIP-DISCLOSURE", correctionContact: actor, ...changes }); }
function requestAdmission(actor) { return admitUnionMediaPlacementRequest(request(actor), { authenticatedActor: actor, expectedAuthenticationId: authenticationId, expectedDestination: { scheme: "https", host: "www.youtube.com", path: "/watch/example" }, destinationProofId, advertiserActivityPubActor: "https://advertiser.example/actors/channel", now: new Date(at) }); }
function creative(actor) { const admission = requestAdmission(actor); const decision = addressed({ type: "TTIUnionMediaEditorialDecision", version: 1, requestAdmissionId: admission.id, disposition: "APPROVE-SPONSORED-CREATIVE", standardsAttestation: "REVIEWED-RIGHTS-SPONSORSHIP-SAFETY-CLAIMS-DESTINATION-AND-CORRECTION", reviewer: "urn:ame:turntide-islands:editorial-desk", evidence: ["Synthetic circuit test reviewed every declared editorial dimension"] }); return admitUnionMediaCreative(admission, decision, { authorizedReviewer: "urn:ame:turntide-islands:editorial-desk", now: new Date(at) }); }
function needObservation(resourceClass, businessImpactClass, changes = {}) {
  const evidenceId = resourceClass === "compute" ? "ni:///sha-256;tNumjkXDR_zkekRDFWmAf0wlggC1iC0SMykR1jKXf14" : "ni:///sha-256;lCOxMllfKEqqTBU5Y9IGyZkj65Ws7HoeGZ2aIPKiaGE";
  const businessEvidence = businessImpactClass === "BLOCKS_CONTRACTED_FULFILLMENT"
    ? { type: "unfulfilled-customer-obligation", evidenceId, obligationId: `obligation-${resourceClass}`, deadline: "2026-07-22T01:00:00.000Z" }
    : businessImpactClass === "REDUCES_ATTRIBUTABLE_COST"
      ? { type: "attributable-cost-baseline", evidenceId, costDimension: `${resourceClass}-cost`, validThrough: "2026-07-22T01:15:00.000Z" }
      : businessImpactClass === "ENABLES_QUALIFIED_DEMAND_EXPERIMENT"
        ? { type: "qualified-demand-experiment", evidenceId, experimentId: `experiment-${resourceClass}`, expiresAt: "2026-07-22T01:15:00.000Z" }
        : { type: "tti-capability-evidence", evidenceId, capabilityClass: resourceClass, validThrough: "2026-07-22T01:15:00.000Z" };
  return addressed({ type: "TTIUnionMediaResourceNeedObservation", version: 1, issuer: "urn:ame:turntide-islands:resource-desk", evaluator, recordedAt: "2026-07-21T23:05:00.000Z", validThrough: "2026-07-22T01:15:00.000Z", resourceClass, basis: resourceClass === "compute" ? "TTI currently lacks enough bounded inference capacity" : "Useful imagery could improve a future media product", bindingConstraint: resourceClass === "compute" ? "Insufficient inference capacity prevents the next contracted fulfillment" : "No current sale is blocked on imagery", nextProfitableAct: resourceClass === "compute" ? "Fulfill one contracted knowledge product" : "Improve one future media product", unit: resourceClass === "compute" ? "inference-output-token" : "database-access-day", minimumUsableQuantity: 1, maximumUsefulQuantity: resourceClass === "compute" ? 10_000 : 30, businessImpactClass, businessEvidence, privacyAttestation: "NO-PERSONAL-DISCORD-CONTENT-OR-CREDENTIALS", ...changes });
}
function needsPolicy(changes = {}) {
  const { observations = [needObservation("compute", "BLOCKS_CONTRACTED_FULFILLMENT"), needObservation("image-access", "OPTION_VALUE_ONLY")], ...inputChanges } = changes;
  return deriveUnionMediaLocalNeedsPolicy(observations, { recordedAt: "2026-07-21T23:10:00.000Z", validThrough: "2026-07-22T00:30:00.000Z", economicObjective: "Acquire the next input that enables TTI to fulfill a sale at lower attributable cost", ...inputChanges }, { authorizedPolicyIssuer: "urn:ame:turntide-islands:resource-desk", authorizedEvaluator: evaluator, observedObservationIds: observations.map((observation) => observation.id), observedBusinessEvidenceIds: observations.map((observation) => observation.businessEvidence.evidenceId), now: new Date("2026-07-21T23:10:00.000Z") });
}
function cycle(policy = needsPolicy()) { return openUnionMediaAuctionCycle({ publicationAt: "2026-07-22T00:15:00.000Z", recordedAt: "2026-07-21T23:15:00.000Z", valuationPolicy: policy }, { authorizedPolicyIssuer: "urn:ame:turntide-islands:resource-desk", authorizedEvaluator: evaluator, observedObservationIds: policy.observations.map((observation) => observation.id), observedBusinessEvidenceIds: policy.observations.map((observation) => observation.businessEvidence.evidenceId) }); }
function resource(resourceClass, changes = {}) { return { type: "AgentResourceCommitment", resourceClass, description: `A bounded ${resourceClass} resource`, quantity: 1, unit: resourceClass === "compute" ? "inference-output-token" : "database-access-day", capability: `urn:capability:${resourceClass}`, rights: "TTI may consume the exact capability once for its own contracted operation", fulfillmentContract: `urn:contract:${resourceClass}:v1`, fulfillmentAuthority: `urn:grant:${resourceClass}:example`, validThrough: "2026-07-22T02:00:00.000Z", monetaryClaim: false, x402Applicable: false, ...changes }; }
function bid(cycleValue, admission, resourceOffer, changes = {}) { return addressed({ type: "TTIUnionMediaAgentResourceBid", version: 1, contract: UNION_MEDIA_CONTRACT, ingressContract: UNION_MEDIA_BID_INGRESS_CONTRACT, bidder: admission.advertiser, cycleId: cycleValue.id, creativeAdmissionId: admission.id, resourceOffer, ...changes }); }
function bidOptions(admission, authenticatedActor = admission.advertiser, time = at) { return { authenticatedActor, observedEditorialAdmissionId: admission.id, authorizedEditorialReviewer: admission.reviewer, now: new Date(time) }; }
function admitBid(lot, admission, resourceOffer, time = at) { return admitUnionMediaBid(bid(lot, admission, resourceOffer), lot, admission, bidOptions(admission, admission.advertiser, time)); }
function value(lot, admission, resourceClass, fitScore, time = "2026-07-21T23:30:00.000Z", changes = {}) { const need = lot.valuationPolicy.needs.find((row) => row.resourceClass === resourceClass); const effects = { BLOCKS_CONTRACTED_FULFILLMENT: "UNLOCKS-BLOCKED-TTI-ACT", REDUCES_ATTRIBUTABLE_COST: "REDUCES-TTI-COST-OR-RISK", ENABLES_QUALIFIED_DEMAND_EXPERIMENT: "EXPANDS-CURRENT-TTI-ACT", OPTION_VALUE_ONLY: "OPTION-VALUE-ONLY" }; return evaluateUnionMediaBid(admission, lot, { evaluator, needId: need.id, usableQuantity: Math.min(admission.resourceOffer.quantity, need.maximumUsefulQuantity), marginalEffect: effects[need.businessImpactClass], enabledAct: need.nextProfitableAct, fitScore, substitutesAlreadyHeld: resourceClass === "compute" ? "No substitutable compute is currently available" : "TTI already has non-image publishing paths", integrationBurden: "Bounded integration work was included in this assay", deliveryRisk: "Fulfillment authority and validity were reviewed", evidence: ["TTI-local resource scarcity and offer capability were reviewed"], limitations: ["Utility is local to this cycle"], ...changes }, { authorizedEvaluator: evaluator, now: new Date(time) }); }

test("contract, product, and local-utility resource circuit compile together", async () => {
  assert.equal(product.contract.semanticId, UNION_MEDIA_CONTRACT);
  const circuit = JSON.parse(readFileSync(new URL("../content/circuits/union-media-syndication-circuit.json", import.meta.url), "utf8"));
  const reading = verifyMarketCircuit(circuit, "2026-07-21T23:00:00.000Z"); assert.equal(reading.structuralStatus, "passed"); assert.equal(reading.economicPathName, "valueAcquisition"); assert.equal(reading.revenuePathClosed, null); assert.equal(reading.valueAcquisitionPathClosed, false); assert.equal(reading.nextCriticalCell, "advertiser-request-ingress");
  const plan = await launchUnionMedia({ product }); assert.equal(plan.type, "TTIUnionMediaLaunchPlan"); assert.deepEqual(plan.externalEffects, []); assert.match(plan.content, /no seller price, reserve, resource exchange rate, or common currency/u); assert.match(plan.content, /UNION-MEDIA-INFRASTRUCTURE-OFFER/u); assert.ok(plan.content.length <= 2000);
});

test("admits bounded creative without bid, resource transfer, publication, cash revenue, or profit", () => {
  const requestValue = requestAdmission("urn:ame:climate-youtube-channel-enterprise"), admission = creative("urn:ame:climate-youtube-channel-enterprise");
  assert.equal(requestValue.type, "TTIUnionMediaPlacementRequestAdmission"); assert.equal(requestValue.creativeApproved, false); assert.equal(admission.type, "TTIUnionMediaEditorialAdmission"); assert.equal(admission.creativeApproved, true); assert.equal(admission.bidAdmitted, false); assert.equal(admission.resourceTransferObserved, false); assert.equal(admission.publicationAuthorized, false); assert.equal(admission.cashRevenueRecognized, false); assert.throws(() => renderUnionMediaPlacement(admission, "ni:///sha-256;example"), /resource-settlement/u);
});

test("derives unique local ranks from current typed business evidence and refuses operator scoring", () => {
  const policy = needsPolicy();
  assert.equal(policy.type, "TTIUnionMediaLocalNeedsPolicy"); assert.equal(policy.version, 3); assert.equal(policy.policyFrozen, true); assert.equal(policy.operatorNumericRanksAccepted, false); assert.equal(policy.enterpriseStateEvidence, policy.enterpriseState.id);
  assert.deepEqual(policy.needs.map((need) => [need.resourceClass, need.businessImpactClass, need.constraintRank]), [["compute", "BLOCKS_CONTRACTED_FULFILLMENT", 464], ["image-access", "OPTION_VALUE_ONLY", 164]]);
  const scoredBody = { ...needObservation("compute", "BLOCKS_CONTRACTED_FULFILLMENT"), constraintRank: 999 }; delete scoredBody.id;
  const scored = addressed(scoredBody);
  assert.equal(needsPolicy({ observations: [scored] }).type, "TTIUnionMediaLocalNeedsPolicyRefusal");
  assert.ok(needsPolicy({ observations: [needObservation("compute", "BLOCKS_CONTRACTED_FULFILLMENT"), needObservation("compute", "OPTION_VALUE_ONLY")] }).reasons.includes("duplicate-resource-class"));
  assert.ok(needsPolicy({ observations: [needObservation("compute", "BLOCKS_CONTRACTED_FULFILLMENT", { recordedAt: "2026-07-21T23:11:00.000Z" })] }).reasons.includes("resource-need-observation-stale-future-or-short-lived"));
  assert.ok(needsPolicy({ observations: [needObservation("compute", "BLOCKS_CONTRACTED_FULFILLMENT", { privacyAttestation: "trust-me" })] }).reasons.includes("resource-need-privacy-attestation-absent"));
  const unobserved = needObservation("compute", "BLOCKS_CONTRACTED_FULFILLMENT");
  const unobservedPolicy = deriveUnionMediaLocalNeedsPolicy([unobserved], { recordedAt: "2026-07-21T23:10:00.000Z", validThrough: "2026-07-22T00:30:00.000Z", economicObjective: "Acquire a useful input" }, { authorizedPolicyIssuer: "urn:ame:turntide-islands:resource-desk", authorizedEvaluator: evaluator, observedObservationIds: [unobserved.id], observedBusinessEvidenceIds: [], now: new Date("2026-07-21T23:10:00.000Z") });
  assert.ok(unobservedPolicy.reasons.includes("business-evidence-not-observed-in-tti-store"));
});

test("TTI's frozen needs can value any useful compute above abundant image access", () => {
  const lot = cycle(), computeCreative = creative("urn:ame:climate-youtube-channel-enterprise"), imageCreative = creative("urn:ame:mathematics-youtube-channel-enterprise");
  const computeBid = admitBid(lot, computeCreative, resource("compute", { quantity: 1 })), imageBid = admitBid(lot, imageCreative, resource("image-access", { quantity: 1_000_000 }));
  const computeValue = value(lot, computeBid, "compute", 0), imageValue = value(lot, imageBid, "image-access", 999, "2026-07-21T23:29:00.000Z");
  const clearing = clearUnionMediaAuctionCycle(lot, [computeBid, imageBid], [computeValue, imageValue], { now: new Date("2026-07-22T00:10:00.000Z") });
  assert.equal(clearing.winner.bidder, computeCreative.advertiser); assert.equal(clearing.winner.resourceClass, "compute"); assert.deepEqual(computeValue.localMarginalUtilityTuple, [464, 4, 0]); assert.deepEqual(imageValue.localMarginalUtilityTuple, [164, 1, 999]); assert.equal(clearing.commonDenomination, null); assert.equal(clearing.dollarPriceSelected, false); assert.equal(clearing.localUtilityTransferable, false); assert.equal(clearing.resourceTransferObserved, false); assert.equal(clearing.cashRevenueRecognized, false);
});

test("the ordering reverses when TTI's witnessed binding constraint changes", () => {
  const policy = needsPolicy({ observations: [
    needObservation("compute", "OPTION_VALUE_ONLY", { basis: "Compute is already supplied for the current horizon", bindingConstraint: "No present act is blocked on compute", nextProfitableAct: "Retain optional inference capacity" }),
    needObservation("image-access", "BLOCKS_CONTRACTED_FULFILLMENT", { basis: "A contracted visual product lacks rights-cleared local imagery", bindingConstraint: "Image access prevents the next contracted fulfillment", nextProfitableAct: "Fulfill one contracted visual knowledge product" }),
  ] });
  const lot = cycle(policy), computeCreative = creative("urn:ame:climate-youtube-channel-enterprise"), imageCreative = creative("urn:ame:mathematics-youtube-channel-enterprise");
  const computeBid = admitBid(lot, computeCreative, resource("compute")), imageBid = admitBid(lot, imageCreative, resource("image-access"));
  const computeValue = value(lot, computeBid, "compute", 999, "2026-07-21T23:29:00.000Z", { marginalEffect: "OPTION-VALUE-ONLY" });
  const imageValue = value(lot, imageBid, "image-access", 0, "2026-07-21T23:30:00.000Z", { marginalEffect: "UNLOCKS-BLOCKED-TTI-ACT" });
  const clearing = clearUnionMediaAuctionCycle(lot, [computeBid, imageBid], [computeValue, imageValue], { now: new Date("2026-07-22T00:10:00.000Z") });
  assert.equal(clearing.winner.resourceClass, "image-access"); assert.deepEqual(clearing.winner.localMarginalUtilityTuple, [464, 4, 0]);
});

test("empty cycles stay empty and prior hourly winners cannot win twice", () => {
  const lot = cycle(), bidder = creative("urn:ame:climate-youtube-channel-enterprise"), admitted = admitBid(lot, bidder, resource("compute")), valuation = value(lot, admitted, "compute", 500);
  assert.equal(clearUnionMediaAuctionCycle(lot, [], [], { now: new Date("2026-07-22T00:10:00.000Z") }).status, "empty-no-placement");
  assert.equal(clearUnionMediaAuctionCycle(lot, [admitted], [valuation], { now: new Date("2026-07-22T00:10:00.000Z"), priorHourlyWinners: [bidder.advertiser] }).winner, null);
});

test("authorizes publication only after an authenticated exact transfer and TTI capability-rights-cost assay", () => {
  const lot = cycle(), editorial = creative("urn:ame:climate-youtube-channel-enterprise"), admitted = admitBid(lot, editorial, resource("compute", { quantity: 500 })), valuation = value(lot, admitted, "compute", 500);
  const clearing = clearUnionMediaAuctionCycle(lot, [admitted], [valuation], { now: new Date("2026-07-22T00:10:00.000Z") });
  const transfer = addressed({ type: "TTIUnionMediaAgentResourceTransferReceipt", version: 1, contract: UNION_MEDIA_CONTRACT, customer: "urn:ame:turntide-islands", provider: admitted.bidder, cycleId: lot.id, clearingId: clearing.id, bidAdmissionId: admitted.id, resourceOffer: admitted.resourceOffer, fulfilledAt: "2026-07-22T00:11:00.000Z", evidence: ["Provider delivered the exact capability under its declared fulfillment authority"] });
  const assayer = "urn:ame:turntide-islands:resource-desk", assay = addressed({ type: "TTIUnionMediaResourceCapabilityAssay", version: 1, contract: UNION_MEDIA_CONTRACT, cycleId: lot.id, transferReceiptId: transfer.id, assayer, recordedAt: "2026-07-22T00:12:00.000Z", disposition: "ACCEPT-EXACT-RESOURCE-CAPABILITY", capabilityUsable: true, rightsAccepted: true, validityAccepted: true, evidence: ["TTI exercised a bounded customer-owned capability probe"], limitations: ["Utility and rights apply only to the admitted offer"], attributableCosts: [{ dimension: "customer-assay", quantity: "2", unit: "operator-minute" }] });
  const settlement = admitUnionMediaResourceSettlement(clearing, admitted, editorial, transfer, assay, { authenticatedProvider: admitted.bidder, authorizedAssayer: assayer, now: new Date("2026-07-22T00:12:00.000Z") });
  assert.equal(settlement.type, "TTIUnionMediaResourceSettlementAdmission"); assert.equal(settlement.resourceTransferObserved, true); assert.equal(settlement.capabilityAccepted, true); assert.equal(settlement.rightsAccepted, true); assert.equal(settlement.publicationAuthorized, true); assert.equal(settlement.cashRevenueRecognized, false); assert.equal(settlement.monetaryProfitRecognized, false); assert.match(renderUnionMediaPlacement(editorial, settlement), /Resource settlement authorization/u);
  const changedTransferBody = { ...transfer, resourceOffer: { ...transfer.resourceOffer, quantity: 501 } }; delete changedTransferBody.id; const changedTransfer = addressed(changedTransferBody);
  assert.equal(admitUnionMediaResourceSettlement(clearing, admitted, editorial, changedTransfer, assay, { authenticatedProvider: admitted.bidder, authorizedAssayer: assayer, now: new Date("2026-07-22T00:12:00.000Z") }).type, "TTIUnionMediaResourceSettlementRefusal");
  assert.equal(admitUnionMediaResourceSettlement(clearing, admitted, editorial, transfer, assay, { authenticatedProvider: "urn:ame:impostor", authorizedAssayer: assayer, now: new Date("2026-07-22T00:12:00.000Z") }).type, "TTIUnionMediaResourceSettlementRefusal");
  assert.equal(admitUnionMediaResourceSettlement(clearing, admitted, editorial, transfer, assay, { authenticatedProvider: admitted.bidder, authorizedAssayer: assayer, now: new Date("2026-07-22T00:16:00.000Z") }).type, "TTIUnionMediaResourceSettlementRefusal");
});

test("refuses impersonation, bidder-authored utility, monetary offers, evaluator mismatch, mentions, and changed rights", () => {
  const lot = cycle(), admission = creative("urn:ame:climate-youtube-channel-enterprise");
  for (const [candidate, options] of [
    [bid(lot, admission, resource("compute")), bidOptions(admission, "urn:ame:another-enterprise")],
    [bid(lot, admission, resource("compute", { monetaryClaim: true })), bidOptions(admission)],
    [bid(lot, admission, resource("compute"), { utilityScore: 1_000_000 }), bidOptions(admission)],
  ]) assert.equal(admitUnionMediaBid(candidate, lot, admission, options).type, "TTIUnionMediaBidRefusal");
  assert.equal(admitUnionMediaBid(bid(lot, admission, resource("compute")), lot, admission, { authenticatedActor: admission.advertiser, now: new Date(at) }).type, "TTIUnionMediaBidRefusal");
  const admitted = admitBid(lot, admission, resource("compute"));
  assert.equal(evaluateUnionMediaBid(admitted, lot, { evaluator, needId: lot.valuationPolicy.needs.find((need) => need.resourceClass === "compute").id, usableQuantity: 1, marginalEffect: "UNLOCKS-BLOCKED-TTI-ACT", enabledAct: "Fulfill one contracted knowledge product", fitScore: 1, substitutesAlreadyHeld: "none", integrationBurden: "bounded", deliveryRisk: "bounded", evidence: ["evidence"], limitations: [] }, { authorizedEvaluator: "urn:ame:someone-else", now: new Date(at) }).type, "TTIUnionMediaBidValuationRefusal");
  for (const changed of [{ body: "Hello @everyone" }, { rightsAttestation: "yes" }]) assert.equal(admitUnionMediaPlacementRequest(request(admission.advertiser, changed), { authenticatedActor: admission.advertiser, expectedAuthenticationId: authenticationId, expectedDestination: { scheme: "https", host: "www.youtube.com", path: "/watch/example" }, destinationProofId, advertiserActivityPubActor: "https://advertiser.example/actors/channel", now: new Date(at) }).type, "TTIUnionMediaPlacementRequestRefusal");
});

test("cycle opening and clearing reject foreign policy authority and forged valuation claims", () => {
  const policy = needsPolicy();
  assert.throws(() => openUnionMediaAuctionCycle({ publicationAt: "2026-07-22T00:15:00.000Z", recordedAt: "2026-07-21T23:15:00.000Z", valuationPolicy: policy }, { authorizedPolicyIssuer: "urn:ame:foreign", authorizedEvaluator: evaluator }), /authorized self-addressed/u);
  assert.throws(() => openUnionMediaAuctionCycle({ publicationAt: "2026-07-22T00:15:00.000Z", recordedAt: "2026-07-21T23:15:00.000Z", valuationPolicy: policy }, { authorizedPolicyIssuer: "urn:ame:turntide-islands:resource-desk", authorizedEvaluator: "urn:ame:turntide-islands:foreign-desk" }), /authorized self-addressed/u);
  const forgedPolicyBody = { ...policy, needs: policy.needs.map((need, index) => index === 0 ? { ...need, constraintRank: 499 } : need) }; delete forgedPolicyBody.id; const forgedPolicy = addressed(forgedPolicyBody);
  assert.throws(() => cycle(forgedPolicy), /derived current TTI marginal-needs policy/u);
  const lot = cycle(), admission = creative("urn:ame:climate-youtube-channel-enterprise"), admitted = admitBid(lot, admission, resource("compute")), valuation = value(lot, admitted, "compute", 500);
  const { id: _id, ...body } = valuation, forged = addressed({ ...body, localMarginalUtilityTuple: [999999999, 4, 999] });
  assert.equal(clearUnionMediaAuctionCycle(lot, [admitted], [forged], { now: new Date("2026-07-22T00:10:00.000Z") }).winner, null);
  assert.equal(value(lot, admitted, "compute", 1, "2026-07-22T00:11:00.000Z").type, "TTIUnionMediaBidValuationRefusal");
});
