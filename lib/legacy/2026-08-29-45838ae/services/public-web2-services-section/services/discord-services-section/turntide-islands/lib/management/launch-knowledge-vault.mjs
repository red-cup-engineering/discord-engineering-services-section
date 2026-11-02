#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EMPTY_WITNESS_ROOT, identifyJsonSemanticContent } from "@red-cup-engineering/semantic-content-identify-service";
const semanticId = (value) => identifyJsonSemanticContent({ objectKind: "turntide-islands.record", value, witnessRoot: EMPTY_WITNESS_ROOT }).token;
import { recordWitnessJournalBatch } from "@red-cup-engineering/witness-journal-document-service";
import { turntideWitnessJournalBindingFromEnvironment } from "./settlement-witness-journal-binding.mjs";

const TTI_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_PRODUCT = join(TTI_ROOT, "content/products/founding-knowledge-vault.json");
const TTI_ACCOUNT = "eip155:31337:0xcfe1b9960ddbbe2b95e48114c281d7f24eb87b4d";
const TTI_ACTOR = "urn:ame:turntide-islands";
const API = "https://discord.com/api/v10";
const VIEW = 1n << 10n; const SEND = 1n << 11n; const HISTORY = 1n << 16n;
const MEMBER_ALLOW = (VIEW | SEND | HISTORY).toString();

export function ventureLaunchAdmission(product) {
  const missing = [];
  if (product?.status !== "customer-discovery-no-charge") missing.push("honest-customer-discovery-status");
  if (!Array.isArray(product?.problemEvidence) || product.problemEvidence.length < 2) missing.push("observed-customer-problem");
  if (!Number.isSafeInteger(product?.offer?.candidateUnitAmount) || product.offer.candidateUnitAmount <= 0) missing.push("priced-hypothesis");
  if (!product?.offer?.promise || !Array.isArray(product.offer.included) || product.offer.included.length < 2) missing.push("bounded-customer-promise");
  if (!product?.roles?.paidEntitlement || !product?.roles?.grandfathered || product.roles.paidEntitlement === product.roles.grandfathered) missing.push("payment-distinct-entitlement");
  if (!product?.territory?.publicChannel || !Array.isArray(product?.territory?.memberChannels)) missing.push("conversion-and-fulfillment-territory");
  if (!product?.measurement?.customerSignal || !product?.measurement?.conversion || !product?.measurement?.economics) missing.push("venture-measurement-loop");
  if (product?.commercial?.paymentStatus !== "blocked-not-live" || !Array.isArray(product?.commercial?.activationBlockers) || product.commercial.activationBlockers.length < 1) missing.push("payment-blocker-disclosure");
  return missing.length ? { type: "TTIVentureLaunchRefusal", reason: "venture-product-incomplete", missing }
    : { type: "TTIVentureLaunchAdmission", productId: product.id, status: product.status };
}

export function vaultPermissionOverwrites({ guildId, islanderRoleId, subscriberRoleId, botUserId, adminUserId }) {
  return [
    { id: guildId, type: 0, allow: "0", deny: VIEW.toString() },
    { id: islanderRoleId, type: 0, allow: MEMBER_ALLOW, deny: "0" },
    { id: subscriberRoleId, type: 0, allow: MEMBER_ALLOW, deny: "0" },
    { id: botUserId, type: 1, allow: MEMBER_ALLOW, deny: "0" },
    { id: adminUserId, type: 1, allow: MEMBER_ALLOW, deny: "0" },
  ];
}

export function foundingOfferMessage(product) {
  const dollars = (product.offer.candidateUnitAmount / 100).toFixed(0);
  return [
    `**${product.name}**`,
    "",
    product.offer.promise,
    "",
    `**Founding price under test:** $${dollars}/month. **No charge is being taken yet.** Checkout stays closed until the payment provider, public webhook, exact terms, and TTI entitlement ledger are live and verified.`,
    "",
    "Founding islanders keep their current access. The historical `islander` role is not proof of payment; future settled memberships will receive a separate `vault subscriber` entitlement.",
    "",
    "What the founding membership is meant to fund:",
    ...product.offer.included.map((item) => `- ${item}`),
    "",
    "React below so I can build from actual demand:",
    ...Object.entries(product.conversion.signals).map(([emoji, signal]) => `${emoji} — ${signal.replaceAll("-", " ")}`),
    "",
    `Offer marker: ${product.conversion.offerMarker}`,
  ].join("\n");
}

