import { createHash } from "node:crypto";

export const DISCORD_TERRITORY_PLANNER = "urn:ame:discord-territory-planning-service";
export const DISCORD_TERRITORY_LAW = "org.emsenn.discord-news-territory-planning.v1";
export const DISCORD_PERMISSION = Object.freeze({ viewChannel: "1024", sendMessages: "2048", readMessageHistory: "65536" });

function finite(value) { return typeof value === "string" && value.length > 0 && !value.includes("\0"); }
function digest(value) { return `urn:sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`; }
function assertName(value, label) {
  if (!finite(value) || value.length > 100) throw new TypeError(`${label} must be a bounded Discord name`);
}

export function planDiscordNewsTerritory(specification) {
  if (specification?.type !== "DiscordNewsTerritorySpecification" || specification.version !== 1 || !finite(specification.guildId) || !finite(specification.customer)) {
    throw new TypeError("territory planning needs one exact versioned customer and guild");
  }
  if (!Array.isArray(specification.lanes) || specification.lanes.length === 0) throw new TypeError("territory planning needs at least one lane");
  const categoryNames = new Set(); const channelNames = new Set(); const operations = [];
  for (const lane of specification.lanes) {
    assertName(lane?.category, "category"); assertName(lane?.channel, "channel");
    if (categoryNames.has(lane.category) || channelNames.has(lane.channel)) throw new TypeError("territory names must be unique within one plan");
    categoryNames.add(lane.category); channelNames.add(lane.channel);
    if (!finite(lane.topic) || lane.topic.length > 1024) throw new TypeError("channel topic must be finite and bounded");
    let audience;
    if (lane.audience?.kind === "everyone") {
      audience = { kind: "everyone" };
    } else if (lane.audience?.kind === "admitted-role") {
      assertName(lane.audience.role, "audience role");
      if (!Array.isArray(lane.audience.members) || !lane.audience.members.length || !lane.audience.members.every(finite)) throw new TypeError("an admitted role needs exact member identifiers");
      audience = { kind: "admitted-role", role: lane.audience.role, members: [...new Set(lane.audience.members)].sort() };
      operations.push({ kind: "ensure-role", role: audience.role, reason: "project admitted polity membership into a local Discord gate" });
      for (const memberId of audience.members) operations.push({ kind: "ensure-member-role", memberId, role: audience.role });
    } else throw new TypeError("unknown Discord news audience kind");
    operations.push({ kind: "ensure-category", category: lane.category, audience });
    operations.push({ kind: "ensure-text-channel", channel: lane.channel, category: lane.category, topic: lane.topic, audience, publisherOnly: true });
  }
  const body = { type: "DiscordNewsTerritoryPlan", version: 1, law: DISCORD_TERRITORY_LAW, provider: DISCORD_TERRITORY_PLANNER, customer: specification.customer, guildId: specification.guildId, specificationDigest: digest(specification), operations };
  return { ...body, planDigest: digest(body) };
}
