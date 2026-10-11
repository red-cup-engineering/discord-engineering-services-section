// The guild's layout is owned as a public Turntide record
// (`data/records/discord-guild/turntide-islands.guild.json`); the guild only
// ever holds a projection of it. Projection is bounded: categories, channels,
// and roles the record does not name are never touched, a declared overwrite
// replaces only its own role's entry, and archiving moves a channel to
// Driftwood with sending denied instead of deleting it. Every run first
// computes the full action list; only `apply` performs it.
import { readFile } from "node:fs/promises";
import { discordPermissions, normalizedName } from "./discord.mjs";
import { publicTurntideDataPath } from "./env.mjs";
import { sameOverwriteSet } from "./permission-relation.mjs";

const visaAllow = discordPermissions.viewChannel | discordPermissions.sendMessages;
const archiveDeny = discordPermissions.sendMessages | discordPermissions.sendMessagesInThreads | discordPermissions.createPublicThreads | discordPermissions.createPrivateThreads;
const topicTypes = new Set(["text", "announcement", "forum", "media"]);
const discordEpoch = 1420070400000n;

export function guildShapePath(source = process.env) {
  return publicTurntideDataPath(source, "records", "discord-guild", "turntide-islands.guild.json");
}

export async function readGuildShape(file) {
  return admitGuildShape(JSON.parse(await readFile(file, "utf8")));
}

export function admitGuildShape(shape) {
  if (shape?.type !== "TTIDiscordGuildShape" || shape.version !== 1) throw new TypeError("guild shape must be TTIDiscordGuildShape v1");
  if (typeof shape.guildId !== "string") throw new TypeError("guild shape needs guildId");
  const categories = new Set(), channels = new Set();
  for (const category of shape.categories ?? []) {
    if (categories.has(category.key)) throw new TypeError(`duplicate category ${category.key}`);
    if (category.discordId === undefined && category.name === undefined) throw new TypeError(`category ${category.key} needs a discordId or a name`);
    categories.add(category.key);
  }
  for (const channel of shape.channels ?? []) {
    if (channels.has(channel.key)) throw new TypeError(`duplicate channel ${channel.key}`);
    if (!categories.has(channel.category)) throw new TypeError(`channel ${channel.key} names unknown category ${channel.category}`);
    if (typeof channel.name !== "string" || channel.name.length === 0 || channel.name.length > 100) throw new TypeError(`channel ${channel.key} needs a 1-100 character name`);
    if (channel.topic !== undefined && channel.topic.length > 1024) throw new TypeError(`channel ${channel.key} topic exceeds 1024 characters`);
    channels.add(channel.key);
  }
  for (const prompt of shape.onboarding?.prompts ?? []) {
    for (const option of prompt.visas ? [] : prompt.options) {
      for (const key of option.channels ?? []) if (!channels.has(key)) throw new TypeError(`onboarding option ${option.title} names unknown channel ${key}`);
    }
  }
  for (const key of shape.onboarding?.defaultChannels ?? []) if (!channels.has(key)) throw new TypeError(`onboarding default names unknown channel ${key}`);
  for (const [subject, entry] of Object.entries(shape.placement?.subjects ?? {})) {
    if (!channels.has(entry.island)) throw new TypeError(`subject ${subject} names unknown island ${entry.island}`);
  }
  return Object.freeze(shape);
}

/** The visa islands, in declared order: each grants its role and opens its channel. */
export function visaIslands(shape) {
  return shape.channels.filter((channel) => channel.visa !== undefined && channel.archived !== true);
}

