#!/usr/bin/env node

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EMPTY_WITNESS_ROOT, identifyJsonSemanticContent } from "@red-cup-engineering/semantic-content-identify-service";
const semanticId = (value) => identifyJsonSemanticContent({ objectKind: "turntide-islands.record", value, witnessRoot: EMPTY_WITNESS_ROOT }).token;
import { createSettlementStore } from "@red-cup-engineering/settlement-record-store-service";
import { turntideWitnessJournalBindingFromEnvironment } from "./settlement-witness-journal-binding.mjs";

const TTI_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const READY_CATEGORY = "tti-discord-interaction-gateway-ready-v1";
const TRANSITION_CATEGORY = "tti-discord-interaction-delivery-transition-v1";
const MAX_READY_AGE_MS = 10 * 60 * 1000;
const API = "https://discord.com/api/v10";

export async function activateDiscordGatewayInteractions(options = {}) {
  if (!options.token || !options.guildId || !options.witnessJournalAgentUrl) throw new Error("Discord gateway activation requires bot token, guild, and TTI WitnessJournal provider");
  const recordedAt = options.recordedAt ?? new Date().toISOString(), now = Date.parse(recordedAt);
  const witnessJournal = options.witnessJournal ?? turntideWitnessJournalBindingFromEnvironment();
  const store = options.store ?? createSettlementStore({ settlementRoot: options.ttiRoot ?? TTI_ROOT, agentUrl: options.witnessJournalAgentUrl, ...(witnessJournal ?? {}) });
  const application = await discord(options.fetch ?? fetch, options.token, "GET", "/oauth2/applications/@me");
  const ready = store.records(READY_CATEGORY).filter((row) => row?.type === "TTIDiscordInteractionGatewayReady" && row.status === "ready" && row.applicationId === application.id && row.guildId === options.guildId && row.intents === 0 && row.publicIngressRequired === false && row.interactionTokensRecorded === false).sort((left, right) => String(right.recordedAt).localeCompare(String(left.recordedAt)))[0];
  if (!ready || !Number.isFinite(Date.parse(ready.recordedAt)) || now - Date.parse(ready.recordedAt) < 0 || now - Date.parse(ready.recordedAt) > MAX_READY_AGE_MS || !selfAddressed(ready)) throw new Error("no current self-addressed TTI Discord Gateway READY receipt");
  const intentBody = { type: "TTIDiscordInteractionDeliveryTransitionIntent", version: 1, status: "authorized-pending-discord-application-update", recordedAt, applicationId: application.id, guildId: options.guildId, from: application.interactions_endpoint_url ?? null, to: "discord-interaction-create-gateway-event-with-http-callback", gatewayReadyReceiptId: ready.id, intents: 0, publicIngressRequired: false };
  const intent = withId(intentBody);
  if (options.live !== true) return { type: "TTIDiscordInteractionDeliveryTransitionPlan", intent, externalEffects: [] };
  await store.record({ category: TRANSITION_CATEGORY, recordedAt, record: intent, assertions: [{ subject: "urn:ame:turntide-islands", predicate: "urn:emsenn:discord:authorized-interaction-delivery-transition", object: { kind: "iri", value: intent.id } }] });
  let updated = application;
  if (application.interactions_endpoint_url !== null && application.interactions_endpoint_url !== undefined && application.interactions_endpoint_url !== "") updated = await discord(options.fetch ?? fetch, options.token, "PATCH", "/applications/@me", { interactions_endpoint_url: null });
  if (updated.interactions_endpoint_url !== null && updated.interactions_endpoint_url !== undefined && updated.interactions_endpoint_url !== "") throw new Error("Discord did not clear the outgoing interactions endpoint");
  const verified = await discord(options.fetch ?? fetch, options.token, "GET", "/oauth2/applications/@me");
  if (verified.interactions_endpoint_url !== null && verified.interactions_endpoint_url !== undefined && verified.interactions_endpoint_url !== "") throw new Error("Discord application still advertises outgoing-webhook interaction delivery");
  const receiptBody = { type: "TTIDiscordInteractionDeliveryTransitionReceipt", version: 1, status: "gateway-delivery-active", recordedAt, applicationId: application.id, guildId: options.guildId, priorInteractionsEndpointUrl: application.interactions_endpoint_url ?? null, interactionsEndpointUrl: null, deliveryMode: "discord-interaction-create-gateway-event-with-http-callback", gatewayReadyReceiptId: ready.id, intentReceiptId: intent.id, publicIngressRequired: false, interactionTokenRetention: "transient-callback-only-not-recorded", externalRevenueReceiptCount: 0, profitMicros: null };
  const receipt = withId(receiptBody);
  await store.record({ category: TRANSITION_CATEGORY, recordedAt, record: receipt, assertions: [{ subject: "urn:ame:turntide-islands", predicate: "urn:emsenn:discord:activated-interaction-gateway-delivery", object: { kind: "iri", value: receipt.id } }] });
  return { ...receipt, receiptId: receipt.id };
}

async function discord(fetchImpl, token, method, route, body) {
  const response = await fetchImpl(`${API}${route}`, { method, headers: { authorization: `Bot ${token}`, "content-type": "application/json", "user-agent": "@red-cup-engineering/turntide-islands gateway activation (https://561.group)" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text(); if (!response.ok) throw new Error(`Discord ${method} ${route} -> ${response.status}: ${text.slice(0, 400)}`); return text ? JSON.parse(text) : {};
}
function withId(body) { return Object.freeze({ ...body, id: semanticId(body) }); }
function selfAddressed(value) { if (value === null || typeof value !== "object" || Array.isArray(value) || typeof value.id !== "string") return false; const { id, ...body } = value; return id === semanticId(body); }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await activateDiscordGatewayInteractions({ live: process.argv.includes("--live"), token: process.env.DISCORD_BOT_TOKEN ?? process.env.DISCORD_TOKEN, guildId: process.env.DISCORD_GUILD_ID, witnessJournalAgentUrl: process.env.WITNESS_JOURNAL_RDF_AGENT });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
