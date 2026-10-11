#!/usr/bin/env node
// @ts-expect-error binding package has no published declaration yet.
import { loadSettlementAccount } from "@red-cup-engineering/ethereum-engineering-services-section/settlement-account-binding";
import { recordSettlementRecord } from "@red-cup-engineering/witness-journal-document-service";
import { DiscordRestTransport } from "../discord.mjs";
import { env, loadRuntimeEnv, publicTurntideRoot } from "../env.mjs";
import { observeZeloWork, openZeloWorkItems, readZeloWorkRoster, recordZeloWorkResolution, zeloWorkRosterConfig } from "../zelo-work-roster.mjs";

loadRuntimeEnv();

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main() {
  const command = process.argv[2] ?? "observe";
  const config = zeloWorkRosterConfig(process.env);
  if (command === "observe") {
    const witnessJournalAgentUrl = env("WITNESS_JOURNAL_RDF_AGENT", process.env);
    if (witnessJournalAgentUrl === undefined) throw new Error("Zelo work observation requires TTI's contracted witness-journal RDF provider");
    const account = loadSettlementAccount(publicTurntideRoot(process.env));
    const result = await observeZeloWork(new DiscordRestTransport({ env: process.env }), config, {
      witness: async (item) => {
        await recordSettlementRecord({ settlement: account.settlement, actor: account.actor, agentUrl: witnessJournalAgentUrl,
          category: "tti-zelo-work-item-v2",
          recordedAt: item.observedAt,
          record: item,
          assertions: [
            { subject: item.id, predicate: "urn:emsenn:venture:classifies-work-as", object: { kind: "literal", value: item.classification } },
            { subject: item.id, predicate: "urn:emsenn:venture:has-legal-effect", object: { kind: "literal", value: item.legalEffect } },
          ],
        });
      },
    });
    process.stdout.write(`${JSON.stringify({
      type: result.type,
      guildId: result.guildId,
      channelsSeen: result.channelsSeen,
      channelsRead: result.channelsRead,
      channelsSkipped: result.channelsSkipped,
      messagesSeen: result.messagesSeen,
      newItemIds: result.newItems.map((item) => item.id),
      openItemCount: result.openItems.length,
      notificationMessageId: result.notificationMessageId,
      recordedAt: result.recordedAt,
    })}\n`);
    return;
  }
  if (command === "list") {
    const records = await readZeloWorkRoster(config.file);
    process.stdout.write(`${JSON.stringify({ type: "TTIZeloOpenWorkRoster", openItems: openZeloWorkItems(records) }, null, 2)}\n`);
    return;
  }
  if (command === "resolve") {
    const messageId = option("--message");
    const outcome = option("--outcome");
    if (messageId === undefined || outcome === undefined) throw new Error("resolve requires --message and --outcome");
    const evidence = process.argv.flatMap((value, index) => value === "--evidence" && process.argv[index + 1] !== undefined ? [process.argv[index + 1]] : []);
    process.stdout.write(`${JSON.stringify(await recordZeloWorkResolution(config.file, { messageId, outcome, evidence }), null, 2)}\n`);
    return;
  }
  if (command === "verify") {
    const messageId = option("--message");
    if (messageId === undefined) throw new Error("verify requires --message");
    const records = await readZeloWorkRoster(config.file);
    const item = records.find((record) => record.type === "TTIZeloWorkItem" && record.source.messageId === messageId);
    const resolved = item !== undefined && records.some((record) => record.type === "TTIZeloWorkResolution" && record.workItemId === item.id);
    process.stdout.write(`${JSON.stringify({ messageId, seated: item !== undefined, resolved })}\n`);
    process.exitCode = resolved ? 0 : 1;
    return;
  }
  throw new Error(`unknown Zelo work roster command: ${command}`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
