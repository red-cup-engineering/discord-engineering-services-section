#!/usr/bin/env node
import process from "node:process";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appendLog, dataMountRoot, readLog } from "@red-cup-engineering/organizing-with-agents/mount";
import { availableEndpoints, defaultModelFor, openaiAgentInfer } from "@red-cup-engineering/organizing-with-openai-agents";
import {
  botTokenProjection,
  countDurableExports,
  discordRestTransport,
  inMemoryGuild,
  localMembershipService,
  readMembershipEntitlements,
  recordMeasurement,
  reconcileMembershipEntitlements,
  recordMembershipEntitlement,
  resolveGuildByName,
  resolveMembershipProgramEnv,
  runDiscordOrganizer,
  tendOnMessage,
  witnessServer,

  unresolvedMembershipEnvReferences,
} from "@red-cup-engineering/organizing-with-discord";
import { inviteUrl, permissionsFor, runSteward } from "@emsenn/app-discord-steward";
import {
  autonomousCultivationGoal,
  bootstrapChannels,
  bootstrapCommands,
  communityName,
  guildId,
  grantedCapabilities,
  membershipGate,
  paidMembership,
  stewardSystem,
} from "./index.mjs";
import { reconcileStoredMemberships } from "./serve.mjs";

const siteRoot = path.resolve(fileURLToPath(import.meta.url), "../..");
const repoRoot = path.resolve(siteRoot, "../..");
loadDotEnv(path.join(siteRoot, ".env"));
loadDotEnv(path.join(repoRoot, ".envrc"));

function membershipEntitlementsFile() {
  return env("TTI_MEMBERSHIP_ENTITLEMENTS_FILE")
    ?? path.join(siteRoot, "data", "membership", "entitlements.json");
}

function usage(code) {
  process.stderr.write(
    "usage:\n" +
    "  pnpm steward:check\n" +
    "  pnpm steward:discover-env\n" +
    "  pnpm steward:live-permissions\n" +
    "  pnpm steward:measure\n" +
    "  pnpm steward:ingest-history\n" +
    "  pnpm steward:ingest-history:smoke\n" +
    "  pnpm steward:invite\n" +
    "  pnpm steward:bootstrap\n" +
    "  pnpm steward:bootstrap:smoke\n" +
    "  pnpm steward:preflight\n" +
    "  pnpm steward:probe\n" +
    "  pnpm steward:smoke\n" +
    "  pnpm steward:context:smoke\n" +
    "  pnpm steward:gateway:smoke\n" +
    "  pnpm steward:supervision:smoke\n" +
    "  pnpm steward:archipelago:smoke\n" +
    "  pnpm steward:membership:reconcile\n" +
    "  pnpm steward:membership:reconcile:smoke\n" +
    "  pnpm steward:membership:service:smoke\n" +
    "  pnpm steward:cultivate\n" +
    "  pnpm steward:cultivate:smoke\n" +
    "  pnpm steward:run\n",
  );
  process.exit(code);
}

function env(name) {
  const value = process.env[name];
  return value === undefined || value.length === 0 ? undefined : value;
}

