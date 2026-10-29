import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { isIP } from "node:net";
import path from "node:path";
import { identifyTurntideDiscordPlatformRecord as semanticId } from "./discord-platform-record-semantic-content.mts";
import { env, integerEnv, publicTurntideDataPath, type EnvMap } from "./env.mts";
import type { DiscordMessage, DiscordTransport } from "./discord.mts";

export const UNION_MEDIA_PROVIDER_MARKER = "UNION-MEDIA-INFRASTRUCTURE-OFFER";
export const UNION_MEDIA_PROVIDER_LOT_IDS = Object.freeze([
  "custody-clean-activitypub-carrier",
  "tti-signed-agent-card-and-public-jwks",
  "tti-public-https-activitypub-host",
] as const);
export type UnionMediaProviderLotId = typeof UNION_MEDIA_PROVIDER_LOT_IDS[number];

export interface UnionMediaProviderLeadProjection {
  readonly type: "TTIUnionMediaDeclaredProviderLead";
  readonly version: 1;
  readonly marker: typeof UNION_MEDIA_PROVIDER_MARKER;
  readonly status: "qualified-declared-provider-lead" | "unqualified-marker-mention";
  readonly qualificationReasons: readonly string[];
  readonly declaredEnterprise?: string;
  readonly offeredLotIds: readonly UnionMediaProviderLotId[];
  readonly agentCardUrl?: string;
  readonly declaredEnterpriseAuthenticated: false;
  readonly agentCardFetched: false;
  readonly providerContractOfferObserved: false;
}

export type ZeloWorkClassification =
  | "access-permission"
  | "knowledge-contribution-offer-request"
  | "service-provider-offer"
  | "moderation-or-safety"
  | "general-request";

export type ZeloWorkPriority = "urgent" | "high" | "normal";

export interface ZeloWorkItem {
  readonly type: "TTIZeloWorkItem";
  readonly version: 1 | 2;
  readonly id: string;
  readonly classification: ZeloWorkClassification;
  readonly priority: ZeloWorkPriority;
  readonly source: Readonly<{
    guildId: string;
    channelId: string;
    messageId: string;
    authorId: string;
    messageTimestamp: string;
    url: string;
  }>;
  readonly observedAt: string;
  readonly contentDigest: string;
  readonly discordMessageContentImported: false;
  readonly legalEffect: "operational-request-only-not-knowledge-contribution-consent-license-or-sale";
  readonly serviceProviderEffect?: "nonbinding-provider-lead-only-no-contract-authority-custody-grant-or-acceptance";
  readonly unionMediaProviderLead?: UnionMediaProviderLeadProjection;
}

export interface ZeloWorkResolution {
  readonly type: "TTIZeloWorkResolution";
  readonly version: 1;
  readonly id: string;
  readonly workItemId: string;
  readonly outcome: string;
  readonly evidence: readonly string[];
  readonly resolvedAt: string;
}

export type ZeloWorkRosterRecord = ZeloWorkItem | ZeloWorkResolution;

export interface ZeloWorkRosterConfig {
  readonly guildId: string;
  readonly file: string;
  readonly adminChannelId?: string;
  readonly adminUserId?: string;
  readonly lookbackMinutes: number;
  readonly messagesPerChannel: number;
}

export interface ObserveZeloWorkResult {
  readonly type: "TTIZeloWorkObservationReceipt";
  readonly guildId: string;
  readonly botId: string;
  readonly channelsSeen: number;
  readonly channelsRead: number;
  readonly channelsSkipped: number;
  readonly messagesSeen: number;
  readonly newItems: readonly ZeloWorkItem[];
  readonly openItems: readonly ZeloWorkItem[];
  readonly notificationMessageId?: string;
  readonly recordedAt: string;
}

const ACCESS = /\b(permission|permissions|access|role|locked|denied|cannot|can't|can’t|unable|not allowed|can't see|can’t see|cannot see|view channel|send messages?)\b/iu;
const SAFETY = /\b(abuse|abusive|harass|harassment|threat|threaten|unsafe|doxx|doxxing|spam|scam|impersonat|moderator|moderation|report user)\b/iu;
const KNOWLEDGE_NOUN = /\b(knowledge|information|message|experience|contribution|field note|research|story)\b/iu;
const KNOWLEDGE_OFFER = /\b(sell|contribute|submit|license|offer|buy|purchase)\b/iu;
const SERVICE_PROVIDER_NOUN = /\b(activitypub|activitystreams|carrier|hosting|host|https|dns|domain|ingress|reverse proxy|compute|inference capacity|database access|image access|moderation service)\b/iu;
const SERVICE_PROVIDER_OFFER = /\b(offer|provide|provision|supply|sell|host|operate|contract|capacity available|can help)\b/iu;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

