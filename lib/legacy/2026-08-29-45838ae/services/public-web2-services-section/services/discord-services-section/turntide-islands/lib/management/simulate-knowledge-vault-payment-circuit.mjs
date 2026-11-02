#!/usr/bin/env node

import { dirname, join, resolve } from "node:path";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { EMPTY_WITNESS_ROOT, identifyJsonSemanticContent } from "@red-cup-engineering/semantic-content-identify-service";
const semanticId = (value) => identifyJsonSemanticContent({ objectKind: "turntide-islands.record", value, witnessRoot: EMPTY_WITNESS_ROOT }).token;
// The Discord platform app's vault-provider-offer module self-addresses every record it mints (and recomputes the
// solicitation digest it checks a provider offer against) under its own "turntide-islands.discord-platform-record"
// object kind, not this module's "turntide-islands.record" — so any digest this simulation fabricates to satisfy
// that app-side check must be computed under the same object kind the app itself uses.
const discordPlatformSemanticId = (value) => identifyJsonSemanticContent({ objectKind: "turntide-islands.discord-platform-record", value, witnessRoot: EMPTY_WITNESS_ROOT }).token;
import { recordWitnessJournalBatch } from "@red-cup-engineering/witness-journal-document-service";
import { turntideWitnessJournalBindingFromEnvironment } from "./settlement-witness-journal-binding.mjs";
import { currentStripeProviderSourceObservation, verifyVaultPaymentProviderCompatibility } from "./verify-vault-payment-provider-compatibility.mjs";

const TTI_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const APP_DIST = join(TTI_ROOT, "src/apps/turntide-islands-discord-platform/dist/turntide-software-system");
const TTI_ACCOUNT = "eip155:31337:0xcfe1b9960ddbbe2b95e48114c281d7f24eb87b4d";
const TTI_ACTOR = "urn:ame:turntide-islands";
const CIRCUIT_ID = "tti-market-circuit-founding-knowledge-vault-2026-01";
const REQUEST_DIGEST = "ni:///sha-256;AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

export function verifyKnowledgeVaultPaymentSimulationReceipt(receipt) {
  const errors = [];
  if (receipt?.type !== "TTIKnowledgeVaultPaymentCircuitSimulation" || receipt?.simulation !== true) errors.push("simulation-identity-absent");
  if (receipt?.mode !== "deterministic-synthetic-no-external-effects" || receipt?.simulatedCircuitExternalEffects !== 0) errors.push("external-effects-not-zero");
  if (receipt?.recognition?.charge !== "forbidden" || receipt?.recognition?.revenue !== "forbidden" || receipt?.recognition?.profit !== "forbidden") errors.push("economic-recognition-leak");
  if (receipt?.authority?.liveActivationAdmissionUsed !== false || receipt?.authority?.discordIdentityVerified !== false) errors.push("live-authority-leak");
  if (receipt?.authority?.providerOfferAuthorityUsed !== false || receipt?.providerProcurement?.providerAcceptance !== false || receipt?.providerProcurement?.providerAuthenticated !== false || receipt?.providerProcurement?.offerDecisionStatus !== "simulated-admitted") errors.push("provider-authority-leak");
  if (receipt?.privacy?.discordUserIdCrossedPaymentProviderBoundary !== false) errors.push("discord-identity-boundary-leak");
  if (receipt?.entitlement?.evidenceClass !== "synthetic-nonposting" || receipt?.entitlement?.planId !== "vault-subscriber-monthly") errors.push("entitlement-class-invalid");
  if (receipt?.discordFulfillment?.vaultSubscriberRoleGranted !== true || receipt?.discordFulfillment?.islanderRoleGranted !== false) errors.push("role-separation-failed");
  if (!Array.isArray(receipt?.cells) || receipt.cells.some((cell) => cell.outcome !== "simulated-passed")) errors.push("simulation-cell-open");
  return { type: "TTIKnowledgeVaultPaymentCircuitSimulationVerification", status: errors.length === 0 ? "passed" : "failed", errors };
}