function stringField(record, name) {
  const value = record[name];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function stringArrayField(record, name) {
  const value = record[name];
  return Array.isArray(value) ? value.filter((entry) => typeof entry === "string") : [];
}

function numberEnv(name, fallback) {
  const value = Number(env(name));
  return Number.isFinite(value) ? value : fallback;
}

function optionalNumberEnv(name) {
  const raw = env(name);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a nonnegative number`);
  return value;
}

function integerEnv(name, fallback) {
  const value = Number(env(name));
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function gateEnv(name, fallback) {
  const value = env(name);
  return value === "enforce" || value === "advise" || value === "off" ? value : fallback;
}

function processEnv() {
  return process.env;
}

function costRates() {
  const input = optionalNumberEnv("TTI_COST_DOLLARS_PER_MILLION_INPUT_TOKENS");
  const output = optionalNumberEnv("TTI_COST_DOLLARS_PER_MILLION_OUTPUT_TOKENS");
  const charsPerToken = optionalNumberEnv("TTI_COST_CHARS_PER_TOKEN");
  if (input === undefined && output === undefined && charsPerToken === undefined) return undefined;
  return {
    ...(input === undefined ? {} : { dollarsPerMillionInputTokens: input }),
    ...(output === undefined ? {} : { dollarsPerMillionOutputTokens: output }),
    ...(charsPerToken === undefined ? {} : { charsPerToken }),
  };
}

function loadDotEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
    const assignment = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
    if (assignment === null) continue;
    const key = assignment[1];
    let value = assignment[2].trim();
    const quoted =
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"));
    if (quoted && value.length >= 2) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function membershipService() {
  const resolved = resolveMembershipProgramEnv(paidMembership, processEnv());
  return localMembershipService(resolved, {
    env: processEnv(),
    ...(env("STRIPE_SECRET_KEY") === undefined ? {} : { stripeSecretKey: env("STRIPE_SECRET_KEY") }),
  });
}

function config() {
  const cost = costRates();
  return {
    serverName: env("DISCORD_SERVER_NAME") ?? communityName,
    botName: env("DISCORD_BOT_NAME") ?? "Tidewatcher",
    adminUsername: env("DISCORD_ADMIN") ?? "emsenn",
    charter: stewardSystem,
    endpoint: env("TTI_AGENT_ENDPOINT") ?? "nvidia",
    ...(env("TTI_AGENT_MODEL") === undefined ? {} : { model: env("TTI_AGENT_MODEL") }),
    capabilities: grantedCapabilities,
    gate: gateEnv("TTI_GATE_MODE", "off"),
    dataRoot: env("TTI_AGENT_DATA_ROOT") ?? path.join(siteRoot, "data", "agent"),
    contextBudget: numberEnv("TTI_CONTEXT_BUDGET", 1800),
    ...(cost === undefined ? {} : { cost }),
    ...(env("DISCORD_ADMIN_CHANNEL_ID") === undefined ? {} : { adminChannelId: env("DISCORD_ADMIN_CHANNEL_ID") }),
    ...(env("DISCORD_ADMIN_USER_ID") === undefined ? {} : { adminUserId: env("DISCORD_ADMIN_USER_ID") }),
    membership: membershipService(),
  };
}

function readiness() {
  const c = config();
  const botToken = botTokenProjection();
  const endpoints = availableEndpoints();
  const selectedEndpoint = endpoints.find((endpoint) => endpoint.endpoint === c.endpoint);
  const clientId = env("DISCORD_CLIENT_ID");
  const membershipEnv = unresolvedMembershipEnvReferences(resolveMembershipProgramEnv(paidMembership, processEnv()))
    .filter((name) => env(name) === undefined);
  const membershipRuntimeEnv = membershipEnv.filter((name) =>
    name === "DISCORD_GUILD_ID" || name === membershipGate.roleIdEnv
  );
  const membershipRuntimeEnvSet = new Set(membershipRuntimeEnv);
  const membershipCheckoutEnv = membershipEnv.filter((name) => !membershipRuntimeEnvSet.has(name));
  const missing = [];
  if (!botToken.present) missing.push("DISCORD_BOT_TOKEN or DISCORD_TOKEN");
  if (clientId === undefined) missing.push("DISCORD_CLIENT_ID");
  if (env("DISCORD_ADMIN_CHANNEL_ID") === undefined) missing.push("DISCORD_ADMIN_CHANNEL_ID");
  if (env("DISCORD_ADMIN_USER_ID") === undefined) missing.push("DISCORD_ADMIN_USER_ID");
  if (selectedEndpoint === undefined) {
    missing.push(`known OpenAI-compatible endpoint '${c.endpoint}'`);
  } else if (!selectedEndpoint.apiKey.present) {
    missing.push(`${selectedEndpoint.apiKey.envVarName || c.endpoint + " API key"}`);
  }
  missing.push(...membershipRuntimeEnv);

  return {
    config: c,
    gatewayTokenPresent: botToken.present,
    clientIdPresent: clientId !== undefined,
    endpointLabel: `${c.endpoint}${selectedEndpoint === undefined ? " (unknown)" : selectedEndpoint.apiKey.present ? " (key present)" : " (key absent)"}`,
    membershipRuntimeEnvMissing: membershipRuntimeEnv,
    membershipCheckoutEnvMissing: membershipCheckoutEnv,
    missing,
  };
}

function printReadiness(state) {
  const c = state.config;
  process.stdout.write(`server: ${c.serverName}\n`);
  process.stdout.write(`bot: ${c.botName ?? "(unnamed)"}\n`);
  process.stdout.write(`admin: @${c.adminUsername}\n`);
  process.stdout.write(`admin channel: ${c.adminChannelId === undefined ? "ABSENT - set DISCORD_ADMIN_CHANNEL_ID" : "present"}\n`);
  process.stdout.write(`admin user id: ${c.adminUserId === undefined ? "ABSENT - set DISCORD_ADMIN_USER_ID" : "present"}\n`);
  process.stdout.write(`gateway token: ${state.gatewayTokenPresent ? "present" : "ABSENT - set DISCORD_BOT_TOKEN or DISCORD_TOKEN"}\n`);
  process.stdout.write(`client id: ${state.clientIdPresent ? "present" : "ABSENT - set DISCORD_CLIENT_ID"}\n`);
  process.stdout.write(`endpoint: ${state.endpointLabel}\n`);
  process.stdout.write(`data root: ${c.dataRoot}\n`);
  process.stdout.write(`capabilities: ${c.capabilities?.join(", ")}\n`);
  process.stdout.write(`policy gate: ${c.gate ?? "(library default)"}\n`);
  process.stdout.write(`cost rates: ${c.cost === undefined ? "token counts only" : "configured"}\n`);
  process.stdout.write(`membership runtime env: ${state.membershipRuntimeEnvMissing.length === 0 ? "resolved" : `missing ${state.membershipRuntimeEnvMissing.join(", ")}`}\n`);
  process.stdout.write(`membership checkout env: ${state.membershipCheckoutEnvMissing.length === 0 ? "resolved" : `missing ${state.membershipCheckoutEnvMissing.join(", ")}`}\n`);
  process.stdout.write("required Discord application settings: MESSAGE CONTENT intent, SERVER MEMBERS intent\n");
  process.stdout.write("secret hygiene: rotate any Discord/NVIDIA token pasted into chat or logs before using it here\n");
  process.stdout.write(`readiness: ${state.missing.length === 0 ? "ready to run steward" : `blocked by ${state.missing.join(", ")}`}\n`);
}

function formatPulseCost(result) {
  if (result.cost === undefined) return "";
  const dollars = result.cost.dollars > 0 ? ` dollars=${result.cost.dollars.toFixed(6)}` : "";
  return ` tokens=${result.cost.totalTokens} input=${result.cost.inputTokens} output=${result.cost.outputTokens}${dollars}`;
}

function fieldFromJson(entry, key) {
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return "";
  const value = (entry)[key];
  return typeof value === "string" ? value : "";
}

function discordMessageEntry(
  agentId,
  guild,
  channelName,
  message,
  now,
) {
  return {
    t: now,
    kind: "discord-message",
    source: "rest-history",
    session: agentId,
    guild,
    channel: message.channelId,
    channelName,
    message: message.id,
    author: message.authorId,
    actor: message.authorName,
    authorBot: message.authorBot,
    content: message.content,
    contentPresent: message.content.length > 0,
  };
}

async function ingestHistoryWithTransport(
  transport,
  guild,
  options,
) {
  const namespace = options.namespace ?? "discord-organizer";
  const mount = dataMountRoot({ root: options.root });
  const agentId = options.agentId ?? `discord-organizer:${guild}`;
  const now = new Date().toISOString();
  const existing = new Set(
    (await readLog(mount, namespace))
      .filter((entry) => fieldFromJson(entry, "kind") === "discord-message")
      .map((entry) => fieldFromJson(entry, "message"))
      .filter((id) => id.length > 0),
  );
  const channels = await transport.listChannels(guild);
  let channelsRead = 0;
  let channelsSkipped = 0;
  let messagesSeen = 0;
  let messagesAdded = 0;

  for (const channel of channels) {
    let messages;
    try {
      messages = await transport.listMessages(channel.id, options.limit);
    } catch {
      channelsSkipped += 1;
      continue;
    }
    channelsRead += 1;
    messagesSeen += messages.length;
    const entries = messages
      .filter((message) => !existing.has(message.id))
      .map((message) => {
        existing.add(message.id);
        return discordMessageEntry(agentId, guild, channel.name, message, now);
      });
    if (entries.length > 0) {
      await appendLog(mount, namespace, entries, now);
      messagesAdded += entries.length;
    }
  }

  return { channelsSeen: channels.length, channelsRead, channelsSkipped, messagesSeen, messagesAdded };
}

function check() {
  const state = readiness();
  printReadiness(state);
  return state.missing.length === 0 ? 0 : 1;
}

async function discordGet(token, route) {
  const res = await fetch(`https://discord.com/api/v10${route}`, {
    headers: {
      authorization: `Bot ${token}`,
      "content-type": "application/json",
      "user-agent": "turntide-islands.discord.com steward (https://561.group, 0.0.1)",
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`discord GET ${route} -> ${res.status}: ${text.slice(0, 400)}`);
  const raw = text.length === 0 ? {} : JSON.parse(text);
  return raw !== null && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
}

async function discoverEnv() {
  const botToken = env("DISCORD_BOT_TOKEN") ?? env("DISCORD_TOKEN");
  if (botToken === undefined) {
    process.stderr.write("discover-env blocked by DISCORD_BOT_TOKEN or DISCORD_TOKEN\n");
    return 1;
  }

  const c = config();
  const transport = discordRestTransport({});
  const applicationId = await transport.getApplicationId();
  const guild = await resolveGuildByName(transport, c.serverName);
  if (guild === null) {
    process.stderr.write(`discover-env failed: bot cannot resolve server "${c.serverName}"\n`);
    return 1;
  }

  const rawGuild = await discordGet(botToken, `/guilds/${guild.id}?with_counts=true`);
  const ownerId = stringField(rawGuild, "owner_id");
  const adminUserId = env("DISCORD_ADMIN_USER_ID") ?? ownerId;
  const adminUserSource = env("DISCORD_ADMIN_USER_ID") === undefined ? "guild owner fallback" : "existing env";
  const channels = await transport.listChannels(guild.id);
  const roles = await transport.listRoles(guild.id);
  const adminChannel = channels.find((channel) => normalizedName(channel.name) === "admin-channel");
  const islanderRole = roles.find((role) => normalizedName(role.name) === normalizedName(membershipGate.role));

  process.stdout.write(`discovered guild: ${guild.name} (${guild.id})\n`);
  process.stdout.write(`admin user source: ${adminUserId === undefined ? "unresolved" : adminUserSource}\n`);
  process.stdout.write("env values:\n");
  process.stdout.write(`DISCORD_CLIENT_ID=${applicationId}\n`);
  process.stdout.write(`DISCORD_GUILD_ID=${guild.id}\n`);
  if (adminUserId !== undefined) process.stdout.write(`DISCORD_ADMIN_USER_ID=${adminUserId}\n`);
  if (adminChannel !== undefined) process.stdout.write(`DISCORD_ADMIN_CHANNEL_ID=${adminChannel.id}\n`);
  if (islanderRole !== undefined) process.stdout.write(`${membershipGate.roleIdEnv}=${islanderRole.id}\n`);
  if (adminChannel === undefined || islanderRole === undefined) {
    process.stdout.write("next: run steward:bootstrap after DISCORD_ADMIN_USER_ID is set to create missing admin/member surfaces\n");
  }
  return adminUserId === undefined ? 1 : 0;
}

const PERMISSION_LABELS = Object.freeze([
  ["KICK_MEMBERS", 1n << 1n],
  ["BAN_MEMBERS", 1n << 2n],
  ["ADMINISTRATOR", 1n << 3n],
  ["MANAGE_CHANNELS", 1n << 4n],
  ["ADD_REACTIONS", 1n << 6n],
  ["VIEW_CHANNEL", 1n << 10n],
  ["SEND_MESSAGES", 1n << 11n],
  ["MANAGE_MESSAGES", 1n << 13n],
  ["READ_MESSAGE_HISTORY", 1n << 16n],
  ["MANAGE_ROLES", 1n << 28n],
  ["MANAGE_WEBHOOKS", 1n << 29n],
  ["MODERATE_MEMBERS", 1n << 40n],
]);

async function livePermissions() {
  const botToken = env("DISCORD_BOT_TOKEN") ?? env("DISCORD_TOKEN");
  if (botToken === undefined) {
    process.stderr.write("live-permissions blocked by DISCORD_BOT_TOKEN or DISCORD_TOKEN\n");
    return 1;
  }

  const c = config();
  const transport = discordRestTransport({});
  const applicationId = await transport.getApplicationId();
  const guild = env("DISCORD_GUILD_ID") === undefined
    ? await resolveGuildByName(transport, c.serverName)
    : await transport.getGuild(env("DISCORD_GUILD_ID"));
  if (guild === null) {
    process.stderr.write(`live-permissions failed: bot cannot resolve server "${c.serverName}"\n`);
    return 1;
  }

  const me = await transport.getCurrentUser();
  const member = await discordGet(botToken, `/guilds/${guild.id}/members/${me.id}`);
  const roleIds = new Set([guild.id, ...stringArrayField(member, "roles")]);
  const roles = await transport.listRoles(guild.id);
  let actual = 0n;
  for (const role of roles) {
    if (roleIds.has(role.id)) actual |= BigInt(role.permissions);
  }
  const required = BigInt(permissionsFor(grantedCapabilities));
  const administrator = (actual & (1n << 3n)) !== 0n;
  const missing = administrator ? 0n : required & ~actual;

  process.stdout.write(`guild: ${guild.name} (${guild.id})\n`);
  process.stdout.write(`bot: ${me.username} (${me.id})\n`);
  process.stdout.write(`role count: ${Math.max(0, roleIds.size - 1)}\n`);
  process.stdout.write(`required permissions: ${required}\n`);
  process.stdout.write(`actual permissions: ${actual}\n`);
  process.stdout.write(`permission readiness: ${missing === 0n ? "ready" : "missing required bits"}\n`);
  for (const [label, bit] of PERMISSION_LABELS) {
    if ((required & bit) !== 0n || (actual & bit) !== 0n) {
      process.stdout.write(`${label}: ${(actual & bit) !== 0n || administrator ? "yes" : "no"}${(missing & bit) !== 0n ? " required" : ""}\n`);
    }
  }
  if (missing !== 0n) {
    process.stdout.write(`repair invite: ${inviteUrl(applicationId, grantedCapabilities)}&guild_id=${guild.id}&disable_guild_select=true\n`);
  }
  return missing === 0n ? 0 : 1;
}

async function measure() {
  const botToken = botTokenProjection();
  if (!botToken.present) {
    process.stderr.write("measure blocked by DISCORD_BOT_TOKEN or DISCORD_TOKEN\n");
    return 1;
  }
  const c = config();
  const transport = discordRestTransport({});
  const guild = env("DISCORD_GUILD_ID") === undefined
    ? await resolveGuildByName(transport, c.serverName)
    : await transport.getGuild(env("DISCORD_GUILD_ID"));
  if (guild === null) {
    process.stderr.write(`measure failed: bot cannot resolve server "${c.serverName}"\n`);
    return 1;
  }

  const exportedCount = await countDurableExports(c.dataRoot ?? path.join(siteRoot, "data", "agent"), guild.id);
  const { measurement } = await witnessServer(transport, guild.id, { exportedCount });
  const now = new Date().toISOString();
  await recordMeasurement(c.dataRoot ?? path.join(siteRoot, "data", "agent"), "measurement", `turntide-steward:${guild.id}`, measurement, now)
    .catch((error) => process.stderr.write(`measurement log skipped: ${(error).message}\n`));
  const trapped = measurement.capital
    .filter((reading) => !reading.durable && reading.score >= 0.15)
    .sort((left, right) => right.score - left.score)
    .slice(0, 5)
    .map((reading) => `${reading.label} ${Math.round(reading.score * 100)}%`);
  const durable = measurement.capital
    .filter((reading) => reading.durable && reading.score >= 0.15)
    .sort((left, right) => right.score - left.score)
    .slice(0, 5)
    .map((reading) => `${reading.label} ${Math.round(reading.score * 100)}%`);

  process.stdout.write(`guild: ${guild.name} (${guild.id})\n`);
  process.stdout.write(`verdict: ${measurement.verdict}\n`);
  process.stdout.write(`enclosure: ${Math.round(measurement.enclosure * 100)}%\n`);
  process.stdout.write(`dependency: ${Math.round(measurement.dependency * 100)}%\n`);
  process.stdout.write(`buried knowledge candidates: ${measurement.candidates.length}\n`);
  process.stdout.write(`top trapped capital: ${trapped.length === 0 ? "(none observed)" : trapped.join(", ")}\n`);
  process.stdout.write(`top durable capital: ${durable.length === 0 ? "(none observed)" : durable.join(", ")}\n`);
  return 0;
}

async function ingestHistory() {
  const state = readiness();
  if (state.missing.length > 0) {
    printReadiness(state);
    process.stderr.write("refusing live history ingestion until readiness is resolved\n");
    return 1;
  }

  const c = state.config;
  const transport = discordRestTransport({});
  const guild = env("DISCORD_GUILD_ID") === undefined
    ? await resolveGuildByName(transport, c.serverName)
    : await transport.getGuild(env("DISCORD_GUILD_ID"));
  if (guild === null) {
    process.stderr.write(`ingest-history failed: bot cannot resolve server "${c.serverName}"\n`);
    return 1;
  }

  const result = await ingestHistoryWithTransport(transport, guild.id, {
    root: c.dataRoot ?? path.join(siteRoot, "data", "agent"),
    limit: integerEnv("TTI_INGEST_HISTORY_LIMIT", 50),
  });
  process.stdout.write(`guild: ${guild.name} (${guild.id})\n`);
  process.stdout.write(`channels seen: ${result.channelsSeen}\n`);
  process.stdout.write(`channels read: ${result.channelsRead}\n`);
  process.stdout.write(`channels skipped: ${result.channelsSkipped}\n`);
  process.stdout.write(`messages seen: ${result.messagesSeen}\n`);
  process.stdout.write(`messages added: ${result.messagesAdded}\n`);
  return 0;
}

async function ingestHistorySmoke() {
  const root = await mkdtemp(path.join(tmpdir(), "turntide-ingest-history-"));
  const guild = inMemoryGuild({
    guild: { id: guildId, name: communityName },
    channels: [
      { id: "weather-report", name: "weather-report" },
      { id: "ai-archipelago", name: "ai-archipelago" },
    ],
  });
  await guild.transport.createMessage("weather-report", "Weather report seed for history ingestion.");
  await guild.transport.createMessage("ai-archipelago", "Archipelago seed for history ingestion.");

  const first = await ingestHistoryWithTransport(guild.transport, guildId, { root, limit: 50 });
  const second = await ingestHistoryWithTransport(guild.transport, guildId, { root, limit: 50 });
  const log = await readLog(dataMountRoot({ root }), "discord-organizer");
  const ingested = log.filter((entry) => fieldFromJson(entry, "kind") === "discord-message");
  const weather = ingested.some((entry) => fieldFromJson(entry, "channel") === "weather-report");
  const archipelago = ingested.some((entry) => fieldFromJson(entry, "channel") === "ai-archipelago");
  if (
    first.channelsRead !== 2 ||
    first.messagesSeen !== 2 ||
    first.messagesAdded !== 2 ||
    second.messagesAdded !== 0 ||
    ingested.length !== 2 ||
    !weather ||
    !archipelago
  ) {
    process.stderr.write("ingest-history smoke failed: expected two backfilled messages and a deduped second run\n");
    return 1;
  }

  process.stdout.write(`ingest-history-smoke: channels=${first.channelsRead} seen=${first.messagesSeen} added=${first.messagesAdded}\n`);
  process.stdout.write(`second run added: ${second.messagesAdded}\n`);
  process.stdout.write(`mounted messages: ${ingested.length}\n`);
  return 0;
}

function normalizedName(value) {
  return value.trim().toLowerCase();
}

const DISCORD_VIEW_CHANNEL = "1024";
const DISCORD_LANE_ACCESS = "68608"; // VIEW_CHANNEL + SEND_MESSAGES + READ_MESSAGE_HISTORY

function samePermissionOverwrites(
  left,
  right,
) {
  return JSON.stringify(left ?? []) === JSON.stringify(right ?? []);
}

function privateLaneOverwrites(
  guildRoleId,
  adminUserId,
  botUserId,
  roleId,
) {
  return [
    { id: guildRoleId, type: "role", allow: "0", deny: DISCORD_VIEW_CHANNEL },
    { id: botUserId, type: "member", allow: DISCORD_LANE_ACCESS, deny: "0" },
    { id: adminUserId, type: "member", allow: DISCORD_LANE_ACCESS, deny: "0" },
    ...(roleId === null ? [] : [{ id: roleId, type: "role", allow: DISCORD_LANE_ACCESS, deny: "0" }]),
  ];
}

function permissionOverwritesForAccess(
  access,
  guildRoleId,
  adminUserId,
  botUserId,
  islanderRoleId,
) {
  if (access === "staff") return privateLaneOverwrites(guildRoleId, adminUserId, botUserId, null);
  if (access === "member") return privateLaneOverwrites(guildRoleId, adminUserId, botUserId, islanderRoleId);
  return undefined;
}

async function ensureBootstrapChannel(
  transport,
  resolvedGuildId,
  spec,
  permissionOverwrites,
) {
  const channels = await transport.listChannels(resolvedGuildId);
  const existing = channels.find((channel) => normalizedName(channel.name) === normalizedName(spec.name));
  if (existing === undefined) {
    const created = await transport.createChannel(resolvedGuildId, {
      name: spec.name,
      topic: spec.topic,
      ...(permissionOverwrites === undefined ? {} : { permissionOverwrites }),
    });
    return { kind: "created", name: created.name, id: created.id };
  }
  if (existing.topic !== spec.topic || !samePermissionOverwrites(existing.permissionOverwrites, permissionOverwrites)) {
    const updated = await transport.modifyChannel(existing.id, {
      topic: spec.topic,
      ...(permissionOverwrites === undefined ? {} : { permissionOverwrites }),
    });
    return { kind: "updated", name: updated.name, id: updated.id };
  }
  return { kind: "found", name: existing.name, id: existing.id };
}

async function ensureBootstrapRole(transport, resolvedGuildId) {
  const roles = await transport.listRoles(resolvedGuildId);
  const existing = roles.find((role) => normalizedName(role.name) === normalizedName(membershipGate.role));
  if (existing !== undefined) return { kind: "found", name: existing.name, id: existing.id };
  const created = await transport.createRole(resolvedGuildId, { name: membershipGate.role, mentionable: false });
  return { kind: "created", name: created.name, id: created.id };
}

async function ensureBootstrapCommand(
  transport,
  applicationId,
  resolvedGuildId,
  spec,
  existingNames,
) {
  if (existingNames.has(normalizedName(spec.name))) return { kind: "found", name: spec.name, id: spec.name };
  const created = await transport.registerCommand(applicationId, resolvedGuildId, spec);
  existingNames.add(normalizedName(created.name));
  return { kind: "created", name: created.name, id: created.id };
}

async function bootstrapWithTransport(
  transport,
  resolvedGuildId,
  options,
) {
  const guild = await transport.getGuild(resolvedGuildId);
  const botUser = await transport.getCurrentUser();
  const role = await ensureBootstrapRole(transport, guild.id);
  const channels = [];
  for (const channel of bootstrapChannels) {
    const permissionOverwrites = permissionOverwritesForAccess(
      channel.access,
      guild.id,
      options.adminUserId,
      botUser.id,
      role.id,
    );
    channels.push(await ensureBootstrapChannel(transport, guild.id, channel, permissionOverwrites));
  }

  const applicationId = await transport.getApplicationId();
  const existingCommands = await transport.listCommands(applicationId, guild.id);
  const existingCommandNames = new Set(existingCommands.map((command) => normalizedName(command.name)));
  const commands = [];
  for (const command of bootstrapCommands) {
    commands.push(await ensureBootstrapCommand(transport, applicationId, guild.id, command, existingCommandNames));
  }

  const allChannels = await transport.listChannels(guild.id);
  const configuredAdminChannel =
    options.adminChannelId === undefined ? undefined : allChannels.find((channel) => channel.id === options.adminChannelId);
  const adminChannel = configuredAdminChannel
    ?? allChannels.find((channel) => normalizedName(channel.name) === "admin-channel");
  if (adminChannel === undefined) {
    throw new Error("bootstrap could not resolve or create admin-channel");
  }
  const adminMessage = await transport.createMessage(adminChannel.id, {
    content: [
      `<@${options.adminUserId}> Turntide bootstrap completed.`,
      `Admin lane: #${adminChannel.name} (${adminChannel.id}).`,
      `Membership role: ${role.name} (${role.id}).`,
      "Next env values to preserve: DISCORD_ADMIN_CHANNEL_ID and TURNTIDE_ISLANDER_ROLE_ID.",
    ].join("\n"),
    allowedMentions: { users: [options.adminUserId] },
  });

  return {
    guildName: guild.name,
    guildId: guild.id,
    channels,
    role,
    commands,
    adminNotice: { kind: "created", name: adminChannel.name, id: adminMessage.id },
  };
}

function printBootstrapResult(result) {
  process.stdout.write(`bootstrap guild: ${result.guildName} (${result.guildId})\n`);
  process.stdout.write(`set DISCORD_GUILD_ID=${result.guildId}\n`);
  process.stdout.write(`channels:\n`);
  for (const channel of result.channels) {
    process.stdout.write(`- ${channel.kind}: #${channel.name} (${channel.id})\n`);
  }
  process.stdout.write(`role: ${result.role.kind}: ${result.role.name} (${result.role.id})\n`);
  process.stdout.write(`commands:\n`);
  for (const command of result.commands) {
    process.stdout.write(`- ${command.kind}: /${command.name} (${command.id})\n`);
  }
  const adminChannel = result.channels.find((channel) => normalizedName(channel.name) === "admin-channel");
  if (adminChannel !== undefined) {
    process.stdout.write(`set DISCORD_ADMIN_CHANNEL_ID=${adminChannel.id}\n`);
  }
  process.stdout.write(`set ${membershipGate.roleIdEnv}=${result.role.id}\n`);
  process.stdout.write(`admin notice: #${result.adminNotice.name} message ${result.adminNotice.id}\n`);
}

async function bootstrap() {
  const botToken = botTokenProjection();
  const adminUserId = env("DISCORD_ADMIN_USER_ID");
  const missing = [];
  if (!botToken.present) missing.push("DISCORD_BOT_TOKEN or DISCORD_TOKEN");
  if (adminUserId === undefined) missing.push("DISCORD_ADMIN_USER_ID");
  if (missing.length > 0) {
    process.stderr.write(`bootstrap blocked by ${missing.join(", ")}\n`);
    process.stderr.write("bootstrap only needs Discord access; it does not require NVIDIA, Stripe, or membership price ids\n");
    return 1;
  }
  const resolvedAdminUserId = adminUserId;

  const c = config();
  const transport = discordRestTransport({});
  const guild = await resolveGuildByName(transport, c.serverName);
  if (guild === null) {
    process.stderr.write(`bootstrap failed: bot cannot resolve server "${c.serverName}"\n`);
    return 1;
  }
  const result = await bootstrapWithTransport(transport, guild.id, {
    adminUserId: resolvedAdminUserId,
    ...(c.adminChannelId === undefined ? {} : { adminChannelId: c.adminChannelId }),
  });
  printBootstrapResult(result);
  return 0;
}

async function run() {
  const state = readiness();
  if (state.missing.length > 0) {
    printReadiness(state);
    process.stderr.write("refusing to start live steward until readiness is resolved\n");
    return 1;
  }
  const steward = await runSteward(config(), {
    onInfo: (message) => process.stderr.write(`- ${message}\n`),
    onReady: (id) => process.stderr.write(`online as user ${id}\n`),
    onPulse: (result) => {
      const reply = result.autoReply === undefined ? "" : ` reply=${result.autoReply.messageId}`;
      process.stdout.write(`pulse - ${result.event.type} -> ${result.run.stop}${reply}${formatPulseCost(result)}: ${result.run.summary ?? ""}\n`);
    },
    onError: (error) => process.stderr.write(`! ${error.message}\n`),
  });
  process.on("SIGINT", () => {
    steward.stop();
    process.stderr.write("\nstopped\n");
    process.exit(0);
  });
  return -1;
}

function invite() {
  const clientId = env("DISCORD_CLIENT_ID");
  if (clientId === undefined) {
    process.stderr.write("set DISCORD_CLIENT_ID to print the Turntide steward invite URL\n");
    return 2;
  }
  process.stdout.write(`${inviteUrl(clientId, grantedCapabilities)}\n`);
  return 0;
}

async function smoke() {
  const guild = inMemoryGuild({
    guild: { id: guildId, name: communityName },
    channels: [{ id: "weather-report", name: "weather-report" }],
  });
  const result = await tendOnMessage({
    guildId,
    charter: stewardSystem,
    transport: guild.transport,
    infer: async () => ({
      endpoint: "injected",
      model: "turntide-smoke",
      text: "Turntide smoke check: answer useful climate questions in-channel, and route care, conflict, bans, appeals, and governance to humans.",
      raw: {},
      promptBytes: 0,
    }),
    recall: false,
    capabilities: grantedCapabilities,
    maxSteps: 1,
    gate: "enforce",
    root: path.join(siteRoot, "data", "smoke"),
    membership: membershipService(),
  }, {
    type: "message",
    guildId,
    channelId: "weather-report",
    messageId: "smoke-message",
    authorId: "smoke-user",
    authorName: "islander",
    authorBot: false,
    content: "What should this server help people do during a heat wave?",
  });
  if (result === null || result.autoReply === undefined) {
    process.stderr.write("smoke failed: no reply was posted\n");
    return 1;
  }
  process.stdout.write(`smoke: ${result.event.type} -> ${result.run.stop} reply=${result.autoReply.messageId}\n`);
  process.stdout.write(`posted: ${guild.posts[0]?.content ?? "(none)"}\n`);
  process.stdout.write(`logged: ${result.logged}\n`);
  return 0;
}

async function contextSmoke() {
  const root = await mkdtemp(path.join(tmpdir(), "turntide-context-smoke-"));
  const guild = inMemoryGuild({
    guild: { id: guildId, name: communityName },
    channels: [{ id: "weather-report", name: "weather-report" }],
  });
  const first = await tendOnMessage({
    guildId,
    charter: stewardSystem,
    transport: guild.transport,
    infer: async () => ({
      endpoint: "injected",
      model: "turntide-context-smoke",
      text: "Noted for later context.",
      raw: {},
      promptBytes: 0,
    }),
    recall: false,
    capabilities: grantedCapabilities,
    maxSteps: 1,
    gate: "enforce",
    root,
    membership: membershipService(),
  }, {
    type: "message",
    guildId,
    channelId: "weather-report",
    messageId: "context-seed",
    authorId: "context-user",
    authorName: "islander",
    authorBot: false,
    content: "The vault key phrase is blue kelp archive.",
  });

  let capturedSystem = "";
  const second = await tendOnMessage({
    guildId,
    charter: stewardSystem,
    transport: guild.transport,
    infer: async (request) => {
      capturedSystem = request.system ?? "";
      return {
        endpoint: "injected",
        model: "turntide-context-smoke",
        text: "The remembered phrase is blue kelp archive.",
        raw: {},
        promptBytes: capturedSystem.length,
      };
    },
    recall: true,
    contextBudget: 1200,
    capabilities: grantedCapabilities,
    maxSteps: 1,
    gate: "enforce",
    root,
    membership: membershipService(),
  }, {
    type: "message",
    guildId,
    channelId: "weather-report",
    messageId: "context-query",
    authorId: "context-user",
    authorName: "islander",
    authorBot: false,
    content: "What vault key phrase did I give you?",
  });

  const hasGrounding = capturedSystem.includes("What you know about this server");
  const hasRememberedMessage = capturedSystem.includes("Earlier islander: The vault key phrase is blue kelp archive.");
  if (first === null || second === null || second.autoReply === undefined || !hasGrounding || !hasRememberedMessage) {
    process.stderr.write("context smoke failed: expected second pulse prompt to include rendered server grounding and the earlier member message\n");
    return 1;
  }

  process.stdout.write(`context-smoke: ${second.event.type} -> ${second.run.stop} reply=${second.autoReply.messageId}\n`);
  process.stdout.write(`grounding injected: ${hasGrounding ? "yes" : "no"}\n`);
  process.stdout.write(`remembered message injected: ${hasRememberedMessage ? "yes" : "no"}\n`);
  process.stdout.write(`captured system bytes: ${capturedSystem.length}\n`);
  process.stdout.write(`logged: ${first.logged + second.logged}\n`);
  return 0;
}

async function gatewaySmoke() {
  const root = await mkdtemp(path.join(tmpdir(), "turntide-gateway-smoke-"));
  const guild = inMemoryGuild({
    guild: { id: guildId, name: communityName },
    channels: [
      { id: "weather-report", name: "weather-report" },
      { id: "admin-channel", name: "admin-channel" },
    ],
  });

  let readyId = "";
  let closed = false;
  let steward = null;
  const stopSteward = () => {
    (steward)?.stop();
  };
  const pulse = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("gateway smoke timed out")), 1000);
    runSteward({
      ...config(),
      transport: guild.transport,
      infer: async (request) => ({
        endpoint: "injected",
        model: request.model ?? "turntide-gateway-smoke",
        text: "Gateway smoke heard: the Turntide steward can answer live Discord messages through the app runner.",
        raw: {},
        promptBytes: (request.system ?? "").length,
      }),
      dataRoot: root,
      gate: "enforce",
      gateway: (options) => {
        setTimeout(() => {
          options.onReady?.("bot-self");
          options.onEvent({
            type: "message",
            guildId,
            channelId: "weather-report",
            messageId: "gateway-smoke-message",
            authorId: "member-1",
            authorName: "islander",
            authorBot: false,
            content: "Can the live gateway path reach the Turntide steward?",
          });
        }, 0);
        return { close: () => { closed = true; } };
      },
    }, {
      onReady: (id) => { readyId = id; },
      onPulse: (result) => {
        clearTimeout(timeout);
        stopSteward();
        resolve(result);
      },
      onError: (error) => {
        clearTimeout(timeout);
        stopSteward();
        reject(error);
      },
    }).then((running) => { steward = running; }).catch((error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });

  const result = await pulse;
  stopSteward();
  const posted = guild.posts[0];
  const log = await readLog(dataMountRoot({ root }), "discord-organizer");
  const ingested = log.some((entry) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return false;
    const record = entry;
    return (
      record["kind"] === "discord-message" &&
      record["message"] === "gateway-smoke-message" &&
      record["channel"] === "weather-report"
    );
  });
  if (
    readyId !== "bot-self" ||
    !closed ||
    result.event.type !== "message" ||
    result.autoReply === undefined ||
    result.autoReply.channelId !== "weather-report" ||
    posted?.channelId !== "weather-report" ||
    !posted.content.includes("Gateway smoke heard") ||
    !ingested
  ) {
    process.stderr.write("gateway smoke failed: expected runSteward to receive a gateway message, ingest it, and post a source-channel reply\n");
    return 1;
  }

  process.stdout.write(`gateway-smoke: ${result.event.type} -> ${result.run.stop} reply=${result.autoReply.messageId}${formatPulseCost(result)}\n`);
  process.stdout.write(`ready user: ${readyId}\n`);
  process.stdout.write(`posted: ${posted.content}\n`);
  process.stdout.write(`closed: ${closed ? "yes" : "no"}\n`);
  process.stdout.write(`ingested: ${ingested ? "yes" : "no"}\n`);
  process.stdout.write(`logged: ${result.logged}\n`);
  return 0;
}

