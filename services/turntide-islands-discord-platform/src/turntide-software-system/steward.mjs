#!/usr/bin/env node
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { armedFreeProviders, dispatchFreeFirst } from "@red-cup-engineering/computer-inference-engine/openai/provider-runtime";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { bootstrapChannels, bootstrapCommands, communityName, laneByName, membershipProgram, persona, renderOrchestrationSystem, renderPersonaSystem } from "./index.mjs";
import {
  DiscordRestTransport,
  InMemoryDiscordTransport,
  inviteUrl,
  normalizedName,
  turntidePermissionBits,

} from "./discord.mjs";
import { sameOverwriteSet } from "./permission-relation.mjs";
import { climateWireStoreDir } from "./climate-signals.mjs";
import { ingestClimateSignals } from "./signal-ingest.mjs";
import { runZeloTick } from "./zelo-tick.mjs";
import { expressionsRoot, projectExpressions } from "./expressions.mjs";
import { recordRoutineCandidateIntake, routineCandidateForAuthor, routineCandidateInboxForAuthor, routineCandidateObservation } from "./civic-routine-candidates.mjs";
import { beginProposalSubmission, completeProposalSubmission, proposalDraftForAuthor, proposalDraftInboxForAuthor, proposalDraftRequestedAct, proposalDraftSubmitHandle, proposalDraftUpdateCommand, recordProposalDraftFieldUpdate, recordProposalDraftIntake } from "./civic-proposal-drafts.mjs";
import { runCivicScheduledRoutines } from "./civic-scheduled-routines.mjs";
import { buildCivicDocket, formatCivicDocket } from "./civic-docket.mjs";
import { env, integerEnv, loadRuntimeEnv, packageRoot, publicTurntideRoot } from "./env.mjs";
import {
  entitlement,
  membershipConfig,
  readMembershipEntitlements,
  reconcileMembershipEntitlements,
  recordMembershipEntitlement,

} from "./membership.mjs";

const memberLaneAllow = String((1n << 10n) | (1n << 11n) | (1n << 16n));
const viewChannel = String(1n << 10n);

