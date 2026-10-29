import { readFileSync } from "node:fs";
import { env, integerEnv, publicTurntideContentPath, publicTurntideDataPath, type EnvMap } from "./env.mts";
import { record, stringField, type DiscordTransport } from "./discord.mts";
import { consumeOneTimeSession, inspectOneTimeSession, issueOneTimeSession } from "./one-time-session.mts";
import { messageRequestsKnowledgeContributionOffer } from "./zelo-work-roster.mts";

export const KNOWLEDGE_TERMS_ID = "tti-knowledge-contribution-terms-draft-2026-01";

export interface KnowledgeBrokerMention {
  readonly type: "TTIKnowledgeBrokerMention";
  readonly guildId: string;
  readonly channelId: string;
  readonly messageId: string;
  readonly authorId: string;
  readonly authorBot: boolean;
  readonly mentionedUserIds: readonly string[];
  readonly observedAt: string;
  readonly discordMessageContentImported: false;
}

export interface KnowledgeIntakeConfig {
  readonly intakeBaseUrl: string;
  readonly sessionsFile: string;
  readonly candidatesFile: string;
  readonly termsFile: string;
  readonly ttlMinutes: number;
  readonly effectiveTermsId: string;
  readonly marketAdmissionId: string;
}

export interface KnowledgeBrokerConfig extends KnowledgeIntakeConfig {
  readonly brokerBotId: string;
}

export interface KnowledgeBrokerRuntimeConfig extends KnowledgeBrokerConfig {
  readonly effectiveTermsDigest: string;
}

export interface KnowledgeOfferSessionRecord {
  readonly type: "TTIKnowledgeOfferSession";
  readonly version: 1;
  readonly status: "pending";
  readonly tokenDigest: string;
  readonly discord: Readonly<{ guildId: string; channelId: string; messageId: string; authorId: string; messageContentImported: false }>;
  readonly termsId: string;
  readonly termsDigest: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly legalEffect: "offer-session-only-no-license-or-sale";
  readonly marketAdmissionId: string;
}

export function knowledgeIntakeConfig(source: EnvMap = process.env): KnowledgeIntakeConfig | null {
  if (env("TTI_KNOWLEDGE_BROKER_ENABLED", source) !== "true") return null;
  const intakeBaseUrl = env("TTI_KNOWLEDGE_INTAKE_BASE_URL", source);
  const effectiveTermsId = env("TTI_KNOWLEDGE_EFFECTIVE_TERMS_ID", source);
  if (intakeBaseUrl === undefined || effectiveTermsId === undefined) {
    throw new Error("knowledge market activation requires TTI_KNOWLEDGE_INTAKE_BASE_URL and TTI_KNOWLEDGE_EFFECTIVE_TERMS_ID");
  }
  const url = new URL(intakeBaseUrl);
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new Error("knowledge broker intake must use HTTPS");
  }
  if (effectiveTermsId === KNOWLEDGE_TERMS_ID) throw new Error("draft knowledge-contribution terms cannot activate the broker");
  const admissionFile = env("TTI_KNOWLEDGE_MARKET_ADMISSION_FILE", source) ?? publicTurntideContentPath(source, "admissions", "contributor-knowledge-market-activation.json");
  const admission = JSON.parse(readFileSync(admissionFile, "utf8")) as Record<string, unknown>;
  const checks = Array.isArray(admission["checks"]) ? admission["checks"] as Record<string, unknown>[] : [];
  const requiredChecks = new Set(["qualified-legal-review", "adult-capacity-and-minor-exclusion", "privacy-and-security-review", "discord-developer-policy-review", "production-https-and-query-log-suppression", "pilot-stop-and-incident-law"]);
  const passedChecks = new Set(checks.filter((check) => check["status"] === "passed" && typeof check["evidenceId"] === "string" && check["evidenceId"] !== "").map((check) => check["id"]));
  if (admission["type"] !== "TTIKnowledgeMarketActivationAdmission" || admission["status"] !== "admitted" || admission["scope"] !== "broker-mention-and-direct-candidate-pilot-no-sale") throw new Error("knowledge market activation admission is absent or not admitted");
  if (admission["termsId"] !== effectiveTermsId || admission["intakeOrigin"] !== url.origin) throw new Error("knowledge market admission does not bind the configured terms and HTTPS origin");
  if ([...requiredChecks].some((id) => !passedChecks.has(id))) throw new Error("knowledge market activation admission lacks required evidence");
  if (!Number.isFinite(Date.parse(String(admission["expiresAt"]))) || Date.parse(String(admission["expiresAt"])) <= Date.now()) throw new Error("knowledge market activation admission is expired");
  const marketAdmissionId = typeof admission["id"] === "string" ? admission["id"] : "";
  if (marketAdmissionId === "") throw new Error("knowledge market activation admission has no identity");
  return {
    intakeBaseUrl: url.href,
    sessionsFile: env("TTI_KNOWLEDGE_BROKER_SESSIONS_FILE", source) ?? publicTurntideDataPath(source, "knowledge-broker", "sessions.jsonl"),
    candidatesFile: env("TTI_KNOWLEDGE_CONTRIBUTION_CANDIDATES_FILE", source) ?? publicTurntideDataPath(source, "knowledge-broker", "contribution-candidates.jsonl"),
    termsFile: env("TTI_KNOWLEDGE_TERMS_FILE", source) ?? publicTurntideContentPath(source, "terms", "knowledge-contribution-participation.json"),
    ttlMinutes: integerEnv("TTI_KNOWLEDGE_BROKER_TTL_MINUTES", 30, source),
    effectiveTermsId,
    marketAdmissionId,
  };
}

