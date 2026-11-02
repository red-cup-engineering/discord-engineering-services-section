#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EMPTY_WITNESS_ROOT, identifyJsonSemanticContent } from "@red-cup-engineering/semantic-content-identify-service";
const semanticId = (value) => identifyJsonSemanticContent({ objectKind: "turntide-islands.record", value, witnessRoot: EMPTY_WITNESS_ROOT }).token;
import { recordWitnessJournalBatch } from "@red-cup-engineering/witness-journal-document-service";
import { turntideWitnessJournalBindingFromEnvironment } from "./settlement-witness-journal-binding.mjs";

const TTI_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const PRODUCT_PATH = join(TTI_ROOT, "content/products/locality-knowledge-answer.json");
const TTI_ACCOUNT = "eip155:31337:0xcfe1b9960ddbbe2b95e48114c281d7f24eb87b4d";
const TTI_ACTOR = "urn:ame:turntide-islands";
const API = "https://discord.com/api/v10";

export function localityDiscoveryAdmission(product) {
  const missing = [];
  if (product?.status !== "customer-discovery-free-chat-vault-power-user-funnel-live-sale-blocked") missing.push("honest-free-chat-vault-power-user-funnel-status");
  if (product?.offer?.price?.currency !== "USD" || product.offer.price.unitAmountMicros !== 10_000_000 || product.offer.price.status !== "retired-from-current-discovery-after-human-feedback") missing.push("retired-ten-dollar-hypothesis-preserved-as-history");
  if (!product?.acquisitionFunnel?.entry || !product?.acquisitionFunnel?.retention || !product?.acquisitionFunnel?.powerUser) missing.push("free-chat-vault-metered-funnel");
  if (!product?.offer?.promise || product.offer.included?.length < 3 || product.offer.excluded?.length < 3) missing.push("bounded-product-promise");
  if (product?.territory?.discoveryChannel !== "mainland" || !product.territory.offerMarker) missing.push("bounded-discovery-territory");
  if (Object.keys(product?.conversion?.signals ?? {}).sort().join("|") !== ["🆓", "📚", "🔌", "🧪"].sort().join("|")) missing.push("exact-funnel-signal-set");
  if (product?.commercial?.externalRevenueReceiptCount !== 0 || product?.commercial?.recognizedRevenueMicros !== 0 || product?.commercial?.recognizedProfitMicros !== null) missing.push("honest-zero-revenue-and-unknown-profit");
  return missing.length > 0 ? { type: "TTILocalityDiscoveryRefusal", reason: "locality-discovery-product-incomplete", missing } : { type: "TTILocalityDiscoveryAdmission", productId: product.id, status: "no-charge-customer-discovery-only" };
}

export function localityDiscoveryMessage(product) {
  return [
    `**${product.name} — buyer discovery**`,
    "",
    "TTI is testing whether Union offices and communities need source-traceable answers drawn from experience that contributors deliberately license for resale—such as what people have learned about gardening in a particular town.",
    "",
    product.offer.promise,
    "",
    "**The USD 10 one-answer guess is retired from this discovery test.** TTI is testing a better funnel: bounded source-traceable answers free in Discord when inventory and capacity permit; persistent browsing through the Knowledge Vault; and cost-grounded metered MCP or A2A access for power users. None of those paid surfaces is active.",
    "",
    "React only to tell TTI which customer-discovery statement fits:",
    ...Object.entries(product.conversion.signals).map(([emoji, signal]) => `${emoji} — ${signal.replaceAll("-", " ")}`),
    "",
    "A reaction is interest only—not terms acceptance, a purchase, a contribution, a license, payment, entitlement, revenue, or permission to store or resell message content.",
    "",
    "To deliberately submit a no-charge bounded buyer-query pilot, invoke `/locality-pilot` and choose `chat`, `vault`, `mcp`, or `a2a` as delivery interest. Its required consent field must exactly be `AGREE-PERMANENT-NONPERSONAL-QUERY`. This permanently stores only the non-personal query fields and preference you deliberately submit as product-research evidence; it does not import other Discord content or grant a contribution license, resale permission, purchase, payment, price, or answer promise. TTI currently has no admitted live resale inventory.",
    "",
    "Conversion marker: TTI-LOCALITY-PILOT-2026-01",
    "",
    `Marker: ${product.territory.offerMarker}`,
  ].join("\n");
}