async function supervisionSmoke() {
  const root = await mkdtemp(path.join(tmpdir(), "turntide-supervision-smoke-"));
  const guild = inMemoryGuild({
    guild: { id: guildId, name: communityName },
    channels: [
      { id: "weather-report", name: "weather-report" },
      { id: "admin-channel", name: "admin-channel" },
    ],
  });

  let connectCount = 0;
  let closeCount = 0;
  const readyIds = [];
  const info = [];
  const errors = [];
  let steward = null;
  const stopSteward = () => {
    (steward)?.stop();
  };
  const gateway = (options) => {
    connectCount += 1;
    const attempt = connectCount;
    setTimeout(() => {
      if (attempt === 1) {
        options.onReady?.("bot-first");
        options.onClose?.("gateway closed (1006)");
        return;
      }
      if (attempt === 2) {
        options.onReady?.("bot-second");
        options.onEvent({
          type: "message",
          guildId,
          channelId: "weather-report",
          messageId: "supervision-smoke-message",
          authorId: "member-1",
          authorName: "islander",
          authorBot: false,
          content: "Can the steward recover after a gateway drop?",
        });
      }
    }, 0);
    return { close: () => { closeCount += 1; } };
  };

  const pulse = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("supervision smoke timed out")), 4000);
    runSteward({
      ...config(),
      transport: guild.transport,
      infer: async (request) => ({
        endpoint: "injected",
        model: request.model ?? "turntide-supervision-smoke",
        text: "Supervision smoke heard: the Turntide steward reconnected and answered after a gateway drop.",
        raw: {},
        promptBytes: (request.system ?? "").length,
      }),
      dataRoot: root,
      gate: "enforce",
      gateway,
    }, {
      onReady: (id) => { readyIds.push(id); },
      onInfo: (message) => { info.push(message); },
      onError: (error) => { errors.push(error.message); },
      onPulse: (result) => {
        clearTimeout(timeout);
        stopSteward();
        resolve(result);
      },
    }).then((running) => { steward = running; }).catch((error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });

  const result = await pulse;
  stopSteward();
  const posted = guild.posts[0];
  const reply = result.autoReply;
  const sawReconnectNotice = info.some((message) => message.includes("reconnecting"));
  const sawClose = errors.some((message) => message.includes("closed"));
  if (
    connectCount < 2 ||
    closeCount < 2 ||
    readyIds[0] !== "bot-first" ||
    readyIds[1] !== "bot-second" ||
    !sawReconnectNotice ||
    !sawClose ||
    reply?.channelId !== "weather-report" ||
    posted?.channelId !== "weather-report" ||
    !posted.content.includes("reconnected")
  ) {
    process.stderr.write("supervision smoke failed: expected gateway close, supervised reconnect, and source-channel reply\n");
    return 1;
  }

  process.stdout.write(`supervision-smoke: connects=${connectCount} closes=${closeCount} ready=${readyIds.join(",")} reply=${reply.messageId}${formatPulseCost(result)}\n`);
  process.stdout.write(`reconnect notice: ${sawReconnectNotice ? "yes" : "no"}\n`);
  process.stdout.write(`gateway close observed: ${sawClose ? "yes" : "no"}\n`);
  process.stdout.write(`posted: ${posted.content}\n`);
  return 0;
}

