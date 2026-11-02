import { env, type EnvMap } from "./env.mts";
import {
  discordChannelCarrier,
  discordCommandCarrier,
  discordGuildCarrier,
  discordMessageCarrier,
  discordPermissionOverwriteCarrier,
  discordRoleCarrier,
  discordUserCarrier,
} from "./discord-codecs.mts";

export type DiscordAccess = "public" | "member" | "staff";

export interface DiscordGuild {
  readonly id: string;
  readonly name: string;
  readonly ownerId?: string;
}

export interface DiscordUser {
  readonly id: string;
  readonly username: string;
  readonly bot?: boolean;
}

export interface DiscordRole {
  readonly id: string;
  readonly name: string;
  readonly permissions?: string;
}

export interface DiscordPermissionOverwrite {
  readonly id: string;
  readonly type: "role" | "member";
  readonly allow: string;
  readonly deny: string;
}

export interface DiscordChannel {
  readonly id: string;
  readonly name: string;
  readonly topic?: string;
  readonly permissionOverwrites?: readonly DiscordPermissionOverwrite[];
}

export interface DiscordMessage {
  readonly id: string;
  readonly channelId: string;
  readonly authorId: string;
  readonly authorName: string;
  readonly authorBot: boolean;
  readonly content: string;
  readonly timestamp: string;
  readonly replyToId?: string;
  readonly mentionedUserIds: readonly string[];
}

export interface DiscordFileAttachment {
  readonly name: string;
  readonly data: Uint8Array;
  readonly contentType?: string;
}

export interface DiscordCommandOption {
  readonly name: string;
  readonly description: string;
  readonly required?: boolean;
}

export interface DiscordCommand {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly options?: readonly DiscordCommandOption[];
  readonly defaultMemberPermissions?: string;
  readonly dmPermission?: boolean;
}

export type DiscordCommandSpec = Readonly<{ name: string; description: string; options?: readonly DiscordCommandOption[]; defaultMemberPermissions?: string; dmPermission?: boolean }>;

export interface DiscordTransport {
  getApplicationId(): Promise<string>;
  getCurrentUser(): Promise<DiscordUser>;
  getGuild(guildId: string): Promise<DiscordGuild>;
  listGuilds(): Promise<readonly DiscordGuild[]>;
  listChannels(guildId: string): Promise<readonly DiscordChannel[]>;
  createChannel(guildId: string, channel: Readonly<{ name: string; topic?: string; permissionOverwrites?: readonly DiscordPermissionOverwrite[] }>): Promise<DiscordChannel>;
  modifyChannel(channelId: string, patch: Readonly<{ topic?: string; permissionOverwrites?: readonly DiscordPermissionOverwrite[] }>): Promise<DiscordChannel>;
  listRoles(guildId: string): Promise<readonly DiscordRole[]>;
  createRole(guildId: string, role: Readonly<{ name: string; mentionable?: boolean }>): Promise<DiscordRole>;
  listCommands(applicationId: string, guildId: string): Promise<readonly DiscordCommand[]>;
  registerCommand(applicationId: string, guildId: string, command: DiscordCommandSpec): Promise<DiscordCommand>;
  updateCommand(applicationId: string, guildId: string, commandId: string, command: DiscordCommandSpec): Promise<DiscordCommand>;
  listMessages(channelId: string, limit: number): Promise<readonly DiscordMessage[]>;
  createDirectMessageChannel(userId: string): Promise<string>;
  createMessage(channelId: string, input: string | Readonly<{ content: string; allowedMentions?: { readonly users?: readonly string[] }; files?: readonly DiscordFileAttachment[] }>): Promise<DiscordMessage>;
  addGuildMemberRole(guildId: string, userId: string, roleId: string): Promise<void>;
  removeGuildMemberRole(guildId: string, userId: string, roleId: string): Promise<void>;
}

export const discordPermissions = Object.freeze({
  viewChannel: 1n << 10n,
  sendMessages: 1n << 11n,
  manageMessages: 1n << 13n,
  readMessageHistory: 1n << 16n,
  manageRoles: 1n << 28n,
  manageChannels: 1n << 4n,
  useApplicationCommands: 1n << 31n,
});

export const turntidePermissionBits =
  discordPermissions.viewChannel |
  discordPermissions.sendMessages |
  discordPermissions.manageMessages |
  discordPermissions.readMessageHistory |
  discordPermissions.manageRoles |
  discordPermissions.manageChannels |
  discordPermissions.useApplicationCommands;

