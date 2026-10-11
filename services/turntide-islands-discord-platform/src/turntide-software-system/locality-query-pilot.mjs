import { createHmac } from "node:crypto";
import path from "node:path";
import { identifyTurntideDiscordPlatformRecord as semanticId } from "./discord-platform-record-semantic-content.mjs";
import { turntideSettlementWitness } from "./settlement-witness.mjs";
// @ts-expect-error This TTI-root management die is canonical JavaScript and intentionally remains outside the app compiler root.
import { turntideWitnessJournalBindingFromEnvironment } from "./witness-journal-binding.mjs";
import { env, publicTurntideRoot } from "./env.mjs";

export const LOCALITY_QUERY_PILOT_CATEGORY = "tti-locality-query-pilot-admission-v2";
export const LOCALITY_QUERY_PILOT_CONTRACT = "ni:///sha-256;C_QG5hL93YTJmPUvsUNEyICbeciggs0wKVXezuFSN5w";
export const LOCALITY_QUERY_PILOT_CONSENT = "AGREE-PERMANENT-NONPERSONAL-QUERY";
export const LOCALITY_QUERY_PILOT_PRODUCT = "tti-locality-knowledge-answer-2026-01";
export const LOCALITY_QUERY_PILOT_EXPERIMENT = "EXP-KM-LOCALITY-002";
const DISCORD_EPOCH_MS = 1_420_070_400_000n;
const MAX_CLOCK_SKEW_MS = 10 * 60 * 1000;
const USES = new Map([
  ["research", "local-practice-research"],
  ["decision", "union-decision-support"],
  ["memory", "institutional-memory"],
]);
const DELIVERY_INTEREST = new Map([
  ["chat", "free-discord-chat-answer"],
  ["vault", "persistent-knowledge-vault"],
  ["mcp", "metered-mcp-call"],
  ["a2a", "metered-a2a-call"],
]);

export function prepareDiscordLocalityQueryPilot(input, options = {}) {
  const reasons = [], now = options.now ?? new Date();
  const interactionInstant = snowflakeInstant(input.interactionId);
  if (interactionInstant === null || Math.abs(now.getTime() - interactionInstant.getTime()) > MAX_CLOCK_SKEW_MS) reasons.push("locality-pilot-interaction-not-current-discord-snowflake");
  if (options.expectedGuildId === undefined || input.guildId !== options.expectedGuildId) reasons.push("locality-pilot-foreign-or-direct-message-invocation");
  if (!snowflake(input.userId)) reasons.push("locality-pilot-human-actor-absent");
  if (typeof options.pseudonymKey !== "string" || options.pseudonymKey.length < 32) reasons.push("locality-pilot-pseudonym-authority-absent");
  if (!bounded(input.question, 20, 500)) reasons.push("locality-pilot-question-unbounded");
  if (!bounded(input.subject, 3, 120)) reasons.push("locality-pilot-subject-unbounded");
  if (!bounded(input.locality, 2, 120)) reasons.push("locality-pilot-locality-unbounded");
  const use = USES.get(input.intendedUse ?? "");
  if (use === undefined) reasons.push("locality-pilot-use-not-supported");
  const deliveryInterest = DELIVERY_INTEREST.get(input.deliveryInterest ?? "");
  if (deliveryInterest === undefined) reasons.push("locality-pilot-delivery-interest-not-supported");
  if (input.consent !== LOCALITY_QUERY_PILOT_CONSENT) reasons.push("locality-pilot-exact-consent-absent");
  if ([input.question, input.subject, input.locality].some((value) => obviousPersonalSensitiveOrSecret(value ?? ""))) reasons.push("locality-pilot-obvious-personal-sensitive-or-secret-data-refused");
  if (reasons.length > 0) return refusal(reasons);
  const key = options.pseudonymKey;
  const actorPseudonym = `urn:tti:locality-pilot-actor:${pseudonym(key, "actor", input.userId)}`;
  const submissionPseudonym = `urn:tti:locality-pilot-submission:${pseudonym(key, "interaction", input.interactionId)}`;
  const body = {
    type: "TTIDiscordLocalityQueryPilotAdmission", version: 1, status: "admitted", contract: LOCALITY_QUERY_PILOT_CONTRACT,
    productId: LOCALITY_QUERY_PILOT_PRODUCT, experimentId: LOCALITY_QUERY_PILOT_EXPERIMENT, recordedAt: interactionInstant.toISOString(),
    actorPseudonym, submissionPseudonym,
    query: { question: input.question.trim(), subject: input.subject.trim(), geographicContext: input.locality.trim(), intendedUse: use, deliveryInterest },
    consent: { token: LOCALITY_QUERY_PILOT_CONSENT, affirmed: true, permanentNonPersonalBusinessEvidence: true, aggregateProductResearchAllowed: true, knowledgeContributionLicenseGranted: false, resalePermissionGranted: false },
    privacy: { noPersonalSensitiveThirdPartyOrSecretDataAttested: true, discordIdentifiersRecorded: false, interactionTokenRecorded: false, messageContentImported: false, pseudonymProfile: "hmac-sha256-domain-separated-v1" },
    measurement: { buyerQueryAdmitted: true, noChargeQueryPilot: true, freeChatAnswerInterest: deliveryInterest === "free-discord-chat-answer", persistentVaultInterest: deliveryInterest === "persistent-knowledge-vault", meteredPowerUserInterest: deliveryInterest === "metered-mcp-call" || deliveryInterest === "metered-a2a-call", priceEstablished: false },
    fulfillment: { answerPromised: false, reason: "live-resale-inventory-not-yet-admitted" },
    legalEffect: "no-charge-buyer-demand-only-no-contribution-license-resale-purchase-offer-payment-entitlement-answer-promise-revenue-credit-or-profit",
    saleFormed: false, paymentObserved: false, entitlementCreated: false, revenueRecognized: false, profitRecognized: false,
  };
  return Object.freeze({ ...body, id: semanticId(body) });
}