async function bootstrapSmoke() {
  const guild = inMemoryGuild({
    guild: { id: guildId, name: communityName },
    channels: [
      { id: "weather-report", name: "weather-report", topic: "old topic" },
      { id: "admin-channel", name: "admin-channel" },
    ],
  });
  const result = await bootstrapWithTransport(guild.transport, guildId, {
    adminUserId: "admin-user",
    adminChannelId: "admin-channel",
  });

  const channelNames = new Set(guild.channelsNow().map((channel) => channel.name));
  const commandNames = new Set(guild.commandsNow().map((command) => command.name));
  const hasChannels = bootstrapChannels.every((channel) => channelNames.has(channel.name));
  const hasCommands = bootstrapCommands.every((command) => commandNames.has(command.name));
  const role = guild.rolesNow().find((candidate) => candidate.name === membershipGate.role);
  const hasRole = role !== undefined;
  const adminChannel = guild.channelsNow().find((channel) => channel.name === "admin-channel");
  const memberChannel = guild.channelsNow().find((channel) => channel.name === "vault-briefings");
  const adminPrivate = adminChannel?.permissionOverwrites?.some((overwrite) =>
    overwrite.id === guildId && overwrite.type === "role" && overwrite.deny === DISCORD_VIEW_CHANNEL
  ) === true;
  const botCanSeeAdmin = adminChannel?.permissionOverwrites?.some((overwrite) =>
    overwrite.id === "self" && overwrite.type === "member" && overwrite.allow === DISCORD_LANE_ACCESS
  ) === true;
  const adminCanSeeAdmin = adminChannel?.permissionOverwrites?.some((overwrite) =>
    overwrite.id === "admin-user" && overwrite.type === "member" && overwrite.allow === DISCORD_LANE_ACCESS
  ) === true;
  const islanderCanSeeMembers = role !== undefined && memberChannel?.permissionOverwrites?.some((overwrite) =>
    overwrite.id === role.id && overwrite.type === "role" && overwrite.allow === DISCORD_LANE_ACCESS
  ) === true;
  const adminPinged = guild.posts.some((post) => post.channelId === "admin-channel" && post.content.includes("<@admin-user>"));
  if (!hasChannels || !hasCommands || !hasRole || !adminPrivate || !botCanSeeAdmin || !adminCanSeeAdmin || !islanderCanSeeMembers || !adminPinged) {
    process.stderr.write("bootstrap smoke failed: expected canonical channels, commands, islander role, private admin/member overwrites, and admin ping\n");
    return 1;
  }

  printBootstrapResult(result);
  process.stdout.write(`bootstrap-smoke: channels=${guild.channelsNow().length} commands=${guild.commandsNow().length} roles=${guild.rolesNow().length}\n`);
  process.stdout.write(`admin lane private: ${adminPrivate && botCanSeeAdmin && adminCanSeeAdmin ? "yes" : "no"}\n`);
  process.stdout.write(`member lane gated: ${islanderCanSeeMembers ? "yes" : "no"}\n`);
  process.stdout.write(`admin pinged: ${adminPinged ? "yes" : "no"}\n`);
  return 0;
}

