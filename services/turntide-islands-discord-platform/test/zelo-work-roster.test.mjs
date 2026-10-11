import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { identifyTurntideDiscordPlatformRecord as semanticId } from "../src/turntide-software-system/discord-platform-record-semantic-content.mjs";
import { InMemoryDiscordTransport } from "../src/turntide-software-system/discord.mjs";
import {
  UNION_MEDIA_PROVIDER_LOT_IDS,
  observeZeloWork,
  openZeloWorkItems,
  parseUnionMediaProviderLead,
  readZeloWorkRoster,
  recordZeloWorkResolution,
} from "../src/turntide-software-system/zelo-work-roster.mjs";

test("every human Zelo mention enters a private deduplicated operational roster", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "tti-zelo-work-"));
  try {
    const transport = new InMemoryDiscordTransport({ currentUser: { id: "bot-zelo", username: "Zelo", bot: true } });
    const guild = (await transport.listGuilds())[0];
    const mainland = await transport.createChannel(guild.id, { name: "mainland" });
    const admin = await transport.createChannel(guild.id, { name: "admin-channel" });
    transport.seedUserMessage(mainland.id, "<@bot-zelo> I cannot access the private garden channel; private detail stays in Discord.");
    transport.seedUserMessage(mainland.id, "<@bot-zelo> I want to sell this gardening knowledge.");
    transport.seedUserMessage(mainland.id, "<@bot-zelo> Our enterprise can provide custody-clean ActivityPub hosting for TTI.");
    transport.seedUserMessage(mainland.id, "<@bot-zelo> UNION-MEDIA-INFRASTRUCTURE-OFFER enterprise=urn:ame:cedar-carrier lots=custody-clean-activitypub-carrier,tti-public-https-activitypub-host agent-card=https://cedar.example/.well-known/agent-card.json");
    transport.seedUserMessage(mainland.id, "<@bot-zelo> UNION-MEDIA-INFRASTRUCTURE-OFFER we can do everything; call me privately.");
    transport.seedUserMessage(mainland.id, "A message that does not address the bot.");
    const file = path.join(directory, "roster.jsonl");
    const config = { guildId: guild.id, file, adminChannelId: admin.id, adminUserId: "admin-human", lookbackMinutes: 60, messagesPerChannel: 100 };

    const first = await observeZeloWork(transport, config, { now: new Date() });
    assert.equal(first.newItems.length, 5);
    assert.deepEqual(first.newItems.map((item) => item.classification).sort(), ["access-permission", "knowledge-contribution-offer-request", "service-provider-offer", "service-provider-offer", "service-provider-offer"]);
    assert.ok(first.newItems.filter((item) => item.classification === "service-provider-offer").every((item) => item.serviceProviderEffect === "nonbinding-provider-lead-only-no-contract-authority-custody-grant-or-acceptance"));
    const qualified = first.newItems.find((item) => item.unionMediaProviderLead?.status === "qualified-declared-provider-lead");
    assert.equal(qualified.unionMediaProviderLead.declaredEnterprise, "urn:ame:cedar-carrier");
    assert.deepEqual(qualified.unionMediaProviderLead.offeredLotIds, [UNION_MEDIA_PROVIDER_LOT_IDS[0], UNION_MEDIA_PROVIDER_LOT_IDS[2]]);
    assert.equal(qualified.unionMediaProviderLead.agentCardFetched, false);
    assert.equal(qualified.unionMediaProviderLead.declaredEnterpriseAuthenticated, false);
    const { id: qualifiedId, ...qualifiedBody } = qualified;
    assert.equal(qualifiedId, semanticId(qualifiedBody));
    assert.equal(first.newItems.find((item) => item.unionMediaProviderLead?.status === "unqualified-marker-mention").unionMediaProviderLead.qualificationReasons[0], "exact-provider-lead-grammar-required");
    assert.ok(first.notificationMessageId);
    const durable = await readFile(file, "utf8");
    assert.doesNotMatch(durable, /private garden|gardening knowledge|custody-clean ActivityPub hosting/u);
    assert.doesNotMatch(durable, /do everything|call me privately/u);
    assert.match(durable, /urn:ame:cedar-carrier/u);
    assert.match(durable, /operational-request-only-not-knowledge-contribution-consent-license-or-sale/u);

    const second = await observeZeloWork(transport, config, { now: new Date() });
    assert.equal(second.newItems.length, 0);
    const access = first.newItems.find((item) => item.classification === "access-permission");
    const settled = await recordZeloWorkResolution(file, { messageId: access.source.messageId, outcome: "permission-repaired", evidence: ["discord-message:repair"] });
    assert.equal(settled.recorded, true);
    assert.equal(openZeloWorkItems(await readZeloWorkRoster(file)).some((item) => item.id === access.id), false);
    assert.equal((await recordZeloWorkResolution(file, { messageId: access.source.messageId, outcome: "duplicate", evidence: [] })).recorded, false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Union Media provider grammar admits only canonical bounded declarations without fetching identity", () => {
  const prefix = "<@bot-zelo> UNION-MEDIA-INFRASTRUCTURE-OFFER enterprise=urn:ame:provider lots=";
  const valid = parseUnionMediaProviderLead(`${prefix}${UNION_MEDIA_PROVIDER_LOT_IDS.join(",")} agent-card=https://provider.example/.well-known/agent-card.json`, "bot-zelo");
  assert.equal(valid.status, "qualified-declared-provider-lead");
  assert.deepEqual(valid.offeredLotIds, UNION_MEDIA_PROVIDER_LOT_IDS);
  assert.equal(valid.agentCardFetched, false);
  assert.equal(valid.providerContractOfferObserved, false);
  for (const content of [
    `${prefix}${UNION_MEDIA_PROVIDER_LOT_IDS[2]},${UNION_MEDIA_PROVIDER_LOT_IDS[0]} agent-card=https://provider.example/.well-known/agent-card.json`,
    `${prefix}${UNION_MEDIA_PROVIDER_LOT_IDS[0]},${UNION_MEDIA_PROVIDER_LOT_IDS[0]} agent-card=https://provider.example/.well-known/agent-card.json`,
    `${prefix}${UNION_MEDIA_PROVIDER_LOT_IDS[0]} agent-card=https://user:secret@provider.example/.well-known/agent-card.json`,
    `${prefix}${UNION_MEDIA_PROVIDER_LOT_IDS[0]} agent-card=https://provider.example/.well-known/agent-card.json?token=secret`,
    `${prefix}unknown-lot agent-card=https://provider.example/.well-known/agent-card.json`,
  ]) {
    const refused = parseUnionMediaProviderLead(content, "bot-zelo");
    assert.equal(refused.status, "unqualified-marker-mention");
    assert.deepEqual(refused.offeredLotIds, []);
    assert.equal(refused.agentCardUrl, undefined);
  }
});
