#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EMPTY_WITNESS_ROOT, identifyJsonSemanticContent } from "@red-cup-engineering/semantic-content-identify-service";
const semanticId = (value) => identifyJsonSemanticContent({ objectKind: "turntide-islands.record", value, witnessRoot: EMPTY_WITNESS_ROOT }).token;
import { recordWitnessJournalBatch } from "@red-cup-engineering/witness-journal-document-service";
import { turntideWitnessJournalBindingFromEnvironment } from "./settlement-witness-journal-binding.mjs";

const TTI_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SOLICITATION_PATH = join(TTI_ROOT, "content", "solicitations", "founding-knowledge-vault-subscription-provider.json");
const TTI_ACTOR = "urn:ame:turntide-islands";
const TTI_ACCOUNT = "eip155:31337:0xcfe1b9960ddbbe2b95e48114c281d7f24eb87b4d";
const REQUIRED_EVENTS = ["checkout.session.completed", "checkout.session.expired", "invoice.paid", "invoice.payment_failed", "customer.subscription.updated", "customer.subscription.deleted", "charge.refunded", "dispute.created-or-updated"];
const REQUIRED_CORRELATION = ["checkout", "subscription", "invoice"];

export function currentStripeProviderSourceObservation(recordedAt = "2026-07-21T23:30:00.000Z") {
  const body = {
    type: "TTIPaymentProviderCapabilityObservation", version: 1, recordedAt,
    observer: TTI_ACTOR, providerActor: "urn:ame:stripe-payment-acceptance-enterprise",
    evidenceClass: "customer-authored-bounded-source-inspection-not-provider-offer-or-refusal", providerAcceptance: false,
    legalMerchant: "emsenn", credentialMode: "absent", webhookSecretPresent: false, customerContractTokenPresent: false, liveReady: false,
    checkoutContract: "ni:///sha-256;3EBj3TDXwaixs8x0ZhgpqddX_cWrof8wIJkZ4GpBS5Y",
    webhookContract: "ni:///sha-256;i_TblBaOnEGrk6UEzqP23piKpu_wZD5NDJdoreuGPpY",
    offerings: [{ id: "stripe-integration-smoke-test", status: "test-only", mode: "payment", currency: "usd", unitAmount: 100, billingPeriod: null, quantity: { minimum: 1, maximum: 1 }, beneficiarySettlement: "urn:ame:stripe-payment-acceptance-enterprise" }],
    catalogDerivesPrice: true, callerPriceOverrideRefused: true, supportsOpaqueCustomerReference: true, discordIdentityRequiredByProvider: false,
    subscriptionCorrelationScopes: ["checkout"], supportedEventTypes: ["checkout.session.completed", "checkout.session.expired", "payment_intent.payment_failed", "charge.refunded"],
    rawStripeSignatureVerification: true, replayTolerance: true, bodyBound: true, eventDeduplication: true, rawBodyRecorded: false, buyerPersonalDataRecorded: false,
    customerSettlementMutationAuthority: false, authenticatedFullReceiptDelivery: false, testLiveSeparation: true,
    providerCostQuote: null, attributableCostReceiptSchema: null,
    secretsDisclosed: false,
  };
  return { ...body, id: semanticId(body) };
}