export function localityPilotRecorderFromSettlementWitness(store) {
  if (typeof store?.records !== "function" || typeof store?.record !== "function") throw new TypeError("locality pilot requires TTI settlement-store witness authority");
  return async (admission) => {
    if (!selfAddressed(admission) || admission.type !== "TTIDiscordLocalityQueryPilotAdmission") throw new Error("locality pilot admission is not self-addressed");
    const prior = ((await store.records(LOCALITY_QUERY_PILOT_CATEGORY))).find((row) => row?.submissionPseudonym === admission.submissionPseudonym);
    if (prior !== undefined) {
      if (prior.id !== admission.id) throw new Error("locality pilot interaction replay conflict");
      return prior;
    }
    await store.record({ category: LOCALITY_QUERY_PILOT_CATEGORY, recordedAt: String(admission["recordedAt"]), record: admission, assertions: [
      { subject: admission.id, predicate: "urn:emsenn:venture:admitted-locality-query-pilot", object: { kind: "literal", value: "true", datatype: "http://www.w3.org/2001/XMLSchema#boolean" } },
    ] });
    return admission;
  };
}

export function localityPilotSettlementWitness(source = process.env) {
  const agentUrl = env("WITNESS_JOURNAL_RDF_AGENT", source);
  if (agentUrl === undefined) throw new Error("WITNESS_JOURNAL_RDF_AGENT is required for locality query pilot");
  return turntideSettlementWitness({ settlementRoot: publicTurntideRoot(source), agentUrl, ...(turntideWitnessJournalBindingFromEnvironment(source) ?? {}) });
}

export function localityPilotConfiguration(source = process.env) {
  const expectedGuildId = env("DISCORD_GUILD_ID", source), pseudonymKey = env("DISCORD_BOT_TOKEN", source);
  if (expectedGuildId === undefined || pseudonymKey === undefined || pseudonymKey.length < 32) throw new Error("locality query pilot requires Discord guild and secret pseudonym authority");
  return Object.freeze({ expectedGuildId, pseudonymKey });
}

export function localityPilotAcknowledgement(admission, replayed = false) {
  const query = admission["query"];
  return [
    replayed ? "TTI already recorded this exact locality-query pilot." : "TTI recorded your locality-query pilot.",
    `Query receipt: ${admission.id}`,
    `Scope: ${query.subject} in ${query.geographicContext}.`,
    `Delivery interest: ${query.deliveryInterest}. No price was established.`,
    "No charge occurred. This is buyer-demand evidence only: no contribution, license, resale permission, purchase, offer, payment, entitlement, answer promise, revenue, credit, or profit.",
    "TTI currently has no admitted live resale inventory, so this pilot does not promise an answer.",
  ].join("\n");
}

function refusal(reasons) { return Object.freeze({ type: "TTIDiscordLocalityQueryPilotRefusal", version: 1, reasons: [...new Set(reasons)], durableMutation: false, queryAdmitted: false, saleFormed: false, paymentObserved: false, revenueRecognized: false, profitRecognized: false }); }
function bounded(value, minimum, maximum) { return typeof value === "string" && value.trim().length >= minimum && value.trim().length <= maximum; }
function snowflake(value) { return typeof value === "string" && /^[1-9][0-9]{16,20}$/u.test(value); }
function snowflakeInstant(value) { try { if (!snowflake(value)) return null; const milliseconds = Number((BigInt(value) >> 22n) + DISCORD_EPOCH_MS); return Number.isSafeInteger(milliseconds) ? new Date(milliseconds) : null; } catch { return null; } }
function pseudonym(key, domain, value) { return createHmac("sha256", key).update(`tti-locality-query-pilot-v1\0${domain}\0${value}`, "utf8").digest("base64url"); }
function obviousPersonalSensitiveOrSecret(value) {
  return /(?:<@!?[0-9]+>|https?:\/\/|discord\.gg\/|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\b(?:password|passphrase|api[_ -]?key|secret|access[_ -]?token|private[_ -]?key|social security|ssn|medical advice|legal advice|financial advice|emergency)\b|\+?[0-9][0-9 ()-]{7,}[0-9]|\b[0-9]{1,5}\s+[\p{L}. '-]+\s(?:street|st|road|rd|avenue|ave|lane|ln|drive|dr|boulevard|blvd)\b)/iu.test(value);
}
function selfAddressed(value) { const { id, ...body } = value; return typeof id === "string" && id === semanticId(body); }
