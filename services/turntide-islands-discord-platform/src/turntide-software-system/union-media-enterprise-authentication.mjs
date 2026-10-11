import { readFileSync } from "node:fs";
import { identifyTurntideDiscordPlatformRecord as semanticId } from "./discord-platform-record-semantic-content.mjs";
import { isNiUri, niUriDigestBytes } from "@red-cup-engineering/uri-services-section/ni-uri";
import { } from "./settlement-witness.mjs";
import { publicTurntideContentPath } from "./env.mjs";
import { UNION_MEDIA_DESTINATION_PROOF_CATEGORY, UNION_MEDIA_INTENT_CONTRACT, UNION_MEDIA_PRODUCT, unionMediaRepresentativePseudonym } from "./union-media-intent.mjs";
import { sha256Hex } from "@red-cup-engineering/cryptographic-computer-data-engineering-services-section/integrity";

export const UNION_MEDIA_ENTERPRISE_AUTH_CATEGORY = "tti-union-media-enterprise-authentication-v1";
export const UNION_MEDIA_ENTERPRISE_AUTH_CONTRACT = "ni:///sha-256;xX10couZ9FmdpLcQFvlvxBFdZemz55UJ_-h_sxQR0Ss";
export const UNION_MEDIA_ENTERPRISE_AUTH_TOKEN = "AUTHENTICATE-UNION-MEDIA-ENTERPRISE";
export const TYPED_COMMITMENT_TOPIC = "0x067bf3f2d52c6e4edb70966d099acce7fa597fe4d4de817291fc7a2b8ce15eee";
const registryPath = () => publicTurntideContentPath(process.env, "admissions", "union-media-advertisers.json");
const DISCORD_EPOCH_MS = 1_420_070_400_000n, MAX_CLOCK_SKEW_MS = 10 * 60 * 1000, DELEGATION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export function loadUnionMediaAdvertiserRegistry(file = registryPath()) { return JSON.parse(readFileSync(file, "utf8")); }

export function enterpriseDelegationRequest(proof, registry = loadUnionMediaAdvertiserRegistry()) {
  if (!selfAddressed(proof) || proof.type !== "TTIUnionMediaDestinationControlAdmission" || proof["contract"] !== UNION_MEDIA_INTENT_CONTRACT || proof["status"] !== "qualified-destination-controlled-lead") throw new Error("enterprise delegation requires one admitted destination-control proof");
  const declaration = proof["declaration"], representativePseudonym = String(proof["representativePseudonym"] ?? "");
  const enterprise = registry.enterprises?.find((row) => row.actor === declaration.enterprise && row.status === "authentication-pilot-admitted");
  if (!enterprise?.accountAddress || !enterprise?.account) throw new Error("declared enterprise has no TTI authentication-pilot account admission");
  const subject = String(proof["intentId"]), object = semanticId({ type: "TTIUnionMediaRepresentativeDelegationSubject", version: 1, representativePseudonym, productId: UNION_MEDIA_PRODUCT, scope: "form-one-later-contract-complete-placement-request" });
  const expiresAt = new Date(Date.parse(String(proof["recordedAt"])) + DELEGATION_TTL_MS).toISOString();
  const body = { type: "TTIUnionMediaEnterpriseDelegationRequest", version: 1, contract: UNION_MEDIA_ENTERPRISE_AUTH_CONTRACT, productId: UNION_MEDIA_PRODUCT, enterprise: enterprise.actor, account: enterprise.account, chainId: registry.chain.caip2, projection: String(registry.chain.typedCommitmentProjection).toLowerCase(), predicate: UNION_MEDIA_ENTERPRISE_AUTH_CONTRACT, subject, object, evidenceRoot: proof.id, scope: "authenticate-enterprise-and-representative-for-one-later-placement-request", issuedAt: proof["recordedAt"], expiresAt };
  return Object.freeze({ ...body, senAct: semanticId(body) });
}