export async function projectGuildShape(transport, shape, { apply = false, now = Date.now } = {}) {
  const guildId = shape.guildId;
  const actions = [];
  const act = async (action, effect) => {
    actions.push(action);
    return apply ? effect() : undefined;
  };

  const roles = await transport.listRoles(guildId);
  const roleIds = new Map(roles.map((role) => [normalizedName(role.name), role.id]));
  roleIds.set("@everyone", guildId);
  for (const name of declaredRoleNames(shape)) {
    if (roleIds.has(normalizedName(name))) continue;
    const created = await act({ op: "create-role", name }, () => transport.createRole(guildId, { name, permissions: "0", mentionable: false }));
    roleIds.set(normalizedName(name), created?.id ?? `planned:role:${name}`);
  }
  const roleId = (name) => {
    const id = roleIds.get(normalizedName(name));
    if (id === undefined) throw new Error(`role ${name} is not in the guild`);
    return id;
  };

  const live = await transport.listChannels(guildId);
  const byId = new Map(live.map((channel) => [channel.id, channel]));
  const categoryIds = new Map();
  const categories = [];
  for (const category of shape.categories) {
    const existing = category.discordId === undefined
      ? live.find((channel) => channel.type === "category" && channel.name === category.name)
      : byId.get(category.discordId);
    if (category.discordId !== undefined && existing === undefined) throw new Error(`declared category ${category.key} (${category.discordId}) is gone from the guild`);
    if (category.stewarded === false) {
      categoryIds.set(category.key, existing.id);
      categories.push({ id: existing.id, existing });
      continue;
    }
    const overwrites = mergedOverwrites(existing?.permissionOverwrites, category, roleId, false);
    if (existing === undefined) {
      const created = await act({ op: "create-category", key: category.key, name: category.name }, () => transport.createChannel(guildId, { name: category.name, type: "category", permissionOverwrites: overwrites }));
      categoryIds.set(category.key, created?.id ?? `planned:category:${category.key}`);
      categories.push({ id: categoryIds.get(category.key), existing: created });
      continue;
    }
    categoryIds.set(category.key, existing.id);
    categories.push({ id: existing.id, existing });
    const patch = {
      ...(category.name !== undefined && existing.name !== category.name ? { name: category.name } : {}),
      ...(category.overwrites !== undefined && !sameOverwriteSet(existing.permissionOverwrites, overwrites) ? { permissionOverwrites: overwrites } : {}),
    };
    if (Object.keys(patch).length > 0) await act({ op: "modify-category", key: category.key, from: existing.name, changes: Object.keys(patch) }, () => transport.modifyChannel(existing.id, patch));
  }

  const channelIds = new Map();
  const placed = new Map(shape.categories.map((category) => [category.key, []]));
  for (const channel of shape.channels) {
    const parentId = categoryIds.get(channel.category);
    const type = channel.type ?? "text";
    const existing = channel.discordId === undefined
      ? live.find((candidate) => candidate.type === type && candidate.name === channel.name)
      : byId.get(channel.discordId);
    if (channel.discordId !== undefined && existing === undefined) throw new Error(`declared channel ${channel.key} (${channel.discordId}) is gone from the guild`);
    const overwrites = mergedOverwrites(existing?.permissionOverwrites, channel, roleId, channel.archived === true);
    if (existing === undefined) {
      const created = await act({ op: "create-channel", key: channel.key, name: channel.name, category: channel.category }, () => transport.createChannel(guildId, {
        name: channel.name,
        type,
        parentId,
        ...(channel.topic === undefined ? {} : { topic: channel.topic }),
        permissionOverwrites: overwrites,
      }));
      channelIds.set(channel.key, created?.id ?? `planned:channel:${channel.key}`);
      placed.get(channel.category).push({ id: channelIds.get(channel.key), existing: created });
      continue;
    }
    channelIds.set(channel.key, existing.id);
    const moved = (existing.parentId ?? null) !== parentId;
    placed.get(channel.category).push({ id: existing.id, existing, moved });
    const patch = {
      ...(existing.name !== channel.name ? { name: channel.name } : {}),
      ...(moved ? { parentId } : {}),
      ...(channel.topic !== undefined && topicTypes.has(existing.type) && existing.topic !== channel.topic ? { topic: channel.topic } : {}),
      ...(!sameOverwriteSet(existing.permissionOverwrites, overwrites) ? { permissionOverwrites: overwrites } : {}),
    };
    if (Object.keys(patch).length > 0) await act({ op: "modify-channel", key: channel.key, from: existing.name, changes: Object.keys(patch) }, () => transport.modifyChannel(existing.id, patch));
  }

  const placements = [
    ...orderPlacements(categories),
    ...shape.categories.flatMap((category) => orderPlacements(placed.get(category.key))),
  ];
  if (placements.length > 0) {
    await act({ op: "place", moves: placements.length }, () => transport.modifyChannelPositions(guildId, placements));
  }

  if (shape.onboarding !== undefined) {
    const current = await transport.getGuildOnboarding(guildId);
    const desired = desiredOnboarding(shape, current, channelIds, roleId, snowflakes(now));
    if (!sameOnboarding(current, desired)) {
      await act({ op: "put-onboarding", prompts: desired.prompts.map((prompt) => `${prompt.title} (${prompt.options.length})`) }, () => transport.putGuildOnboarding(guildId, desired, "Turntide guild shape"));
    }
  }

  return Object.freeze({ guildId, applied: apply, actions, channels: Object.fromEntries(channelIds) });
}

function declaredRoleNames(shape) {
  const names = new Set();
  const add = (entries) => { for (const entry of entries ?? []) if (entry.role !== "@everyone") names.add(entry.role); };
  for (const category of shape.categories) add(category.overwrites);
  for (const channel of shape.channels) {
    add(channel.overwrites);
    if (channel.visa !== undefined) names.add(channel.visa.role);
  }
  for (const prompt of shape.onboarding?.prompts ?? []) for (const option of prompt.visas ? [] : prompt.options) for (const role of option.roles ?? []) names.add(role);
  return [...names];
}

