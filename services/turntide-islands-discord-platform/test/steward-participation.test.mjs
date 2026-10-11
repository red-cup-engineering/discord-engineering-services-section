import assert from "node:assert/strict";
import test from "node:test";

import { readiness, shouldReply } from "../src/turntide-software-system/steward.mjs";

test("the steward joins ordinary conversation only when directly invited", () => {
  const botId = "1346540684810915973";

  assert.equal(shouldReply(`<@${botId}> can you help us orient this thread?`, botId), true);
  assert.equal(shouldReply(`<@!${botId}> where should this source go?`, botId), true);
  assert.equal(shouldReply("We are discussing Turntide, climate, and the vault.", botId), false);
  assert.equal(shouldReply("Zelo might know, but I am talking to the people here.", botId), false);
  assert.equal(shouldReply("<@999999999999999999> can you help?", botId), false);
});

test("a pinned NVIDIA model satisfies steward inference readiness", () => {
  const source = {
    DISCORD_CLIENT_ID: "client",
    DISCORD_BOT_TOKEN: "token",
    DISCORD_GUILD_ID: "guild",
    DISCORD_ADMIN_USER_ID: "admin",
    DISCORD_ADMIN_CHANNEL_ID: "channel",
    TURNTIDE_ISLANDER_ROLE_ID: "role",
    NVIDIA_API_KEY: "configured",
    TTI_AGENT_MODEL: "configured/model",
  };

  assert.deepEqual(readiness(source).missing, []);
});

