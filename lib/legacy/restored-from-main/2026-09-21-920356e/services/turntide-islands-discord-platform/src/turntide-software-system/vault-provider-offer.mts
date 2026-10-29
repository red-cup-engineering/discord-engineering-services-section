import { timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { identifyTurntideDiscordPlatformRecord as semanticId } from "./discord-platform-record-semantic-content.mts";
import { isNiUri as isCanonicalSha256NiUri } from "@red-cup-engineering/computer-data-engine/identity";
import { type SettlementWitness } from "./settlement-witness.mts";
import { env, publicTurntideContentPath, type EnvMap } from "./env.mts";
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
} from "./vault-market-constants.mts";

const solicitationPath = () => publicTurntideContentPath(process.env, "solicitations", "founding-knowledge-vault-subscription-provider.json");
const REQUIRED_EVENTS = ["checkout.session.completed", "checkout.session.expired", "invoice.paid", "invoice.payment_failed", "customer.subscription.updated", "customer.subscription.deleted", "charge.refunded", "dispute.created-or-updated"] as const;
const REQUIRED_CORRELATION = ["checkout", "subscription", "invoice"] as const;
const REQUIRED_REQUIREMENTS = Array.from({ length: 10 }, (_, index) => `REQ-PAY-${String(index + 1).padStart(3, "0")}`);
const REQUIRED_OPERATIONAL_TESTS = [
  ["TTIProviderCatalogAcceptanceTestReceipt", ["REQ-PAY-001", "REQ-PAY-002", "REQ-PAY-003", "REQ-PAY-009"]],
  ["TTIProviderSubscriptionCorrelationTestReceipt", ["REQ-PAY-004"]],
  ["TTIProviderWebhookSecurityTestReceipt", ["REQ-PAY-005"]],
  ["TTIProviderLifecycleReceiptTestReceipt", ["REQ-PAY-006"]],
  ["TTIProviderSovereigntyTestReceipt", ["REQ-PAY-007"]],
  ["TTIProviderReceiptDeliveryTestReceipt", ["REQ-PAY-008"]],
  ["TTIProviderCostReceiptTestReceipt", ["REQ-PAY-010"]],
] as const;
const PROHIBITED_OFFER_KEYS = new Set(["authorization", "apiKey", "bearerToken", "buyerEmail", "buyerPersonalData", "discordUserId", "rawStripeBody", "stripeSecretKey", "webhookSecret"]);

export interface VaultProviderOfferIngressReceipt {
  readonly id: string;
  readonly type: "TTIVaultProviderOfferIngressReceipt";
  readonly version: 1;
  readonly status: "accepted" | "refused";
  readonly receivedAt: string;
  readonly provider: string;
  readonly customer: string;
  readonly offerId: string | null;
  readonly activityId: string | null;
  readonly bodyDigest: string;
  readonly transportAuthentication: "dedicated-bearer-contract-token" | "synthetic-no-transport";
  readonly providerAuthenticated: boolean;
  readonly evidenceClass: "authenticated-provider-boundary" | "synthetic-test-fixture";
  readonly reason: string | null;
  readonly secretRecorded: false;
  readonly paymentObserved: false;
  readonly revenueRecognized: false;
}