export function inviteUrl(clientId: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    scope: "bot applications.commands",
    permissions: turntidePermissionBits.toString(),
  });
  return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
}

export function normalizedName(value: string): string {
  return value.trim().toLowerCase();
}

export function botToken(source: EnvMap = process.env): string | undefined {
  return env("DISCORD_BOT_TOKEN", source) ?? env("DISCORD_TOKEN", source);
}

export class DiscordRestTransport implements DiscordTransport {
  readonly #token: string;
  readonly #apiBase: string;

  constructor(options: Readonly<{ token?: string; apiBase?: string; env?: EnvMap }> = {}) {
    const token = options.token ?? botToken(options.env);
    if (token === undefined) throw new Error("DISCORD_BOT_TOKEN or DISCORD_TOKEN is required");
    this.#token = token;
    this.#apiBase = options.apiBase ?? "https://discord.com/api/v10";
  }

  async getApplicationId(): Promise<string> {
    const app = await this.#request<Record<string, unknown>>("GET", "/oauth2/applications/@me");
    const id = stringField(app, "id");
    if (id === "") throw new Error("Discord application response did not include id");
    return id;
  }

  async getCurrentUser(): Promise<DiscordUser> {
    const user = await this.#request<Record<string, unknown>>("GET", "/users/@me");
    return userFromWire(user);
  }

  async getGuild(guildId: string): Promise<DiscordGuild> {
    const guild = await this.#request<Record<string, unknown>>("GET", `/guilds/${guildId}`);
    return guildFromWire(guild);
  }

  async listGuilds(): Promise<readonly DiscordGuild[]> {
    const guilds = await this.#request<unknown[]>("GET", "/users/@me/guilds");
    return guilds.map((entry) => guildFromWire(record(entry)));
  }

  async listChannels(guildId: string): Promise<readonly DiscordChannel[]> {
    const channels = await this.#request<unknown[]>("GET", `/guilds/${guildId}/channels`);
    return channels.map((entry) => channelFromWire(record(entry)));
  }

  async createChannel(guildId: string, channel: Readonly<{ name: string; topic?: string; permissionOverwrites?: readonly DiscordPermissionOverwrite[] }>): Promise<DiscordChannel> {
    const created = await this.#request<Record<string, unknown>>("POST", `/guilds/${guildId}/channels`, channelToWire(channel));
    return channelFromWire(created);
  }

  async modifyChannel(channelId: string, patch: Readonly<{ topic?: string; permissionOverwrites?: readonly DiscordPermissionOverwrite[] }>): Promise<DiscordChannel> {
    const updated = await this.#request<Record<string, unknown>>("PATCH", `/channels/${channelId}`, channelToWire(patch));
    return channelFromWire(updated);
  }

  async listRoles(guildId: string): Promise<readonly DiscordRole[]> {
    const roles = await this.#request<unknown[]>("GET", `/guilds/${guildId}/roles`);
    return roles.map((entry) => roleFromWire(record(entry)));
  }

  async createRole(guildId: string, role: Readonly<{ name: string; mentionable?: boolean }>): Promise<DiscordRole> {
    const created = await this.#request<Record<string, unknown>>("POST", `/guilds/${guildId}/roles`, role);
    return roleFromWire(created);
  }

  async listCommands(applicationId: string, guildId: string): Promise<readonly DiscordCommand[]> {
    const commands = await this.#request<unknown[]>("GET", `/applications/${applicationId}/guilds/${guildId}/commands`);
    return commands.map((entry) => commandFromWire(record(entry)));
  }

  async registerCommand(applicationId: string, guildId: string, command: DiscordCommandSpec): Promise<DiscordCommand> {
    const created = await this.#request<Record<string, unknown>>("POST", `/applications/${applicationId}/guilds/${guildId}/commands`, commandToWire(command));
    return commandFromWire(created);
  }

  async updateCommand(applicationId: string, guildId: string, commandId: string, command: DiscordCommandSpec): Promise<DiscordCommand> {
    const updated = await this.#request<Record<string, unknown>>("PATCH", `/applications/${applicationId}/guilds/${guildId}/commands/${commandId}`, commandToWire(command));
    return commandFromWire(updated);
  }