export async function authenticateDiscordUnionMediaEnterprise(input, options) {
  const reasons = [], now = options.now ?? new Date(), instant = snowflakeInstant(input.interactionId);
  if (instant === null || Math.abs(now.getTime() - instant.getTime()) > MAX_CLOCK_SKEW_MS) reasons.push("union-media-enterprise-auth-interaction-not-current-discord-snowflake");
  if (options.expectedGuildId === undefined || input.guildId !== options.expectedGuildId) reasons.push("union-media-enterprise-auth-foreign-or-direct-message-invocation");
  if (!snowflake(input.userId)) reasons.push("union-media-enterprise-auth-representative-absent");
  if (typeof options.pseudonymKey !== "string" || options.pseudonymKey.length < 32) reasons.push("union-media-enterprise-auth-pseudonym-authority-absent");
  if (!isNi(input.destinationProofId)) reasons.push("union-media-enterprise-auth-destination-proof-id-invalid");
  if (!/^0x[0-9a-fA-F]{64}$/u.test(input.transactionHash ?? "")) reasons.push("union-media-enterprise-auth-transaction-hash-invalid");
  if (!/^(?:0|[1-9][0-9]{0,3})$/u.test(input.logIndex ?? "")) reasons.push("union-media-enterprise-auth-log-index-invalid");
  if (input.authentication !== UNION_MEDIA_ENTERPRISE_AUTH_TOKEN) reasons.push("union-media-enterprise-auth-exact-token-absent");
  const proof = reasons.length === 0 ? ((await options.store.records(UNION_MEDIA_DESTINATION_PROOF_CATEGORY))).find((row) => row.id === input.destinationProofId) : undefined;
  if (reasons.length === 0 && proof === undefined) reasons.push("union-media-enterprise-auth-destination-proof-not-found");
  if (proof !== undefined && (!selfAddressed(proof) || proof.type !== "TTIUnionMediaDestinationControlAdmission" || proof["contract"] !== UNION_MEDIA_INTENT_CONTRACT)) reasons.push("union-media-enterprise-auth-destination-proof-not-admitted");
  const representativePseudonym = snowflake(input.userId) && typeof options.pseudonymKey === "string" ? unionMediaRepresentativePseudonym(options.pseudonymKey, input.userId) : undefined;
  if (proof !== undefined && proof["representativePseudonym"] !== representativePseudonym) reasons.push("union-media-enterprise-auth-representative-mismatch");
  let request;
  try { if (proof !== undefined) request = enterpriseDelegationRequest(proof, options.registry); } catch { reasons.push("union-media-enterprise-auth-enterprise-not-admitted"); }
  if (request !== undefined && now.getTime() >= Date.parse(request.expiresAt)) reasons.push("union-media-enterprise-auth-delegation-expired");
  if (reasons.length > 0) return refusal(reasons);
  const prior = ((await options.store.records(UNION_MEDIA_ENTERPRISE_AUTH_CATEGORY))).find((row) => row.destinationProofId === proof.id);
  if (prior !== undefined) return prior;
  const registry = options.registry ?? loadUnionMediaAdvertiserRegistry(), configuredRpc = normalizeRpcUrl(options.rpcUrl);
  if (options.rpc === undefined && configuredRpc === null) return refusal(["union-media-enterprise-auth-pinned-rpc-unavailable"]);
  const rpc = options.rpc ?? ((method, params = []) => jsonRpc(configuredRpc, method, params));
  let chainId, receipt, latest;
  try { [chainId, receipt, latest] = await Promise.all([rpc("eth_chainId"), rpc("eth_getTransactionReceipt", [input.transactionHash.toLowerCase()]), rpc("eth_blockNumber")]); }
  catch { return refusal(["union-media-enterprise-auth-chain-observation-failed"]); }
  const observation = inspectTypedCommitment({ request: request, registry, transactionHash: input.transactionHash.toLowerCase(), logIndex: Number(input.logIndex), chainId, receipt, latestBlock: latest });
  if (observation.type === "TTIUnionMediaEnterpriseAuthenticationRefusal") return observation;
  const body = { type: "TTIUnionMediaEnterpriseAuthenticationAdmission", version: 1, status: "authenticated-for-one-later-placement-request", contract: UNION_MEDIA_ENTERPRISE_AUTH_CONTRACT, productId: UNION_MEDIA_PRODUCT, recordedAt: instant.toISOString(), enterprise: request.enterprise, account: request.account, representativePseudonym, destinationProofId: proof.id, intentId: proof.intentId, delegationRequestId: request.senAct, scope: request.scope, expiresAt: request.expiresAt, authentication: observation,
    measurement: { authenticatedEnterpriseDemand: true, authenticatedPlacementRequest: false, authenticatedBid: false }, privacy: { discordIdentifiersRecorded: false, foreignPrivateKeyObserved: false, unrelatedTransactionLogsRecorded: false, destinationsRecorded: false }, legalEffect: "enterprise-and-representative-authentication-for-one-later-placement-request-only-no-creative-approval-bid-valuation-award-reservation-transfer-publication-payment-entitlement-revenue-or-profit", creativeApproved: false, placementRequestAdmitted: false, bidAdmitted: false, awardCreated: false, resourceTransferObserved: false, publicationPromised: false, revenueRecognized: false, profitRecognized: false };
  return Object.freeze({ ...body, id: semanticId(body) });
}

