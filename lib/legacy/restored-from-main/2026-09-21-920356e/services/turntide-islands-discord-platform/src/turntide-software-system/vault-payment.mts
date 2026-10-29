import { randomUUID, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { identifyTurntideDiscordPlatformRecord as semanticId } from "./discord-platform-record-semantic-content.mts";
import { isNiUri as isCanonicalSha256NiUri } from "@red-cup-engineering/computer-data-engine/identity";
import { querySettlementRecords } from "@red-cup-engineering/witness-journal-document-service";
import { turntideSettlementWitness, type SettlementWitness } from "./settlement-witness.mts";
// @ts-expect-error This TTI-root management die is canonical JavaScript and intentionally remains outside the app compiler root.
import { turntideWitnessJournalBindingFromEnvironment } from "@causeway-services/turntide-witness-journal-binding-service";
import { env, publicTurntideContentPath, publicTurntideDataPath, publicTurntideRoot, type EnvMap } from "./env.mts";
import type { MembershipEntitlement } from "./membership.mts";
import {
  PAYMENT_PROVIDER_ACTOR,
  PROVIDER_OPERATIONAL_ADMISSION_CATEGORY,
  PROVIDER_OPERATIONAL_TEST_RECEIPT_CATEGORY,
  TTI_ACTOR,
  VAULT_OFFERING_ID,
  VAULT_PLAN_ID,
  VAULT_PRODUCT_ID,
} from "./vault-market-constants.mts";

export {
  PAYMENT_PROVIDER_ACTOR,
  TTI_ACTOR,
  VAULT_OFFERING_ID,
  VAULT_PLAN_ID,
  VAULT_PRODUCT_ID,
} from "./vault-market-constants.mts";
export const CHECKOUT_BINDING_CATEGORY = "tti.knowledge-vault.checkout-bindings.v1";
export const ENTITLEMENT_DECISION_CATEGORY = "tti.knowledge-vault.entitlement-decisions.v1";

const defaultActivationPath = () => publicTurntideContentPath(process.env, "admissions", "founding-knowledge-vault-payment-activation.json");

// The provider's published .d.mts predates witness-journal-rdf-projection-service 1.0.2, whose runtime
// querySettlementRecords accepts an options bag carrying the injected {custody, categoryIndex}.
const querySettlementRecordsWithBinding = querySettlementRecords as unknown as (category: string, options?: Record<string, unknown>) => Promise<readonly unknown[]>;

export interface VaultPaymentActivation {
  readonly type: "TTIKnowledgeVaultPaymentActivationAdmission";
  readonly version: 1;
  readonly status: "not-admitted" | "admitted";
  readonly productId: string;
  readonly offeringId: string;
  readonly planId: string;
  readonly provider: Readonly<{ actor: string; checkoutContract: string; webhookContract: string; receiptDeliveryContract: string | null }>;
  readonly evidenceBindings: Readonly<Record<
    "commercialTerms" | "providerOffering" | "providerSubscriptionLifecycle" | "providerReceiptDelivery" | "discordIdentityIngress" | "publicOriginControl" | "witnessJournalProviderContract" | "discordRoleTerritory",
    string | null
  >>;
  readonly blockers: readonly string[];
}

export interface VaultCheckoutBinding {
  readonly id: string;
  readonly type: "TTIVaultCheckoutBinding";
  readonly version: 1;
  readonly orderReference: string;
  readonly discordUserId: string;
  readonly productId: string;
  readonly offeringId: string;
  readonly planId: string;
  readonly providerActor: string;
  readonly providerCheckoutContract: string;
  readonly providerWebhookContract: string;
  readonly requestDigest: string;
  readonly providerCheckoutReceiptId: string;
  readonly recordedAt: string;
  readonly simulation: boolean;
}

export interface VaultProviderEventReceipt {
  readonly id: string;
  readonly type: "StripeWebhookEventReceipt";
  readonly law: string;
  readonly stripeEventId: string;
  readonly eventType: string;
  readonly created: number | null;
  readonly livemode: boolean | null;
  readonly paymentStatus: string | null;
  readonly status: string | null;
  readonly requestDigest: string | null;
  readonly offeringId: string | null;
  readonly customerSettlement: string | null;
  readonly signatureVerified: boolean;
  readonly supported: boolean;
  readonly duplicate: boolean;
  readonly rawBodyRecorded: boolean;
  readonly buyerPersonalDataRecorded: boolean;
}

export interface VaultEntitlementDecision extends MembershipEntitlement {
  readonly type: "TTIVaultEntitlementDecision";
  readonly version: 1;
  readonly providerReceiptId: string;
  readonly providerEventId: string;
  readonly providerEventCreated: number;
  readonly requestDigest: string;
  readonly productId: string;
  readonly evidenceClass: "provider-settled-live" | "synthetic-nonposting";
  readonly simulation: boolean;
}

export type VaultPaymentRefusal = Readonly<{ type: "TTIVaultPaymentRefusal"; reason: string; blockers?: readonly string[] }>;
export type VaultCheckoutStart = Readonly<{
  type: "TTIVaultCheckoutStart";
  checkoutUrl: string;
  binding: VaultCheckoutBinding;
  paymentStatus: "unpaid-or-provider-pending";
  revenueRecognized: false;
}>;

export function loadVaultPaymentActivation(file = defaultActivationPath()): VaultPaymentActivation {
  return JSON.parse(readFileSync(file, "utf8")) as VaultPaymentActivation;
}

function activationShapeErrors(activation: VaultPaymentActivation): string[] {
  const errors: string[] = [];
  if (activation.type !== "TTIKnowledgeVaultPaymentActivationAdmission" || activation.version !== 1) errors.push("activation-shape-mismatch");
  if (activation.productId !== VAULT_PRODUCT_ID) errors.push("product-id-mismatch");
  if (activation.offeringId !== VAULT_OFFERING_ID) errors.push("offering-id-mismatch");
  if (activation.planId !== VAULT_PLAN_ID) errors.push("plan-id-mismatch");
  if (activation.provider.actor !== PAYMENT_PROVIDER_ACTOR) errors.push("provider-actor-mismatch");
  if (!isNi(activation.provider.checkoutContract)) errors.push("checkout-contract-absent-or-invalid");
  if (!isNi(activation.provider.webhookContract)) errors.push("webhook-contract-absent-or-invalid");
  if (!isNi(activation.provider.receiptDeliveryContract ?? undefined)) errors.push("receipt-delivery-contract-absent-or-invalid");
  for (const [name, evidenceId] of Object.entries(activation.evidenceBindings ?? {})) if (!isNi(evidenceId ?? undefined)) errors.push(`activation-evidence-${name}-absent-or-invalid`);
  if (Object.keys(activation.evidenceBindings ?? {}).length !== 8) errors.push("activation-evidence-binding-set-incomplete");
  return errors;
}

export async function vaultPaymentReadiness(source: EnvMap = process.env, activation = loadVaultPaymentActivation(), providerOperationalAdmissions?: readonly Record<string, unknown>[], providerOperationalTestReceipts?: readonly Record<string, unknown>[]) {
  const blockers = activationShapeErrors(activation);
  if (activation.status !== "admitted") blockers.push("activation-not-admitted");
  const required = [
    "TTI_VAULT_PAYMENT_PROVIDER_URL",
    "TTI_VAULT_PAYMENT_CUSTOMER_CONTRACT_TOKEN",
    "TTI_VAULT_PAYMENT_RECEIPT_TOKEN",
    "TTI_VAULT_SUBSCRIBER_ROLE_ID",
    "TTI_PUBLIC_ORIGIN",
    "TTI_VAULT_COMMERCIAL_TERMS_FILE",
    "WITNESS_JOURNAL_RDF_AGENT",
  ] as const;
  for (const name of required) if (env(name, source) === undefined) blockers.push(`${name.toLowerCase()}-absent`);
  const origin = env("TTI_PUBLIC_ORIGIN", source);
  if (origin !== undefined && !isProductionHttpsOrigin(origin)) blockers.push("public-origin-not-production-https");
  const providerUrl = env("TTI_VAULT_PAYMENT_PROVIDER_URL", source);
  if (providerUrl !== undefined && !isProductionHttpsOrigin(providerUrl)) blockers.push("payment-provider-url-not-production-https");
  const termsFile = env("TTI_VAULT_COMMERCIAL_TERMS_FILE", source);
  if (termsFile !== undefined) {
    try {
      const terms = JSON.parse(readFileSync(termsFile, "utf8")) as Record<string, unknown>;
      const termsId = semanticId(terms);
      if (terms["status"] !== "effective" || terms["productId"] !== VAULT_PRODUCT_ID || terms["offeringId"] !== VAULT_OFFERING_ID || termsId !== activation.evidenceBindings.commercialTerms) blockers.push("commercial-terms-not-effective-or-evidence-bound");
    } catch { blockers.push("commercial-terms-unreadable"); }
  }
  const offerEvidenceId = activation.evidenceBindings.providerOffering;
  if (isNi(offerEvidenceId ?? undefined)) {
    try {
      const dataRoot = env("TURNTIDE_DATA_ROOT", source) ?? publicTurntideDataPath(source);
      const decisions = providerOperationalAdmissions ?? (await querySettlementRecordsWithBinding(PROVIDER_OPERATIONAL_ADMISSION_CATEGORY, { ...(turntideWitnessJournalBindingFromEnvironment(source) ?? {}) })) as readonly Record<string, unknown>[];
      const testReceipts = providerOperationalTestReceipts ?? (await querySettlementRecordsWithBinding(PROVIDER_OPERATIONAL_TEST_RECEIPT_CATEGORY, { ...(turntideWitnessJournalBindingFromEnvironment(source) ?? {}) })) as readonly Record<string, unknown>[];
      const decision = decisions.find((candidate) => candidate["id"] === offerEvidenceId);
      const contracts = decision?.["contracts"] as Record<string, unknown> | undefined;
      const counts = decision?.["counts"] as Record<string, unknown> | undefined, evidenceIds = Array.isArray(decision?.["evidenceReceiptIds"]) ? decision["evidenceReceiptIds"] as unknown[] : [];
      const decisionIdentityValid = decision !== undefined && decision["id"] === selfAddressedRecordId(decision);
      const evidenceValid = evidenceIds.length === 7 && evidenceIds.every((id) => typeof id === "string" && testReceipts.some((receipt) => receipt["id"] === id && id === selfAddressedRecordId(receipt) && receipt["simulation"] === false && receipt["status"] === "passed" && receipt["witnessed"] === true));
      if (!decisionIdentityValid || decision?.["type"] !== "TTIVaultProviderOperationalAdmissionDecision" || decision["status"] !== "admitted" || decision["simulation"] !== false || decision["evidenceClass"] !== "tti-customer-observed-test" || decision["liveActivationAuthority"] !== false || decision["contractExecuted"] !== false || decision["checkoutCreated"] !== false || decision["paymentObserved"] !== false || decision["revenueRecognized"] !== false || decision["profitRecognized"] !== false || counts?.["requiredTests"] !== 7 || counts?.["passed"] !== 7 || counts?.["failed"] !== 0 || !evidenceValid || decision["provider"] !== activation.provider.actor || decision["offeringId"] !== activation.offeringId || contracts?.["checkout"] !== activation.provider.checkoutContract || contracts?.["webhook"] !== activation.provider.webhookContract || contracts?.["receiptDelivery"] !== activation.provider.receiptDeliveryContract) blockers.push("provider-operational-admission-not-witnessed-or-activation-binding-mismatch");
    } catch { blockers.push("provider-offer-admission-unreadable"); }
  }
  return Object.freeze({
    type: "TTIVaultPaymentReadiness",
    liveReady: blockers.length === 0,
    activationStatus: activation.status,
    productId: VAULT_PRODUCT_ID,
    offeringId: VAULT_OFFERING_ID,
    planId: VAULT_PLAN_ID,
    providerActor: PAYMENT_PROVIDER_ACTOR,
    blockers: Object.freeze([...new Set([...blockers, ...(activation.status === "admitted" ? [] : activation.blockers)])]),
    secretsDisclosed: false,
  });
}

export function buildVaultCheckoutSolicitation(input: Readonly<{
  discordUserId: string;
  orderReference?: string;
  requestId?: string;
  publicOrigin: string;
  providerCheckoutContract?: string;
  providerWebhookContract?: string;
}>): Readonly<{ activity: Record<string, unknown>; pendingBinding: Omit<VaultCheckoutBinding, "id" | "requestDigest" | "providerCheckoutReceiptId" | "recordedAt" | "simulation"> }> {
  if (!/^\d{5,30}$/u.test(input.discordUserId)) throw new Error("verified Discord user id is required");
  if (!isProductionHttpsOrigin(input.publicOrigin) && !input.publicOrigin.startsWith("https://simulation.invalid")) throw new Error("safe public origin is required");
  const orderReference = input.orderReference ?? `urn:tti:vault-order:${randomUUID()}`;
  if (!/^urn:tti:vault-order:[A-Za-z0-9-]{8,200}$/u.test(orderReference)) throw new Error("opaque TTI order reference is required");
  const requestId = input.requestId ?? `urn:tti:vault-checkout-request:${randomUUID()}`;
  const providerCheckoutContract = input.providerCheckoutContract;
  const providerWebhookContract = input.providerWebhookContract;
  if (!isNi(providerCheckoutContract) || !isNi(providerWebhookContract)) throw new Error("admitted provider contracts are required");
  const origin = input.publicOrigin.replace(/\/$/u, "");
  const activity = Object.freeze({
    "@context": "https://www.w3.org/ns/activitystreams",
    id: requestId,
    type: "Offer",
    actor: TTI_ACTOR,
    target: PAYMENT_PROVIDER_ACTOR,
    object: {
      type: "ServiceSolicitation",
      contract: providerCheckoutContract,
      request: {
        offeringId: VAULT_OFFERING_ID,
        quantity: 1,
        successUrl: `${origin}/membership/checkout/success`,
        cancelUrl: `${origin}/membership/checkout/cancel`,
        customerReference: orderReference,
      },
    },
  });
  return {
    activity,
    pendingBinding: {
      type: "TTIVaultCheckoutBinding",
      version: 1,
      orderReference,
      discordUserId: input.discordUserId,
      productId: VAULT_PRODUCT_ID,
      offeringId: VAULT_OFFERING_ID,
      planId: VAULT_PLAN_ID,
      providerActor: PAYMENT_PROVIDER_ACTOR,
      providerCheckoutContract,
      providerWebhookContract,
    },
  };
}

export function bindProviderCheckoutResponse(
  pending: ReturnType<typeof buildVaultCheckoutSolicitation>["pendingBinding"],
  response: Record<string, unknown>,
  options: Readonly<{ recordedAt?: string; simulation?: boolean }> = {},
): VaultCheckoutBinding | VaultPaymentRefusal {
  const object = asRecord(response["object"]);
  if (response["type"] !== "Accept" || response["actor"] !== PAYMENT_PROVIDER_ACTOR || response["target"] !== TTI_ACTOR) return refusal("provider-checkout-envelope-mismatch");
  if (object["type"] !== "StripeCheckoutSessionReceipt" || object["customerSettlement"] !== TTI_ACTOR || object["offeringId"] !== VAULT_OFFERING_ID || object["contract"] !== pending.providerCheckoutContract) return refusal("provider-checkout-receipt-mismatch");
  const requestDigest = stringValue(object["requestDigest"]), receiptId = stringValue(object["id"]);
  if (!isNi(requestDigest) || receiptId === undefined) return refusal("provider-checkout-evidence-incomplete");
  const body = { ...pending, requestDigest, providerCheckoutReceiptId: receiptId, recordedAt: options.recordedAt ?? new Date().toISOString(), simulation: options.simulation === true };
  return Object.freeze({ ...body, id: semanticId(body) });
}

export function admitVaultProviderReceipt(input: Readonly<{
  activity: Record<string, unknown>;
  binding: VaultCheckoutBinding;
  priorDecisions?: readonly VaultEntitlementDecision[];
  observedAt?: string;
  simulationMode?: boolean;
}>): VaultEntitlementDecision | VaultPaymentRefusal {
  const receipt = asRecord(input.activity["object"]) as Partial<VaultProviderEventReceipt>;
  const simulation = input.simulationMode === true;
  if (input.activity["type"] !== "Create" || input.activity["actor"] !== PAYMENT_PROVIDER_ACTOR || input.activity["target"] !== TTI_ACTOR) return refusal("provider-event-envelope-mismatch");
  if (receipt.type !== "StripeWebhookEventReceipt" || receipt.law !== input.binding.providerWebhookContract || receipt.signatureVerified !== true || receipt.supported !== true || receipt.duplicate === true || receipt.rawBodyRecorded !== false || receipt.buyerPersonalDataRecorded !== false) return refusal("provider-event-receipt-not-admissible");
  if (receipt.customerSettlement !== TTI_ACTOR || receipt.offeringId !== VAULT_OFFERING_ID || receipt.requestDigest !== input.binding.requestDigest) return refusal("provider-event-binding-mismatch");
  if (input.binding.productId !== VAULT_PRODUCT_ID || input.binding.planId !== VAULT_PLAN_ID || input.binding.offeringId !== VAULT_OFFERING_ID || input.binding.providerActor !== PAYMENT_PROVIDER_ACTOR || !isNi(input.binding.providerCheckoutContract) || !isNi(input.binding.providerWebhookContract)) return refusal("tti-checkout-binding-mismatch");
  if (simulation ? receipt.livemode !== false || input.binding.simulation !== true : receipt.livemode !== true || input.binding.simulation === true) return refusal("provider-event-mode-mismatch");
  if (typeof receipt.stripeEventId !== "string" || typeof receipt.id !== "string" || typeof receipt.created !== "number" || !Number.isSafeInteger(receipt.created)) return refusal("provider-event-identity-incomplete");
  const prior = input.priorDecisions ?? [];
  if (prior.some((decision) => decision.providerEventId === receipt.stripeEventId)) return refusal("provider-event-duplicate");
  const latestCreated = prior.filter((decision) => decision.requestDigest === input.binding.requestDigest).reduce((maximum, decision) => Math.max(maximum, decision.providerEventCreated), -1);
  if (receipt.created < latestCreated) return refusal("provider-event-stale");
  const status = entitlementStatus(receipt);
  if (status === undefined) return refusal("provider-event-has-no-admitted-entitlement-consequence");
  const body = {
    type: "TTIVaultEntitlementDecision" as const,
    version: 1 as const,
    userId: input.binding.discordUserId,
    provider: PAYMENT_PROVIDER_ACTOR,
    planId: VAULT_PLAN_ID,
    status,
    observedAt: input.observedAt ?? new Date().toISOString(),
    providerReceiptId: receipt.id,
    providerEventId: receipt.stripeEventId,
    providerEventCreated: receipt.created,
    requestDigest: input.binding.requestDigest,
    productId: VAULT_PRODUCT_ID,
    evidenceClass: simulation ? "synthetic-nonposting" as const : "provider-settled-live" as const,
    simulation,
  };
  return Object.freeze({ ...body, id: semanticId(body) });
}

export async function recordVaultCheckoutBinding(store: Pick<SettlementWitness, "record">, binding: VaultCheckoutBinding) {
  return store.record({ category: CHECKOUT_BINDING_CATEGORY, recordedAt: binding.recordedAt, record: binding });
}

export async function recordVaultEntitlementDecision(store: Pick<SettlementWitness, "record">, decision: VaultEntitlementDecision) {
  if (decision.simulation) throw new Error("synthetic vault entitlement decisions cannot post to the live entitlement ledger");
  return store.record({ category: ENTITLEMENT_DECISION_CATEGORY, recordedAt: decision.observedAt, record: decision });
}

export async function beginVaultCheckout(input: Readonly<{
  discordUserId: string;
  orderReference: string;
  requestId: string;
  source?: EnvMap;
  activation?: VaultPaymentActivation;
  store?: Pick<SettlementWitness, "record" | "records">;
  fetchImpl?: typeof fetch;
  recordedAt?: string;
}>): Promise<VaultCheckoutStart | VaultPaymentRefusal> {
  const source = input.source ?? process.env;
  const activation = input.activation ?? loadVaultPaymentActivation();
  const store = input.store ?? vaultSettlementWitness(source);
  const readiness = await vaultPaymentReadiness(source, activation, (await store.records(PROVIDER_OPERATIONAL_ADMISSION_CATEGORY)) as readonly Record<string, unknown>[], (await store.records(PROVIDER_OPERATIONAL_TEST_RECEIPT_CATEGORY)) as readonly Record<string, unknown>[]);
  if (!readiness.liveReady) return refusal("vault-payment-circuit-not-live", readiness.blockers);
  const publicOrigin = env("TTI_PUBLIC_ORIGIN", source)!;
  const providerOrigin = env("TTI_VAULT_PAYMENT_PROVIDER_URL", source)!;
  const customerToken = env("TTI_VAULT_PAYMENT_CUSTOMER_CONTRACT_TOKEN", source)!;
  const built = buildVaultCheckoutSolicitation({ discordUserId: input.discordUserId, orderReference: input.orderReference, requestId: input.requestId, publicOrigin, providerCheckoutContract: activation.provider.checkoutContract, providerWebhookContract: activation.provider.webhookContract });
  let response: Response;
  try {
    response = await (input.fetchImpl ?? fetch)(new URL("/v1/checkout-sessions", `${providerOrigin}/`), {
      method: "POST",
      headers: { authorization: `Bearer ${customerToken}`, "content-type": "application/activity+json" },
      body: JSON.stringify(built.activity),
    });
  } catch {
    return refusal("payment-provider-unavailable");
  }
  let providerActivity: Record<string, unknown>;
  try { providerActivity = await response.json() as Record<string, unknown>; }
  catch { return refusal("payment-provider-invalid-response"); }
  if (!response.ok) return refusal("payment-provider-refused-checkout");
  const object = asRecord(providerActivity["object"]);
  const checkoutUrl = stringValue(object["checkoutUrl"]);
  if (checkoutUrl === undefined || !isSafeCheckoutUrl(checkoutUrl)) return refusal("payment-provider-checkout-url-invalid");
  const binding = bindProviderCheckoutResponse(built.pendingBinding, providerActivity, { recordedAt: input.recordedAt, simulation: false });
  if (binding.type === "TTIVaultPaymentRefusal") return binding;
  const existing = ((await store.records(CHECKOUT_BINDING_CATEGORY)) as readonly VaultCheckoutBinding[]).find((candidate) => candidate.requestDigest === binding.requestDigest);
  if (existing !== undefined) {
    if (existing.discordUserId !== binding.discordUserId || existing.orderReference !== binding.orderReference || existing.providerCheckoutReceiptId !== binding.providerCheckoutReceiptId || existing.simulation) return refusal("existing-checkout-binding-conflict");
  } else {
    await recordVaultCheckoutBinding(store, binding);
  }
  return Object.freeze({ type: "TTIVaultCheckoutStart", checkoutUrl, binding: existing ?? binding, paymentStatus: "unpaid-or-provider-pending", revenueRecognized: false });
}

export async function readVaultEntitlementDecisions(source: EnvMap = process.env): Promise<readonly VaultEntitlementDecision[]> {
  try {
    return (await querySettlementRecordsWithBinding(ENTITLEMENT_DECISION_CATEGORY, { ...(turntideWitnessJournalBindingFromEnvironment(source) ?? {}) })) as readonly VaultEntitlementDecision[];
  } catch (error) {
    // Absent byte custody means no witnessed paid entitlements can be read; access
    // stays closed (nothing is granted) while the public interaction stays answerable.
    // This call never supplies agentUrl, only whatever turntideWitnessJournalBindingFromEnvironment
    // resolves -- when TURNTIDE_WITNESS_JOURNAL_DATA_ROOT is unset that resolves to null, and the
    // installed @red-cup-engineering/witness-journal-document-service (which now falls through to a
    // remote-agentUrl code path when no custody/categoryIndex is injected) throws "agentUrl or an
    // explicit custody/categoryIndex binding is required" for that case; "WitnessJournal byte custody
    // must be injected explicitly" is kept too in case a partial (custody-only) binding is ever passed.
    if (error instanceof Error && (error.message === "agentUrl or an explicit custody/categoryIndex binding is required" || error.message === "WitnessJournal byte custody must be injected explicitly")) return [];
    throw error;
  }
}

export function vaultSettlementWitness(source: EnvMap = process.env): SettlementWitness {
  const agentUrl = env("WITNESS_JOURNAL_RDF_AGENT", source);
  if (agentUrl === undefined) throw new Error("WITNESS_JOURNAL_RDF_AGENT is required");
  return turntideSettlementWitness({ settlementRoot: publicTurntideRoot(source), agentUrl, ...(turntideWitnessJournalBindingFromEnvironment(source) ?? {}) });
}

export function providerReceiptAuthorized(header: string | undefined, source: EnvMap = process.env): boolean {
  const expected = env("TTI_VAULT_PAYMENT_RECEIPT_TOKEN", source);
  const actual = header?.replace(/^Bearer /u, "");
  if (expected === undefined || actual === undefined || expected.length !== actual.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
}

function entitlementStatus(receipt: Partial<VaultProviderEventReceipt>): "active" | "cancelled" | undefined {
  if (receipt.eventType === "checkout.session.completed" && receipt.paymentStatus === "paid") return "active";
  if (receipt.eventType === "invoice.paid" && receipt.status === "paid") return "active";
  if (receipt.eventType === "customer.subscription.deleted") return "cancelled";
  return undefined;
}

function refusal(reason: string, blockers?: readonly string[]): VaultPaymentRefusal { return Object.freeze({ type: "TTIVaultPaymentRefusal", reason, ...(blockers === undefined ? {} : { blockers }) }); }
function isNi(value: string | undefined): value is string { return isCanonicalSha256NiUri(value); }
function selfAddressedRecordId(value: Record<string, unknown>): string { const { id: _discardedIdentity, ...body } = value; return semanticId(body); }
function stringValue(value: unknown): string | undefined { return typeof value === "string" ? value : undefined; }
function asRecord(value: unknown): Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function isProductionHttpsOrigin(value: string): boolean { try { const url = new URL(value); return url.protocol === "https:" && url.username === "" && url.password === "" && url.pathname.replace(/\/$/u, "") === "" && url.search === "" && url.hash === ""; } catch { return false; } }
function isSafeCheckoutUrl(value: string): boolean { try { const url = new URL(value); return url.protocol === "https:" && url.username === "" && url.password === ""; } catch { return false; } }
