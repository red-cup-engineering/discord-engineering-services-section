import { EMPTY_WITNESS_ROOT, identifyJsonSemanticContent } from "@red-cup-engineering/semantic-content-identify-service";
const semanticId = (value) => identifyJsonSemanticContent({ objectKind: "turntide-islands.record", value, witnessRoot: EMPTY_WITNESS_ROOT }).token;
import { queryWitnessJournalDocumentsByCategory, recordWitnessJournalBatch } from "@red-cup-engineering/witness-journal-document-service";
import { turntideWitnessJournalBindingFromEnvironment } from "./settlement-witness-journal-binding.mjs";

const TTI_ACCOUNT = "eip155:31337:0xcfe1b9960ddbbe2b95e48114c281d7f24eb87b4d";
const TTI_ACTOR = "urn:ame:turntide-islands";

function recordValue(value) {
  return value?.type === "SettlementRecord" ? value.record : value;
}

export async function externalRevenueReceipts(dataRoot, publicationReceipt, witnessJournal = turntideWitnessJournalBindingFromEnvironment()) {
  return (await queryWitnessJournalDocumentsByCategory(dataRoot, { ...(witnessJournal ?? {}) })).map(({ value }) => recordValue(value)).filter((row) =>
    row?.type === "TTINewsExternalRevenueReceipt"
    && row.status === "settled"
    && row.edition === publicationReceipt.edition
    && row.publicationMessageId === publicationReceipt.messageId
    && typeof row.receiptDigest === "string"
    && typeof row.counterparty === "string"
    && Number.isSafeInteger(row.revenueMicros)
    && row.revenueMicros >= 0);
}

export function newsProductEconomicReading({ run, revenueReceipts = [], recordedAt }) {
  const publication = run?.publicationReceipt;
  if (run?.status !== "completed" || publication?.type !== "TTIDiscordPublicationReceipt" || publication.status !== "succeeded" || publication.atomicMultipart !== true) {
    return { type: "TTINewsProductEconomicRefusal", reason: "successful-atomic-rich-publication-receipt-absent" };
  }
  const graphicCost = run.graphic?.resourceReceipt?.monetaryCost;
  const graphicCostKnown = graphicCost?.status === "measured" && Number(graphicCost.value) === 0;
  const unpricedResourceUses = [
    { resource: "commissioned-news-service", status: run.commission?.commercialTerms?.price?.status ?? "unknown", reason: "provider price has no settlement receipt" },
    { resource: "notebooklm-source-and-audio", status: "unpriced", reason: "provider artifact has no attributable monetary settlement receipt" },
    { resource: "discord-publication", status: publication.cost?.status ?? "unknown", reason: publication.cost?.reason ?? "publication cost absent" },
  ].filter((item) => item.status !== "measured");
  const revenueMicros = revenueReceipts.reduce((sum, receipt) => sum + receipt.revenueMicros, 0);
  const revenueObserved = revenueReceipts.length > 0;
  const allCostsKnown = graphicCostKnown && unpricedResourceUses.length === 0;
  const knownContractedCashCostMicros = 0;
  const body = {
    type: "TTINewsProductEconomicReading",
    version: 1,
    recordedAt,
    venture: TTI_ACTOR,
    edition: publication.edition,
    commissionId: run.commission?.id ?? null,
    publicationReceiptId: publication.id ?? null,
    publicationMessageId: publication.messageId,
    channelId: publication.channelId,
    knownContractedCashCostMicros,
    contractedCashCostMicros: allCostsKnown ? knownContractedCashCostMicros : null,
    allocationCostMicros: allCostsKnown ? knownContractedCashCostMicros : null,
    unpricedResourceUses,
    externalRevenueReceiptCount: revenueReceipts.length,
    revenueObserved,
    revenueMicros,
    directContractMarginMicros: revenueObserved && allCostsKnown ? revenueMicros - knownContractedCashCostMicros : null,
    profitStatus: !revenueObserved ? "unproven-no-external-revenue-receipt" : !allCostsKnown ? "unproven-unpriced-costs" : "direct-contract-margin-observed",
    factualWarrant: false,
  };
  return { ...body, id: semanticId(body) };
}

export async function persistNewsProductEconomicReading({ run, dataRoot, witnessJournalAgentUrl, witnessJournal, recordedAt = new Date().toISOString() }) {
  if (!witnessJournalAgentUrl) throw new Error("news-product accounting requires the contracted witness-journal RDF provider");
  const binding = witnessJournal ?? turntideWitnessJournalBindingFromEnvironment();
  const reading = newsProductEconomicReading({ run, recordedAt, revenueReceipts: externalRevenueReceipts(dataRoot, run.publicationReceipt, binding) });
  if (reading.type.endsWith("Refusal")) return reading;
  const graph = semanticId(reading);
  await recordWitnessJournalBatch({ agentUrl: witnessJournalAgentUrl, ...(binding ?? {}), batch: { settlement: TTI_ACCOUNT, graph, recordedAt, document: reading, assertions: [
    { subject: TTI_ACTOR, predicate: "urn:emsenn:venture:news-product-economic-reading", object: { kind: "iri", value: graph } },
    { subject: graph, predicate: "urn:emsenn:venture:publication-message", object: { kind: "literal", value: reading.publicationMessageId } },
  ] } });
  return { ...reading, id: graph };
}
