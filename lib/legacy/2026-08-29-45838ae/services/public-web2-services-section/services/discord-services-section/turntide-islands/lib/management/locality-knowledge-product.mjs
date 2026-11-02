import { EMPTY_WITNESS_ROOT, identifyJsonSemanticContent } from "@red-cup-engineering/semantic-content-identify-service";
const semanticId = (value) => identifyJsonSemanticContent({ objectKind: "turntide-islands.record", value, witnessRoot: EMPTY_WITNESS_ROOT }).token;

export const LOCALITY_KNOWLEDGE_PRODUCT_ID = "tti-locality-knowledge-answer-2026-01";
export const LOCALITY_KNOWLEDGE_CONTRACT = "ni:///sha-256;24VLnw0orCLXDgjUgtuG9PM8y_VldOrBkb4ileAzscI";
export const LOCALITY_KNOWLEDGE_PRICE_MICROS = 10_000_000;
const ALLOWED_USES = new Set(["local-practice-research", "union-decision-support", "institutional-memory"]);
const PROHIBITED_QUERY_KEYS = new Set(["discordUserId", "discordMessageId", "messageContent", "buyerEmail", "preciseHomeLocation", "credentials", "secret", "token"]);

export function admitLocalityKnowledgeBuyerQuery(input, options = {}) {
  const reasons = [];
  if (input?.sourceProtocol !== "tti-direct-buyer-query-v1") reasons.push("buyer-query-not-direct-tti-boundary");
  if (!/^urn:ame:[a-z0-9][a-z0-9-]{1,100}$/u.test(input?.buyerSettlement ?? "")) reasons.push("buyer-settlement-invalid");
  if (!boundedText(input?.question, 20, 500)) reasons.push("bounded-question-absent");
  if (!boundedText(input?.subject, 3, 120)) reasons.push("bounded-subject-absent");
  if (!boundedText(input?.geographicContext, 2, 120)) reasons.push("bounded-geographic-context-absent");
  if (input?.temporalContext !== undefined && input.temporalContext !== null && !boundedText(input.temporalContext, 2, 120)) reasons.push("temporal-context-invalid");
  if (!ALLOWED_USES.has(input?.intendedUse)) reasons.push("buyer-intended-use-not-supported");
  if (input?.noPersonalDataAttested !== true) reasons.push("buyer-personal-data-exclusion-not-attested");
  if (input?.buyerTermsAcknowledged !== true) reasons.push("buyer-query-terms-not-acknowledged");
  if (!Number.isFinite(Date.parse(input?.requestedAt))) reasons.push("buyer-query-instant-invalid");
  if (input?.budget?.currency !== "USD" || !Number.isSafeInteger(input?.budget?.maximumMicros) || input.budget.maximumMicros < 0) reasons.push("buyer-budget-invalid");
  if (containsProhibitedKey(input)) reasons.push("buyer-query-contains-prohibited-discord-personal-or-secret-field");
  if ((input?.sensitiveClasses ?? []).length > 0) reasons.push("sensitive-buyer-query-refused");
  if (reasons.length > 0) return refusal("buyer-query", reasons);
  const body = {
    type: "TTILocalityKnowledgeBuyerQuery", version: 1, productId: LOCALITY_KNOWLEDGE_PRODUCT_ID,
    sourceProtocol: input.sourceProtocol, buyerSettlement: input.buyerSettlement, question: input.question.trim(), subject: input.subject.trim(), geographicContext: input.geographicContext.trim(), temporalContext: input.temporalContext?.trim() || null,
    matchingKey: { subject: normalize(input.subject), geographicContext: normalize(input.geographicContext), temporalContext: input.temporalContext ? normalize(input.temporalContext) : null },
    intendedUse: input.intendedUse, budget: { currency: "USD", maximumMicros: input.budget.maximumMicros }, requestedAt: input.requestedAt,
    simulation: options.simulationMode === true, personalDataIncluded: false, discordContentImported: false,
    legalEffect: "buyer-demand-only-no-offer-sale-payment-entitlement-revenue-or-profit",
  };
  return withId(body);
}

