#!/usr/bin/env node
import { identifyTurntideDiscordPlatformRecord as semanticId } from "../discord-platform-record-semantic-content.mts";
import { startDiscordInteractionGateway } from "../discord-interaction-gateway.mts";
import { loadRuntimeEnv } from "../env.mts";
import { localityPilotSettlementWitness } from "../locality-query-pilot.mts";

loadRuntimeEnv();
const gateway = await startDiscordInteractionGateway(process.env, { log: (message) => process.stderr.write(`${message}\n`) });
const recordedAt = new Date().toISOString();
const body = { type: "TTIDiscordInteractionGatewayReady", version: 1, status: "ready", recordedAt, applicationId: gateway.applicationId, guildId: gateway.guildId, deliveryMode: "discord-interaction-create-gateway-event-with-http-callback", intents: 0, publicIngressRequired: false, interactionTokensRecorded: false };
const record = Object.freeze({ ...body, id: semanticId(body) });
try {
  await localityPilotSettlementWitness(process.env).record({ category: "tti-discord-interaction-gateway-ready-v1", recordedAt, record, assertions: [{ subject: "urn:ame:turntide-islands", predicate: "urn:emsenn:discord:interaction-gateway-ready", object: { kind: "iri", value: record.id } }] });
  process.stderr.write(`[discord interactions] readiness receipt ${record.id}\n`);
} catch (error) {
  // The receipt witnesses availability; it is not authority for receiving
  // Discord events. Commands that require a settlement store still fail
  // closed in their own handlers while membership/login commands stay live.
  process.stderr.write(`[discord interactions] readiness receipt unavailable: ${error instanceof Error ? error.message : String(error)}\n`);
}
let stop!: () => void;
const stopped = new Promise<void>((resolve) => { stop = resolve; });
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => { gateway.close(); stop(); });
await stopped;