async function membershipReconcile() {
  const botToken = botTokenProjection();
  const program = resolveMembershipProgramEnv(paidMembership, processEnv());
  const missing = [];
  if (!botToken.present) missing.push("DISCORD_BOT_TOKEN or DISCORD_TOKEN");
  const unresolvedForReconcile = unresolvedMembershipEnvReferences(program)
    .filter((name) => name === "DISCORD_GUILD_ID" || name === membershipGate.roleIdEnv)
    .filter((name) => env(name) === undefined);
  missing.push(...unresolvedForReconcile);
  if (missing.length > 0) {
    process.stderr.write(`membership reconciliation blocked by ${missing.join(", ")}\n`);
    process.stderr.write("membership reconciliation only needs Discord access, DISCORD_GUILD_ID, and TURNTIDE_ISLANDER_ROLE_ID\n");
    return 1;
  }

  const entitlements = await readMembershipEntitlements(membershipEntitlementsFile());
  const result = await reconcileMembershipEntitlements(discordRestTransport({}), program, entitlements);
  const applied = result.fulfillment.filter((entry) => entry.applied).length;
  process.stdout.write(`membership ledger: ${membershipEntitlementsFile()}\n`);
  process.stdout.write(`entitlements: ${result.entitlements.length}\n`);
  process.stdout.write(`role changes: ${result.changes.length}\n`);
  process.stdout.write(`applied: ${applied}\n`);
  for (const fulfillment of result.fulfillment) {
    process.stdout.write(`- ${fulfillment.change.kind} ${fulfillment.change.userId} ${fulfillment.change.roleId}: ${fulfillment.detail}\n`);
  }
  return 0;
}

