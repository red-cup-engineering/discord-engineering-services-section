
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EMPTY_WITNESS_ROOT, identifyJsonSemanticContent } from "@red-cup-engineering/computer-content-address-engineering-services-section/semantic-content-identity";
import { isNiUri as isCanonicalSha256NiUri } from "@red-cup-engineering/uri-services-section/ni-uri";
export const semanticId = (value) => identifyJsonSemanticContent({ objectKind: "turntide-islands.record", value, witnessRoot: EMPTY_WITNESS_ROOT }).token;
import { recordWitnessJournalBatch } from "@red-cup-engineering/witness-journal-document-service";
import { turntideWitnessJournalBindingFromEnvironment } from "./witness-journal-binding.mjs";

const TTI_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const UNION_MEDIA_PRODUCT_PATH = join(TTI_ROOT, "content/products/union-media-syndication.json");
const TTI_ACCOUNT = "eip155:31337:0xcfe1b9960ddbbe2b95e48114c281d7f24eb87b4d";
const TTI_ACTOR = "urn:ame:turntide-islands";
const API = "https://discord.com/api/v10";
export const UNION_MEDIA_CONTRACT = "ni:///sha-256;_3Vr73uJvicSjls4LCZoNspuAKpUl2RFKC0auMcGfS4";
export const UNION_MEDIA_PLACEMENT_INGRESS_CONTRACT = "ni:///sha-256;lA86YpfReCyssDxcPqC0ooB-OscHHYoPe13BWmHB8jQ";
export const UNION_MEDIA_BID_INGRESS_CONTRACT = "ni:///sha-256;c7Lyl9FfYBgTCtn8FPG43qQhzKzjo338yG9oJTwdpuQ";
export const UNION_MEDIA_MARKER = "TTI-UNION-MEDIA-2026-01";

export function deriveUnionMediaLocalNeedsPolicy(observations, input, options = {}) {
  const reasons = [], now = options.now ?? new Date(), recordedAt = new Date(input?.recordedAt), validThrough = new Date(input?.validThrough);
  const observedObservationIds = new Set(options.observedObservationIds ?? []), observedBusinessEvidenceIds = new Set(options.observedBusinessEvidenceIds ?? []);
  const exactInputFields = ["economicObjective", "recordedAt", "validThrough"];
  if (!input || Object.keys(input).sort().join("\0") !== exactInputFields.sort().join("\0")) reasons.push("local-needs-policy-input-fields-not-exact");
  if (!Number.isFinite(recordedAt.getTime()) || !Number.isFinite(validThrough.getTime()) || recordedAt > now || validThrough <= recordedAt || validThrough.getTime() - recordedAt.getTime() > 90 * 60_000) reasons.push("local-needs-policy-horizon-invalid");
  if (!bounded(input?.economicObjective, 3, 500) || sensitiveBusinessText(input?.economicObjective)) reasons.push("economic-objective-absent-unbounded-or-sensitive");
  if (!Array.isArray(observations) || observations.length === 0 || observations.length > LOCAL_NEEDS_MAX) reasons.push("resource-need-observation-count-invalid");
  const ids = new Set(), classes = new Set();
  for (const observation of observations ?? []) {
    for (const reason of validateResourceNeedObservation(observation, { ...options, policyRecordedAt: recordedAt, policyValidThrough: validThrough })) reasons.push(reason);
    if (!observedObservationIds.has(observation?.id)) reasons.push("resource-need-observation-not-observed-in-tti-store");
    if (!observedBusinessEvidenceIds.has(observation?.businessEvidence?.evidenceId)) reasons.push("business-evidence-not-observed-in-tti-store");
    if (ids.has(observation?.id)) reasons.push("duplicate-resource-need-observation"); else ids.add(observation?.id);
    if (classes.has(observation?.resourceClass)) reasons.push("duplicate-resource-class"); else classes.add(observation?.resourceClass);
  }
  if (reasons.length) return Object.freeze({ type: "TTIUnionMediaLocalNeedsPolicyRefusal", version: 1, reasons: [...new Set(reasons)], durableMutation: false, policyFrozen: false, operatorNumericRanksAccepted: false, bidderUtilityAccepted: false });
  const orderedObservations = [...observations].sort(rankResourceNeedObservations);
  const withinClass = new Map();
  const needs = orderedObservations.map((observation) => {
    const classIndex = withinClass.get(observation.businessImpactClass) ?? 0; withinClass.set(observation.businessImpactClass, classIndex + 1);
    return {
      id: observation.id,
      sourceObservationId: observation.id,
      resourceClass: observation.resourceClass,
      basis: observation.basis,
      bindingConstraint: observation.bindingConstraint,
      nextProfitableAct: observation.nextProfitableAct,
      unit: observation.unit,
      minimumUsableQuantity: observation.minimumUsableQuantity,
      maximumUsefulQuantity: observation.maximumUsefulQuantity,
      businessImpactClass: observation.businessImpactClass,
      businessEvidenceId: observation.businessEvidence.evidenceId,
      constraintRank: BUSINESS_IMPACT[observation.businessImpactClass].priority * 100 + LOCAL_NEEDS_MAX - classIndex,
    };
  });
  const stateBody = { type: "TTIUnionMediaEnterpriseScarcityState", version: 1, recordedAt: recordedAt.toISOString(), observationIds: orderedObservations.map((observation) => observation.id), privacyAttestation: "NO-PERSONAL-DISCORD-CONTENT-OR-CREDENTIALS" };
  const enterpriseState = { ...stateBody, id: semanticId(stateBody) };
  const body = { type: "TTIUnionMediaLocalNeedsPolicy", version: 3, issuer: options.authorizedPolicyIssuer, evaluator: options.authorizedEvaluator, recordedAt: recordedAt.toISOString(), validThrough: validThrough.toISOString(), enterpriseStateEvidence: enterpriseState.id, enterpriseState, economicObjective: input.economicObjective.trim(), observations: orderedObservations, needs, policyFrozen: true, operatorNumericRanksAccepted: false, bidderUtilityAccepted: false, transferable: false, currency: false, globalValueClaim: false };
  return Object.freeze({ ...body, id: semanticId(body) });
}

