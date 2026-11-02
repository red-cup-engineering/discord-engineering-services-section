#!/usr/bin/env node

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { EMPTY_WITNESS_ROOT, identifyJsonSemanticContent } from "@red-cup-engineering/semantic-content-identify-service";
const semanticId = (value) => identifyJsonSemanticContent({ objectKind: "turntide-islands.record", value, witnessRoot: EMPTY_WITNESS_ROOT }).token;
import { recordWitnessJournalBatch } from "@red-cup-engineering/witness-journal-document-service";
import { turntideWitnessJournalBindingFromEnvironment } from "./settlement-witness-journal-binding.mjs";
import { admitKnowledgeContribution, allocateKnowledgeSale } from "./knowledge-contribution-market.mjs";
import {
  admitKnowledgeAttributionReview,
  admitLocalityKnowledgeBuyerQuery,
  freezeLocalityKnowledgeOffer,
  matchLocalityKnowledgeContributions,
} from "./locality-knowledge-product.mjs";
import { contributorKnowledgeMarketSnapshot } from "./observe-contributor-knowledge-market.mjs";

const TTI_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const APP_DIST = join(TTI_ROOT, "src/apps/turntide-islands-discord-platform/dist/turntide-software-system");
const TTI_ACCOUNT = "eip155:31337:0xcfe1b9960ddbbe2b95e48114c281d7f24eb87b4d";
const TTI_ACTOR = "urn:ame:turntide-islands";
const CIRCUIT_ID = "tti-market-circuit-contributor-knowledge-market-2026-02";
const TERMS_ID = "tti-knowledge-contribution-terms-simulation-only-2026-01";

function jsonl(source) { return source.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line)); }
async function optionalJsonl(file) { return jsonl(await readFile(file, "utf8").catch((error) => error.code === "ENOENT" ? "" : Promise.reject(error))); }

export function verifyContributorMarketSimulationReceipt(receipt) {
  const errors = [];
  if (receipt?.type !== "TTIMarketCircuitSimulationReceipt" || receipt.simulation !== true) errors.push("simulation-identity-absent");
  if (receipt?.mode !== "deterministic-synthetic-no-external-effects") errors.push("simulation-mode-invalid");
  if (receipt?.simulatedCircuitExternalEffects !== 0) errors.push("simulated-external-effects-nonzero");
  if (receipt?.recognition?.revenue !== "forbidden" || receipt?.recognition?.profit !== "forbidden") errors.push("synthetic-economics-recognition-not-forbidden");
  if (receipt?.authority?.liveActivationAdmissionUsed !== false || receipt?.authority?.saleAuthority !== false || receipt?.authority?.payoutAuthority !== false) errors.push("live-authority-leak");
  if (!Array.isArray(receipt?.cells) || receipt.cells.length < 8 || receipt.cells.some((cell) => cell.outcome !== "simulated-passed")) errors.push("simulation-cell-open");
  if (receipt?.economics?.classification !== "synthetic-nonrecognizable" || !Number.isSafeInteger(receipt?.economics?.retainedTTIMarginMicros)) errors.push("synthetic-economics-invalid");
  if (receipt?.privacyProjection !== "aggregate-and-semantic-identities-only-no-discord-user-message-token-or-contributed-knowledge") errors.push("privacy-projection-invalid");
  return { type: "TTIMarketCircuitSimulationVerification", status: errors.length === 0 ? "passed" : "failed", errors };
}

