import express from "express";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { EMPTY_WITNESS_ROOT, identifyJsonSemanticContent } from "@red-cup-engineering/semantic-content-identify-service";
import { isNiUri as isCanonicalSha256NiUri } from "@red-cup-engineering/ni-services-section";
const semanticId = (value) => identifyJsonSemanticContent({ objectKind: "turntide-islands.record", value, witnessRoot: EMPTY_WITNESS_ROOT }).token;
import { createSettlementStore } from "@red-cup-engineering/settlement-record-store-service";
import { turntideWitnessJournalBindingFromEnvironment } from "./settlement-witness-journal-binding.mjs";
import { createExactEvmPaymentBoundary } from "@red-cup-engineering/x402-services-section/server";
import {
  LOCALITY_KNOWLEDGE_CONTRACT,
  LOCALITY_KNOWLEDGE_PRICE_MICROS,
  LOCALITY_KNOWLEDGE_PRODUCT_ID,
} from "./locality-knowledge-product.mjs";

export const X402_PROVIDER_ACTOR = "urn:ame:x402-services-section";
export const X402_PROVIDER_CONTRACT = "ni:///sha-256;UPEWFFhGNc-ShEFpEsU9JjK-6n5CEHEXCyWH_JxFuwE";
export const LOCALITY_X402_CONTRACT = "ni:///sha-256;9gpIJXRaBjriY0HKOUt8cZcfkkQ0CDPqZdAoi17GowA";
export const LOCALITY_X402_ROUTE = "GET /knowledge/locality/:offerId";
export const LOCALITY_X402_PRICE = "$10.00";
export const LOCALITY_X402_SETTLEMENT_CATEGORY = "tti-locality-x402-settlement-bundle-v1";
export const LOCALITY_X402_PRODUCTION_ACTIVATION_CATEGORY = "tti-locality-x402-production-activation-v1";
export const LOCALITY_X402_PRODUCTION_ACTIVATION_ID = "tti-locality-x402-production-activation-2026-01";
const DEVELOPMENT_NETWORK = "eip155:31337";
const PRODUCTION_NETWORKS = new Set(["eip155:8453"]);
const TTI_ENTERPRISE_ID = "0xa85e9bcdca127611b64bb10fb1b72fc829742a650d7902a4a601c2835d2bc5ad";
const REQUIRED_PRODUCTION_CHECKS = Object.freeze([
  "base-mainnet-standards-deployment",
  "tti-base-enterprise-account-binding",
  "base-mainnet-payment-asset",
  "production-facilitator-contract-and-cost-quote",
  "buyer-refund-chargeback-and-maturity-law",
  "public-https-payment-origin",
  "qualified-legal-tax-and-security-review",
]);

export function admitLocalityX402Configuration({ accountBinding, network, payTo, asset, facilitatorUrl, activationAdmission, recordedAt = new Date().toISOString(), simulationMode = false }) {
  const reasons = [];
  const address = accountBinding?.account?.address?.toLowerCase(), caip10 = accountBinding?.account?.caip10?.toLowerCase();
  if (!validEnterpriseBinding(accountBinding, network)) reasons.push("tti-network-account-binding-invalid");
  if (!/^0x[0-9a-f]{40}$/u.test(address ?? "") || payTo?.toLowerCase() !== address) reasons.push("x402-pay-to-not-bound-to-tti-account");
  if (simulationMode ? network !== DEVELOPMENT_NETWORK : !PRODUCTION_NETWORKS.has(network)) reasons.push("x402-network-not-admitted-for-selected-economic-mode");
  if (!/^0x[0-9a-fA-F]{40}$/u.test(asset ?? "")) reasons.push("x402-payment-asset-absent");
  const production = simulationMode ? null : admitLocalityX402ProductionActivation({ activationAdmission, accountBinding, network, payTo, asset, facilitatorUrl, recordedAt });
  if (!simulationMode && production?.type !== "TTILocalityX402ProductionActivationAdmission") reasons.push(...(production?.reasons ?? ["production-activation-absent"]));
  if (reasons.length > 0) return refusal("configuration", reasons);
  return Object.freeze({
    type: "TTILocalityX402ConfigurationAdmission", version: 1, network, payTo: address, asset: asset.toLowerCase(), price: LOCALITY_X402_PRICE,
    routePrice: Object.freeze({ asset: asset.toLowerCase(), amount: String(LOCALITY_KNOWLEDGE_PRICE_MICROS) }), priceMicros: LOCALITY_KNOWLEDGE_PRICE_MICROS, scheme: "exact", x402Version: 2,
    provider: X402_PROVIDER_ACTOR, simulation: simulationMode,
    activationId: production?.activationId ?? null, facilitator: production?.facilitator ?? null, publicOrigin: production?.publicOrigin ?? null, pilotSaleLimit: production?.pilotSaleLimit ?? null,
    revenueRecognition: simulationMode ? "forbidden-development-chain" : "requires-successful-provider-settlement-receipt-under-exact-production-activation",
  });
}