export function matchLocalityKnowledgeContributions({ query, contributions, recordedAt, simulationMode = false }) {
  if (!selfAddressed(query) || query.type !== "TTILocalityKnowledgeBuyerQuery" || query.simulation !== simulationMode) return refusal("matching", ["admitted-buyer-query-absent-or-mode-mismatch"]);
  const eligible = [];
  for (const contribution of contributions ?? []) {
    if (!selfAddressed(contribution) || contribution.type !== "TTIKnowledgeContribution" || contribution.status !== "active" || contribution.license?.resaleAllowed !== true) continue;
    if (normalize(contribution.subject) !== query.matchingKey.subject || normalize(contribution.geographicContext) !== query.matchingKey.geographicContext) continue;
    if (query.matchingKey.temporalContext !== null && normalize(contribution.temporalContext ?? "") !== query.matchingKey.temporalContext) continue;
    eligible.push(contribution);
  }
  const unique = [...new Map(eligible.map((contribution) => [contribution.id, contribution])).values()].sort((left, right) => left.id.localeCompare(right.id));
  if (unique.length === 0) return refusal("matching", ["no-active-resale-contribution-matches-bounded-context"]);
  const body = {
    type: "TTILocalityKnowledgeMatchReceipt", version: 1, productId: LOCALITY_KNOWLEDGE_PRODUCT_ID, queryId: query.id, buyerSettlement: query.buyerSettlement, recordedAt, simulation: simulationMode,
    policy: "exact-normalized-subject-geography-and-optional-temporal-v1", candidateContributionIds: unique.map((contribution) => contribution.id),
    licenseProjection: unique.map((contribution) => ({ contributionId: contribution.id, scope: contribution.license.scope, resaleAllowed: true, attribution: contribution.license.attribution === "pseudonymous" ? "pseudonymous" : "contributor-selected-public-attribution" })),
    rightsCompatibleCount: unique.length, humanAttributionReviewRequired: true, knowledgeDisclosedToBuyer: false, contributorIdentityDisclosed: false,
    legalEffect: "candidate-match-only-no-offer-sale-payment-entitlement-revenue-or-profit",
  };
  return withId(body);
}

export function admitKnowledgeAttributionReview(input, { query, match, simulationMode = false } = {}) {
  const reasons = [];
  if (!selfAddressed(query) || !selfAddressed(match) || match.queryId !== query.id || query.simulation !== simulationMode || match.simulation !== simulationMode) reasons.push("query-match-binding-invalid");
  if (input?.type !== "TTIKnowledgeAttributionReview" || input?.version !== 1 || input?.status !== "approved" || input?.humanReviewed !== true) reasons.push("human-approved-review-absent");
  if (!/^urn:tti:office:[a-z0-9][a-z0-9-]{1,100}$/u.test(input?.reviewerAuthority ?? "")) reasons.push("tti-reviewer-authority-invalid");
  if (!Number.isFinite(Date.parse(input?.reviewedAt))) reasons.push("review-instant-invalid");
  if (input?.queryId !== query?.id || input?.matchId !== match?.id || input?.simulation !== simulationMode) reasons.push("review-binding-or-mode-mismatch");
  const weights = Array.isArray(input?.weights) ? input.weights : [];
  const candidateIds = match?.candidateContributionIds ?? [], weightIds = weights.map((row) => row?.contributionId);
  if (weights.length !== candidateIds.length || new Set(weightIds).size !== weightIds.length || [...weightIds].sort().join("|") !== [...candidateIds].sort().join("|")) reasons.push("review-must-weight-every-matched-contribution-once");
  if (weights.some((row) => !Number.isSafeInteger(row?.weightPpm) || row.weightPpm <= 0 || !boundedText(row?.rationale, 20, 500)) || weights.reduce((sum, row) => sum + (row?.weightPpm ?? 0), 0) !== 1_000_000) reasons.push("human-reviewed-weights-must-be-positive-rationalized-and-total-one-million-ppm");
  if (reasons.length > 0) return refusal("attribution-review", reasons);
  const body = { type: input.type, version: 1, status: "approved", humanReviewed: true, reviewerAuthority: input.reviewerAuthority, queryId: query.id, matchId: match.id, reviewedAt: input.reviewedAt, simulation: simulationMode, weights: weights.map((row) => ({ contributionId: row.contributionId, weightPpm: row.weightPpm, rationale: row.rationale.trim() })), legalEffect: "tti-attribution-judgment-only-no-offer-sale-payment-credit-revenue-or-profit" };
  return withId(body);
}