export function knowledgeBrokerConfig(source: EnvMap = process.env, brokerBotId?: string): KnowledgeBrokerConfig | null {
  const intake = knowledgeIntakeConfig(source);
  if (intake === null) return null;
  if (brokerBotId === undefined) throw new Error("knowledge broker activation requires the broker bot identity");
  return { ...intake, brokerBotId };
}

/**
 * Reduce a Discord MESSAGE_CREATE payload to the minimum event pointer needed
 * for an author-initiated offer session. Message content is deliberately never
 * copied into this value, even though Discord exposes content for bot mentions.
 */
export function knowledgeBrokerMentionFromMessageCreate(raw: Record<string, unknown>, observedAt = new Date().toISOString()): KnowledgeBrokerMention | null {
  const author = record(raw["author"]);
  const guildId = stringField(raw, "guild_id");
  const channelId = stringField(raw, "channel_id");
  const messageId = stringField(raw, "id");
  const authorId = stringField(author, "id");
  if (guildId === "" || channelId === "" || messageId === "" || authorId === "") return null;
  const mentionedUserIds = Array.isArray(raw["mentions"])
    ? raw["mentions"].map((value) => stringField(record(value), "id")).filter((value) => value !== "")
    : [];
  return {
    type: "TTIKnowledgeBrokerMention",
    guildId,
    channelId,
    messageId,
    authorId,
    authorBot: author["bot"] === true,
    mentionedUserIds,
    observedAt,
    discordMessageContentImported: false,
  };
}

export function qualifiesForKnowledgeOfferSession(event: KnowledgeBrokerMention, brokerBotId: string): boolean {
  return event.authorBot === false && event.mentionedUserIds.includes(brokerBotId);
}

export async function inspectKnowledgeOfferSession(
  token: string,
  sessionsFile: string,
  options: Readonly<{ now?: Date }> = {},
): Promise<Readonly<{ accepted: boolean; reason?: string; session?: KnowledgeOfferSessionRecord }>> {
  return inspectOneTimeSession<KnowledgeOfferSessionRecord>({ token, file: sessionsFile, sessionType: "TTIKnowledgeOfferSession", consumptionType: "TTIKnowledgeOfferSessionConsumption", now: options.now });
}