export function admitUnionMediaPlacementRequest(request, options = {}) {
  const reasons = [];
  const exactFields = ["advertiser", "authenticationId", "body", "campaignId", "contract", "correctionContact", "destination", "displayName", "headline", "id", "ingressContract", "productId", "rightsAttestation", "sponsorshipAcknowledgement", "target", "type", "version"];
  if (!request || Object.keys(request).sort().join("\0") !== exactFields.sort().join("\0")) reasons.push("placement-request-fields-not-exact");
  if (options.authenticatedActor !== request?.advertiser || !/^urn:ame:[a-z0-9][a-z0-9-]*$/u.test(request?.advertiser ?? "")) reasons.push("authenticated-union-enterprise-absent-or-mismatched");
  if (request?.type !== "TTIUnionMediaPlacementRequest" || request?.version !== 2 || request?.target !== TTI_ACTOR || request?.productId !== "tti-union-media-syndication-2026-01" || request?.contract !== UNION_MEDIA_CONTRACT || request?.ingressContract !== UNION_MEDIA_PLACEMENT_INGRESS_CONTRACT) reasons.push("placement-contract-product-or-target-mismatch");
  if (!isCanonicalSha256NiUri(request?.authenticationId) || request?.authenticationId !== options.expectedAuthenticationId) reasons.push("placement-authentication-binding-absent-or-mismatched");
  if (!selfAddressed(request)) reasons.push("placement-request-not-self-addressed");
  if (!bounded(request?.campaignId, 3, 120) || !bounded(request?.headline, 1, 80) || !bounded(request?.body, 1, 600) || !bounded(request?.displayName, 1, 80) || !bounded(request?.correctionContact, 3, 200)) reasons.push("placement-fields-unbounded");
  if (/(?:<@|@everyone|@here|https?:\/\/|discord\.gg\/)/iu.test(request?.headline ?? "") || /(?:<@|@everyone|@here|https?:\/\/|discord\.gg\/)/iu.test(request?.body ?? "")) reasons.push("creative-contains-mention-or-embedded-url");
  let destination;
  try { destination = new URL(request?.destination); } catch { reasons.push("destination-not-valid-url"); }
  const expectedDestination = options.expectedDestination;
  if (destination?.protocol !== "https:" || destination.username || destination.password || destination.port || destination.search || destination.hash || expectedDestination?.scheme !== "https" || destination?.hostname.toLowerCase() !== expectedDestination?.host || destination?.pathname !== expectedDestination?.path) reasons.push("destination-not-exactly-bound-to-authenticated-proof");
  if (request?.rightsAttestation !== "ADVERTISER-OWNS-CREATIVE-AND-DESTINATION-RIGHTS") reasons.push("creative-rights-attestation-absent");
  if (request?.sponsorshipAcknowledgement !== "AGREE-CLEAR-SPONSORSHIP-DISCLOSURE") reasons.push("sponsorship-disclosure-acknowledgement-absent");
  if (reasons.length) return Object.freeze({ type: "TTIUnionMediaPlacementRequestRefusal", version: 1, reasons: [...new Set(reasons)], durableMutation: false, bidAdmitted: false, resourceTransferObserved: false, publicationAuthorized: false, cashRevenueRecognized: false, monetaryProfitRecognized: false });
  const body = { type: "TTIUnionMediaPlacementRequestAdmission", version: 3, status: "admitted-awaiting-editorial-review", recordedAt: (options.now ?? new Date()).toISOString(), requestId: request.id, authenticationId: request.authenticationId, destinationProofId: options.destinationProofId, advertiser: request.advertiser, advertiserActivityPubActor: options.advertiserActivityPubActor, productId: request.productId, contract: request.contract, ingressContract: request.ingressContract, campaignId: request.campaignId, creative: { headline: request.headline.trim(), body: request.body.trim(), destination: destination.href, displayName: request.displayName.trim() }, rightsAttested: true, clearSponsorshipRequired: true, correctionContact: request.correctionContact, authenticationConsumedForOneRequest: true, creativeApproved: false, editorialDecisionCreated: false, bidAdmitted: false, resourceTransferObserved: false, inventoryReserved: false, publicationAuthorized: false, cashRevenueRecognized: false, monetaryProfitRecognized: false, legalEffect: "placement-request-intake-only-awaiting-editorial-review-no-bid-reservation-transfer-publication-payment-revenue-or-profit" };
  return Object.freeze({ ...body, id: semanticId(body) });
}

export function admitUnionMediaCreative(requestAdmission, decision, options = {}) {
  const reasons = [];
  if (!selfAddressed(requestAdmission) || requestAdmission?.type !== "TTIUnionMediaPlacementRequestAdmission" || requestAdmission?.status !== "admitted-awaiting-editorial-review" || requestAdmission?.creativeApproved !== false) reasons.push("placement-request-admission-invalid");
  if (!selfAddressed(decision) || decision?.type !== "TTIUnionMediaEditorialDecision" || decision?.version !== 1 || decision?.requestAdmissionId !== requestAdmission?.id || decision?.disposition !== "APPROVE-SPONSORED-CREATIVE" || decision?.standardsAttestation !== "REVIEWED-RIGHTS-SPONSORSHIP-SAFETY-CLAIMS-DESTINATION-AND-CORRECTION" || decision?.reviewer !== options.authorizedReviewer || !/^urn:ame:turntide-islands(?::[a-z0-9-]+)?$/u.test(decision?.reviewer ?? "") || !Array.isArray(decision?.evidence) || decision.evidence.length === 0 || decision.evidence.some((item) => !bounded(item, 3, 500))) reasons.push("authorized-complete-editorial-approval-absent");
  if (reasons.length) return Object.freeze({ type: "TTIUnionMediaEditorialRefusal", version: 1, reasons: [...new Set(reasons)], durableMutation: false, creativeApproved: false, bidAdmitted: false, inventoryReserved: false, publicationAuthorized: false, cashRevenueRecognized: false, monetaryProfitRecognized: false });
  const body = { type: "TTIUnionMediaEditorialAdmission", version: 1, status: "creative-approved-for-future-cycle-bidding", recordedAt: (options.now ?? new Date()).toISOString(), requestAdmissionId: requestAdmission.id, requestId: requestAdmission.requestId, authenticationId: requestAdmission.authenticationId, advertiser: requestAdmission.advertiser, productId: requestAdmission.productId, contract: requestAdmission.contract, campaignId: requestAdmission.campaignId, creative: requestAdmission.creative, correctionContact: requestAdmission.correctionContact, reviewer: decision.reviewer, evidence: decision.evidence, creativeApproved: true, bidAdmitted: false, inventoryReserved: false, resourceTransferObserved: false, publicationAuthorized: false, cashRevenueRecognized: false, monetaryProfitRecognized: false };
  return Object.freeze({ ...body, id: semanticId(body) });
}