export async function simulateKnowledgeVaultPaymentCircuit(options = {}) {
  const recordedAt = options.recordedAt ?? "2026-07-21T22:30:00.000Z";
  const workspace = await mkdtemp(join(os.tmpdir(), "tti-vault-payment-simulation-"));
  try {
  const [{ InMemoryDiscordTransport }, membership, payment, checkout, providerOffer, identifiers] = await Promise.all([
    import(pathToFileURL(join(APP_DIST, "discord.mjs")).href),
    import(pathToFileURL(join(APP_DIST, "membership.mjs")).href),
    import(pathToFileURL(join(APP_DIST, "vault-payment.mjs")).href),
    import(pathToFileURL(join(APP_DIST, "vault-checkout.mjs")).href),
    import(pathToFileURL(join(APP_DIST, "vault-provider-offer.mjs")).href),
    import(pathToFileURL(join(APP_DIST, "vault-market-constants.mjs")).href),
  ]);
  const discordUserId = "123456789012345678";
  const invitationConfig = checkout.vaultCheckoutInvitationConfig({ TTI_PUBLIC_ORIGIN: "https://simulation.invalid", DISCORD_GUILD_ID: "123456789012345679", TURNTIDE_DATA_ROOT: workspace });
  const issuedInvitation = await checkout.issueVaultCheckoutInvitation({ interactionId: "123456789012345680", guildId: invitationConfig.guildId, userId: discordUserId, config: invitationConfig, now: new Date(recordedAt), token: "synthetic-vault-invitation-token-0001" });
  const invitationUrl = new URL(issuedInvitation.checkoutUrl);
  const invitationPage = await checkout.vaultCheckoutHttpResponse({ method: "GET", url: invitationUrl, config: invitationConfig, now: new Date(recordedAt) });
  if (invitationPage.status !== 200 || !invitationPage.body.includes("Payments are not live")) throw new Error("synthetic verified checkout invitation did not render safely");
  const intentResponse = await checkout.vaultCheckoutHttpResponse({ method: "POST", url: invitationUrl, contentType: "application/x-www-form-urlencoded", body: new URLSearchParams({ session: "synthetic-vault-invitation-token-0001", productDigest: issuedInvitation.invitation.productDigest, checkoutIntentConfirmed: "yes" }).toString(), config: invitationConfig, now: new Date(recordedAt) });
  if (intentResponse.status !== 202 || typeof intentResponse.intentId !== "string") throw new Error("synthetic qualified checkout intent was not recorded");
  const solicitation = JSON.parse(await readFile(join(TTI_ROOT, "content", "solicitations", "founding-knowledge-vault-subscription-provider.json"), "utf8"));
  const { id: _discardedSourceObservationId, ...sourceCapabilities } = currentStripeProviderSourceObservation(recordedAt);
  const simulatedProviderObservation = {
    ...sourceCapabilities,
    providerActor: "urn:simulation:stripe-payment-provider-fixture",
    evidenceClass: "wholly-synthetic-compatible-capability-fixture-not-provider-offer-or-refusal",
    credentialMode: "synthetic-test-only",
    webhookSecretPresent: true,
    customerContractTokenPresent: true,
    liveReady: false,
    offerings: [{
      id: solicitation.product.offeringId,
      status: "synthetic-compatible-fixture",
      mode: solicitation.product.mode,
      currency: solicitation.product.currency,
      unitAmount: solicitation.product.unitAmount,
      billingPeriod: solicitation.product.billingPeriod,
      quantity: { minimum: 1, maximum: 1 },
      beneficiarySettlement: solicitation.beneficiarySettlement,
    }],
    subscriptionCorrelationScopes: ["checkout", "subscription", "invoice"],
    supportedEventTypes: ["checkout.session.completed", "checkout.session.expired", "invoice.paid", "invoice.payment_failed", "customer.subscription.updated", "customer.subscription.deleted", "charge.refunded", "dispute.created-or-updated"],
    authenticatedFullReceiptDelivery: true,
    providerCostQuote: { currency: "usd", unitAmount: 70, billingPeriod: "P1M", evidenceClass: "synthetic" },
    attributableCostReceiptSchema: "ni:///sha-256;AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  };
  const providerCompatibility = verifyVaultPaymentProviderCompatibility({ solicitation, observation: simulatedProviderObservation, recordedAt });
  if (providerCompatibility.compatibility !== "compatible-observation-still-requires-provider-offer" || providerCompatibility.counts.compatible !== providerCompatibility.counts.requirements) throw new Error("synthetic provider procurement gate did not close");
  const syntheticOfferBody = {
    type: "TTIVaultSubscriptionProviderServiceOffer", version: 1, offerContract: identifiers.PROVIDER_OFFER_CONTRACT,
    solicitationId: identifiers.PROVIDER_SOLICITATION_ID, solicitationDigest: discordPlatformSemanticId(solicitation), provider: payment.PAYMENT_PROVIDER_ACTOR, customer: payment.TTI_ACTOR,
    legalMerchant: solicitation.legalMerchant, beneficiarySettlement: solicitation.beneficiarySettlement, validFrom: "2026-07-21T00:00:00.000Z", expiresAt: "2026-08-20T00:00:00.000Z", serviceMode: "test-and-live-subject-to-separate-activation",
    product: { productId: payment.VAULT_PRODUCT_ID, offeringId: payment.VAULT_OFFERING_ID, planId: payment.VAULT_PLAN_ID, mode: "subscription", currency: "usd", unitAmount: 500, billingPeriod: "P1M", quantity: 1 },
    contracts: { checkout: identifiers.CURRENT_PROVIDER_CHECKOUT_CONTRACT, webhook: identifiers.CURRENT_PROVIDER_WEBHOOK_CONTRACT, receiptDelivery: REQUEST_DIGEST },
    capabilities: { catalogDerivesPrice: true, callerOverridesRefused: true, subscriptionCheckout: true, idempotentCheckout: true, opaqueCustomerReference: true, discordIdentityRequired: false, correlationScopes: ["checkout", "subscription", "invoice"], rawStripeSignatureVerification: true, replayTolerance: true, bodyBound: true, eventDeduplication: true, rawBodyRecorded: false, buyerPersonalDataRecorded: false, eventTypes: ["checkout.session.completed", "checkout.session.expired", "invoice.paid", "invoice.payment_failed", "customer.subscription.updated", "customer.subscription.deleted", "charge.refunded", "dispute.created-or-updated"], customerSettlementMutationAuthority: false, authenticatedReceiptDelivery: true, idempotentReceiptDelivery: true, customerAcknowledgmentAndRetry: true, testLiveSeparation: true },
    economics: { currency: "usd", billingPeriod: "P1M", maximumProviderCostUnitAmount: 70, attributableCostReceiptSchema: REQUEST_DIGEST },
    evidence: { providerWitnessReceiptId: REQUEST_DIGEST, requirements: Array.from({ length: 10 }, (_, index) => ({ requirementId: `REQ-PAY-${String(index + 1).padStart(3, "0")}`, evidenceIds: [REQUEST_DIGEST] })) },
  };
  const syntheticOfferObject = { ...syntheticOfferBody, id: providerOffer.providerOfferObjectId(syntheticOfferBody) };
  const syntheticOfferActivity = { "@context": "https://www.w3.org/ns/activitystreams", id: "urn:tti:simulation:provider-offer-activity", type: "Offer", actor: payment.PAYMENT_PROVIDER_ACTOR, target: payment.TTI_ACTOR, object: syntheticOfferObject };
  const syntheticOfferIngress = providerOffer.inspectVaultProviderOfferIngress({ activity: syntheticOfferActivity, receivedAt: recordedAt, simulationMode: true });
  const syntheticOfferDecision = providerOffer.decideVaultProviderOffer({ activity: syntheticOfferActivity, ingress: syntheticOfferIngress, solicitation, decidedAt: recordedAt });
  if (syntheticOfferDecision.type !== "TTIVaultProviderOfferAdmissionDecision" || syntheticOfferDecision.status !== "simulated-qualified-for-test" || syntheticOfferDecision.providerAuthenticated !== false || syntheticOfferDecision.providerAuthoredOfferObserved !== false) throw new Error("synthetic provider offer authority escaped simulation");
  const operationalTestSpecifications = [
    ["TTIProviderCatalogAcceptanceTestReceipt", ["REQ-PAY-001", "REQ-PAY-002", "REQ-PAY-003", "REQ-PAY-009"]], ["TTIProviderSubscriptionCorrelationTestReceipt", ["REQ-PAY-004"]],
    ["TTIProviderWebhookSecurityTestReceipt", ["REQ-PAY-005"]], ["TTIProviderLifecycleReceiptTestReceipt", ["REQ-PAY-006"]], ["TTIProviderSovereigntyTestReceipt", ["REQ-PAY-007"]],
    ["TTIProviderReceiptDeliveryTestReceipt", ["REQ-PAY-008"]], ["TTIProviderCostReceiptTestReceipt", ["REQ-PAY-010"]],
  ];
  const operationalTestReceipts = operationalTestSpecifications.map(([type, requirementIds]) => {
    const body = { type, version: 1, status: "passed", customer: payment.TTI_ACTOR, provider: payment.PAYMENT_PROVIDER_ACTOR, offerId: syntheticOfferDecision.offerId, offerDecisionId: syntheticOfferDecision.id, requirementIds, contracts: syntheticOfferDecision.contracts, simulation: true, witnessed: true, witnessReceiptId: REQUEST_DIGEST };
    return { ...body, id: providerOffer.providerOfferObjectId(body) };
  });
  const syntheticOperationalAdmission = providerOffer.decideVaultProviderOperationalAdmission({ offerDecision: syntheticOfferDecision, testReceipts: operationalTestReceipts, decidedAt: recordedAt, simulationMode: true });
  if (syntheticOperationalAdmission.type !== "TTIVaultProviderOperationalAdmissionDecision" || syntheticOperationalAdmission.status !== "simulated-admitted" || syntheticOperationalAdmission.simulation !== true) throw new Error("synthetic operational provider admission did not close without live authority");
  const built = payment.buildVaultCheckoutSolicitation({
    discordUserId,
    orderReference: issuedInvitation.invitation.orderReference,
    requestId: issuedInvitation.invitation.providerRequestId,
    publicOrigin: "https://simulation.invalid",
    providerCheckoutContract: identifiers.CURRENT_PROVIDER_CHECKOUT_CONTRACT,
    providerWebhookContract: identifiers.CURRENT_PROVIDER_WEBHOOK_CONTRACT,
  });
  if (JSON.stringify(built.activity).includes(discordUserId)) throw new Error("synthetic checkout leaked Discord identity across provider boundary");
  const providerCheckout = {
    type: "Accept", actor: payment.PAYMENT_PROVIDER_ACTOR, target: payment.TTI_ACTOR,
    object: { id: "urn:stripe-checkout-receipt:cs_test_synthetic", type: "StripeCheckoutSessionReceipt", contract: identifiers.CURRENT_PROVIDER_CHECKOUT_CONTRACT, customerSettlement: payment.TTI_ACTOR, offeringId: payment.VAULT_OFFERING_ID, requestDigest: REQUEST_DIGEST, checkoutUrl: "https://checkout.stripe.com/c/pay/synthetic", paymentStatus: "unpaid", status: "open" },
  };
  const binding = payment.bindProviderCheckoutResponse(built.pendingBinding, providerCheckout, { recordedAt, simulation: true });
  if (binding.type === "TTIVaultPaymentRefusal") throw new Error(`synthetic checkout binding refused: ${binding.reason}`);
  const providerEvent = {
    type: "Create", actor: payment.PAYMENT_PROVIDER_ACTOR, target: payment.TTI_ACTOR,
    object: { id: "urn:stripe-event-receipt:evt_synthetic", type: "StripeWebhookEventReceipt", law: identifiers.CURRENT_PROVIDER_WEBHOOK_CONTRACT, stripeEventId: "evt_synthetic", eventType: "checkout.session.completed", created: 1_753_132_800, livemode: false, paymentStatus: "paid", status: "complete", requestDigest: REQUEST_DIGEST, offeringId: payment.VAULT_OFFERING_ID, customerSettlement: payment.TTI_ACTOR, signatureVerified: true, supported: true, duplicate: false, rawBodyRecorded: false, buyerPersonalDataRecorded: false },
  };
  const decision = payment.admitVaultProviderReceipt({ activity: providerEvent, binding, observedAt: recordedAt, simulationMode: true });
  if (decision.type === "TTIVaultPaymentRefusal") throw new Error(`synthetic provider receipt refused: ${decision.reason}`);

  const transport = new InMemoryDiscordTransport();
  const guild = (await transport.listGuilds())[0];
  const islanderRole = await transport.createRole(guild.id, { name: "islander" });
  const vaultRole = await transport.createRole(guild.id, { name: "vault subscriber" });
  const config = { guildId: guild.id, roleId: islanderRole.id, entitlementsFile: "synthetic-never-written", tiers: [
    { planId: "islander-monthly", roleId: islanderRole.id, capabilities: ["discord-injection", "vault-access"] },
    { planId: payment.VAULT_PLAN_ID, roleId: vaultRole.id, capabilities: ["vault-access"] },
  ] };
  await membership.reconcileMembershipEntitlements(transport, config, [decision]);

  const body = {
    type: "TTIKnowledgeVaultPaymentCircuitSimulation", version: 2, circuitId: CIRCUIT_ID, venture: TTI_ACTOR, recordedAt,
    simulation: true, mode: "deterministic-synthetic-no-external-effects", simulatedCircuitExternalEffects: 0,
    fixtureClass: "wholly-synthetic-no-human-identity-demand-charge-payment-provider-call-or-revenue",
    authority: { liveActivationAdmissionUsed: false, discordIdentityVerified: false, providerOfferAuthorityUsed: false, livePaymentAuthority: false, liveRoleMutationAuthority: false },
    recognition: { checkout: "synthetic", charge: "forbidden", revenue: "forbidden", profit: "forbidden", entitlementPosting: "forbidden" },
    privacy: { discordUserIdCrossedPaymentProviderBoundary: false, rawStripeBodyEnteredTTI: false, buyerPaymentDataRecorded: false },
    cells: [
      { id: "verified-discord-checkout-ingress", outcome: "simulated-passed", evidenceType: issuedInvitation.invitation.type },
      { id: "qualified-checkout-intent-observer", outcome: "simulated-passed", evidenceType: "TTIVaultCheckoutIntent" },
      { id: "payment-provider-procurement", outcome: "simulated-passed", evidenceType: syntheticOperationalAdmission.type },
      { id: "stripe-checkout-provider", outcome: "simulated-passed", evidenceType: "synthetic-provider-checkout-receipt" },
      { id: "tti-entitlement-admission", outcome: "simulated-passed", evidenceType: decision.type },
      { id: "discord-access-fulfillment", outcome: "simulated-passed", evidenceType: "in-memory-dedicated-role-reconciliation" },
    ],
    providerProcurement: { compatibilityReadingId: providerCompatibility.id, offerIngressReceiptId: syntheticOfferIngress.id, offerQualificationDecisionId: syntheticOfferDecision.id, offerQualificationStatus: syntheticOfferDecision.status, operationalAdmissionDecisionId: syntheticOperationalAdmission.id, offerDecisionStatus: syntheticOperationalAdmission.status, operationalTests: syntheticOperationalAdmission.counts, requirements: syntheticOfferDecision.counts.requirements, claimedCompatible: syntheticOfferDecision.counts.claimedCompatible, providerAcceptance: false, providerAuthenticated: false, evidenceClass: syntheticOperationalAdmission.evidenceClass },
    checkout: { invitationType: issuedInvitation.invitation.type, qualifiedIntentId: intentResponse.intentId, offeringId: payment.VAULT_OFFERING_ID, requestDigest: binding.requestDigest, providerCheckoutReceiptId: binding.providerCheckoutReceiptId, paymentStatusAtCreation: "unpaid" },
    entitlement: { id: decision.id, planId: decision.planId, status: decision.status, evidenceClass: decision.evidenceClass },
    discordFulfillment: { vaultSubscriberRoleGranted: transport.memberHasRole(guild.id, discordUserId, vaultRole.id), islanderRoleGranted: transport.memberHasRole(guild.id, discordUserId, islanderRole.id) },
    liveResidue: [
      "Leader-authorized commercial terms",
      "provider subscription catalog offering",
      "provider subscription lifecycle receipts",
      "production public DNS/HTTPS deployment and identity-ingress evidence admission",
      "public HTTPS and boundary credentials",
      "contracted witness-journal RDF witness at activation",
    ],
    inference: "synthetic-initial-checkout-to-dedicated-role-path-closes-live-revenue-circuit-remains-open",
  };
  const verification = verifyKnowledgeVaultPaymentSimulationReceipt(body);
  if (verification.status !== "passed") throw new Error(`vault payment simulation DRC failed: ${verification.errors.join(",")}`);
  return { ...body, designRuleVerification: verification, id: semanticId({ ...body, designRuleVerification: verification }) };
  } finally { await rm(workspace, { recursive: true, force: true }); }
}

export async function recordKnowledgeVaultPaymentSimulation(options = {}) {
  if (!options.witnessJournalAgentUrl) throw new Error("simulation recording requires the contracted witness-journal RDF provider");
  const receipt = options.receipt ?? await simulateKnowledgeVaultPaymentCircuit(options);
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
    ? await recordKnowledgeVaultPaymentSimulation({ witnessJournalAgentUrl: process.env.WITNESS_JOURNAL_RDF_AGENT })
    : await simulateKnowledgeVaultPaymentCircuit();
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}
