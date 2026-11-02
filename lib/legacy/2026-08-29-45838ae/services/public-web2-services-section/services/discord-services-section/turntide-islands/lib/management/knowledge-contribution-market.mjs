import { EMPTY_WITNESS_ROOT, identifyJsonSemanticContent } from "@red-cup-engineering/semantic-content-identify-service";
import { isNiUri as isCanonicalSha256NiUri } from "@red-cup-engineering/ni-services-section";
const semanticId = (value) => identifyJsonSemanticContent({ objectKind: "turntide-islands.record", value, witnessRoot: EMPTY_WITNESS_ROOT }).token;

export const TERMS_ID = "tti-knowledge-contribution-terms-draft-2026-01";
const LOCALITY_PRODUCT_ID = "tti-locality-knowledge-answer-2026-01";
const LOCALITY_CONTRACT = "ni:///sha-256;24VLnw0orCLXDgjUgtuG9PM8y_VldOrBkb4ileAzscI";
const RESALE_SCOPES = new Set(["union-licensed-pseudonymous", "union-licensed-attributed"]);
const ALL_SCOPES = new Set(["community-memory", ...RESALE_SCOPES]);
const REFUSED_SENSITIVE = new Set(["minor", "protected-health", "financial", "precise-home-location", "third-party-personal-data", "credentials-or-secrets"]);

export function qualifyDiscordContributionIntent({ messageId, guildId, channelId, messageAuthorId, authorBot, mentionedUserIds, brokerBotId, observedAt, messageContent }) {
  if (messageContent !== undefined) return { type: "TTIKnowledgeContributionIntentRefusal", reason: "discord-message-content-must-not-cross-intent-boundary" };
  if (!messageId || !guildId || !channelId || !messageAuthorId || !brokerBotId) return { type: "TTIKnowledgeContributionIntentRefusal", reason: "discord-event-pointer-incomplete" };
  if (authorBot === true) return { type: "TTIKnowledgeContributionIntentRefusal", reason: "human-author-required" };
  if (!(mentionedUserIds ?? []).includes(brokerBotId)) return { type: "TTIKnowledgeContributionIntentRefusal", reason: "knowledge-broker-not-mentioned" };
  const body = { type: "TTIKnowledgeContributionIntent", version: 1, status: "pending-direct-intake", observedAt, discord: { guildId, channelId, messageId, userId: messageAuthorId, brokerBotId, messageContentImported: false }, trigger: "author-mentioned-tti-knowledge-broker", legalEffect: "request-tti-contribution-offer-only", licenseGranted: false, saleFormed: false, nextAct: "dm-one-time-direct-tti-intake-session" };
  return { ...body, id: semanticId(body) };
}

export function admitKnowledgeContribution(input, options = {}) {
  const reasons = [];
  if (options.termsEffective !== true) reasons.push("contributor-terms-not-effective");
  if (input?.sourceProtocol !== "tti-direct-intake-v1") reasons.push("not-direct-tti-intake");
  if (input?.discordMessageContent !== undefined || input?.sourceProtocol === "discord-api") reasons.push("discord-api-content-not-admissible");
  if (input?.adultCapacityAttested !== true) reasons.push("adult-capacity-not-attested");
  if (!ALL_SCOPES.has(input?.licenseScope)) reasons.push("unknown-license-scope");
  if (input?.termsId !== options.effectiveTermsId) reasons.push("effective-terms-not-accepted");
  if (!Number.isFinite(Date.parse(input?.consentedAt))) reasons.push("consent-instant-absent");
  if (typeof input?.knowledge !== "string" || input.knowledge.trim().length < 40) reasons.push("bounded-knowledge-absent");
  if (typeof input?.subject !== "string" || input.subject.trim().length < 3) reasons.push("subject-absent");
  if (typeof input?.geographicContext !== "string" || input.geographicContext.trim().length < 2) reasons.push("geographic-context-absent");
  if (input?.thirdPartyRightsAttested !== true) reasons.push("third-party-rights-not-attested");
  const sensitive = (input?.sensitiveClasses ?? []).filter((value) => REFUSED_SENSITIVE.has(value)); if (sensitive.length) reasons.push("sensitive-data-refused");
  if (reasons.length) return { type: "TTIKnowledgeContributionRefusal", reasons };
  const body = { type: "TTIKnowledgeContribution", version: 1, contributorAccount: input.contributorAccount, privateDiscordIdentityLink: input.privateDiscordIdentityLink ?? null, sourceProtocol: input.sourceProtocol, discordContentImported: false, knowledge: input.knowledge.trim(), subject: input.subject.trim(), geographicContext: input.geographicContext.trim(), temporalContext: input.temporalContext ?? null, evidence: input.evidence ?? [], license: { termsId: input.termsId, scope: input.licenseScope, resaleAllowed: RESALE_SCOPES.has(input.licenseScope), attribution: input.licenseScope === "union-licensed-attributed" ? input.attribution : "pseudonymous" }, consentedAt: input.consentedAt, corrections: [], status: "active" };
  return { ...body, id: semanticId(body) };
}

