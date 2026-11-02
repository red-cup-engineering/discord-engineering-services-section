#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EMPTY_WITNESS_ROOT, identifyJsonSemanticContent } from "@red-cup-engineering/semantic-content-identify-service";
const semanticId = (value) => identifyJsonSemanticContent({ objectKind: "turntide-islands.record", value, witnessRoot: EMPTY_WITNESS_ROOT }).token;
import { recordWitnessJournalBatch } from "@red-cup-engineering/witness-journal-document-service";
import { turntideWitnessJournalBindingFromEnvironment } from "./settlement-witness-journal-binding.mjs";

const TTI_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const TTI_ACCOUNT = "eip155:31337:0xcfe1b9960ddbbe2b95e48114c281d7f24eb87b4d";
const TTI_ACTOR = "urn:ame:turntide-islands";
const PRODUCT = "tti-union-media-syndication-2026-01";
const MARKER = "UNION-MEDIA-INFRASTRUCTURE-OFFER";
export const UNION_MEDIA_PROVIDER_LOTS = Object.freeze([
  "custody-clean-activitypub-carrier",
  "tti-signed-agent-card-and-public-jwks",
  "tti-public-https-activitypub-host",
]);

export function unionMediaProviderFunnelSnapshot(records, recordedAt = new Date().toISOString()) {
  if (!Number.isFinite(Date.parse(recordedAt))) throw new TypeError("provider-funnel snapshot requires an exact recordedAt instant");
  const valid = records.filter(validMarkerProjection);
  const byMessage = new Map();
  for (const item of valid) {
    const prior = byMessage.get(item.source.messageId);
    if (prior === undefined || item.observedAt > prior.observedAt || (item.observedAt === prior.observedAt && item.id > prior.id)) byMessage.set(item.source.messageId, item);
  }
  const current = [...byMessage.values()];
  const qualified = current.filter((item) => item.unionMediaProviderLead.status === "qualified-declared-provider-lead");
  const representatives = new Set(qualified.map((item) => item.source.authorId));
  const enterprises = new Set(qualified.map((item) => item.unionMediaProviderLead.declaredEnterprise));
  const qualifiedLeadCountByLot = Object.fromEntries(UNION_MEDIA_PROVIDER_LOTS.map((lot) => [lot, qualified.filter((item) => item.unionMediaProviderLead.offeredLotIds.includes(lot)).length]));
  const allLotsHaveAtLeastOneQualifiedDeclaredLead = UNION_MEDIA_PROVIDER_LOTS.every((lot) => qualifiedLeadCountByLot[lot] > 0);
  const body = {
    type: "TTIUnionMediaProviderLeadFunnelSnapshot",
    version: 1,
    recordedAt,
    venture: TTI_ACTOR,
    productId: PRODUCT,
    marker: MARKER,
    workItemRecordsSeen: records.length,
    validMarkerProjectionCount: valid.length,
    supersededMarkerProjectionCount: valid.length - current.length,
    currentMarkerMentions: current.length,
    qualifiedDeclaredProviderLeads: qualified.length,
    unqualifiedMarkerMentions: current.length - qualified.length,
    distinctDiscordRepresentatives: representatives.size,
    distinctDeclaredEnterprises: enterprises.size,
    qualifiedLeadCountByLot,
    allLotsHaveAtLeastOneQualifiedDeclaredLead,
    providerAuthenticationAdmissions: 0,
    providerContractOffersObserved: 0,
    providerCompositionsAccepted: 0,
    conversion: { markerMentionToQualifiedDeclaredLead: current.length === 0 ? null : qualified.length / current.length },
    economics: { spendAuthorized: false, acquiredAgentResourceUnits: 0, externalRevenueReceiptCount: 0, recognizedRevenueMicros: 0, recognizedProfitMicros: null },
    inference: qualified.length === 0 ? "no-qualified-provider-lead-observed-yet" : allLotsHaveAtLeastOneQualifiedDeclaredLead ? "declared-provider-coverage-observed-authentication-and-contracting-open" : "partial-declared-provider-coverage-observed-more-lot-supply-needed",
    privacy: { aggregateOnly: true, discordIdentifiersIncluded: false, rawMessageContentIncluded: false, agentCardFetchedDuringObservation: false },
  };
  return Object.freeze({ ...body, id: semanticId(body) });
}

