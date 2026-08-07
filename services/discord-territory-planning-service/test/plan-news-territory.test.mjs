import assert from "node:assert/strict";
import test from "node:test";
import { planDiscordNewsTerritory } from "../src/plan-news-territory.mjs";

const spec = { type: "DiscordNewsTerritorySpecification", version: 1, customer: "urn:ame:turntide-islands", guildId: "guild-tti", lanes: [
  { category: "UHC Embassy", channel: "union-news-service", topic: "Union news", audience: { kind: "admitted-role", role: "UHC member", members: ["leader"] } },
  { category: "TTI Governance", channel: "colonial-news-service", topic: "Colony news", audience: { kind: "everyone" } },
] };

test("casts private and public news lanes into an idempotent symbolic plan", () => {
  const plan = planDiscordNewsTerritory(spec);
  assert.equal(plan.operations.filter((item) => item.kind === "ensure-category").length, 2);
  assert.deepEqual(plan.operations.find((item) => item.kind === "ensure-member-role"), { kind: "ensure-member-role", memberId: "leader", role: "UHC member" });
  assert.equal(plan.operations.find((item) => item.channel === "union-news-service").audience.kind, "admitted-role");
  assert.equal(plan.operations.find((item) => item.channel === "colonial-news-service").audience.kind, "everyone");
  assert.equal(plan.planDigest, planDiscordNewsTerritory(spec).planDigest);
});

test("refuses an implicit private membership", () => {
  const changed = structuredClone(spec); changed.lanes[0].audience.members = [];
  assert.throws(() => planDiscordNewsTerritory(changed), /exact member identifiers/u);
});