export interface VaultProviderOfferAdmissionDecision {
  readonly id: string;
  readonly type: "TTIVaultProviderOfferAdmissionDecision";
  readonly version: 1;
  readonly status: "qualified-for-test" | "refused" | "simulated-qualified-for-test";
  readonly decidedAt: string;
  readonly provider: string;
  readonly customer: string;
  readonly offerId: string;
  readonly ingressReceiptId: string;
  readonly solicitationId: string;
  readonly solicitationDigest: string;
  readonly productId: string;
  readonly offeringId: string;
  readonly planId: string;
  readonly contracts: Readonly<{ checkout: string | null; webhook: string | null; receiptDelivery: string | null }>;
  readonly counts: Readonly<{ requirements: number; claimedCompatible: number; incompatible: number }>;
  readonly admissionBlockers: readonly string[];
  readonly checks: readonly Readonly<{ requirementId: string; disposition: "claimed-compatible" | "incompatible"; detail: string; evidenceIds: readonly string[] }>[];
  readonly economics: Readonly<{ customerPriceUnitAmount: number; quotedMaximumProviderCostUnitAmount: number | "unknown"; projectedPreFulfillmentContributionUnitAmount: number | "unknown"; observedAttributableCost: "unknown"; profit: "unknown" }>;
  readonly providerAuthenticated: boolean;
  readonly providerAuthoredOfferObserved: boolean;
  readonly evidenceClass: "authenticated-provider-offer" | "synthetic-test-fixture";
  readonly customerAdmission: "qualified-for-test" | "refused" | "simulated-qualified-for-test";
  readonly contractExecuted: false;
  readonly checkoutCreated: false;
  readonly paymentObserved: false;
  readonly revenueRecognized: false;
  readonly profitRecognized: false;
}

export type VaultProviderOfferRefusal = Readonly<{ type: "TTIVaultProviderOfferRefusal"; reason: string; paymentObserved: false; revenueRecognized: false; profitRecognized: false }>;
export type VaultProviderOfferStore = Pick<SettlementWitness, "record" | "records">;

export interface VaultProviderOperationalAdmissionDecision {
  readonly id: string;
  readonly type: "TTIVaultProviderOperationalAdmissionDecision";
  readonly version: 1;
  readonly status: "admitted" | "refused" | "simulated-admitted";
  readonly decidedAt: string;
  readonly provider: string;
  readonly customer: string;
  readonly offerId: string;
  readonly offerDecisionId: string;
  readonly offeringId: string;
  readonly contracts: Readonly<{ checkout: string; webhook: string; receiptDelivery: string }>;
  readonly evidenceReceiptIds: readonly string[];
  readonly counts: Readonly<{ requiredTests: 7; passed: number; failed: number }>;
  readonly evidenceClass: "tti-customer-observed-test" | "synthetic-test-fixture";
  readonly simulation: boolean;
  readonly liveActivationAuthority: false;
  readonly contractExecuted: false;
  readonly checkoutCreated: false;
  readonly paymentObserved: false;
  readonly revenueRecognized: false;
  readonly profitRecognized: false;
}

export function loadVaultProviderSolicitation(file = solicitationPath()): Record<string, unknown> {
  return JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
}

export function providerOfferAuthorized(header: string | undefined, source: EnvMap = process.env): boolean {
  const expected = env("TTI_VAULT_PROVIDER_OFFER_TOKEN", source);
  const actual = header?.replace(/^Bearer /u, "");
  if (expected === undefined || actual === undefined || expected.length < 32 || expected.length !== actual.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
}

export function providerOfferObjectId(object: Record<string, unknown>): string {
  const { id: _discardedSelfIdentity, ...body } = object;
  return semanticId(body);
}

export function inspectVaultProviderOfferIngress(input: Readonly<{
  activity: Record<string, unknown>;
  receivedAt?: string;
  priorReceipts?: readonly VaultProviderOfferIngressReceipt[];
  simulationMode?: boolean;
}>): VaultProviderOfferIngressReceipt {
  const activity = input.activity;
  const object = asRecord(activity["object"]);
  const offerId = stringValue(object["id"]);
  const bodyDigest = semanticId(object);
  const activityId = stringValue(activity["id"]) ?? null;
  let reason: string | null = null;
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
    type: "TTIVaultProviderOfferIngressReceipt" as const,
    version: 1 as const,
    status: reason === null ? "accepted" as const : "refused" as const,
    receivedAt: input.receivedAt ?? new Date().toISOString(),
    provider: PAYMENT_PROVIDER_ACTOR,
    customer: TTI_ACTOR,
    offerId: offerId ?? null,
    activityId,
    bodyDigest,
    transportAuthentication: input.simulationMode === true ? "synthetic-no-transport" as const : "dedicated-bearer-contract-token" as const,
    providerAuthenticated: input.simulationMode !== true,
    evidenceClass: input.simulationMode === true ? "synthetic-test-fixture" as const : "authenticated-provider-boundary" as const,
    reason,
    secretRecorded: false as const,
    paymentObserved: false as const,
    revenueRecognized: false as const,
  };
  return Object.freeze({ ...body, id: semanticId(body) });
}