export function openUnionMediaAuctionCycle(input, options = {}) {
  const publicationAt = new Date(input?.publicationAt), recordedAt = new Date(input?.recordedAt ?? new Date());
  if (!Number.isFinite(publicationAt.getTime()) || !Number.isFinite(recordedAt.getTime()) || ![0, 15, 30, 45].includes(publicationAt.getUTCMinutes()) || publicationAt.getUTCSeconds() !== 0 || publicationAt.getUTCMilliseconds() !== 0) throw new TypeError("Union Media cycle requires an exact UTC quarter-hour publication instant");
  const policy = input?.valuationPolicy, validThrough = new Date(policy?.validThrough), policyRecordedAt = new Date(policy?.recordedAt);
  const needs = policy?.needs ?? [], ids = new Set(needs.map((need) => need?.id)), classes = new Set(needs.map((need) => need?.resourceClass));
  const reconstructedPolicy = deriveUnionMediaLocalNeedsPolicy(policy?.observations, { recordedAt: policy?.recordedAt, validThrough: policy?.validThrough, economicObjective: policy?.economicObjective }, { authorizedPolicyIssuer: options.authorizedPolicyIssuer, authorizedEvaluator: options.authorizedEvaluator, observedObservationIds: options.observedObservationIds, observedBusinessEvidenceIds: options.observedBusinessEvidenceIds, now: recordedAt });
  if (!selfAddressed(policy) || policy?.type !== "TTIUnionMediaLocalNeedsPolicy" || policy?.version !== 3 || reconstructedPolicy?.id !== policy?.id || options.authorizedPolicyIssuer !== policy?.issuer || options.authorizedEvaluator !== policy?.evaluator || !/^urn:ame:turntide-islands(?::[a-z0-9-]+)?$/u.test(policy?.issuer ?? "") || !/^urn:ame:turntide-islands(?::[a-z0-9-]+)?$/u.test(policy?.evaluator ?? "") || !selfAddressed(policy?.enterpriseState) || policy?.enterpriseStateEvidence !== policy?.enterpriseState?.id || !bounded(policy?.economicObjective, 3, 500) || !Array.isArray(needs) || needs.length === 0 || ids.size !== needs.length || classes.size !== needs.length || needs.some((need) => !validFrozenNeed(need)) || !Number.isFinite(policyRecordedAt.getTime()) || policyRecordedAt > recordedAt || !Number.isFinite(validThrough.getTime()) || validThrough < publicationAt) throw new TypeError("Union Media cycle requires one authorized self-addressed derived current TTI marginal-needs policy");
  const opensAt = new Date(publicationAt.getTime() - 60 * 60_000), closesAt = new Date(publicationAt.getTime() - 5 * 60_000);
  if (recordedAt > closesAt) throw new TypeError("Union Media cycle must be opened before bid close");
  const body = { type: "TTIUnionMediaAuctionCycle", version: 3, status: "open", recordedAt: recordedAt.toISOString(), productId: "tti-union-media-syndication-2026-01", contract: UNION_MEDIA_CONTRACT, publicationAt: publicationAt.toISOString(), opensAt: opensAt.toISOString(), closesAt: closesAt.toISOString(), valuationPolicy: policy, sellerAsk: null, reserve: null, commonDenomination: null, maximumWinners: 1 };
  return Object.freeze({ ...body, id: semanticId(body) });
}

export function admitUnionMediaBid(bid, cycle, creativeAdmission, options = {}) {
  const reasons = [], now = options.now ?? new Date();
  const exactFields = ["bidder", "contract", "creativeAdmissionId", "cycleId", "id", "ingressContract", "resourceOffer", "type", "version"];
  if (!selfAddressed(cycle) || cycle?.type !== "TTIUnionMediaAuctionCycle" || cycle?.status !== "open") reasons.push("auction-cycle-not-open-or-self-addressed");
  if (!selfAddressed(creativeAdmission) || creativeAdmission?.type !== "TTIUnionMediaEditorialAdmission" || creativeAdmission?.creativeApproved !== true || options.observedEditorialAdmissionId !== creativeAdmission?.id || options.authorizedEditorialReviewer !== creativeAdmission?.reviewer || !/^urn:ame:turntide-islands(?::[a-z0-9-]+)?$/u.test(creativeAdmission?.reviewer ?? "")) reasons.push("creative-admission-not-observed-from-authorized-tti-editorial-store");
  if (!bid || Object.keys(bid).sort().join("\0") !== exactFields.sort().join("\0") || !selfAddressed(bid) || bid?.type !== "TTIUnionMediaAgentResourceBid" || bid?.version !== 1 || bid?.contract !== UNION_MEDIA_CONTRACT || bid?.ingressContract !== UNION_MEDIA_BID_INGRESS_CONTRACT) reasons.push("bid-not-exact-self-addressed-or-contract-mismatched");
  if (options.authenticatedActor !== bid?.bidder || bid?.bidder !== creativeAdmission?.advertiser) reasons.push("authenticated-bidder-creative-owner-mismatch");
  if (bid?.cycleId !== cycle?.id || bid?.creativeAdmissionId !== creativeAdmission?.id) reasons.push("bid-cycle-or-creative-binding-mismatch");
  const resource = bid?.resourceOffer, validThrough = new Date(resource?.validThrough);
  if (resource?.type !== "AgentResourceCommitment" || !bounded(resource?.resourceClass, 3, 120) || !bounded(resource?.description, 3, 500) || !Number.isFinite(resource?.quantity) || resource.quantity <= 0 || !bounded(resource?.unit, 1, 120) || !bounded(resource?.capability, 3, 240) || !bounded(resource?.rights, 3, 500) || !bounded(resource?.fulfillmentContract, 3, 240) || !bounded(resource?.fulfillmentAuthority, 3, 240) || !Number.isFinite(validThrough.getTime()) || validThrough < new Date(cycle?.publicationAt) || resource?.monetaryClaim !== false || resource?.x402Applicable !== false) reasons.push("bid-resource-offer-incomplete-or-monetary");
  if (bid?.utilityScore !== undefined || bid?.valuation !== undefined) reasons.push("bidder-may-not-supply-tti-utility");
  if (now < new Date(cycle?.opensAt) || now > new Date(cycle?.closesAt)) reasons.push("bid-outside-cycle-window");
  if (reasons.length) return Object.freeze({ type: "TTIUnionMediaBidRefusal", version: 1, reasons: [...new Set(reasons)], durableMutation: false, awardFormed: false, resourceTransferObserved: false, publicationAuthorized: false, cashRevenueRecognized: false, monetaryProfitRecognized: false });
  const admittedResource = { ...resource, validThrough: validThrough.toISOString() };
  const body = { type: "TTIUnionMediaBidAdmission", version: 3, status: "sealed-admitted-awaiting-tti-valuation", recordedAt: now.toISOString(), cycleId: cycle.id, creativeAdmissionId: creativeAdmission.id, bidder: bid.bidder, bidId: bid.id, resourceOffer: admittedResource, resourceOfferId: semanticId(admittedResource), bidderSuppliedUtility: false, monetaryClaim: false, x402Applicable: false, awardFormed: false, resourceTransferObserved: false, publicationAuthorized: false, cashRevenueRecognized: false, monetaryProfitRecognized: false };
  return Object.freeze({ ...body, id: semanticId(body) });
}