async function membershipReconcileSmoke() {
  const root = await mkdtemp(path.join(tmpdir(), "turntide-membership-reconcile-"));
  const file = path.join(root, "membership", "entitlements.json");
  const roleId = "role-islander";
  const program = resolveMembershipProgramEnv(paidMembership, {
    ...processEnv(),
    DISCORD_GUILD_ID: guildId,
    TURNTIDE_ISLANDER_ROLE_ID: roleId,
    STRIPE_TURNTIDE_ISLANDER_MONTHLY_PRICE_ID: "price_monthly",
    STRIPE_TURNTIDE_ISLANDER_STABLECOIN_PRICE_ID: "price_stablecoin",
  });

  await recordMembershipEntitlement(file, {
    id: "evt-active",
    provider: "stripe-checkout",
    guildId,
    userId: "member-1",
    planId: "islander-monthly",
    roleId,
    status: "active",
    providerCustomerId: "cus_1",
    providerSubscriptionId: "sub_1",
  });
  await recordMembershipEntitlement(file, {
    id: "evt-cancelled",
    provider: "stripe-checkout",
    guildId,
    userId: "member-1",
    planId: "islander-monthly",
    roleId,
    status: "cancelled",
    providerCustomerId: "cus_1",
    providerSubscriptionId: "sub_1",
  });

  const entitlements = await readMembershipEntitlements(file);
  const guild = inMemoryGuild({
    guild: { id: guildId, name: communityName },
    roles: [{ id: roleId, name: membershipGate.role }],
  });
  await guild.transport.assignRole(guildId, "member-1", roleId);
  const result = await reconcileMembershipEntitlements(guild.transport, program, entitlements);
  const stillHasRole = guild.memberRolesNow().get("member-1")?.includes(roleId) === true;
  if (
    entitlements.length !== 1 ||
    entitlements[0]?.status !== "cancelled" ||
    result.changes.length !== 1 ||
    result.changes[0]?.kind !== "remove-role" ||
    result.fulfillment[0]?.applied !== true ||
    stillHasRole
  ) {
    process.stderr.write("membership reconciliation smoke failed: expected latest cancelled entitlement to remove islander role\n");
    return 1;
  }

  process.stdout.write(`membership-reconcile-smoke: entitlements=${entitlements.length} changes=${result.changes.length}\n`);
  process.stdout.write(`latest status: ${entitlements[0].status}\n`);
  process.stdout.write(`member still has role: ${stillHasRole ? "yes" : "no"}\n`);
  return 0;
}