export function decideVaultProviderOffer(input: Readonly<{
  activity: Record<string, unknown>;
  ingress: VaultProviderOfferIngressReceipt;
  solicitation?: Record<string, unknown>;
  decidedAt?: string;
}>): VaultProviderOfferAdmissionDecision | VaultProviderOfferRefusal {
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
  const checkInputs: readonly [string, boolean, string][] = [
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
    return Object.freeze({ requirementId, disposition: passed ? "claimed-compatible" as const : "incompatible" as const, detail: passed ? "provider asserts the bounded capability and names content-addressed evidence; TTI test verification remains required" : evidenceIds.length === 0 ? "content-addressed provider evidence absent" : detail, evidenceIds: Object.freeze(evidenceIds) });
  });
  const validFrom = Date.parse(stringValue(offer["validFrom"]) ?? ""), expiresAt = Date.parse(stringValue(offer["expiresAt"]) ?? ""), decidedAt = input.decidedAt ?? new Date().toISOString(), decisionTime = Date.parse(decidedAt);
  const temporalCompatible = Number.isFinite(validFrom) && Number.isFinite(expiresAt) && Number.isFinite(decisionTime) && validFrom <= decisionTime && decisionTime < expiresAt && expiresAt - validFrom <= 90 * 24 * 60 * 60 * 1000;
  const providerWitnessCompatible = isNi(stringValue(evidence["providerWitnessReceiptId"]));
  const contractCompatible = isNi(stringValue(contracts["checkout"])) && isNi(stringValue(contracts["webhook"])) && isNi(stringValue(contracts["receiptDelivery"]));
  const incompatible = checks.filter((check) => check.disposition === "incompatible").length;
  const admissionBlockers = Object.freeze([temporalCompatible ? null : "provider-offer-not-current-or-validity-window-exceeds-90-days", providerWitnessCompatible ? null : "provider-witness-receipt-absent-or-invalid", contractCompatible ? null : "provider-service-contract-identity-absent-or-invalid", evidenceSetCompatible ? null : "provider-requirement-evidence-set-not-exact"].filter((value): value is string => value !== null));
  const status = incompatible === 0 && admissionBlockers.length === 0 ? input.ingress.evidenceClass === "synthetic-test-fixture" ? "simulated-qualified-for-test" as const : "qualified-for-test" as const : "refused" as const;
  const compatible = checks.filter((check) => check.disposition === "claimed-compatible").length;
  const body = {
    type: "TTIVaultProviderOfferAdmissionDecision" as const,
    version: 1 as const,
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
    economics: Object.freeze({ customerPriceUnitAmount: 500, quotedMaximumProviderCostUnitAmount: quotedCost ?? "unknown" as const, projectedPreFulfillmentContributionUnitAmount: quotedCost === undefined ? "unknown" as const : 500 - quotedCost, observedAttributableCost: "unknown" as const, profit: "unknown" as const }),
    providerAuthenticated: input.ingress.providerAuthenticated,
    providerAuthoredOfferObserved: input.ingress.providerAuthenticated,
    evidenceClass: input.ingress.evidenceClass === "synthetic-test-fixture" ? "synthetic-test-fixture" as const : "authenticated-provider-offer" as const,
    customerAdmission: status,
    contractExecuted: false as const,
    checkoutCreated: false as const,
    paymentObserved: false as const,
    revenueRecognized: false as const,
    profitRecognized: false as const,
  };
  return Object.freeze({ ...body, id: semanticId(body) });
}

