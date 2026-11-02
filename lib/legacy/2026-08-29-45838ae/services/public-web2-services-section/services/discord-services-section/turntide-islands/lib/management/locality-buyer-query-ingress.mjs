import { timingSafeEqual } from "node:crypto";
import { EMPTY_WITNESS_ROOT, identifyJsonSemanticContent } from "@red-cup-engineering/semantic-content-identify-service";
const semanticId = (value) => identifyJsonSemanticContent({ objectKind: "turntide-islands.record", value, witnessRoot: EMPTY_WITNESS_ROOT }).token;
import { createSettlementStore } from "@red-cup-engineering/settlement-record-store-service";
import { turntideWitnessJournalBindingFromEnvironment } from "./settlement-witness-journal-binding.mjs";
import {
  LOCALITY_KNOWLEDGE_PRICE_MICROS,
  LOCALITY_KNOWLEDGE_PRODUCT_ID,
  admitLocalityKnowledgeBuyerQuery,
} from "./locality-knowledge-product.mjs";

export const TTI_ACTOR = "urn:ame:turntide-islands";
export const LOCALITY_BUYER_QUERY_INGRESS_CATEGORY = "tti-locality-buyer-query-ingress-v1";
export const LOCALITY_BUYER_QUERY_CATEGORY = "tti-locality-buyer-query-v1";
export const LOCALITY_BUYER_QUERY_ADMISSION_CATEGORY = "tti-locality-buyer-query-admission-bundle-v1";
const MAX_BODY_BYTES = 16_384;
const MAX_REQUEST_WINDOW_MS = 24 * 60 * 60 * 1000;
const REQUEST_KEYS = new Set([
  "id", "type", "version", "productId", "buyerTermsId", "buyerTermsAcknowledged",
  "buyerSettlement", "question", "subject", "geographicContext", "temporalContext",
  "intendedUse", "budget", "requestedAt", "expiresAt", "noPersonalDataAttested", "sensitiveClasses",
]);

export function localityBuyerQueryAuthorized(authorization, expectedToken) {
  const actual = typeof authorization === "string" ? authorization.replace(/^Bearer /u, "") : undefined;
  if (typeof expectedToken !== "string" || expectedToken.length < 32 || actual === undefined || actual.length !== expectedToken.length) return false;
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expectedToken));
}

export function localityBuyerQueryRequestId(object) {
  const { id: _discarded, ...body } = object;
  return semanticId(body);
}

export function localityBuyerQueryRecorderFromSettlementStore(store) {
  if (typeof store?.records !== "function" || typeof store?.record !== "function") throw new TypeError("locality buyer-query recorder requires a settlement store");
  return Object.freeze({
    async findQuery(id) {
      const bundle = store.records(LOCALITY_BUYER_QUERY_ADMISSION_CATEGORY).find((row) => row?.type === "TTILocalityBuyerQueryAdmissionBundle" && row?.query?.id === id);
      return bundle?.query;
    },
    async recordAdmission({ ingressReceipt, query }) {
      const accepted = ingressReceipt?.type === "TTILocalityBuyerQueryIngressReceipt" && ingressReceipt.status === "accepted";
      const refused = ingressReceipt?.type === "TTILocalityBuyerQueryIngressReceipt" && ingressReceipt.status === "refused";
      if (!selfAddressed(ingressReceipt) || (!accepted && !refused)) throw new Error("buyer-query ingress receipt is not a self-addressed decision");
      if (accepted && (!selfAddressed(query) || query.type !== "TTILocalityKnowledgeBuyerQuery" || ingressReceipt.admittedQueryId !== query.id)) throw new Error("accepted ingress must atomically bind its self-addressed admitted query");
      if (refused && query !== null) throw new Error("refused ingress cannot carry an admitted query");
      const body = {
        type: "TTILocalityBuyerQueryAdmissionBundle", version: 1, recordedAt: ingressReceipt.receivedAt,
        productId: LOCALITY_KNOWLEDGE_PRODUCT_ID, ingressReceipt, query,
        atomicAdmission: true, discordContentImported: false,
        legalEffect: accepted ? "admitted-buyer-demand-only-no-offer-sale-payment-entitlement-revenue-or-profit" : "buyer-query-refusal-only-no-economic-effect",
      };
      const record = Object.freeze({ ...body, id: semanticId(body) });
      await store.record({ category: LOCALITY_BUYER_QUERY_ADMISSION_CATEGORY, recordedAt: ingressReceipt.receivedAt, record, assertions: [
        { subject: record.id, predicate: "urn:emsenn:venture:buyer-query-ingress-receipt", object: { kind: "iri", value: ingressReceipt.id } },
        ...(query === null ? [] : [{ subject: record.id, predicate: "urn:emsenn:venture:admitted-buyer-query", object: { kind: "iri", value: query.id } }]),
      ] });
      return record;
    },
  });
}

