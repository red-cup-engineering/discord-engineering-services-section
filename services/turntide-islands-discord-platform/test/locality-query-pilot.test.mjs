import assert from "node:assert/strict";
import test from "node:test";
import {
  LOCALITY_QUERY_PILOT_CATEGORY,
  LOCALITY_QUERY_PILOT_CONSENT,
  LOCALITY_QUERY_PILOT_CONTRACT,
  localityPilotAcknowledgement,
  localityPilotRecorderFromSettlementWitness,
  prepareDiscordLocalityQueryPilot,
} from "../src/turntide-software-system/locality-query-pilot.mjs";

const now = new Date("2026-07-22T00:00:00.000Z"), guildId = "1184863861065658419", userId = "1184863861065658420", key = "k".repeat(64);
function snowflake(at = now, increment = 0n) { return (((BigInt(at.getTime()) - 1_420_070_400_000n) << 22n) + increment).toString(); }
function input(changes = {}) { return { interactionId: snowflake(), guildId, userId, question: "How do gardeners keep beans healthy in this town's wet clay soil?", subject: "gardening", locality: "Example Town", intendedUse: "research", deliveryInterest: "chat", consent: LOCALITY_QUERY_PILOT_CONSENT, ...changes }; }
function prepare(changes = {}) { return prepareDiscordLocalityQueryPilot(input(changes), { expectedGuildId: guildId, pseudonymKey: key, now }); }

test("admits one explicit bounded no-charge query without durable Discord identity or economic effects", () => {
  const admission = prepare();
  assert.equal(admission.type, "TTIDiscordLocalityQueryPilotAdmission"); assert.equal(admission.contract, LOCALITY_QUERY_PILOT_CONTRACT);
  assert.equal(admission.measurement.buyerQueryAdmitted, true); assert.equal(admission.measurement.freeChatAnswerInterest, true); assert.equal(admission.measurement.priceEstablished, false);
  assert.equal(admission.revenueRecognized, false); assert.equal(admission.profitRecognized, false); assert.equal(admission.fulfillment.answerPromised, false);
  const durable = JSON.stringify(admission);
  assert.doesNotMatch(durable, new RegExp(userId, "u")); assert.doesNotMatch(durable, new RegExp(guildId, "u")); assert.doesNotMatch(durable, new RegExp(input().interactionId, "u"));
  assert.match(durable, /permanentNonPersonalBusinessEvidence/u); assert.match(durable, /messageContentImported.*false/u);
  assert.match(localityPilotAcknowledgement(admission), /No charge occurred/u);
});

test("derives stable actor pseudonyms and interaction-specific replay identities", () => {
  const first = prepare(), second = prepare({ interactionId: snowflake(now, 1n) }), other = prepare({ interactionId: snowflake(now, 2n), userId: "1184863861065658421" });
  assert.equal(first.actorPseudonym, second.actorPseudonym); assert.notEqual(first.submissionPseudonym, second.submissionPseudonym); assert.notEqual(first.actorPseudonym, other.actorPseudonym);
});

test("fails before mutation on changed consent, DM use, personal data, unsupported use, or delivery interest", () => {
  for (const changed of [
    { consent: "yes" },
    { guildId: undefined },
    { question: "Please email jane@example.com about gardening in this town." },
    { intendedUse: "advertising" },
    { deliveryInterest: "email" },
  ]) {
    const result = prepare(changed); assert.equal(result.type, "TTIDiscordLocalityQueryPilotRefusal"); assert.equal(result.durableMutation, false); assert.equal(result.revenueRecognized, false);
  }
});

test("records through one replay-safe TTI settlement category", async () => {
  const rows = [], writes = [], store = { records(category) { assert.equal(category, LOCALITY_QUERY_PILOT_CATEGORY); return rows; }, async record(input) { writes.push(input); rows.push(input.record); } };
  const record = localityPilotRecorderFromSettlementWitness(store), admission = prepare();
  const first = await record(admission), replay = await record(admission);
  assert.equal(first.id, replay.id); assert.equal(writes.length, 1); assert.equal(writes[0].assertions.length, 1);
  await assert.rejects(() => record({ ...admission, id: "ni:///sha-256;AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" }), /not self-addressed/u);
});
