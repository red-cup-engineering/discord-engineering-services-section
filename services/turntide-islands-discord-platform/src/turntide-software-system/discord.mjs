import { DiscordRestTransport as SharedDiscordRestTransport, InMemoryDiscordTransport as SharedInMemoryDiscordTransport, discordPermissions, inviteUrl as sharedInviteUrl } from "@red-cup-engineering/discord-rest-transport-service";

export * from "@red-cup-engineering/discord-rest-transport-service";

export const turntidePermissionBits =
  discordPermissions.viewChannel |
  discordPermissions.sendMessages |
  discordPermissions.manageMessages |
  discordPermissions.readMessageHistory |
  discordPermissions.manageRoles |
  discordPermissions.manageChannels |
  discordPermissions.useApplicationCommands;

export function inviteUrl(clientId) {
  return sharedInviteUrl(clientId, turntidePermissionBits);
}

const turntideUserAgent = "@red-cup-engineering/turntide-islands-discord-platform steward (https://561.group)";

export class DiscordRestTransport extends SharedDiscordRestTransport {
  constructor(options = {}) {
    super({ ...options, userAgent: options.userAgent ?? turntideUserAgent });
  }
}

export class InMemoryDiscordTransport extends SharedInMemoryDiscordTransport {
  constructor(options = {}) {
    super({ applicationId: "app-turntide", currentUser: { id: "bot-turntide", username: "Tidewatcher", bot: true }, guild: { id: "guild-turntide", name: "Turntide Islands", ownerId: "emsenn" }, ...options });
  }
}
