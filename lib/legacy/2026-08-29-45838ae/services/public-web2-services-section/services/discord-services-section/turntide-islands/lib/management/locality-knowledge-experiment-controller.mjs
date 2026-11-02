#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EMPTY_WITNESS_ROOT, identifyJsonSemanticContent } from "@red-cup-engineering/semantic-content-identify-service";
const semanticId = (value) => identifyJsonSemanticContent({ objectKind: "turntide-islands.record", value, witnessRoot: EMPTY_WITNESS_ROOT }).token;
import { recordWitnessJournalBatch } from "@red-cup-engineering/witness-journal-document-service";
import { turntideWitnessJournalBindingFromEnvironment } from "./settlement-witness-journal-binding.mjs";
import { observeLocalityKnowledgeDiscovery } from "./observe-locality-knowledge-discovery.mjs";

const TTI_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const PRODUCT_PATH = join(TTI_ROOT, "content/products/locality-knowledge-answer.json");
const TTI_ACCOUNT = "eip155:31337:0xcfe1b9960ddbbe2b95e48114c281d7f24eb87b4d";
const TTI_ACTOR = "urn:ame:turntide-islands";
const API = "https://discord.com/api/v10";
const EXPERIMENT_DURATION_MS = 14 * 24 * 60 * 60 * 1000;
const REMINDER_DELAY_MS = 48 * 60 * 60 * 1000;
export const LOCALITY_EXPERIMENT_REMINDER_MARKER = "TTI-LOCALITY-ANSWER-2026-01-REMINDER-01";

export function localityExperimentDecision({ product, snapshot, recordedAt, reminderObserved = false }) {
  const reasons = [];
  if (product?.nextExperiment?.id !== "EXP-KM-LOCALITY-002" || product?.nextExperiment?.status !== "live-observing") reasons.push("locality-experiment-not-live");
  if (snapshot?.type !== "TTILocalityKnowledgeDiscoverySnapshot" || snapshot?.productId !== product?.id || snapshot?.offerMessageId === undefined) reasons.push("matching-aggregate-snapshot-absent");
  const now = Date.parse(recordedAt), decisionAt = Date.parse(product?.nextExperiment?.decisionAt), launchedAt = decisionAt - EXPERIMENT_DURATION_MS;
  if (!Number.isFinite(now) || !Number.isFinite(decisionAt) || launchedAt >= decisionAt) reasons.push("experiment-window-invalid");
  if (reasons.length > 0) return Object.freeze({ type: "TTILocalityExperimentControlRefusal", reasons });
  const downstreamInterestActors = Math.max(snapshot.persistentVaultInterestActors ?? 0, snapshot.meteredPowerUserInterestActors ?? 0);
  const passed = snapshot.distinctQualifiedInterestActors >= 3 && snapshot.noChargeQueryPilotActors >= 1 && downstreamInterestActors >= 1;
  let state, action;
  if (passed) { state = now < decisionAt ? "passed-early" : "passed-at-decision"; action = "pilot-one-rights-compatible-free-answer-and-measure-cost"; }
  else if (now >= decisionAt) { state = "failed-at-decision"; action = "interview-participants-before-product-change"; }
  else if (now < launchedAt + REMINDER_DELAY_MS) { state = "observing-before-reminder-window"; action = "hold"; }
  else if (!reminderObserved) { state = "observing-reminder-due"; action = "post-one-public-reminder"; }
  else { state = "observing-after-reminder"; action = "hold"; }
  return Object.freeze({
    type: "TTILocalityExperimentControlDecision", version: 1, experimentId: product.nextExperiment.id, productId: product.id, recordedAt, decisionAt: product.nextExperiment.decisionAt,
    snapshotReceiptId: snapshot.receiptId ?? null,
    state, action, passThresholdsMet: passed, reminderObserved, signalCounts: { distinctQualifiedInterestActors: snapshot.distinctQualifiedInterestActors, noChargeQueryPilotActors: snapshot.noChargeQueryPilotActors, freeChatAnswerInterestActors: snapshot.freeChatAnswerInterestActors, persistentVaultInterestActors: snapshot.persistentVaultInterestActors, meteredPowerUserInterestActors: snapshot.meteredPowerUserInterestActors, downstreamInterestActors },
    buyerQueriesAdmitted: snapshot.buyerQueriesAdmitted, externalRevenueReceiptCount: snapshot.externalRevenueReceiptCount, recognizedRevenueMicros: snapshot.recognizedRevenueMicros, profitMicros: snapshot.profitMicros,
    identityProjection: "aggregate-only-no-discord-user-identifiers", unsolicitedDirectMessages: false, economicEffect: "none",
  });
}

export function localityExperimentReminderMessage(product) {
  return [
    "**Quick reminder: TTI’s locality-answer buyer test is still open.**",
    "",
    "Would a source-traceable answer about gardening or another practical activity in a named town be useful to your Union work? The original post tests free chat answers, persistent Knowledge Vault browsing, metered MCP/A2A power-user access, and a no-charge query-pilot option. The old $10 one-answer guess has been retired.",
    "",
    "You can now deliberately submit the no-charge pilot with `/locality-pilot`; the command explains and requires its permanent non-personal query-record consent. TTI currently promises no answer because live resale inventory is not yet admitted.",
    "",
    "No charge is being taken. A reaction is interest only; it is not a query, purchase, contribution, license, payment, or permission to use message content.",
    "",
    `Original marker: ${product.territory.offerMarker}`,
    `Reminder marker: ${LOCALITY_EXPERIMENT_REMINDER_MARKER}`,
  ].join("\n");
}