export function admitLocalityX402ProductionActivation({ activationAdmission, accountBinding, network, payTo, asset, facilitatorUrl, recordedAt }) {
  const reasons = [], activation = activationAdmission;
  if (activation?.type !== "TTILocalityX402ProductionActivationAdmission" || activation?.version !== 1 || activation?.id !== LOCALITY_X402_PRODUCTION_ACTIVATION_ID || activation?.status !== "admitted") reasons.push("production-activation-not-admitted");
  if (activation?.provider !== X402_PROVIDER_ACTOR) reasons.push("production-activation-provider-law-mismatch");
  if (activation?.network !== network || activation?.asset?.toLowerCase() !== asset?.toLowerCase() || activation?.payTo?.toLowerCase() !== payTo?.toLowerCase() || activation?.accountBinding !== accountBinding?.account?.caip10) reasons.push("production-activation-account-network-asset-mismatch");
  if (activation?.assetMetadata?.address?.toLowerCase() !== asset?.toLowerCase() || activation?.assetMetadata?.symbol !== "USDC" || activation?.assetMetadata?.decimals !== 6 || !isNi(activation?.assetMetadata?.contractEvidenceId)) reasons.push("production-payment-asset-metadata-incomplete");
  const issued = Date.parse(activation?.issuedAt), expires = Date.parse(activation?.expiresAt), now = Date.parse(recordedAt);
  if (!Number.isFinite(issued) || !Number.isFinite(expires) || !Number.isFinite(now) || issued > now || now >= expires || expires - issued > 31 * 24 * 60 * 60 * 1000) reasons.push("production-activation-window-invalid");
  const facilitator = activation?.facilitator;
  if (!exactHttpsBaseUrl(facilitator?.url) || !facilitator?.actor?.startsWith("urn:") || !isNi(facilitator?.contract) || !isNi(facilitator?.costQuoteReceipt) || !isNi(facilitator?.capabilityReceipt)) reasons.push("production-facilitator-admission-incomplete");
  if (facilitatorUrl !== undefined && facilitatorUrl !== facilitator?.url) reasons.push("caller-selected-facilitator-conflicts-with-activation");
  if (!exactHttpsOrigin(activation?.publicOrigin) || !isNi(activation?.buyerAndMaturityLaw)) reasons.push("production-origin-or-buyer-maturity-law-incomplete");
  if (activation?.pilot?.maximumSettledSales !== 1 || activation?.pilot?.maximumGrossRevenueMicros !== LOCALITY_KNOWLEDGE_PRICE_MICROS || activation?.pilot?.bulkActivation !== false) reasons.push("production-activation-not-bounded-to-one-sale-pilot");
  const checks = new Map(Array.isArray(activation?.checks) ? activation.checks.map((check) => [check?.id, check]) : []);
  for (const id of REQUIRED_PRODUCTION_CHECKS) if (checks.get(id)?.status !== "passed" || !isNi(checks.get(id)?.evidenceId)) reasons.push(`production-check-not-passed:${id}`);
  if (reasons.length > 0) return refusal("production-activation", reasons);
  return Object.freeze({ type: "TTILocalityX402ProductionActivationAdmission", version: 1, activationId: activation.id, facilitator: Object.freeze({ actor: facilitator.actor, contract: facilitator.contract, url: facilitator.url, costQuoteReceipt: facilitator.costQuoteReceipt, capabilityReceipt: facilitator.capabilityReceipt }), publicOrigin: activation.publicOrigin, buyerAndMaturityLaw: activation.buyerAndMaturityLaw, pilotSaleLimit: 1 });
}

export function admitLocalityX402ProductionRequestOrigin({ publicOrigin, host, forwardedProtocol }) {
  if (!exactHttpsOrigin(publicOrigin)) return refusal("public-origin", ["admitted-production-public-origin-invalid"]);
  const expected = new URL(publicOrigin), protocol = String(forwardedProtocol ?? "").split(",")[0].trim().toLowerCase();
  return host === expected.host && protocol === "https"
    ? Object.freeze({ type: "TTILocalityX402ProductionRequestOriginAdmission", version: 1, publicOrigin })
    : refusal("public-origin", ["production-request-not-forwarded-from-admitted-https-origin"]);
}