export async function simulateContributorKnowledgeMarket(options = {}) {
  const recordedAt = options.recordedAt ?? "2026-07-21T21:00:00.000Z";
  const workspace = await mkdtemp(join(os.tmpdir(), "tti-contributor-market-simulation-"));
  try {
    const [{ InMemoryDiscordTransport }, broker, intake] = await Promise.all([
      import(pathToFileURL(join(APP_DIST, "discord.mjs")).href),
      import(pathToFileURL(join(APP_DIST, "knowledge-broker.mjs")).href),
      import(pathToFileURL(join(APP_DIST, "knowledge-intake.mjs")).href),
    ]);
    const config = {
      brokerBotId: "synthetic-broker",
      intakeBaseUrl: "https://simulation.invalid/",
      sessionsFile: join(workspace, "sessions.jsonl"),
      candidatesFile: join(workspace, "candidates.jsonl"),
      termsFile: join(workspace, "terms.json"),
      ttlMinutes: 30,
      effectiveTermsId: TERMS_ID,
      marketAdmissionId: "urn:tti:simulation-admission:no-live-authority",
    };
    const termsSource = `${JSON.stringify({ type: "TTIKnowledgeContributionTerms", version: 1, id: TERMS_ID, status: "effective", operator: "Turntide Islands synthetic simulator", plainLanguageNotice: ["Simulation fixture only; this grants no live rights."], requiredConsent: ["synthetic adult capacity", "synthetic direct submission", "synthetic license scope"] })}\n`;
    await writeFile(config.termsFile, termsSource, { mode: 0o600 });
    const terms = await intake.loadEffectiveKnowledgeTerms(config);
    const runtimeConfig = { ...config, effectiveTermsDigest: terms.documentDigest };
    const transport = new InMemoryDiscordTransport({ currentUser: { id: "synthetic-broker", username: "TTI Knowledge Broker Simulator", bot: true } });
    const brokerResult = await broker.brokerKnowledgeOfferFromMessage({
      id: "synthetic-message", guild_id: "synthetic-guild", channel_id: "synthetic-channel",
      author: { id: "synthetic-contributor", bot: false }, mentions: [{ id: "synthetic-broker", bot: true }],
      content: "@synthetic-broker I want to sell synthetic knowledge; this Discord content is intentionally discarded",
    }, runtimeConfig, transport, { now: new Date(recordedAt), token: "synthetic-opaque-session-token-00000001" });
    if (brokerResult.outcome !== "dm-sent") throw new Error("synthetic broker cell did not close");
    const form = new URLSearchParams({
      session: "synthetic-opaque-session-token-00000001",
      knowledge: "Synthetic locality knowledge: raised rows reduce simulated spring bean-root rot in dense clay soil after prolonged rain.",
      subject: "synthetic local bean gardening", geographicContext: "synthetic-town", temporalContext: "synthetic late spring",
      licenseScope: "union-licensed-pseudonymous", attribution: "", termsId: TERMS_ID,
      adultCapacityAttested: "yes", thirdPartyRightsAttested: "yes", noSensitiveDataAttested: "yes", knowledgeOwnWordsAttested: "yes", termsAccepted: "yes",
    }).toString();
    const submission = await intake.submitKnowledgeContributionCandidate(form, config, { now: new Date(recordedAt) });
    if (!submission.accepted) throw new Error(`synthetic intake cell refused: ${submission.errors.join(",")}`);
    const contribution = admitKnowledgeContribution(submission.candidate, { termsEffective: true, effectiveTermsId: TERMS_ID });
    if (contribution.type !== "TTIKnowledgeContribution") throw new Error("synthetic admission cell did not close");
    const query = admitLocalityKnowledgeBuyerQuery({
      sourceProtocol: "tti-direct-buyer-query-v1", buyerSettlement: "urn:ame:synthetic-buyer",
      question: "What locally observed practice reduces spring bean-root rot in dense clay soil after prolonged rain?",
      subject: "synthetic local bean gardening", geographicContext: "synthetic-town", temporalContext: "synthetic late spring",
      intendedUse: "local-practice-research", noPersonalDataAttested: true, buyerTermsAcknowledged: true,
      requestedAt: recordedAt, budget: { currency: "USD", maximumMicros: 10_000_000 }, sensitiveClasses: [],
    }, { simulationMode: true });
    if (query.type !== "TTILocalityKnowledgeBuyerQuery") throw new Error(`synthetic buyer-query cell refused: ${query.reasons.join(",")}`);
    const match = matchLocalityKnowledgeContributions({ query, contributions: [contribution], recordedAt, simulationMode: true });
    if (match.type !== "TTILocalityKnowledgeMatchReceipt") throw new Error(`synthetic matching cell refused: ${match.reasons.join(",")}`);
    const weights = [{ contributionId: contribution.id, weightPpm: 1_000_000, rationale: "The single exact locality match supplies all knowledge used by this synthetic answer." }];
    const review = admitKnowledgeAttributionReview({
      type: "TTIKnowledgeAttributionReview", version: 1, status: "approved", humanReviewed: true,
      reviewerAuthority: "urn:tti:office:contributor-market", queryId: query.id, matchId: match.id,
      reviewedAt: recordedAt, simulation: true, weights,
    }, { query, match, simulationMode: true });
    if (review.type !== "TTIKnowledgeAttributionReview") throw new Error(`synthetic attribution-review cell refused: ${review.reasons.join(",")}`);
    const offer = freezeLocalityKnowledgeOffer({
      query, match, review, contributions: [contribution], recordedAt,
      expiresAt: new Date(Date.parse(recordedAt) + 24 * 60 * 60 * 1000).toISOString(), simulationMode: true,
    });
    if (offer.type !== "TTILocalityKnowledgeProductOffer") throw new Error(`synthetic offer cell refused: ${offer.reasons.join(",")}`);
    const sale = {
      type: "TTIKnowledgeSaleReceipt", id: "urn:tti:synthetic-sale:one", status: "settled", currency: "USD", simulation: true,
      offerId: offer.id, productId: offer.productId, buyerSettlement: offer.buyerSettlement,
      settlementEvidenceId: "ni:///sha-256;AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", maturityStatus: "matured", refundWindowClosedAt: recordedAt,
      grossRevenue: { status: "measured", micros: 10_000_000 }, paymentProcessingCost: { status: "measured", micros: 500_000 },
      directProviderCost: { status: "measured", micros: 1_500_000 }, maturedRefundsAndChargebacks: { status: "measured", micros: 0 },
    };
    const attributionWeights = weights.map(({ contributionId, weightPpm }) => ({ contributionId, weightPpm }));
    const allocation = allocateKnowledgeSale({ sale, offer, contributions: [contribution], attributionWeights, recordedAt, simulationMode: true });
    if (allocation.type !== "TTIKnowledgeCreditAllocation") throw new Error(`synthetic allocation cell refused: ${allocation.reason}`);
    if (allocation.simulation !== true || allocation.credits.some((credit) => credit.status !== "synthetic-nonposting-credit")) throw new Error("synthetic allocation could post live credits");
    const [sessions, candidates] = await Promise.all([optionalJsonl(config.sessionsFile), optionalJsonl(config.candidatesFile)]);
    const snapshot = contributorKnowledgeMarketSnapshot({ sessions, candidates, admissions: [contribution], sales: [sale], recordedAt });
    const body = {
      type: "TTIMarketCircuitSimulationReceipt", version: 1, circuitId: CIRCUIT_ID, venture: TTI_ACTOR, recordedAt,
      simulation: true, mode: "deterministic-synthetic-no-external-effects", simulatedCircuitExternalEffects: 0,
      fixtureClass: "wholly-synthetic-no-human-demand-content-payment-or-provider-receipt",
      authority: { liveActivationAdmissionUsed: false, saleAuthority: false, payoutAuthority: false },
      recognition: { revenue: "forbidden", profit: "forbidden", credits: "nonposting-synthetic" },
      privacyProjection: "aggregate-and-semantic-identities-only-no-discord-user-message-token-or-contributed-knowledge",
      cells: [
        { id: "discord-broker-mention-ingress", outcome: "simulated-passed", evidenceType: "synthetic-message-create" },
        { id: "private-offer-session", outcome: "simulated-passed", evidenceType: brokerResult.session.type },
        { id: "direct-contribution-intake", outcome: "simulated-passed", evidenceType: submission.candidate.type },
        { id: "contribution-admission", outcome: "simulated-passed", evidenceType: contribution.type },
        { id: "provenance-claim-fabric", outcome: "simulated-passed", evidenceType: "semantic-contribution-identity" },
        { id: "buyer-query-admission", outcome: "simulated-passed", evidenceType: query.type },
        { id: "locality-contribution-matching", outcome: "simulated-passed", evidenceType: match.type },
        { id: "human-attribution-review", outcome: "simulated-passed", evidenceType: review.type },
        { id: "union-knowledge-offer", outcome: "simulated-passed", evidenceType: offer.type },
        { id: "x402-sale-settlement", outcome: "simulated-passed", evidenceType: sale.type },
        { id: "contributor-credit-allocation", outcome: "simulated-passed", evidenceType: allocation.type },
        { id: "contributor-market-observer", outcome: "simulated-passed", evidenceType: snapshot.type },
        { id: "venture-economics", outcome: "simulated-passed", evidenceType: "synthetic-allocation-projection" },
      ],
      semanticEvidence: { contributionId: contribution.id, candidateId: submission.candidate.id, queryId: query.id, matchId: match.id, attributionReviewId: review.id, offerId: offer.id, allocationId: allocation.id, aggregateSnapshotId: snapshot.id },
      funnel: { offerSessions: snapshot.counts.offerSessionsIssued, candidates: snapshot.counts.pendingAdmissionCandidates, admissions: snapshot.counts.admittedContributions, offerToCandidateBasisPoints: snapshot.conversion.offerSessionToCandidateBasisPoints, candidateToAdmissionBasisPoints: snapshot.conversion.candidateToAdmissionBasisPoints },
      economics: { classification: "synthetic-nonrecognizable", currency: "USD", grossRevenueMicros: allocation.grossRevenueMicros, receiptedDirectCostsMicros: allocation.receiptedDirectCostsMicros, contributorPoolMicros: allocation.contributorPoolMicros, retainedTTIMarginMicros: allocation.retainedTTIMarginMicros },
      inference: "synthetic-positive-path-closed-live-circuit-remains-not-admitted",
    };
    const verification = verifyContributorMarketSimulationReceipt(body);
    if (verification.status !== "passed") throw new Error(`simulation receipt DRC failed: ${verification.errors.join(",")}`);
    return { ...body, designRuleVerification: verification, id: semanticId({ ...body, designRuleVerification: verification }) };
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

export async function recordContributorKnowledgeMarketSimulation(options = {}) {
  if (options.witnessJournalAgentUrl === undefined) throw new Error("simulation recording requires the contracted witness-journal RDF provider");
  const receipt = options.receipt ?? await simulateContributorKnowledgeMarket(options);
  const graph = semanticId(receipt);
  const witnessJournal = options.witnessJournal ?? turntideWitnessJournalBindingFromEnvironment();
  await recordWitnessJournalBatch({ agentUrl: options.witnessJournalAgentUrl, ...(witnessJournal ?? {}), batch: { settlement: TTI_ACCOUNT, graph, recordedAt: receipt.recordedAt, document: receipt, assertions: [
    { subject: TTI_ACTOR, predicate: "urn:emsenn:venture:simulated-market-circuit", object: { kind: "iri", value: graph } },
    { subject: graph, predicate: "urn:emsenn:venture:revenue-recognition", object: { kind: "literal", value: "forbidden-synthetic" } },
  ] } });
  return { ...receipt, witnessReceiptId: graph };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const receipt = process.argv.includes("--record")
    ? await recordContributorKnowledgeMarketSimulation({ witnessJournalAgentUrl: process.env.WITNESS_JOURNAL_RDF_AGENT })
    : await simulateContributorKnowledgeMarket();
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}
