import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryDiscordTransport } from "../src/turntide-software-system/discord.mjs";
import { interactionFromWire } from "../src/turntide-software-system/discord-interactions.mjs";
import { respondToInteraction } from "../src/turntide-software-system/serve.mjs";
import {
  performSelfServiceRoleAction,
  selfServiceRoleConfiguration,
  selfServiceRoleResponse,
} from "../src/turntide-software-system/self-service-roles.mjs";

async function fixture() {
  const transport = new InMemoryDiscordTransport();
  const guildId = "guild-turntide";
  const interest = await transport.createRole(guildId, { name: "Climate signals" });
  const botRole = await transport.createRole(guildId, { name: "Zelo" });
  await transport.addGuildMemberRole(guildId, transport.currentUser.id, botRole.id);
  const configuration = selfServiceRoleConfiguration({
    TTI_SELF_SERVICE_ROLE_ALLOWLIST_JSON: JSON.stringify([{ key: "climate", roleId: interest.id, label: "Climate signals" }]),
  });
  return { transport, guildId, interest, botRole, configuration };
}

test("configuration is a strict data allowlist, not an inferred guild role list", () => {
  assert.throws(() => selfServiceRoleConfiguration({ TTI_SELF_SERVICE_ROLE_ALLOWLIST_JSON: "not-json" }), /valid JSON/u);
  assert.throws(() => selfServiceRoleConfiguration({ TTI_SELF_SERVICE_ROLE_ALLOWLIST_JSON: JSON.stringify([{ key: "same", roleId: "1", label: "One" }, { key: "same", roleId: "2", label: "Two" }]) }), /unique/u);
  assert.deepEqual(selfServiceRoleConfiguration({}).roles, []);
});

test("self-service role actions list, add, and remove only allowlisted roles", async () => {
  const { transport, guildId, interest, configuration } = await fixture();
  const listed = await performSelfServiceRoleAction(transport, { guildId, userId: "member-1", action: "list" }, configuration);
  assert.equal(listed.kind, "listed");
  assert.match(selfServiceRoleResponse(listed), /climate/u);

  const added = await performSelfServiceRoleAction(transport, { guildId, userId: "member-1", action: "add", roleKey: "climate" }, configuration);
  assert.equal(added.kind, "changed");
  assert.equal(transport.memberHasRole(guildId, "member-1", interest.id), true);
  const removed = await performSelfServiceRoleAction(transport, { guildId, userId: "member-1", action: "remove", roleKey: "climate" }, configuration);
  assert.equal(removed.kind, "changed");
  assert.equal(transport.memberHasRole(guildId, "member-1", interest.id), false);

  const refused = await performSelfServiceRoleAction(transport, { guildId, userId: "member-1", action: "add", roleKey: "staff" }, configuration);
  assert.equal(refused.kind, "refused");
  assert.equal(transport.memberHasRole(guildId, "member-1", interest.id), false);
});

test("managed and hierarchy-unsafe roles are refused without a mutation", async () => {
  const { transport, guildId, interest, configuration } = await fixture();
  transport.roles.set(interest.id, Object.freeze({ ...transport.roles.get(interest.id), managed: true }));
  const managed = await performSelfServiceRoleAction(transport, { guildId, userId: "member-1", action: "add", roleKey: "climate" }, configuration);
  assert.equal(managed.kind, "refused");
  assert.match(managed.reason, /integration-managed/u);

  transport.roles.set(interest.id, Object.freeze({ ...transport.roles.get(interest.id), managed: false, position: 99 }));
  const hierarchy = await performSelfServiceRoleAction(transport, { guildId, userId: "member-1", action: "add", roleKey: "climate" }, configuration);
  assert.equal(hierarchy.kind, "refused");
  assert.match(hierarchy.reason, /hierarchy/u);
  assert.equal(transport.memberHasRole(guildId, "member-1", interest.id), false);
});

test("/roles returns only ephemeral, actionable self-service responses", async () => {
  const { transport, guildId, interest } = await fixture();
  const source = { TTI_SELF_SERVICE_ROLE_ALLOWLIST_JSON: JSON.stringify([{ key: "climate", roleId: interest.id, label: "Climate signals" }]) };
  const raw = {
    id: "1529313112233705472", application_id: "app-turntide", type: 2, token: "transient", version: 1,
    guild_id: guildId, member: { user: { id: "member-1", username: "member" } },
    data: { id: "roles", name: "roles", options: [{ name: "action", value: "add" }, { name: "role", value: "climate" }] },
  };
  const response = await respondToInteraction(interactionFromWire(raw), raw, source, { discordTransport: transport });
  assert.equal(response.ephemeral, true);
  assert.match(response.content, /Added Climate signals/u);
  assert.equal(transport.memberHasRole(guildId, "member-1", interest.id), true);

  const unavailable = { ...raw, data: { id: "roles", name: "roles", options: [{ name: "action", value: "add" }, { name: "role", value: "moderator" }] } };
  const rejected = await respondToInteraction(interactionFromWire(unavailable), unavailable, source, { discordTransport: transport });
  assert.equal(rejected.ephemeral, true);
  assert.match(rejected.content, /cannot be changed/u);
});
