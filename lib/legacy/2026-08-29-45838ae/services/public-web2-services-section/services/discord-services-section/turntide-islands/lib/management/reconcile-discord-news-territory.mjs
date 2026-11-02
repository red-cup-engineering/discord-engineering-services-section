#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { EMPTY_WITNESS_ROOT, identifyJsonSemanticContent } from "@red-cup-engineering/semantic-content-identify-service";
const semanticId = (value) => identifyJsonSemanticContent({ objectKind: "turntide-islands.record", value, witnessRoot: EMPTY_WITNESS_ROOT }).token;
import { recordWitnessJournalBatch } from "@red-cup-engineering/witness-journal-document-service";
import { turntideWitnessJournalBindingFromEnvironment } from "./settlement-witness-journal-binding.mjs";

const TTI_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SERVICES_ROOT = resolve(TTI_ROOT, "../../../../..");
const DEFAULT_SPEC = join(TTI_ROOT, "content", "configurations", "discord-news-territory.json");
const PLANNER = join(SERVICES_ROOT, "board-of-directors", "services", "executive-office", "services", "discord-colonization-services-sector", "services", "discord-territory-planning-service", "src", "plan-news-territory.mjs");
const API = "https://discord.com/api/v10";
const TTI_ACCOUNT = "eip155:31337:0xcfe1b9960ddbbe2b95e48114c281d7f24eb87b4d";
const VIEW = 1n << 10n; const SEND = 1n << 11n; const HISTORY = 1n << 16n;

