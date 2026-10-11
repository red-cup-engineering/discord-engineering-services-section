import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { a2aResultMetadata, a2aResultParts } from "@red-cup-engineering/a2a-services-section/a2a-client";
import { sendSenTask } from "@red-cup-engineering/a2a-services-section/sen-part";
import { discoverSignedAgentCard } from "@red-cup-engineering/a2a-services-section/agent-card-signing";
import {
  admitNormalizedSemanticContent,
  identifyNormalizedSemanticContent,
} from "@red-cup-engineering/computer-code-engineering-services-section/semiotic-expression-notation/semantic-content-identity";
import {
  EMPTY_WITNESS_ROOT,
  identifyJsonSemanticContent,
} from "@red-cup-engineering/computer-content-address-engineering-services-section/semantic-content-identity";
import { inferTy } from "@red-cup-engineering/computer-data-engineering-services-section/semiotic-expression-notation/typing";
import { circuitInterfaceFromAgentCard, SOVEREIGN_CIRCUIT_INTERFACE_EXTENSION } from "@red-cup-engineering/a2a-services-section/circuit-interface";
import { recordWitnessJournalBatch, relationalWitnessJournalDocument } from "@red-cup-engineering/witness-journal-document-service";
// @ts-expect-error This TTI-root management die is canonical JavaScript and intentionally remains outside the app compiler root.
import { turntideWitnessJournalBindingFromEnvironment } from "./witness-journal-binding.mjs";

import { env, publicTurntideDataPath } from "./env.mjs";
import { DiscordRestTransport } from "./discord.mjs";
import { renderDivinationInfographic } from "./divination-infographic.mjs";
import { ACTIVITYSTREAMS_CONTEXT } from "@red-cup-engineering/activitypub-services-section/activitystreams";

const ACTOR = "urn:ame:turntide-islands";
const DIVINATION_ACTOR = "urn:ame:divination";
const DIVINATION_ACCOUNT = "eip155:31337:0x4fa4554223cb86713b2d8d8f1a6d40b0b1730689";
// Every deployed LISS text-inference team agent card (claude-code, gemini,
// nvidia, groq, openrouter, bare-cedar-fog-npu) declares this extension
// required:true. Mirrors inference-work-lot-service's own working client
// (typed-inference-procurement.mjs's defaultProviderInvoke), which
// negotiates it alongside SOVEREIGN_CIRCUIT_INTERFACE_EXTENSION rather than
// only the sovereign-circuit-interface extension.
const INFERENCE_MARKET_OFFER_EXTENSION = "ni:///sha-256;hLCUM4R4uZnPEVaY9Cb6sDwruIVBtw2bjleYGbeATaQ";
const DIVINATION_OPERATION_TYPE = ["product", ["mark"], ["mark"]];
const LISS_OPERATION_TYPE = ["product", ["mark"], ["product", ["mark"], ["product", ["mark"], ["mark"]]]];
const CAIP10 = /^[-a-z0-9]{3,8}:[-_a-zA-Z0-9]{1,32}:[-.%a-zA-Z0-9]{1,128}$/u;

export const DAILY_READING_TYPE = ["product", ["mark"], ["product", ["product", ["mark"], ["mark"]], ["product", ["product", ["mark"], ["mark"]], ["product", ["product", ["mark"], ["product", ["mark"], ["mark"]]], ["product", ["list", ["product", ["mark"], ["product", ["mark"], ["product", ["mark"], ["product", ["mark"], ["product", ["mark"], ["mark"]]]]]]], ["product", ["product", ["mark"], ["mark"]], ["sum", ["product", ["mark"], ["product", ["mark"], ["product", ["mark"], ["product", ["mark"], ["product", ["mark"], ["product", ["list", ["product", ["mark"], ["product", ["mark"], ["product", ["sum", ["unit"], ["mark"]], ["sum", ["unit"], ["mark"]]]]]], ["mark"]]]]]]], ["product", ["mark"], ["product", ["mark"], ["mark"]]]]]]]]]];