  async listMessages(channelId: string, limit: number): Promise<readonly DiscordMessage[]> {
    const messages = await this.#request<unknown[]>("GET", `/channels/${channelId}/messages?limit=${Math.min(100, Math.max(1, limit))}`);
    return messages.map((entry) => messageFromWire(record(entry), channelId));
  }

  async createDirectMessageChannel(userId: string): Promise<string> {
    const channel = await this.#request<Record<string, unknown>>("POST", "/users/@me/channels", { recipient_id: userId });
    const id = stringField(channel, "id");
    if (id === "") throw new Error("Discord create-DM response did not include a channel id");
    return id;
  }

  async createMessage(channelId: string, input: string | Readonly<{ content: string; allowedMentions?: { readonly users?: readonly string[] }; files?: readonly DiscordFileAttachment[] }>): Promise<DiscordMessage> {
    const files = typeof input === "string" ? undefined : input.files;
    const body = typeof input === "string" ? { content: input } : {
      content: input.content,
      allowed_mentions: input.allowedMentions === undefined ? undefined : { users: input.allowedMentions.users ?? [] },
    };
    const created =
      files === undefined || files.length === 0
        ? await this.#request<Record<string, unknown>>("POST", `/channels/${channelId}/messages`, body)
        : await this.#requestMultipart<Record<string, unknown>>("POST", `/channels/${channelId}/messages`, body, files);
    return messageFromWire(created, channelId);
  }

  // Discord's file-attachment upload is a multipart/form-data POST with the
  // JSON payload as a `payload_json` field alongside one `files[n]` field per
  // attachment — distinct from #request's plain JSON body path above, which
  // Discord's own message-create endpoint does not accept files through.
  async #requestMultipart<T = unknown>(
    method: string,
    route: string,
    jsonBody: unknown,
    files: readonly DiscordFileAttachment[],
  ): Promise<T> {
    const form = new FormData();
    form.append("payload_json", JSON.stringify(jsonBody));
    files.forEach((file, index) => {
      form.append(`files[${index}]`, new Blob([file.data], { type: file.contentType ?? "application/octet-stream" }), file.name);
    });
    const res = await fetch(`${this.#apiBase}${route}`, {
      method,
      headers: {
        authorization: `Bot ${this.#token}`,
        "user-agent": "@red-cup-engineering/turntide-islands steward (https://561.group)",
      },
      body: form,
    });
    if (res.status === 429) {
      const retry = await res.json().catch(() => ({ retry_after: 1 })) as { retry_after?: number };
      await new Promise((resolve) => setTimeout(resolve, Math.ceil((retry.retry_after ?? 1) * 1000)));
      return this.#requestMultipart<T>(method, route, jsonBody, files);
    }
    const text = await res.text();
    if (!res.ok) throw new Error(`Discord ${method} ${route} (multipart) -> ${res.status}: ${text.slice(0, 400)}`);
    return (text.length === 0 ? null : JSON.parse(text)) as T;
  }

  async addGuildMemberRole(guildId: string, userId: string, roleId: string): Promise<void> {
    await this.#request("PUT", `/guilds/${guildId}/members/${userId}/roles/${roleId}`);
  }

  async removeGuildMemberRole(guildId: string, userId: string, roleId: string): Promise<void> {
    await this.#request("DELETE", `/guilds/${guildId}/members/${userId}/roles/${roleId}`);
  }

  async #request<T = unknown>(method: string, route: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.#apiBase}${route}`, {
      method,
      headers: {
        authorization: `Bot ${this.#token}`,
        "content-type": "application/json",
        "user-agent": "@red-cup-engineering/turntide-islands steward (https://561.group)",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 429) {
      const retry = await res.json().catch(() => ({ retry_after: 1 })) as { retry_after?: number };
      await new Promise((resolve) => setTimeout(resolve, Math.ceil((retry.retry_after ?? 1) * 1000)));
      return this.#request<T>(method, route, body);
    }
    const text = await res.text();
    if (!res.ok) throw new Error(`Discord ${method} ${route} -> ${res.status}: ${text.slice(0, 400)}`);
    return (text.length === 0 ? null : JSON.parse(text)) as T;
  }
}