function measuredMicros(value) { return value?.status === "measured" && Number.isSafeInteger(value.micros) && value.micros >= 0 ? value.micros : null; }
export function allocateKnowledgeSale({ sale, offer, contributions, attributionWeights, contributorPoolBasisPoints = 5000, recordedAt, simulationMode = false }) {
  const refusal = (reason) => ({ type: "TTIKnowledgeCreditAllocationRefusal", reason });
  if (sale?.type !== "TTIKnowledgeSaleReceipt" || sale.status !== "settled" || sale.currency !== "USD") return refusal("settled-usd-sale-receipt-absent");
  if (sale.simulation === true && simulationMode !== true) return refusal("simulation-sale-requires-explicit-simulation-mode");
  if (sale.simulation !== true && simulationMode === true) return refusal("simulation-mode-requires-simulation-sale");
  if (!selfAddressed(offer) || offer.type !== "TTILocalityKnowledgeProductOffer" || offer.productId !== LOCALITY_PRODUCT_ID || offer.contract !== LOCALITY_CONTRACT || offer.simulation !== simulationMode) return refusal("frozen-sale-offer-absent-or-mode-mismatch");
  if (sale.offerId !== offer.id || sale.productId !== offer.productId || sale.buyerSettlement !== offer.buyerSettlement || !isCanonicalSha256NiUri(sale.settlementEvidenceId)) return refusal("sale-receipt-not-bound-to-frozen-offer");
  if (sale.maturityStatus !== "matured" || !Number.isFinite(Date.parse(sale.refundWindowClosedAt)) || Date.parse(sale.refundWindowClosedAt) > Date.parse(recordedAt)) return refusal("sale-refund-and-chargeback-window-not-matured");
  const gross = measuredMicros(sale.grossRevenue); const processing = measuredMicros(sale.paymentProcessingCost); const providers = measuredMicros(sale.directProviderCost); const reversals = measuredMicros(sale.maturedRefundsAndChargebacks);
  if ([gross, processing, providers, reversals].includes(null)) return refusal("complete-measured-sale-economics-absent");
  if (gross !== offer.price.unitAmountMicros * offer.price.quantity) return refusal("settled-gross-does-not-equal-frozen-offer-price");
  const byId = new Map(contributions.map((row) => [row.id, row])); const weightTotal = attributionWeights.reduce((sum, row) => sum + row.weightPpm, 0);
  if (weightTotal !== 1_000_000 || attributionWeights.some((row) => !Number.isSafeInteger(row.weightPpm) || row.weightPpm <= 0)) return refusal("attribution-weights-must-total-one-million-ppm");
  const frozenIds = offer.frozenContributions.map((row) => row.contributionId), offeredWeights = new Map(offer.attributionWeights.map((row) => [row.contributionId, row.weightPpm]));
  if (frozenIds.length !== attributionWeights.length || new Set(frozenIds).size !== frozenIds.length || attributionWeights.some((row) => offeredWeights.get(row.contributionId) !== row.weightPpm) || frozenIds.some((id) => !attributionWeights.some((row) => row.contributionId === id))) return refusal("allocation-does-not-equal-frozen-attribution-set");
  if (attributionWeights.some((row) => byId.get(row.contributionId)?.license?.resaleAllowed !== true || byId.get(row.contributionId)?.status !== "active")) return refusal("active-resale-license-absent");
  const distributableMarginMicros = Math.max(0, gross - processing - providers - reversals); const contributorPoolMicros = Math.floor(distributableMarginMicros * contributorPoolBasisPoints / 10_000);
  const credits = attributionWeights.map((row) => ({ type: "TTIKnowledgeContributionCredit", contributionId: row.contributionId, contributorAccount: byId.get(row.contributionId).contributorAccount, offerId: offer.id, saleReceiptId: sale.id, weightPpm: row.weightPpm, creditMicros: Math.floor(contributorPoolMicros * row.weightPpm / 1_000_000), status: simulationMode ? "synthetic-nonposting-credit" : "matured-non-transferable-ledger-credit", recordedAt }));
  const body = { type: "TTIKnowledgeCreditAllocation", version: 1, recordedAt, simulation: simulationMode, recognition: simulationMode ? { revenue: "forbidden", credits: "nonposting", profit: "forbidden" } : { revenue: "settled-receipt-bound", credits: "matured-ledger-posting", profit: "requires-complete-venture-ledger" }, offerId: offer.id, saleReceiptId: sale.id, grossRevenueMicros: gross, receiptedDirectCostsMicros: processing + providers + reversals, distributableMarginMicros, contributorPoolBasisPoints, contributorPoolMicros, retainedTTIMarginMicros: distributableMarginMicros - contributorPoolMicros, weightTotalPpm: weightTotal, credits };
  return { ...body, id: semanticId(body) };
}

function selfAddressed(value) { if (value === null || typeof value !== "object" || Array.isArray(value) || typeof value.id !== "string") return false; const { id, ...body } = value; return id === semanticId(body); }
