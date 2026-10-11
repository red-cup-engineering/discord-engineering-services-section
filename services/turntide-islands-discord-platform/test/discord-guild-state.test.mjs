import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { observeDiscordGuildState, writeDiscordGuildState } from "../src/turntide-software-system/discord-guild-state.mjs";

test("guild state observation is GET-only, bounded, normalized, and atomically writable", async () => {
  const calls = [];
  const responses = {
    "/api/v10/guilds/g": { id: "g", name: "Turntide Islands", features: ["COMMUNITY", "ONBOARDING"], rules_channel_id: "dock" },
    "/api/v10/guilds/g/channels": [{ id: "dock", name: "dock", type: 0, position: 1, parent_id: "harbor", topic: "Established welcome", permission_overwrites: [{ id: "g", type: 0, allow: "1", deny: "2" }, { id: "human-id", type: 1, allow: "1", deny: "0" }] }, { id: "harbor", name: "Harbor", type: 4, position: 0 }],
    "/api/v10/guilds/g/roles": [{ id: "z", name: "Zelo", position: 3, permissions: "8" }, { id: "g", name: "@everyone", position: 0, permissions: "0" }],
    "/api/v10/guilds/g/onboarding": { enabled: true, mode: 0, default_channel_ids: ["dock"], prompts: [{ id: "p", title: "Choose", required: true, options: [{ id: "o", title: "Islander", role_ids: ["r"], channel_ids: [] }] }] },
    "/api/v10/guilds/g/welcome-screen": { description: "Welcome", welcome_channels: [{ channel_id: "dock", description: "Start here", emoji_name: "🏝️" }] },
  };
  const fetch = async (input, init) => {
    const pathname = new URL(String(input)).pathname;
    calls.push({ pathname, method: init.method });
    return new Response(JSON.stringify(responses[pathname]), { status: 200, headers: { "content-type": "application/json" } });
  };
  const state = await observeDiscordGuildState({ DISCORD_BOT_TOKEN: "tti-test-token", DISCORD_GUILD_ID: "g" }, { fetch, now: new Date("2026-08-29T22:00:00.000Z"), apiBase: "https://discord.test/api/v10" });
  assert.deepEqual(calls.map((call) => call.method), ["GET", "GET", "GET", "GET", "GET"]);
  assert.ok(calls.every((call) => !/messages|members|invites|reactions/u.test(call.pathname)));
  assert.equal(state.channels[0].kind, "category");
  assert.equal(state.channels[1].permissionOverwrites[0].targetType, "role");
  assert.equal(state.channels[1].permissionOverwrites[1].targetId, null);
  assert.equal(JSON.stringify(state).includes("human-id"), false);
  assert.deepEqual(state.source.methods, ["GET"]);
  assert.equal(JSON.stringify(state).includes("tti-test-token"), false);
  const directory = await mkdtemp(path.join(os.tmpdir(), "tti-state-"));
  try {
    const file = path.join(directory, "state", "discord-guild-state.json");
    await writeDiscordGuildState(state, file);
    assert.deepEqual(JSON.parse(await readFile(file, "utf8")), JSON.parse(JSON.stringify(state)));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