export function freezeLocalityKnowledgeOffer({ query, match, review, contributions, recordedAt, expiresAt, simulationMode = false }) {
  const reasons = [];
  if (!selfAddressed(query) || !selfAddressed(match) || !selfAddressed(review) || match.queryId !== query.id || review.queryId !== query.id || review.matchId !== match.id) reasons.push("query-match-review-binding-invalid");
  if (query?.simulation !== simulationMode || match?.simulation !== simulationMode || review?.simulation !== simulationMode || review?.status !== "approved" || review?.humanReviewed !== true) reasons.push("offer-mode-or-human-review-invalid");
  const contributionMap = new Map((contributions ?? []).map((contribution) => [contribution.id, contribution]));
  const frozenIds = match?.candidateContributionIds ?? [], reviewIds = review?.weights?.map((row) => row.contributionId) ?? [];
  if (frozenIds.length === 0 || new Set(frozenIds).size !== frozenIds.length || [...frozenIds].sort().join("|") !== [...reviewIds].sort().join("|")) reasons.push("frozen-contribution-and-weight-set-mismatch");
  const frozen = frozenIds.map((id) => contributionMap.get(id));
  if (frozen.some((contribution) => !selfAddressed(contribution) || contribution.status !== "active" || contribution.license?.resaleAllowed !== true)) reasons.push("active-self-addressed-resale-contribution-absent");
  if (query?.budget?.currency !== "USD" || query.budget.maximumMicros < LOCALITY_KNOWLEDGE_PRICE_MICROS) reasons.push("buyer-budget-below-fixed-price");
  const start = Date.parse(recordedAt), end = Date.parse(expiresAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 7 * 24 * 60 * 60 * 1000) reasons.push("offer-validity-window-invalid");
  if (reasons.length > 0) return refusal("offer", reasons);
  const weights = review.weights.map(({ contributionId, weightPpm }) => ({ contributionId, weightPpm }));
  const body = {
    type: "TTILocalityKnowledgeProductOffer", version: 1, productId: LOCALITY_KNOWLEDGE_PRODUCT_ID, contract: LOCALITY_KNOWLEDGE_CONTRACT, seller: "urn:ame:turntide-islands", buyerSettlement: query.buyerSettlement,
    query: { id: query.id, question: query.question, subject: query.subject, geographicContext: query.geographicContext, temporalContext: query.temporalContext, intendedUse: query.intendedUse }, matchReceiptId: match.id, attributionReviewId: review.id,
    price: { currency: "USD", unitAmountMicros: LOCALITY_KNOWLEDGE_PRICE_MICROS, quantity: 1, status: "fixed-offer-not-payment" },
    frozenContributions: frozen.map((contribution) => ({ contributionId: contribution.id, licenseScope: contribution.license.scope, attribution: contribution.license.attribution === "pseudonymous" ? "pseudonymous" : contribution.license.attribution })),
    attributionWeights: weights, deliveryPromise: { artifact: "one-source-traceable-locality-knowledge-answer", maximumWords: 1500, correctionWindow: "P30D", buyerLicense: "internal-union-research-and-decision-support-no-resale-training-or-open-publication" },
    recordedAt, expiresAt, simulation: simulationMode, saleFormed: false, paymentObserved: false, entitlementCreated: false, revenueRecognized: false, profitRecognized: false,
  };
  return withId(body);
}