export function admitLocalityOfferForX402({ offer, configuration, recordedAt }) {
  const reasons = [];
  if (!selfAddressed(offer) || offer?.type !== "TTILocalityKnowledgeProductOffer" || offer.productId !== LOCALITY_KNOWLEDGE_PRODUCT_ID) reasons.push("self-addressed-locality-offer-absent");
  if (configuration?.type !== "TTILocalityX402ConfigurationAdmission" || offer?.simulation !== configuration?.simulation) reasons.push("offer-and-payment-mode-mismatch");
  if (offer?.price?.currency !== "USD" || offer?.price?.unitAmountMicros !== LOCALITY_KNOWLEDGE_PRICE_MICROS || offer?.price?.quantity !== 1 || offer?.price?.status !== "fixed-offer-not-payment") reasons.push("offer-price-not-exact-fixed-product-price");
  const now = Date.parse(recordedAt), expires = Date.parse(offer?.expiresAt);
  if (!Number.isFinite(now) || !Number.isFinite(expires) || now >= expires) reasons.push("offer-expired-before-payment-challenge");
  if (offer?.saleFormed !== false || offer?.paymentObserved !== false || offer?.revenueRecognized !== false) reasons.push("offer-already-claims-economic-effect");
  return reasons.length > 0 ? refusal("offer-payment-admission", reasons) : Object.freeze({ type: "TTILocalityOfferPaymentAdmission", version: 1, offerId: offer.id, productId: offer.productId, buyerSettlement: offer.buyerSettlement, network: configuration.network, payTo: configuration.payTo, price: configuration.price, simulation: configuration.simulation, legalEffect: "payment-challenge-authorized-no-payment-sale-entitlement-revenue-or-profit" });
}

export function admitLocalityX402Settlement({ offer, configuration, providerSettlement, recordedAt }) {
  const offerAdmission = admitLocalityOfferForX402({ offer, configuration, recordedAt }), reasons = [];
  if (offerAdmission.type !== "TTILocalityOfferPaymentAdmission") reasons.push(...offerAdmission.reasons);
  if (providerSettlement?.provider !== X402_PROVIDER_ACTOR || providerSettlement?.providerContract !== X402_PROVIDER_CONTRACT || providerSettlement?.x402Version !== 2 || providerSettlement?.scheme !== "exact") reasons.push("x402-provider-contract-or-protocol-mismatch");
  if (providerSettlement?.success !== true || providerSettlement?.offerId !== offer?.id || providerSettlement?.network !== configuration?.network || providerSettlement?.payTo?.toLowerCase() !== configuration?.payTo || providerSettlement?.asset?.toLowerCase() !== configuration?.asset) reasons.push("x402-settlement-not-bound-to-offer-network-asset-and-pay-to");
  if (providerSettlement?.amount !== String(LOCALITY_KNOWLEDGE_PRICE_MICROS) || !/^0x[0-9a-fA-F]{64}$/u.test(providerSettlement?.transaction ?? "") || !/^0x[0-9a-fA-F]{40}$/u.test(providerSettlement?.payer ?? "")) reasons.push("x402-settlement-amount-transaction-or-payer-invalid");
  if (providerSettlement?.simulation !== configuration?.simulation) reasons.push("x402-settlement-economic-mode-mismatch");
  if (reasons.length > 0) return refusal("settlement", reasons);
  const evidenceBody = {
    type: "TTIX402ProviderSettlementEvidence", version: 1, observedAt: recordedAt, provider: X402_PROVIDER_ACTOR, contract: LOCALITY_X402_CONTRACT,
    x402Version: 2, scheme: "exact", network: providerSettlement.network, asset: providerSettlement.asset.toLowerCase(), transaction: providerSettlement.transaction.toLowerCase(), payer: providerSettlement.payer.toLowerCase(), payTo: providerSettlement.payTo.toLowerCase(), amount: providerSettlement.amount,
    offerId: offer.id, productId: offer.productId, simulation: configuration.simulation, activationId: configuration.activationId,
    facilitator: configuration.facilitator ? { actor: configuration.facilitator.actor, contract: configuration.facilitator.contract, costQuoteReceipt: configuration.facilitator.costQuoteReceipt, capabilityReceipt: configuration.facilitator.capabilityReceipt } : null,
    rawPaymentPayloadRecorded: false,
  };
  const providerEvidence = withId(evidenceBody);
  const saleBody = {
    type: "TTIKnowledgeSaleReceipt", version: 1, status: "settled", recordedAt, productId: offer.productId, contract: offer.contract, offerId: offer.id, buyerSettlement: offer.buyerSettlement,
    provider: X402_PROVIDER_ACTOR, settlementEvidenceId: providerEvidence.id, network: providerSettlement.network, transaction: providerSettlement.transaction.toLowerCase(), payer: providerSettlement.payer.toLowerCase(), payTo: providerSettlement.payTo.toLowerCase(), currency: "USD", settledAmountMicros: LOCALITY_KNOWLEDGE_PRICE_MICROS,
    grossRevenue: { status: configuration.simulation ? "synthetic" : "measured", micros: LOCALITY_KNOWLEDGE_PRICE_MICROS }, paymentProcessingCost: { status: "unknown" }, directProviderCost: { status: "unknown" }, maturedRefundsAndChargebacks: { status: "unknown" }, maturityStatus: "unmatured", refundWindowClosedAt: null,
    activationId: configuration.activationId, facilitator: configuration.facilitator ? { actor: configuration.facilitator.actor, contract: configuration.facilitator.contract, costQuoteReceipt: configuration.facilitator.costQuoteReceipt } : null, pilotSaleLimit: configuration.pilotSaleLimit,
    simulation: configuration.simulation, paymentObserved: true, entitlementCreated: false, fulfillmentRecognized: false, revenueRecognized: !configuration.simulation, profitRecognized: false,
    recognition: configuration.simulation ? "development-chain-settlement-never-revenue" : "externally-settled-gross-revenue-costs-and-profit-still-unknown",
  };
  return Object.freeze({ type: "TTILocalityX402SettlementAdmission", providerEvidence, saleReceipt: withId(saleBody) });
}