export function decideVaultProviderOperationalAdmission(input: Readonly<{
  offerDecision: VaultProviderOfferAdmissionDecision;
  testReceipts: readonly Record<string, unknown>[];
  decidedAt?: string;
  simulationMode?: boolean;
}>): VaultProviderOperationalAdmissionDecision | VaultProviderOfferRefusal {
  const simulation = input.simulationMode === true;
  const expectedOfferStatus = simulation ? "simulated-qualified-for-test" : "qualified-for-test";
  if (input.offerDecision.id !== selfAddressedId(input.offerDecision as unknown as Record<string, unknown>) || input.offerDecision.status !== expectedOfferStatus || input.offerDecision.evidenceClass !== (simulation ? "synthetic-test-fixture" : "authenticated-provider-offer") || input.offerDecision.providerAuthenticated === simulation) return refusal("provider-offer-not-qualified-for-operational-test-admission");
  const contracts = input.offerDecision.contracts;
  const checkoutContract = contracts.checkout ?? undefined, webhookContract = contracts.webhook ?? undefined, receiptDeliveryContract = contracts.receiptDelivery ?? undefined;
  if (!isNi(checkoutContract) || !isNi(webhookContract) || !isNi(receiptDeliveryContract)) return refusal("qualified-provider-offer-contract-set-invalid");
  const evidenceReceiptIds: string[] = [];
  let passed = 0;
  for (const [type, requirementIds] of REQUIRED_OPERATIONAL_TESTS) {
    const candidates = input.testReceipts.filter((receipt) => receipt["type"] === type);
    if (candidates.length !== 1) continue;
    const receipt = candidates[0]!;
    const receiptContracts = asRecord(receipt["contracts"]);
    const exactRequirements = [...stringArray(receipt["requirementIds"])].sort().join("|") === [...requirementIds].sort().join("|");
    const receiptId = stringValue(receipt["id"]), witnessReceiptId = stringValue(receipt["witnessReceiptId"]);
    const selfAddressed = receiptId !== undefined && receiptId === selfAddressedId(receipt);
    const bound = receipt["version"] === 1 && receipt["status"] === "passed" && receipt["customer"] === TTI_ACTOR && receipt["provider"] === PAYMENT_PROVIDER_ACTOR && receipt["offerId"] === input.offerDecision.offerId && receipt["offerDecisionId"] === input.offerDecision.id && receipt["simulation"] === simulation && receipt["witnessed"] === true && exactRequirements && receiptContracts["checkout"] === contracts.checkout && receiptContracts["webhook"] === contracts.webhook && receiptContracts["receiptDelivery"] === contracts.receiptDelivery && isNi(witnessReceiptId);
    if (selfAddressed && bound) { passed += 1; evidenceReceiptIds.push(receiptId); }
  }
  const failed = REQUIRED_OPERATIONAL_TESTS.length - passed;
  const status = failed === 0 ? simulation ? "simulated-admitted" as const : "admitted" as const : "refused" as const;
  const body = {
    type: "TTIVaultProviderOperationalAdmissionDecision" as const,
    version: 1 as const,
    status,
    decidedAt: input.decidedAt ?? new Date().toISOString(),
    provider: PAYMENT_PROVIDER_ACTOR,
    customer: TTI_ACTOR,
    offerId: input.offerDecision.offerId,
    offerDecisionId: input.offerDecision.id,
    offeringId: VAULT_OFFERING_ID,
    contracts: Object.freeze({ checkout: checkoutContract, webhook: webhookContract, receiptDelivery: receiptDeliveryContract }),
    evidenceReceiptIds: Object.freeze(evidenceReceiptIds),
    counts: Object.freeze({ requiredTests: 7 as const, passed, failed }),
    evidenceClass: simulation ? "synthetic-test-fixture" as const : "tti-customer-observed-test" as const,
    simulation,
    liveActivationAuthority: false as const,
    contractExecuted: false as const,
    checkoutCreated: false as const,
    paymentObserved: false as const,
    revenueRecognized: false as const,
    profitRecognized: false as const,
  };
  return Object.freeze({ ...body, id: semanticId(body) });
}

