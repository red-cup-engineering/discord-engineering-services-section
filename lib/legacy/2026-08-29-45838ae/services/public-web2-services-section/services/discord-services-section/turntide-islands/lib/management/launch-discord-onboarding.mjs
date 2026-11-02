#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EMPTY_WITNESS_ROOT, identifyJsonSemanticContent } from "@red-cup-engineering/semantic-content-identify-service";
const semanticId = (value) => identifyJsonSemanticContent({ objectKind: "turntide-islands.record", value, witnessRoot: EMPTY_WITNESS_ROOT }).token;
import { recordWitnessJournalBatch } from "@red-cup-engineering/witness-journal-document-service";
import { turntideWitnessJournalBindingFromEnvironment } from "./settlement-witness-journal-binding.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const PRODUCT_PATH = join(ROOT, "content/products/discord-onboarding.json");
const API = "https://discord.com/api/v10";
const TTI = "urn:ame:turntide-islands";
const ACCOUNT = "eip155:31337:0xcfe1b9960ddbbe2b95e48114c281d7f24eb87b4d";

export function discordOnboardingMessage(product) {
  if (product?.type !== "TTIDiscordOnboardingSurface" || product?.version !== 1 || product?.operator !== TTI || product?.marker !== "TTI-ONBOARDING-2026-01" || product?.privacy?.ordinaryMessagesResold !== false || product?.privacy?.ordinaryParticipationIsConsent !== false || product?.privacy?.zeloRosterCopiesMessageText !== false || product?.privacy?.automaticCohortProfiling !== false) throw new TypeError("TTI onboarding product is incomplete");
  const content = [
    "**Welcome to Turntide Islands**", "",
    "TTI is a Discord-borne Harmonious Union colony and a for-profit knowledge and media enterprise. Conversation is the settlement's social life; only separately consented, contract-shaped acts enter its commercial machinery.", "",
    "**Find your way**", 
    "- <#1184864166142558349> — arrive and say hello",
    "- <#1184863861065658422> — general conversation",
    "- <#1346508996667768853> — ask about channel access and roles",
    "- <#1529174199971610855> — Union-wide hourly news",
    "- <#1529258772982403203> — Union Media advertiser discovery; auctions are still closed",
    "- <#1529174202597249125> — TTI colonial governance updates",
    "- <#1519620764695793876> and the Knowledge Vault lanes — slower, durable work; founding checkout is still closed", "",
    "**Ask Zelo**", 
    "Mention @Zelo in your message for an operational request. TTI records a private source pointer and digest so the request reaches its work roster; it does not copy the message text into that roster. Access and safety requests are prioritized. Ordinary messages, reactions, roles, and participation are not consent to sell knowledge, not bids, and not payment.", "",
    "Use `/locality-pilot` for a deliberately submitted no-charge buyer query, or `/union-media-intent` for nonbinding enterprise advertising interest. Each command shows its own retention and legal effect before submission.", "",
    "TTI does not automatically profile members into commercial cohorts or dynasties. Any future cohort role must be voluntary and separately explained. Historical `islander` access remains access, not proof of payment.", "",
    `Marker: ${product.marker}`,
  ].join("\n");
  if (content.length > 2000) throw new TypeError("TTI onboarding message exceeds Discord's content limit");
  return content;
}

export async function launchDiscordOnboarding(options = {}) {
  const product = options.product ?? JSON.parse(await readFile(options.productPath ?? PRODUCT_PATH, "utf8"));
  const content = discordOnboardingMessage(product);
  if (options.live !== true) return Object.freeze({ type: "TTIDiscordOnboardingPlan", productId: product.id, channelId: product.channel.id, content, externalEffects: [] });
  if (!options.token || !options.guildId || !options.witnessJournalAgentUrl) throw new Error("live TTI onboarding requires Discord token, guild, and contracted witness-journal RDF provider");
  if (options.guildId !== product.guildId) throw new Error("TTI onboarding guild differs from admitted product");
  const recordedAt = options.recordedAt ?? new Date().toISOString();
  const channels = await api(options.token, "GET", `/guilds/${options.guildId}/channels`);
  const channel = channels.find((row) => row.id === product.channel.id && row.name === product.channel.name && row.parent_id === product.channel.categoryId && row.type === 0);
  if (!channel) throw new Error("declared TTI onboarding channel is absent or moved");
  const messages = await api(options.token, "GET", `/channels/${channel.id}/messages?limit=50`);
  let message = messages.find((row) => String(row.content ?? "").includes(product.marker));
  let messageCreated = false, messageReconciled = false;
  if (!message) { message = await api(options.token, "POST", `/channels/${channel.id}/messages`, { content, allowed_mentions: { parse: [] } }); messageCreated = true; }
  else if (message.content !== content) { message = await api(options.token, "PATCH", `/channels/${channel.id}/messages/${message.id}`, { content, allowed_mentions: { parse: [] } }); messageReconciled = true; }
  const body = { type: "TTIDiscordOnboardingReceipt", version: 1, status: "live", recordedAt, operator: TTI, productId: product.id, guildId: options.guildId, categoryId: product.channel.categoryId, channelId: channel.id, messageId: message.id, marker: product.marker, messageCreated, messageReconciled, ordinaryMessageResaleAuthorized: false, commercialCohortProfilingAuthorized: false, paymentOrEntitlementCreated: false, revenueRecognized: false, profitRecognized: false };
  const graph = semanticId(body);
  const witnessJournal = options.witnessJournal ?? turntideWitnessJournalBindingFromEnvironment();
  await recordWitnessJournalBatch({ agentUrl: options.witnessJournalAgentUrl, ...(witnessJournal ?? {}), batch: { settlement: ACCOUNT, graph, recordedAt, document: body, assertions: [{ subject: TTI, predicate: "urn:emsenn:venture:discord-onboarding-surface", object: { kind: "iri", value: graph } }] } });
  return Object.freeze({ ...body, receiptId: graph });
}

async function api(token, method, route, body) {
  const response = await fetch(`${API}${route}`, { method, headers: { authorization: `Bot ${token}`, "content-type": "application/json", "user-agent": "@red-cup-engineering/turntide-islands onboarding" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text(); if (!response.ok) throw new Error(`Discord ${method} ${route} -> ${response.status}: ${text.slice(0, 400)}`); return text ? JSON.parse(text) : null;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await launchDiscordOnboarding({ live: process.argv.includes("--live"), token: process.env.DISCORD_BOT_TOKEN ?? process.env.DISCORD_TOKEN, guildId: process.env.DISCORD_GUILD_ID, witnessJournalAgentUrl: process.env.WITNESS_JOURNAL_RDF_AGENT });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