export class InMemoryDiscordTransport implements DiscordTransport {
  readonly applicationId: string;
  readonly currentUser: DiscordUser;
  readonly guilds = new Map<string, DiscordGuild>();
  readonly channels = new Map<string, DiscordChannel & { readonly guildId: string }>();
  readonly roles = new Map<string, DiscordRole & { readonly guildId: string }>();
  readonly commands = new Map<string, DiscordCommand & { readonly applicationId: string; readonly guildId: string }>();
  readonly messages = new Map<string, DiscordMessage[]>();
  readonly memberRoles = new Map<string, Set<string>>();
  readonly filesReceived = new Map<string, readonly DiscordFileAttachment[]>();
  readonly directRecipients = new Map<string, string>();
  #sequence = 0;

  constructor(options: Readonly<{ applicationId?: string; currentUser?: DiscordUser; guild?: DiscordGuild }> = {}) {
    this.applicationId = options.applicationId ?? "app-turntide";
    this.currentUser = options.currentUser ?? { id: "bot-turntide", username: "Tidewatcher", bot: true };
    const guild = options.guild ?? { id: "guild-turntide", name: "Turntide Islands", ownerId: "emsenn" };
    this.guilds.set(guild.id, guild);
    this.roles.set(guild.id, { id: guild.id, guildId: guild.id, name: "@everyone", permissions: "0" });
  }

  async getApplicationId(): Promise<string> {
    return this.applicationId;
  }

  async getCurrentUser(): Promise<DiscordUser> {
    return this.currentUser;
  }

  async getGuild(guildId: string): Promise<DiscordGuild> {
    const guild = this.guilds.get(guildId);
    if (guild === undefined) throw new Error(`unknown guild ${guildId}`);
    return guild;
  }

  async listGuilds(): Promise<readonly DiscordGuild[]> {
    return [...this.guilds.values()];
  }

  async listChannels(guildId: string): Promise<readonly DiscordChannel[]> {
    return [...this.channels.values()].filter((channel) => channel.guildId === guildId);
  }

  async createChannel(guildId: string, channel: Readonly<{ name: string; topic?: string; permissionOverwrites?: readonly DiscordPermissionOverwrite[] }>): Promise<DiscordChannel> {
    const id = this.#id("channel", channel.name);
    const created = Object.freeze({ id, guildId, name: channel.name, topic: channel.topic, permissionOverwrites: channel.permissionOverwrites });
    this.channels.set(id, created);
    this.messages.set(id, []);
    return created;
  }

  async modifyChannel(channelId: string, patch: Readonly<{ topic?: string; permissionOverwrites?: readonly DiscordPermissionOverwrite[] }>): Promise<DiscordChannel> {
    const existing = this.channels.get(channelId);
    if (existing === undefined) throw new Error(`unknown channel ${channelId}`);
    const updated = Object.freeze({ ...existing, ...patch });
    this.channels.set(channelId, updated);
    return updated;
  }

  async listRoles(guildId: string): Promise<readonly DiscordRole[]> {
    return [...this.roles.values()].filter((role) => role.guildId === guildId);
  }

  async createRole(guildId: string, role: Readonly<{ name: string; mentionable?: boolean }>): Promise<DiscordRole> {
    const id = this.#id("role", role.name);
    const created = Object.freeze({ id, guildId, name: role.name, permissions: "0" });
    this.roles.set(id, created);
    return created;
  }

  async listCommands(applicationId: string, guildId: string): Promise<readonly DiscordCommand[]> {
    return [...this.commands.values()].filter((command) => command.applicationId === applicationId && command.guildId === guildId);
  }

  async registerCommand(applicationId: string, guildId: string, command: DiscordCommandSpec): Promise<DiscordCommand> {
    const id = this.#id("command", command.name);
    const created = Object.freeze({ id, applicationId, guildId, name: command.name, description: command.description, options: command.options, defaultMemberPermissions: command.defaultMemberPermissions, dmPermission: command.dmPermission });
    this.commands.set(id, created);
    return created;
  }

  async updateCommand(applicationId: string, guildId: string, commandId: string, command: DiscordCommandSpec): Promise<DiscordCommand> {
    const existing = this.commands.get(commandId);
    if (existing === undefined) throw new Error(`unknown command ${commandId}`);
    const updated = Object.freeze({ ...existing, name: command.name, description: command.description, options: command.options, defaultMemberPermissions: command.defaultMemberPermissions, dmPermission: command.dmPermission });
    this.commands.set(commandId, updated);
    return updated;
  }

  async listMessages(channelId: string, limit: number): Promise<readonly DiscordMessage[]> {
    return [...(this.messages.get(channelId) ?? [])].slice(0, Math.max(1, limit));
  }

