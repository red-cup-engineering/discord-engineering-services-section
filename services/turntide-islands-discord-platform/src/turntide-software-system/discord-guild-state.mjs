import path from "node:path";

import { botToken } from "./discord.mjs";
import { env, publicTurntideDataPath } from "./env.mjs";
import { writeFileText } from "@red-cup-engineering/computer-file-engineering-services-section/write-file";

const channelTypes = Object.freeze({
  0: "text", 2: "voice", 4: "category", 5: "announcement", 10: "announcement-thread",
  11: "public-thread", 12: "private-thread", 13: "stage", 14: "directory", 15: "forum", 16: "media",
});

function record(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Discord returned a non-object");
  return value;
}

function strings(value) {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === "string") : [];
}

function pick(source, keys) {
  return Object.fromEntries(keys.filter((key) => source[key] !== undefined).map((key) => [key, source[key]]));
}

function roleState(value) {
  return pick(record(value), ["id", "name", "color", "hoist", "position", "permissions", "managed", "mentionable", "flags"]);
}

function overwriteState(value) {
  const raw = record(value);
  const targetType = raw.type === 0 || raw.type === "0" ? "role" : "member";
  return { targetId: targetType === "role" ? raw.id : null, targetType, allow: raw.allow, deny: raw.deny };
}

function channelState(value) {
  const raw = record(value);
  const type = typeof raw.type === "number" ? raw.type : -1;
  const selected = pick(raw, ["id", "name", "type", "position", "parent_id", "topic", "nsfw", "rate_limit_per_user", "bitrate", "user_limit", "flags", "default_auto_archive_duration", "default_thread_rate_limit_per_user", "default_sort_order", "default_forum_layout"]);
  return {
    ...selected,
    kind: channelTypes[type] ?? `unknown-${type}`,
    permissionOverwrites: Array.isArray(raw.permission_overwrites) ? raw.permission_overwrites.map(overwriteState) : [],
    availableTags: Array.isArray(raw.available_tags) ? raw.available_tags.map((tag) => pick(record(tag), ["id", "name", "moderated", "emoji_id", "emoji_name"])) : [],
  };
}

function onboardingState(value) {
  const raw = record(value);
  return {
    enabled: raw.enabled === true,
    mode: raw.mode,
    defaultChannelIds: strings(raw.default_channel_ids),
    prompts: Array.isArray(raw.prompts) ? raw.prompts.map((promptValue) => {
      const prompt = record(promptValue);
      return {
        id: prompt.id, type: prompt.type, title: prompt.title, singleSelect: prompt.single_select,
        required: prompt.required, inOnboarding: prompt.in_onboarding,
        options: Array.isArray(prompt.options) ? prompt.options.map((optionValue) => {
          const option = record(optionValue);
          return { id: option.id, title: option.title, description: option.description, emojiId: option.emoji_id, emojiName: option.emoji_name, roleIds: strings(option.role_ids), channelIds: strings(option.channel_ids) };
        }) : [],
      };
    }) : [],
  };
}

function welcomeScreenState(value) {
  const raw = record(value);
  return {
    description: raw.description ?? null,
    welcomeChannels: Array.isArray(raw.welcome_channels) ? raw.welcome_channels.map((entryValue) => {
      const entry = record(entryValue);
      return { channelId: entry.channel_id, description: entry.description, emojiId: entry.emoji_id, emojiName: entry.emoji_name };
    }) : [],
  };
}

async function discordGet(fetchImpl, token, apiBase, endpoint, optional = false) {
  const response = await fetchImpl(`${apiBase}${endpoint}`, { method: "GET", headers: { authorization: `Bot ${token}` } });
  if (optional && (response.status === 403 || response.status === 404)) return null;
  if (!response.ok) throw new Error(`Discord GET ${endpoint} failed with ${response.status}: ${await response.text()}`);
  return response.json();
}

export async function observeDiscordGuildState(source = process.env, options = {}) {
  const token = botToken(source);
  const guildId = env("DISCORD_GUILD_ID", source);
  if (token === undefined) throw new Error("DISCORD_BOT_TOKEN or DISCORD_TOKEN is required");
  if (guildId === undefined) throw new Error("DISCORD_GUILD_ID is required");
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const apiBase = options.apiBase ?? "https://discord.com/api/v10";
  const [guildValue, channelsValue, rolesValue, onboardingValue, welcomeValue] = await Promise.all([
    discordGet(fetchImpl, token, apiBase, `/guilds/${guildId}`),
    discordGet(fetchImpl, token, apiBase, `/guilds/${guildId}/channels`),
    discordGet(fetchImpl, token, apiBase, `/guilds/${guildId}/roles`),
    discordGet(fetchImpl, token, apiBase, `/guilds/${guildId}/onboarding`, true),
    discordGet(fetchImpl, token, apiBase, `/guilds/${guildId}/welcome-screen`, true),
  ]);
  const guild = record(guildValue);
  const roles = Array.isArray(rolesValue) ? rolesValue.map(roleState).sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0) || String(a.id).localeCompare(String(b.id))) : [];
  const channels = Array.isArray(channelsValue) ? channelsValue.map(channelState).sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0) || String(a.id).localeCompare(String(b.id))) : [];
  return {
    type: "TTIDiscordGuildState", version: 1, observedAt: (options.now ?? new Date()).toISOString(),
    source: { kind: "discord-rest", apiVersion: 10, methods: ["GET"], excludes: ["messages", "members", "invites", "reaction-users", "secrets"] },
    guild: { ...pick(guild, ["id", "name", "description", "features", "verification_level", "explicit_content_filter", "default_message_notifications", "system_channel_id", "rules_channel_id", "public_updates_channel_id", "preferred_locale"]), features: strings(guild.features).sort() },
    roles, channels,
    onboarding: onboardingValue === null ? null : onboardingState(onboardingValue),
    welcomeScreen: welcomeValue === null ? null : welcomeScreenState(welcomeValue),
  };
}

export function discordGuildStatePath(source = process.env) {
  return env("TTI_DISCORD_GUILD_STATE_FILE", source) ?? publicTurntideDataPath(source, "state", "discord-guild-state.json");
}

export async function writeDiscordGuildState(state, file) {
  await writeFileText(file, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o644 });
}