async function discordRequest(token, method, route, body) {
  const response = await fetch(`${API}${route}`, { method, headers: { authorization: `Bot ${token}`, "content-type": "application/json", "user-agent": "@red-cup-engineering/turntide-islands boundary executor (https://561.group)" }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (response.status === 429) { const retry = await response.json().catch(() => ({ retry_after: 1 })); await new Promise((done) => setTimeout(done, Math.ceil((retry.retry_after ?? 1) * 1000))); return discordRequest(token, method, route, body); }
  const text = await response.text(); if (!response.ok) throw new Error(`Discord ${method} ${route} -> ${response.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

function overwrites(guildId, audience, roleId, botId) {
  const publicBits = (VIEW | HISTORY).toString(); const noSend = SEND.toString(); const privateDeny = (VIEW | SEND).toString();
  const rows = audience.kind === "everyone"
    ? [{ id: guildId, type: 0, allow: publicBits, deny: noSend }]
    : [{ id: guildId, type: 0, allow: "0", deny: privateDeny }, { id: roleId, type: 0, allow: publicBits, deny: noSend }];
  rows.push({ id: botId, type: 1, allow: (VIEW | SEND | HISTORY).toString(), deny: "0" }); return rows;
}

export async function reconcileDiscordNewsTerritory({ specification, token, dryRun = false } = {}) {
  if (!token) throw new Error("TTI's local Discord boundary executor requires DISCORD_BOT_TOKEN");
  const { planDiscordNewsTerritory } = await import(pathToFileURL(PLANNER)); const plan = planDiscordNewsTerritory(specification);
  if (dryRun) return { type: "TTIDiscordNewsTerritoryDryRun", plan, effects: [] };
  const [bot, initialChannels, initialRoles] = await Promise.all([
    discordRequest(token, "GET", "/users/@me"), discordRequest(token, "GET", `/guilds/${plan.guildId}/channels`), discordRequest(token, "GET", `/guilds/${plan.guildId}/roles`),
  ]);
  const channels = [...initialChannels]; const roles = [...initialRoles]; const resolvedRoles = new Map(); const resolvedCategories = new Map(); const effects = [];
  for (const operation of plan.operations) {
    if (operation.kind === "ensure-role") {
      let role = roles.find((candidate) => candidate.name.toLowerCase() === operation.role.toLowerCase());
      if (!role) { role = await discordRequest(token, "POST", `/guilds/${plan.guildId}/roles`, { name: operation.role, mentionable: false }); roles.push(role); effects.push({ kind: "created-role", id: role.id, name: role.name }); }
      resolvedRoles.set(operation.role, role.id); continue;
    }
    if (operation.kind === "ensure-member-role") {
      const roleId = resolvedRoles.get(operation.role) ?? roles.find((candidate) => candidate.name.toLowerCase() === operation.role.toLowerCase())?.id;
      if (!roleId) throw new Error(`planned role ${operation.role} was not resolved`);
      const member = await discordRequest(token, "GET", `/guilds/${plan.guildId}/members/${operation.memberId}`);
      if (!member.roles.includes(roleId)) { await discordRequest(token, "PUT", `/guilds/${plan.guildId}/members/${operation.memberId}/roles/${roleId}`); effects.push({ kind: "assigned-role", memberId: operation.memberId, roleId }); }
      continue;
    }
    if (operation.kind === "ensure-category") {
      const conflicting = channels.find((candidate) => candidate.name.toLowerCase() === operation.category.toLowerCase());
      if (conflicting && conflicting.type !== 4) throw new Error(`${operation.category} exists but is not a category`);
      const roleId = operation.audience.kind === "admitted-role" ? resolvedRoles.get(operation.audience.role) : undefined;
      const permission_overwrites = overwrites(plan.guildId, operation.audience, roleId, bot.id);
      let category = conflicting;
      if (!category) { category = await discordRequest(token, "POST", `/guilds/${plan.guildId}/channels`, { name: operation.category, type: 4, permission_overwrites }); channels.push(category); effects.push({ kind: "created-category", id: category.id, name: category.name }); }
      else { category = await discordRequest(token, "PATCH", `/channels/${category.id}`, { permission_overwrites }); effects.push({ kind: "reconciled-category", id: category.id, name: category.name }); }
      resolvedCategories.set(operation.category, category.id); continue;
    }
    if (operation.kind === "ensure-text-channel") {
      const conflicting = channels.find((candidate) => candidate.name.toLowerCase() === operation.channel.toLowerCase());
      if (conflicting && conflicting.type !== 0) throw new Error(`${operation.channel} exists but is not a text channel`);
      const parent_id = resolvedCategories.get(operation.category); if (!parent_id) throw new Error(`planned category ${operation.category} was not resolved`);
      const roleId = operation.audience.kind === "admitted-role" ? resolvedRoles.get(operation.audience.role) : undefined;
      const body = { name: operation.channel, type: 0, parent_id, topic: operation.topic, permission_overwrites: overwrites(plan.guildId, operation.audience, roleId, bot.id) };
      let channel = conflicting;
      if (!channel) { channel = await discordRequest(token, "POST", `/guilds/${plan.guildId}/channels`, body); channels.push(channel); effects.push({ kind: "created-channel", id: channel.id, name: channel.name, parentId: parent_id }); }
      else { channel = await discordRequest(token, "PATCH", `/channels/${channel.id}`, body); effects.push({ kind: "reconciled-channel", id: channel.id, name: channel.name, parentId: parent_id }); }
    }
  }
  const laneBindings = specification.lanes.map((lane) => ({ edition: lane.edition, category: lane.category, categoryId: resolvedCategories.get(lane.category), channel: lane.channel, channelId: channels.find((candidate) => candidate.name.toLowerCase() === lane.channel.toLowerCase())?.id, audience: lane.audience.kind }));
  return { type: "TTIDiscordNewsTerritoryReceipt", status: "reconciled", guildId: plan.guildId, planDigest: plan.planDigest, recordedAt: new Date().toISOString(), laneBindings, effects };
}

export async function persistTerritoryReceipt(receipt, witnessJournalAgentUrl, witnessJournal = turntideWitnessJournalBindingFromEnvironment()) {
  if (!witnessJournalAgentUrl) throw new Error("live Discord territory reconciliation requires the contracted WITNESS_JOURNAL_RDF_AGENT");
  const graph = semanticId(receipt);
  await recordWitnessJournalBatch({ agentUrl: witnessJournalAgentUrl, ...(witnessJournal ?? {}), batch: { settlement: TTI_ACCOUNT, graph, recordedAt: receipt.recordedAt, document: receipt, assertions: [
    { subject: "urn:ame:turntide-islands", predicate: "urn:emsenn:discord:reconciled-territory", object: { kind: "iri", value: graph } },
    { subject: graph, predicate: "urn:emsenn:contract:provider", object: { kind: "iri", value: "urn:ame:discord-territory-planning-service" } },
  ] } });
  return { ...receipt, receiptId: graph };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const specification = JSON.parse(await readFile(process.env.TTI_DISCORD_NEWS_TERRITORY ?? DEFAULT_SPEC, "utf8"));
  const live = process.argv.includes("--live"); let receipt = await reconcileDiscordNewsTerritory({ specification, token: process.env.DISCORD_BOT_TOKEN ?? process.env.DISCORD_TOKEN, dryRun: !live });
  if (live) receipt = await persistTerritoryReceipt(receipt, process.env.WITNESS_JOURNAL_RDF_AGENT);
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}
