import { timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { identifyTurntideDiscordPlatformRecord as semanticId } from "./discord-platform-record-semantic-content.mjs";
import { isNiUri } from "@red-cup-engineering/uri-services-section/ni-uri";
import { } from "./settlement-witness.mjs";
import { env, publicTurntideContentPath } from "./env.mjs";
import {
  PAYMENT_PROVIDER_ACTOR,
  PROVIDER_OFFER_DECISION_CATEGORY,
  PROVIDER_OFFER_INGRESS_CATEGORY,
  PROVIDER_OPERATIONAL_ADMISSION_CATEGORY,
  PROVIDER_OPERATIONAL_TEST_RECEIPT_CATEGORY,
  PROVIDER_SOLICITATION_ID,
  TTI_ACTOR,
  VAULT_OFFERING_ID,
  VAULT_PLAN_ID,
  VAULT_PRODUCT_ID,
} from "./vault-market-constants.mjs";

const solicitationPath = () => publicTurntideContentPath(process.env, "solicitations", "founding-knowledge-vault-subscription-provider.json");
const REQUIRED_EVENTS = ["checkout.session.completed", "checkout.session.expired", "invoice.paid", "invoice.payment_failed", "customer.subscription.updated", "customer.subscription.deleted", "charge.refunded", "dispute.created-or-updated"];
const REQUIRED_CORRELATION = ["checkout", "subscription", "invoice"];
const REQUIRED_REQUIREMENTS = Array.from({ length: 10 }, (_, index) => `REQ-PAY-${String(index + 1).padStart(3, "0")}`);
const REQUIRED_OPERATIONAL_TESTS = [
  ["TTIProviderCatalogAcceptanceTestReceipt", ["REQ-PAY-001", "REQ-PAY-002", "REQ-PAY-003", "REQ-PAY-009"]],
  ["TTIProviderSubscriptionCorrelationTestReceipt", ["REQ-PAY-004"]],
  ["TTIProviderWebhookSecurityTestReceipt", ["REQ-PAY-005"]],
  ["TTIProviderLifecycleReceiptTestReceipt", ["REQ-PAY-006"]],
  ["TTIProviderSovereigntyTestReceipt", ["REQ-PAY-007"]],
  ["TTIProviderReceiptDeliveryTestReceipt", ["REQ-PAY-008"]],
  ["TTIProviderCostReceiptTestReceipt", ["REQ-PAY-010"]],
];
const PROHIBITED_OFFER_KEYS = new Set(["authorization", "apiKey", "bearerToken", "buyerEmail", "buyerPersonalData", "discordUserId", "rawStripeBody", "stripeSecretKey", "webhookSecret"]);

export function loadVaultProviderSolicitation(file = solicitationPath()) {
  return JSON.parse(readFileSync(file, "utf8"));
}

export function providerOfferAuthorized(header, source = process.env) {
  const expected = env("TTI_VAULT_PROVIDER_OFFER_TOKEN", source);
  const actual = header?.replace(/^Bearer /u, "");
  if (expected === undefined || actual === undefined || expected.length < 32 || expected.length !== actual.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
}

export function providerOfferObjectId(object) {
  const { id: _discardedSelfIdentity, ...body } = object;
  return semanticId(body);
}

export function inspectVaultProviderOfferIngress(input

) {
  const activity = input.activity;
  const object = asRecord(activity["object"]);
  const offerId = stringValue(object["id"]);
  const bodyDigest = semanticId(object);
  const activityId = stringValue(activity["id"]) ?? null;
  let reason = null;
  if (activity["@context"] !== "https://www.w3.org/ns/activitystreams" || activity["type"] !== "Offer") reason = "provider-offer-activity-envelope-invalid";
  else if (activity["actor"] !== PAYMENT_PROVIDER_ACTOR || activity["target"] !== TTI_ACTOR) reason = "provider-offer-actor-or-target-mismatch";
  else if (object["type"] !== "TTIVaultSubscriptionProviderServiceOffer" || object["version"] !== 1) reason = "provider-offer-object-type-invalid";
  else if (offerId === undefined || offerId !== providerOfferObjectId(object)) reason = "provider-offer-content-identity-mismatch";
  else if (containsProhibitedKey(object)) reason = "provider-offer-contains-prohibited-secret-or-personal-data-field";
  const conflicting = offerId === undefined ? undefined : (input.priorReceipts ?? []).find((candidate) => candidate.status === "accepted" && candidate.offerId === offerId && candidate.bodyDigest !== bodyDigest);
  if (reason === null && conflicting !== undefined) reason = "provider-offer-identity-replay-conflict";
  const existing = offerId === undefined ? undefined : (input.priorReceipts ?? []).find((candidate) => candidate.status === "accepted" && candidate.offerId === offerId && candidate.bodyDigest === bodyDigest);
  if (reason === null && existing !== undefined) return existing;
  const body = {
    type: "TTIVaultProviderOfferIngressReceipt",
    version: 1,
    status: reason === null ? "accepted" : "refused",
    receivedAt: input.receivedAt ?? new Date().toISOString(),
    provider: PAYMENT_PROVIDER_ACTOR,
    customer: TTI_ACTOR,
    offerId: offerId ?? null,
    activityId,
    bodyDigest,
    transportAuthentication: input.simulationMode === true ? "synthetic-no-transport" : "dedicated-bearer-contract-token",
    providerAuthenticated: input.simulationMode !== true,
    evidenceClass: input.simulationMode === true ? "synthetic-test-fixture" : "authenticated-provider-boundary",
    reason,
    secretRecorded: false,
    paymentObserved: false,
    revenueRecognized: false,
  };
  return Object.freeze({ ...body, id: semanticId(body) });
}

export function decideVaultProviderOffer(input

) {
  if (input.ingress.status !== "accepted" || (input.ingress.providerAuthenticated !== true && input.ingress.evidenceClass !== "synthetic-test-fixture")) return refusal("provider-offer-ingress-not-admitted");
  const offer = asRecord(input.activity["object"]), solicitation = input.solicitation ?? loadVaultProviderSolicitation();
  const offerId = stringValue(offer["id"]);
  if (offerId === undefined || offerId !== input.ingress.offerId || providerOfferObjectId(offer) !== offerId) return refusal("provider-offer-ingress-binding-mismatch");
  const solicitationDigest = semanticId(solicitation);
  const product = asRecord(offer["product"]), capabilities = asRecord(offer["capabilities"]), contracts = asRecord(offer["contracts"]), economics = asRecord(offer["economics"]), evidence = asRecord(offer["evidence"]);
  const evidenceByRequirement = requirementEvidence(evidence["requirements"]);
  const evidenceRows = Array.isArray(evidence["requirements"]) ? evidence["requirements"] : [];
  const evidenceSetCompatible = evidenceRows.length === REQUIRED_REQUIREMENTS.length && REQUIRED_REQUIREMENTS.every((requirementId) => evidenceByRequirement.has(requirementId));
  const exactSolicitation = offer["solicitationId"] === PROVIDER_SOLICITATION_ID && offer["solicitationDigest"] === solicitationDigest && offer["provider"] === PAYMENT_PROVIDER_ACTOR && offer["customer"] === TTI_ACTOR && offer["legalMerchant"] === solicitation["legalMerchant"] && offer["beneficiarySettlement"] === solicitation["beneficiarySettlement"];
  const exactProduct = product["productId"] === VAULT_PRODUCT_ID && product["offeringId"] === VAULT_OFFERING_ID && product["planId"] === VAULT_PLAN_ID && product["mode"] === "subscription" && product["currency"] === "usd" && product["unitAmount"] === 500 && product["billingPeriod"] === "P1M" && product["quantity"] === 1;
  const events = new Set(stringArray(capabilities["eventTypes"])), correlation = new Set(stringArray(capabilities["correlationScopes"]));
  const quotedCost = integerValue(economics["maximumProviderCostUnitAmount"]), costSchema = stringValue(economics["attributableCostReceiptSchema"]);
  const checkInputs = [
    ["REQ-PAY-001", exactSolicitation && exactProduct, "exact solicitation, product, recurrence, quantity, merchant, or beneficiary mismatch"],
    ["REQ-PAY-002", capabilities["catalogDerivesPrice"] === true && capabilities["callerOverridesRefused"] === true, "catalog derivation or caller-override refusal absent"],
    ["REQ-PAY-003", capabilities["subscriptionCheckout"] === true && capabilities["idempotentCheckout"] === true && capabilities["opaqueCustomerReference"] === true && capabilities["discordIdentityRequired"] === false, "subscription Checkout, idempotency, or privacy capability absent"],
    ["REQ-PAY-004", REQUIRED_CORRELATION.every((scope) => correlation.has(scope)), "checkout/subscription/invoice correlation incomplete"],
    ["REQ-PAY-005", capabilities["rawStripeSignatureVerification"] === true && capabilities["replayTolerance"] === true && capabilities["bodyBound"] === true && capabilities["eventDeduplication"] === true && capabilities["rawBodyRecorded"] === false && capabilities["buyerPersonalDataRecorded"] === false, "webhook security or privacy capability incomplete"],
    ["REQ-PAY-006", REQUIRED_EVENTS.every((event) => events.has(event)), "required lifecycle event receipt set incomplete"],
    ["REQ-PAY-007", capabilities["customerSettlementMutationAuthority"] === false, "provider does not disclaim customer-settlement mutation authority"],
    ["REQ-PAY-008", isNi(stringValue(contracts["receiptDelivery"])) && capabilities["authenticatedReceiptDelivery"] === true && capabilities["idempotentReceiptDelivery"] === true && capabilities["customerAcknowledgmentAndRetry"] === true, "authenticated idempotent receipt delivery with acknowledgment/retry absent"],
    ["REQ-PAY-009", capabilities["testLiveSeparation"] === true && offer["serviceMode"] === "test-and-live-subject-to-separate-activation", "test/live separation or separate live activation promise absent"],
    ["REQ-PAY-010", economics["currency"] === "usd" && economics["billingPeriod"] === "P1M" && quotedCost !== undefined && quotedCost <= 100 && isNi(costSchema), "bounded provider cost quote or attributable-cost receipt schema absent or above ceiling"],
  ];
  const checks = checkInputs.map(([requirementId, capabilityPassed, detail]) => {
    const evidenceIds = evidenceByRequirement.get(requirementId) ?? [];
    const passed = capabilityPassed && evidenceIds.length > 0 && evidenceIds.every(isNi);
    return Object.freeze({ requirementId, disposition: passed ? "claimed-compatible" : "incompatible", detail: passed ? "provider asserts the bounded capability and names content-addressed evidence; TTI test verification remains required" : evidenceIds.length === 0 ? "content-addressed provider evidence absent" : detail, evidenceIds: Object.freeze(evidenceIds) });
  });
  const validFrom = Date.parse(stringValue(offer["validFrom"]) ?? ""), expiresAt = Date.parse(stringValue(offer["expiresAt"]) ?? ""), decidedAt = input.decidedAt ?? new Date().toISOString(), decisionTime = Date.parse(decidedAt);
  const temporalCompatible = Number.isFinite(validFrom) && Number.isFinite(expiresAt) && Number.isFinite(decisionTime) && validFrom <= decisionTime && decisionTime < expiresAt && expiresAt - validFrom <= 90 * 24 * 60 * 60 * 1000;
  const providerWitnessCompatible = isNi(stringValue(evidence["providerWitnessReceiptId"]));
  const contractCompatible = isNi(stringValue(contracts["checkout"])) && isNi(stringValue(contracts["webhook"])) && isNi(stringValue(contracts["receiptDelivery"]));
  const incompatible = checks.filter((check) => check.disposition === "incompatible").length;
  const admissionBlockers = Object.freeze([temporalCompatible ? null : "provider-offer-not-current-or-validity-window-exceeds-90-days", providerWitnessCompatible ? null : "provider-witness-receipt-absent-or-invalid", contractCompatible ? null : "provider-service-contract-identity-absent-or-invalid", evidenceSetCompatible ? null : "provider-requirement-evidence-set-not-exact"].filter((value) => value !== null));
  const status = incompatible === 0 && admissionBlockers.length === 0 ? input.ingress.evidenceClass === "synthetic-test-fixture" ? "simulated-qualified-for-test" : "qualified-for-test" : "refused";
  const compatible = checks.filter((check) => check.disposition === "claimed-compatible").length;
  const body = {
    type: "TTIVaultProviderOfferAdmissionDecision",
    version: 1,
    status,
    decidedAt,
    provider: PAYMENT_PROVIDER_ACTOR,
    customer: TTI_ACTOR,
    offerId,
    ingressReceiptId: input.ingress.id,
    solicitationId: PROVIDER_SOLICITATION_ID,
    solicitationDigest,
    productId: VAULT_PRODUCT_ID,
    offeringId: VAULT_OFFERING_ID,
    planId: VAULT_PLAN_ID,
    contracts: Object.freeze({ checkout: stringValue(contracts["checkout"]) ?? null, webhook: stringValue(contracts["webhook"]) ?? null, receiptDelivery: stringValue(contracts["receiptDelivery"]) ?? null }),
    counts: Object.freeze({ requirements: REQUIRED_REQUIREMENTS.length, claimedCompatible: compatible, incompatible }),
    admissionBlockers,
    checks: Object.freeze(checks),
    economics: Object.freeze({ customerPriceUnitAmount: 500, quotedMaximumProviderCostUnitAmount: quotedCost ?? "unknown", projectedPreFulfillmentContributionUnitAmount: quotedCost === undefined ? "unknown" : 500 - quotedCost, observedAttributableCost: "unknown", profit: "unknown" }),
    providerAuthenticated: input.ingress.providerAuthenticated,
    providerAuthoredOfferObserved: input.ingress.providerAuthenticated,
    evidenceClass: input.ingress.evidenceClass === "synthetic-test-fixture" ? "synthetic-test-fixture" : "authenticated-provider-offer",
    customerAdmission: status,
    contractExecuted: false,
    checkoutCreated: false,
    paymentObserved: false,
    revenueRecognized: false,
    profitRecognized: false,
  };
  return Object.freeze({ ...body, id: semanticId(body) });
}

export function decideVaultProviderOperationalAdmission(input

) {
  const simulation = input.simulationMode === true;
  const expectedOfferStatus = simulation ? "simulated-qualified-for-test" : "qualified-for-test";
  if (input.offerDecision.id !== selfAddressedId(input.offerDecision) || input.offerDecision.status !== expectedOfferStatus || input.offerDecision.evidenceClass !== (simulation ? "synthetic-test-fixture" : "authenticated-provider-offer") || input.offerDecision.providerAuthenticated === simulation) return refusal("provider-offer-not-qualified-for-operational-test-admission");
  const contracts = input.offerDecision.contracts;
  const checkoutContract = contracts.checkout ?? undefined, webhookContract = contracts.webhook ?? undefined, receiptDeliveryContract = contracts.receiptDelivery ?? undefined;
  if (!isNi(checkoutContract) || !isNi(webhookContract) || !isNi(receiptDeliveryContract)) return refusal("qualified-provider-offer-contract-set-invalid");
  const evidenceReceiptIds = [];
  let passed = 0;
  for (const [type, requirementIds] of REQUIRED_OPERATIONAL_TESTS) {
    const candidates = input.testReceipts.filter((receipt) => receipt["type"] === type);
    if (candidates.length !== 1) continue;
    const receipt = candidates[0];
    const receiptContracts = asRecord(receipt["contracts"]);
    const exactRequirements = [...stringArray(receipt["requirementIds"])].sort().join("|") === [...requirementIds].sort().join("|");
    const receiptId = stringValue(receipt["id"]), witnessReceiptId = stringValue(receipt["witnessReceiptId"]);
    const selfAddressed = receiptId !== undefined && receiptId === selfAddressedId(receipt);
    const bound = receipt["version"] === 1 && receipt["status"] === "passed" && receipt["customer"] === TTI_ACTOR && receipt["provider"] === PAYMENT_PROVIDER_ACTOR && receipt["offerId"] === input.offerDecision.offerId && receipt["offerDecisionId"] === input.offerDecision.id && receipt["simulation"] === simulation && receipt["witnessed"] === true && exactRequirements && receiptContracts["checkout"] === contracts.checkout && receiptContracts["webhook"] === contracts.webhook && receiptContracts["receiptDelivery"] === contracts.receiptDelivery && isNi(witnessReceiptId);
    if (selfAddressed && bound) { passed += 1; evidenceReceiptIds.push(receiptId); }
  }
  const failed = REQUIRED_OPERATIONAL_TESTS.length - passed;
  const status = failed === 0 ? simulation ? "simulated-admitted" : "admitted" : "refused";
  const body = {
    type: "TTIVaultProviderOperationalAdmissionDecision",
    version: 1,
    status,
    decidedAt: input.decidedAt ?? new Date().toISOString(),
    provider: PAYMENT_PROVIDER_ACTOR,
    customer: TTI_ACTOR,
    offerId: input.offerDecision.offerId,
    offerDecisionId: input.offerDecision.id,
    offeringId: VAULT_OFFERING_ID,
    contracts: Object.freeze({ checkout: checkoutContract, webhook: webhookContract, receiptDelivery: receiptDeliveryContract }),
    evidenceReceiptIds: Object.freeze(evidenceReceiptIds),
    counts: Object.freeze({ requiredTests: 7, passed, failed }),
    evidenceClass: simulation ? "synthetic-test-fixture" : "tti-customer-observed-test",
    simulation,
    liveActivationAuthority: false,
    contractExecuted: false,
    checkoutCreated: false,
    paymentObserved: false,
    revenueRecognized: false,
    profitRecognized: false,
  };
  return Object.freeze({ ...body, id: semanticId(body) });
}

export async function recordVaultProviderOperationalTestReceipt(store, receipt) {
  const receiptId = stringValue(receipt["id"]);
  if (receiptId === undefined || receiptId !== selfAddressedId(receipt) || receipt["status"] !== "passed" || receipt["simulation"] !== false || receipt["witnessed"] !== true || !isNi(stringValue(receipt["witnessReceiptId"]))) throw new Error("only a self-addressed, witnessed, non-synthetic passing provider test receipt may enter the operational test ledger");
  const existing = ((await store.records(PROVIDER_OPERATIONAL_TEST_RECEIPT_CATEGORY))).find((candidate) => candidate["id"] === receiptId);
  if (existing !== undefined) return { id: receiptId, duplicate: true };
  return store.record({ category: PROVIDER_OPERATIONAL_TEST_RECEIPT_CATEGORY, recordedAt: stringValue(receipt["recordedAt"]) ?? new Date().toISOString(), record: receipt });
}

export async function recordVaultProviderOperationalAdmission(store, decision) {
  if (decision.simulation || decision.status !== "admitted") throw new Error("only a non-synthetic admitted provider operational decision may enter the live admission ledger");
  if (decision.id !== selfAddressedId(decision)) throw new Error("provider operational admission identity is invalid");
  const offerDecision = ((await store.records(PROVIDER_OFFER_DECISION_CATEGORY))).find((candidate) => candidate.id === decision.offerDecisionId && candidate.offerId === decision.offerId && candidate.status === "qualified-for-test" && candidate.providerAuthenticated === true);
  if (offerDecision === undefined || offerDecision.id !== selfAddressedId(offerDecision)) throw new Error("qualified provider offer decision is absent from the live offer ledger");
  const testReceipts = (await store.records(PROVIDER_OPERATIONAL_TEST_RECEIPT_CATEGORY));
  if (decision.evidenceReceiptIds.length !== 7 || decision.evidenceReceiptIds.some((receiptId) => !testReceipts.some((receipt) => receipt["id"] === receiptId && receiptId === selfAddressedId(receipt) && receipt["simulation"] === false && receipt["status"] === "passed"))) throw new Error("provider operational admission test receipts are absent from the live evidence ledger");
  return store.record({ category: PROVIDER_OPERATIONAL_ADMISSION_CATEGORY, recordedAt: decision.decidedAt, record: decision });
}

export async function vaultProviderOfferHttpResponse(input

) {
  if (!providerOfferAuthorized(input.authorization, input.source)) return httpRefusal(401, "payment-provider-offer-not-authenticated");
  if (input.contentType?.split(";", 1)[0]?.trim().toLowerCase() !== "application/activity+json") return httpRefusal(415, "provider-offer-content-type-invalid");
  if (Buffer.byteLength(input.body, "utf8") > 64 * 1024) return httpRefusal(413, "provider-offer-too-large");
  let activity;
  try { activity = JSON.parse(input.body); }
  catch { return httpRefusal(400, "provider-offer-invalid-json"); }
  const priorIngress = (await input.store.records(PROVIDER_OFFER_INGRESS_CATEGORY));
  const ingress = inspectVaultProviderOfferIngress({ activity, priorReceipts: priorIngress, receivedAt: input.recordedAt });
  if (!priorIngress.some((candidate) => candidate.id === ingress.id)) await input.store.record({ category: PROVIDER_OFFER_INGRESS_CATEGORY, recordedAt: ingress.receivedAt, record: ingress });
  if (ingress.status === "refused") return { status: 409, body: economicSafeResponse(ingress) };
  const priorDecisions = (await input.store.records(PROVIDER_OFFER_DECISION_CATEGORY));
  const existing = priorDecisions.find((candidate) => candidate.offerId === ingress.offerId);
  if (existing !== undefined) return { status: 200, body: economicSafeResponse(existing) };
  const decision = decideVaultProviderOffer({ activity, ingress, decidedAt: input.recordedAt });
  if (decision.type === "TTIVaultProviderOfferRefusal") return { status: 409, body: decision };
  await input.store.record({ category: PROVIDER_OFFER_DECISION_CATEGORY, recordedAt: decision.decidedAt, record: decision });
  return { status: decision.status === "qualified-for-test" ? 202 : 409, body: economicSafeResponse(decision) };
}

function requirementEvidence(value) {
  const result = new Map();
  if (!Array.isArray(value)) return result;
  for (const item of value) {
    const record = asRecord(item), requirementId = stringValue(record["requirementId"]);
    if (requirementId !== undefined && REQUIRED_REQUIREMENTS.includes(requirementId)) result.set(requirementId, result.has(requirementId) ? [] : stringArray(record["evidenceIds"]));
  }
  return result;
}
function selfAddressedId(value) { const { id: _discardedIdentity, ...body } = value; return semanticId(body); }
function containsProhibitedKey(value) {
  if (Array.isArray(value)) return value.some(containsProhibitedKey);
  if (value === null || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) => PROHIBITED_OFFER_KEYS.has(key) || containsProhibitedKey(child));
}
function economicSafeResponse(record) {
  return { type: record.type, id: record.id, status: record.status, offerId: record.offerId, providerAuthenticated: record.providerAuthenticated, customerAdmission: record.type === "TTIVaultProviderOfferAdmissionDecision" ? record.customerAdmission : "not-evaluated", contractExecuted: false, checkoutCreated: false, paymentObserved: false, revenueRecognized: false, profitRecognized: false, ...(record.type === "TTIVaultProviderOfferIngressReceipt" && record.reason !== null ? { reason: record.reason } : {}) };
}
function httpRefusal(status, reason) { return { status, body: { type: "TTIVaultProviderOfferRefusal", reason, paymentObserved: false, revenueRecognized: false, profitRecognized: false } }; }
function refusal(reason) { return Object.freeze({ type: "TTIVaultProviderOfferRefusal", reason, paymentObserved: false, revenueRecognized: false, profitRecognized: false }); }
function asRecord(value) { return value !== null && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function stringValue(value) { return typeof value === "string" ? value : undefined; }
function stringArray(value) { return Array.isArray(value) ? value.filter((item) => typeof item === "string") : []; }
function integerValue(value) { return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : undefined; }
function isNi(value) { return isNiUri(value); }
