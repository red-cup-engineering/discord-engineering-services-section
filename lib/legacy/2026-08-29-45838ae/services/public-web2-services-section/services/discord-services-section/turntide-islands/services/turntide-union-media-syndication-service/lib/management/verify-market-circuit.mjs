#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EMPTY_WITNESS_ROOT, identifyJsonSemanticContent } from "@red-cup-engineering/semantic-content-identify-service";
const semanticId = (value) => identifyJsonSemanticContent({ objectKind: "turntide-islands.record", value, witnessRoot: EMPTY_WITNESS_ROOT }).token;
import { recordWitnessJournalBatch } from "@red-cup-engineering/witness-journal-document-service";
import { turntideWitnessJournalBindingFromEnvironment } from "@causeway-services/turntide-witness-journal-binding-service";

const TTI_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CIRCUIT_PATH = join(TTI_ROOT, "content/circuits/founding-knowledge-vault-market-circuit.json");
const TTI_ACCOUNT = "eip155:31337:0xcfe1b9960ddbbe2b95e48114c281d7f24eb87b4d";

export function verifyMarketCircuit(circuit, recordedAt = new Date().toISOString()) {
  const errors = []; const cells = new Map();
  for (const cell of circuit?.cells ?? []) { if (!cell.id || cells.has(cell.id)) errors.push(`duplicate-or-absent-cell:${cell.id ?? "absent"}`); else cells.set(cell.id, cell); }
  const port = (reference, side) => { const [cellId, name, extra] = String(reference ?? "").split("."); const cell = cells.get(cellId); if (!cell || !name || extra) return false; return (cell[side] ?? []).includes(name); };
  const netIds = new Set();
  for (const net of circuit?.nets ?? []) { if (!net.id || netIds.has(net.id)) errors.push(`duplicate-or-absent-net:${net.id ?? "absent"}`); else netIds.add(net.id); if (!port(net.from, "outputs")) errors.push(`invalid-net-source:${net.id}`); if (!port(net.to, "inputs")) errors.push(`invalid-net-target:${net.id}`); }
  for (const [pathName, path] of Object.entries(circuit?.paths ?? {})) for (const cellId of path) if (!cells.has(cellId)) errors.push(`invalid-${pathName}-path-cell:${cellId}`);
  const rules = new Set((circuit?.designRules ?? []).map((rule) => rule.id)); for (const required of circuit?.requiredDesignRules ?? []) if (!rules.has(required)) errors.push(`missing-design-rule:${required}`);
  const discoveryPath = circuit?.paths?.discovery ?? []; const economicPathName = circuit?.paths?.valueAcquisition ? "valueAcquisition" : "revenue"; const economicPath = circuit?.paths?.[economicPathName] ?? [];
  const passable = (cell) => ["live", "ready"].includes(cell?.status);
  const pathClosures = Object.fromEntries(Object.entries(circuit?.paths ?? {}).map(([name, path]) => [name, path.every((id) => passable(cells.get(id)))]));
  const discoveryLoopClosed = discoveryPath.every((id) => passable(cells.get(id)));
  const openEconomicCells = economicPath.filter((id) => !passable(cells.get(id))).map((id) => ({ id, status: cells.get(id)?.status ?? "absent", blockers: cells.get(id)?.blockers ?? [] }));
  const hasRevenuePath = Array.isArray(circuit?.paths?.revenue), hasValueAcquisitionPath = Array.isArray(circuit?.paths?.valueAcquisition);
  const body = { type: "TTIMarketCircuitVerification", version: 3, recordedAt, circuitId: circuit?.id ?? null, structuralStatus: errors.length ? "failed" : "passed", errors, pathClosures, discoveryLoopClosed, buyerDiscoveryLoopClosed: pathClosures.buyerDiscovery ?? null, economicPathName, revenuePathClosed: hasRevenuePath ? errors.length === 0 && pathClosures.revenue === true : null, valueAcquisitionPathClosed: hasValueAcquisitionPath ? errors.length === 0 && pathClosures.valueAcquisition === true : null, openEconomicCells, openRevenueCells: hasRevenuePath ? openEconomicCells : [], nextCriticalCell: openEconomicCells[0]?.id ?? null, experiments: (circuit?.experiments ?? []).map(({ id, status, decisionAt, probe }) => ({ id, status, decisionAt, probe })), inference: errors.length ? "netlist-invalid" : openEconomicCells.length ? `discovery-operational-${economicPathName === "revenue" ? "revenue" : "value-acquisition"}-open-circuit` : economicPathName === "revenue" ? "revenue-circuit-closed-pending-observed-margin" : "value-acquisition-circuit-closed-pending-observed-local-utility" };
  return { ...body, id: semanticId(body) };
}

export async function recordMarketCircuitVerification(options = {}) {
  const circuit = options.circuit ?? JSON.parse(await readFile(options.circuitPath ?? CIRCUIT_PATH, "utf8")); const reading = verifyMarketCircuit(circuit, options.recordedAt);
  if (!options.witnessJournalAgentUrl) throw new Error("market circuit verification requires the contracted witness-journal RDF provider"); const graph = semanticId(reading);
  const witnessJournal = options.witnessJournal ?? turntideWitnessJournalBindingFromEnvironment();
  await recordWitnessJournalBatch({ agentUrl: options.witnessJournalAgentUrl, ...(witnessJournal ?? {}), batch: { settlement: TTI_ACCOUNT, graph, recordedAt: reading.recordedAt, document: reading, assertions: [
    { subject: "urn:ame:turntide-islands", predicate: "urn:emsenn:venture:verified-market-circuit", object: { kind: "iri", value: graph } },
    { subject: graph, predicate: "urn:emsenn:venture:next-critical-cell", object: { kind: "literal", value: reading.nextCriticalCell ?? "none" } }
  ] } }); return { ...reading, receiptId: graph };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { const result = process.argv.includes("--record") ? await recordMarketCircuitVerification({ witnessJournalAgentUrl: process.env.WITNESS_JOURNAL_RDF_AGENT }) : verifyMarketCircuit(JSON.parse(await readFile(CIRCUIT_PATH, "utf8"))); process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); if (result.structuralStatus !== "passed") process.exitCode = 2; }