async function membershipServiceSmoke() {
  const root = await mkdtemp(path.join(tmpdir(), "turntide-membership-service-"));
  const file = path.join(root, "membership", "entitlements.json");
  const roleId = "role-islander";
  const sourceEnv = {
    ...processEnv(),
    DISCORD_GUILD_ID: guildId,
    TURNTIDE_ISLANDER_ROLE_ID: roleId,
    STRIPE_TURNTIDE_ISLANDER_MONTHLY_PRICE_ID: "price_monthly",
    STRIPE_TURNTIDE_ISLANDER_STABLECOIN_PRICE_ID: "price_stablecoin",
  };

  await recordMembershipEntitlement(file, {
    id: "evt-active",
    provider: "stripe-checkout",
    guildId,
    userId: "member-1",
    planId: "islander-monthly",
    roleId,
    status: "active",
    providerCustomerId: "cus_1",
    providerSubscriptionId: "sub_1",
  });
  await recordMembershipEntitlement(file, {
    id: "evt-cancelled",
    provider: "stripe-checkout",
    guildId,
    userId: "member-1",
    planId: "islander-monthly",
    roleId,
    status: "cancelled",
    providerCustomerId: "cus_1",
    providerSubscriptionId: "sub_1",
  });

  const guild = inMemoryGuild({
    guild: { id: guildId, name: communityName },
    roles: [{ id: roleId, name: membershipGate.role }],
  });
  await guild.transport.assignRole(guildId, "member-1", roleId);
  const logs = [];
  const result = await reconcileStoredMemberships({
    env: sourceEnv,
    entitlementsFile: file,
    transport: guild.transport,
    log: (message) => logs.push(message),
  });
  const stillHasRole = guild.memberRolesNow().get("member-1")?.includes(roleId) === true;
  const logged = logs.some((message) => message.includes("membership reconciliation"));
  if (
    result.entitlements.length !== 1 ||
    result.entitlements[0]?.status !== "cancelled" ||
    result.changes.length !== 1 ||
    result.changes[0]?.kind !== "remove-role" ||
    result.fulfillment[0]?.applied !== true ||
    stillHasRole ||
    !logged
  ) {
    process.stderr.write("membership service smoke failed: expected stored entitlement reconciliation to remove islander role and log summary\n");
    return 1;
  }

  process.stdout.write(`membership-service-smoke: entitlements=${result.entitlements.length} changes=${result.changes.length}\n`);
  process.stdout.write(`latest status: ${result.entitlements[0].status}\n`);
  process.stdout.write(`member still has role: ${stillHasRole ? "yes" : "no"}\n`);
  process.stdout.write(`service logged: ${logged ? "yes" : "no"}\n`);
  return 0;
}

async function preflight() {
  const smokeStatus = await smoke();
  process.stdout.write("\n");
  const readinessStatus = check();
  return smokeStatus === 0 && readinessStatus === 0 ? 0 : 1;
}

async function probe() {
  const state = readiness();
  if (state.missing.length > 0) {
    printReadiness(state);
    process.stderr.write("refusing live probe until readiness is resolved\n");
    return 1;
  }

  const c = state.config;
  const transport = discordRestTransport({});
  const applicationId = await transport.getApplicationId();
  const guild = await resolveGuildByName(transport, c.serverName);
  if (guild === null) {
    process.stderr.write(`probe failed: bot cannot resolve server "${c.serverName}"\n`);
    return 1;
  }

  const infer = openaiAgentInfer(c.endpoint ?? "nvidia");
  const model = c.model ?? defaultModelFor(c.endpoint ?? "nvidia");
  const result = await infer({
    model,
    maxTokens: 32,
    system: "You are a Turntide Islands steward readiness probe. Reply with exactly: turntide live probe ready",
    messages: [{
      role: "user",
      content: "Confirm the Turntide Islands Discord steward can reach this OpenAI-compatible endpoint.",
    }],
  });
  const text = result.text.trim();
  if (text.length === 0) {
    process.stderr.write("probe failed: endpoint returned an empty response\n");
    return 1;
  }

  process.stdout.write(`discord application: ${applicationId}\n`);
  process.stdout.write(`discord guild: ${guild.name} (${guild.id})\n`);
  process.stdout.write(`endpoint: ${result.endpoint}\n`);
  process.stdout.write(`model: ${result.model}\n`);
  process.stdout.write(`endpoint response bytes: ${text.length}\n`);
  process.stdout.write("probe: live Discord token and OpenAI-compatible endpoint answered\n");
  return 0;
}

async function cultivate() {
  const state = readiness();
  if (state.missing.length > 0) {
    printReadiness(state);
    process.stderr.write("refusing live cultivation until readiness is resolved\n");
    return 1;
  }

  const c = state.config;
  const transport = discordRestTransport({});
  const guild = await resolveGuildByName(transport, c.serverName);
  if (guild === null) {
    process.stderr.write(`cultivate failed: bot cannot resolve server "${c.serverName}"\n`);
    return 1;
  }

  const endpoint = c.endpoint ?? "nvidia";
  const result = await runDiscordOrganizer(openaiAgentInfer(endpoint), transport, {
    id: `discord-organizer:${guild.id}:cultivate`,
    guildId: guild.id,
    goal: autonomousCultivationGoal,
    system: c.charter,
    model: c.model ?? defaultModelFor(endpoint),
    maxSteps: integerEnv("TTI_CULTIVATE_STEPS", 16),
    ...(c.capabilities === undefined ? {} : { capabilities: c.capabilities }),
    ...(c.gate === undefined ? {} : { gate: c.gate }),
    ...(c.dataRoot === undefined ? {} : { root: c.dataRoot }),
    ...(c.adminChannelId === undefined ? {} : { adminChannelId: c.adminChannelId }),
    ...(c.adminUserId === undefined ? {} : { adminUserId: c.adminUserId }),
    membership: membershipService(),
  });

  process.stdout.write(`cultivate: ${result.stop} steps=${result.steps} facts=${result.facts.length}\n`);
  process.stdout.write(`summary: ${result.summary ?? "(none)"}\n`);
  return result.stop === "contested-tool" ? 1 : 0;
}