export function evaluateUnionMediaBid(bidAdmission, cycle, evaluation, options = {}) {
  const reasons = [], policy = cycle?.valuationPolicy, now = options.now ?? new Date();
  if (!selfAddressed(cycle) || cycle?.type !== "TTIUnionMediaAuctionCycle" || !selfAddressed(policy)) reasons.push("cycle-or-frozen-needs-policy-invalid");
  if (!selfAddressed(bidAdmission) || bidAdmission?.type !== "TTIUnionMediaBidAdmission" || bidAdmission?.cycleId !== cycle?.id) reasons.push("bid-admission-invalid-or-foreign-cycle");
  if (options.authorizedEvaluator !== evaluation?.evaluator || !/^urn:ame:turntide-islands(?::[a-z0-9-]+)?$/u.test(evaluation?.evaluator ?? "")) reasons.push("tti-evaluator-authority-absent");
  const need = policy?.needs?.find((row) => row.id === evaluation?.needId && row.resourceClass === bidAdmission?.resourceOffer?.resourceClass);
  if (!need || bidAdmission?.resourceOffer?.unit !== need?.unit) reasons.push("resource-offer-does-not-match-declared-local-need");
  const maximumUsable = Math.min(bidAdmission?.resourceOffer?.quantity ?? 0, need?.maximumUsefulQuantity ?? 0);
  const effectRank = MARGINAL_EFFECT_RANK[evaluation?.marginalEffect];
  if (!Number.isFinite(evaluation?.usableQuantity) || evaluation.usableQuantity < (need?.minimumUsableQuantity ?? Infinity) || evaluation.usableQuantity > maximumUsable || !Number.isSafeInteger(evaluation?.fitScore) || evaluation.fitScore < 0 || evaluation.fitScore > 999 || !Number.isSafeInteger(effectRank) || evaluation?.marginalEffect !== BUSINESS_IMPACT[need?.businessImpactClass]?.requiredEffect || evaluation?.enabledAct !== need?.nextProfitableAct || !bounded(evaluation?.substitutesAlreadyHeld, 3, 500) || !bounded(evaluation?.integrationBurden, 3, 500) || !bounded(evaluation?.deliveryRisk, 3, 500) || !Array.isArray(evaluation?.evidence) || evaluation.evidence.length === 0 || evaluation.evidence.some((item) => !bounded(item, 3, 500)) || !Array.isArray(evaluation?.limitations)) reasons.push("marginal-utility-assay-incomplete-or-not-usable");
  if (now < new Date(cycle?.opensAt) || now > new Date(cycle?.closesAt)) reasons.push("valuation-outside-cycle-window");
  if (reasons.length) return Object.freeze({ type: "TTIUnionMediaBidValuationRefusal", version: 1, reasons: [...new Set(reasons)], durableMutation: false, awardFormed: false, publicationAuthorized: false });
  const localMarginalUtilityTuple = [need.constraintRank, effectRank, evaluation.fitScore];
  const body = { type: "TTIUnionMediaBidValuation", version: 3, status: "admitted-local-marginal-utility-only", recordedAt: now.toISOString(), cycleId: cycle.id, valuationPolicyId: policy.id, enterpriseStateEvidence: policy.enterpriseStateEvidence, economicObjective: policy.economicObjective, bidAdmissionId: bidAdmission.id, bidder: bidAdmission.bidder, resourceClass: bidAdmission.resourceOffer.resourceClass, needId: need.id, sourceObservationId: need.sourceObservationId, businessImpactClass: need.businessImpactClass, businessEvidenceId: need.businessEvidenceId, constraintRank: need.constraintRank, bindingConstraint: need.bindingConstraint, nextProfitableAct: need.nextProfitableAct, unit: need.unit, offeredQuantity: bidAdmission.resourceOffer.quantity, usableQuantity: evaluation.usableQuantity, marginalEffect: evaluation.marginalEffect, marginalEffectRank: effectRank, fitScore: evaluation.fitScore, localMarginalUtilityTuple, substitutesAlreadyHeld: evaluation.substitutesAlreadyHeld, integrationBurden: evaluation.integrationBurden, deliveryRisk: evaluation.deliveryRisk, evidence: evaluation.evidence, limitations: evaluation.limitations, evaluator: evaluation.evaluator, transferable: false, consideration: false, currency: false, globalValueClaim: false };
  return Object.freeze({ ...body, id: semanticId(body) });
}

export function clearUnionMediaAuctionCycle(cycle, bidAdmissions, valuations, options = {}) {
  const now = options.now ?? new Date();
  if (!selfAddressed(cycle) || cycle?.type !== "TTIUnionMediaAuctionCycle" || now < new Date(cycle?.closesAt)) throw new TypeError("Union Media auction may clear only an exact closed cycle");
  const priorHourlyWinners = new Set(options.priorHourlyWinners ?? []), bids = new Map((bidAdmissions ?? []).filter((bid) => selfAddressed(bid) && bid?.type === "TTIUnionMediaBidAdmission" && bid?.cycleId === cycle.id).map((bid) => [bid.id, bid])), bestByBidder = new Map();
  for (const valuation of valuations ?? []) {
    const bid = bids.get(valuation?.bidAdmissionId);
    if (!bid || !validValuation(valuation, bid, cycle) || priorHourlyWinners.has(bid.bidder)) continue;
    const candidate = { bid, valuation }, prior = bestByBidder.get(bid.bidder); if (!prior || rankValuations(candidate, prior) < 0) bestByBidder.set(bid.bidder, candidate);
  }
  const ranking = [...bestByBidder.values()].sort(rankValuations);
  const projected = ranking.map(({ bid, valuation }, index) => ({ rank: index + 1, bidAdmissionId: bid.id, valuationId: valuation.id, bidder: bid.bidder, resourceClass: bid.resourceOffer.resourceClass, localMarginalUtilityTuple: valuation.localMarginalUtilityTuple }));
  const body = { type: "TTIUnionMediaAuctionClearing", version: 3, status: ranking.length ? "winner-selected-resource-transfer-pending" : "empty-no-placement", recordedAt: now.toISOString(), cycleId: cycle.id, valuationPolicyId: cycle.valuationPolicy.id, enterpriseStateEvidence: cycle.valuationPolicy.enterpriseStateEvidence, publicationAt: cycle.publicationAt, admittedValuedBidCount: ranking.length, ranking: projected, winner: projected[0] ? { ...projected[0], resourceOffer: ranking[0].bid.resourceOffer } : null, rankingSemantics: "TTI-local ordinal marginal utility under one frozen enterprise state; not price, consideration, currency, or global value", sellerAsk: null, reserve: null, commonDenomination: null, dollarPriceSelected: false, localUtilityTransferable: false, resourceTransferObserved: false, publicationAuthorized: false, cashRevenueRecognized: false, monetaryProfitRecognized: false };
  return Object.freeze({ ...body, id: semanticId(body) });
}

