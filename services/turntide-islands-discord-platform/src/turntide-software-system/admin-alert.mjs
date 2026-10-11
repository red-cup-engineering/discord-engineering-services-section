// admin-alert — post a prefixed message into the Turntide Islands Discord admin channel
// (DISCORD_ADMIN_CHANNEL_ID) through this platform's own REST transport. Services that
// alert share the one channel; the prefix ("[KOIOS]", "[ALPACA-ALERT]") names the origin.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { DiscordRestTransport } from "./discord.mjs";

const DISCORD_ENV_FILE = join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".env");

const DISCORD_MESSAGE_LIMIT = 1900; // under Discord's 2000-char ceiling with headroom for the prefix

/** Read DISCORD_BOT_TOKEN / DISCORD_ADMIN_CHANNEL_ID out of this platform's .env, without loading it into process.env. */
export function readDiscordPlatformEnv(envFile = DISCORD_ENV_FILE) {
  const found = {};
  let raw;
  try {
    raw = readFileSync(envFile, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return found;
    throw error;
  }
  for (const line of raw.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/u.exec(trimmed);
    if (match === null) continue;
    let value = match[2].trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    found[match[1]] = value;
  }
  return found;
}

export function formatAlertMessage(prefix, lines) {
  const content = `${prefix} ${lines.join("\n")}`;
  return content.length > DISCORD_MESSAGE_LIMIT
    ? `${content.slice(0, DISCORD_MESSAGE_LIMIT - 1)}…`
    : content;
}

/** Post one alert message; `createTransport` is injectable for tests. */
export async function postAdminAlert(prefix, lines, {
  env = readDiscordPlatformEnv(),
  channelId = env.DISCORD_ADMIN_CHANNEL_ID,
  createTransport = async () => new DiscordRestTransport({ token: env.DISCORD_BOT_TOKEN }),
} = {}) {
  if (typeof channelId !== "string" || channelId.length === 0) {
    throw new Error("discord-admin-channel-id-missing");
  }
  if (typeof env.DISCORD_BOT_TOKEN !== "string" || env.DISCORD_BOT_TOKEN.length === 0) {
    throw new Error("discord-bot-token-missing");
  }
  const transport = await createTransport();
  const content = formatAlertMessage(prefix, lines);
  const message = await transport.createMessage(channelId, content);
  return { channelId, messageId: message.id, content };
}