export function createLocalityBuyerQueryRecorder(options = {}) {
  const witnessJournal = options.witnessJournal ?? turntideWitnessJournalBindingFromEnvironment();
  return localityBuyerQueryRecorderFromSettlementStore(createSettlementStore({ ...options, ...(witnessJournal ?? {}) }));
}

export function inspectLocalityBuyerQueryActivity({ activity, authenticatedBuyerSettlement, receivedAt }) {
  const object = asRecord(activity?.object);
  const requestId = stringValue(object.id) ?? null;
  const bodyDigest = semanticId(object);
  const reasons = [];
  if (activity?.["@context"] !== "https://www.w3.org/ns/activitystreams" || activity?.type !== "Create") reasons.push("buyer-query-activity-envelope-invalid");
  if (activity?.actor !== authenticatedBuyerSettlement || activity?.target !== TTI_ACTOR || object.buyerSettlement !== authenticatedBuyerSettlement) reasons.push("buyer-query-authenticated-actor-target-or-settlement-mismatch");
  if (object.type !== "TTILocalityKnowledgeBuyerQueryRequest" || object.version !== 1 || object.productId !== LOCALITY_KNOWLEDGE_PRODUCT_ID) reasons.push("buyer-query-request-type-or-product-invalid");
  if (requestId === null || requestId !== localityBuyerQueryRequestId(object)) reasons.push("buyer-query-request-content-identity-mismatch");
  if (Object.keys(object).some((key) => !REQUEST_KEYS.has(key))) reasons.push("buyer-query-request-field-not-admitted");
  if (object.buyerTermsAcknowledged !== true) reasons.push("buyer-query-exact-terms-not-acknowledged");
  const received = Date.parse(receivedAt), requested = Date.parse(stringValue(object.requestedAt) ?? ""), expires = Date.parse(stringValue(object.expiresAt) ?? "");
  if (!Number.isFinite(received) || !Number.isFinite(requested) || !Number.isFinite(expires) || requested > received || expires <= received || expires - requested > MAX_REQUEST_WINDOW_MS) reasons.push("buyer-query-request-not-current-or-window-exceeds-24-hours");
  const admitted = admitLocalityKnowledgeBuyerQuery({
    sourceProtocol: "tti-direct-buyer-query-v1",
    buyerSettlement: object.buyerSettlement,
    question: object.question,
    subject: object.subject,
    geographicContext: object.geographicContext,
    temporalContext: object.temporalContext,
    intendedUse: object.intendedUse,
    budget: object.budget,
    requestedAt: object.requestedAt,
    noPersonalDataAttested: object.noPersonalDataAttested,
    buyerTermsAcknowledged: object.buyerTermsAcknowledged,
    sensitiveClasses: object.sensitiveClasses,
  });
  if (admitted.type !== "TTILocalityKnowledgeBuyerQuery") reasons.push(...admitted.reasons);
  const uniqueReasons = [...new Set(reasons)];
  const receiptBody = {
    type: "TTILocalityBuyerQueryIngressReceipt",
    version: 1,
    status: uniqueReasons.length === 0 ? "accepted" : "refused",
    receivedAt,
    buyerSettlement: typeof authenticatedBuyerSettlement === "string" ? authenticatedBuyerSettlement : null,
    sellerSettlement: TTI_ACTOR,
    requestId,
    admittedQueryId: uniqueReasons.length === 0 ? admitted.id : null,
    bodyDigest,
    productId: LOCALITY_KNOWLEDGE_PRODUCT_ID,
    transportAuthentication: "dedicated-buyer-contract-token",
    buyerAuthenticated: true,
    reason: uniqueReasons[0] ?? null,
    reasonCount: uniqueReasons.length,
    secretRecorded: false,
    saleFormed: false,
    paymentObserved: false,
    entitlementCreated: false,
    revenueRecognized: false,
    profitRecognized: false,
  };
  const ingressReceipt = Object.freeze({ ...receiptBody, id: semanticId(receiptBody) });
  return Object.freeze({ ingressReceipt, query: uniqueReasons.length === 0 ? admitted : null, reasons: Object.freeze(uniqueReasons) });
}