export async function issueKnowledgeOfferSession(
  event: KnowledgeBrokerMention,
  config: KnowledgeBrokerRuntimeConfig,
  options: Readonly<{ now?: Date; token?: string }> = {},
): Promise<Readonly<{ record: KnowledgeOfferSessionRecord; intakeUrl: string }>> {
  if (!qualifiesForKnowledgeOfferSession(event, config.brokerBotId)) throw new Error("message did not mention the configured human-facing knowledge broker");
  const now = options.now ?? new Date();
  const issued = await issueOneTimeSession({ file: config.sessionsFile, token: options.token, record: {
    type: "TTIKnowledgeOfferSession",
    version: 1,
    status: "pending",
    discord: { guildId: event.guildId, channelId: event.channelId, messageId: event.messageId, authorId: event.authorId, messageContentImported: false },
    termsId: config.effectiveTermsId,
    termsDigest: config.effectiveTermsDigest,
    marketAdmissionId: config.marketAdmissionId,
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + config.ttlMinutes * 60_000).toISOString(),
    legalEffect: "offer-session-only-no-license-or-sale",
  } });
  const recordValue = issued.record as KnowledgeOfferSessionRecord;
  const intakeUrl = new URL("knowledge/contribute", config.intakeBaseUrl);
  intakeUrl.searchParams.set("session", issued.token);
  return { record: recordValue, intakeUrl: intakeUrl.href };
}

export async function consumeKnowledgeOfferSession(
  token: string,
  sessionsFile: string,
  options: Readonly<{ now?: Date; claimPayload?: unknown }> = {},
): Promise<Readonly<{ accepted: boolean; reason?: string; session?: KnowledgeOfferSessionRecord }>> {
  const inspection = await inspectKnowledgeOfferSession(token, sessionsFile, { now: options.now });
  if (!inspection.accepted || inspection.session === undefined) return inspection;
  return consumeOneTimeSession<KnowledgeOfferSessionRecord>({ token, file: sessionsFile, sessionType: "TTIKnowledgeOfferSession", consumptionType: "TTIKnowledgeOfferSessionConsumption", now: options.now, claimPayload: options.claimPayload, consumption: { sourceMessageId: inspection.session.discord.messageId } });
}

export async function brokerKnowledgeOfferFromMessage(
  raw: Record<string, unknown>,
  config: KnowledgeBrokerRuntimeConfig,
  transport: DiscordTransport,
  options: Readonly<{ now?: Date; token?: string }> = {},
): Promise<Readonly<{ outcome: "ignored" | "dm-sent"; messageContentImported: false; session?: KnowledgeOfferSessionRecord; dmMessageId?: string }>> {
  const event = knowledgeBrokerMentionFromMessageCreate(raw, (options.now ?? new Date()).toISOString());
  if (event === null || !qualifiesForKnowledgeOfferSession(event, config.brokerBotId)) return { outcome: "ignored", messageContentImported: false };
  // A mention addresses Zelo operationally; it is not, by itself, a request
  // for knowledge-market terms. Inspect the transient message only for an
  // explicit sell/contribute request before creating the private offer.
  if (!messageRequestsKnowledgeContributionOffer(stringField(raw, "content"))) return { outcome: "ignored", messageContentImported: false };
  const issued = await issueKnowledgeOfferSession(event, config, options);
  const dmChannelId = await transport.createDirectMessageChannel(event.authorId);
  const sent = await transport.createMessage(dmChannelId, [
    "Your mention asked Turntide Islands to make you a knowledge-contribution offer.",
    "It did not sell, license, or copy your Discord message.",
    `Continue within ${config.ttlMinutes} minutes: ${issued.intakeUrl}`,
    "At the TTI intake, re-submit the information in your own words, choose a license and attribution scope, and accept the exact terms. This link may be used once.",
  ].join("\n\n"));
  return { outcome: "dm-sent", messageContentImported: false, session: issued.record, dmMessageId: sent.id };
}
