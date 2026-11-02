#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { advanceHourlyReport } from "@causeway-services/tti-rich-news-publication-operations/advance-hourly-report";
import { currentRun } from "@causeway-services/tti-rich-news-publication-operations/hourly-reporting-state";
import { createSubscriptionManifest, REPORTING_ACTOR } from "@causeway-services/tti-rich-news-publication-operations/state-reporting";
import { renderReportGraphic } from "@red-cup-engineering/deterministic-report-graphic-service";
import { persistNewsProductEconomicReading } from "./news-product-economics.mjs";
import { EMPTY_WITNESS_ROOT, identifyJsonSemanticContent } from "@red-cup-engineering/semantic-content-identify-service";

const TTI_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SERVICES_ROOT = resolve(TTI_ROOT, "../../../../..");
const CONFIG_PATH = join(TTI_ROOT, "content/configurations/discord-news-territory.json");
const RICH_SERVICE_ROOT = join(TTI_ROOT, "services/state-of-harmonious-union-reporting-service");
const UNION_DATA_ROOT = join(RICH_SERVICE_ROOT, "data");
const COLONIAL_DATA_ROOT = join(TTI_ROOT, "data/news-editions/colonial");
const SHARED_NOTEBOOK_ID = "4745a1b9-677c-4d46-9c57-7feaeccef736";
const IN_FLIGHT = new Set(["preparing", "source-observing", "source-uploading", "source-processing", "source-retiring", "reconciling", "audio-submitting", "audio-submitted", "audio-in-progress", "ready-to-publish"]);

const paths = Object.freeze({
  defaultUnionReport: join(SERVICES_ROOT, "board-of-directors/services/executive-office/services/union-administration-services-sector/services/union-report-team/src/default-union-report.mjs"),
  unionNews: join(SERVICES_ROOT, "board-of-directors/services/executive-office/services/union-administration-services-sector/services/union-news-service/src/contract-rich-union-news.mjs"),
  colonialNews: join(SERVICES_ROOT, "board-of-directors/services/executive-office/services/union-administration-services-sector/services/colonial-news-service/src/contract-rich-colonial-news.mjs"),
});

function digest(value) { return identifyJsonSemanticContent({ objectKind: "turntide-islands.hourly-news-operation", value, witnessRoot: EMPTY_WITNESS_ROOT }).token; }
export async function contractDeterministicGraphic(packet, _recordedAt, options = {}) {
  const render = options.render ?? renderReportGraphic;
  return render(packet, { ...(options.agentCardUrl ? { agentCardUrl: options.agentCardUrl } : {}), ...(options.send ? { send: options.send } : {}), ...(options.signal ? { signal: options.signal } : {}) });
}
export function completedHourlyWindow(at = new Date()) { const to = new Date(Math.floor(at.getTime() / 3_600_000) * 3_600_000); return { fromExclusive: new Date(to.getTime() - 3_600_000).toISOString(), toInclusive: to.toISOString(), baseline: false }; }
export function publicationKey(edition, window) { return digest({ customer: "urn:ame:turntide-islands", edition, period: "PT1H", toInclusive: window.toInclusive }); }
export function publishedEditions(records, window) { return new Set(records.filter((row) => row?.type === "TTINewsPublicationReceipt" && row.status === "succeeded" && row.window?.toInclusive === window.toInclusive).map((row) => row.edition)); }
export function nextIncompleteHourlyWindow({ at = new Date(), records = [], firstWindowToInclusive }) { const latest = Date.parse(completedHourlyWindow(at).toInclusive); const first = Date.parse(firstWindowToInclusive); if (!Number.isFinite(first) || first % 3_600_000 !== 0) throw new TypeError("hourly news needs an exact hour-aligned first window boundary"); if (first > latest) return null; for (let to = first; to <= latest; to += 3_600_000) { const window = { fromExclusive: new Date(to - 3_600_000).toISOString(), toInclusive: new Date(to).toISOString(), baseline: false }; if (publishedEditions(records, window).size < 2) return window; } return null; }

async function modules() { const [{ collectDefaultUnionReport }, { contractRichUnionNews }, { contractRichColonialNews }] = await Promise.all(Object.values(paths).map((path) => import(pathToFileURL(path)))); return { collectDefaultUnionReport, contractRichUnionNews, contractRichColonialNews }; }

async function contractedCommissions({ window, recordedAt, customer, persist, witnessJournalAgentUrl }) {
  const { collectDefaultUnionReport, contractRichUnionNews, contractRichColonialNews } = await modules();
  const unionReport = await collectDefaultUnionReport({ window, recordedAt, persist, witnessJournalAgentUrl });
  const ttiResponse = unionReport.responses.find((response) => response.status === "accepted" && response.colonyActor === "urn:ame:turntide-islands");
  if (!ttiResponse?.report) throw new Error("Union Report Team did not admit TTI's own contracted colony report");
  return {
    unionReport,
    union: contractRichUnionNews(unionReport, { customer }),
    colonial: contractRichColonialNews(ttiResponse.report, { customer, colonyLabel: "Turntide Islands" }),
  };
}

