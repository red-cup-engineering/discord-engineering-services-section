import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { InMemoryDiscordTransport } from "../src/turntide-software-system/discord.mjs";
import {
  brokerKnowledgeOfferFromMessage,
  consumeKnowledgeOfferSession,
  knowledgeBrokerConfig,
  knowledgeBrokerMentionFromMessageCreate,
} from "../src/turntide-software-system/knowledge-broker.mjs";

test("a bot mention reduces Discord data to a pointer and DMs a one-time direct-intake link", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "tti-knowledge-broker-"));
  try {
    const sessionsFile = path.join(directory, "sessions.jsonl");
    const config = { brokerBotId: "broker", intakeBaseUrl: "https://tti.example/", sessionsFile, candidatesFile: `${sessionsFile}.candidates`, termsFile: `${sessionsFile}.terms`, ttlMinutes: 30, effectiveTermsId: "tti-knowledge-contribution-terms-effective-2026-02", effectiveTermsDigest: "sha256:test-terms", marketAdmissionId: "admission-test" };
    const raw = {
      id: "message-1", guild_id: "guild-1", channel_id: "channel-1",
      author: { id: "human-1", bot: false }, mentions: [{ id: "broker", bot: true }],
      content: "@broker I want to sell this highly private knowledge; it must not enter the session ledger",
      attachments: [{ filename: "private.txt" }],
    };
    const event = knowledgeBrokerMentionFromMessageCreate(raw, "2026-07-21T20:00:00.000Z");
    assert.equal(event.discordMessageContentImported, false);
    assert.equal("content" in event, false);
    assert.equal("attachments" in event, false);

    const transport = new InMemoryDiscordTransport({ currentUser: { id: "broker", username: "TTI Knowledge Broker", bot: true } });
    const result = await brokerKnowledgeOfferFromMessage(raw, config, transport, { now: new Date("2026-07-21T20:00:00.000Z"), token: "test-one-time-token-00000001" });
    assert.equal(result.outcome, "dm-sent");
    assert.equal(result.session.legalEffect, "offer-session-only-no-license-or-sale");
    assert.equal(transport.directRecipients.size, 1);
    const ledger = await readFile(sessionsFile, "utf8");
    assert.doesNotMatch(ledger, /highly private knowledge/u);
    assert.doesNotMatch(ledger, /test-one-time-token-00000001/u);

    const first = await consumeKnowledgeOfferSession("test-one-time-token-00000001", sessionsFile, { now: new Date("2026-07-21T20:05:00.000Z") });
    assert.equal(first.accepted, true);
    const second = await consumeKnowledgeOfferSession("test-one-time-token-00000001", sessionsFile, { now: new Date("2026-07-21T20:06:00.000Z") });
    assert.equal(second.reason, "session-already-consumed");

    await brokerKnowledgeOfferFromMessage({ ...raw, id: "message-2" }, config, transport, { now: new Date("2026-07-21T20:10:00.000Z"), token: "racing-token-00000000000001" });
    const racing = await Promise.all([
      consumeKnowledgeOfferSession("racing-token-00000000000001", sessionsFile, { now: new Date("2026-07-21T20:11:00.000Z") }),
      consumeKnowledgeOfferSession("racing-token-00000000000001", sessionsFile, { now: new Date("2026-07-21T20:11:00.000Z") }),
    ]);
    assert.deepEqual(racing.map((entry) => entry.accepted).sort(), [false, true]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("activation refuses draft terms and non-HTTPS public intake", () => {
  const base = { TTI_KNOWLEDGE_BROKER_ENABLED: "true", TTI_KNOWLEDGE_INTAKE_BASE_URL: "https://tti.example/", TTI_KNOWLEDGE_EFFECTIVE_TERMS_ID: "tti-knowledge-contribution-terms-draft-2026-01" };
  assert.throws(() => knowledgeBrokerConfig(base, "broker"), /draft/u);
  assert.throws(() => knowledgeBrokerConfig({ ...base, TTI_KNOWLEDGE_INTAKE_BASE_URL: "http://tti.example/", TTI_KNOWLEDGE_EFFECTIVE_TERMS_ID: "effective" }, "broker"), /HTTPS/u);
  assert.throws(() => knowledgeBrokerConfig({ ...base, TTI_KNOWLEDGE_EFFECTIVE_TERMS_ID: "effective" }, "broker"), /not admitted/u);
  assert.equal(knowledgeBrokerConfig({}, "broker"), null);
});

test("messages not mentioning the broker and bot-authored messages are ignored", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "tti-knowledge-broker-ignore-"));
  try {
    const config = { brokerBotId: "broker", intakeBaseUrl: "https://tti.example/", sessionsFile: path.join(directory, "sessions.jsonl"), candidatesFile: path.join(directory, "candidates.jsonl"), termsFile: path.join(directory, "terms.json"), ttlMinutes: 30, effectiveTermsId: "effective", effectiveTermsDigest: "sha256:test-terms", marketAdmissionId: "admission-test" };
    const transport = new InMemoryDiscordTransport({ currentUser: { id: "broker", username: "TTI Knowledge Broker", bot: true } });
    const base = { id: "m", guild_id: "g", channel_id: "c", author: { id: "u", bot: false }, mentions: [] };
    assert.equal((await brokerKnowledgeOfferFromMessage(base, config, transport)).outcome, "ignored");
    assert.equal((await brokerKnowledgeOfferFromMessage({ ...base, author: { id: "other-bot", bot: true }, mentions: [{ id: "broker" }] }, config, transport)).outcome, "ignored");
    assert.equal((await brokerKnowledgeOfferFromMessage({ ...base, content: "@broker I cannot access the channel", mentions: [{ id: "broker" }] }, config, transport)).outcome, "ignored");
    assert.equal(transport.directRecipients.size, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