export async function localityBuyerQueryHttpResponse(input) {
  if (!localityBuyerQueryAuthorized(input.authorization, input.expectedToken)) return response(401, "buyer-query-not-authenticated");
  if (input.buyerTermsEffective !== true) return response(503, "locality-buyer-terms-not-effective");
  if (typeof input.authenticatedBuyerSettlement !== "string") return response(503, "buyer-contract-settlement-not-configured");
  if (input.contentType?.split(";", 1)[0]?.trim().toLowerCase() !== "application/activity+json") return response(415, "buyer-query-content-type-invalid");
  if (typeof input.body !== "string" || Buffer.byteLength(input.body, "utf8") > MAX_BODY_BYTES) return response(413, "buyer-query-body-absent-or-too-large");
  if (typeof input.recorder?.findQuery !== "function" || typeof input.recorder?.recordAdmission !== "function") return response(503, "buyer-query-witness-service-unavailable");
  let activity;
  try { activity = JSON.parse(input.body); } catch { return response(400, "buyer-query-json-invalid"); }
  if (activity === null || typeof activity !== "object" || Array.isArray(activity)) return response(400, "buyer-query-json-object-required");
  const inspected = inspectLocalityBuyerQueryActivity({ activity, authenticatedBuyerSettlement: input.authenticatedBuyerSettlement, receivedAt: input.recordedAt ?? new Date().toISOString() });
  if (inspected.query === null) {
    await input.recorder.recordAdmission({ ingressReceipt: inspected.ingressReceipt, query: null });
    return response(422, inspected.reasons[0] ?? "buyer-query-refused", { ingressReceiptId: inspected.ingressReceipt.id, reasonCount: inspected.reasons.length });
  }
  const existing = await input.recorder.findQuery(inspected.query.id);
  if (existing !== undefined && existing !== null) return acceptedResponse(200, existing, true);
  await input.recorder.recordAdmission({ ingressReceipt: inspected.ingressReceipt, query: inspected.query });
  return acceptedResponse(202, inspected.query, false, inspected.ingressReceipt.id);
}

function acceptedResponse(status, query, replayed, ingressReceiptId = null) {
  return {
    status,
    body: {
      type: "TTILocalityBuyerQueryAdmissionResponse",
      queryId: query.id,
      ingressReceiptId,
      queryAdmitted: true,
      fixedPriceQualified: query.budget.currency === "USD" && query.budget.maximumMicros >= LOCALITY_KNOWLEDGE_PRICE_MICROS,
      replayed,
      legalEffect: "buyer-demand-only-no-offer-sale-payment-entitlement-revenue-or-profit",
      saleFormed: false,
      paymentObserved: false,
      entitlementCreated: false,
      revenueRecognized: false,
      profitRecognized: false,
    },
  };
}

function response(status, reason, extra = {}) {
  return { status, body: { type: "TTILocalityBuyerQueryIngressRefusal", reason, ...extra, saleFormed: false, paymentObserved: false, entitlementCreated: false, revenueRecognized: false, profitRecognized: false } };
}
function asRecord(value) { return value !== null && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function stringValue(value) { return typeof value === "string" ? value : undefined; }
function selfAddressed(value) { if (value === null || typeof value !== "object" || Array.isArray(value) || typeof value.id !== "string") return false; const { id, ...body } = value; return id === semanticId(body); }