function required(name, source) {
  const value = env(name, source); if (value === undefined) throw new Error(`${name} is required`); return value;
}
async function postActivity(endpoint, resource, value) {
  const response = await fetch(new URL(resource, endpoint), {
    method: "POST", headers: { accept: "application/activity+json", "content-type": "application/activity+json" },
    body: JSON.stringify(value), signal: AbortSignal.timeout(180_000),
  });
  let result;
  try { result = await response.json(); } catch { throw new Error(`${resource} returned non-JSON ActivityStreams output`); }
  if (![200, 422].includes(response.status)) throw new Error(`${resource} refused HTTP ${response.status}: ${result.object?.message ?? "no detail"}`);
  return result;
}
function identifyTerm(term, expectedType, objectKind) {
  const semanticType = inferTy([], term);
  if (semanticType === null) throw new Error(`${objectKind} does not infer one current SEN type`);
  const identified = identifyNormalizedSemanticContent({ objectKind, semanticType, term, witnessRoot: EMPTY_WITNESS_ROOT });
  return { term: identified.token, normalForm: identified.envelope.settledBody, canonicalBytesBase64: Buffer.from(identified.bytes).toString("base64") };
}
function markId(label) { return identifyTerm(["mark", label], ["mark"], "turntide.semantic-mark").term; }
function document(receipt) {
  return { type: "Document", id: receipt.term, mediaType: "application/sen+cbor", content: receipt.canonicalBytesBase64 };
}
function measures(kind) {
  return [
    { dimension: "asset", quantity: "0", unit: "none" }, { dimension: "compute", quantity: "1", unit: kind },
    { dimension: "erasure", quantity: "0", unit: "alternative" }, { dimension: "gas", quantity: "0", unit: "gas" },
    { dimension: "time", quantity: "0", unit: "millisecond" }, { dimension: "wit", quantity: "0", unit: "typed-four-cover" },
  ];
}

function members(term, count, label) {
  const values = []; let current = term;
  for (let index = 0; index < count - 1; index += 1) {
    if (current?.[0] !== "pair") throw new Error(`${label} is not the contracted ${count}-member SEN product`);
    values.push(current[1]); current = current[2];
  }
  values.push(current); return values;
}
function mark(term, label) {
  if (term?.[0] !== "mark" || typeof term[1] !== "string") throw new Error(`${label} is not an SEN Mark`); return term[1];
}
function numberMark(term, label) {
  const value = Number(mark(term, label)); if (!Number.isFinite(value)) throw new Error(`${label} is not a finite numeric Mark`); return value;
}
function list(term, label) {
  const values = []; let current = term;
  while (current?.[0] === "cons") { values.push(current[1]); current = current[2]; }
  if (current?.[0] !== "nil") throw new Error(`${label} is not an SEN list`); return values;
}
function optionalMark(term, label) {
  if (term?.[0] === "left" && term[1]?.[0] === "star") return undefined;
  if (term?.[0] === "right") return mark(term[2], label);
  throw new Error(`${label} is not the contracted optional Mark`);
}

function decodeReading(term) {
  const [time, sunTerm, moonTerm, lunationTerm, aspectsTerm, _provenance, lectionTerm] = members(term, 7, "daily reading");
  const sign = (value, label) => {
    const [name, degree] = members(value, 2, label);
    return { sign: { name: mark(name, `${label} name`) }, degreeInSign: numberMark(degree, `${label} degree`) };
  };
  const [phase, illumination, trend] = members(lunationTerm, 3, "lunation");
  const aspects = list(aspectsTerm, "aspects").map((value, index) => {
    const [bodyA, bodyB, aspect, _separation, offset, aspectPhase] = members(value, 6, `aspect ${index}`);
    const direction = mark(aspectPhase, `aspect ${index} phase`);
    if (direction !== "applying" && direction !== "separating") throw new Error(`aspect ${index} has an unknown phase`);
    const phase = direction === "applying" ? "applying" : "separating";
    return { bodyA: mark(bodyA, "bodyA"), bodyB: mark(bodyB, "bodyB"), aspect: mark(aspect, "aspect"), offset: numberMark(offset, "offset"), phase };
  });
  const numbers = {
    time: mark(time, "time"), astrology: { sun: sign(sunTerm, "sun"), moon: sign(moonTerm, "moon") },
    moon: { phase: mark(phase, "phase"), illuminatedFraction: numberMark(illumination, "illumination"), trend: mark(trend, "trend") }, aspects,
  };
  let lection;
  if (lectionTerm?.[0] === "right") {
    const [date, tradition, note] = members(lectionTerm[2], 3, "lection absence");
    lection = { outcome: "no-entry-recorded", date: mark(date, "lection date"), tradition: mark(tradition, "lection tradition"), note: mark(note, "lection note") };
  } else if (lectionTerm?.[0] === "left") {
    const [tradition, service, date, cycle, name, readingsTerm, provenance] = members(lectionTerm[1], 7, "lection entry");
    const readings = list(readingsTerm, "lection readings").map((value, index) => {
      const [role, citation, track, alternative] = members(value, 4, `lection reading ${index}`);
      return { role: mark(role, "role"), citation: mark(citation, "citation"), track: optionalMark(track, "track"), alternativeCitation: optionalMark(alternative, "alternative citation") };
    });
    lection = { outcome: "found", entry: { tradition: mark(tradition, "tradition"), service: mark(service, "service"), date: mark(date, "date"), cycle: mark(cycle, "cycle"), name: mark(name, "name"), readings, provenance: mark(provenance, "provenance") } };
  } else throw new Error("lection is not the contracted SEN sum");
  return { numbers, lection };
}

