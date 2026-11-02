#!/usr/bin/env node

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EMPTY_WITNESS_ROOT, identifyJsonSemanticContent } from "@red-cup-engineering/semantic-content-identify-service";
const semanticId = (value) => identifyJsonSemanticContent({ objectKind: "turntide-islands.record", value, witnessRoot: EMPTY_WITNESS_ROOT }).token;
// Intent, destination-proof, enterprise-authentication, and placement-request admissions are minted only by the
// Discord platform app (src/apps/turntide-islands-discord-platform), which self-addresses every record it creates
// under the "turntide-islands.discord-platform-record" object kind, not this module's own "turntide-islands.record".
// This observer only ever consumes those records (it never mints any of the four types itself), so their
// self-addressing must be checked under the producer's object kind.
const discordPlatformSemanticId = (value) => identifyJsonSemanticContent({ objectKind: "turntide-islands.discord-platform-record", value, witnessRoot: EMPTY_WITNESS_ROOT }).token;
import { querySettlementRecords, recordWitnessJournalBatch } from "@red-cup-engineering/witness-journal-document-service";
import { turntideWitnessJournalBindingFromEnvironment } from "./settlement-witness-journal-binding.mjs";

const TTI_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const TTI_ACCOUNT = "eip155:31337:0xcfe1b9960ddbbe2b95e48114c281d7f24eb87b4d";
const TTI_ACTOR = "urn:ame:turntide-islands";
const PRODUCT = "tti-union-media-syndication-2026-01";
const EXPERIMENT = "EXP-UNION-MEDIA-001";
const CONTRACT = "ni:///sha-256;ZHOZcQ2d6ehuLPMTQp5pXOFSQtflUSybLqF6CUSvyts";
const INTENT_CATEGORY = "tti-union-media-representative-intent-v1";
const PROOF_CATEGORY = "tti-union-media-destination-control-proof-v1";
const AUTH_CATEGORY = "tti-union-media-enterprise-authentication-v1";
const PLACEMENT_REQUEST_CATEGORY = "tti-union-media-placement-request-admission-v1";
const AUTH_CONTRACT = "ni:///sha-256;xX10couZ9FmdpLcQFvlvxBFdZemz55UJ_-h_sxQR0Ss";
const SYNDICATION_CONTRACT = "ni:///sha-256;_3Vr73uJvicSjls4LCZoNspuAKpUl2RFKC0auMcGfS4";
const PLACEMENT_INGRESS_CONTRACT = "ni:///sha-256;lA86YpfReCyssDxcPqC0ooB-OscHHYoPe13BWmHB8jQ";

