
import { env } from "./env.mjs";

export const UNION_MEDIA_DISCORD_CHANNEL_ID = "1529258772982403203";
export const UNION_MEDIA_DISCORD_ADMINISTRATOR_PERMISSIONS = "8";
export const UNION_MEDIA_DISCORD_UNAVAILABLE = "This Union Media command is unavailable here.";

/**
 * Discord is a private UHC sponsor/referral console, not the sovereign
 * advertiser boundary. Keep stale command registrations and copied command
 * identifiers from crossing the exact guild, channel, and leader authority.
 */
export function unionMediaDiscordCommandAuthorized(interaction, source) {
  const guildId = env("DISCORD_GUILD_ID", source);
  const channelId = env("TTI_UNION_MEDIA_CHANNEL_ID", source) ?? UNION_MEDIA_DISCORD_CHANNEL_ID;
  const adminUserId = env("DISCORD_ADMIN_USER_ID", source);
  return guildId !== undefined && adminUserId !== undefined
    && interaction.guildId === guildId
    && interaction.channelId === channelId
    && interaction.userId === adminUserId;
}