export async function observeUnionMediaProviderFunnel(options = {}) {
  if (!options.witnessJournalAgentUrl) throw new Error("Union Media provider-funnel observation requires the contracted witness-journal RDF provider");
  const recordedAt = options.recordedAt ?? new Date().toISOString();
  const dataRoot = options.dataRoot ?? join(TTI_ROOT, "data");
  const rosterPath = options.rosterPath ?? join(dataRoot, "agency", "zelo-work-roster.jsonl");
  const records = options.records ?? await readJsonLines(rosterPath);
  const snapshot = unionMediaProviderFunnelSnapshot(records, recordedAt);
  const graph = semanticId(snapshot);
  const witnessJournal = options.witnessJournal ?? turntideWitnessJournalBindingFromEnvironment();
  await recordWitnessJournalBatch({ agentUrl: options.witnessJournalAgentUrl, ...(witnessJournal ?? {}), batch: { settlement: TTI_ACCOUNT, graph, recordedAt, document: snapshot, assertions: [
    { subject: TTI_ACTOR, predicate: "urn:emsenn:venture:union-media-provider-lead-funnel-snapshot", object: { kind: "iri", value: graph } },
    { subject: graph, predicate: "urn:emsenn:venture:qualified-declared-provider-leads", object: { kind: "literal", value: String(snapshot.qualifiedDeclaredProviderLeads), datatype: "http://www.w3.org/2001/XMLSchema#integer" } },
  ] } });
  return { ...snapshot, receiptId: graph };
}

async function readJsonLines(file) {
  try {
    return (await readFile(file, "utf8")).split("\n").filter((line) => line.trim() !== "").map((line) => JSON.parse(line));
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

function validMarkerProjection(item) {
  if (!selfAddressed(item) || item?.type !== "TTIZeloWorkItem" || item?.version !== 2 || item?.classification !== "service-provider-offer" || item?.serviceProviderEffect !== "nonbinding-provider-lead-only-no-contract-authority-custody-grant-or-acceptance") return false;
  if (!item.source || !bounded(item.source.messageId, 1, 100) || !bounded(item.source.authorId, 1, 100) || !Number.isFinite(Date.parse(item.observedAt)) || !/^sha256:[a-f0-9]{64}$/u.test(item.contentDigest ?? "") || item.discordMessageContentImported !== false) return false;
  const lead = item.unionMediaProviderLead;
  if (!lead || lead.type !== "TTIUnionMediaDeclaredProviderLead" || lead.version !== 1 || lead.marker !== MARKER || lead.declaredEnterpriseAuthenticated !== false || lead.agentCardFetched !== false || lead.providerContractOfferObserved !== false || !Array.isArray(lead.qualificationReasons) || !Array.isArray(lead.offeredLotIds)) return false;
  if (lead.status === "unqualified-marker-mention") return lead.declaredEnterprise === undefined && lead.agentCardUrl === undefined && lead.offeredLotIds.length === 0 && lead.qualificationReasons.length > 0;
  if (lead.status !== "qualified-declared-provider-lead" || lead.qualificationReasons.length !== 0 || !/^urn:ame:[a-z0-9][a-z0-9._:-]{0,127}$/u.test(lead.declaredEnterprise ?? "") || !validAgentCardUrl(lead.agentCardUrl)) return false;
  const canonical = UNION_MEDIA_PROVIDER_LOTS.filter((lot) => lead.offeredLotIds.includes(lot));
  return lead.offeredLotIds.length > 0 && new Set(lead.offeredLotIds).size === lead.offeredLotIds.length && JSON.stringify(lead.offeredLotIds) === JSON.stringify(canonical);
}

function validAgentCardUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.username === "" && url.password === "" && url.port === "" && url.search === "" && url.hash === "" && url.pathname === "/.well-known/agent-card.json" && url.hostname.includes(".") && value === url.href && value.length <= 240;
  } catch { return false; }
}
function bounded(value, minimum, maximum) { return typeof value === "string" && value.length >= minimum && value.length <= maximum; }
function selfAddressed(value) { try { const { id, ...body } = value ?? {}; return typeof id === "string" && id === semanticId(body); } catch { return false; } }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await observeUnionMediaProviderFunnel({ witnessJournalAgentUrl: process.env.WITNESS_JOURNAL_RDF_AGENT });
  process.stdout.write(`${JSON.stringify({ type: result.type, recordedAt: result.recordedAt, currentMarkerMentions: result.currentMarkerMentions, qualifiedDeclaredProviderLeads: result.qualifiedDeclaredProviderLeads, distinctDeclaredEnterprises: result.distinctDeclaredEnterprises, qualifiedLeadCountByLot: result.qualifiedLeadCountByLot, providerAuthenticationAdmissions: result.providerAuthenticationAdmissions, providerContractOffersObserved: result.providerContractOffersObserved, providerCompositionsAccepted: result.providerCompositionsAccepted, conversion: result.conversion, economics: result.economics, inference: result.inference, receiptId: result.receiptId })}\n`);
}