export function localityDiscoverySnapshot({ product, offerMessageId, usersBySignal, queryPilotAdmissions = [], recordedAt }) {
  const actors = new Set(), signalCounts = {};
  for (const [emoji, signal] of Object.entries(product.conversion.signals)) {
    const ids = [...new Set(usersBySignal[emoji] ?? [])];
    signalCounts[signal] = ids.length;
    for (const id of ids) actors.add(id);
  }
  const pilotAdmissions = queryPilotAdmissions.filter((row) => row?.type === "TTIDiscordLocalityQueryPilotAdmission" && row?.status === "admitted" && row?.productId === product.id && row?.experimentId === product.nextExperiment.id && row?.measurement?.buyerQueryAdmitted === true && row?.privacy?.discordIdentifiersRecorded === false && row?.privacy?.messageContentImported === false && row?.revenueRecognized === false);
  const uniquePilotSubmissions = new Map(pilotAdmissions.map((row) => [row.submissionPseudonym, row]));
  const distinctPilotActors = new Set([...uniquePilotSubmissions.values()].map((row) => row.actorPseudonym)).size;
  const freeChatPilotActors = new Set([...uniquePilotSubmissions.values()].filter((row) => row?.measurement?.freeChatAnswerInterest === true).map((row) => row.actorPseudonym)).size;
  const vaultPilotActors = new Set([...uniquePilotSubmissions.values()].filter((row) => row?.measurement?.persistentVaultInterest === true).map((row) => row.actorPseudonym)).size;
  const meteredPilotActors = new Set([...uniquePilotSubmissions.values()].filter((row) => row?.measurement?.meteredPowerUserInterest === true).map((row) => row.actorPseudonym)).size;
  const body = {
    type: "TTILocalityKnowledgeDiscoverySnapshot", version: 1, recordedAt, venture: TTI_ACTOR, productId: product.id, offerMessageId,
    signalCounts, distinctQualifiedInterestActors: actors.size,
    noChargeQueryPilotActors: Math.max(signalCounts[product.conversion.signals["🧪"]] ?? 0, distinctPilotActors),
    freeChatAnswerInterestActors: Math.max(signalCounts[product.conversion.signals["🆓"]] ?? 0, freeChatPilotActors),
    persistentVaultInterestActors: Math.max(signalCounts[product.conversion.signals["📚"]] ?? 0, vaultPilotActors),
    meteredPowerUserInterestActors: Math.max(signalCounts[product.conversion.signals["🔌"]] ?? 0, meteredPilotActors),
    admittedDiscordQueryPilotActors: distinctPilotActors,
    identityProjection: "aggregate-only-no-discord-user-identifiers",
    buyerQueriesAdmitted: uniquePilotSubmissions.size, offersAccepted: 0, externalRevenueReceiptCount: 0, recognizedRevenueMicros: 0, profitMicros: null,
    inference: uniquePilotSubmissions.size > 0 ? "explicit-no-charge-buyer-query-observed-no-offer-sale-or-revenue" : actors.size === 0 ? "no-qualified-interest-observed-yet" : "qualified-discovery-interest-observed-not-buyer-demand-or-revenue",
  };
  return { ...body, id: semanticId(body) };
}