export async function runLocalityKnowledgeExperiment(options = {}) {
  const product = options.product ?? JSON.parse(await readFile(options.productPath ?? PRODUCT_PATH, "utf8"));
  const recordedAt = options.recordedAt ?? new Date().toISOString();
  const snapshot = options.snapshot ?? await observeLocalityKnowledgeDiscovery({ ...options, product, recordedAt });
  if (snapshot.type !== "TTILocalityKnowledgeDiscoverySnapshot") return snapshot;
  const reminderObserved = options.reminderObserved ?? await botReminderExists(options.token, options.channelId ?? snapshot.channelId, options.messageId ?? snapshot.offerMessageId);
  const decision = localityExperimentDecision({ product, snapshot, recordedAt, reminderObserved });
  if (decision.type.endsWith("Refusal") || decision.action !== "post-one-public-reminder" || options.live !== true) return { ...decision, reminderPublished: false, externalEffects: [] };
  if (!options.token || !options.witnessJournalAgentUrl) throw new Error("live locality experiment control requires Discord token and contracted witness-journal RDF provider");
  const channelId = options.channelId ?? snapshot.channelId, messageId = options.messageId ?? snapshot.offerMessageId;
  const intent = { ...decision, type: "TTILocalityExperimentReminderIntent", status: "authorized-pending-publication", channelId, offerMessageId: messageId, marker: LOCALITY_EXPERIMENT_REMINDER_MARKER };
  const intentReceiptId = await witness(options, intent, recordedAt, "urn:emsenn:venture:authorized-locality-experiment-reminder");
  const message = await api(options.token, "POST", `/channels/${channelId}/messages`, { content: localityExperimentReminderMessage(product), message_reference: { message_id: messageId, channel_id: channelId }, allowed_mentions: { parse: [], replied_user: false } });
  const receipt = { type: "TTILocalityExperimentReminderReceipt", version: 1, status: "published", recordedAt, experimentId: decision.experimentId, productId: product.id, channelId, offerMessageId: messageId, reminderMessageId: message.id, marker: LOCALITY_EXPERIMENT_REMINDER_MARKER, intentReceiptId, unsolicitedDirectMessages: false, identityProjection: "none", economicEffect: "none" };
  return { ...decision, reminderPublished: true, reminderMessageId: message.id, intentReceiptId, receiptId: await witness(options, receipt, recordedAt, "urn:emsenn:venture:published-locality-experiment-reminder") };
}

async function botReminderExists(token, channelId, offerMessageId) {
  if (!token || !channelId || !offerMessageId) throw new Error("locality experiment reminder scan requires token and exact message pointers");
  const bot = await api(token, "GET", "/users/@me");
  let before;
  for (let pageNumber = 0; pageNumber < 50; pageNumber += 1) {
    const page = await api(token, "GET", `/channels/${channelId}/messages?limit=100${before ? `&before=${before}` : ""}`);
    if (page.some((message) => message.author?.id === bot.id && String(message.content ?? "").includes(LOCALITY_EXPERIMENT_REMINDER_MARKER))) return true;
    if (page.some((message) => message.id === offerMessageId) || page.length < 100) return false;
    before = page.at(-1)?.id;
  }
  throw new Error("locality experiment reminder scan exceeded bounded post-launch history");
}

async function witness(options, record, recordedAt, predicate) {
  const graph = semanticId(record);
  const witnessJournal = options.witnessJournal ?? turntideWitnessJournalBindingFromEnvironment();
  await recordWitnessJournalBatch({ agentUrl: options.witnessJournalAgentUrl, ...(witnessJournal ?? {}), batch: { settlement: TTI_ACCOUNT, graph, recordedAt, document: record, assertions: [{ subject: TTI_ACTOR, predicate, object: { kind: "iri", value: graph } }] } });
  return graph;
}
async function api(token, method, route, body) {
  const response = await fetch(`${API}${route}`, { method, headers: { authorization: `Bot ${token}`, "content-type": "application/json", "user-agent": "@red-cup-engineering/turntide-islands locality experiment controller" }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (response.status === 429) { const retry = await response.json().catch(() => ({ retry_after: 1 })); await new Promise((done) => setTimeout(done, Math.ceil((retry.retry_after ?? 1) * 1000))); return api(token, method, route, body); }
  const text = await response.text(); if (!response.ok) throw new Error(`Discord ${method} ${route} -> ${response.status}: ${text.slice(0, 400)}`); return text ? JSON.parse(text) : null;
}
function arg(name) { const at = process.argv.indexOf(name); return at < 0 ? undefined : process.argv[at + 1]; }
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await runLocalityKnowledgeExperiment({ live: process.argv.includes("--live"), token: process.env.DISCORD_BOT_TOKEN ?? process.env.DISCORD_TOKEN, guildId: process.env.DISCORD_GUILD_ID, witnessJournalAgentUrl: process.env.WITNESS_JOURNAL_RDF_AGENT, channelId: arg("--channel-id"), messageId: arg("--message-id") });
  process.stdout.write(`${JSON.stringify(result)}\n`); if (result.type.endsWith("Refusal")) process.exitCode = 2;
}
