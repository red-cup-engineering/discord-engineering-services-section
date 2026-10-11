import assert from "node:assert/strict";
import test from "node:test";
import { identifyTurntideDiscordPlatformRecord as semanticId } from "../src/turntide-software-system/discord-platform-record-semantic-content.mjs";
import { serveTurntide } from "../src/turntide-software-system/serve.mjs";
import {
  decideVaultProviderOffer,
  decideVaultProviderOperationalAdmission,
  inspectVaultProviderOfferIngress,
  loadVaultProviderSolicitation,
  providerOfferObjectId,
  recordVaultProviderOperationalAdmission,
  recordVaultProviderOperationalTestReceipt,
  vaultProviderOfferHttpResponse,
} from "../src/turntide-software-system/vault-provider-offer.mjs";
import {
  PAYMENT_PROVIDER_ACTOR,
  PROVIDER_OFFER_CONTRACT,
  PROVIDER_OFFER_DECISION_CATEGORY,
  PROVIDER_OFFER_INGRESS_CATEGORY,
  PROVIDER_OPERATIONAL_ADMISSION_CATEGORY,
  PROVIDER_SOLICITATION_ID,
  TTI_ACTOR,
  VAULT_OFFERING_ID,
  VAULT_PLAN_ID,
  VAULT_PRODUCT_ID,
} from "../src/turntide-software-system/vault-market-constants.mjs";

// RFC 6920 canonical sha-256 ni URIs only accept a terminal base64url character from
// {A,E,I,M,Q,U,Y,c,g,k,o,s,w,0,4,8} (the last sextet's two zero-pad bits) -- repeated-letter
// placeholders like "BBB...BBB" are not valid canonical addresses. These are real sha-256 digests
// of distinct fixture seed strings, computed via node:crypto and base64url-encoded.
const evidenceId = "ni:///sha-256;AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const checkoutContract = "ni:///sha-256;3WFO92nZt8s5YfWADFBG9LEpmgTD3piHh2d0T2HtkQk";
const webhookContract = "ni:///sha-256;F0aTBtMNghoYm9ImjDP1JqtxVNWI-ziSdVUmBzkqswM";
const deliveryContract = "ni:///sha-256;e-EXziLzoONQr6OjijiUFZbk5dspRERD3qTIO46efMg";
const token = "offer-contract-token-32-bytes-minimum-value";
const source = { TTI_VAULT_PROVIDER_OFFER_TOKEN: token };
const solicitation = loadVaultProviderSolicitation();

function completeActivity(mutator = (value) => value) {
  const body = mutator({
    type: "TTIVaultSubscriptionProviderServiceOffer",
    version: 1,
    offerContract: PROVIDER_OFFER_CONTRACT,
    solicitationId: PROVIDER_SOLICITATION_ID,
    solicitationDigest: semanticId(solicitation),
    provider: PAYMENT_PROVIDER_ACTOR,
    customer: TTI_ACTOR,
    legalMerchant: solicitation.legalMerchant,
    beneficiarySettlement: solicitation.beneficiarySettlement,
    validFrom: "2026-07-21T00:00:00.000Z",
    expiresAt: "2026-08-20T00:00:00.000Z",
    serviceMode: "test-and-live-subject-to-separate-activation",
    product: { productId: VAULT_PRODUCT_ID, offeringId: VAULT_OFFERING_ID, planId: VAULT_PLAN_ID, mode: "subscription", currency: "usd", unitAmount: 500, billingPeriod: "P1M", quantity: 1 },
    contracts: { checkout: checkoutContract, webhook: webhookContract, receiptDelivery: deliveryContract },
    capabilities: {
      catalogDerivesPrice: true, callerOverridesRefused: true, subscriptionCheckout: true, idempotentCheckout: true, opaqueCustomerReference: true, discordIdentityRequired: false,
      correlationScopes: ["checkout", "subscription", "invoice"], rawStripeSignatureVerification: true, replayTolerance: true, bodyBound: true, eventDeduplication: true, rawBodyRecorded: false, buyerPersonalDataRecorded: false,
      eventTypes: ["checkout.session.completed", "checkout.session.expired", "invoice.paid", "invoice.payment_failed", "customer.subscription.updated", "customer.subscription.deleted", "charge.refunded", "dispute.created-or-updated"],
      customerSettlementMutationAuthority: false, authenticatedReceiptDelivery: true, idempotentReceiptDelivery: true, customerAcknowledgmentAndRetry: true, testLiveSeparation: true,
    },
    economics: { currency: "usd", billingPeriod: "P1M", maximumProviderCostUnitAmount: 70, attributableCostReceiptSchema: evidenceId },
    evidence: { providerWitnessReceiptId: evidenceId, requirements: Array.from({ length: 10 }, (_, index) => ({ requirementId: `REQ-PAY-${String(index + 1).padStart(3, "0")}`, evidenceIds: [evidenceId] })) },
  });
  const object = { ...body, id: providerOfferObjectId(body) };
  return { "@context": "https://www.w3.org/ns/activitystreams", id: "urn:provider-offer-activity:synthetic-001", type: "Offer", actor: PAYMENT_PROVIDER_ACTOR, target: TTI_ACTOR, object };
}

