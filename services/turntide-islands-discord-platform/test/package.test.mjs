import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import test from "node:test";
import { buildTurntideSite, siteSummary } from "../src/turntide-software-system/site.mjs";
import { renderOrchestrationSystem, turntideCarrier } from "../src/turntide-software-system/index.mjs";
import { InMemoryDiscordTransport } from "../src/turntide-software-system/discord.mjs";
import { entitlement, reconcileMembershipEntitlements } from "../src/turntide-software-system/membership.mjs";
import { bootstrapWithTransport, ingestHistoryWithTransport } from "../src/turntide-software-system/steward.mjs";

test("package has no ambient enterprise runtime or custom stdio protocol", async () => {
  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.deepEqual(Object.keys(manifest.dependencies ?? {}).sort(), ["@napi-rs/canvas", "@red-cup-engineering/a2a-services-section", "@red-cup-engineering/activitypub-services-section", "@red-cup-engineering/category-reference-index-service", "@red-cup-engineering/computer-code-engineering-services-section", "@red-cup-engineering/computer-inference-engine", "@red-cup-engineering/discord-rest-transport-service", "@red-cup-engineering/ethereum-engineering-services-section", "@red-cup-engineering/computer-filepath-engineering-services-section/filepath", "@red-cup-engineering/immutable-content-custody-service", "@red-cup-engineering/uri-services-section", "@red-cup-engineering/witness-journal-document-service"]);
  assert.equal(manifest["x-jsnode-bin"], undefined);
  assert.equal(manifest["x-jsnode-bin-transport"], undefined);
  assert.equal(manifest.name, "@red-cup-engineering/turntide-islands-discord-platform");

  const carrier = turntideCarrier();
  assert.equal(carrier.membership.role, "islander");
});

test("every published runtime target is emitted and never points at source", async () => {
  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const targets = [];
  const visit = (value) => { if (typeof value === "string") targets.push(value); else if (value && typeof value === "object") Object.values(value).forEach(visit); };
  visit(manifest.exports); visit(manifest.main); visit(manifest.types); visit(manifest.bin);
  for (const target of targets) { assert.equal(target.startsWith("./src/"), false); assert.equal(existsSync(new URL(`../${target.slice(2)}`, import.meta.url)), true, target); }
});

test("legacy carrier bins are not retained as a compatibility surface", async () => {
  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.deepEqual(Object.keys(manifest.bin), ["turntide-daily-divination-report"]);
});

test("semantic site emits pages, feeds, and graph", () => {
  const files = buildTurntideSite();
  assert.equal(files.has("index.html"), true);
  assert.equal(files.has("index.jsonld"), true);
  assert.equal(files.has("feed.xml"), true);
  assert.match(files.get("posts/operating-model/index.html") ?? "", /Turntide Islands/);

  const summary = siteSummary();
  assert.equal(summary.packageName, "@red-cup-engineering/turntide-islands-discord-platform");
  assert.equal(summary.lanes, 10);
});

test("orchestration projection carries lanes and public boundary", () => {
  const text = renderOrchestrationSystem();
  assert.match(text, /#weather-report \[public\]/);
  assert.match(text, /not Koios's Discord/);
  assert.match(text, /Human-only matters/);
});

test("direct steward bootstrap creates Turntide lanes, commands, role, and admin notice", async () => {
  const transport = new InMemoryDiscordTransport();
  const guild = (await transport.listGuilds())[0];
  const result = await bootstrapWithTransport(transport, guild.id, { adminUserId: "emsenn" });

  assert.equal(result.channels.length, 11);
  assert.equal(result.commands.length, 16);
  assert.equal(result.role.name, "islander");
  assert.ok(result.channels.some((channel) => channel.name === "ai-archipelago"));
  assert.ok(result.channels.some((channel) => channel.name === "admin-channel"));
  assert.ok(result.commands.some((command) => command.name === "locality-pilot"));
  assert.ok(result.commands.some((command) => command.name === "l-space-login"));
  assert.ok(result.commands.some((command) => command.name === "union-media-intent"));
  assert.ok(result.commands.some((command) => command.name === "union-media-verify"));
  assert.ok(result.commands.some((command) => command.name === "union-media-authenticate"));
  for (const command of [...transport.commands.values()].filter((candidate) => candidate.name.startsWith("union-media-"))) {
    assert.equal(command.defaultMemberPermissions, "8");
    assert.equal(command.dmPermission, false);
  }
  const startHere = [...transport.channels.values()].find((channel) => channel.name === "start-here");
  assert.deepEqual(startHere.permissionOverwrites, [{ id: guild.id, type: "role", allow: "68608", deny: "0" }]);
});

test("history ingestion records Discord messages once", async () => {
  const transport = new InMemoryDiscordTransport();
  const guild = (await transport.listGuilds())[0];
  const channel = await transport.createChannel(guild.id, { name: "weather-report" });
  transport.seedUserMessage(channel.id, "climate note");
  const seen = new Set();

  const first = await ingestHistoryWithTransport(transport, guild.id, { dataRoot: ".tmp/test-ingest", limit: 10, seen });
  const second = await ingestHistoryWithTransport(transport, guild.id, { dataRoot: ".tmp/test-ingest", limit: 10, seen });

  assert.equal(first.messagesAdded, 1);
  assert.equal(second.messagesAdded, 0);
});

test("membership reconciliation removes islander role after cancellation", async () => {
  const transport = new InMemoryDiscordTransport();
  const guild = (await transport.listGuilds())[0];
  const role = await transport.createRole(guild.id, { name: "islander" });
  const active = entitlement({ id: "active", userId: "member", status: "active", observedAt: "2026-07-02T00:00:00.000Z" });
  const cancelled = entitlement({ id: "cancelled", userId: "member", status: "cancelled", observedAt: "2026-07-02T00:01:00.000Z" });

  await reconcileMembershipEntitlements(transport, { guildId: guild.id, roleId: role.id, tiers: [], entitlementsFile: ".tmp/member.json" }, [active]);
  assert.equal(transport.memberHasRole(guild.id, "member", role.id), true);
  await reconcileMembershipEntitlements(transport, { guildId: guild.id, roleId: role.id, tiers: [], entitlementsFile: ".tmp/member.json" }, [active, cancelled]);
  assert.equal(transport.memberHasRole(guild.id, "member", role.id), false);
});