function frozenInputs(commission, unionReport, recordedAt) {
  const constituent = commission.constituent;
  const subscription = createSubscriptionManifest({ version: `2026-07-21.${commission.edition}.${commission.providerLaw}`, effectiveAt: "2026-07-21T00:00:00.000Z", constituents: [{ settlementActor: constituent.settlementActor, providerActor: constituent.providerActor, providerEndpoint: constituent.providerEndpoint, providerContract: constituent.providerContract }] });
  const responses = [{ type: "Accept", actor: constituent.providerActor, target: REPORTING_ACTOR, object: { type: "ConstituentStateEnvelope", settlementActor: constituent.settlementActor, period: commission.period, claims: constituent.claims } }];
  return { subscription, period: commission.period, responses, unionReport, commission, presentation: commission.presentation, recordedAt };
}

function selectedEdition(states) {
  const active = Object.entries(states).filter(([, state]) => IN_FLIGHT.has(state?.status));
  if (active.length > 1) throw new Error("both editions are in flight against one stable notebook; manual reconciliation is required before either corpus mutates");
  if (active.length === 1) return active[0][0];
  return Object.entries(states).sort(([, left], [, right]) => Date.parse(left?.recordedAt ?? 0) - Date.parse(right?.recordedAt ?? 0))[0][0];
}

export async function advanceHourlyNews(options = {}) {
  const at = options.at ?? new Date(); const recordedAt = at.toISOString();
  const configuration = options.configuration ?? JSON.parse(await readFile(CONFIG_PATH, "utf8"));
  const window = completedHourlyWindow(at);
  if (options.live !== true) {
    const products = await contractedCommissions({ window, recordedAt, customer: configuration.customer, persist: false, witnessJournalAgentUrl: options.witnessJournalAgentUrl });
    return { type: "TTIRichHourlyNewsDryRun", status: "contracted-no-provider-or-discord-effects", window, unionReportDigest: products.unionReport.reportDigest, commissions: { union: { id: products.union.id, source: products.union.source.digest, audience: products.union.audience, presentation: products.union.presentation }, colonial: { id: products.colonial.id, source: products.colonial.source.digest, audience: products.colonial.audience, presentation: products.colonial.presentation } }, effects: [] };
  }
  if (!options.token) throw new Error("live rich hourly news requires TTI's DISCORD_BOT_TOKEN");
  if (!options.witnessJournalAgentUrl) throw new Error("live rich hourly news requires the contracted WITNESS_JOURNAL_RDF_AGENT");
  const roots = { union: options.unionDataRoot ?? UNION_DATA_ROOT, colonial: options.colonialDataRoot ?? COLONIAL_DATA_ROOT };
  const states = Object.fromEntries(await Promise.all(Object.entries(roots).map(async ([edition, dataRoot]) => [edition, await currentRun(dataRoot)])));
  const edition = options.edition ?? selectedEdition(states); const lane = configuration.lanes.find((candidate) => candidate.edition === edition);
  if (!lane?.channelId) throw new Error(`${edition} rich news lane lacks its exact admitted Discord channel`);
  let frozen;
  const freezeInputs = async (now) => {
    if (!frozen) { const products = await contractedCommissions({ window: completedHourlyWindow(new Date(now)), recordedAt: now, customer: configuration.customer, persist: true, witnessJournalAgentUrl: options.witnessJournalAgentUrl }); frozen = frozenInputs(products[edition], products.unionReport, now); }
    return frozen;
  };
  const config = { type: "TTIRichHourlyNewsConfiguration", leaderDirection: configuration.leaderDirection ?? "leader-direction:tti-for-profit-discord-colony", notebook: { id: options.notebookId ?? SHARED_NOTEBOOK_ID, title: "TTI contracted civic news editions", provider: "urn:ame:notebooklm-inference-team" }, period: "PT1H", destination: { guildEnvironmentKey: "DISCORD_GUILD_ID", channelId: lane.channelId }, asyncPolicy: { submitOnce: true, resumePersistedOperation: true, duplicateInFlightGeneration: false, staleAfter: "P7D" }, externalSpendCeiling: 0 };
  const result = await advanceHourlyReport({ now: recordedAt, dataRoot: roots[edition], config, freezeInputs, guildId: configuration.guildId, channelId: lane.channelId, transport: options.transport, sourceApi: options.sourceApi, audioApi: options.audioApi, renderGraphic: options.renderGraphic ?? ((packet) => contractDeterministicGraphic(packet, recordedAt)), providerOptions: { ...(options.providerOptions ?? {}), witnessJournalAgentUrl: options.witnessJournalAgentUrl } });
  const economicReading = result.status === "completed" ? await persistNewsProductEconomicReading({ run: result, dataRoot: options.ttiDataRoot ?? join(TTI_ROOT, "data"), witnessJournalAgentUrl: options.witnessJournalAgentUrl, recordedAt }) : undefined;
  return { type: "TTIRichHourlyNewsAdvance", edition, sharedNotebookSerialized: true, result, ...(economicReading ? { economicReading } : {}) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const live = process.argv.includes("--live");
  const result = await advanceHourlyNews({ live, token: process.env.DISCORD_BOT_TOKEN ?? process.env.DISCORD_TOKEN, witnessJournalAgentUrl: process.env.WITNESS_JOURNAL_RDF_AGENT });
  const output = live ? { type: result.type, edition: result.edition, sharedNotebookSerialized: result.sharedNotebookSerialized, status: result.result?.status, operationId: result.result?.operationId, stateSequence: result.result?.stateSequence }
    : result;
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}