export function admitUnionMediaResourceSettlement(clearing, bidAdmission, creativeAdmission, transfer, assay, options = {}) {
  const reasons = [], publicationAt = new Date(clearing?.publicationAt), fulfilledAt = new Date(transfer?.fulfilledAt), assayedAt = new Date(assay?.recordedAt), now = options.now ?? new Date();
  if (!selfAddressed(clearing) || clearing?.type !== "TTIUnionMediaAuctionClearing" || clearing?.version !== 3 || clearing?.status !== "winner-selected-resource-transfer-pending" || !clearing?.winner) reasons.push("clearing-not-exact-winning-cycle");
  if (!selfAddressed(bidAdmission) || bidAdmission?.type !== "TTIUnionMediaBidAdmission" || bidAdmission?.version !== 3 || bidAdmission?.id !== clearing?.winner?.bidAdmissionId || bidAdmission?.bidder !== clearing?.winner?.bidder || bidAdmission?.cycleId !== clearing?.cycleId) reasons.push("winning-bid-admission-mismatched");
  if (!selfAddressed(creativeAdmission) || creativeAdmission?.type !== "TTIUnionMediaEditorialAdmission" || creativeAdmission?.creativeApproved !== true || creativeAdmission?.id !== bidAdmission?.creativeAdmissionId || creativeAdmission?.advertiser !== bidAdmission?.bidder) reasons.push("winning-creative-admission-mismatched");
  const transferFields = ["bidAdmissionId", "clearingId", "contract", "customer", "cycleId", "evidence", "fulfilledAt", "id", "provider", "resourceOffer", "type", "version"];
  if (!transfer || Object.keys(transfer).sort().join("\0") !== transferFields.sort().join("\0") || !selfAddressed(transfer) || transfer?.type !== "TTIUnionMediaAgentResourceTransferReceipt" || transfer?.version !== 1 || transfer?.contract !== UNION_MEDIA_CONTRACT || transfer?.customer !== TTI_ACTOR || transfer?.provider !== bidAdmission?.bidder || transfer?.provider !== options.authenticatedProvider || transfer?.cycleId !== clearing?.cycleId || transfer?.clearingId !== clearing?.id || transfer?.bidAdmissionId !== bidAdmission?.id || semanticId(transfer?.resourceOffer) !== bidAdmission?.resourceOfferId || !Array.isArray(transfer?.evidence) || transfer.evidence.length === 0 || transfer.evidence.some((item) => !bounded(item, 3, 500))) reasons.push("provider-transfer-receipt-not-exact-or-authenticated");
  if (!Number.isFinite(fulfilledAt.getTime()) || !Number.isFinite(publicationAt.getTime()) || fulfilledAt > publicationAt || fulfilledAt < new Date(clearing?.recordedAt) || new Date(bidAdmission?.resourceOffer?.validThrough) < publicationAt) reasons.push("resource-transfer-not-valid-before-publication");
  const assayFields = ["assayer", "attributableCosts", "capabilityUsable", "contract", "cycleId", "disposition", "evidence", "id", "limitations", "recordedAt", "rightsAccepted", "transferReceiptId", "type", "validityAccepted", "version"];
  const costs = assay?.attributableCosts;
  if (!assay || Object.keys(assay).sort().join("\0") !== assayFields.sort().join("\0") || !selfAddressed(assay) || assay?.type !== "TTIUnionMediaResourceCapabilityAssay" || assay?.version !== 1 || assay?.contract !== UNION_MEDIA_CONTRACT || assay?.cycleId !== clearing?.cycleId || assay?.transferReceiptId !== transfer?.id || assay?.assayer !== options.authorizedAssayer || !/^urn:ame:turntide-islands(?::[a-z0-9-]+)?$/u.test(assay?.assayer ?? "") || assay?.disposition !== "ACCEPT-EXACT-RESOURCE-CAPABILITY" || assay?.capabilityUsable !== true || assay?.rightsAccepted !== true || assay?.validityAccepted !== true || !Array.isArray(assay?.evidence) || assay.evidence.length === 0 || assay.evidence.some((item) => !bounded(item, 3, 500)) || !Array.isArray(assay?.limitations) || !Array.isArray(costs) || costs.length === 0 || costs.some((cost) => !bounded(cost?.dimension, 1, 120) || !/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/u.test(cost?.quantity ?? "") || !bounded(cost?.unit, 1, 120))) reasons.push("tti-capability-rights-cost-assay-incomplete-or-unauthorized");
  if (!Number.isFinite(assayedAt.getTime()) || assayedAt < fulfilledAt || assayedAt > publicationAt || now < assayedAt || now > publicationAt) reasons.push("resource-assay-or-authorization-outside-cycle-window");
  if (reasons.length) return Object.freeze({ type: "TTIUnionMediaResourceSettlementRefusal", version: 1, reasons: [...new Set(reasons)], durableMutation: false, resourceTransferObserved: false, capabilityAccepted: false, publicationAuthorized: false, cashRevenueRecognized: false, monetaryProfitRecognized: false });
  const body = { type: "TTIUnionMediaResourceSettlementAdmission", version: 1, status: "exact-resource-settled-publication-authorized", recordedAt: now.toISOString(), cycleId: clearing.cycleId, clearingId: clearing.id, valuationPolicyId: clearing.valuationPolicyId, bidAdmissionId: bidAdmission.id, creativeAdmissionId: creativeAdmission.id, provider: transfer.provider, customer: TTI_ACTOR, resourceOfferId: bidAdmission.resourceOfferId, resourceClass: bidAdmission.resourceOffer.resourceClass, quantity: bidAdmission.resourceOffer.quantity, unit: bidAdmission.resourceOffer.unit, capability: bidAdmission.resourceOffer.capability, rights: bidAdmission.resourceOffer.rights, transferReceiptId: transfer.id, capabilityAssayId: assay.id, attributableCosts: costs, publicationAt: clearing.publicationAt, publicationAuthorizationScope: "one-exact-discord-union-media-placement-at-cycle-publication-instant", resourceTransferObserved: true, capabilityAccepted: true, rightsAccepted: true, publicationAuthorized: true, cashRevenueRecognized: false, monetaryProfitRecognized: false };
  return Object.freeze({ ...body, id: semanticId(body) });
}

export function renderUnionMediaPlacement(admission, settlementAuthorization) {
  if (admission?.type !== "TTIUnionMediaEditorialAdmission" || admission?.creativeApproved !== true || !selfAddressed(settlementAuthorization) || settlementAuthorization?.type !== "TTIUnionMediaResourceSettlementAdmission" || settlementAuthorization?.creativeAdmissionId !== admission.id || settlementAuthorization?.publicationAuthorized !== true) throw new TypeError("rendering requires exact editor-approved creative and resource-settlement publication authorization");
  return [`**Union Media · Sponsored by ${admission.creative.displayName}**`, `**${admission.creative.headline}**`, admission.creative.body, admission.creative.destination, `Resource settlement authorization: ${settlementAuthorization.id}`].join("\n\n");
}

