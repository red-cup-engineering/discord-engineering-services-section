#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EMPTY_WITNESS_ROOT, identifyJsonSemanticContent } from "@red-cup-engineering/semantic-content-identify-service";
const semanticId = (value) => identifyJsonSemanticContent({ objectKind: "turntide-islands.record", value, witnessRoot: EMPTY_WITNESS_ROOT }).token;
import { recordWitnessJournalBatch } from "@red-cup-engineering/witness-journal-document-service";
import { turntideWitnessJournalBindingFromEnvironment } from "./settlement-witness-journal-binding.mjs";

const TTI_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const APP_DATA = join(TTI_ROOT, "src/apps/turntide-islands-discord-platform/data/knowledge-broker");
const TTI_ACCOUNT = "eip155:31337:0xcfe1b9960ddbbe2b95e48114c281d7f24eb87b4d";
const TTI_ACTOR = "urn:ame:turntide-islands";

async function readJsonl(file) {
  const source = await readFile(file, "utf8").catch((error) => error.code === "ENOENT" ? "" : Promise.reject(error));
  return source.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
}

async function readOptionalJsonl(file) {
  const source = await readFile(file, "utf8").catch((error) => error.code === "ENOENT" ? undefined : Promise.reject(error));
  return source === undefined ? undefined : source.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
}

function duplicateCount(values) { return values.length - new Set(values).size; }