function memoryStore() {
  const data = new Map();
  return {
    data,
    records(category) { return data.get(category) ?? []; },
    async record({ category, record }) { const values = data.get(category) ?? []; values.push(record); data.set(category, values); return { recorded: true }; },
  };
}

test("authenticated exact offer qualifies all ten bounded claims for testing without treating references as proof", async () => {
  const store = memoryStore(), activity = completeActivity();
  const response = await vaultProviderOfferHttpResponse({ authorization: `Bearer ${token}`, contentType: "application/activity+json", body: JSON.stringify(activity), source, store, recordedAt: "2026-07-22T00:00:00.000Z" });
  assert.equal(response.status, 202);
  assert.equal(response.body.customerAdmission, "qualified-for-test");
  assert.equal(response.body.contractExecuted, false);
  assert.equal(response.body.paymentObserved, false);
  assert.equal(response.body.revenueRecognized, false);
  const decisions = store.records(PROVIDER_OFFER_DECISION_CATEGORY);
  assert.equal(store.records(PROVIDER_OFFER_INGRESS_CATEGORY).length, 1);
  assert.equal(decisions.length, 1);
  assert.deepEqual(decisions[0].counts, { requirements: 10, claimedCompatible: 10, incompatible: 0 });
  assert.equal(decisions[0].economics.quotedMaximumProviderCostUnitAmount, 70);
  assert.equal(decisions[0].economics.projectedPreFulfillmentContributionUnitAmount, 430);
  assert.equal(decisions[0].economics.observedAttributableCost, "unknown");
  assert.equal(decisions[0].economics.profit, "unknown");

  const replayActivity = { ...activity, id: "urn:provider-offer-activity:synthetic-retry-002" };
  const replay = await vaultProviderOfferHttpResponse({ authorization: `Bearer ${token}`, contentType: "application/activity+json", body: JSON.stringify(replayActivity), source, store, recordedAt: "2026-07-22T00:01:00.000Z" });
  assert.equal(replay.status, 200);
  assert.equal(store.records(PROVIDER_OFFER_INGRESS_CATEGORY).length, 1);
  assert.equal(store.records(PROVIDER_OFFER_DECISION_CATEGORY).length, 1);
});

test("only seven exact TTI-observed test receipts promote a qualified offer to operational admission", async () => {
  const store = memoryStore(), activity = completeActivity();
  await vaultProviderOfferHttpResponse({ authorization: `Bearer ${token}`, contentType: "application/activity+json", body: JSON.stringify(activity), source, store, recordedAt: "2026-07-22T00:00:00.000Z" });
  const offerDecision = store.records(PROVIDER_OFFER_DECISION_CATEGORY)[0];
  assert.equal(offerDecision.status, "qualified-for-test");
  const specifications = [
    ["TTIProviderCatalogAcceptanceTestReceipt", ["REQ-PAY-001", "REQ-PAY-002", "REQ-PAY-003", "REQ-PAY-009"]],
    ["TTIProviderSubscriptionCorrelationTestReceipt", ["REQ-PAY-004"]],
    ["TTIProviderWebhookSecurityTestReceipt", ["REQ-PAY-005"]],
    ["TTIProviderLifecycleReceiptTestReceipt", ["REQ-PAY-006"]],
    ["TTIProviderSovereigntyTestReceipt", ["REQ-PAY-007"]],
    ["TTIProviderReceiptDeliveryTestReceipt", ["REQ-PAY-008"]],
    ["TTIProviderCostReceiptTestReceipt", ["REQ-PAY-010"]],
  ];
  const receipts = specifications.map(([type, requirementIds]) => {
    const body = { type, version: 1, status: "passed", customer: TTI_ACTOR, provider: PAYMENT_PROVIDER_ACTOR, offerId: offerDecision.offerId, offerDecisionId: offerDecision.id, requirementIds, contracts: offerDecision.contracts, simulation: false, witnessed: true, witnessReceiptId: evidenceId };
    return { ...body, id: providerOfferObjectId(body) };
  });
  const incomplete = decideVaultProviderOperationalAdmission({ offerDecision, testReceipts: receipts.slice(0, -1), decidedAt: "2026-07-22T01:00:00.000Z" });
  assert.equal(incomplete.status, "refused");
  assert.deepEqual(incomplete.counts, { requiredTests: 7, passed: 6, failed: 1 });
  const admitted = decideVaultProviderOperationalAdmission({ offerDecision, testReceipts: receipts, decidedAt: "2026-07-22T01:00:00.000Z" });
  assert.equal(admitted.status, "admitted");
  assert.equal(admitted.liveActivationAuthority, false);
  assert.equal(admitted.paymentObserved, false);
  await assert.rejects(() => recordVaultProviderOperationalAdmission(store, admitted), /test receipts are absent/u);
  for (const receipt of receipts) await recordVaultProviderOperationalTestReceipt(store, receipt);
  await recordVaultProviderOperationalAdmission(store, admitted);
  assert.equal(store.records(PROVIDER_OPERATIONAL_ADMISSION_CATEGORY)[0].id, admitted.id);
  const synthetic = { ...admitted, status: "simulated-admitted", simulation: true };
  await assert.rejects(() => recordVaultProviderOperationalAdmission(store, synthetic), /only a non-synthetic/u);
});