export function inspectTypedCommitment(input) {
  const reasons = [], expectedChain = `0x${Number(input.registry.chain.chainId).toString(16)}`, finalityDepth = input.registry.chain.finalityDepth;
  if (!Number.isSafeInteger(finalityDepth) || finalityDepth < 0 || finalityDepth > 100_000) reasons.push("typed-commitment-finality-policy-invalid");
  if (String(input.chainId).toLowerCase() !== expectedChain) reasons.push("typed-commitment-chain-mismatch");
  if (input.receipt?.transactionHash?.toLowerCase() !== input.transactionHash || input.receipt?.status !== "0x1" || !/^0x[0-9a-fA-F]{64}$/u.test(input.receipt?.blockHash ?? "")) reasons.push("typed-commitment-transaction-not-successfully-included");
  const block = hexInteger(input.receipt?.blockNumber), latest = hexInteger(input.latestBlock), confirmations = block === null || latest === null || latest < block ? null : latest - block;
  if (confirmations === null || !Number.isSafeInteger(finalityDepth) || confirmations < BigInt(finalityDepth)) reasons.push("typed-commitment-finality-depth-not-satisfied");
  const log = Array.isArray(input.receipt?.logs) ? input.receipt.logs.find((row) => hexInteger(row?.logIndex) === BigInt(input.logIndex)) : undefined;
  if (log === undefined || log.removed === true || String(log.address).toLowerCase() !== input.request.projection || !Array.isArray(log.topics) || log.topics.length !== 4 || String(log.topics[0]).toLowerCase() !== TYPED_COMMITMENT_TOPIC) reasons.push("typed-commitment-projection-log-mismatch");
  const enterprise = input.registry.enterprises.find((row) => row.actor === input.request.enterprise && row.status === "authentication-pilot-admitted"), accountAddress = String(enterprise?.accountAddress ?? "").toLowerCase();
  if (log !== undefined) {
    const topics = log.topics.map((value) => String(value).toLowerCase()), words = /^0x[0-9a-fA-F]{256}$/u.test(log.data ?? "") ? String(log.data).slice(2).match(/.{64}/gu).map((word) => `0x${word.toLowerCase()}`) : [];
    const expectedAccountTopic = `0x${"0".repeat(24)}${accountAddress.slice(2)}`, expected = [niHex(input.request.senAct), expectedAccountTopic, niHex(input.request.predicate), niHex(input.request.subject), niHex(input.request.object), niHex(input.request.evidenceRoot)];
    if (topics[1] !== expected[0] || topics[2] !== expected[1] || topics[3] !== expected[2] || words.length !== 4 || words[0] !== expected[3] || words[1] !== expected[4] || words[2] !== expected[5] || words[3] !== typedCommitmentId(input.request, accountAddress)) reasons.push("typed-commitment-field-or-identity-mismatch");
  }
  if (reasons.length > 0) return refusal(reasons);
  return Object.freeze({ type: "TTIUnionMediaTypedCommitmentObservation", version: 1, protocol: "org.emsenn.evm.typed-commitment-projection.v1", chainId: input.registry.chain.caip2, projection: input.request.projection, account: input.request.account, transactionHash: input.transactionHash, blockHash: input.receipt.blockHash.toLowerCase(), blockNumber: Number(block), latestObservedBlock: Number(latest), confirmations: Number(confirmations), finalityDepth, finalityPolicy: input.registry.chain.finalityPolicy, logIndex: input.logIndex, senAct: input.request.senAct, commitmentId: typedCommitmentId(input.request, accountAddress), finalized: true, foreignPrivateKeyObserved: false });
}

