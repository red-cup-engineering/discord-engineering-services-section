import { createHmac } from "node:crypto";
import { resolveTxt } from "node:dns/promises";
import path from "node:path";
import { identifyTurntideDiscordPlatformRecord as semanticId } from "./discord-platform-record-semantic-content.mts";
import { isNiUri as isCanonicalSha256NiUri } from "@red-cup-engineering/computer-data-engine/identity";
import { turntideSettlementWitness, type SettlementWitness } from "./settlement-witness.mts";
// @ts-expect-error This TTI-root management die is canonical JavaScript and intentionally remains outside the app compiler root.
import { turntideWitnessJournalBindingFromEnvironment } from "@causeway-services/turntide-witness-journal-binding-service";
import { env, publicTurntideRoot, type EnvMap } from "./env.mts";

export const UNION_MEDIA_INTENT_CATEGORY = "tti-union-media-representative-intent-v1";
export const UNION_MEDIA_DESTINATION_PROOF_CATEGORY = "tti-union-media-destination-control-proof-v1";
export const UNION_MEDIA_INTENT_CONTRACT = "ni:///sha-256;ZHOZcQ2d6ehuLPMTQp5pXOFSQtflUSybLqF6CUSvyts";
export const UNION_MEDIA_INTENT_CONSENT = "AGREE-PERMANENT-NONPERSONAL-UNION-MEDIA-INTENT";
export const UNION_MEDIA_AUCTION_INTEREST = "YES-FUTURE-AUCTION";
export const UNION_MEDIA_DESTINATION_VERIFY = "VERIFY-DESTINATION-CONTROL";
export const UNION_MEDIA_PRODUCT = "tti-union-media-syndication-2026-01";
export const UNION_MEDIA_EXPERIMENT = "EXP-UNION-MEDIA-001";
const DISCORD_EPOCH_MS = 1_420_070_400_000n;
const MAX_CLOCK_SKEW_MS = 10 * 60 * 1000;
const RESOURCE_CLASSES = new Set(["compute", "research", "data-access", "image-access", "editorial", "moderation", "operations", "other"]);

export interface DiscordUnionMediaIntentInput {
  readonly interactionId: string; readonly guildId?: string; readonly userId?: string;
  readonly enterprise?: string; readonly destination?: string; readonly resourceClass?: string;
  readonly resourceOffer?: string; readonly auctionInterest?: string; readonly consent?: string;
}

export type UnionMediaIntentAdmission = Readonly<Record<string, unknown> & {
  readonly type: "TTIUnionMediaRepresentativeIntentAdmission"; readonly id: string; readonly submissionPseudonym: string;
}>;
export type UnionMediaDestinationControlAdmission = Readonly<Record<string, unknown> & {
  readonly type: "TTIUnionMediaDestinationControlAdmission"; readonly id: string; readonly intentId: string;
}>;