export function prepareLocalityKnowledgeFulfillment({ offer, sale, contributions, answer, citedContributionIds, recordedAt, simulationMode = false }) {
  const reasons = [];
  if (!selfAddressed(offer) || offer.type !== "TTILocalityKnowledgeProductOffer" || offer.simulation !== simulationMode) reasons.push("frozen-product-offer-absent-or-mode-mismatch");
  if (sale?.type !== "TTIKnowledgeSaleReceipt" || sale.status !== "settled" || sale.simulation !== simulationMode || sale.offerId !== offer?.id || sale.productId !== LOCALITY_KNOWLEDGE_PRODUCT_ID || sale.buyerSettlement !== offer?.buyerSettlement) reasons.push("settled-offer-bound-sale-receipt-absent");
  const frozenIds = offer?.frozenContributions?.map((row) => row.contributionId) ?? [], citedIds = citedContributionIds ?? [];
  if (citedIds.length !== frozenIds.length || new Set(citedIds).size !== citedIds.length || [...citedIds].sort().join("|") !== [...frozenIds].sort().join("|")) reasons.push("fulfillment-provenance-must-cite-every-frozen-contribution-once");
  const contributionMap = new Map((contributions ?? []).map((contribution) => [contribution.id, contribution]));
  if (frozenIds.some((id) => !selfAddressed(contributionMap.get(id)) || contributionMap.get(id).license?.resaleAllowed !== true)) reasons.push("fulfillment-contribution-rights-unavailable");
  if (!boundedText(answer, 80, 10_000) || answer.trim().split(/\s+/u).length > 1500) reasons.push("bounded-fulfillment-answer-invalid");
  if (reasons.length > 0) return refusal("fulfillment", reasons);
  const body = {
    type: "TTILocalityKnowledgeFulfillmentPackage", version: 1, productId: LOCALITY_KNOWLEDGE_PRODUCT_ID, offerId: offer.id, saleReceiptId: sale.id, buyerSettlement: offer.buyerSettlement, answer: answer.trim(),
    provenance: offer.frozenContributions.map((row) => ({ contributionId: row.contributionId, licenseScope: row.licenseScope, attribution: row.attribution, correctionStatus: "active-at-preparation" })),
    buyerLicense: offer.deliveryPromise.buyerLicense, correctionWindow: offer.deliveryPromise.correctionWindow, recordedAt, simulation: simulationMode,
    deliveryStatus: simulationMode ? "synthetic-nonposting" : "prepared-awaiting-authenticated-buyer-delivery", buyerDeliveryPosted: false, fulfillmentRecognized: false, revenueRecognized: false, profitRecognized: false,
  };
  return withId(body);
}

function refusal(stage, reasons) { return { type: "TTILocalityKnowledgeProductRefusal", stage, reasons: [...new Set(reasons)], saleFormed: false, paymentObserved: false, revenueRecognized: false, profitRecognized: false }; }
function withId(body) { return Object.freeze({ ...body, id: semanticId(body) }); }
function selfAddressed(value) { if (value === null || typeof value !== "object" || Array.isArray(value) || typeof value.id !== "string") return false; const { id, ...body } = value; return id === semanticId(body); }
function normalize(value) { return typeof value === "string" ? value.normalize("NFKC").trim().toLocaleLowerCase("en-US").replace(/\s+/gu, " ") : ""; }
function boundedText(value, minimum, maximum) { return typeof value === "string" && value.trim().length >= minimum && value.trim().length <= maximum; }
function containsProhibitedKey(value) { if (Array.isArray(value)) return value.some(containsProhibitedKey); if (value === null || typeof value !== "object") return false; return Object.entries(value).some(([key, child]) => PROHIBITED_QUERY_KEYS.has(key) || containsProhibitedKey(child)); }