export function localityX402SettlementRecorderFromSettlementStore(store) {
  if (typeof store?.records !== "function" || typeof store?.record !== "function") throw new TypeError("locality x402 recorder requires a settlement store");
  return async (admission) => {
    const evidence = admission?.providerEvidence, sale = admission?.saleReceipt;
    if (admission?.type !== "TTILocalityX402SettlementAdmission" || !selfAddressed(evidence) || !selfAddressed(sale) || sale.settlementEvidenceId !== evidence.id || sale.transaction !== evidence.transaction || sale.offerId !== evidence.offerId) throw new Error("locality x402 admission bundle is not internally self-addressed and bound");
    const prior = store.records(LOCALITY_X402_SETTLEMENT_CATEGORY).filter((row) => row?.type === "TTILocalityX402SettlementBundle");
    const replay = prior.find((row) => row.saleReceipt.id === sale.id && row.providerEvidence.id === evidence.id);
    if (replay) return replay;
    if (prior.some((row) => row.saleReceipt.offerId === sale.offerId || row.saleReceipt.transaction === sale.transaction)) throw new Error("locality x402 offer or transaction settlement replay conflict");
    if (sale.simulation === false) {
      if (!sale.activationId || sale.pilotSaleLimit !== 1 || prior.some((row) => row.saleReceipt.simulation === false && row.saleReceipt.activationId === sale.activationId)) throw new Error("locality x402 production activation one-sale pilot limit reached or absent");
      const claimOnce = typeof store.claimOnce === "function" ? store.claimOnce.bind(store) : store.root ? localActivationClaim(store.root) : null;
      if (!claimOnce) throw new Error("locality x402 production settlement requires atomic activation claim capability");
      await claimOnce({ activationId: sale.activationId, saleReceiptId: sale.id, providerEvidenceId: evidence.id, transaction: sale.transaction });
    }
    const body = { type: "TTILocalityX402SettlementBundle", version: 1, recordedAt: sale.recordedAt, providerEvidence: evidence, saleReceipt: sale, atomicAdmission: true, rawPaymentPayloadRecorded: false };
    const record = withId(body);
    await store.record({ category: LOCALITY_X402_SETTLEMENT_CATEGORY, recordedAt: sale.recordedAt, record, assertions: [
      { subject: record.id, predicate: "urn:emsenn:venture:x402-provider-settlement-evidence", object: { kind: "iri", value: evidence.id } },
      { subject: record.id, predicate: "urn:emsenn:venture:settled-locality-knowledge-sale", object: { kind: "iri", value: sale.id } },
    ] });
    return record;
  };
}

