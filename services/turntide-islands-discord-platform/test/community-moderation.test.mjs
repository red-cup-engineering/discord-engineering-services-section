import assert from "node:assert/strict";
import test from "node:test";
import {
  DiscordRestTransport,
  InMemoryDiscordTransport,
} from "../src/turntide-software-system/discord.mjs";
import {
  baselineAutoModerationRuleNames,
  communityModerationBoundary,
  ensureBaselineCommunityAutoModeration,
} from "../src/turntide-software-system/community-moderation.mjs";

test("in-memory transport models reversible and human-invoked moderation primitives", async () => {
  const transport = new InMemoryDiscordTransport();
  const guildId = "guild-turntide";
  const channel = await transport.createChannel(guildId, { name: "quay" });
  const message = transport.seedUserMessage(channel.id, "please help");

  await transport.deleteMessage(channel.id, message.id);
  assert.deepEqual(await transport.listMessages(channel.id, 10), []);

  await transport.timeoutGuildMember(guildId, "member-1", "2026-09-01T00:00:00.000Z", "human review");
  assert.equal(transport.memberTimeouts.get(`${guildId}:member-1`), "2026-09-01T00:00:00.000Z");
  await transport.banGuildMember(guildId, "member-2", { deleteMessageSeconds: 60, reason: "human review" });
  assert.deepEqual(transport.bannedMembers.get(`${guildId}:member-2`), { deleteMessageSeconds: 60, reason: "human review" });
  await transport.unbanGuildMember(guildId, "member-2", "appeal granted");
  assert.equal(transport.bannedMembers.has(`${guildId}:member-2`), false);
});

test("baseline AutoMod holds and alerts, while a human owns member consequences and appeals", async () => {
  const transport = new InMemoryDiscordTransport();
  const guildId = "guild-turntide";
  const bridge = await transport.createChannel(guildId, { name: "moderator-bridge" });
  const first = await ensureBaselineCommunityAutoModeration(transport, guildId, bridge.id);
  assert.equal(first.created.length, 2);
  assert.equal(first.updated.length, 0);

  const rules = await transport.listAutoModerationRules(guildId);
  assert.deepEqual(rules.map((rule) => rule.name).sort(), Object.values(baselineAutoModerationRuleNames).sort());
  assert.deepEqual(rules.map((rule) => rule.triggerType).sort(), ["keyword-preset", "mention-spam"]);
  assert.deepEqual(rules.find((rule) => rule.triggerType === "keyword-preset").triggerMetadata.presets, [3]);
  for (const rule of rules) {
    assert.deepEqual(rule.actions.map((action) => action.type), ["block-message", "send-alert"]);
    assert.equal(rule.actions[1].channelId, bridge.id);
  }
  assert.deepEqual(communityModerationBoundary.automodMay, ["block-message", "send-alert"]);
  assert.ok(communityModerationBoundary.humanOnly.includes("appeal-review"));
  assert.ok(communityModerationBoundary.humanOnly.includes("ban-member"));

  const second = await ensureBaselineCommunityAutoModeration(transport, guildId, bridge.id);
  assert.equal(second.created.length, 0);
  assert.equal(second.updated.length, 2);
});

test("REST transport maps moderation operations to Discord endpoints and wire shapes", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const rule = {
    id: "rule-1", guild_id: "guild-1", name: "mention guard", trigger_type: 5,
    trigger_metadata: { mention_total_limit: 5 },
    actions: [{ type: 1, metadata: { custom_message: "Held" } }, { type: 2, metadata: { channel_id: "bridge-1" } }],
    enabled: true, exempt_roles: [], exempt_channels: [],
  };
  globalThis.fetch = async (input, init = {}) => {
    calls.push({ url: String(input), method: init.method, headers: new Headers(init.headers), body: init.body });
    const url = String(input);
    return new Response(url.endsWith("/auto-moderation/rules") && init.method === "GET" ? JSON.stringify([rule]) : JSON.stringify(rule), {
      status: 200, headers: { "content-type": "application/json" },
    });
  };
  try {
    const transport = new DiscordRestTransport({ token: "test-token", apiBase: "https://discord.test/api/v10" });
    await transport.deleteMessage("channel-1", "message-1");
    await transport.timeoutGuildMember("guild-1", "member-1", "2026-09-01T00:00:00.000Z", "human review");
    await transport.banGuildMember("guild-1", "member-1", { deleteMessageSeconds: 60, reason: "human review" });
    await transport.unbanGuildMember("guild-1", "member-1", "appeal granted");
    const listed = await transport.listAutoModerationRules("guild-1");
    await transport.createAutoModerationRule("guild-1", {
      name: "mention guard", triggerType: "mention-spam", triggerMetadata: { mention_total_limit: 5 },
      actions: [{ type: "block-message" }, { type: "send-alert", channelId: "bridge-1" }], enabled: true,
    });
    await transport.updateAutoModerationRule("guild-1", "rule-1", {
      name: "mention guard", triggerType: "mention-spam", actions: [{ type: "block-message" }], enabled: false,
    });

    assert.equal(listed[0].triggerType, "mention-spam");
    assert.deepEqual(listed[0].actions.map((action) => action.type), ["block-message", "send-alert"]);
    assert.deepEqual(calls.map((call) => `${call.method} ${new URL(call.url).pathname}`), [
      "DELETE /api/v10/channels/channel-1/messages/message-1",
      "PATCH /api/v10/guilds/guild-1/members/member-1",
      "PUT /api/v10/guilds/guild-1/bans/member-1",
      "DELETE /api/v10/guilds/guild-1/bans/member-1",
      "GET /api/v10/guilds/guild-1/auto-moderation/rules",
      "POST /api/v10/guilds/guild-1/auto-moderation/rules",
      "PATCH /api/v10/guilds/guild-1/auto-moderation/rules/rule-1",
    ]);
    assert.equal(calls[1].headers.get("x-audit-log-reason"), "human%20review");
    assert.equal(calls[2].headers.get("x-audit-log-reason"), "human%20review");
    assert.deepEqual(JSON.parse(calls[5].body), {
      name: "mention guard", event_type: 1, trigger_type: 5, trigger_metadata: { mention_total_limit: 5 },
      actions: [{ type: 1, metadata: {} }, { type: 2, metadata: { channel_id: "bridge-1" } }],
      enabled: true, exempt_roles: [], exempt_channels: [],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