async function procureReading(date, tradition, source) {
  const caller = required("TURNTIDE_ACCOUNT_CAIP10", source); if (!CAIP10.test(caller)) throw new Error("TURNTIDE_ACCOUNT_CAIP10 is not a CAIP-10 account");
  const operation = ["pair", ["mark", date], ["mark", tradition]];
  const op = identifyTerm(operation, DIVINATION_OPERATION_TYPE, "divination.daily-reading-operation");
  const cell = { caller, provider: DIVINATION_ACCOUNT,
    operation: op.term,
    evidenceRoot: op.term, outcome: { positiveEvidence: false, negativeEvidence: false }, measures: measures("daily-reading"), parent: null };
  const proposalIdentity = identifyJsonSemanticContent({ objectKind: "divination.daily-reading-proposal", value: { cell, operation }, witnessRoot: EMPTY_WITNESS_ROOT });
  const proposal = { term: proposalIdentity.token, canonicalBytesBase64: Buffer.from(proposalIdentity.bytes).toString("base64") };
  const contract = { "@context": ACTIVITYSTREAMS_CONTEXT, id: `urn:uuid:${randomUUID()}`, type: "Accept", actor: ACTOR, target: DIVINATION_ACTOR,
    object: { type: "ServiceContract", callerAccount: caller, proposal: document(proposal) } };
  const settlement = await postActivity(required("DIVINATION_SERVICE_URL", source), "/contracts/daily-reading", contract);
  if (settlement.type !== "Accept" || settlement.actor !== DIVINATION_ACTOR || settlement.object?.type !== "SenDailyReadingSettlement") throw new Error(`Divination refused: ${settlement.object?.message ?? settlement.object?.disposition ?? "unknown"}`);
  const evidence = settlement.object.attachment?.find((item) => item.id === settlement.object.evidence);
  const decoded = admitNormalizedSemanticContent(Buffer.from(evidence.content, "base64"), evidence.id);
  if (decoded.envelope.objectKind !== "divination.daily-reading") throw new Error("Divination evidence has the wrong semantic object kind");
  return { ...decodeReading(decoded.envelope.settledBody), completion: settlement.object.completion };
}

function promptFor(numbers, lection, date) {
  const instruction = "Write a short, warm daily sky report for a Discord community. Use only the witnessed facts supplied. Cover Sun and Moon placements, lunar phase and illumination, then the lection. Do not invent missing lection content. Use 3–5 short paragraphs and no Markdown header.";
  const aspectLines = numbers.aspects.map((aspect) => `${aspect.bodyA} ${aspect.aspect} ${aspect.bodyB}; offset ${aspect.offset}; ${aspect.phase}`).join("\n");
  const lectionText = lection.outcome === "found"
    ? (lection.entry.readings).map((reading) => `${reading.role}: ${reading.citation}`).join("\n")
    : `no-entry-recorded: ${lection.note}`;
  const input = `Date: ${date}\nSun: ${numbers.astrology.sun.sign.name} ${numbers.astrology.sun.degreeInSign}\nMoon: ${numbers.astrology.moon.sign.name} ${numbers.astrology.moon.degreeInSign}\nLunation: ${numbers.moon.phase}; illuminated ${numbers.moon.illuminatedFraction}; ${numbers.moon.trend}\nAspects:\n${aspectLines}\nLection:\n${lectionText}`;
  return { instruction, input };
}