export function typedCommitmentId(request, accountAddress) { const fields = [niBytes(request.senAct), Buffer.concat([Buffer.alloc(12), Buffer.from(accountAddress.slice(2), "hex")]), niBytes(request.predicate), niBytes(request.subject), niBytes(request.object), niBytes(request.evidenceRoot)]; return `0x${sha256Hex(Buffer.concat(fields))}`; }
export function enterpriseDelegationInstructions(proof, registry = loadUnionMediaAdvertiserRegistry()) { try { const r = enterpriseDelegationRequest(proof, registry); return ["This enterprise is account-ready for authentication. Its own settlement may project these exact fields through the Union Ethereum typed-commitment provider, then you can use /union-media-authenticate:", `senAct ${r.senAct}`, `predicate ${r.predicate}`, `subject ${r.subject}`, `object ${r.object}`, `evidenceRoot ${r.evidenceRoot}`, `expires ${r.expiresAt}`].join("\n"); } catch { return "This declared enterprise is not yet admitted with a sovereign account carrier. Destination control remains qualified, but enterprise authentication is unavailable."; } }
export function unionMediaEnterpriseAuthenticationRecorderFromSettlementWitness(store) { if (typeof store?.records !== "function" || typeof store?.record !== "function") throw new TypeError("Union Media enterprise authentication requires TTI settlement-store witness authority"); return async (admission) => { if (!selfAddressed(admission) || admission.type !== "TTIUnionMediaEnterpriseAuthenticationAdmission") throw new Error("Union Media enterprise authentication is not self-addressed"); const prior = ((await store.records(UNION_MEDIA_ENTERPRISE_AUTH_CATEGORY))).find((row) => row.destinationProofId === admission.destinationProofId); if (prior !== undefined) { if (prior.id !== admission.id) throw new Error("Union Media enterprise authentication conflict"); return prior; } await store.record({ category: UNION_MEDIA_ENTERPRISE_AUTH_CATEGORY, recordedAt: String(admission["recordedAt"]), record: admission, assertions: [{ subject: admission.id, predicate: "urn:emsenn:venture:authenticated-union-media-enterprise-demand", object: { kind: "literal", value: "true", datatype: "http://www.w3.org/2001/XMLSchema#boolean" } }] }); return admission; }; }
export function unionMediaEnterpriseAuthenticationAcknowledgement(admission) { return ["TTI authenticated the pre-admitted Union enterprise account and your bounded representative delegation.", `Receipt: ${admission.id}`, `Enterprise: ${admission["enterprise"]}`, "This permits one later contract-complete placement request only. No creative, bid, award, reservation, transfer, publication, payment, revenue, or profit was created."].join("\n"); }

async function jsonRpc(url, method, params = []) { const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(10_000) }); const body = await response.json(); if (!response.ok || body.error) throw new Error(`${method} refused`); return body.result; }
function normalizeRpcUrl(value) { try { if (typeof value !== "string") return null; const url = new URL(value); if (url.username || url.password || url.search || url.hash || url.pathname !== "/" || !((url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname)) || url.protocol === "https:")) return null; return url.toString(); } catch { return null; } }
function niBytes(value) { return niUriDigestBytes(value); }
function niHex(value) { return `0x${niBytes(value).toString("hex")}`; }
function hexInteger(value) { try { return typeof value === "string" && /^0x[0-9a-fA-F]+$/u.test(value) ? BigInt(value) : null; } catch { return null; } }
function isNi(value) { return isNiUri(value); }
function snowflake(value) { return typeof value === "string" && /^[1-9][0-9]{16,20}$/u.test(value); }
function snowflakeInstant(value) { try { if (!snowflake(value)) return null; const milliseconds = Number((BigInt(value) >> 22n) + DISCORD_EPOCH_MS); return Number.isSafeInteger(milliseconds) ? new Date(milliseconds) : null; } catch { return null; } }
function selfAddressed(value) { try { const { id, ...body } = value; return typeof id === "string" && id === semanticId(body); } catch { return false; } }
function refusal(reasons) { return Object.freeze({ type: "TTIUnionMediaEnterpriseAuthenticationRefusal", version: 1, reasons: [...new Set(reasons)], durableMutation: false, enterpriseAuthenticated: false, representativeAuthorityVerified: false, placementRequestAdmitted: false, bidAdmitted: false, awardCreated: false, revenueRecognized: false, profitRecognized: false }); }
