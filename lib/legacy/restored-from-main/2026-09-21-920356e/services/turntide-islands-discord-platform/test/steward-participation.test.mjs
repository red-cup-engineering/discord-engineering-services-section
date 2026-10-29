import assert from "node:assert/strict";
import test from "node:test";

import { inferConfiguredEarlyAlphaAnswer, readiness, shouldReply } from "../dist/turntide-software-system/steward.mjs";

test("the steward joins ordinary conversation only when directly invited", () => {
  const botId = "1346540684810915973";

  assert.equal(shouldReply(`<@${botId}> can you help us orient this thread?`, botId), true);
  assert.equal(shouldReply(`<@!${botId}> where should this source go?`, botId), true);
  assert.equal(shouldReply("We are discussing Turntide, climate, and the vault.", botId), false);
  assert.equal(shouldReply("Zelo might know, but I am talking to the people here.", botId), false);
  assert.equal(shouldReply("<@999999999999999999> can you help?", botId), false);
});

test("configured early-alpha inference requires both explicit authority inputs", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; throw new Error("unexpected fetch"); };

  assert.equal(await inferConfiguredEarlyAlphaAnswer("hello", "system", {}, fetchImpl), null);
  assert.equal(await inferConfiguredEarlyAlphaAnswer("hello", "system", { NVIDIA_API_KEY: "configured" }, fetchImpl), null);
  assert.equal(await inferConfiguredEarlyAlphaAnswer("hello", "system", { TTI_AGENT_MODEL: "configured/model" }, fetchImpl), null);
  assert.equal(calls, 0);
});

test("configured early-alpha inference satisfies steward readiness without pretending the market admitted TTI", () => {
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

test("configured early-alpha inference preserves the persona prompt and bounds Discord output", async () => {
  const requests = [];
  const answer = await inferConfiguredEarlyAlphaAnswer(
    "Where should this field note go?",
    "You are the TTI Harbor Master.",
    { NVIDIA_API_KEY: "configured", TTI_AGENT_MODEL: "configured/model" },
    async (url, init) => {
      requests.push({ url, init });
      return new Response(JSON.stringify({ choices: [{ message: { content: `  ${"use #archive-desk ".repeat(150)}` } }] }), { status: 200 });
    },
  );

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://integrate.api.nvidia.com/v1/chat/completions");
  assert.deepEqual(JSON.parse(requests[0].init.body).messages, [
    { role: "system", content: "You are the TTI Harbor Master." },
    { role: "user", content: "Where should this field note go?" },
  ]);
  assert.equal(answer.length, 1900);
});