export function parseUnionMediaProviderLead(content: string, botId: string): UnionMediaProviderLeadProjection | undefined {
  if (!content.includes(UNION_MEDIA_PROVIDER_MARKER)) return undefined;
  const mention = `<@!?${escapeRegExp(botId)}>`;
  const grammar = new RegExp(`^\\s*${mention}\\s+${UNION_MEDIA_PROVIDER_MARKER}\\s+enterprise=(urn:ame:[a-z0-9][a-z0-9._:-]{0,127})\\s+lots=([a-z0-9-]+(?:,[a-z0-9-]+){0,2})\\s+agent-card=(https:\\/\\/\\S+)\\s*$`, "u");
  const match = grammar.exec(content);
  const reasons: string[] = [];
  if (match === null) reasons.push("exact-provider-lead-grammar-required");
  const enterprise = match?.[1];
  const offered = (match?.[2]?.split(",") ?? []) as UnionMediaProviderLotId[];
  if (match !== null) {
    if (new Set(offered).size !== offered.length) reasons.push("duplicate-provider-lot");
    if (offered.some((lot) => !UNION_MEDIA_PROVIDER_LOT_IDS.includes(lot))) reasons.push("unknown-provider-lot");
    const canonical = UNION_MEDIA_PROVIDER_LOT_IDS.filter((lot) => offered.includes(lot));
    if (JSON.stringify(offered) !== JSON.stringify(canonical)) reasons.push("provider-lots-not-in-canonical-order");
  }
  let agentCardUrl: string | undefined;
  if (match !== null) {
    try {
      const candidate = new URL(match[3]!);
      const valid = candidate.protocol === "https:"
        && candidate.username === ""
        && candidate.password === ""
        && candidate.port === ""
        && candidate.search === ""
        && candidate.hash === ""
        && candidate.pathname === "/.well-known/agent-card.json"
        && candidate.hostname.includes(".")
        && isIP(candidate.hostname) === 0
        && candidate.href.length <= 240;
      if (!valid) reasons.push("public-agent-card-url-required");
      else agentCardUrl = candidate.href;
    } catch {
      reasons.push("public-agent-card-url-required");
    }
  }
  if (reasons.length > 0 || enterprise === undefined || agentCardUrl === undefined || offered.length === 0) {
    return Object.freeze({
      type: "TTIUnionMediaDeclaredProviderLead",
      version: 1,
      marker: UNION_MEDIA_PROVIDER_MARKER,
      status: "unqualified-marker-mention",
      qualificationReasons: Object.freeze(reasons.length > 0 ? [...new Set(reasons)] : ["at-least-one-provider-lot-required"]),
      offeredLotIds: Object.freeze([]),
      declaredEnterpriseAuthenticated: false,
      agentCardFetched: false,
      providerContractOfferObserved: false,
    });
  }
  return Object.freeze({
    type: "TTIUnionMediaDeclaredProviderLead",
    version: 1,
    marker: UNION_MEDIA_PROVIDER_MARKER,
    status: "qualified-declared-provider-lead",
    qualificationReasons: Object.freeze([]),
    declaredEnterprise: enterprise,
    offeredLotIds: Object.freeze([...offered]),
    agentCardUrl,
    declaredEnterpriseAuthenticated: false,
    agentCardFetched: false,
    providerContractOfferObserved: false,
  });
}

export function zeloWorkRosterConfig(source: EnvMap = process.env): ZeloWorkRosterConfig {
  const guildId = env("DISCORD_GUILD_ID", source);
  if (guildId === undefined) throw new Error("Zelo work roster requires DISCORD_GUILD_ID");
  return Object.freeze({
    guildId,
    file: env("TTI_ZELO_WORK_ROSTER_FILE", source) ?? publicTurntideDataPath(source, "agency", "zelo-work-roster.jsonl"),
    adminChannelId: env("DISCORD_ADMIN_CHANNEL_ID", source),
    adminUserId: env("DISCORD_ADMIN_USER_ID", source),
    lookbackMinutes: integerEnv("TTI_ZELO_WORK_LOOKBACK_MINUTES", 10_080, source),
    messagesPerChannel: Math.min(100, integerEnv("TTI_ZELO_WORK_MESSAGES_PER_CHANNEL", 100, source)),
  });
}