  async createDirectMessageChannel(userId: string): Promise<string> {
    const existing = [...this.directRecipients.entries()].find(([, recipient]) => recipient === userId)?.[0];
    if (existing !== undefined) return existing;
    const channelId = this.#id("dm", userId);
    this.directRecipients.set(channelId, userId);
    this.messages.set(channelId, []);
    return channelId;
  }

  async createMessage(channelId: string, input: string | Readonly<{ content: string; files?: readonly DiscordFileAttachment[] }>): Promise<DiscordMessage> {
    const content = typeof input === "string" ? input : input.content;
    const message = Object.freeze({
      id: this.#id("message", channelId),
      channelId,
      authorId: this.currentUser.id,
      authorName: this.currentUser.username,
      authorBot: this.currentUser.bot ?? false,
      content,
      timestamp: new Date().toISOString(),
      mentionedUserIds: Object.freeze([...content.matchAll(/<@!?(\w[\w-]*)>/gu)].map((match) => match[1]!)),
    });
    this.messages.set(channelId, [message, ...(this.messages.get(channelId) ?? [])]);
    if (typeof input !== "string" && input.files !== undefined && input.files.length > 0) {
      this.filesReceived.set(message.id, input.files);
    }
    return message;
  }

  seedUserMessage(channelId: string, content: string, user: DiscordUser = { id: "member-turntide", username: "islander" }): DiscordMessage {
    const message = Object.freeze({
      id: this.#id("message", channelId),
      channelId,
      authorId: user.id,
      authorName: user.username,
      authorBot: user.bot ?? false,
      content,
      timestamp: new Date().toISOString(),
      mentionedUserIds: Object.freeze([...content.matchAll(/<@!?(\w[\w-]*)>/gu)].map((match) => match[1]!)),
    });
    this.messages.set(channelId, [message, ...(this.messages.get(channelId) ?? [])]);
    return message;
  }

  async addGuildMemberRole(guildId: string, userId: string, roleId: string): Promise<void> {
    const key = `${guildId}:${userId}`;
    const roles = this.memberRoles.get(key) ?? new Set<string>();
    roles.add(roleId);
    this.memberRoles.set(key, roles);
  }

  async removeGuildMemberRole(guildId: string, userId: string, roleId: string): Promise<void> {
    this.memberRoles.get(`${guildId}:${userId}`)?.delete(roleId);
  }

  memberHasRole(guildId: string, userId: string, roleId: string): boolean {
    return this.memberRoles.get(`${guildId}:${userId}`)?.has(roleId) ?? false;
  }

  #id(kind: string, name: string): string {
    this.#sequence += 1;
    return `${kind}-${normalizedName(name).replace(/[^a-z0-9]+/gu, "-")}-${this.#sequence}`;
  }
}

function channelToWire(channel: Readonly<{ name?: string; topic?: string; permissionOverwrites?: readonly DiscordPermissionOverwrite[] }>): Record<string, unknown> {
  return {
    ...(channel.name === undefined ? {} : { name: channel.name }),
    ...(channel.topic === undefined ? {} : { topic: channel.topic }),
    ...(channel.permissionOverwrites === undefined ? {} : {
      permission_overwrites: channel.permissionOverwrites.map((overwrite) => ({
        id: overwrite.id,
        type: overwrite.type === "role" ? 0 : 1,
        allow: overwrite.allow,
        deny: overwrite.deny,
      })),
    }),
  };
}

function guildFromWire(raw: Record<string, unknown>): DiscordGuild {
  const candidate = { id: stringField(raw, "id"), name: stringField(raw, "name"), ownerId: optionalStringField(raw, "owner_id") };
  discordGuildCarrier.assert({ kind: "discord.guild" as const, ...candidate }, "Discord guild");
  return candidate;
}

function userFromWire(raw: Record<string, unknown>): DiscordUser {
  const candidate = { id: stringField(raw, "id"), username: stringField(raw, "username"), bot: raw["bot"] === true };
  discordUserCarrier.assert({ kind: "discord.user" as const, ...candidate }, "Discord user");
  return candidate;
}

function roleFromWire(raw: Record<string, unknown>): DiscordRole {
  const candidate = { id: stringField(raw, "id"), name: stringField(raw, "name"), permissions: optionalStringField(raw, "permissions") };
  discordRoleCarrier.assert({ kind: "discord.role" as const, ...candidate }, "Discord role");
  return candidate;
}