export async function recordVaultProviderOperationalTestReceipt(store: VaultProviderOfferStore, receipt: Record<string, unknown>) {
  const receiptId = stringValue(receipt["id"]);
  if (receiptId === undefined || receiptId !== selfAddressedId(receipt) || receipt["status"] !== "passed" || receipt["simulation"] !== false || receipt["witnessed"] !== true || !isNi(stringValue(receipt["witnessReceiptId"]))) throw new Error("only a self-addressed, witnessed, non-synthetic passing provider test receipt may enter the operational test ledger");
  const existing = ((await store.records(PROVIDER_OPERATIONAL_TEST_RECEIPT_CATEGORY)) as readonly Record<string, unknown>[]).find((candidate) => candidate["id"] === receiptId);
  if (existing !== undefined) return { id: receiptId, duplicate: true };
  return store.record({ category: PROVIDER_OPERATIONAL_TEST_RECEIPT_CATEGORY, recordedAt: stringValue(receipt["recordedAt"]) ?? new Date().toISOString(), record: receipt });
}

export async function recordVaultProviderOperationalAdmission(store: VaultProviderOfferStore, decision: VaultProviderOperationalAdmissionDecision) {
  if (decision.simulation || decision.status !== "admitted") throw new Error("only a non-synthetic admitted provider operational decision may enter the live admission ledger");
  if (decision.id !== selfAddressedId(decision as unknown as Record<string, unknown>)) throw new Error("provider operational admission identity is invalid");
  const offerDecision = ((await store.records(PROVIDER_OFFER_DECISION_CATEGORY)) as readonly VaultProviderOfferAdmissionDecision[]).find((candidate) => candidate.id === decision.offerDecisionId && candidate.offerId === decision.offerId && candidate.status === "qualified-for-test" && candidate.providerAuthenticated === true);
  if (offerDecision === undefined || offerDecision.id !== selfAddressedId(offerDecision as unknown as Record<string, unknown>)) throw new Error("qualified provider offer decision is absent from the live offer ledger");
  const testReceipts = (await store.records(PROVIDER_OPERATIONAL_TEST_RECEIPT_CATEGORY)) as readonly Record<string, unknown>[];
  if (decision.evidenceReceiptIds.length !== 7 || decision.evidenceReceiptIds.some((receiptId) => !testReceipts.some((receipt) => receipt["id"] === receiptId && receiptId === selfAddressedId(receipt) && receipt["simulation"] === false && receipt["status"] === "passed"))) throw new Error("provider operational admission test receipts are absent from the live evidence ledger");
  return store.record({ category: PROVIDER_OPERATIONAL_ADMISSION_CATEGORY, recordedAt: decision.decidedAt, record: decision });
}