export function unionMediaAdvertiserDiscoverySnapshot(input = {}) {
  const intents = (input.intentAdmissions ?? []).filter(validIntent);
  const intentsById = new Map(intents.map((row) => [row.id, row]));
  const proofs = (input.destinationProofAdmissions ?? []).filter((row) => validProof(row, intentsById));
  const proofsById = new Map(proofs.map((row) => [row.id, row]));
  const authentications = (input.enterpriseAuthenticationAdmissions ?? []).filter((row) => validAuthentication(row, proofsById));
  const authenticationsById = new Map(authentications.map((row) => [row.id, row]));
  const validPlacementRequests = (input.placementRequestAdmissions ?? []).filter((row) => validPlacementRequest(row, authenticationsById));
  const placementUses = new Map(); for (const row of validPlacementRequests) placementUses.set(row.authenticationId, (placementUses.get(row.authenticationId) ?? 0) + 1);
  const placementRequestAuthenticationConflictCount = [...placementUses.values()].filter((count) => count > 1).length;
  const placementRequests = validPlacementRequests.filter((row) => placementUses.get(row.authenticationId) === 1);
  const representativeActors = new Set(intents.map((row) => row.representativePseudonym));
  const declaredEnterprises = new Set(intents.map((row) => row.declaration.enterprise));
  const controlledActors = new Set(proofs.map((row) => row.representativePseudonym));
  const controlledEnterprises = new Set(proofs.map((row) => row.declaration.enterprise));
  const authenticatedActors = new Set(authentications.map((row) => row.representativePseudonym));
  const authenticatedEnterprises = new Set(authentications.map((row) => row.enterprise));
  const requestingEnterprises = new Set(placementRequests.map((row) => row.advertiser));
  const resourceClassMix = {};
  for (const row of intents) resourceClassMix[row.declaration.resourceClass] = (resourceClassMix[row.declaration.resourceClass] ?? 0) + 1;
  const body = {
    type: "TTIUnionMediaAdvertiserDiscoverySnapshot", version: 1, recordedAt: input.recordedAt ?? new Date().toISOString(), productId: PRODUCT, experimentId: EXPERIMENT, contract: CONTRACT,
    representativeIntentAdmissions: intents.length, distinctRepresentativeActors: representativeActors.size, distinctDeclaredEnterprises: declaredEnterprises.size,
    destinationControlProofAdmissions: proofs.length, distinctDestinationControlledActors: controlledActors.size, distinctDestinationControlledDeclaredEnterprises: controlledEnterprises.size,
    enterpriseAuthenticationAdmissions: authentications.length, distinctAuthenticatedRepresentativeActors: authenticatedActors.size, authenticatedEnterpriseCount: authenticatedEnterprises.size,
    placementRequestAdmissions: placementRequests.length, placementRequestEnterpriseCount: requestingEnterprises.size, placementRequestAuthenticationConflictCount, editorialAdmissions: 0, authenticatedBidderCount: 0,
    conversion: { representativeToDestinationControl: representativeActors.size === 0 ? null : controlledActors.size / representativeActors.size, destinationControlToAuthenticatedEnterprise: controlledActors.size === 0 ? null : authenticatedActors.size / controlledActors.size, authenticatedEnterpriseToPlacementRequest: authenticatedEnterprises.size === 0 ? null : requestingEnterprises.size / authenticatedEnterprises.size },
    resourceClassMix,
    economics: { acquiredAgentResourceUnits: 0, externalRevenueReceiptCount: 0, recognizedRevenueMicros: 0, recognizedProfitMicros: null },
    inference: requestingEnterprises.size > 0 ? "placement-request-demand-observed-editorial-review-open" : authenticatedEnterprises.size > 0 ? "authenticated-enterprise-demand-observed-placement-request-ingress-open" : controlledActors.size > 0 ? "destination-controlled-leads-observed-enterprise-authentication-open" : representativeActors.size > 0 ? "representative-intent-observed-destination-control-open" : "no-advertiser-demand-observed-yet",
    privacy: { aggregateOnly: true, discordIdentifiersIncluded: false, challengeValuesIncluded: false, destinationsIncluded: false },
  };
  return Object.freeze({ ...body, id: semanticId(body) });
}

export async function observeUnionMediaAdvertiserDiscovery(options = {}) {
  if (!options.witnessJournalAgentUrl) throw new Error("Union Media advertiser discovery observation requires the contracted witness-journal RDF provider");
  const dataRoot = options.dataRoot ?? join(TTI_ROOT, "data"), recordedAt = options.recordedAt ?? new Date().toISOString();
  const witnessJournal = options.witnessJournal ?? turntideWitnessJournalBindingFromEnvironment();
  const snapshot = unionMediaAdvertiserDiscoverySnapshot({
    intentAdmissions: options.intentAdmissions ?? (await querySettlementRecords(INTENT_CATEGORY, { ...(witnessJournal ?? {}) })),
    destinationProofAdmissions: options.destinationProofAdmissions ?? (await querySettlementRecords(PROOF_CATEGORY, { ...(witnessJournal ?? {}) })),
    enterpriseAuthenticationAdmissions: options.enterpriseAuthenticationAdmissions ?? (await querySettlementRecords(AUTH_CATEGORY, { ...(witnessJournal ?? {}) })),
    placementRequestAdmissions: options.placementRequestAdmissions ?? (await querySettlementRecords(PLACEMENT_REQUEST_CATEGORY, { ...(witnessJournal ?? {}) })),
    recordedAt,
  });
  const graph = semanticId(snapshot);
  await recordWitnessJournalBatch({ agentUrl: options.witnessJournalAgentUrl, ...(witnessJournal ?? {}), batch: { settlement: TTI_ACCOUNT, graph, recordedAt, document: snapshot, assertions: [
    { subject: TTI_ACTOR, predicate: "urn:emsenn:venture:union-media-advertiser-discovery-snapshot", object: { kind: "iri", value: graph } },
    { subject: graph, predicate: "urn:emsenn:venture:destination-controlled-advertiser-leads", object: { kind: "literal", value: String(snapshot.distinctDestinationControlledActors), datatype: "http://www.w3.org/2001/XMLSchema#integer" } },
  ] } });
  return { ...snapshot, receiptId: graph };
}

