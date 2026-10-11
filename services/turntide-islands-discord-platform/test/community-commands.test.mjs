import assert from "node:assert/strict";
import test from "node:test";
import { communityEvents, communityHelp, communityRoles, communityRules, joinCommunityInstructions, prepareCommunityReport } from "../src/turntide-software-system/community-commands.mjs";
import { vaultRigs } from "../src/turntide-software-system/index.mjs";

test("member-facing guidance covers entry, safety, roles, and gatherings without a payment gate", () => {
  assert.match(joinCommunityInstructions(), /free to join/u);
  assert.match(joinCommunityInstructions(), /No wallet, payment/u);
  assert.match(communityHelp(), /\/report/u);
  assert.match(communityRules(), /Human moderators/u);
  assert.match(communityRoles(), /Channels & Roles/u);
  assert.match(communityEvents(), /September 2026 intake ended/u);
  assert.match(communityEvents(), /Events list is authoritative/u);
  assert.doesNotMatch(communityEvents(), /September intake invites/u);
  assert.match(communityEvents(), /human must accept responsibility/u);
  assert.match(communityEvents(), /\/events\//u);
  assert.equal(vaultRigs.find((rig) => rig.inputKind === "newswire")?.href, "https://turntide.561.group/archive/");
});

test("reports create opaque case ids and explicit human handoffs", () => {
  const report = prepareCommunityReport({ interactionId: "1543000000000000000", reporterId: "member-1", channelId: "channel-1", concern: "A member is repeatedly posting my private information.", messageLink: "https://discord.com/channels/1/2/3" });
  assert.match(report.caseId, /^TTI-[A-F0-9]{10}$/u);
  assert.match(report.moderatorMessage, /<@member-1>/u);
  assert.match(report.moderatorMessage, /human must acknowledge/u);
  assert.doesNotMatch(report.acknowledgement, /private information/u);
});

test("reports reject unusable concerns and non-Discord evidence links", () => {
  assert.throws(() => prepareCommunityReport({ interactionId: "1", reporterId: "2", concern: "short" }), /between 10 and 1500/u);
  assert.throws(() => prepareCommunityReport({ interactionId: "1", reporterId: "2", concern: "This is long enough.", messageLink: "https://example.com/not-discord" }), /Discord message URL/u);
});