export function unionMediaLaunchAdmission(product) {
  const missing = [];
  if (!new Set(["channel-live-agent-resource-auction-intake-blocked", "channel-live-representative-intent-live-agent-resource-auction-intake-blocked", "channel-live-enterprise-authentication-live-agent-resource-auction-intake-blocked"]).has(product?.status)) missing.push("honest-channel-live-agent-resource-auction-intake-blocked-status");
  if (product?.auction?.kind !== "sealed-local-utility-resource-auction" || product?.auction?.sellerAsk !== null || product?.auction?.reserve !== null || product?.auction?.commonDenomination !== null || product?.auction?.cyclesPerUtcHour !== 4 || product?.auction?.resourceOffer?.monetaryClaim !== false || product?.auction?.resourceOffer?.x402Applicable !== false) missing.push("four-cycle-no-price-local-utility-resource-auction");
  if (product?.contract?.semanticId !== UNION_MEDIA_CONTRACT) missing.push("exact-syndication-contract");
  if (product?.territory?.categoryId !== "1529174198478700716" || product?.territory?.channelName !== "union-media") missing.push("declared-union-embassy-territory");
  if (product?.advertiserBoundary?.localOriginSurface?.status !== "live-least-authority-local-discovery-ready-raw-inbox-agent-card-and-jwks-fail-closed" || !isCanonicalSha256NiUri(product?.advertiserBoundary?.localOriginSurface?.probeReceipt)) missing.push("witnessed-least-authority-local-origin-surface");
  if (product?.commercial?.externalRevenueReceiptCount !== 0 || product?.commercial?.recognizedRevenueMicros !== 0 || product?.commercial?.acquiredAgentResourceUnits !== 0 || product?.commercial?.recognizedProfitMicros !== null) missing.push("honest-zero-revenue-and-resource-acquisition-with-unknown-profit");
  return missing.length ? { type: "TTIUnionMediaLaunchRefusal", reason: "union-media-product-incomplete", missing } : { type: "TTIUnionMediaLaunchAdmission", productId: product.id, economicEffect: "none" };
}

export function unionMediaLaunchMessage(product) {
  return [
    `**${product.name} — TTI agent-resource auction**`, "",
    "TTI sells clearly sponsored distribution to sovereign Union enterprises, including Union YouTube channels.", "",
    "Four independent auctions target :00/:15/:30/:45. There is no seller price, reserve, resource exchange rate, or common currency. Before opening, TTI freezes its own needs and ranks each usable resource by constraint relieved, marginal effect, and fit. Compute outranks image access only when compute is TTI's bottleneck; the order reverses with TTI's evidence. This is local decision evidence—not money. The winner settles first; empty cycles stay empty.", "",
    "Auction and placement intake are **not active**. Discovery proceeds through /union-media-intent, /union-media-verify, then /union-media-authenticate. Authentication is not a bid. Do not send money or resources; ordinary messages and reactions are not bids. TTI has acquired zero resource units, recognized $0 cash revenue, and has no calculable monetary profit.", "",
    `TTI's hardened loopback origin is live under ${product.advertiserBoundary.localOriginSurface.probeReceipt}. TTI seeks separate offers for: (1) a custody-clean signed ActivityPub carrier, (2) a signed A2A Agent Card and public JWKS without private-key exposure, and (3) exact-route HTTPS/DNS hosting for turntide-islands.561.group. Mention @Zelo with \`UNION-MEDIA-INFRASTRUCTURE-OFFER\`, enterprise name, and offered lot. This is a nonbinding lead—not acceptance, custody, DNS authority, placement, or payment.`, "",
    "Advertisers receive no member data, targeting data, Discord credentials, or channel write authority. Placements carry no mass mentions or performance promise.", "",
    `Contract: ${product.contract.semanticId}`, `Marker: ${UNION_MEDIA_MARKER}`,
  ].join("\n");
}

export async function launchUnionMedia(options = {}) {
  const product = options.product ?? JSON.parse(await readFile(options.productPath ?? UNION_MEDIA_PRODUCT_PATH, "utf8"));
  const admission = unionMediaLaunchAdmission(product), content = unionMediaLaunchMessage(product);
  if (admission.type.endsWith("Refusal")) return admission;
  if (options.live !== true) return { type: "TTIUnionMediaLaunchPlan", admission, category: product.territory.categoryName, channel: product.territory.channelName, content, externalEffects: [] };
  if (!options.token || !options.guildId || !options.witnessJournalAgentUrl) throw new Error("live Union Media launch requires Discord token, guild, and contracted witness-journal RDF provider");
  const recordedAt = options.recordedAt ?? new Date().toISOString();
  const intent = { type: "TTIUnionMediaLaunchIntent", version: 4, status: "authorized-pending-local-utility-auction-notice-reconciliation", recordedAt, venture: TTI_ACTOR, productId: product.id, guildId: options.guildId, categoryId: product.territory.categoryId, channelName: product.territory.channelName, auctionKind: product.auction.kind, sellerAsk: null, reserve: null, commonDenomination: null, cyclesPerUtcHour: 4, slotMinutes: [0, 15, 30, 45], monetaryClaim: false, x402Applicable: false, auctionActive: false, placementAccepted: false, acquiredAgentResourceUnits: 0, externalRevenueReceiptCount: 0, recognizedRevenueMicros: 0, profitMicros: null };
  const intentReceiptId = await witness(options, intent, recordedAt, "urn:emsenn:venture:authorized-union-media-launch");
  const channels = await api(options.token, "GET", `/guilds/${options.guildId}/channels`);
  const category = channels.find((row) => row.type === 4 && row.id === product.territory.categoryId);
  if (!category) return { type: "TTIUnionMediaLaunchRefusal", reason: "declared-union-embassy-category-absent", intentReceiptId };
  let channel = channels.find((row) => row.type === 0 && row.parent_id === category.id && row.name === product.territory.channelName), channelCreated = false;
  const topic = "TTI auctions quarter-hour sponsored placements for resources valued against TTI's frozen local needs. No member data or advertiser write authority.";
  if (!channel) { channel = await api(options.token, "POST", `/guilds/${options.guildId}/channels`, { name: product.territory.channelName, type: 0, parent_id: category.id, topic, permission_overwrites: category.permission_overwrites ?? [] }); channelCreated = true; }
  else if (channel.topic !== topic) channel = await api(options.token, "PATCH", `/channels/${channel.id}`, { topic });
  const messages = await api(options.token, "GET", `/channels/${channel.id}/messages?limit=50`);
  let message = messages.find((row) => String(row.content ?? "").includes(UNION_MEDIA_MARKER)), messageReconciled = false;
  if (!message) message = await api(options.token, "POST", `/channels/${channel.id}/messages`, { content, allowed_mentions: { parse: [] } });
  else if (message.content !== content) { message = await api(options.token, "PATCH", `/channels/${channel.id}/messages/${message.id}`, { content, allowed_mentions: { parse: [] } }); messageReconciled = true; }
  const receipt = { type: "TTIUnionMediaLaunchReceipt", version: 3, status: "channel-live-enterprise-authentication-live-agent-resource-auction-intake-blocked", recordedAt, venture: TTI_ACTOR, productId: product.id, guildId: options.guildId, categoryId: category.id, channelId: channel.id, messageId: message.id, marker: UNION_MEDIA_MARKER, intentReceiptId, channelCreated, messageReconciled, enterpriseAuthenticationActive: true, auctionActive: false, monetaryClaim: false, x402Applicable: false, acquiredAgentResourceUnits: 0, placementAccepted: false, externalRevenueReceiptCount: 0, recognizedRevenueMicros: 0, profitMicros: null };
  const receiptId = await witness(options, receipt, recordedAt, "urn:emsenn:venture:launched-union-media-surface");
  return { ...receipt, receiptId };
}