export function contributorKnowledgeMarketSnapshot({ sessions, candidates, admissions, buyerQueries, matches, offers, sales, fulfillments, allocations, recordedAt }) {
  const now = Date.parse(recordedAt);
  const issued = sessions.filter((row) => row?.type === "TTIKnowledgeOfferSession");
  const consumptions = sessions.filter((row) => row?.type === "TTIKnowledgeOfferSessionConsumption");
  const candidateRows = candidates.filter((row) => row?.type === "TTIKnowledgeContributionCandidate");
  const admissionRows = Array.isArray(admissions) ? admissions.filter((row) => ["TTIKnowledgeContribution", "TTIKnowledgeContributionRefusal"].includes(row?.type)) : null;
  const liveBuyerQueries = Array.isArray(buyerQueries) ? buyerQueries.filter((row) => row?.type === "TTILocalityKnowledgeBuyerQuery" && row.simulation !== true) : null;
  const liveMatches = Array.isArray(matches) ? matches.filter((row) => row?.type === "TTILocalityKnowledgeMatchReceipt" && row.simulation !== true) : null;
  const liveOffers = Array.isArray(offers) ? offers.filter((row) => row?.type === "TTILocalityKnowledgeProductOffer" && row.simulation !== true) : null;
  const liveFulfillments = Array.isArray(fulfillments) ? fulfillments.filter((row) => row?.type === "TTILocalityKnowledgeFulfillmentPackage" && row.simulation !== true) : null;
  const liveAllocations = Array.isArray(allocations) ? allocations.filter((row) => row?.type === "TTIKnowledgeCreditAllocation" && row.simulation !== true) : null;
  const sessionDigests = issued.map((row) => row.tokenDigest).filter(Boolean);
  const consumedDigests = new Set(consumptions.map((row) => row.tokenDigest).filter(Boolean));
  const candidateDigests = new Set(candidateRows.map((row) => row.offerSessionDigest).filter(Boolean));
  const activePendingSessions = issued.filter((row) => !consumedDigests.has(row.tokenDigest) && Date.parse(row.expiresAt) > now).length;
  const expiredUnconsumedSessions = issued.filter((row) => !consumedDigests.has(row.tokenDigest) && Date.parse(row.expiresAt) <= now).length;
  const admitted = admissionRows === null ? null : admissionRows.filter((row) => row.type === "TTIKnowledgeContribution").length;
  const refused = admissionRows === null ? null : admissionRows.filter((row) => row.type === "TTIKnowledgeContributionRefusal").length;
  const fixedPriceQualifiedQueries = liveBuyerQueries === null ? null : liveBuyerQueries.filter((row) => row?.budget?.currency === "USD" && row.budget.maximumMicros >= 10_000_000);
  const buyerQueryCounts = new Map();
  for (const row of liveBuyerQueries ?? []) buyerQueryCounts.set(row.buyerSettlement, (buyerQueryCounts.get(row.buyerSettlement) ?? 0) + 1);
  const syntheticSaleReceiptsExcluded = Array.isArray(sales) ? sales.filter((row) => row?.type === "TTIKnowledgeSaleReceipt" && row.simulation === true).length : 0;
  const syntheticBuyerQueriesExcluded = Array.isArray(buyerQueries) ? buyerQueries.filter((row) => row?.type === "TTILocalityKnowledgeBuyerQuery" && row.simulation === true).length : 0;
  const syntheticOffersExcluded = Array.isArray(offers) ? offers.filter((row) => row?.type === "TTILocalityKnowledgeProductOffer" && row.simulation === true).length : 0;
  const syntheticFulfillmentsExcluded = Array.isArray(fulfillments) ? fulfillments.filter((row) => row?.type === "TTILocalityKnowledgeFulfillmentPackage" && row.simulation === true).length : 0;
  const syntheticAllocationsExcluded = Array.isArray(allocations) ? allocations.filter((row) => row?.type === "TTIKnowledgeCreditAllocation" && row.simulation === true).length : 0;
  const settledSales = Array.isArray(sales) ? sales.filter((row) => row?.type === "TTIKnowledgeSaleReceipt" && row.status === "settled" && row.simulation !== true) : null;
  const allocationEconomicsComplete = liveAllocations !== null && liveAllocations.every((row) => [row.grossRevenueMicros, row.receiptedDirectCostsMicros, row.contributorPoolMicros, row.retainedTTIMarginMicros].every((value) => Number.isSafeInteger(value) && value >= 0));
  const economics = settledSales === null
    ? { status: "unknown", reason: "knowledge-sale-ledger-not-configured", settledSaleReceiptCount: null, externallySettledRevenueMicros: null, attributableCostMicros: null, profitMicros: null }
    : settledSales.length === 0
      ? { status: "measured-no-settled-sales-costs-unknown", settledSaleReceiptCount: 0, externallySettledRevenueMicros: 0, receiptedDirectCostMicros: 0, maturedContributorCreditMicros: 0, retainedTTIMarginMicros: 0, attributableCostMicros: null, profitMicros: null }
      : !allocationEconomicsComplete || liveAllocations.length !== settledSales.length
        ? { status: "requires-complete-sale-allocation-projection", settledSaleReceiptCount: settledSales.length, externallySettledRevenueMicros: null, receiptedDirectCostMicros: null, maturedContributorCreditMicros: null, retainedTTIMarginMicros: null, attributableCostMicros: null, profitMicros: null }
        : { status: "settled-product-margin-measured-profit-unknown", settledSaleReceiptCount: settledSales.length, externallySettledRevenueMicros: liveAllocations.reduce((sum, row) => sum + row.grossRevenueMicros, 0), receiptedDirectCostMicros: liveAllocations.reduce((sum, row) => sum + row.receiptedDirectCostsMicros, 0), maturedContributorCreditMicros: liveAllocations.reduce((sum, row) => sum + row.contributorPoolMicros, 0), retainedTTIMarginMicros: liveAllocations.reduce((sum, row) => sum + row.retainedTTIMarginMicros, 0), attributableCostMicros: null, profitMicros: null };
  const counts = {
    offerSessionsIssued: issued.length,
    distinctOfferRequestAuthors: new Set(issued.map((row) => row.discord?.authorId).filter(Boolean)).size,
    activePendingSessions,
    expiredUnconsumedSessions,
    consumedSessions: consumedDigests.size,
    pendingAdmissionCandidates: new Set(candidateRows.map((row) => row.id).filter(Boolean)).size,
    admittedContributions: admitted,
    refusedContributions: refused,
    admittedBuyerQueries: liveBuyerQueries?.length ?? null,
    fixedPriceQualifiedBuyerQueries: fixedPriceQualifiedQueries?.length ?? null,
    distinctBuyerSettlements: liveBuyerQueries === null ? null : buyerQueryCounts.size,
    repeatBuyerSettlements: liveBuyerQueries === null ? null : [...buyerQueryCounts.values()].filter((count) => count > 1).length,
    rightsCompatibleMatches: liveMatches?.length ?? null,
    frozenPricedOffers: liveOffers?.length ?? null,
    preparedFulfillments: liveFulfillments?.length ?? null,
    maturedCreditAllocations: liveAllocations?.length ?? null,
  };
  const integrity = {
    duplicateSessionDigests: duplicateCount(sessionDigests),
    duplicateCandidateIds: duplicateCount(candidateRows.map((row) => row.id).filter(Boolean)),
    orphanConsumptionCount: [...consumedDigests].filter((digest) => !new Set(sessionDigests).has(digest)).length,
    consumedWithoutCandidateCount: [...consumedDigests].filter((digest) => !candidateDigests.has(digest)).length,
    candidateWithoutConsumptionCount: [...candidateDigests].filter((digest) => !consumedDigests.has(digest)).length,
    syntheticSaleReceiptsExcluded,
    syntheticBuyerQueriesExcluded,
    syntheticOffersExcluded,
    syntheticFulfillmentsExcluded,
    syntheticAllocationsExcluded,
  };
  const conversion = {
    offerSessionToCandidateBasisPoints: issued.length === 0 ? null : Math.floor(counts.pendingAdmissionCandidates * 10_000 / issued.length),
    candidateToAdmissionBasisPoints: counts.pendingAdmissionCandidates === 0 || admitted === null ? null : Math.floor(admitted * 10_000 / counts.pendingAdmissionCandidates),
    buyerQueryToOfferBasisPoints: liveBuyerQueries === null || liveOffers === null || liveBuyerQueries.length === 0 ? null : Math.floor(liveOffers.length * 10_000 / liveBuyerQueries.length),
    offerToSettledSaleBasisPoints: liveOffers === null || settledSales === null || liveOffers.length === 0 ? null : Math.floor(settledSales.length * 10_000 / liveOffers.length),
    settledSaleToPreparedFulfillmentBasisPoints: settledSales === null || liveFulfillments === null || settledSales.length === 0 ? null : Math.floor(liveFulfillments.length * 10_000 / settledSales.length),
  };
  const body = {
    type: "TTIContributorKnowledgeMarketSnapshot", version: 2, venture: TTI_ACTOR, productId: "tti-contributor-knowledge-market-2026-01", revenueProductId: "tti-locality-knowledge-answer-2026-01", recordedAt,
    privacyProjection: "aggregate-counts-only-no-contributor-or-buyer-identifiers-message-pointers-tokens-queries-or-knowledge",
    counts, conversion, integrity, economics,
    inference: (settledSales?.length ?? 0) > 0 ? (liveFulfillments?.length ?? 0) > 0 ? "settled-sale-and-prepared-fulfillment-observed-profit-still-unknown" : "settled-sale-observed-fulfillment-not-evidenced" : (counts.admittedBuyerQueries ?? 0) === 0 && counts.offerSessionsIssued === 0 ? "market-not-yet-activated-no-qualified-demand-observed" : (counts.admittedBuyerQueries ?? 0) > 0 ? "qualified-buyer-demand-observed-no-settled-sale" : counts.pendingAdmissionCandidates === 0 ? "offer-requests-observed-no-direct-candidates" : admitted === null ? "direct-candidates-observed-admission-evidence-unavailable-not-revenue" : admitted === 0 ? "direct-candidates-observed-pending-admission-not-revenue" : "admitted-contributions-observed-sales-still-require-settlement-evidence",
  };
  return { ...body, id: semanticId(body) };
}

