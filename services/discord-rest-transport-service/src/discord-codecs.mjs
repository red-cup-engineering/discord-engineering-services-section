import { isNonEmptyString, isRecord } from "@red-cup-engineering/signcell/values";



function optionalText(value) { return value === undefined || typeof value === "string"; }
function carrier(admit) {
  return Object.freeze({ assert(value, label = "Discord value") {
    if (!isRecord(value) || !admit(value)) throw new TypeError(`${label} does not conform to the Discord HTTP projection`);
    return value;
  } });
}

const option = (value) => isRecord(value) && isNonEmptyString(value.name) && isNonEmptyString(value.description) && (value.required === undefined || typeof value.required === "boolean");

export const discordUserCarrier = carrier((v) => v.kind === "discord.user" && isNonEmptyString(v.id) && isNonEmptyString(v.username) && (v.bot === undefined || typeof v.bot === "boolean"));
export const discordGuildCarrier = carrier((v) => v.kind === "discord.guild" && isNonEmptyString(v.id) && isNonEmptyString(v.name) && optionalText(v.ownerId));
export const discordRoleCarrier = carrier((v) => v.kind === "discord.role" && isNonEmptyString(v.id) && isNonEmptyString(v.name) && optionalText(v.permissions) && (v.managed === undefined || typeof v.managed === "boolean") && (v.position === undefined || Number.isInteger(v.position)));
export const discordPermissionOverwriteCarrier = carrier((v) => v.kind === "discord.permission-overwrite" && isNonEmptyString(v.id) && ["role", "member"].includes(String(v.type)) && isNonEmptyString(v.allow) && isNonEmptyString(v.deny));
export const discordChannelTypes = Object.freeze({ text: 0, voice: 2, category: 4, announcement: 5, stage: 13, forum: 15, media: 16 });
export const discordChannelCarrier = carrier((v) => v.kind === "discord.channel" && isNonEmptyString(v.id) && isNonEmptyString(v.name) && optionalText(v.topic) && (v.permissionOverwrites === undefined || Array.isArray(v.permissionOverwrites)) && (v.type === undefined || typeof v.type === "string") && (v.parentId === undefined || v.parentId === null || isNonEmptyString(v.parentId)) && (v.position === undefined || Number.isInteger(v.position)));
export const discordOnboardingCarrier = carrier((v) => v.kind === "discord.onboarding" && typeof v.enabled === "boolean" && Number.isInteger(v.mode) && Array.isArray(v.defaultChannelIds) && v.defaultChannelIds.every(isNonEmptyString) && Array.isArray(v.prompts) && v.prompts.every((prompt) => isNonEmptyString(prompt.title) && Array.isArray(prompt.options) && prompt.options.every((option) => isNonEmptyString(option.title) && Array.isArray(option.channelIds) && Array.isArray(option.roleIds))));
export const discordMessageCarrier = carrier((v) => v.kind === "discord.message" && [v.id, v.channelId, v.authorId, v.authorName, v.timestamp].every(isNonEmptyString) && typeof v.authorBot === "boolean" && typeof v.content === "string" && optionalText(v.replyToId) && Array.isArray(v.mentionedUserIds) && v.mentionedUserIds.every(isNonEmptyString));
export const discordCommandOptionCarrier = carrier((v) => option(v));
export const discordCommandCarrier = carrier((v) => v.kind === "discord.command" && [v.id, v.name, v.description].every(isNonEmptyString) && (v.options === undefined || Array.isArray(v.options) && v.options.every(option)) && optionalText(v.defaultMemberPermissions) && (v.dmPermission === undefined || typeof v.dmPermission === "boolean"));
export const discordInteractionCarrier = carrier((v) => v.kind === "discord.interaction" && isNonEmptyString(v.id) && isNonEmptyString(v.applicationId) && ["ping", "application-command", "message-component", "modal-submit", "autocomplete"].includes(String(v.type)) && isNonEmptyString(v.token) && Number.isInteger(v.version) && Number(v.version) >= 1 && [v.commandName, v.commandId, v.guildId, v.channelId, v.userId, v.username].every(optionalText));
export const discordInteractionResponseCarrier = carrier((v) => v.kind === "discord.interaction-response" && ["pong", "channel-message-with-source", "deferred-channel-message-with-source"].includes(String(v.type)) && optionalText(v.content) && (v.ephemeral === undefined || typeof v.ephemeral === "boolean"));
export const discordGuildBoostStatusCarrier = carrier((v) => v.kind === "discord.guild-boost-status" && isNonEmptyString(v.guildId) && [0, 1, 2, 3].includes(v.premiumTier) && Number.isInteger(v.boostCount) && Number(v.boostCount) >= 0);
export const discordEmojiCarrier = carrier((v) => v.kind === "discord.emoji" && isNonEmptyString(v.id) && isNonEmptyString(v.name) && typeof v.animated === "boolean" && typeof v.available === "boolean");
export const discordStickerCarrier = carrier((v) => v.kind === "discord.sticker" && isNonEmptyString(v.id) && isNonEmptyString(v.name) && optionalText(v.description) && typeof v.tags === "string" && ["png", "apng", "lottie", "gif"].includes(String(v.format)) && typeof v.available === "boolean");
