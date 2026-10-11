import { createPublicKey, verify } from "node:crypto";
import { optionalStringField, record, stringField } from "./discord.mjs";
import {
  discordInteractionCarrier,
  discordInteractionResponseCarrier,

} from "./discord-codecs.mjs";

const interactionTypeByWireValue = Object.freeze({
  1: "ping",
  2: "application-command",
  3: "message-component",
  4: "autocomplete",
  5: "modal-submit",
});

/**
 * Verify a Discord Interactions HTTP request's Ed25519 signature over
 * `timestamp + rawBody`, using the application's public key. Discord requires
 * this check before any interaction payload is trusted.
 */
export function verifyDiscordInteractionSignature(input

) {
  try {
    const signedAt = Number(input.timestamp), now = input.now ?? Math.floor(Date.now() / 1000);
    if (!Number.isSafeInteger(signedAt) || Math.abs(now - signedAt) > (input.toleranceSeconds ?? 300)) return false;
    const key = createPublicKey({
      key: { kty: "OKP", crv: "Ed25519", x: Buffer.from(input.publicKey, "hex").toString("base64url") },
      format: "jwk",
    });
    return verify(null, Buffer.from(input.timestamp + input.rawBody, "utf8"), key, Buffer.from(input.signature, "hex"));
  } catch {
    return false;
  }
}

/** Read a raw Discord Interactions HTTP payload into normalized, admitted form. */
export function interactionFromWire(raw) {
  const wireType = raw["type"];
  const type = interactionTypeByWireValue[typeof wireType === "number" ? wireType : -1];
  if (type === undefined) throw new TypeError(`Discord interaction: unknown type ${JSON.stringify(wireType)}`);
  const data = record(raw["data"]);
  const memberUser = record(record(raw["member"])["user"]);
  const directUser = record(raw["user"]);
  const user = Object.keys(memberUser).length > 0 ? memberUser : directUser;
  const candidate = {
    kind: "discord.interaction",
    id: stringField(raw, "id"),
    applicationId: stringField(raw, "application_id"),
    type,
    commandName: optionalStringField(data, "name"),
    commandId: optionalStringField(data, "id"),
    guildId: optionalStringField(raw, "guild_id"),
    channelId: optionalStringField(raw, "channel_id"),
    userId: optionalStringField(user, "id"),
    username: optionalStringField(user, "username"),
    token: stringField(raw, "token"),
    version: typeof raw["version"] === "number" ? raw["version"] : 1,
  };
  return discordInteractionCarrier.assert(candidate, "Discord interaction");
}

/** Read a slash command's string option value by name (e.g. `/ask question:`). */
export function interactionStringOption(raw, name) {
  const options = record(raw["data"])["options"];
  if (!Array.isArray(options)) return undefined;
  const match = options.map(record).find((option) => stringField(option, "name") === name);
  return match === undefined ? undefined : optionalStringField(match, "value");
}

export function pingResponse() {
  return discordInteractionResponseCarrier.assert({ kind: "discord.interaction-response", type: "pong" }, "Discord interaction response");
}

export function deferredResponse(options = {}) {
  return discordInteractionResponseCarrier.assert(
    { kind: "discord.interaction-response", type: "deferred-channel-message-with-source", ephemeral: options.ephemeral },
    "Discord interaction response",
  );
}

export function messageResponse(content, options = {}) {
  return discordInteractionResponseCarrier.assert(
    { kind: "discord.interaction-response", type: "channel-message-with-source", content, ephemeral: options.ephemeral },
    "Discord interaction response",
  );
}

/** Discord's Interactions Endpoint response wire shape for one of our normalized responses. */
export function interactionResponseToWire(response) {
  if (response.type === "pong") return { type: 1 };
  if (response.type === "deferred-channel-message-with-source") return { type: 5, data: { flags: response.ephemeral ? 64 : undefined } };
  return { type: 4, data: { content: response.content, flags: response.ephemeral ? 64 : undefined } };
}