export async function observeContributorKnowledgeMarket(options = {}) {
  const [sessions, candidates, admissions, buyerQueries, matches, offers, sales, fulfillments, allocations] = await Promise.all([
    readJsonl(options.sessionsFile ?? join(APP_DATA, "sessions.jsonl")),
    readJsonl(options.candidatesFile ?? join(APP_DATA, "contribution-candidates.jsonl")),
    readOptionalJsonl(options.admissionsFile ?? join(TTI_ROOT, "data/knowledge-market/admission-decisions.jsonl")),
    readOptionalJsonl(options.buyerQueriesFile ?? join(TTI_ROOT, "data/knowledge-market/buyer-queries.jsonl")),
    readOptionalJsonl(options.matchesFile ?? join(TTI_ROOT, "data/knowledge-market/match-receipts.jsonl")),
    readOptionalJsonl(options.offersFile ?? join(TTI_ROOT, "data/knowledge-market/locality-offers.jsonl")),
    options.salesFile === undefined ? Promise.resolve(undefined) : readJsonl(options.salesFile),
    readOptionalJsonl(options.fulfillmentsFile ?? join(TTI_ROOT, "data/knowledge-market/fulfillments.jsonl")),
    readOptionalJsonl(options.allocationsFile ?? join(TTI_ROOT, "data/knowledge-market/credit-allocations.jsonl")),
  ]);
  const recordedAt = options.recordedAt ?? new Date().toISOString();
  const snapshot = contributorKnowledgeMarketSnapshot({ sessions, candidates, admissions, buyerQueries, matches, offers, sales, fulfillments, allocations, recordedAt });
  if (options.witnessJournalAgentUrl === undefined) return snapshot;
  const graph = semanticId(snapshot);
  const witnessJournal = options.witnessJournal ?? turntideWitnessJournalBindingFromEnvironment();
  await recordWitnessJournalBatch({ agentUrl: options.witnessJournalAgentUrl, ...(witnessJournal ?? {}), batch: { settlement: TTI_ACCOUNT, graph, recordedAt, document: snapshot, assertions: [
    { subject: TTI_ACTOR, predicate: "urn:emsenn:venture:contributor-knowledge-market-snapshot", object: { kind: "iri", value: graph } },
    { subject: graph, predicate: "urn:emsenn:venture:pending-admission-candidates", object: { kind: "literal", value: String(snapshot.counts.pendingAdmissionCandidates), datatype: "http://www.w3.org/2001/XMLSchema#integer" } },
  ] } });
  return { ...snapshot, receiptId: graph };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const snapshot = await observeContributorKnowledgeMarket({ witnessJournalAgentUrl: process.argv.includes("--record") ? process.env.WITNESS_JOURNAL_RDF_AGENT : undefined });
  process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
}