export function foundingChannelMessages(product) {
  return {
    "vault-briefings": `**Founding briefing 0 — why this vault exists**\n\nDiscord is good at living conversation and bad at keeping hard-won context findable. TTI's vault product exists to rescue useful methods, claims, source trails, and reading paths into durable material without pretending every conversation should become public documentation. Weekly briefings will state their sources, access boundary, uncertainty, and what changed.\n\nMarker: ${product.conversion.offerMarker}:briefing-0`,
    "archive-desk": `**Vault request desk**\n\nAsk for something to be found, connected, summarized, or rescued from scrollback. Include what decision or work the answer should support, the acceptable access boundary, and any source you already remember. Requests are pooled work, not a guaranteed private consulting SLA.\n\nMarker: ${product.conversion.offerMarker}:request-desk`,
    "receipts": `**Commercial status**\n\nCandidate founding price: $${(product.offer.candidateUnitAmount / 100).toFixed(0)}/month. Charges taken: none. Settled external revenue receipts: 0. Live checkout: blocked. Known total product cost: unknown until each provider and Discord resource use is receipted. TTI will not call the vault profitable from memberships, roles, reactions, or unpaid Checkout sessions.\n\nMarker: ${product.conversion.offerMarker}:receipts-0`,
    "serious-threading": `**What should the vault preserve first?**\n\nName one discussion, research trail, practical method, or recurring question from this community that you would be annoyed to lose. This is the first editorial queue; member judgment decides what becomes durable.\n\nMarker: ${product.conversion.offerMarker}:editorial-queue-0`,
  };
}