export async function launchLocalityKnowledgeDiscovery(options = {}) {
  const product = options.product ?? JSON.parse(await readFile(options.productPath ?? PRODUCT_PATH, "utf8"));
  const admission = localityDiscoveryAdmission(product), content = localityDiscoveryMessage(product);
  if (admission.type.endsWith("Refusal")) return admission;
  if (options.live !== true) return { type: "TTILocalityKnowledgeDiscoveryLaunchPlan", admission, channel: product.territory.discoveryChannel, marker: product.territory.offerMarker, content, reactions: Object.keys(product.conversion.signals), externalEffects: [] };
  if (!options.token || !options.guildId || !options.witnessJournalAgentUrl) throw new Error("live locality discovery requires Discord token, guild, and contracted witness-journal RDF provider");
  const recordedAt = options.recordedAt ?? new Date().toISOString();
  const intent = { type: "TTILocalityKnowledgeDiscoveryLaunchIntent", version: 1, status: "authorized-pending-discord-publication", recordedAt, venture: TTI_ACTOR, productId: product.id, channelName: product.territory.discoveryChannel, marker: product.territory.offerMarker, reactions: Object.keys(product.conversion.signals), noCharge: true, buyerQueryAccepted: false, contributionAccepted: false, externalRevenueReceiptCount: 0, profitMicros: null };
  const intentReceiptId = await witness(options, intent, recordedAt, "urn:emsenn:venture:authorized-locality-discovery-launch");
  const channels = await api(options.token, "GET", `/guilds/${options.guildId}/channels`);
  const channel = channels.find((row) => row.type === 0 && row.name.toLowerCase() === product.territory.discoveryChannel.toLowerCase());
  if (!channel) return { type: "TTILocalityDiscoveryRefusal", reason: "declared-discovery-channel-absent", intentReceiptId };
  const messages = await api(options.token, "GET", `/channels/${channel.id}/messages?limit=50`);
  let message = messages.find((row) => String(row.content ?? "").includes(product.territory.offerMarker));
  let messageReconciled = false;
  if (!message) message = await api(options.token, "POST", `/channels/${channel.id}/messages`, { content, allowed_mentions: { parse: [] } });
  else if (message.content !== content) { message = await api(options.token, "PATCH", `/channels/${channel.id}/messages/${message.id}`, { content, allowed_mentions: { parse: [] } }); messageReconciled = true; }
  for (const emoji of Object.keys(product.conversion.signals)) await api(options.token, "PUT", `/channels/${channel.id}/messages/${message.id}/reactions/${encodeURIComponent(emoji)}/@me`);
  const receipt = { type: "TTILocalityKnowledgeDiscoveryLaunchReceipt", version: 1, status: "customer-discovery-live", recordedAt, venture: TTI_ACTOR, productId: product.id, guildId: options.guildId, channelId: channel.id, messageId: message.id, marker: product.territory.offerMarker, reactions: Object.keys(product.conversion.signals), intentReceiptId, messageReconciled, noCharge: true, buyerQueryAccepted: false, buyerQueryPilotAcceptedThrough: "explicit-locality-pilot-application-command-only", contributionAccepted: false, saleFormed: false, externalRevenueReceiptCount: 0, recognizedRevenueMicros: 0, profitMicros: null };
  const receiptId = await witness(options, receipt, recordedAt, "urn:emsenn:venture:launched-locality-discovery");
  return { ...receipt, receiptId };
}

async function witness(options, record, recordedAt, predicate) {
  const graph = semanticId(record);
  const witnessJournal = options.witnessJournal ?? turntideWitnessJournalBindingFromEnvironment();
  await recordWitnessJournalBatch({ agentUrl: options.witnessJournalAgentUrl, ...(witnessJournal ?? {}), batch: { settlement: TTI_ACCOUNT, graph, recordedAt, document: record, assertions: [{ subject: TTI_ACTOR, predicate, object: { kind: "iri", value: graph } }] } });
  return graph;
}
async function api(token, method, route, body) {
  const response = await fetch(`${API}${route}`, { method, headers: { authorization: `Bot ${token}`, "content-type": "application/json", "user-agent": "@red-cup-engineering/turntide-islands locality discovery" }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (response.status === 429) { const retry = await response.json().catch(() => ({ retry_after: 1 })); await new Promise((done) => setTimeout(done, Math.ceil((retry.retry_after ?? 1) * 1000))); return api(token, method, route, body); }
  const text = await response.text(); if (!response.ok) throw new Error(`Discord ${method} ${route} -> ${response.status}: ${text.slice(0, 400)}`); return text ? JSON.parse(text) : null;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await launchLocalityKnowledgeDiscovery({ live: process.argv.includes("--live"), token: process.env.DISCORD_BOT_TOKEN ?? process.env.DISCORD_TOKEN, guildId: process.env.DISCORD_GUILD_ID, witnessJournalAgentUrl: process.env.WITNESS_JOURNAL_RDF_AGENT });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); if (result.type.endsWith("Refusal")) process.exitCode = 2;
}
