import assert from "node:assert/strict";
import test from "node:test";
import { respondToInteraction } from "../src/turntide-software-system/serve.mjs";
import { UNION_MEDIA_DISCORD_CHANNEL_ID, UNION_MEDIA_DISCORD_UNAVAILABLE, unionMediaDiscordCommandAuthorized } from "../src/turntide-software-system/union-media-discord-boundary.mjs";

const source = {
  DISCORD_GUILD_ID: "1184863861065658419",
  DISCORD_ADMIN_USER_ID: "681333902740160598",
};
const interaction = {
  kind: "discord.interaction",
  id: "1529303112744046613",
  applicationId: "1346540684810915973",
  type: "application-command",
  commandName: "union-media-intent",
  guildId: source.DISCORD_GUILD_ID,
  channelId: UNION_MEDIA_DISCORD_CHANNEL_ID,
  userId: source.DISCORD_ADMIN_USER_ID,
  token: "transient",
  version: 1,
};

test("Union Media Discord console admits only the exact UHC channel and TTI leader", () => {
  assert.equal(unionMediaDiscordCommandAuthorized(interaction, source), true);
  assert.equal(unionMediaDiscordCommandAuthorized({ ...interaction, channelId: "1529303112744046600" }, source), false);
  assert.equal(unionMediaDiscordCommandAuthorized({ ...interaction, userId: "1184863861065658420" }, source), false);
  assert.equal(unionMediaDiscordCommandAuthorized({ ...interaction, guildId: "1184863861065658499" }, source), false);
});

test("stale or copied Union Media commands fail closed before any witness mutation", async () => {
  for (const candidate of [
    { ...interaction, channelId: "1529303112744046600" },
    { ...interaction, userId: "1184863861065658420" },
    { ...interaction, guildId: "1184863861065658499" },
  ]) {
    const response = await respondToInteraction(candidate, {}, source);
    assert.equal(response.type, "channel-message-with-source");
    assert.equal(response.content, UNION_MEDIA_DISCORD_UNAVAILABLE);
    assert.equal(response.ephemeral, true);
  }
});