export function verifyVaultPaymentProviderCompatibility({ solicitation, observation, recordedAt = new Date().toISOString() }) {
  const expected = solicitation.product, offering = (observation.offerings ?? []).find((candidate) => candidate.id === expected.offeringId);
  const requiredEventSet = new Set(REQUIRED_EVENTS), observedEvents = new Set(observation.supportedEventTypes ?? []);
  const observedCorrelation = new Set(observation.subscriptionCorrelationScopes ?? []);
  const checks = [
    check("REQ-PAY-001", Boolean(offering) && offering.status !== "test-only" && offering.mode === expected.mode && offering.currency === expected.currency && offering.unitAmount === expected.unitAmount && offering.billingPeriod === expected.billingPeriod && offering.quantity?.minimum === 1 && offering.quantity?.maximum === 1 && offering.beneficiarySettlement === solicitation.beneficiarySettlement, offering ? "observed offering differs from exact product, recurrence, price, activation, quantity, or beneficiary" : "exact offering absent"),
    check("REQ-PAY-002", observation.catalogDerivesPrice === true && observation.callerPriceOverrideRefused === true && Boolean(offering), "catalog enforcement exists only for a nonmatching offering"),
    check("REQ-PAY-003", Boolean(offering) && offering.mode === "subscription" && observation.supportsOpaqueCustomerReference === true && observation.discordIdentityRequiredByProvider === false, "subscription-mode Checkout is unavailable"),
    check("REQ-PAY-004", REQUIRED_CORRELATION.every((scope) => observedCorrelation.has(scope)), `correlation observed only for ${[...observedCorrelation].join(",") || "no scopes"}`),
    check("REQ-PAY-005", observation.rawStripeSignatureVerification === true && observation.replayTolerance === true && observation.bodyBound === true && observation.eventDeduplication === true && observation.rawBodyRecorded === false && observation.buyerPersonalDataRecorded === false, "webhook privacy/security capability incomplete"),
    check("REQ-PAY-006", [...requiredEventSet].every((event) => observedEvents.has(event)), `missing event receipts: ${[...requiredEventSet].filter((event) => !observedEvents.has(event)).join(",")}`),
    check("REQ-PAY-007", observation.customerSettlementMutationAuthority === false, "provider claims or exercises customer-settlement mutation authority"),
    check("REQ-PAY-008", observation.authenticatedFullReceiptDelivery === true, "authenticated full receipt delivery is absent"),
    check("REQ-PAY-009", observation.testLiveSeparation === true, "test/live separation is absent"),
    check("REQ-PAY-010", costQuoteCompatible(solicitation, observation), observation.providerCostQuote === null || observation.providerCostQuote === undefined ? "provider cost quote and attributable-cost receipt schema absent" : "quoted cost exceeds ceiling or lacks receipt schema"),
  ];
  const incompatible = checks.filter((row) => row.disposition === "incompatible").length, unknown = checks.filter((row) => row.disposition === "unknown").length;
  const operationalBlockers = [
    observation.credentialMode === "absent" ? "provider-credential-absent" : null,
    observation.webhookSecretPresent !== true ? "provider-webhook-secret-absent" : null,
    observation.customerContractTokenPresent !== true ? "customer-contract-token-absent" : null,
    observation.liveReady !== true ? "provider-live-readiness-false" : null,
  ].filter(Boolean);
  const body = {
    type: "TTIVaultPaymentProviderCompatibilityReading", version: 1, recordedAt, customer: solicitation.customer, provider: observation.providerActor,
    solicitationId: solicitation.id, solicitationDigest: semanticId(solicitation), observationId: observation.id ?? semanticId(observation),
    evidenceClass: observation.evidenceClass, providerAcceptance: false, compatibility: incompatible === 0 && unknown === 0 ? "compatible-observation-still-requires-provider-offer" : "incompatible-current-observation",
    counts: { requirements: checks.length, compatible: checks.filter((row) => row.disposition === "compatible").length, incompatible, unknown },
    checks, operationalBlockers, economics: { customerPriceUnitAmount: expected.unitAmount, providerCostCeilingUnitAmount: solicitation.economics.providerCostCeilingHypothesis.unitAmount, observedProviderCost: observation.providerCostQuote ?? "unknown", profit: "unknown" },
    externalEffects: 0, checkoutCreated: false, paymentObserved: false, revenueRecognized: false, profitRecognized: false,
    nextProcurementAction: "Transmit the exact solicitation across an admitted provider contract and require a content-addressed service offer, cost quote, test catalog receipt, lifecycle capability manifest, and receipt-delivery contract before implementation or live activation.",
  };
  return { ...body, id: semanticId(body) };
}

export async function recordVaultPaymentProviderCompatibility(options = {}) {
  if (!options.witnessJournalAgentUrl) throw new Error("provider compatibility recording requires the contracted witness-journal RDF provider");
  const solicitation = options.solicitation ?? JSON.parse(await readFile(options.solicitationPath ?? SOLICITATION_PATH, "utf8"));
  const observation = options.observation ?? currentStripeProviderSourceObservation(options.recordedAt);
  const reading = options.reading ?? verifyVaultPaymentProviderCompatibility({ solicitation, observation, recordedAt: options.recordedAt });
  const graph = semanticId(reading);
  const witnessJournal = options.witnessJournal ?? turntideWitnessJournalBindingFromEnvironment();
  await recordWitnessJournalBatch({ agentUrl: options.witnessJournalAgentUrl, ...(witnessJournal ?? {}), batch: { settlement: TTI_ACCOUNT, graph, recordedAt: reading.recordedAt, document: reading, assertions: [
    { subject: TTI_ACTOR, predicate: "urn:emsenn:venture:payment-provider-compatibility-reading", object: { kind: "iri", value: graph } },
    { subject: graph, predicate: "urn:emsenn:venture:provider-compatibility", object: { kind: "literal", value: reading.compatibility } },
    { subject: graph, predicate: "urn:emsenn:venture:revenue-recognition", object: { kind: "literal", value: "forbidden-no-payment" } },
  ] } });
  return { ...reading, witnessReceiptId: graph };
}

function check(requirementId, passed, detail) { return { requirementId, disposition: passed ? "compatible" : requirementId === "REQ-PAY-010" && /absent/u.test(detail) ? "unknown" : "incompatible", detail: passed ? "observed capability satisfies the bounded requirement" : detail }; }
function costQuoteCompatible(solicitation, observation) { const quote = observation.providerCostQuote; return quote?.currency === solicitation.economics.providerCostCeilingHypothesis.currency && Number.isInteger(quote.unitAmount) && quote.unitAmount <= solicitation.economics.providerCostCeilingHypothesis.unitAmount && observation.attributableCostReceiptSchema !== null && observation.attributableCostReceiptSchema !== undefined; }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const solicitation = JSON.parse(await readFile(SOLICITATION_PATH, "utf8"));
  const result = process.argv.includes("--record")
    ? await recordVaultPaymentProviderCompatibility({ solicitation, witnessJournalAgentUrl: process.env.WITNESS_JOURNAL_RDF_AGENT })
    : verifyVaultPaymentProviderCompatibility({ solicitation, observation: currentStripeProviderSourceObservation() });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