function commandToWire(command: DiscordCommandSpec): Record<string, unknown> {
  return {
    name: command.name,
    description: command.description,
    type: 1,
    ...(command.defaultMemberPermissions === undefined ? {} : { default_member_permissions: command.defaultMemberPermissions }),
    ...(command.dmPermission === undefined ? {} : { dm_permission: command.dmPermission }),
    ...(command.options === undefined ? {} : {
      options: command.options.map((option) => ({
        type: 3,
        name: option.name,
        description: option.description,
        required: option.required ?? false,
      })),
    }),
  };
}

function commandFromWire(raw: Record<string, unknown>): DiscordCommand {
  const options = Array.isArray(raw["options"])
    ? raw["options"].map((entry) => {
        const option = record(entry);
        return { name: stringField(option, "name"), description: stringField(option, "description"), required: option["required"] === true };
      })
    : undefined;
  const candidate = {
    id: stringField(raw, "id"),
    name: stringField(raw, "name"),
    description: stringField(raw, "description"),
    options,
    defaultMemberPermissions: optionalStringField(raw, "default_member_permissions"),
    dmPermission: typeof raw["dm_permission"] === "boolean" ? raw["dm_permission"] : undefined,
  };
  discordCommandCarrier.assert({ kind: "discord.command" as const, ...candidate }, "Discord command");
  return candidate;
}

function channelFromWire(raw: Record<string, unknown>): DiscordChannel {
  const overwrites = Array.isArray(raw["permission_overwrites"])
    ? raw["permission_overwrites"].map((entry) => overwriteFromWire(record(entry)))
    : undefined;
  const candidate = { id: stringField(raw, "id"), name: stringField(raw, "name"), topic: optionalStringField(raw, "topic"), permissionOverwrites: overwrites };
  discordChannelCarrier.assert({ kind: "discord.channel" as const, ...candidate }, "Discord channel");
  return candidate;
}

function overwriteFromWire(raw: Record<string, unknown>): DiscordPermissionOverwrite {
  const candidate = {
    id: stringField(raw, "id"),
    type: (raw["type"] === 1 ? "member" : "role") as "role" | "member",
    allow: stringField(raw, "allow"),
    deny: stringField(raw, "deny"),
  };
  discordPermissionOverwriteCarrier.assert({ kind: "discord.permission-overwrite" as const, ...candidate }, "Discord permission overwrite");
  return candidate;
}

function messageFromWire(raw: Record<string, unknown>, channelIdFallback: string): DiscordMessage {
  const author = record(raw["author"]);
  const candidate = {
    id: stringField(raw, "id"),
    channelId: optionalStringField(raw, "channel_id") ?? channelIdFallback,
    authorId: stringField(author, "id"),
    authorName: stringField(author, "username"),
    authorBot: author["bot"] === true,
    content: stringField(raw, "content"),
    timestamp: optionalStringField(raw, "timestamp") ?? new Date().toISOString(),
    replyToId: optionalStringField(record(raw["message_reference"]), "message_id"),
    mentionedUserIds: Array.isArray(raw["mentions"])
      ? raw["mentions"].map((value) => stringField(record(value), "id")).filter((value) => value !== "")
      : [],
  };
  discordMessageCarrier.assert({ kind: "discord.message" as const, ...candidate }, "Discord message");
  return candidate;
}

export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function stringField(raw: Record<string, unknown>, key: string): string {
  const value = raw[key];
  return typeof value === "string" ? value : "";
}

export function optionalStringField(raw: Record<string, unknown>, key: string): string | undefined {
  const value = stringField(raw, key);
  return value === "" ? undefined : value;
}

/**
 * Patch a deferred interaction's original response — the Discord Interactions
 * follow-up webhook, authenticated by the interaction token itself rather
 * than the bot token, used to deliver an answer computed after the initial
 * 3-second acknowledgement window.
 */
export async function postInteractionFollowup(
  applicationId: string,
  interactionToken: string,
  content: string,
  options: Readonly<{ apiBase?: string }> = {},
): Promise<void> {
  const apiBase = options.apiBase ?? "https://discord.com/api/v10";
  const res = await fetch(`${apiBase}/webhooks/${applicationId}/${interactionToken}/messages/@original`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error(`Discord interaction followup -> ${res.status}: ${(await res.text()).slice(0, 400)}`);
}
