#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EMPTY_WITNESS_ROOT, identifyJsonSemanticContent } from "@red-cup-engineering/semantic-content-identify-service";
const semanticId = (value) => identifyJsonSemanticContent({ objectKind: "turntide-islands.record", value, witnessRoot: EMPTY_WITNESS_ROOT }).token;
import { querySettlementRecords, recordWitnessJournalBatch } from "@red-cup-engineering/witness-journal-document-service";
import { turntideWitnessJournalBindingFromEnvironment } from "./settlement-witness-journal-binding.mjs";
import { localityDiscoverySnapshot } from "./launch-locality-knowledge-discovery.mjs";

const TTI_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const PRODUCT_PATH = join(TTI_ROOT, "content/products/locality-knowledge-answer.json");
const TTI_ACCOUNT = "eip155:31337:0xcfe1b9960ddbbe2b95e48114c281d7f24eb87b4d";
const TTI_ACTOR = "urn:ame:turntide-islands";
const API = "https://discord.com/api/v10";
const LOCALITY_QUERY_PILOT_CATEGORY = "tti-locality-query-pilot-admission-v2";

export async function observeLocalityKnowledgeDiscovery(options = {}) {
  const product = options.product ?? JSON.parse(await readFile(options.productPath ?? PRODUCT_PATH, "utf8"));
  if (!options.token || !options.guildId || !options.witnessJournalAgentUrl) throw new Error("locality discovery observation requires Discord token, guild, and contracted witness-journal RDF provider");
  const location = await resolveMessage(options, product);
  if (location.type === "TTILocalityDiscoveryObservationRefusal") return location;
  const usersBySignal = {};
  for (const emoji of Object.keys(product.conversion.signals)) {
    const users = await reactionUsers(options.token, location.channelId, location.messageId, emoji);
    usersBySignal[emoji] = users.filter((user) => user.bot !== true).map((user) => user.id);
  }
  const recordedAt = options.recordedAt ?? new Date().toISOString();
  const dataRoot = options.dataRoot ?? join(TTI_ROOT, "data");
  const witnessJournal = options.witnessJournal ?? turntideWitnessJournalBindingFromEnvironment();
  const queryPilotAdmissions = options.queryPilotAdmissions ?? (await querySettlementRecords(LOCALITY_QUERY_PILOT_CATEGORY, { ...(witnessJournal ?? {}) }));
  const snapshot = localityDiscoverySnapshot({ product, offerMessageId: location.messageId, usersBySignal, queryPilotAdmissions, recordedAt });
  const graph = semanticId(snapshot);
  await recordWitnessJournalBatch({ agentUrl: options.witnessJournalAgentUrl, ...(witnessJournal ?? {}), batch: { settlement: TTI_ACCOUNT, graph, recordedAt, document: snapshot, assertions: [
    { subject: TTI_ACTOR, predicate: "urn:emsenn:venture:locality-knowledge-discovery-snapshot", object: { kind: "iri", value: graph } },
    { subject: graph, predicate: "urn:emsenn:venture:qualified-interest-actors", object: { kind: "literal", value: String(snapshot.distinctQualifiedInterestActors), datatype: "http://www.w3.org/2001/XMLSchema#integer" } },
  ] } });
  return { ...snapshot, channelId: location.channelId, receiptId: graph };
}

async function resolveMessage(options, product) {
  if (options.channelId && options.messageId) {
    const message = await api(options.token, `/channels/${options.channelId}/messages/${options.messageId}`);
    return String(message.content ?? "").includes(product.territory.offerMarker) ? { channelId: options.channelId, messageId: options.messageId } : { type: "TTILocalityDiscoveryObservationRefusal", reason: "configured-message-marker-mismatch" };
  }
  const channels = await api(options.token, `/guilds/${options.guildId}/channels`), channel = channels.find((row) => row.type === 0 && row.name.toLowerCase() === product.territory.discoveryChannel.toLowerCase());
  if (!channel) return { type: "TTILocalityDiscoveryObservationRefusal", reason: "declared-discovery-channel-absent" };
  const messages = await api(options.token, `/channels/${channel.id}/messages?limit=50`), message = messages.find((row) => String(row.content ?? "").includes(product.territory.offerMarker));
  return message ? { channelId: channel.id, messageId: message.id } : { type: "TTILocalityDiscoveryObservationRefusal", reason: "locality-discovery-message-absent" };
}

async function reactionUsers(token, channelId, messageId, emoji) {
  const users = []; let after;
  do {
    const page = await api(token, `/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}?limit=100${after ? `&after=${after}` : ""}`);
    users.push(...page); after = page.length === 100 ? page.at(-1)?.id : undefined;
    if (page.length < 100) break;
  } while (after);
  return users;
}

async function api(token, route) {
  const response = await fetch(`${API}${route}`, { headers: { authorization: `Bot ${token}`, "user-agent": "@red-cup-engineering/turntide-islands locality discovery observer" } });
  if (response.status === 429) { const retry = await response.json().catch(() => ({ retry_after: 1 })); await new Promise((done) => setTimeout(done, Math.ceil((retry.retry_after ?? 1) * 1000))); return api(token, route); }
  const text = await response.text(); if (!response.ok) throw new Error(`Discord GET ${route} -> ${response.status}: ${text.slice(0, 400)}`); return text ? JSON.parse(text) : null;
}
function arg(name) { const at = process.argv.indexOf(name); return at < 0 ? undefined : process.argv[at + 1]; }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await observeLocalityKnowledgeDiscovery({ token: process.env.DISCORD_BOT_TOKEN ?? process.env.DISCORD_TOKEN, guildId: process.env.DISCORD_GUILD_ID, witnessJournalAgentUrl: process.env.WITNESS_JOURNAL_RDF_AGENT, channelId: arg("--channel-id"), messageId: arg("--message-id") });
  const output = result.type === "TTILocalityKnowledgeDiscoverySnapshot" ? { type: result.type, recordedAt: result.recordedAt, productId: result.productId, offerMessageId: result.offerMessageId, signalCounts: result.signalCounts, distinctQualifiedInterestActors: result.distinctQualifiedInterestActors, noChargeQueryPilotActors: result.noChargeQueryPilotActors, freeChatAnswerInterestActors: result.freeChatAnswerInterestActors, persistentVaultInterestActors: result.persistentVaultInterestActors, meteredPowerUserInterestActors: result.meteredPowerUserInterestActors, buyerQueriesAdmitted: result.buyerQueriesAdmitted, externalRevenueReceiptCount: result.externalRevenueReceiptCount, profitMicros: result.profitMicros, inference: result.inference, receiptId: result.receiptId } : result;
  process.stdout.write(`${JSON.stringify(output)}\n`); if (result.type.endsWith("Refusal")) process.exitCode = 2;
}