export function classifyZeloWork(content: string): Readonly<{ classification: ZeloWorkClassification; priority: ZeloWorkPriority }> {
  if (SAFETY.test(content)) return Object.freeze({ classification: "moderation-or-safety", priority: "urgent" });
  if (ACCESS.test(content)) return Object.freeze({ classification: "access-permission", priority: "high" });
  if (content.includes(UNION_MEDIA_PROVIDER_MARKER)) return Object.freeze({ classification: "service-provider-offer", priority: "high" });
  if (SERVICE_PROVIDER_NOUN.test(content) && SERVICE_PROVIDER_OFFER.test(content)) {
    return Object.freeze({ classification: "service-provider-offer", priority: "high" });
  }
  if (KNOWLEDGE_NOUN.test(content) && KNOWLEDGE_OFFER.test(content)) {
    return Object.freeze({ classification: "knowledge-contribution-offer-request", priority: "normal" });
  }
  return Object.freeze({ classification: "general-request", priority: "normal" });
}

export function messageRequestsKnowledgeContributionOffer(content: string): boolean {
  return KNOWLEDGE_NOUN.test(content) && KNOWLEDGE_OFFER.test(content);
}

export function zeloWorkItemFromMessage(
  message: DiscordMessage,
  guildId: string,
  botId: string,
  observedAt = new Date().toISOString(),
): ZeloWorkItem | null {
  if (message.authorBot || !message.mentionedUserIds.includes(botId)) return null;
  const classed = classifyZeloWork(message.content);
  const providerLead = parseUnionMediaProviderLead(message.content, botId);
  const body = {
    type: "TTIZeloWorkItem",
    version: 2,
    ...classed,
    source: Object.freeze({
      guildId,
      channelId: message.channelId,
      messageId: message.id,
      authorId: message.authorId,
      messageTimestamp: message.timestamp,
      url: `https://discord.com/channels/${guildId}/${message.channelId}/${message.id}`,
    }),
    observedAt,
    contentDigest: `sha256:${createHash("sha256").update(message.content, "utf8").digest("hex")}`,
    discordMessageContentImported: false,
    legalEffect: "operational-request-only-not-knowledge-contribution-consent-license-or-sale",
    ...(classed.classification === "service-provider-offer" ? { serviceProviderEffect: "nonbinding-provider-lead-only-no-contract-authority-custody-grant-or-acceptance" as const } : {}),
    ...(providerLead === undefined ? {} : { unionMediaProviderLead: providerLead }),
  } as const;
  return Object.freeze({ ...body, id: semanticId(body) });
}

export async function readZeloWorkRoster(file: string): Promise<readonly ZeloWorkRosterRecord[]> {
  try {
    const text = await readFile(file, "utf8");
    return Object.freeze(text.split("\n").filter((line) => line.trim() !== "").map((line) => JSON.parse(line) as ZeloWorkRosterRecord));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return Object.freeze([]);
    throw error;
  }
}

export function openZeloWorkItems(records: readonly ZeloWorkRosterRecord[]): readonly ZeloWorkItem[] {
  const resolved = new Set(records.filter((record): record is ZeloWorkResolution => record.type === "TTIZeloWorkResolution").map((record) => record.workItemId));
  return Object.freeze(records.filter((record): record is ZeloWorkItem => record.type === "TTIZeloWorkItem" && !resolved.has(record.id)));
}

export async function appendNewZeloWorkItems(
  file: string,
  candidates: readonly ZeloWorkItem[],
  witness?: (item: ZeloWorkItem) => Promise<void>,
): Promise<readonly ZeloWorkItem[]> {
  const prior = await readZeloWorkRoster(file);
  const observedMessageVersions = new Set(prior
    .filter((record): record is ZeloWorkItem => record.type === "TTIZeloWorkItem")
    .map((record) => `${record.source.messageId}\u0000${record.contentDigest}`));
  const fresh = candidates.filter((candidate) => !observedMessageVersions.has(`${candidate.source.messageId}\u0000${candidate.contentDigest}`));
  if (fresh.length === 0) return Object.freeze([]);
  if (witness !== undefined) for (const item of fresh) await witness(item);
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, fresh.map((item) => JSON.stringify(item)).join("\n") + "\n", { encoding: "utf8", mode: 0o600 });
  return Object.freeze(fresh);
}