export function createLocalityX402SettlementRecorder(options = {}) { const witnessJournal = options.witnessJournal ?? turntideWitnessJournalBindingFromEnvironment(); return localityX402SettlementRecorderFromSettlementStore(createSettlementStore({ ...options, ...(witnessJournal ?? {}) })); }

export function createLocalityKnowledgePaymentServer(options) {
  if (options.simulationMode !== true && options.activationAdmission !== undefined) throw new Error("production x402 activation must be read from the TTI settlement store, not caller input");
  if (options.simulationMode !== true && options.facilitatorClient !== undefined) throw new Error("production x402 facilitator client injection is forbidden");
  if (options.simulationMode !== true && options.facilitatorUrl !== undefined) throw new Error("production x402 facilitator URL must be derived from activation");
  const productionStore = options.simulationMode === true ? null : options.settlementStore;
  const activationAdmission = options.simulationMode === true ? options.activationAdmission : productionActivationFromStore(productionStore);
  const configuration = admitLocalityX402Configuration({ ...options, activationAdmission });
  if (configuration.type !== "TTILocalityX402ConfigurationAdmission") throw new Error(`locality x402 configuration refused: ${configuration.reasons.join(",")}`);
  const recordSettlement = options.simulationMode === true ? options.recordSettlement : localityX402SettlementRecorderFromSettlementStore(productionStore);
  if (typeof options.offerLookup !== "function" || typeof recordSettlement !== "function") throw new TypeError("locality x402 server requires sovereign offer lookup and settlement recording");
  const app = express();
  if (!configuration.simulation) app.use((request, response, next) => {
    const origin = admitLocalityX402ProductionRequestOrigin({ publicOrigin: configuration.publicOrigin, host: request.headers.host, forwardedProtocol: request.headers["x-forwarded-proto"] });
    if (origin.type !== "TTILocalityX402ProductionRequestOriginAdmission") return response.status(421).json(origin);
    next();
  });
  app.get("/knowledge/locality/:offerId", async (request, response, next) => {
    response.set("Link", `<${LOCALITY_KNOWLEDGE_CONTRACT}>; rel="describedby"; type="application/rmn+cbor"`);
    try {
      const offer = await options.offerLookup(request.params.offerId), admitted = admitLocalityOfferForX402({ offer, configuration, recordedAt: options.now?.() ?? new Date().toISOString() });
      if (admitted.type !== "TTILocalityOfferPaymentAdmission") return response.status(422).json(admitted);
      response.locals.localityOfferId = offer.id; next();
    } catch (error) { next(error); }
  });
  const payment = createExactEvmPaymentBoundary({
    network: configuration.network, facilitatorUrl: configuration.facilitator?.url ?? options.facilitatorUrl, facilitatorClient: options.facilitatorClient,
    routes: { [LOCALITY_X402_ROUTE]: { accepts: { scheme: "exact", price: configuration.routePrice, network: configuration.network, payTo: configuration.payTo }, description: "One source-traceable TTI locality knowledge answer under a frozen buyer offer.", serviceName: "tti-locality-knowledge-answer", tags: ["locality-knowledge", "provenance", "union"] } },
    afterSettle: async (context) => {
      const url = context.paymentPayload?.resource?.url, offerId = offerIdFromResourceUrl(url), offer = await options.offerLookup(offerId);
      const providerSettlement = { provider: X402_PROVIDER_ACTOR, providerContract: X402_PROVIDER_CONTRACT, x402Version: context.paymentPayload.x402Version, scheme: context.requirements.scheme, success: context.result.success, offerId, network: context.result.network, asset: context.requirements.asset, transaction: context.result.transaction, payer: context.result.payer, payTo: context.requirements.payTo, amount: context.requirements.amount, simulation: configuration.simulation };
      const admission = admitLocalityX402Settlement({ offer, configuration, providerSettlement, recordedAt: options.now?.() ?? new Date().toISOString() });
      if (admission.type !== "TTILocalityX402SettlementAdmission") throw new Error(`x402 settlement admission refused: ${admission.reasons.join(",")}`);
      await recordSettlement(admission);
    },
  });
  app.use(payment.middleware);
  app.get("/knowledge/locality/:offerId", (request, response) => response.status(202).json({ type: "TTILocalityKnowledgePurchaseAcceptance", productId: LOCALITY_KNOWLEDGE_PRODUCT_ID, offerId: request.params.offerId, fulfillmentStatus: "settlement-recording-then-separate-authenticated-delivery", legalEffect: "payment-settlement-only-no-claim-that-answer-is-already-delivered-or-profit-known" }));
  return Object.freeze({ app, configuration, payment });
}

