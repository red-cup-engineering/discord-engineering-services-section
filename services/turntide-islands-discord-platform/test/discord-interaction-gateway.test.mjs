import assert from "node:assert/strict";
import test from "node:test";
import { postGatewayInteractionResponse, startDiscordInteractionGateway } from "../src/turntide-software-system/discord-interaction-gateway.mjs";
import { interactionFromWire } from "../src/turntide-software-system/discord-interactions.mjs";
import { respondToInteraction } from "../src/turntide-software-system/serve.mjs";

const source = { DISCORD_BOT_TOKEN: "t".repeat(64), DISCORD_GUILD_ID: "1184863861065658419" };
const raw = { id: "1529313112233705472", application_id: "1346540684810915973", type: 2, token: "transient-interaction-token", version: 1, guild_id: source.DISCORD_GUILD_ID, member: { user: { id: "1184863861065658420", username: "buyer" } }, data: { id: "command", name: "locality-pilot", options: [] } };

test("gateway interactions respond through the official HTTP callback without bot authorization", async () => {
  const calls = [];
  await postGatewayInteractionResponse(raw, source, { respond: async () => ({ kind: "discord.interaction-response", type: "channel-message-with-source", content: "accepted", ephemeral: true }), fetch: async (url, init) => { calls.push({ url, init }); return new Response(null, { status: 204 }); } });
  assert.equal(calls.length, 1); assert.match(String(calls[0].url), /\/interactions\/1529313112233705472\/transient-interaction-token\/callback$/u);
  assert.equal(calls[0].init.headers.authorization, undefined); assert.deepEqual(JSON.parse(calls[0].init.body), { type: 4, data: { content: "accepted", flags: 64 } });
});

test("only Discord's already-acknowledged callback code is replay-safe", async () => {
  const respond = async () => ({ kind: "discord.interaction-response", type: "channel-message-with-source", content: "accepted", ephemeral: true });
  await postGatewayInteractionResponse(raw, source, { respond, fetch: async () => new Response(JSON.stringify({ code: 40060, message: "already acknowledged" }), { status: 400 }) });
  await assert.rejects(() => postGatewayInteractionResponse(raw, source, { respond, fetch: async () => new Response(JSON.stringify({ code: 50035, message: "invalid form" }), { status: 400 }) }), /50035/u);
});

test("gateway l-space-login forwards only the signed login admission projection", async () => {
  const login = { ...raw, member: { pending: false, roles: ["islander-role"], user: { id: raw.member.user.id, username: "buyer" } }, data: { id: "command", name: "l-space-login", options: [{ name: "code", value: "browser-only-challenge" }] } };
  const calls = [];
  const response = await respondToInteraction(interactionFromWire(login), login, source, {
    now: () => 1_700_000_000_000,
    fetch: async (url, init) => { calls.push({ url, init }); return new Response(null, { status: 204 }); },
  });
  assert.match(response.content, /Login confirmed/u);
  assert.equal(calls.length, 1);
  assert.equal(String(calls[0].url), "https://l-space.561.group/api/v1/discord/gateway-command");
  assert.equal(calls[0].init.headers.authorization, undefined);
  assert.deepEqual(JSON.parse(calls[0].init.body), { challenge: "browser-only-challenge", guildId: source.DISCORD_GUILD_ID, userId: raw.member.user.id, pending: false, roles: ["islander-role"] });
  assert.match(calls[0].init.headers["x-l-space-gateway-signature"], /^[a-f0-9]{64}$/u);
});

test("gateway identifies with zero privileged intents and reaches READY", async () => {
  const sockets = [];
  class FakeSocket {
    readyState = 1; listeners = new Map(); sent = []; constructor(url) { this.url = url; sockets.push(this); queueMicrotask(() => this.emit("message", { data: JSON.stringify({ op: 10, d: { heartbeat_interval: 60000 } }) })); }
    addEventListener(type, listener) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]); }
    send(data) { this.sent.push(JSON.parse(data)); if (this.sent.at(-1).op === 2) queueMicrotask(() => this.emit("message", { data: JSON.stringify({ op: 0, t: "READY", s: 1, d: { user: { id: "bot" }, application: { id: "app" } } }) })); }
    close(code) { this.emit("close", { code }); }
    emit(type, event) { for (const listener of this.listeners.get(type) ?? []) listener(event); }
  }
  const gateway = await startDiscordInteractionGateway(source, { WebSocket: FakeSocket, fetch: async (url) => String(url).includes("/gateway/bot") ? new Response(JSON.stringify({ url: "wss://gateway.discord.test" }), { status: 200 }) : new Response(null, { status: 204 }), readyTimeoutMs: 1000 });
  assert.equal(gateway.applicationId, "app"); assert.equal(gateway.guildId, source.DISCORD_GUILD_ID); assert.equal(sockets[0].sent.find((packet) => packet.op === 2).d.intents, 0); gateway.close();
});