async function procureProse(instruction, input, parent, source) {
  const caller = required("TURNTIDE_ACCOUNT_CAIP10", source), inferenceAgentCard = required("TTI_PROSE_INFERENCE_AGENT_CARD_URL", source);
  const card = await discoverSignedAgentCard({ agentUrl: inferenceAgentCard });
  const inferenceInterface = circuitInterfaceFromAgentCard(card);
  if (!CAIP10.test(inferenceInterface.account)) throw new Error("the signed prose-inference Agent Card does not bind a chain-qualified smart account");
  // The LISS operation's third Mark is the provider's own model identifier
  // (execute-sen-inference.mjs decodes it as instruction/input/model/mode and
  // refuses any model it does not itself offer) — mirrors
  // typed-inference-procurement.mjs's compileSelectedInferenceContract,
  // which takes this same slot from the accepted offer's own `model`, never a
  // caller-invented work-class label.
  const marketOffer = (card)?.capabilities?.extensions?.find((extension) => extension?.uri === INFERENCE_MARKET_OFFER_EXTENSION)?.params;
  const model = marketOffer?.model;
  if (typeof model !== "string" || model.trim() === "") throw new Error("signed prose-inference Agent Card carries no v2 inference market offer model");
  const mode = env("TTI_DIVINATION_REPORT_INFERENCE_MODE", source) ?? "live";
  const operation = ["pair", ["mark", instruction], ["pair", ["mark", input], ["pair", ["mark", model], ["mark", mode]]]];
  const op = identifyTerm(operation, LISS_OPERATION_TYPE, "inference.typed-operation");
  const cell = { law: inferenceInterface.component.law, caller, provider: inferenceInterface.account,
    precondition: markId("liss:typed-accountable-prose-demand"), operation: op.term,
    postcondition: markId("liss:witnessed-inference-settlement"), refusal: markId("liss:no-admissible-provider-or-refusal"),
    evidenceRoot: op.term, outcome: { positiveEvidence: false, negativeEvidence: false }, measures: measures("liss-contract"), parent };
  const proposalIdentity = identifyJsonSemanticContent({ objectKind: "inference.typed-proposal", value: { cell, operation }, witnessRoot: EMPTY_WITNESS_ROOT });
  const proposal = { term: proposalIdentity.token, canonicalBytesBase64: Buffer.from(proposalIdentity.bytes).toString("base64") };
  const exchange = await sendSenTask({ agentUrl: inferenceAgentCard, extensions: [SOVEREIGN_CIRCUIT_INTERFACE_EXTENSION, INFERENCE_MARKET_OFFER_EXTENSION], requireSignature: true, message: {
    messageId: randomUUID(), role: "ROLE_USER",
    parts: [{ raw: proposal.canonicalBytesBase64, metadata: { ni: proposal.term }, filename: "proposal.sen.cbor", mediaType: "application/sen+cbor" }],
    metadata: { lawNi: cell.law, callerAccount: caller, providerAccount: cell.provider },
  }, signal: AbortSignal.timeout(180_000) });
  const disposition = a2aResultMetadata(exchange.result).disposition;
  if (disposition !== "completion") throw new Error(`Prose inference provider refused: ${disposition ?? "unknown"}`);
  const note = a2aResultParts(exchange.result).find((item) => item.content?.$case === "text")?.content?.value;
  if (typeof note !== "string" || note.trim().length === 0) throw new Error("Prose inference completion carried no text part");
  return note.trim();
}