if (isMain()) {
  loadRuntimeEnv();
  main((process.argv[2] ?? "check")).then((code) => {
    process.exitCode = code;
  }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

export async function main(command, source = process.env) {
  if (command === "check") return check(source);
  if (command === "discover-env") return discoverEnv(source);
  if (command === "live-permissions") return livePermissions(source);
  if (command === "measure") return measure(source);
  if (command === "invite") return printInvite(source);
  if (command === "bootstrap") return liveBootstrap(source);
  if (command === "bootstrap-smoke") return bootstrapSmoke();
  if (command === "probe") return probe(source);
  if (command === "ingest-history") return liveIngestHistory(source);
  if (command === "ingest-history-smoke") return ingestHistorySmoke();
  if (command === "ingest-signals") return liveIngestSignals(source);
  if (command === "tick") return liveTick(source);
  if (command === "civic-schedule") return liveCivicSchedule(source);
  if (command === "membership-reconcile") return liveMembershipReconcile(source);
  if (command === "membership-reconcile-smoke") return membershipReconcileSmoke();
  if (command === "membership-service-smoke") return membershipServiceSmoke();
  if (command === "smoke") return stewardSmoke();
  if (command === "context-smoke") return contextSmoke();
  if (command === "gateway-smoke") return gatewaySmoke();
  if (command === "supervision-smoke") return supervisionSmoke();
  if (command === "archipelago-smoke") return archipelagoSmoke();
  if (command === "cultivate") return liveCultivate(source);
  if (command === "cultivate-smoke") return cultivateSmoke();
  if (command === "expressions") return liveExpressions(source);
  if (command === "expressions-smoke") return expressionsSmoke(source);
  if (command === "preflight") {
    const smoke = await stewardSmoke();
    if (smoke !== 0) return smoke;
    return check(source);
  }
  if (command === "run") return runPollingSteward(source);
  usage();
  return 2;
}

async function discoverEnv(source) {
  const transport = new DiscordRestTransport({ env: source });
  const applicationId = await transport.getApplicationId();
  const guilds = await transport.listGuilds();
  const serverName = env("DISCORD_SERVER_NAME", source) ?? communityName;
  const guild = env("DISCORD_GUILD_ID", source) === undefined
    ? guilds.find((candidate) => candidate.name === serverName) ?? guilds[0]
    : await transport.getGuild(env("DISCORD_GUILD_ID", source));
  if (guild === undefined) {
    process.stderr.write(`discover-env failed: bot cannot see any guilds matching ${serverName}\n`);
    return 1;
  }
  const channels = await transport.listChannels(guild.id);
  const roles = await transport.listRoles(guild.id);
  const adminChannel = channels.find((channel) => normalizedName(channel.name) === "admin-channel");
  const islander = roles.find((role) => normalizedName(role.name) === normalizedName(membershipProgram.role));
  process.stdout.write(`DISCORD_CLIENT_ID=${applicationId}\n`);
  process.stdout.write(`DISCORD_GUILD_ID=${guild.id}\n`);
  if (guild.ownerId !== undefined) process.stdout.write(`DISCORD_ADMIN_USER_ID=${env("DISCORD_ADMIN_USER_ID", source) ?? guild.ownerId}\n`);
  if (adminChannel !== undefined) process.stdout.write(`DISCORD_ADMIN_CHANNEL_ID=${adminChannel.id}\n`);
  if (islander !== undefined) process.stdout.write(`TURNTIDE_ISLANDER_ROLE_ID=${islander.id}\n`);
  if (adminChannel === undefined || islander === undefined) process.stdout.write("next: run steward:bootstrap to create missing admin/member surfaces\n");
  return 0;
}

async function livePermissions(source) {
  const clientId = env("DISCORD_CLIENT_ID", source);
  if (clientId === undefined) {
    process.stderr.write("live-permissions blocked by DISCORD_CLIENT_ID\n");
    return 1;
  }
  const guildId = env("DISCORD_GUILD_ID", source);
  if (guildId === undefined) {
    process.stderr.write("live-permissions blocked by DISCORD_GUILD_ID\n");
    return 1;
  }
  const transport = new DiscordRestTransport({ env: source });
  const me = await transport.getCurrentUser();
  const member = await discordApi(source, "GET", `/guilds/${guildId}/members/${me.id}`);
  const roleIds = new Set([guildId, ...arrayOfStrings(member["roles"])]);
  const roles = await transport.listRoles(guildId);
  let actual = 0n;
  for (const role of roles) if (roleIds.has(role.id)) actual |= BigInt(role.permissions ?? "0");
  const missing = turntidePermissionBits & ~actual;
  process.stdout.write(`bot: ${me.username} (${me.id})\n`);
  process.stdout.write(`required permissions: ${turntidePermissionBits}\n`);
  process.stdout.write(`actual permissions: ${actual}\n`);
  process.stdout.write(`permission readiness: ${missing === 0n ? "ready" : `missing ${missing}`}\n`);
  if (missing !== 0n) process.stdout.write(`repair invite: ${inviteUrl(clientId)}&guild_id=${guildId}&disable_guild_select=true\n`);
  return missing === 0n ? 0 : 1;
}

async function measure(source) {
  const guildId = env("DISCORD_GUILD_ID", source);
  if (guildId === undefined) {
    process.stderr.write("measure blocked by DISCORD_GUILD_ID\n");
    return 1;
  }
  const transport = new DiscordRestTransport({ env: source });
  const result = await measureWithTransport(transport, guildId);
  await appendMeasurement(env("TTI_AGENT_DATA_ROOT", source) ?? path.join(packageRoot, "data", "agent"), result);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return 0;
}

export async function measureWithTransport(transport, guildId) {
  const [guild, channels, roles] = await Promise.all([
    transport.getGuild(guildId),
    transport.listChannels(guildId),
    transport.listRoles(guildId),
  ]);
  let messagesSeen = 0;
  for (const channel of channels) {
    messagesSeen += (await transport.listMessages(channel.id, 10).catch(() => [])).length;
  }
  const canonical = new Set(bootstrapChannels.map((channel) => channel.name));
  return {
    kind: "turntide-islands.measurement",
    observedAt: new Date().toISOString(),
    guild: { id: guild.id, name: guild.name },
    channels: channels.length,
    roles: roles.length,
    recentMessagesSeen: messagesSeen,
    canonicalChannelsPresent: channels.filter((channel) => canonical.has(channel.name)).length,
    canonicalChannelsExpected: canonical.size,
    accessLanes: {
      public: bootstrapChannels.filter((lane) => lane.access === "public").length,
      member: bootstrapChannels.filter((lane) => lane.access === "member").length,
      staff: bootstrapChannels.filter((lane) => lane.access === "staff").length,
    },
    verdict: channels.filter((channel) => canonical.has(channel.name)).length >= canonical.size ? "canonical-surface-present" : "canonical-surface-incomplete",
  };
}

export function readiness(source = process.env)

 {
  const missing = [];
  const tokenPresent = env("DISCORD_BOT_TOKEN", source) !== undefined || env("DISCORD_TOKEN", source) !== undefined;
  const endpointReady = inferenceReadiness(source).ready;
  for (const name of ["DISCORD_CLIENT_ID", "DISCORD_GUILD_ID", "DISCORD_ADMIN_USER_ID", "DISCORD_ADMIN_CHANNEL_ID", "TURNTIDE_ISLANDER_ROLE_ID"]) {
    if (env(name, source) === undefined) missing.push(name);
  }
  if (!tokenPresent) missing.push("DISCORD_BOT_TOKEN or DISCORD_TOKEN");
  if (!endpointReady) missing.push(inferenceReadiness(source).label);
  return {
    missing,
    clientId: env("DISCORD_CLIENT_ID", source),
    tokenPresent,
    guildId: env("DISCORD_GUILD_ID", source),
    adminUserId: env("DISCORD_ADMIN_USER_ID", source),
    adminChannelId: env("DISCORD_ADMIN_CHANNEL_ID", source),
    islanderRoleId: env("TURNTIDE_ISLANDER_ROLE_ID", source),
    endpointReady,
  };
}

function check(source) {
  const state = readiness(source);
  process.stdout.write(`server: ${env("DISCORD_SERVER_NAME", source) ?? communityName}\n`);
  process.stdout.write(`client id: ${state.clientId === undefined ? "absent" : "present"}\n`);
  process.stdout.write(`bot token: ${state.tokenPresent ? "present" : "absent"}\n`);
  process.stdout.write(`guild id: ${state.guildId ?? "absent"}\n`);
  process.stdout.write(`admin channel id: ${state.adminChannelId ?? "absent"}\n`);
  process.stdout.write(`admin user id: ${state.adminUserId ?? "absent"}\n`);
  process.stdout.write(`islander role id: ${state.islanderRoleId ?? "absent"}\n`);
  process.stdout.write(`inference: ${inferenceReadiness(source).label}\n`);
  process.stdout.write(`required Discord permissions: ${turntidePermissionBits}\n`);
  process.stdout.write(`readiness: ${state.missing.length === 0 ? "ready to run steward" : `blocked by ${state.missing.join(", ")}`}\n`);
  return state.missing.length === 0 ? 0 : 1;
}

function printInvite(source) {
  const clientId = env("DISCORD_CLIENT_ID", source);
  if (clientId === undefined) {
    process.stderr.write("invite blocked by DISCORD_CLIENT_ID\n");
    return 1;
  }
  process.stdout.write(`${inviteUrl(clientId)}\n`);
  return 0;
}

async function liveBootstrap(source) {
  const guildId = env("DISCORD_GUILD_ID", source);
  const adminUserId = env("DISCORD_ADMIN_USER_ID", source);
  if (guildId === undefined || adminUserId === undefined) {
    process.stderr.write("bootstrap blocked by DISCORD_GUILD_ID and DISCORD_ADMIN_USER_ID\n");
    return 1;
  }
  const result = await bootstrapWithTransport(new DiscordRestTransport({ env: source }), guildId, {
    adminUserId,
    adminChannelId: env("DISCORD_ADMIN_CHANNEL_ID", source),
  });
  printBootstrapResult(result);
  return 0;
}

async function probe(source) {
  const transport = new DiscordRestTransport({ env: source });
  const [applicationId, me] = await Promise.all([transport.getApplicationId(), transport.getCurrentUser()]);
  process.stdout.write(`discord application: ${applicationId}\n`);
  process.stdout.write(`discord bot: ${me.username} (${me.id})\n`);
  const readiness = inferenceReadiness(source);
  if (!readiness.ready) {
    process.stderr.write(`probe blocked by ${readiness.label}\n`);
    return 1;
  }
  const answer = await inferAnswer("Return the words Turntide probe ready.", source);
  process.stdout.write(`agent probe: ${answer.slice(0, 200)}\n`);
  return 0;
}

export async function bootstrapWithTransport(
  transport,
  guildId,
  options,
) {
  const guild = await transport.getGuild(guildId);
  const bot = await transport.getCurrentUser();
  const role = await ensureRole(transport, guild.id, membershipProgram.role);
  const channels = [];
  for (const spec of bootstrapChannels) {
    channels.push(await ensureChannel(transport, guild.id, spec, overwritesFor(spec.access, guild.id, options.adminUserId, bot.id, role.id)));
  }
  const applicationId = await transport.getApplicationId();
  const existingCommands = await transport.listCommands(applicationId, guild.id);
  const commands = [];
  for (const spec of bootstrapCommands) {
    const existing = existingCommands.find((command) => normalizedName(command.name) === normalizedName(spec.name));
    if (existing === undefined) {
      const created = await transport.registerCommand(applicationId, guild.id, spec);
      commands.push({ kind: "created", name: created.name, id: created.id });
    } else if (
      existing.description !== spec.description
      || !sameCommandOptions(existing.options, spec.options)
      || existing.defaultMemberPermissions !== spec.defaultMemberPermissions
      || (existing.dmPermission ?? false) !== (spec.dmPermission ?? false)
    ) {
      const updated = await transport.updateCommand(applicationId, guild.id, existing.id, spec);
      commands.push({ kind: "updated", name: updated.name, id: updated.id });
    } else {
      commands.push({ kind: "found", name: existing.name, id: existing.id });
    }
  }
  const resolvedChannels = await transport.listChannels(guild.id);
  const adminChannel = (options.adminChannelId === undefined ? undefined : resolvedChannels.find((channel) => channel.id === options.adminChannelId))
    ?? resolvedChannels.find((channel) => normalizedName(channel.name) === "admin-channel");
  if (adminChannel === undefined) throw new Error("admin-channel was not available after bootstrap");
  const notice = await transport.createMessage(adminChannel.id, {
    content: [
      `<@${options.adminUserId}> Turntide bootstrap completed.`,
      `Membership role: ${role.name} (${role.id}).`,
      `Preserve DISCORD_ADMIN_CHANNEL_ID=${adminChannel.id}.`,
      `Preserve TURNTIDE_ISLANDER_ROLE_ID=${role.id}.`,
    ].join("\n"),
    allowedMentions: { users: [options.adminUserId] },
  });
  return {
    guildId: guild.id,
    guildName: guild.name,
    channels,
    role,
    commands,
    adminNotice: { channel: adminChannel.id, message: notice.id },
  };
}

async function ensureRole(transport, guildId, roleName) {
  const existing = (await transport.listRoles(guildId)).find((role) => normalizedName(role.name) === normalizedName(roleName));
  if (existing !== undefined) return { kind: "found", name: existing.name, id: existing.id };
  const created = await transport.createRole(guildId, { name: roleName, mentionable: false });
  return { kind: "created", name: created.name, id: created.id };
}

async function ensureChannel(
  transport,
  guildId,
  spec,
  permissionOverwrites,
) {
  const existing = (await transport.listChannels(guildId)).find((channel) => normalizedName(channel.name) === normalizedName(spec.name));
  if (existing === undefined) {
    const created = await transport.createChannel(guildId, { name: spec.name, topic: spec.topic, permissionOverwrites });
    return { kind: "created", name: created.name, id: created.id };
  }
  if (existing.topic !== spec.topic || !sameOverwriteSet(existing.permissionOverwrites, permissionOverwrites)) {
    const updated = await transport.modifyChannel(existing.id, { topic: spec.topic, permissionOverwrites });
    return { kind: "updated", name: updated.name, id: updated.id };
  }
  return { kind: "found", name: existing.name, id: existing.id };
}

function sameCommandOptions(
  left,
  right,
) {
  const normalize = (options) => (options ?? []).map((option) => ({ name: option.name, description: option.description, required: option.required ?? false }));
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

function overwritesFor(
  access,
  guildId,
  adminUserId,
  botUserId,
  islanderRoleId,
) {
  // "Public" must be explicit. The live guild deliberately carries no
  // VIEW_CHANNEL permission on @everyone, so omitting an overwrite made every
  // supposedly public lane invisible. Keep the public promise on each lane;
  // category placement must never silently revoke it.
  if (access === "public") return [{ id: guildId, type: "role", allow: memberLaneAllow, deny: "0" }];
  return [
    { id: guildId, type: "role", allow: "0", deny: viewChannel },
    { id: adminUserId, type: "member", allow: memberLaneAllow, deny: "0" },
    { id: botUserId, type: "member", allow: memberLaneAllow, deny: "0" },
    ...(access === "member" ? [{ id: islanderRoleId, type: "role", allow: memberLaneAllow, deny: "0" }] : []),
  ];
}

async function bootstrapSmoke() {
  const transport = new InMemoryDiscordTransport();
  const guildId = (await transport.listGuilds())[0].id;
  const result = await bootstrapWithTransport(transport, guildId, { adminUserId: "emsenn" });
  const memberChannels = result.channels.filter((channel) => ["serious-threading", "vault-briefings", "archive-desk", "receipts"].includes(channel.name));
  if (result.channels.length !== bootstrapChannels.length || result.commands.length !== bootstrapCommands.length || memberChannels.length !== 4) {
    process.stderr.write("bootstrap smoke failed\n");
    return 1;
  }
  printBootstrapResult(result);
  return 0;
}

export async function ingestHistoryWithTransport(
  transport,
  guildId,
  options,
) {
  const channels = await transport.listChannels(guildId);
  const seen = options.seen ?? new Set();
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
    for (const message of messages) {
      if (seen.has(message.id)) continue;
      seen.add(message.id);
      await appendDiscordMessage(options.dataRoot, channel, message);
      messagesAdded += 1;
    }
  }
  return { channelsSeen: channels.length, channelsRead, channelsSkipped, messagesSeen, messagesAdded };
}

async function liveIngestHistory(source) {
  const guildId = env("DISCORD_GUILD_ID", source);
  if (guildId === undefined) {
    process.stderr.write("ingest-history blocked by DISCORD_GUILD_ID\n");
    return 1;
  }
  const result = await ingestHistoryWithTransport(new DiscordRestTransport({ env: source }), guildId, {
    dataRoot: env("TTI_AGENT_DATA_ROOT", source) ?? path.join(packageRoot, "data", "agent"),
    limit: integerEnv("TTI_INGEST_HISTORY_LIMIT", 50, source),
  });
  printIngestResult(result);
  return 0;
}

async function liveTick(source) {
  const result = await runZeloTick(source);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return 0;
}

async function liveCivicSchedule(source) {
  const guildId = env("DISCORD_GUILD_ID", source);
  if (guildId === undefined) {
    process.stderr.write("civic-schedule blocked by DISCORD_GUILD_ID\n");
    return 1;
  }
  const transport = new DiscordRestTransport({ env: source });
  const channels = await transport.listChannels(guildId);
  const dataRoot = env("TTI_AGENT_DATA_ROOT", source) ?? path.join(packageRoot, "data", "agent");
  const result = await runCivicScheduledRoutines({ transport, channels, source, dataRoot });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result.deliveries.some((delivery) => delivery.ok === false) ? 1 : 0;
}

async function liveIngestSignals(source) {
  const storeDir = climateWireStoreDir(source);
  const results = await ingestClimateSignals(storeDir);
  let failed = 0;
  for (const result of results) {
    if (result.error !== undefined) {
      failed += 1;
      process.stderr.write(`${result.witness}: FAILED - ${result.error}\n`);
    } else {
      process.stdout.write(`${result.witness}: ${result.written} written, ${result.skipped} skipped\n`);
    }
  }
  return failed === results.length && results.length > 0 ? 1 : 0;
}

async function ingestHistorySmoke() {
  const transport = new InMemoryDiscordTransport();
  const guildId = (await transport.listGuilds())[0].id;
  const channel = await transport.createChannel(guildId, { name: "weather-report", topic: "weather" });
  transport.seedUserMessage(channel.id, "Heat dome note for the archive.");
  const seen = new Set();
  const dataRoot = path.join(packageRoot, ".tmp", "ingest-smoke");
  const first = await ingestHistoryWithTransport(transport, guildId, { dataRoot, limit: 50, seen });
  const second = await ingestHistoryWithTransport(transport, guildId, { dataRoot, limit: 50, seen });
  if (first.messagesAdded !== 1 || second.messagesAdded !== 0) return 1;
  printIngestResult(first);
  process.stdout.write(`second run added: ${second.messagesAdded}\n`);
  return 0;
}

async function appendDiscordMessage(dataRoot, channel, message) {
  const day = message.timestamp.slice(0, 10);
  const target = path.join(dataRoot, "log", day.slice(0, 4), day.slice(5, 7), day.slice(8, 10), `${day}-discord-organizer-log.jsonl`);
  await mkdir(path.dirname(target), { recursive: true });
  await appendFile(target, `${JSON.stringify({
    t: new Date().toISOString(),
    kind: "discord-message",
    source: "turntide-steward",
    channel: message.channelId,
    channelName: channel.name,
    message: message.id,
    author: message.authorId,
    actor: message.authorName,
    authorBot: message.authorBot,
    content: message.content,
    contentPresent: message.content.length > 0,
    messageTimestamp: message.timestamp,
    replyToId: message.replyToId,
  })}\n`);
}

async function liveMembershipReconcile(source) {
  const config = membershipConfig(source);
  const entitlements = await readMembershipEntitlements(config.entitlementsFile);
  const result = await reconcileMembershipEntitlements(new DiscordRestTransport({ env: source }), config, entitlements);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return 0;
}

async function membershipReconcileSmoke() {
  const transport = new InMemoryDiscordTransport();
  const guildId = (await transport.listGuilds())[0].id;
  const role = await transport.createRole(guildId, { name: membershipProgram.role });
  const config = {
    guildId,
    roleId: role.id,
    tiers: [],
    entitlementsFile: path.join(packageRoot, ".tmp", "membership-smoke.json"),
  };
  const active = entitlement({ id: "sub-1-active", userId: "member-turntide", status: "active", observedAt: "2026-07-02T00:00:00.000Z" });
  const cancelled = entitlement({ id: "sub-1-cancelled", userId: "member-turntide", status: "cancelled", observedAt: "2026-07-02T00:01:00.000Z" });
  await recordMembershipEntitlement(config.entitlementsFile, active);
  const afterActive = await reconcileMembershipEntitlements(transport, config, [active]);
  await recordMembershipEntitlement(config.entitlementsFile, cancelled);
  const afterCancelled = await reconcileMembershipEntitlements(transport, config, [active, cancelled]);
  if (afterActive.applied[0]?.action !== "add" || afterCancelled.applied[0]?.action !== "remove" || transport.memberHasRole(guildId, "member-turntide", role.id)) {
    process.stderr.write("membership reconcile smoke failed\n");
    return 1;
  }
  process.stdout.write(`${JSON.stringify(afterCancelled, null, 2)}\n`);
  return 0;
}

async function membershipServiceSmoke() {
  const transport = new InMemoryDiscordTransport();
  const guildId = (await transport.listGuilds())[0].id;
  const role = await transport.createRole(guildId, { name: membershipProgram.role });
  const active = entitlement({ id: "service-active", userId: "member-service", status: "active", observedAt: "2026-07-02T00:00:00.000Z" });
  const cancelled = entitlement({ id: "service-cancelled", userId: "member-service", status: "cancelled", observedAt: "2026-07-02T00:02:00.000Z" });
  const config = { guildId, roleId: role.id, tiers: [], entitlementsFile: path.join(packageRoot, ".tmp", "membership-service-smoke.json") };
  await recordMembershipEntitlement(config.entitlementsFile, active);
  await recordMembershipEntitlement(config.entitlementsFile, cancelled);
  const result = await reconcileMembershipEntitlements(transport, config, await readMembershipEntitlements(config.entitlementsFile));
  if (transport.memberHasRole(guildId, "member-service", role.id)) return 1;
  process.stdout.write(`membership-service-smoke: entitlements=${result.entitlements.length} applied=${result.applied.length}\n`);
  return 0;
}

async function stewardSmoke() {
  const transport = new InMemoryDiscordTransport();
  const guildId = (await transport.listGuilds())[0].id;
  const result = await bootstrapWithTransport(transport, guildId, { adminUserId: "emsenn" });
  const weather = (await transport.listChannels(guildId)).find((channel) => channel.name === "weather-report");
  if (weather === undefined) return 1;
  transport.seedUserMessage(weather.id, "What should this server help people do during a heat wave?");
  const reply = await answerMessage(transport, weather, (await transport.listMessages(weather.id, 10)).find((message) => !message.authorBot));
  if (!reply.content.includes("Turntide Islands")) return 1;
  process.stdout.write(`smoke bootstrap channels: ${result.channels.length}\n`);
  process.stdout.write(`smoke reply: ${reply.content}\n`);
  return 0;
}

async function contextSmoke() {
  const transport = new InMemoryDiscordTransport();
  const guildId = (await transport.listGuilds())[0].id;
  const channel = await transport.createChannel(guildId, { name: "weather-report" });
  const dataRoot = path.join(packageRoot, ".tmp", "context-smoke");
  const first = transport.seedUserMessage(channel.id, "The vault key phrase is blue kelp archive.");
  await appendDiscordMessage(dataRoot, channel, first);
  const prior = await readRecentLog(dataRoot);
  const remembered = prior.includes("blue kelp archive");
  const second = transport.seedUserMessage(channel.id, "What phrase did I give you?");
  const reply = await transport.createMessage(channel.id, `Turntide Islands steward remembers: ${remembered ? "blue kelp archive" : "no prior phrase"}.`);
  if (!reply.content.includes("blue kelp archive")) return 1;
  process.stdout.write(`context-smoke: remembered message injected: ${remembered ? "yes" : "no"}\n`);
  return 0;
}

async function gatewaySmoke() {
  const transport = new InMemoryDiscordTransport();
  const guildId = (await transport.listGuilds())[0].id;
  const channel = await transport.createChannel(guildId, { name: "weather-report" });
  const message = transport.seedUserMessage(channel.id, "Can the live gateway path reach the Turntide steward?");
  const reply = await answerMessage(transport, channel, message);
  if (!reply.content.includes("Turntide Islands")) return 1;
  process.stdout.write(`gateway-smoke: message -> reply=${reply.id}\n`);
  return 0;
}

async function supervisionSmoke() {
  const first = await gatewaySmoke();
  if (first !== 0) return first;
  const second = await gatewaySmoke();
  process.stdout.write(`supervision-smoke: reconnect simulated=${second === 0 ? "yes" : "no"}\n`);
  return second;
}

async function archipelagoSmoke() {
  const transport = new InMemoryDiscordTransport();
  const guildId = (await transport.listGuilds())[0].id;
  const result = await bootstrapWithTransport(transport, guildId, { adminUserId: "emsenn" });
  const archipelago = (await transport.listChannels(guildId)).find((channel) => channel.name === "ai-archipelago");
  const publicBefore = (await transport.listMessages(result.channels.find((channel) => channel.name === "weather-report").id, 10)).length;
  if (archipelago === undefined) return 1;
  await transport.createMessage(archipelago.id, "Tidewatcher and Vault Keeper rehearsal: keep bot-to-bot experiments private.");
  const publicAfter = (await transport.listMessages(result.channels.find((channel) => channel.name === "weather-report").id, 10)).length;
  if (publicAfter !== publicBefore) return 1;
  process.stdout.write("archipelago-smoke: private bot rehearsal contained=yes\n");
  return 0;
}

async function liveCultivate(source) {
  const guildId = env("DISCORD_GUILD_ID", source);
  const adminUserId = env("DISCORD_ADMIN_USER_ID", source);
  if (guildId === undefined || adminUserId === undefined) {
    process.stderr.write("cultivate blocked by DISCORD_GUILD_ID and DISCORD_ADMIN_USER_ID\n");
    return 1;
  }
  const transport = new DiscordRestTransport({ env: source });
  const measurement = await measureWithTransport(transport, guildId);
  if (measurement["verdict"] !== "canonical-surface-present") {
    const result = await bootstrapWithTransport(transport, guildId, { adminUserId, adminChannelId: env("DISCORD_ADMIN_CHANNEL_ID", source) });
    printBootstrapResult(result);
  }
  process.stdout.write(`${JSON.stringify(measurement, null, 2)}\n`);
  return 0;
}

async function cultivateSmoke() {
  const transport = new InMemoryDiscordTransport();
  const guildId = (await transport.listGuilds())[0].id;
  const before = await measureWithTransport(transport, guildId);
  const result = await bootstrapWithTransport(transport, guildId, { adminUserId: "emsenn" });
  const after = await measureWithTransport(transport, guildId);
  if (after["verdict"] !== "canonical-surface-present") return 1;
  process.stdout.write(`cultivate-smoke: before=${before["verdict"]} after=${after["verdict"]} channels=${result.channels.length}\n`);
  return 0;
}

async function liveExpressions(source) {
  const guildId = env("DISCORD_GUILD_ID", source);
  if (guildId === undefined) {
    process.stderr.write("expressions blocked by DISCORD_GUILD_ID\n");
    return 1;
  }
  const result = await projectExpressions(new DiscordRestTransport({ env: source }), guildId, expressionsRoot(source));
  await appendExpressionLog(env("TTI_AGENT_DATA_ROOT", source) ?? path.join(packageRoot, "data", "agent"), result);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return 0;
}

// Rehearses a boost lapse: a tier-1 guild takes the catalog, drops to tier 0,
// and the next projections report the overflow as locked rather than
// re-uploading or deleting it.
async function expressionsSmoke(source) {
  const transport = new InMemoryDiscordTransport({ premiumTier: 1 });
  const guildId = (await transport.listGuilds())[0].id;
  const root = expressionsRoot(source);
  const boosted = await projectExpressions(transport, guildId, root);
  transport.premiumTier = 0;
  const lapsed = await projectExpressions(transport, guildId, root);
  const again = await projectExpressions(transport, guildId, root);
  if (lapsed.created !== 0 || again.created !== 0 || boosted.created + boosted.awaitsCapacity !== boosted.catalog) return 1;
  process.stdout.write(`expressions-smoke: catalog=${boosted.catalog} boosted-created=${boosted.created} lapsed-present=${lapsed.present} lapsed-locked=${lapsed.locked}\n`);
  return 0;
}

async function runPollingSteward(source) {
  const state = readiness(source);
  if (state.missing.length > 0) {
    check(source);
    process.stderr.write("refusing steward:run until readiness is resolved\n");
    return 1;
  }
  const guildId = state.guildId;
  const transport = new DiscordRestTransport({ env: source });
  const dataRoot = env("TTI_AGENT_DATA_ROOT", source) ?? path.join(packageRoot, "data", "agent");
  const intervalMs = integerEnv("TTI_POLL_INTERVAL_MS", 15000, source);
  const civicScheduleCheckMs = integerEnv("TTI_CIVIC_SCHEDULE_CHECK_MS", 300000, source);
  const seen = new Set();
  const bot = await transport.getCurrentUser();
  let primed = false;
  let lastCivicScheduleCheckAt = 0;
  process.stderr.write(`turntide steward polling ${guildId} every ${intervalMs}ms\n`);
  for (;;) {
    await ingestHistoryWithTransport(transport, guildId, { dataRoot, limit: 25, seen });
    const channels = await transport.listChannels(guildId);
    for (const channel of channels) {
      const messages = await transport.listMessages(channel.id, 10).catch(() => []);
      for (const message of messages) {
        if (!primed) {
          seen.add(`reply:${message.id}`);
          continue;
        }
        if (message.authorBot || seen.has(`reply:${message.id}`) || !shouldReply(message.content, bot.id)) continue;
        seen.add(`reply:${message.id}`);
        await answerMessage(transport, channel, message, source);
      }
    }
    primed = true;
    const nowMs = Date.now();
    if (nowMs - lastCivicScheduleCheckAt >= civicScheduleCheckMs) {
      lastCivicScheduleCheckAt = nowMs;
      try {
        await runCivicScheduledRoutines({
          transport,
          channels,
          source,
          dataRoot,
          now: new Date(nowMs).toISOString(),
        });
      } catch (error) {
        process.stderr.write(`scheduled civic review failed: ${error instanceof Error ? error.message : String(error)}\n`);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

async function answerMessage(transport, channel, message, source = process.env) {
  const civic = await civicAnswerForMessage(channel, message, source);
  if (civic !== null) {
    const answer = civic?.kind === "turntide.civic.proposal-submission-request"
      ? await executeProposalSubmissionIntent(transport, civic, source)
      : civic;
    return transport.createMessage(channel.id, {
      content: String(answer).slice(0, 1900),
      allowedMentions: { users: [] },
    });
  }
  const lane = laneByName(channel.name);
  const system = lane === undefined ? renderOrchestrationSystem() : renderPersonaSystem(persona(lane.persona), lane);
  const answer = await inferAnswer(message.content, source, system);
  return transport.createMessage(channel.id, {
    content: answer,
    allowedMentions: { users: [] },
  });
}


export async function executeProposalSubmissionIntent(transport, request, source = process.env) {
  if (request?.kind !== "turntide.civic.proposal-submission-request") throw new TypeError("proposal submission executor requires a civic submission request");
  const guildId = env("DISCORD_GUILD_ID", source)
    ?? (await transport.listGuilds()).find((guild) => guild.name === communityName)?.id
    ?? (await transport.listGuilds())[0]?.id;
  if (guildId === undefined) return "I cannot submit that proposal because the Turntide Discord guild is unavailable.";
  const channels = await transport.listChannels(guildId);
  const target = channels.find((candidate) => normalizedName(candidate.name) === "governance-proposals");
  if (target === undefined) return "I cannot submit that proposal because #governance-proposals is unavailable.";

  const begin = await beginProposalSubmission({
    dataRoot: request.dataRoot,
    authorId: request.authorId,
    handle: request.handle,
    message: request.message,
  });
  if (begin.state === "incomplete") {
    return `Proposal draft ${request.handle} is not ready to submit; still needed: ${begin.missing.join(", ")}.`;
  }
  if (begin.state === "proposed") {
    return `Proposal ${begin.proposalId} is already proposed in #${begin.receipt.publicMessage.channelName ?? "governance-proposals"}.`;
  }
  if (begin.state === "pending") {
    return `Proposal submission ${begin.proposalId} is already pending and its public receipt is unresolved. I will not duplicate the proposal; reconcile that submission before retrying.`;
  }

  let posted;
  try {
    posted = await transport.createMessage(target.id, {
      content: begin.content,
      allowedMentions: { users: [] },
    });
  } catch (error) {
    return `Proposal submission ${begin.proposalId} entered pending state, but I could not confirm the public Discord post (${error instanceof Error ? error.message : String(error)}). I will not duplicate it until that ambiguity is reconciled.`;
  }

  try {
    const completed = await completeProposalSubmission({
      dataRoot: request.dataRoot,
      intent: begin.intent,
      publicMessage: {
        id: posted.id,
        channelId: target.id,
        channelName: target.name,
        createdAt: posted.timestamp ?? posted.createdAt ?? new Date().toISOString(),
      },
    });
    return `Submitted proposal ${completed.receipt.proposalId} to #${target.name}. It is proposed, not enacted; governance still has to decide it.`;
  } catch (error) {
    return `The public proposal post was sent, but its local submission receipt is unresolved (${error instanceof Error ? error.message : String(error)}). I will not post it again until that ambiguity is reconciled.`;
  }
}

/**
 * Turntide-owned civic routing in front of generic inference.
 *
 * The Discord platform is only a delivery adapter: it loads the enacted civic
 * kernel from Turntide's public/durable root and never infers authority from a
 * channel, role, mention, reaction, message count, or model output.
 */
export async function civicAnswerForMessage(channel, message, source = process.env) {
  const content = String(message?.content ?? "");
  const text = content.toLowerCase();
  const place = normalizedName(channel?.name ?? "");
  const governancePlace = place.startsWith("governance-") || place === "governance-rock";
  const civicCue = governancePlace
    || /\bturntide\b/u.test(text)
    || /\bgovern(?:ance|or|ing)?\b/u.test(text)
    || /\bproposal\b/u.test(text)
    || /\broutine\b/u.test(text)
    || /\b(?:save|record|draft|turn)\b[\s\S]*?\broutine candidate\b/u.test(text)
    || /routine candidates have i saved|show (?:me )?my routine candidates|list (?:my )?routine candidates|my saved routines/u.test(text)
    || /continue routine candidate\s+\S+/u.test(text)
    || /\btidepool\b/u.test(text)
    || /\bstanding\b/u.test(text)
    || /\bdelegat(?:e|ion|ed)\b/u.test(text)
    || /\bauthority\b/u.test(text)
    || /\bcontest(?:ed|ing)?\b|\bchallenge\b|\bcontradict(?:ion|s|ed)?\b|\bfalsif(?:y|ier|ying)\b|\bmissing receipt\b|\breopen\b/u.test(text)
    || /what can (?:i|we) do here/u.test(text)
    || /what can happen here/u.test(text)
    || /how can i help/u.test(text)
    || /what(?:'s| is) happening in (?:turntide )?governance|governance docket|what proposals are (?:open|before governance)|what is before governance/u.test(text)
    || /more involved|take on more responsibility/u.test(text)
    || /\bdecision procedure\b|\bwhat procedure\b|\bhow (?:would|does|should) turntide decide\b|\bdoes (?:this|it) need (?:a )?vote\b|\bneed(?:s)? (?:a )?vote\b|\bwho decides\b|\bwhat kind of governance\b/u.test(text);
  if (!civicCue) return null;

  const civicRoot = publicTurntideRoot(source);
  const civicModule = await import(pathToFileURL(path.join(civicRoot, "lib", "zelo-civic-service.mjs")).href);
  const context = await civicModule.loadZeloCivicContext(civicRoot);

  let result;
  const dataRoot = env("TTI_AGENT_DATA_ROOT", source) ?? path.join(packageRoot, "data", "agent");
  const authorId = typeof message?.authorId === "string" ? message.authorId : null;
  const continueCandidate = /continue routine candidate\s+([^\s]+)/iu.exec(content);
  const continueProposal = /continue proposal(?: draft)?\s+([^\s]+)/iu.exec(content);
  const updateProposal = proposalDraftUpdateCommand(content);
  const submitProposal = proposalDraftSubmitHandle(content);
  if (updateProposal !== null) {
    if (authorId === null) return "I cannot update a private proposal draft without a stable author identity.";
    try {
      const updated = await recordProposalDraftFieldUpdate({
        dataRoot,
        authorId,
        handle: updateProposal.handle,
        message: { ...message, channelId: channel?.id },
        field: updateProposal.field,
        value: updateProposal.value,
      });
      const draft = civicModule.draftProposal(context, updated.draft);
      return [
        `Updated proposal draft ${updateProposal.handle}: ${updateProposal.field}.`,
        civicModule.formatZelo(draft),
      ].join("\n");
    } catch (error) {
      return `I could not update that proposal draft: ${error instanceof Error ? error.message : String(error)}`;
    }
  } else if (submitProposal !== null) {
    if (authorId === null) return "I cannot submit a private proposal draft without a stable author identity.";
    return Object.freeze({
      kind: "turntide.civic.proposal-submission-request",
      dataRoot,
      authorId,
      handle: submitProposal,
      message: Object.freeze({ ...message, channelId: channel?.id }),
    });
  } else if (/proposal drafts have i saved|show (?:me )?my proposal drafts|list (?:my )?proposal drafts|my saved proposals/u.test(text)) {
    if (authorId === null) return "I cannot read a private proposal-draft inbox without a stable author identity.";
    const inbox = await proposalDraftInboxForAuthor(dataRoot, authorId);
    if (inbox.length === 0) return "You have no saved proposal drafts in Zelo's private draft inbox.";
    const rows = inbox.map((entry) => "- " + entry.handle + " — " + (entry.channelName ? "#" + entry.channelName : "original context") + " — " + entry.status + "; still needs: " + (entry.missing.length === 0 ? "nothing recorded" : entry.missing.join(", ")));
    return [
      "You have " + inbox.length + " saved proposal draft(s). I am not repeating their private requested-act text here.",
      ...rows,
      "To continue one, ask `continue proposal <handle>` in its original channel.",
    ].join("\n");
  } else if (continueProposal !== null) {
    if (authorId === null) return "I cannot continue a private proposal draft without a stable author identity.";
    const proposal = await proposalDraftForAuthor(dataRoot, authorId, continueProposal[1]);
    if (proposal === null) return "I cannot find that proposal draft in your private draft inbox.";
    if (proposal.source?.channelId !== channel?.id) {
      return "That proposal draft belongs to #" + (proposal.source?.channelName ?? "its original channel") + ". Continue it there so its original context and privacy boundary stay intact.";
    }
    const draft = civicModule.draftProposal(context, proposal);
    return [
      "Continuing proposal draft " + continueProposal[1] + " from its original context.",
      civicModule.formatZelo(draft),
      "This remains private/draft-only until the missing fields are refined and the separate civic transition moves it to proposed.",
    ].join("\n");
  } else if (/\b(?:save|record|draft|turn)\b[\s\S]*?\b(?:draft\s+)?proposal\b/u.test(text)) {
    if (authorId === null) return "I cannot save a private proposal draft without a stable author identity.";
    const requestedAct = proposalDraftRequestedAct(content);
    if (requestedAct === "") return "Tell me the concrete act you want Turntide to consider.";
    const draft = civicModule.draftProposal(context, { proposer: authorId, requestedAct });
    const intake = await recordProposalDraftIntake({
      dataRoot,
      channel,
      message,
      requestedAct,
      missing: draft.missing ?? [],
    });
    return [
      intake.appended ? `Saved proposal draft ${intake.record.id}.` : `That proposal draft is already saved as ${intake.record.id}.`,
      civicModule.formatZelo(draft),
      intake.record.next,
    ].join("\n");
  } else if (/routine candidates have i saved|show (?:me )?my routine candidates|list (?:my )?routine candidates|my saved routines/u.test(text)) {
    if (authorId === null) return "I cannot read a private routine-candidate inbox without a stable author identity.";
    const inbox = await routineCandidateInboxForAuthor(dataRoot, authorId);
    if (inbox.length === 0) return "You have no saved routine candidates in Zelo\'s private draft inbox.";
    const rows = inbox.map((entry) => "- " + entry.handle + " — " + (entry.channelName ? "#" + entry.channelName : "original context") + " — " + entry.status + "; still needs: " + (entry.missing.length === 0 ? "nothing recorded" : entry.missing.join(", ")));
    return [
      "You have " + inbox.length + " saved routine candidate(s). I am not repeating their private observation text here.",
      ...rows,
      "To continue one, ask `continue routine candidate <handle>` in its original channel.",
    ].join("\n");
  } else if (continueCandidate !== null) {
    if (authorId === null) return "I cannot continue a private routine candidate without a stable author identity.";
    const candidate = await routineCandidateForAuthor(dataRoot, authorId, continueCandidate[1]);
    if (candidate === null) return "I cannot find that routine candidate in your private draft inbox.";
    if (candidate.source?.channelId !== channel?.id) {
      return "That routine candidate belongs to #" + (candidate.source?.channelName ?? "its original channel") + ". Continue it there so its original context and privacy boundary stay intact.";
    }
    const studio = civicModule.routineStudio(context, { place, observation: candidate.observation });
    return [
      "Continuing routine candidate " + continueCandidate[1] + " from its original context.",
      civicModule.formatZelo(studio),
      "This remains advisory/draft-only until you explicitly refine and move it through Turntide\'s civic process.",
    ].join("\n");
  } else if (/\b(?:save|record|draft|turn)\b[\s\S]*?\broutine candidate\b/u.test(text)) {
    const observation = routineCandidateObservation(content);
    if (observation === "") return "Tell me the repeated work you want preserved as a routine candidate.";
    const draft = civicModule.draftRoutineCandidate(context, { observedRepetition: observation });
    const intake = await recordRoutineCandidateIntake({
      dataRoot,
      channel,
      message,
      observation,
      missing: draft.missing ?? [],
    });
    return [
      intake.appended ? `Saved draft routine intake ${intake.record.id}.` : `That draft routine intake is already saved as ${intake.record.id}.`,
      civicModule.formatZelo(draft),
      intake.record.next,
    ].join("\n");
  } else if (/what(?:'s| is) happening in (?:turntide )?governance|governance docket|what proposals are (?:open|before governance)|what is before governance/u.test(text)) {
    return formatCivicDocket(await buildCivicDocket({ dataRoot, context }));
  } else if (/what is turntide|explain turntide|how does turntide work/u.test(text)) {
    result = civicModule.explainTurntide(context);
  } else if (/what can happen here|what can (?:i|we) do here|what belongs here|what is this (?:channel|place) for/u.test(text)) {
    result = civicModule.placeCivicGuide(context, { place });
  } else if (/routine studio|what routines|should (?:this|we) become a routine|could (?:this|we) become a routine/u.test(text)) {
    result = civicModule.routineStudio(context, { place });
  } else if (/\bdecision procedure\b|\bwhat procedure\b|\bhow (?:would|does|should) turntide decide\b|\bdoes (?:this|it) need (?:a )?vote\b|\bneed(?:s)? (?:a )?vote\b|\bwho decides\b|\bwhat kind of governance\b/u.test(text)) {
    let kind = null;
    if (/\btidepool\b/u.test(text) && /financial|membership|distribution|vot(?:e|ing)|principal|yield|custody|reconcil|protocol|transaction/u.test(text)) {
      kind = "tidepool-financial-governance";
    } else if (/\btidepool\b/u.test(text)) {
      kind = "turntide-tidepool-integration";
    } else if (/record[- ]grounded|clerical correction|wrong (?:public )?(?:record|projection|explanation)|stale (?:record|projection|explanation)/u.test(text)) {
      kind = "record-grounded-correction";
    } else if (/delegated clerical|within (?:an|the) delegation|existing delegation/u.test(text)) {
      kind = "delegated-clerical";
    } else if (/routine instance|enacted routine|routine already enacted/u.test(text)) {
      kind = "enacted-routine-instance";
    } else if (/structural|standing change|authority domain|civic action protocol|office power|decision procedure|constitution|institutional boundar/u.test(text)) {
      kind = "structural-governance-act";
    } else {
      kind = "ordinary-governance-act";
    }
    result = civicModule.decisionProcedureWayfinding(context, { kind });
  } else if (/more involved|take on more responsibility|become a governor|governance standing|what authority would i need|how do i get authority/u.test(text)) {
    result = civicModule.standingWayfinding(context);
  } else if (/\bcontest(?:ed|ing)?\b|\bchallenge\b|\bcontradict(?:ion|s|ed)?\b|\bfalsif(?:y|ier|ying)\b|\bmissing receipt\b|\breopen\b/u.test(text)) {
    result = civicModule.contestWayfinding(context, { kind: /\btidepool\b/u.test(text) ? "tidepool-receipt-contest" : null });
  } else if (/\btidepool\b/u.test(text)) {
    result = civicModule.tidepoolCivicMap(context);
  } else if (/how can i help|how can i participate|what can i do in turntide|participat(?:e|ion)/u.test(text)) {
    result = civicModule.participationPaths(context);
  } else if (governancePlace || /\bgovern(?:ance|ing)?\b|\bproposal\b|\bstanding\b|\bdelegat(?:e|ion|ed)\b|\bauthority\b/u.test(text)) {
    result = civicModule.orientTurntider(context);
  } else {
    return null;
  }
  return civicModule.formatZelo(result);
}

/** TTI_AGENT_MODEL pins an NVIDIA NIM model ahead of the engine's free-first providers. */
function stewardPreference(source) {
  const model = env("TTI_AGENT_MODEL", source);
  return model === undefined ? [] : [{ providerId: "nvidia-nim", model }];
}

export async function inferAnswer(prompt, source = process.env, system = renderOrchestrationSystem()) {
  const result = await dispatchFreeFirst({
    model: "default",
    messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
    params: { temperature: 0.4 },
    "max-tokens": 500,
  }, { prefer: stewardPreference(source), env: source });
  const answer = result.ok ? result.exchange.completion.text.trim() : "";
  if (answer.length > 0) return answer.slice(0, 1900);
  const grounds = result.tried.map(({ providerId, grounds: why }) => `${providerId}: ${why ?? "unavailable"}`).join("; ");
  return `Turntide Islands steward heard this but no inference provider answered (${grounds || "none armed"}): ${prompt}`;
}

export function shouldReply(content, botId) {
  return new RegExp(`<@!?${botId}>`, "u").test(content);
}

function inferenceReadiness(source) {
  const providers = [...stewardPreference(source).map(({ providerId }) => providerId), ...armedFreeProviders(source).map(({ providerId }) => providerId)];
  return {
    label: providers.length > 0 ? `inference providers (${providers.join(", ")})` : "no inference provider armed",
    ready: providers.length > 0,
  };
}

function printBootstrapResult(result) {
  process.stdout.write(`bootstrap guild: ${result.guildName} (${result.guildId})\n`);
  process.stdout.write(`set DISCORD_GUILD_ID=${result.guildId}\n`);
  for (const channel of result.channels) process.stdout.write(`channel ${channel.kind}: #${channel.name} (${channel.id})\n`);
  for (const command of result.commands) process.stdout.write(`command ${command.kind}: /${command.name} (${command.id})\n`);
  process.stdout.write(`set TURNTIDE_ISLANDER_ROLE_ID=${result.role.id}\n`);
  process.stdout.write(`admin notice: ${result.adminNotice.message} in ${result.adminNotice.channel}\n`);
}

function printIngestResult(result) {
  process.stdout.write(`channels seen: ${result.channelsSeen}\n`);
  process.stdout.write(`channels read: ${result.channelsRead}\n`);
  process.stdout.write(`channels skipped: ${result.channelsSkipped}\n`);
  process.stdout.write(`messages seen: ${result.messagesSeen}\n`);
  process.stdout.write(`messages added: ${result.messagesAdded}\n`);
}

function usage() {
  process.stderr.write("usage: turntide steward [check|discover-env|live-permissions|measure|invite|bootstrap|bootstrap-smoke|probe|ingest-history|ingest-history-smoke|ingest-signals|tick|membership-reconcile|membership-reconcile-smoke|membership-service-smoke|smoke|context-smoke|gateway-smoke|supervision-smoke|archipelago-smoke|cultivate|cultivate-smoke|expressions|expressions-smoke|preflight|run]\n");
}

function isMain() {
  return process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
}

async function appendMeasurement(dataRoot, measurement) {
  const at = String(measurement["observedAt"] ?? new Date().toISOString());
  const day = at.slice(0, 10);
  const target = path.join(dataRoot, "log", day.slice(0, 4), day.slice(5, 7), day.slice(8, 10), `${day}-turntide-measurement-log.jsonl`);
  await mkdir(path.dirname(target), { recursive: true });
  await appendFile(target, `${JSON.stringify(measurement)}\n`);
}

async function appendExpressionLog(dataRoot, result) {
  const day = result.observedAt.slice(0, 10);
  const target = path.join(dataRoot, "log", day.slice(0, 4), day.slice(5, 7), day.slice(8, 10), `${day}-turntide-expressions-log.jsonl`);
  await mkdir(path.dirname(target), { recursive: true });
  await appendFile(target, `${JSON.stringify(result)}\n`);
}

async function readRecentLog(dataRoot) {
  const day = new Date().toISOString().slice(0, 10);
  const target = path.join(dataRoot, "log", day.slice(0, 4), day.slice(5, 7), day.slice(8, 10), `${day}-discord-organizer-log.jsonl`);
  return readFile(target, "utf8").catch(() => "");
}

async function discordApi(source, method, route, body) {
  const token = env("DISCORD_BOT_TOKEN", source) ?? env("DISCORD_TOKEN", source);
  if (token === undefined) throw new Error("DISCORD_BOT_TOKEN or DISCORD_TOKEN is required");
  const res = await fetch(`https://discord.com/api/v10${route}`, {
    method,
    headers: {
      authorization: `Bot ${token}`,
      "content-type": "application/json",
      "user-agent": "@red-cup-engineering/turntide-islands-discord-platform steward (https://561.group)",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Discord ${method} ${route} -> ${res.status}: ${text.slice(0, 400)}`);
  return (text.length === 0 ? null : JSON.parse(text));
}

function arrayOfStrings(value) {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === "string") : [];
}