async function cultivateSmoke() {
  const guild = inMemoryGuild({
    guild: { id: guildId, name: communityName },
    channels: [
      { id: "weather-report", name: "weather-report" },
      { id: "admin-channel", name: "admin-channel" },
    ],
  });
  let turn = 0;
  const result = await runDiscordOrganizer(async () => {
    turn += 1;
    if (turn === 1) {
      return {
        endpoint: "injected",
        model: "turntide-cultivation-smoke",
        text: "",
        toolCalls: [
          { name: "create_channel", arguments: { name: "start-here", topic: "Orientation for Turntide Islands." } },
          { name: "register_command", arguments: { name: "ask", description: "Ask the Turntide steward for context or help." } },
          { name: "send_message", arguments: { channel_id: "weather-report", content: "Turntide cultivation smoke check: the steward can proactively improve the server." } },
          { name: "recommend_to_moderators", arguments: { matter: "Human escalation smoke check", reason: "Prove the steward pings the admin channel instead of silently holding human-only work." } },
        ],
        raw: {},
        promptBytes: 0,
      };
    }
    return {
      endpoint: "injected",
      model: "turntide-cultivation-smoke",
      text: "",
      toolCalls: [{ name: "done", arguments: { summary: "created orientation lane, registered ask command, posted a weather-report check, and pinged admin escalation" } }],
      raw: {},
      promptBytes: 0,
    };
  }, guild.transport, {
    id: `discord-organizer:${guildId}:cultivation-smoke`,
    guildId,
    goal: autonomousCultivationGoal,
    system: stewardSystem,
    capabilities: grantedCapabilities,
    maxSteps: 3,
    gate: "enforce",
    root: path.join(siteRoot, "data", "smoke"),
    adminChannelId: "admin-channel",
    adminUserId: "admin-user",
    membership: membershipService(),
  });

  const createdStartHere = guild.channelsNow().some((channel) => channel.name === "start-here");
  const registeredAsk = guild.commandsNow().some((command) => command.name === "ask");
  const posted = guild.posts.some((post) => post.channelId === "weather-report");
  const adminPinged = guild.posts.some((post) => post.channelId === "admin-channel" && post.content.includes("<@admin-user>"));
  if (!createdStartHere || !registeredAsk || !posted || !adminPinged || result.stop !== "final-answer") {
    process.stderr.write("cultivation smoke failed: expected channel, command, public post, admin ping, and final answer\n");
    return 1;
  }
  process.stdout.write(`cultivation-smoke: ${result.stop} steps=${result.steps} facts=${result.facts.length}\n`);
  process.stdout.write(`channels: ${guild.channelsNow().map((channel) => channel.name).join(", ")}\n`);
  process.stdout.write(`commands: ${guild.commandsNow().map((command) => `/${command.name}`).join(", ")}\n`);
  process.stdout.write(`posts: ${guild.posts.length}\n`);
  process.stdout.write(`admin pinged: ${adminPinged ? "yes" : "no"}\n`);
  return 0;
}

async function archipelagoSmoke() {
  const guild = inMemoryGuild({
    guild: { id: guildId, name: communityName },
    channels: [
      { id: "weather-report", name: "weather-report" },
      { id: "ai-archipelago", name: "ai-archipelago" },
      { id: "admin-channel", name: "admin-channel" },
    ],
  });
  let turn = 0;
  const result = await runDiscordOrganizer(async () => {
    turn += 1;
    if (turn === 1) {
      return {
        endpoint: "injected",
        model: "turntide-archipelago-smoke",
        text: "",
        toolCalls: [
          {
            name: "send_message",
            arguments: {
              channel_id: "ai-archipelago",
              content: [
                "AI Archipelago smoke rehearsal",
                "Tidewatcher: public weather-report should stay compact and sourced.",
                "Vault Keeper: move durable context into vault-briefings only after provenance is checked.",
                "Harbor Master: keep this transcript contained until a human or steward summary promotes it.",
              ].join("\n"),
            },
          },
          {
            name: "recommend_to_moderators",
            arguments: {
              matter: "AI Archipelago rehearsal completed",
              reason: "Bot-to-bot experiments should remain in ai-archipelago until summarized and intentionally promoted.",
            },
          },
        ],
        raw: {},
        promptBytes: 0,
      };
    }
    return {
      endpoint: "injected",
      model: "turntide-archipelago-smoke",
      text: "",
      toolCalls: [{
        name: "done",
        arguments: {
          summary: "ran a contained ai-archipelago bot-to-bot rehearsal and alerted the admin lane",
        },
      }],
      raw: {},
      promptBytes: 0,
    };
  }, guild.transport, {
    id: `discord-organizer:${guildId}:archipelago-smoke`,
    guildId,
    goal: "Run a contained bot-to-bot rehearsal in ai-archipelago and summarize it for admin review without posting to public lanes.",
    system: stewardSystem,
    capabilities: grantedCapabilities,
    maxSteps: 3,
    gate: "enforce",
    root: path.join(siteRoot, "data", "smoke"),
    adminChannelId: "admin-channel",
    adminUserId: "admin-user",
    membership: membershipService(),
  });

  const archipelagoPosts = guild.posts.filter((post) => post.channelId === "ai-archipelago");
  const publicPosts = guild.posts.filter((post) => post.channelId === "weather-report");
  const adminPinged = guild.posts.some((post) => post.channelId === "admin-channel" && post.content.includes("<@admin-user>"));
  const transcriptPosted = archipelagoPosts.some((post) =>
    post.content.includes("Tidewatcher:") && post.content.includes("Vault Keeper:") && post.content.includes("Harbor Master:")
  );
  if (result.stop !== "final-answer" || !transcriptPosted || publicPosts.length !== 0 || !adminPinged) {
    process.stderr.write("archipelago smoke failed: expected contained ai-archipelago transcript, no public posts, admin ping, and final answer\n");
    return 1;
  }

  process.stdout.write(`archipelago-smoke: ${result.stop} steps=${result.steps} facts=${result.facts.length}\n`);
  process.stdout.write(`ai-archipelago posts: ${archipelagoPosts.length}\n`);
  process.stdout.write(`public posts: ${publicPosts.length}\n`);
  process.stdout.write(`admin pinged: ${adminPinged ? "yes" : "no"}\n`);
  return 0;
}

async function main() {
  const command = process.argv[2] ?? "check";
  switch (command) {
    case "check": return check();
    case "discover-env": return await discoverEnv();
    case "live-permissions": return await livePermissions();
    case "measure": return await measure();
    case "ingest-history": return await ingestHistory();
    case "ingest-history-smoke": return await ingestHistorySmoke();
    case "run": return await run();
    case "invite": return invite();
    case "bootstrap": return await bootstrap();
    case "bootstrap-smoke": return await bootstrapSmoke();
    case "preflight": return await preflight();
    case "probe": return await probe();
    case "smoke": return await smoke();
    case "context-smoke": return await contextSmoke();
    case "gateway-smoke": return await gatewaySmoke();
    case "supervision-smoke": return await supervisionSmoke();
    case "archipelago-smoke": return await archipelagoSmoke();
    case "membership-reconcile": return await membershipReconcile();
    case "membership-reconcile-smoke": return await membershipReconcileSmoke();
    case "membership-service-smoke": return await membershipServiceSmoke();
    case "cultivate": return await cultivate();
    case "cultivate-smoke": return await cultivateSmoke();
    case "help":
    case "--help":
    case "-h":
      usage(0);
    default:
      process.stderr.write(`unknown command: ${command}\n`);
      usage(2);
  }
}

main().then((code) => { if (code >= 0) process.exit(code); }).catch((error) => {
  process.stderr.write(`turntide steward: ${(error).message}\n`);
  process.exit(1);
});