function validIntent(row) { return selfAddressed(row) && row.type === "TTIUnionMediaRepresentativeIntentAdmission" && row.contract === CONTRACT && row.declaration?.enterpriseAuthenticated === false && row.measurement?.authenticatedBid === false; }
function validProof(row, intentsById) { const intent = intentsById.get(row?.intentId); return selfAddressed(row) && row.type === "TTIUnionMediaDestinationControlAdmission" && row.contract === CONTRACT && intent !== undefined && row.representativePseudonym === intent.representativePseudonym && row.declaration?.enterprise === intent.declaration.enterprise && row.declaration?.destinationControlled === true && row.declaration?.enterpriseAuthenticated === false && row.measurement?.qualifiedAdvertiserLead === true && row.measurement?.authenticatedBid === false; }
function validAuthentication(row, proofsById) { const proof = proofsById.get(row?.destinationProofId); return selfAddressed(row) && row.type === "TTIUnionMediaEnterpriseAuthenticationAdmission" && row.contract === AUTH_CONTRACT && proof !== undefined && row.intentId === proof.intentId && row.representativePseudonym === proof.representativePseudonym && row.enterprise === proof.declaration.enterprise && row.measurement?.authenticatedEnterpriseDemand === true && row.measurement?.authenticatedPlacementRequest === false && row.measurement?.authenticatedBid === false; }
function validPlacementRequest(row, authenticationsById) { const authentication = authenticationsById.get(row?.authenticationId); return selfAddressed(row) && row.type === "TTIUnionMediaPlacementRequestAdmission" && row.contract === SYNDICATION_CONTRACT && row.ingressContract === PLACEMENT_INGRESS_CONTRACT && authentication !== undefined && row.advertiser === authentication.enterprise && row.destinationProofId === authentication.destinationProofId && row.authenticationConsumedForOneRequest === true && row.creativeApproved === false && row.bidAdmitted === false && row.inventoryReserved === false && row.resourceTransferObserved === false && row.publicationAuthorized === false && row.cashRevenueRecognized === false && row.monetaryProfitRecognized === false; }
function selfAddressed(value) { try { if (!value || typeof value !== "object") return false; const { id, ...body } = value; return typeof id === "string" && id === discordPlatformSemanticId(body); } catch { return false; } }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await observeUnionMediaAdvertiserDiscovery({ witnessJournalAgentUrl: process.env.WITNESS_JOURNAL_RDF_AGENT });
  process.stdout.write(`${JSON.stringify({ type: result.type, recordedAt: result.recordedAt, representativeIntentAdmissions: result.representativeIntentAdmissions, distinctRepresentativeActors: result.distinctRepresentativeActors, distinctDeclaredEnterprises: result.distinctDeclaredEnterprises, destinationControlProofAdmissions: result.destinationControlProofAdmissions, distinctDestinationControlledActors: result.distinctDestinationControlledActors, enterpriseAuthenticationAdmissions: result.enterpriseAuthenticationAdmissions, authenticatedEnterpriseCount: result.authenticatedEnterpriseCount, placementRequestAdmissions: result.placementRequestAdmissions, placementRequestEnterpriseCount: result.placementRequestEnterpriseCount, conversion: result.conversion, resourceClassMix: result.resourceClassMix, economics: result.economics, inference: result.inference, receiptId: result.receiptId })}\n`);
}