function canonical(value) { if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`; if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`; return JSON.stringify(value); }
async function api(token, method, route, body) {
  const response = await fetch(`${API}${route}`, { method, headers: { authorization: `Bot ${token}`, "content-type": "application/json", "user-agent": "@red-cup-engineering/turntide-islands venture operator" }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (response.status === 429) { const retry = await response.json().catch(() => ({ retry_after: 1 })); await new Promise((done) => setTimeout(done, Math.ceil((retry.retry_after ?? 1) * 1000))); return api(token, method, route, body); }
  const text = await response.text(); if (!response.ok) throw new Error(`Discord ${method} ${route} -> ${response.status}: ${text.slice(0, 400)}`); return text ? JSON.parse(text) : null;
}
async function ensureMessage(token, channelId, marker, content) {
  const messages = await api(token, "GET", `/channels/${channelId}/messages?limit=50`);
  const existing = messages.find((message) => String(message.content ?? "").includes(marker));
  return existing ?? api(token, "POST", `/channels/${channelId}/messages`, { content, allowed_mentions: { parse: [] } });
}
async function addReaction(token, channelId, messageId, emoji) { await api(token, "PUT", `/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`); }

export async function launchKnowledgeVault(options = {}) {
  const product = options.product ?? JSON.parse(await readFile(options.productPath ?? DEFAULT_PRODUCT, "utf8")); const admission = ventureLaunchAdmission(product);
  if (admission.type.endsWith("Refusal")) return admission;
  if (options.live !== true) return { type: "TTIKnowledgeVaultLaunchPlan", admission, product, effects: [] };
  const token = options.token; const guildId = options.guildId; const adminUserId = options.adminUserId; const witnessJournalAgentUrl = options.witnessJournalAgentUrl;
  if (!token || !guildId || !adminUserId || !witnessJournalAgentUrl) throw new Error("live vault launch requires Discord token, guild, admin, and contracted witness-journal RDF provider");
  const [bot, observedChannels, observedRoles] = await Promise.all([api(token, "GET", "/users/@me"), api(token, "GET", `/guilds/${guildId}/channels`), api(token, "GET", `/guilds/${guildId}/roles`)]);
  const channels = [...observedChannels]; const roles = [...observedRoles]; const effects = [];
  let subscriberRole = roles.find((role) => role.name.toLowerCase() === product.roles.paidEntitlement.toLowerCase());
  if (!subscriberRole) { subscriberRole = await api(token, "POST", `/guilds/${guildId}/roles`, { name: product.roles.paidEntitlement, mentionable: false }); roles.push(subscriberRole); effects.push({ kind: "created-role", id: subscriberRole.id, name: subscriberRole.name }); }
  const islanderRole = roles.find((role) => role.name.toLowerCase() === product.roles.grandfathered.toLowerCase()); if (!islanderRole) throw new Error("historical islander role absent; preserving access requires manual reconciliation");
  const permission_overwrites = vaultPermissionOverwrites({ guildId, islanderRoleId: islanderRole.id, subscriberRoleId: subscriberRole.id, botUserId: bot.id, adminUserId });
  let category = channels.find((channel) => channel.type === 4 && channel.name.toLowerCase() === product.territory.category.toLowerCase());
  if (!category) { category = await api(token, "POST", `/guilds/${guildId}/channels`, { name: product.territory.category, type: 4, permission_overwrites }); channels.push(category); effects.push({ kind: "created-category", id: category.id, name: category.name }); }
  else if (canonical(category.permission_overwrites ?? []) !== canonical(permission_overwrites)) { category = await api(token, "PATCH", `/channels/${category.id}`, { permission_overwrites }); effects.push({ kind: "reconciled-category-permissions", id: category.id }); }
  const memberChannels = {};
  for (const name of product.territory.memberChannels) {
    const channel = channels.find((candidate) => candidate.type === 0 && candidate.name.toLowerCase() === name.toLowerCase()); if (!channel) throw new Error(`declared vault channel ${name} is absent`);
    const topic = name === "vault-briefings" ? "Weekly source-traceable knowledge-vault briefings and reading paths." : name === "archive-desk" ? "Member request desk and durable rescue queue for useful Discord knowledge." : name === "receipts" ? "Product provenance, commercial status, observed revenue, costs, and unknowns." : "Slower member discussion and editorial judgment that should not evaporate.";
    if (channel.parent_id !== category.id || channel.topic !== topic || (channel.permission_overwrites ?? []).length !== 0) { await api(token, "PATCH", `/channels/${channel.id}`, { parent_id: category.id, topic, permission_overwrites: [] }); effects.push({ kind: "moved-member-channel", id: channel.id, name }); }
    memberChannels[name] = channel.id;
  }
  const publicChannel = channels.find((channel) => channel.type === 0 && channel.name.toLowerCase() === product.territory.publicChannel.toLowerCase());
  const activeChannel = channels.find((channel) => channel.type === 0 && channel.name.toLowerCase() === product.territory.activeConversationChannel.toLowerCase());
  const harbor = channels.find((channel) => channel.type === 4 && channel.name.toLowerCase() === "harbor");
  if (!publicChannel || !activeChannel || !harbor) throw new Error("vault conversion surface cannot resolve start-here, mainland, and Harbor");
  const publicTopic = "Orientation and the founding knowledge-vault offer: current promise, candidate price, access, and honest payment status.";
  if (publicChannel.parent_id !== harbor.id || publicChannel.topic !== publicTopic) { await api(token, "PATCH", `/channels/${publicChannel.id}`, { parent_id: harbor.id, topic: publicTopic }); effects.push({ kind: "reconciled-public-conversion-channel", id: publicChannel.id }); }
  const offer = await ensureMessage(token, publicChannel.id, product.conversion.offerMarker, foundingOfferMessage(product));
  for (const emoji of Object.keys(product.conversion.signals)) await addReaction(token, publicChannel.id, offer.id, emoji);
  const seedMessages = {};
  for (const [name, content] of Object.entries(foundingChannelMessages(product))) seedMessages[name] = (await ensureMessage(token, memberChannels[name], `${product.conversion.offerMarker}:`, content)).id;
  const announcementMarker = `${product.conversion.offerMarker}:mainland`;
  const announcement = await ensureMessage(token, activeChannel.id, announcementMarker, `**TTI is opening the Founding Knowledge Vault.** This is the venture part, not another bot feed: weekly source-traceable briefings, a member retrieval desk, archive rescue, and transparent receipts. The price hypothesis is $${(product.offer.candidateUnitAmount / 100).toFixed(0)}/month, but no checkout is live and nobody is being charged. Existing islanders keep access. Please read and react in <#${publicChannel.id}> so I build from actual demand.\n\nMarker: ${announcementMarker}`);
  const recordedAt = options.recordedAt ?? new Date().toISOString();
  const receipt = { type: "TTIKnowledgeVaultLaunchReceipt", version: 1, status: "customer-discovery-live", recordedAt, venture: TTI_ACTOR, productId: product.id, candidatePrice: { currency: product.offer.currency, unitAmount: product.offer.candidateUnitAmount, billingPeriod: product.offer.billingPeriod }, paymentStatus: product.commercial.paymentStatus, externalRevenueReceiptCount: 0, guildId, subscriberRole: { id: subscriberRole.id, name: subscriberRole.name, memberCount: 0 }, grandfatheredRole: { id: islanderRole.id, name: islanderRole.name, paymentEvidence: false }, territory: { categoryId: category.id, publicChannelId: publicChannel.id, memberChannels }, messages: { offer: offer.id, mainlandAnnouncement: announcement.id, seeds: seedMessages }, conversionSignals: product.conversion.signals, effects, cost: { status: "unknown", reason: "Discord API does not report monetary cost" } };
  const graph = semanticId(receipt);
  const witnessJournal = options.witnessJournal ?? turntideWitnessJournalBindingFromEnvironment();
  await recordWitnessJournalBatch({ agentUrl: witnessJournalAgentUrl, ...(witnessJournal ?? {}), batch: { settlement: TTI_ACCOUNT, graph, recordedAt, document: receipt, assertions: [
    { subject: TTI_ACTOR, predicate: "urn:emsenn:venture:launched-customer-discovery-product", object: { kind: "iri", value: graph } },
    { subject: graph, predicate: "urn:emsenn:venture:discord-offer-message", object: { kind: "literal", value: offer.id } },
  ] } });
  return { ...receipt, receiptId: graph };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await launchKnowledgeVault({ live: process.argv.includes("--live"), token: process.env.DISCORD_BOT_TOKEN ?? process.env.DISCORD_TOKEN, guildId: process.env.DISCORD_GUILD_ID, adminUserId: process.env.DISCORD_ADMIN_USER_ID, witnessJournalAgentUrl: process.env.WITNESS_JOURNAL_RDF_AGENT });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); if (result.type.endsWith("Refusal")) process.exitCode = 2;
}