export function todayUtc() { return new Date().toISOString().slice(0, 10); }
function dataRoot(source) { return env("TURNTIDE_DATA_ROOT", source) ?? publicTurntideDataPath(source); }
async function nqFiles(root) {
  let entries; try { entries = await readdir(root, { withFileTypes: true }); } catch { return []; }
  const files = [];
  for (const entry of entries) {
    const at = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await nqFiles(at)); else if (entry.isFile() && entry.name.endsWith(".nq")) files.push(at);
  }
  return files;
}
async function alreadyPosted(date, source) {
  for (const file of await nqFiles(path.join(dataRoot(source), "witnessJournal"))) if ((await readFile(file, "utf8")).includes(`<urn:turntide:daily-report-date> ${JSON.stringify(date)}`)) return true;
  return false;
}
async function recordPosted(date, source) {
  const at = new Date().toISOString(), account = required("TURNTIDE_ACCOUNT_CAIP10", source);
  const graph = identifyJsonSemanticContent({ objectKind: "turntide-islands.daily-divination-publication-graph", value: { account, date, at }, witnessRoot: EMPTY_WITNESS_ROOT }).token;
  await recordWitnessJournalBatch({ agentUrl: required("WITNESS_JOURNAL_RDF_AGENT", source), ...(turntideWitnessJournalBindingFromEnvironment(source) ?? {}), batch: { settlement: account, graph, recordedAt: at, document: relationalWitnessJournalDocument({ type: "DailyDivinationReportPublication", date, recordedAt: at }), assertions: [
    { subject: graph, predicate: "urn:turntide:daily-report-date", object: { kind: "literal", value: date } },
    { subject: graph, predicate: "urn:prov:generatedAtTime", object: { kind: "literal", value: at } }
  ] } });
}

const DISCORD_MESSAGE_LIMIT = 2000;
// Split into Discord's documented 2000-character message ceiling without
// dropping any witnessed content — greedy paragraph packing, falling back to
// a hard slice only for one paragraph that alone exceeds the limit.
function chunkForDiscord(text, limit = DISCORD_MESSAGE_LIMIT) {
  const chunks = []; let current = "";
  for (const paragraph of text.split("\n\n")) {
    const candidate = current.length === 0 ? paragraph : `${current}\n\n${paragraph}`;
    if (candidate.length <= limit) { current = candidate; continue; }
    if (current.length > 0) { chunks.push(current); current = ""; }
    if (paragraph.length <= limit) { current = paragraph; continue; }
    for (let at = 0; at < paragraph.length; at += limit) chunks.push(paragraph.slice(at, at + limit));
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

export async function runDailyDivinationReportWithTransport(transport, source = process.env) {
  const date = todayUtc();
  if (await alreadyPosted(date, source)) return { outcome: "skipped-already-posted-today", date };
  try {
    const reading = await procureReading(date, env("TTI_DIVINATION_TRADITION", source) ?? "rcl", source);
    const prompt = promptFor(reading.numbers, reading.lection, date);
    const prose = await procureProse(prompt.instruction, prompt.input, reading.completion, source);
    const note = reading.lection.outcome === "no-entry-recorded" ? reading.lection.note : undefined;
    const disclosure = "AI-generated interpretation of deterministic Divination data; accountable settlement: Turntide Islands.";
    const reportText = [disclosure, prose, note].filter((value) => typeof value === "string" && value.length > 0).join("\n\n");
    const png = await renderDivinationInfographic(reading.numbers, { date });
    const guildId = required("DISCORD_GUILD_ID", source), channels = await transport.listChannels(guildId);
    const channelName = (env("TTI_DIVINATION_REPORT_CHANNEL", source) ?? "sky-desk").toLowerCase();
    const channel = channels.find((candidate) => candidate.name.toLowerCase() === channelName);
    if (channel === undefined) throw new Error(`#${channelName} channel not found in this guild`);
    const attachment = { name: `sky-report-${date}.png`, data: png, contentType: "image/png" };
    await transport.createMessage(channel.id, { content: `**Sky report — ${date}**\n${disclosure}`, files: [attachment] });
    for (const chunk of chunkForDiscord(reportText)) await transport.createMessage(channel.id, { content: chunk });
    await recordPosted(date, source);
    return { outcome: "posted", date };
  } catch (error) { return { outcome: "refused", date, reason: error instanceof Error ? error.message : String(error) }; }
}

export async function runDailyDivinationReport(source = process.env) {
  return runDailyDivinationReportWithTransport(new DiscordRestTransport({ env: source }), source);
}