function permissionBits(names = []) {
  return names.reduce((bits, name) => {
    const bit = discordPermissions[name];
    if (bit === undefined) throw new TypeError(`unknown permission ${name}`);
    return bits | bit;
  }, 0n);
}

function mergedOverwrites(existing = [], spec, roleId, archived) {
  const entries = new Map(existing.map((overwrite) => [`${overwrite.type}:${overwrite.id}`, { ...overwrite }]));
  for (const entry of spec.overwrites ?? []) {
    const id = roleId(entry.role);
    entries.set(`role:${id}`, { id, type: "role", allow: String(permissionBits(entry.allow)), deny: String(permissionBits(entry.deny)) });
  }
  if (spec.visa !== undefined) {
    const id = roleId(spec.visa.role);
    const prior = entries.get(`role:${id}`) ?? { id, type: "role", allow: "0", deny: "0" };
    entries.set(`role:${id}`, { ...prior, allow: String(BigInt(prior.allow) | visaAllow), deny: String(BigInt(prior.deny) & ~visaAllow) });
  }
  if (archived) {
    const everyone = roleId("@everyone");
    if (!entries.has(`role:${everyone}`)) entries.set(`role:${everyone}`, { id: everyone, type: "role", allow: "0", deny: "0" });
    for (const [key, overwrite] of entries) {
      entries.set(key, { ...overwrite, allow: String(BigInt(overwrite.allow) & ~archiveDeny), deny: String(BigInt(overwrite.deny) | archiveDeny) });
    }
  }
  return [...entries.values()];
}

// Order is compared, not raw positions: Discord renumbers positions freely,
// so a group is re-placed only when a member is new, has just moved in, or
// sits in another order than declared. Moves between categories happen per
// channel beforehand, since Discord re-parents one channel per batch.
function orderPlacements(members) {
  const known = members.filter((member) => member.existing !== undefined && member.moved !== true);
  const inPlace = known.length === members.length
    && [...known].sort((a, b) => (a.existing.position - b.existing.position) || compareIds(a.id, b.id)).every((member, index) => member.id === known[index].id);
  if (inPlace) return [];
  return members.map((member, position) => ({ id: member.id, position }));
}

function compareIds(left, right) {
  return left.length - right.length || (left < right ? -1 : left > right ? 1 : 0);
}

function snowflakes(now) {
  let sequence = 0n;
  const base = (BigInt(now()) - discordEpoch) << 22n;
  return () => String(base | (sequence++ & 0xfffn));
}

function desiredOnboarding(shape, current, channelIds, roleId, nextId) {
  const channelId = (key) => channelIds.get(key);
  const prompts = shape.onboarding.prompts.map((prompt) => {
    const prior = current.prompts.find((candidate) => candidate.title === prompt.title);
    const options = prompt.visas
      ? visaIslands(shape).map((island) => ({ title: island.visa.title, emoji: island.visa.emoji, description: island.visa.description, roles: [island.visa.role], channels: [island.key] }))
      : prompt.options;
    return {
      id: prior?.id ?? nextId(),
      title: prompt.title,
      singleSelect: prompt.singleSelect === true,
      required: prompt.required === true,
      inOnboarding: true,
      options: options.map((option) => ({
        id: prior?.options.find((candidate) => candidate.title === option.title)?.id ?? nextId(),
        title: option.title,
        ...(option.description === undefined ? {} : { description: option.description }),
        ...(option.emoji === undefined ? {} : { emojiName: option.emoji }),
        channelIds: (option.channels ?? []).map(channelId),
        roleIds: (option.roles ?? []).map(roleId),
      })),
    };
  });
  return { enabled: true, mode: current.mode, defaultChannelIds: shape.onboarding.defaultChannels.map(channelId), prompts };
}

function sameOnboarding(left, right) {
  const normal = (onboarding) => JSON.stringify({
    enabled: onboarding.enabled,
    mode: onboarding.mode,
    defaults: [...onboarding.defaultChannelIds].sort(),
    prompts: onboarding.prompts.map((prompt) => ({
      title: prompt.title,
      singleSelect: prompt.singleSelect,
      required: prompt.required,
      options: prompt.options.map((option) => ({
        title: option.title,
        description: option.description ?? null,
        emoji: option.emojiName ?? option.emojiId ?? null,
        channels: [...option.channelIds].sort(),
        roles: [...option.roleIds].sort(),
      })),
    })),
  });
  return normal(left) === normal(right);
}