export async function vaultProviderOfferHttpResponse(input: Readonly<{
  authorization?: string;
  contentType?: string;
  body: string;
  source?: EnvMap;
  store: VaultProviderOfferStore;
  recordedAt?: string;
}>): Promise<Readonly<{ status: number; body: Record<string, unknown> }>> {
  if (!providerOfferAuthorized(input.authorization, input.source)) return httpRefusal(401, "payment-provider-offer-not-authenticated");
  if (input.contentType?.split(";", 1)[0]?.trim().toLowerCase() !== "application/activity+json") return httpRefusal(415, "provider-offer-content-type-invalid");
  if (Buffer.byteLength(input.body, "utf8") > 64 * 1024) return httpRefusal(413, "provider-offer-too-large");
  let activity: Record<string, unknown>;
  try { activity = JSON.parse(input.body) as Record<string, unknown>; }
  catch { return httpRefusal(400, "provider-offer-invalid-json"); }
  const priorIngress = (await input.store.records(PROVIDER_OFFER_INGRESS_CATEGORY)) as readonly VaultProviderOfferIngressReceipt[];
  const ingress = inspectVaultProviderOfferIngress({ activity, priorReceipts: priorIngress, receivedAt: input.recordedAt });
  if (!priorIngress.some((candidate) => candidate.id === ingress.id)) await input.store.record({ category: PROVIDER_OFFER_INGRESS_CATEGORY, recordedAt: ingress.receivedAt, record: ingress });
  if (ingress.status === "refused") return { status: 409, body: economicSafeResponse(ingress) };
  const priorDecisions = (await input.store.records(PROVIDER_OFFER_DECISION_CATEGORY)) as readonly VaultProviderOfferAdmissionDecision[];
  const existing = priorDecisions.find((candidate) => candidate.offerId === ingress.offerId);
  if (existing !== undefined) return { status: 200, body: economicSafeResponse(existing) };
  const decision = decideVaultProviderOffer({ activity, ingress, decidedAt: input.recordedAt });
  if (decision.type === "TTIVaultProviderOfferRefusal") return { status: 409, body: decision as unknown as Record<string, unknown> };
  await input.store.record({ category: PROVIDER_OFFER_DECISION_CATEGORY, recordedAt: decision.decidedAt, record: decision });
  return { status: decision.status === "qualified-for-test" ? 202 : 409, body: economicSafeResponse(decision) };
}

function requirementEvidence(value: unknown): Map<string, string[]> {
  const result = new Map<string, string[]>();
  if (!Array.isArray(value)) return result;
  for (const item of value) {
    const record = asRecord(item), requirementId = stringValue(record["requirementId"]);
    if (requirementId !== undefined && REQUIRED_REQUIREMENTS.includes(requirementId)) result.set(requirementId, result.has(requirementId) ? [] : stringArray(record["evidenceIds"]));
  }
  return result;
}
function selfAddressedId(value: Record<string, unknown>): string { const { id: _discardedIdentity, ...body } = value; return semanticId(body); }
function containsProhibitedKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsProhibitedKey);
  if (value === null || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(([key, child]) => PROHIBITED_OFFER_KEYS.has(key) || containsProhibitedKey(child));
}
function economicSafeResponse(record: VaultProviderOfferIngressReceipt | VaultProviderOfferAdmissionDecision): Record<string, unknown> {
  return { type: record.type, id: record.id, status: record.status, offerId: record.offerId, providerAuthenticated: record.providerAuthenticated, customerAdmission: record.type === "TTIVaultProviderOfferAdmissionDecision" ? record.customerAdmission : "not-evaluated", contractExecuted: false, checkoutCreated: false, paymentObserved: false, revenueRecognized: false, profitRecognized: false, ...(record.type === "TTIVaultProviderOfferIngressReceipt" && record.reason !== null ? { reason: record.reason } : {}) };
}
function httpRefusal(status: number, reason: string): Readonly<{ status: number; body: Record<string, unknown> }> { return { status, body: { type: "TTIVaultProviderOfferRefusal", reason, paymentObserved: false, revenueRecognized: false, profitRecognized: false } }; }
function refusal(reason: string): VaultProviderOfferRefusal { return Object.freeze({ type: "TTIVaultProviderOfferRefusal", reason, paymentObserved: false, revenueRecognized: false, profitRecognized: false }); }
function asRecord(value: unknown): Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function stringValue(value: unknown): string | undefined { return typeof value === "string" ? value : undefined; }
function stringArray(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function integerValue(value: unknown): number | undefined { return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : undefined; }
function isNi(value: string | undefined): value is string { return isCanonicalSha256NiUri(value); }