test("unauthenticated offer is refused before parsing or durable mutation", async () => {
  const store = memoryStore();
  const response = await vaultProviderOfferHttpResponse({ authorization: "Bearer wrong", contentType: "application/activity+json", body: "not json", source, store });
  assert.equal(response.status, 401);
  assert.equal(response.body.reason, "payment-provider-offer-not-authenticated");
  assert.equal(store.data.size, 0);
});

test("HTTP offer route authenticates before requesting witness authority", async () => {
  const running = await serveTurntide({ port: 0, env: { TTI_VAULT_PROVIDER_OFFER_TOKEN: token, TTI_TICK_INTERVAL_MS: "0", TTI_DAILY_DIVINATION_CHECK_INTERVAL_MS: "0" } });
  try {
    await new Promise((resolve) => setTimeout(resolve, 25));
    const endpoint = `http://${running.host}:${running.port}/membership/payment-provider/offer`;
    const unauthenticated = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/activity+json" }, body: "not-json" });
    assert.equal(unauthenticated.status, 401);
    assert.equal((await unauthenticated.json()).reason, "payment-provider-offer-not-authenticated");
    const noWitnessAuthority = await fetch(endpoint, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/activity+json" }, body: JSON.stringify(completeActivity()) });
    assert.equal(noWitnessAuthority.status, 503);
    assert.equal((await noWitnessAuthority.json()).reason, "provider-offer-witness-service-unavailable");
  } finally { await running.close(); }
});

test("identity, actor, personal-data, expiry, lifecycle, evidence, and price mutations fail closed", () => {
  const cases = [
    { reason: "actor", mutateActivity: (activity) => ({ ...activity, actor: "urn:attacker" }), ingressRefused: true },
    { reason: "identity", mutateActivity: (activity) => ({ ...activity, object: { ...activity.object, unitAmount: 1 } }), ingressRefused: true },
    { reason: "personal-data", build: () => completeActivity((body) => ({ ...body, discordUserId: "123456789012345678" })), ingressRefused: true },
    { reason: "expired", build: () => completeActivity((body) => ({ ...body, expiresAt: "2026-07-21T12:00:00.000Z" })) },
    { reason: "events", build: () => completeActivity((body) => ({ ...body, capabilities: { ...body.capabilities, eventTypes: body.capabilities.eventTypes.filter((event) => event !== "invoice.paid") } })) },
    { reason: "evidence", build: () => completeActivity((body) => ({ ...body, evidence: { ...body.evidence, requirements: body.evidence.requirements.filter((row) => row.requirementId !== "REQ-PAY-008") } })) },
    { reason: "price", build: () => completeActivity((body) => ({ ...body, economics: { ...body.economics, maximumProviderCostUnitAmount: 101 } })) },
  ];
  for (const scenario of cases) {
    const original = scenario.build?.() ?? completeActivity();
    const activity = scenario.mutateActivity?.(original) ?? original;
    const ingress = inspectVaultProviderOfferIngress({ activity, receivedAt: "2026-07-22T00:00:00.000Z" });
    if (scenario.ingressRefused) {
      assert.equal(ingress.status, "refused", scenario.reason);
    } else {
      assert.equal(ingress.status, "accepted", scenario.reason);
      const decision = decideVaultProviderOffer({ activity, ingress, solicitation, decidedAt: "2026-07-22T00:00:00.000Z" });
      assert.equal(decision.status, "refused", scenario.reason);
      assert.equal(decision.counts.claimedCompatible + decision.counts.incompatible, 10, scenario.reason);
      if (scenario.reason === "expired") assert.ok(decision.admissionBlockers.includes("provider-offer-not-current-or-validity-window-exceeds-90-days"));
      assert.equal(decision.contractExecuted, false);
      assert.equal(decision.revenueRecognized, false);
    }
  }
});