export function prepareDiscordUnionMediaIntent(input: DiscordUnionMediaIntentInput, options: Readonly<{ expectedGuildId?: string; pseudonymKey?: string; now?: Date }> = {}): UnionMediaIntentAdmission | Readonly<Record<string, unknown>> {
  const reasons: string[] = [], now = options.now ?? new Date(), interactionInstant = snowflakeInstant(input.interactionId);
  if (interactionInstant === null || Math.abs(now.getTime() - interactionInstant.getTime()) > MAX_CLOCK_SKEW_MS) reasons.push("union-media-intent-interaction-not-current-discord-snowflake");
  if (options.expectedGuildId === undefined || input.guildId !== options.expectedGuildId) reasons.push("union-media-intent-foreign-or-direct-message-invocation");
  if (!snowflake(input.userId)) reasons.push("union-media-intent-human-representative-absent");
  if (typeof options.pseudonymKey !== "string" || options.pseudonymKey.length < 32) reasons.push("union-media-intent-pseudonym-authority-absent");
  const enterprise = input.enterprise?.trim();
  if (enterprise === undefined || !/^urn:ame:[a-z0-9][a-z0-9-]{1,118}$/u.test(enterprise) || enterprise === "urn:ame:turntide-islands") reasons.push("union-media-intent-enterprise-urn-invalid");
  const destination = normalizeDestination(input.destination);
  if (destination === null) reasons.push("union-media-intent-destination-invalid");
  if (!RESOURCE_CLASSES.has(input.resourceClass ?? "")) reasons.push("union-media-intent-resource-class-unsupported");
  if (!bounded(input.resourceOffer, 20, 300)) reasons.push("union-media-intent-resource-offer-unbounded");
  if (obviousPersonalSensitiveOrSecret(input.resourceOffer ?? "")) reasons.push("union-media-intent-obvious-personal-sensitive-or-secret-data-refused");
  if (input.auctionInterest !== UNION_MEDIA_AUCTION_INTEREST) reasons.push("union-media-intent-exact-auction-interest-absent");
  if (input.consent !== UNION_MEDIA_INTENT_CONSENT) reasons.push("union-media-intent-exact-consent-absent");
  if (reasons.length > 0) return refusal(reasons);
  const key = options.pseudonymKey!;
  const representativePseudonym = unionMediaRepresentativePseudonym(key, input.userId!);
  const submissionPseudonym = `urn:tti:union-media-intent:${pseudonym(key, "interaction", input.interactionId)}`;
  const challengeHost = `_tti-union-media.${destination!.host}`;
  const challengeValue = `tti-union-media=${pseudonym(key, "destination-control", `${submissionPseudonym}\0${destination!.host}`).slice(0, 43)}`;
  const challengeExpiresAt = new Date(interactionInstant!.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const body = {
    type: "TTIUnionMediaRepresentativeIntentAdmission", version: 1, status: "admitted-nonbinding-unverified-enterprise-declaration",
    contract: UNION_MEDIA_INTENT_CONTRACT, productId: UNION_MEDIA_PRODUCT, experimentId: UNION_MEDIA_EXPERIMENT,
    recordedAt: interactionInstant!.toISOString(), representativePseudonym, submissionPseudonym,
    declaration: { enterprise, enterpriseAuthenticated: false, representativeAuthorityVerified: false, destination, resourceClass: input.resourceClass, resourceOfferDescription: input.resourceOffer!.trim(), willingToJoinFutureAuction: true },
    destinationControlChallenge: { protocol: "dns-txt-v1", name: challengeHost, value: challengeValue, expiresAt: challengeExpiresAt, destinationControlProved: false },
    consent: { token: UNION_MEDIA_INTENT_CONSENT, affirmed: true, permanentNonPersonalBusinessEvidence: true, aggregateProductResearchAllowed: true },
    privacy: { discordIdentifiersRecorded: false, interactionTokenRecorded: false, messageContentImported: false, pseudonymProfile: "hmac-sha256-domain-separated-v1" },
    measurement: { representativeIntentAdmitted: true, qualifiedEnterpriseDemand: false, authenticatedBid: false },
    legalEffect: "nonbinding-customer-discovery-only-no-enterprise-authentication-representative-authority-creative-approval-bid-valuation-award-inventory-reservation-resource-transfer-publication-promise-payment-entitlement-revenue-or-profit",
    creativeApproved: false, bidAdmitted: false, awardCreated: false, resourceTransferObserved: false, publicationPromised: false, revenueRecognized: false, profitRecognized: false,
  } as const;
  return Object.freeze({ ...body, id: semanticId(body) });
}

export async function verifyDiscordUnionMediaDestinationControl(input: Readonly<{ interactionId: string; guildId?: string; userId?: string; intentId?: string; verification?: string }>, options: Readonly<{ expectedGuildId?: string; pseudonymKey?: string; now?: Date; store: Pick<SettlementWitness, "records">; resolveTxt?: (hostname: string) => Promise<string[][]> }>): Promise<UnionMediaDestinationControlAdmission | Readonly<Record<string, unknown>>> {
  const reasons: string[] = [], now = options.now ?? new Date(), interactionInstant = snowflakeInstant(input.interactionId);
  if (interactionInstant === null || Math.abs(now.getTime() - interactionInstant.getTime()) > MAX_CLOCK_SKEW_MS) reasons.push("union-media-verification-interaction-not-current-discord-snowflake");
  if (options.expectedGuildId === undefined || input.guildId !== options.expectedGuildId) reasons.push("union-media-verification-foreign-or-direct-message-invocation");
  if (!snowflake(input.userId)) reasons.push("union-media-verification-human-representative-absent");
  if (typeof options.pseudonymKey !== "string" || options.pseudonymKey.length < 32) reasons.push("union-media-verification-pseudonym-authority-absent");
  if (!isCanonicalSha256NiUri(input.intentId)) reasons.push("union-media-verification-intent-receipt-invalid");
  if (input.verification !== UNION_MEDIA_DESTINATION_VERIFY) reasons.push("union-media-verification-exact-token-absent");
  const intent = reasons.length === 0 ? ((await options.store.records(UNION_MEDIA_INTENT_CATEGORY)) as readonly UnionMediaIntentAdmission[]).find((row) => row.id === input.intentId) : undefined;
  if (reasons.length === 0 && intent === undefined) reasons.push("union-media-verification-intent-not-found");
  if (intent !== undefined && (!selfAddressed(intent) || intent.type !== "TTIUnionMediaRepresentativeIntentAdmission" || intent["contract"] !== UNION_MEDIA_INTENT_CONTRACT)) reasons.push("union-media-verification-intent-not-admitted-or-self-addressed");
  const representativePseudonym = snowflake(input.userId) && typeof options.pseudonymKey === "string" ? unionMediaRepresentativePseudonym(options.pseudonymKey, input.userId) : undefined;
  if (intent !== undefined && intent["representativePseudonym"] !== representativePseudonym) reasons.push("union-media-verification-representative-mismatch");
  const challenge = intent?.["destinationControlChallenge"] as { name?: string; value?: string; expiresAt?: string } | undefined;
  const intentDeclaration = intent?.["declaration"] as { destination?: { host?: string } } | undefined, intentRecordedAt = Date.parse(String(intent?.["recordedAt"] ?? ""));
  const expectedChallengeName = `_tti-union-media.${intentDeclaration?.destination?.host ?? ""}`;
  const expectedChallengeValue = intent !== undefined && typeof options.pseudonymKey === "string" ? `tti-union-media=${pseudonym(options.pseudonymKey, "destination-control", `${intent.submissionPseudonym}\0${intentDeclaration?.destination?.host ?? ""}`).slice(0, 43)}` : undefined;
  const expectedChallengeExpiresAt = Number.isFinite(intentRecordedAt) ? new Date(intentRecordedAt + 7 * 24 * 60 * 60 * 1000).toISOString() : undefined;
  if (intent !== undefined && (challenge === undefined || challenge.name !== expectedChallengeName || challenge.value !== expectedChallengeValue || challenge.expiresAt !== expectedChallengeExpiresAt || now.getTime() >= Date.parse(challenge.expiresAt ?? ""))) reasons.push("union-media-verification-challenge-invalid-unbound-or-expired");
  if (reasons.length > 0) return proofRefusal(reasons);
  const prior = ((await options.store.records(UNION_MEDIA_DESTINATION_PROOF_CATEGORY)) as readonly UnionMediaDestinationControlAdmission[]).find((row) => row.intentId === intent!.id);
  if (prior !== undefined) return prior;
  let answers: string[][];
  try { answers = await (options.resolveTxt ?? resolveTxt)(challenge!.name!); }
  catch { return proofRefusal(["union-media-verification-dns-resolution-failed"]); }
  if (!answers.some((parts) => parts.join("") === challenge!.value)) return proofRefusal(["union-media-verification-dns-txt-mismatch"]);
  const declaration = intent!["declaration"] as { enterprise: string; destination: Readonly<Record<string, string>>; resourceClass: string };
  const body = {
    type: "TTIUnionMediaDestinationControlAdmission", version: 1, status: "qualified-destination-controlled-lead", contract: UNION_MEDIA_INTENT_CONTRACT,
    productId: UNION_MEDIA_PRODUCT, experimentId: UNION_MEDIA_EXPERIMENT, recordedAt: interactionInstant!.toISOString(), intentId: intent!.id,
    representativePseudonym, verificationSubmissionPseudonym: `urn:tti:union-media-verification:${pseudonym(options.pseudonymKey!, "verification-interaction", input.interactionId)}`,
    declaration: { enterprise: declaration.enterprise, destination: declaration.destination, resourceClass: declaration.resourceClass, destinationControlled: true, enterpriseAuthenticated: false, representativeAuthorityVerified: false },
    evidence: { protocol: "dns-txt-v1", challengeName: challenge!.name, challengeValueDigest: semanticId({ value: challenge!.value }), observedAt: interactionInstant!.toISOString(), matchingTxtObserved: true, unrelatedDnsContentRecorded: false },
    measurement: { qualifiedAdvertiserLead: true, qualifiedEnterpriseDemand: false, authenticatedBid: false },
    legalEffect: "destination-control-qualified-lead-only-no-enterprise-authentication-representative-authority-creative-approval-bid-valuation-award-inventory-reservation-resource-transfer-publication-promise-payment-entitlement-revenue-or-profit",
    creativeApproved: false, bidAdmitted: false, awardCreated: false, resourceTransferObserved: false, publicationPromised: false, revenueRecognized: false, profitRecognized: false,
  } as const;
  return Object.freeze({ ...body, id: semanticId(body) });
}

export function unionMediaIntentRecorderFromSettlementWitness(store: SettlementWitness | Pick<SettlementWitness, "records" | "record">) {
  if (typeof store?.records !== "function" || typeof store?.record !== "function") throw new TypeError("Union Media intent requires TTI settlement-store witness authority");
  return async (admission: UnionMediaIntentAdmission): Promise<UnionMediaIntentAdmission> => {
    if (!selfAddressed(admission) || admission.type !== "TTIUnionMediaRepresentativeIntentAdmission") throw new Error("Union Media intent admission is not self-addressed");
    const prior = ((await store.records(UNION_MEDIA_INTENT_CATEGORY)) as readonly UnionMediaIntentAdmission[]).find((row) => row?.submissionPseudonym === admission.submissionPseudonym);
    if (prior !== undefined) { if (prior.id !== admission.id) throw new Error("Union Media intent interaction replay conflict"); return prior; }
    await store.record({ category: UNION_MEDIA_INTENT_CATEGORY, recordedAt: String(admission["recordedAt"]), record: admission, assertions: [
      { subject: admission.id, predicate: "urn:emsenn:venture:admitted-unverified-union-media-representative-intent", object: { kind: "literal", value: "true", datatype: "http://www.w3.org/2001/XMLSchema#boolean" } },
    ] });
    return admission;
  };
}

export function unionMediaDestinationProofRecorderFromSettlementWitness(store: SettlementWitness | Pick<SettlementWitness, "records" | "record">) {
  if (typeof store?.records !== "function" || typeof store?.record !== "function") throw new TypeError("Union Media destination proof requires TTI settlement-store witness authority");
  return async (admission: UnionMediaDestinationControlAdmission): Promise<UnionMediaDestinationControlAdmission> => {
    if (!selfAddressed(admission) || admission.type !== "TTIUnionMediaDestinationControlAdmission") throw new Error("Union Media destination proof admission is not self-addressed");
    const prior = ((await store.records(UNION_MEDIA_DESTINATION_PROOF_CATEGORY)) as readonly UnionMediaDestinationControlAdmission[]).find((row) => row.intentId === admission.intentId);
    if (prior !== undefined) { if (prior.id !== admission.id) throw new Error("Union Media destination proof conflict"); return prior; }
    await store.record({ category: UNION_MEDIA_DESTINATION_PROOF_CATEGORY, recordedAt: String(admission["recordedAt"]), record: admission, assertions: [
      { subject: admission.id, predicate: "urn:emsenn:venture:qualified-union-media-destination-controlled-lead", object: { kind: "literal", value: "true", datatype: "http://www.w3.org/2001/XMLSchema#boolean" } },
    ] });
    return admission;
  };
}

export function unionMediaIntentSettlementWitness(source: EnvMap = process.env): SettlementWitness {
  const agentUrl = env("WITNESS_JOURNAL_RDF_AGENT", source);
  if (agentUrl === undefined) throw new Error("WITNESS_JOURNAL_RDF_AGENT is required for Union Media intent");
  return turntideSettlementWitness({ settlementRoot: publicTurntideRoot(source), agentUrl, ...(turntideWitnessJournalBindingFromEnvironment(source) ?? {}) });
}

export function unionMediaIntentConfiguration(source: EnvMap = process.env): Readonly<{ expectedGuildId: string; pseudonymKey: string }> {
  const expectedGuildId = env("DISCORD_GUILD_ID", source), pseudonymKey = env("DISCORD_BOT_TOKEN", source);
  if (expectedGuildId === undefined || pseudonymKey === undefined || pseudonymKey.length < 32) throw new Error("Union Media intent requires Discord guild and secret pseudonym authority");
  return Object.freeze({ expectedGuildId, pseudonymKey });
}

export function unionMediaIntentAcknowledgement(admission: UnionMediaIntentAdmission): string {
  const declaration = admission["declaration"] as { enterprise: string; resourceClass: string };
  const challenge = admission["destinationControlChallenge"] as { name: string; value: string; expiresAt: string };
  return ["TTI recorded your nonbinding Union Media representative intent.", `Receipt: ${admission.id}`, `Declared enterprise: ${declaration.enterprise}; proposed resource class: ${declaration.resourceClass}.`, "To prove destination control, publish this DNS TXT record, then run /union-media-verify with the receipt above:", `${challenge.name} TXT ${challenge.value}`, `Expires: ${challenge.expiresAt}`, "Destination control will qualify the lead but will not authenticate the enterprise or your authority to represent it.", "No creative, bid, valuation, award, reservation, transfer, publication promise, payment, revenue, or profit was created."].join("\n");
}

export function unionMediaDestinationProofAcknowledgement(admission: UnionMediaDestinationControlAdmission): string { const declaration = admission["declaration"] as { enterprise: string }; return ["TTI verified control of the declared Union Media destination and recorded a qualified advertiser lead.", `Receipt: ${admission.id}`, `Declared enterprise: ${declaration.enterprise}.`, "This does not authenticate the enterprise, representative authority, or any bid. No placement or economic effect was created."].join("\n"); }
export function unionMediaRepresentativePseudonym(key: string, userId: string): string { return `urn:tti:union-media-representative:${pseudonym(key, "representative", userId)}`; }

function normalizeDestination(value: unknown): Readonly<Record<string, string>> | null { try { if (typeof value !== "string" || value.length > 300) return null; const url = new URL(value.trim()); if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.port || url.hostname === "localhost" || !url.hostname.includes(".")) return null; return Object.freeze({ scheme: "https", host: url.hostname.toLowerCase(), path: url.pathname }); } catch { return null; } }
function refusal(reasons: readonly string[]) { return Object.freeze({ type: "TTIUnionMediaRepresentativeIntentRefusal", version: 1, reasons: [...new Set(reasons)], durableMutation: false, enterpriseAuthenticated: false, bidAdmitted: false, awardCreated: false, revenueRecognized: false, profitRecognized: false }); }
function proofRefusal(reasons: readonly string[]) { return Object.freeze({ type: "TTIUnionMediaDestinationControlRefusal", version: 1, reasons: [...new Set(reasons)], durableMutation: false, destinationControlled: false, enterpriseAuthenticated: false, bidAdmitted: false, awardCreated: false, revenueRecognized: false, profitRecognized: false }); }
function bounded(value: unknown, minimum: number, maximum: number): value is string { return typeof value === "string" && value.trim().length >= minimum && value.trim().length <= maximum; }
function snowflake(value: unknown): value is string { return typeof value === "string" && /^[1-9][0-9]{16,20}$/u.test(value); }
function snowflakeInstant(value: unknown): Date | null { try { if (!snowflake(value)) return null; const milliseconds = Number((BigInt(value) >> 22n) + DISCORD_EPOCH_MS); return Number.isSafeInteger(milliseconds) ? new Date(milliseconds) : null; } catch { return null; } }
function pseudonym(key: string, domain: string, value: string): string { return createHmac("sha256", key).update(`tti-union-media-intent-v1\0${domain}\0${value}`, "utf8").digest("base64url"); }
function obviousPersonalSensitiveOrSecret(value: string): boolean { return /(?:<@!?[0-9]+>|https?:\/\/|discord\.gg\/|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\b(?:password|passphrase|api[_ -]?key|secret|access[_ -]?token|private[_ -]?key|social security|ssn|medical advice|legal advice|financial advice|emergency)\b|\+?[0-9][0-9 ()-]{7,}[0-9]|\b[0-9]{1,5}\s+[\p{L}. '-]+\s(?:street|st|road|rd|avenue|ave|lane|ln|drive|dr|boulevard|blvd)\b)/iu.test(value); }
function selfAddressed(value: Record<string, unknown>): boolean { const { id, ...body } = value; return typeof id === "string" && id === semanticId(body); }