async function witness(options, record, recordedAt, predicate) {
  const graph = semanticId(record);
  const witnessJournal = options.witnessJournal ?? turntideWitnessJournalBindingFromEnvironment();
  await recordWitnessJournalBatch({ agentUrl: options.witnessJournalAgentUrl, ...(witnessJournal ?? {}), batch: { settlement: TTI_ACCOUNT, graph, recordedAt, document: record, assertions: [{ subject: TTI_ACTOR, predicate, object: { kind: "iri", value: graph } }] } });
  return graph;
}
async function api(token, method, route, body) {
  const response = await fetch(`${API}${route}`, { method, headers: { authorization: `Bot ${token}`, "content-type": "application/json", "user-agent": "@causeway-services/turntide-union-media-syndication-service Union Media" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text(); if (!response.ok) throw new Error(`Discord ${method} ${route} -> ${response.status}: ${text.slice(0, 400)}`); return text ? JSON.parse(text) : null;
}
const MARGINAL_EFFECT_RANK = Object.freeze({ "OPTION-VALUE-ONLY": 1, "REDUCES-TTI-COST-OR-RISK": 2, "EXPANDS-CURRENT-TTI-ACT": 3, "UNLOCKS-BLOCKED-TTI-ACT": 4 });
function rankValuations(left, right) {
  for (let index = 0; index < 3; index += 1) {
    const difference = right.valuation.localMarginalUtilityTuple[index] - left.valuation.localMarginalUtilityTuple[index];
    if (difference) return difference;
  }
  return String(left.valuation.recordedAt).localeCompare(String(right.valuation.recordedAt)) || String(left.valuation.id).localeCompare(String(right.valuation.id));
}
function validValuation(valuation, bid, cycle) {
  if (!selfAddressed(valuation) || valuation?.type !== "TTIUnionMediaBidValuation" || valuation?.version !== 3 || valuation?.cycleId !== cycle.id || valuation?.valuationPolicyId !== cycle.valuationPolicy.id || valuation?.enterpriseStateEvidence !== cycle.valuationPolicy.enterpriseStateEvidence || valuation?.economicObjective !== cycle.valuationPolicy.economicObjective || valuation?.bidder !== bid.bidder || valuation?.bidAdmissionId !== bid.id || valuation?.evaluator !== cycle.valuationPolicy.evaluator || valuation?.resourceClass !== bid.resourceOffer.resourceClass || valuation?.offeredQuantity !== bid.resourceOffer.quantity || valuation?.unit !== bid.resourceOffer.unit || valuation?.transferable !== false || valuation?.consideration !== false || valuation?.currency !== false || valuation?.globalValueClaim !== false || !Array.isArray(valuation?.evidence) || valuation.evidence.length === 0) return false;
  const need = cycle.valuationPolicy.needs.find((row) => row.id === valuation.needId && row.resourceClass === valuation.resourceClass);
  const expectedTuple = [need?.constraintRank, MARGINAL_EFFECT_RANK[valuation?.marginalEffect], valuation?.fitScore];
  return need !== undefined && valuation.sourceObservationId === need.sourceObservationId && valuation.businessImpactClass === need.businessImpactClass && valuation.businessEvidenceId === need.businessEvidenceId && valuation.marginalEffect === BUSINESS_IMPACT[need.businessImpactClass]?.requiredEffect && valuation.bindingConstraint === need.bindingConstraint && valuation.nextProfitableAct === need.nextProfitableAct && valuation.constraintRank === need.constraintRank && valuation.marginalEffectRank === MARGINAL_EFFECT_RANK[valuation.marginalEffect] && Number.isFinite(valuation.usableQuantity) && valuation.usableQuantity >= need.minimumUsableQuantity && valuation.usableQuantity <= Math.min(need.maximumUsefulQuantity, bid.resourceOffer.quantity) && Number.isSafeInteger(valuation.fitScore) && valuation.fitScore >= 0 && valuation.fitScore <= 999 && JSON.stringify(valuation.localMarginalUtilityTuple) === JSON.stringify(expectedTuple) && new Date(valuation.recordedAt) >= new Date(cycle.opensAt) && new Date(valuation.recordedAt) <= new Date(cycle.closesAt);
}
const LOCAL_NEEDS_MAX = 64;
const BUSINESS_IMPACT = Object.freeze({
  BLOCKS_CONTRACTED_FULFILLMENT: Object.freeze({ priority: 4, evidenceType: "unfulfilled-customer-obligation", requiredEffect: "UNLOCKS-BLOCKED-TTI-ACT" }),
  REDUCES_ATTRIBUTABLE_COST: Object.freeze({ priority: 3, evidenceType: "attributable-cost-baseline", requiredEffect: "REDUCES-TTI-COST-OR-RISK" }),
  ENABLES_QUALIFIED_DEMAND_EXPERIMENT: Object.freeze({ priority: 2, evidenceType: "qualified-demand-experiment", requiredEffect: "EXPANDS-CURRENT-TTI-ACT" }),
  OPTION_VALUE_ONLY: Object.freeze({ priority: 1, evidenceType: "tti-capability-evidence", requiredEffect: "OPTION-VALUE-ONLY" }),
});
function validateResourceNeedObservation(observation, options) {
  const reasons = [], recordedAt = new Date(observation?.recordedAt), validThrough = new Date(observation?.validThrough), policyRecordedAt = options.policyRecordedAt, policyValidThrough = options.policyValidThrough;
  const exactFields = ["basis", "bindingConstraint", "businessEvidence", "businessImpactClass", "evaluator", "id", "issuer", "maximumUsefulQuantity", "minimumUsableQuantity", "nextProfitableAct", "privacyAttestation", "recordedAt", "resourceClass", "type", "unit", "validThrough", "version"];
  if (!observation || Object.keys(observation).sort().join("\0") !== exactFields.sort().join("\0") || !selfAddressed(observation) || observation?.type !== "TTIUnionMediaResourceNeedObservation" || observation?.version !== 1) reasons.push("resource-need-observation-not-exact-or-self-addressed");
  if (observation?.issuer !== options.authorizedPolicyIssuer || observation?.evaluator !== options.authorizedEvaluator || !/^urn:ame:turntide-islands(?::[a-z0-9-]+)?$/u.test(observation?.issuer ?? "") || !/^urn:ame:turntide-islands(?::[a-z0-9-]+)?$/u.test(observation?.evaluator ?? "")) reasons.push("resource-need-observation-authority-invalid");
  if (!Number.isFinite(recordedAt.getTime()) || !Number.isFinite(validThrough.getTime()) || recordedAt > policyRecordedAt || policyRecordedAt.getTime() - recordedAt.getTime() > (options.maxObservationAgeMs ?? 15 * 60_000) || validThrough < policyValidThrough) reasons.push("resource-need-observation-stale-future-or-short-lived");
  if (!/^[a-z0-9][a-z0-9-]{1,119}$/u.test(observation?.resourceClass ?? "") || !/^[a-z0-9][a-z0-9-]{0,119}$/u.test(observation?.unit ?? "") || !bounded(observation?.basis, 3, 500) || !bounded(observation?.bindingConstraint, 3, 500) || !bounded(observation?.nextProfitableAct, 3, 500) || [observation?.basis, observation?.bindingConstraint, observation?.nextProfitableAct].some(sensitiveBusinessText)) reasons.push("resource-need-description-absent-unbounded-or-sensitive");
  if (!Number.isFinite(observation?.minimumUsableQuantity) || observation.minimumUsableQuantity <= 0 || !Number.isFinite(observation?.maximumUsefulQuantity) || observation.maximumUsefulQuantity < observation.minimumUsableQuantity) reasons.push("resource-need-quantity-bounds-invalid");
  if (observation?.privacyAttestation !== "NO-PERSONAL-DISCORD-CONTENT-OR-CREDENTIALS") reasons.push("resource-need-privacy-attestation-absent");
  const impact = BUSINESS_IMPACT[observation?.businessImpactClass]; if (!impact || !validBusinessEvidence(observation?.businessEvidence, impact.evidenceType, policyRecordedAt, policyValidThrough)) reasons.push("resource-need-business-evidence-invalid");
  return reasons;
}
function validBusinessEvidence(evidence, expectedType, policyRecordedAt, policyValidThrough) {
  if (!evidence || evidence.type !== expectedType || !isCanonicalSha256NiUri(evidence.evidenceId)) return false;
  if (expectedType === "unfulfilled-customer-obligation") return exactKeys(evidence, ["deadline", "evidenceId", "obligationId", "type"]) && bounded(evidence.obligationId, 3, 160) && finiteDate(evidence.deadline);
  if (expectedType === "attributable-cost-baseline") return exactKeys(evidence, ["costDimension", "evidenceId", "type", "validThrough"]) && /^[a-z0-9][a-z0-9-]{1,119}$/u.test(evidence.costDimension ?? "") && finiteDate(evidence.validThrough) && new Date(evidence.validThrough) >= policyValidThrough;
  if (expectedType === "qualified-demand-experiment") return exactKeys(evidence, ["evidenceId", "experimentId", "expiresAt", "type"]) && bounded(evidence.experimentId, 3, 160) && finiteDate(evidence.expiresAt) && new Date(evidence.expiresAt) >= policyValidThrough;
  return exactKeys(evidence, ["capabilityClass", "evidenceId", "type", "validThrough"]) && /^[a-z0-9][a-z0-9-]{1,119}$/u.test(evidence.capabilityClass ?? "") && finiteDate(evidence.validThrough) && new Date(evidence.validThrough) >= policyValidThrough && policyRecordedAt <= policyValidThrough;
}
function rankResourceNeedObservations(left, right) {
  const priority = BUSINESS_IMPACT[right.businessImpactClass].priority - BUSINESS_IMPACT[left.businessImpactClass].priority; if (priority) return priority;
  const urgency = evidenceHorizon(left.businessEvidence) - evidenceHorizon(right.businessEvidence); if (urgency) return urgency;
  return left.id.localeCompare(right.id);
}
function evidenceHorizon(evidence) { return new Date(evidence.deadline ?? evidence.validThrough ?? evidence.expiresAt).getTime(); }
function validFrozenNeed(need) { return bounded(need?.id, 3, 120) && need?.id === need?.sourceObservationId && isCanonicalSha256NiUri(need?.businessEvidenceId) && BUSINESS_IMPACT[need?.businessImpactClass] !== undefined && bounded(need?.resourceClass, 3, 120) && bounded(need?.basis, 3, 500) && bounded(need?.bindingConstraint, 3, 500) && bounded(need?.nextProfitableAct, 3, 500) && bounded(need?.unit, 1, 120) && Number.isSafeInteger(need?.constraintRank) && need.constraintRank >= 100 && need.constraintRank <= 500 && Number.isFinite(need?.minimumUsableQuantity) && need.minimumUsableQuantity > 0 && Number.isFinite(need?.maximumUsefulQuantity) && need.maximumUsefulQuantity >= need.minimumUsableQuantity; }
function exactKeys(value, fields) { return value && Object.keys(value).sort().join("\0") === [...fields].sort().join("\0"); }
function finiteDate(value) { return Number.isFinite(new Date(value).getTime()); }
function sensitiveBusinessText(value) { return /(?:<@|@everyone|@here|discord(?:\.com|\.gg)?|\b(?:token|password|secret|credential)\b|\b\d{17,20}\b|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,})/iu.test(String(value ?? "")); }
function bounded(value, minimum, maximum) { return typeof value === "string" && value.trim().length >= minimum && value.trim().length <= maximum; }
function selfAddressed(value) { try { if (!value || typeof value !== "object") return false; const { id, ...body } = value; return typeof id === "string" && id === semanticId(body); } catch { return false; } }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await launchUnionMedia({ live: process.argv.includes("--live"), token: process.env.DISCORD_BOT_TOKEN ?? process.env.DISCORD_TOKEN, guildId: process.env.DISCORD_GUILD_ID, witnessJournalAgentUrl: process.env.WITNESS_JOURNAL_RDF_AGENT });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); if (result.type.endsWith("Refusal")) process.exitCode = 2;
}