export async function recordZeloWorkResolution(
  file: string,
  input: Readonly<{ messageId: string; outcome: string; evidence: readonly string[]; resolvedAt?: string }>,
): Promise<Readonly<{ recorded: boolean; resolution: ZeloWorkResolution }>> {
  const records = await readZeloWorkRoster(file);
  const item = records.find((record): record is ZeloWorkItem => record.type === "TTIZeloWorkItem" && record.source.messageId === input.messageId);
  if (item === undefined) throw new Error(`Zelo work item for Discord message ${input.messageId} does not exist`);
  const prior = records.find((record): record is ZeloWorkResolution => record.type === "TTIZeloWorkResolution" && record.workItemId === item.id);
  if (prior !== undefined) return Object.freeze({ recorded: false, resolution: prior });
  const resolution = Object.freeze({
    type: "TTIZeloWorkResolution" as const,
    version: 1 as const,
    id: `${item.id}-resolution`,
    workItemId: item.id,
    outcome: input.outcome,
    evidence: Object.freeze([...input.evidence]),
    resolvedAt: input.resolvedAt ?? new Date().toISOString(),
  });
  await appendFile(file, `${JSON.stringify(resolution)}\n`, { encoding: "utf8", mode: 0o600 });
  return Object.freeze({ recorded: true, resolution });
}

export async function observeZeloWork(
  transport: DiscordTransport,
  config: ZeloWorkRosterConfig,
  options: Readonly<{ now?: Date; notify?: boolean; witness?: (item: ZeloWorkItem) => Promise<void> }> = {},
): Promise<ObserveZeloWorkResult> {
  const now = options.now ?? new Date();
  const bot = await transport.getCurrentUser();
  const channels = await transport.listChannels(config.guildId);
  const cutoff = now.getTime() - config.lookbackMinutes * 60_000;
  const candidates: ZeloWorkItem[] = [];
  let channelsRead = 0;
  let channelsSkipped = 0;
  let messagesSeen = 0;
  for (const channel of channels) {
    let messages: readonly DiscordMessage[];
    try {
      messages = await transport.listMessages(channel.id, config.messagesPerChannel);
    } catch {
      channelsSkipped += 1;
      continue;
    }
    channelsRead += 1;
    messagesSeen += messages.length;
    for (const message of messages) {
      if (!Number.isFinite(Date.parse(message.timestamp)) || Date.parse(message.timestamp) < cutoff) continue;
      const item = zeloWorkItemFromMessage(message, config.guildId, bot.id, now.toISOString());
      if (item !== null) candidates.push(item);
    }
  }
  candidates.sort((left, right) => left.source.messageTimestamp.localeCompare(right.source.messageTimestamp) || left.id.localeCompare(right.id));
  const newItems = await appendNewZeloWorkItems(config.file, candidates, options.witness);
  let notificationMessageId: string | undefined;
  if (options.notify !== false && newItems.length > 0 && config.adminChannelId !== undefined) {
    const lines = newItems.slice(0, 12).map((item) => `- ${item.priority} / ${item.classification}: ${item.source.url} (\`${item.id}\`)`);
    const notice = await transport.createMessage(config.adminChannelId, {
      content: [
        config.adminUserId === undefined ? "Zelo work roster admitted new requests." : `<@${config.adminUserId}> Zelo work roster admitted ${newItems.length} new request${newItems.length === 1 ? "" : "s"}.`,
        ...lines,
        newItems.length > lines.length ? `- …and ${newItems.length - lines.length} more.` : undefined,
        "Message text was not copied into the roster. A Zelo mention is an operational request, not consent to license or sell knowledge.",
      ].filter((line): line is string => line !== undefined).join("\n"),
      allowedMentions: config.adminUserId === undefined ? { users: [] } : { users: [config.adminUserId] },
    });
    notificationMessageId = notice.id;
  }
  const records = await readZeloWorkRoster(config.file);
  return Object.freeze({
    type: "TTIZeloWorkObservationReceipt",
    guildId: config.guildId,
    botId: bot.id,
    channelsSeen: channels.length,
    channelsRead,
    channelsSkipped,
    messagesSeen,
    newItems,
    openItems: openZeloWorkItems(records),
    notificationMessageId,
    recordedAt: now.toISOString(),
  });
}