function offerIdFromResourceUrl(value) {
  try { const url = new URL(value), match = /^\/knowledge\/locality\/(.+)$/u.exec(url.pathname); if (match) return decodeURIComponent(match[1]); } catch {}
  throw new Error("x402 settlement resource URL does not bind one locality offer");
}
function refusal(stage, reasons) { return Object.freeze({ type: "TTILocalityX402Refusal", stage, reasons: [...new Set(reasons)], paymentObserved: false, entitlementCreated: false, revenueRecognized: false, profitRecognized: false }); }
function withId(body) { return Object.freeze({ ...body, id: semanticId(body) }); }
function selfAddressed(value) { if (value === null || typeof value !== "object" || Array.isArray(value) || typeof value.id !== "string") return false; const { id, ...body } = value; return id === semanticId(body); }
function validEnterpriseBinding(binding, network) {
  const address = binding?.account?.address;
  return binding?.profile === "org.emsenn.evm.sovereign-enterprise-account.v3"
    && binding?.enterprise?.nodeId === "turntide-islands" && binding?.enterprise?.urn === "urn:ame:turntide-islands" && binding?.enterprise?.enterpriseId?.toLowerCase() === TTI_ENTERPRISE_ID
    && binding?.chain?.caip2 === network && binding?.chain?.chainId === Number(network?.split(":")[1])
    && /^0x[0-9a-fA-F]{40}$/u.test(address ?? "") && binding?.account?.caip10?.toLowerCase() === `${network}:${address}`.toLowerCase()
    && /^0x[0-9a-fA-F]{40}$/u.test(binding?.factory?.address ?? "") && /^0x[0-9a-fA-F]{64}$/u.test(binding?.factory?.userSalt ?? "")
    && /^0x[0-9a-fA-F]{40}$/u.test(binding?.policy?.signer ?? "") && binding?.policy?.custody === "settlement-private" && binding.policy.signer.toLowerCase() !== address.toLowerCase()
    && Number.isSafeInteger(binding?.deployment?.block) && binding.deployment.block >= 0 && /^0x[0-9a-fA-F]{64}$/u.test(binding?.deployment?.transaction ?? "");
}
function exactHttpsOrigin(value) { try { const url = new URL(value); return url.protocol === "https:" && url.origin === value && url.username === "" && url.password === "" && url.pathname === "/"; } catch { return false; } }
function exactHttpsBaseUrl(value) { try { const url = new URL(value); return url.protocol === "https:" && url.username === "" && url.password === "" && url.search === "" && url.hash === "" && url.toString() === value; } catch { return false; } }
function isNi(value) { return isCanonicalSha256NiUri(value); }
function productionActivationFromStore(store) {
  if (typeof store?.records !== "function" || typeof store?.record !== "function" || (!store.root && typeof store.claimOnce !== "function")) throw new TypeError("production x402 server requires the TTI settlement store with atomic activation claims");
  const admitted = store.records(LOCALITY_X402_PRODUCTION_ACTIVATION_CATEGORY).filter((record) => record?.type === "TTILocalityX402ProductionActivationAdmission" && record?.id === LOCALITY_X402_PRODUCTION_ACTIVATION_ID && record?.status === "admitted");
  if (admitted.length !== 1) throw new Error("production x402 settlement store must contain exactly one admitted activation");
  return admitted[0];
}
function localActivationClaim(root) {
  return async (claim) => {
    const body = { type: "TTILocalityX402ActivationClaim", version: 1, activationId: claim.activationId, saleReceiptId: claim.saleReceiptId, providerEvidenceId: claim.providerEvidenceId, transaction: claim.transaction };
    const record = { ...body, id: semanticId(body) }, bytes = `${JSON.stringify(record)}\n`;
    const directory = join(root, "runtime", "locality-x402-activation-claims"), filename = `${createHash("sha256").update(claim.activationId).digest("hex")}.json`, path = join(directory, filename);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    try { writeFileSync(path, bytes, { encoding: "utf8", flag: "wx", mode: 0o600 }); }
    catch (error) { if (error.code !== "EEXIST" || readFileSync(path, "utf8") !== bytes) throw new Error("locality x402 production activation already claimed by another sale", { cause: error }); }
    return record;
  };
}
