#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EMPTY_WITNESS_ROOT, identifyJsonSemanticContent } from "@red-cup-engineering/semantic-content-identify-service";
const semanticId = (value) => identifyJsonSemanticContent({ objectKind: "turntide-islands.record", value, witnessRoot: EMPTY_WITNESS_ROOT }).token;
import { recordWitnessJournalBatch } from "@red-cup-engineering/witness-journal-document-service";
import { turntideWitnessJournalBindingFromEnvironment } from "./settlement-witness-journal-binding.mjs";

const TTI_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const PRODUCT_PATH = join(TTI_ROOT, "content/products/founding-knowledge-vault.json");
const TTI_ACCOUNT = "eip155:31337:0xcfe1b9960ddbbe2b95e48114c281d7f24eb87b4d";
const TTI_ACTOR = "urn:ame:turntide-islands";
const API = "https://discord.com/api/v10";

export function knowledgeVaultMarketSnapshot({ product, offerMessage, usersBySignal, checkoutIntents = [], recordedAt }) {
  const reactionActors = new Set();
  const counts = {};
  for (const [emoji, signal] of Object.entries(product.conversion.signals)) {
    const userIds = [...new Set(usersBySignal[emoji] ?? [])].sort(); counts[signal] = userIds.length;
    for (const discordUserId of userIds) reactionActors.add(discordUserId);
  }
  const admittedIntents = checkoutIntents.filter((intent) => intent?.type === "TTIVaultCheckoutIntent" && intent.status === "qualified-no-charge" && intent.productId === product.id && typeof intent.discordUserId === "string");
  const checkoutActors = new Set(admittedIntents.map((intent) => intent.discordUserId));
  const qualifiedActors = new Set([...reactionActors, ...checkoutActors]);
  const body = { type: "TTIKnowledgeVaultMarketSnapshot", version: 2, recordedAt, venture: TTI_ACTOR, productId: product.id, offerMessageId: offerMessage.id, candidatePrice: { currency: product.offer.currency, unitAmount: product.offer.candidateUnitAmount, billingPeriod: product.offer.billingPeriod }, signalCounts: counts, reactionQualifiedInterestActors: reactionActors.size, qualifiedCheckoutIntentCount: admittedIntents.length, distinctQualifiedCheckoutIntentActors: checkoutActors.size, qualifiedInterestActors: qualifiedActors.size, identityProjection: "aggregate-only-no-discord-user-identifiers", settledEntitlements: 0, externalRevenueReceiptCount: 0, checkoutStatus: product.commercial.paymentStatus, inference: checkoutActors.size ? "observed-qualified-checkout-intent-not-revenue" : qualifiedActors.size ? "observed-qualified-interest-not-revenue" : "no-qualified-interest-observed-yet" };
  return { ...body, id: semanticId(body) };
}

async function api(token, route) {
  const response = await fetch(`${API}${route}`, { headers: { authorization: `Bot ${token}`, "user-agent": "@red-cup-engineering/turntide-islands venture market observer" } });
  if (response.status === 429) { const retry = await response.json().catch(() => ({ retry_after: 1 })); await new Promise((done) => setTimeout(done, Math.ceil((retry.retry_after ?? 1) * 1000))); return api(token, route); }
  const text = await response.text(); if (!response.ok) throw new Error(`Discord GET ${route} -> ${response.status}: ${text.slice(0, 400)}`); return text ? JSON.parse(text) : null;
}

export async function observeKnowledgeVaultMarket(options = {}) {
  const product = options.product ?? JSON.parse(await readFile(options.productPath ?? PRODUCT_PATH, "utf8"));
  if (!options.token || !options.guildId || !options.witnessJournalAgentUrl) throw new Error("vault market observation requires Discord, guild, and contracted witness-journal RDF provider");
  const channels = await api(options.token, `/guilds/${options.guildId}/channels`); const channel = channels.find((row) => row.type === 0 && row.name.toLowerCase() === product.territory.publicChannel.toLowerCase());
  if (!channel) return { type: "TTIKnowledgeVaultMarketRefusal", reason: "public-offer-channel-absent" };
  const messages = await api(options.token, `/channels/${channel.id}/messages?limit=50`); const offerMessage = messages.find((row) => String(row.content ?? "").includes(product.conversion.offerMarker));
  if (!offerMessage) return { type: "TTIKnowledgeVaultMarketRefusal", reason: "founding-offer-message-absent" };
  const usersBySignal = {};
  for (const emoji of Object.keys(product.conversion.signals)) {
    const users = await api(options.token, `/channels/${channel.id}/messages/${offerMessage.id}/reactions/${encodeURIComponent(emoji)}?limit=100`);
    usersBySignal[emoji] = users.filter((user) => user.bot !== true).map((user) => user.id);
  }
  const intentsPath = options.intentsPath ?? join(options.dataRoot ?? join(TTI_ROOT, "data"), "vault-checkout", "qualified-intents.jsonl");
  const checkoutIntents = options.checkoutIntents ?? await readJsonLines(intentsPath);
  const recordedAt = options.recordedAt ?? new Date().toISOString(); const snapshot = knowledgeVaultMarketSnapshot({ product, offerMessage, usersBySignal, checkoutIntents, recordedAt });
  const graph = semanticId(snapshot);
  const witnessJournal = options.witnessJournal ?? turntideWitnessJournalBindingFromEnvironment();
  await recordWitnessJournalBatch({ agentUrl: options.witnessJournalAgentUrl, ...(witnessJournal ?? {}), batch: { settlement: TTI_ACCOUNT, graph, recordedAt, document: snapshot, assertions: [
    { subject: TTI_ACTOR, predicate: "urn:emsenn:venture:knowledge-vault-market-snapshot", object: { kind: "iri", value: graph } },
    { subject: graph, predicate: "urn:emsenn:venture:qualified-interest-actors", object: { kind: "literal", value: String(snapshot.qualifiedInterestActors), datatype: "http://www.w3.org/2001/XMLSchema#integer" } },
  ] } });
  return { ...snapshot, receiptId: graph };
}

async function readJsonLines(file) { const source = await readFile(file, "utf8").catch((error) => error.code === "ENOENT" ? "" : Promise.reject(error)); return source.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line)); }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await observeKnowledgeVaultMarket({ token: process.env.DISCORD_BOT_TOKEN ?? process.env.DISCORD_TOKEN, guildId: process.env.DISCORD_GUILD_ID, witnessJournalAgentUrl: process.env.WITNESS_JOURNAL_RDF_AGENT });
  const output = result.type === "TTIKnowledgeVaultMarketSnapshot" ? { type: result.type, recordedAt: result.recordedAt, productId: result.productId, offerMessageId: result.offerMessageId, signalCounts: result.signalCounts, qualifiedInterestActors: result.qualifiedInterestActors, settledEntitlements: result.settledEntitlements, externalRevenueReceiptCount: result.externalRevenueReceiptCount, checkoutStatus: result.checkoutStatus, receiptId: result.receiptId } : result;
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`); if (result.type.endsWith("Refusal")) process.exitCode = 2;
}
