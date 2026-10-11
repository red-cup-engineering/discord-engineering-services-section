import { appendFile, chmod, mkdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const candidateFile = (dataRoot) => path.join(dataRoot, "civic", "routine-candidates.jsonl");
const candidateEventFile = (dataRoot) => path.join(dataRoot, "civic", "routine-candidate-events.jsonl");
const candidateSubmissionFile = (dataRoot) => path.join(dataRoot, "civic", "routine-candidate-submissions.jsonl");

const REQUIRED_FIELDS = Object.freeze([
  "observation",
  "beneficiary",
  "triggerOrCadence",
  "actor",
  "output",
  "authorityBoundary",
  "failureMode",
  "retirementCondition",
]);

const EDITABLE_LABELS = Object.freeze({
  "observed repetition": "observation",
  observation: "observation",
  beneficiary: "beneficiary",
  "trigger or cadence": "triggerOrCadence",
  "trigger-or-cadence": "triggerOrCadence",
  actor: "actor",
  output: "output",
  "authority boundary": "authorityBoundary",
  "failure mode": "failureMode",
  "retirement condition": "retirementCondition",
});

function ni(value) {
  return `ni:///sha-256;${createHash("sha256").update(JSON.stringify(value)).digest("base64url")}`;
}

function candidateId(messageId, channelId, observation) {
  return ni([messageId, channelId, observation]);
}

function parseLines(text) {
  return text.split(/\r?\n/u)
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line));
}

async function readLines(target) {
  return readFile(target, "utf8").then(parseLines).catch((error) => {
    if (error?.code === "ENOENT") return [];
    throw error;
  });
}

async function appendPrivateJsonl(target, record) {
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  await chmod(path.dirname(target), 0o700);
  await appendFile(target, `${JSON.stringify(record)}\n`, { mode: 0o600 });
  await chmod(target, 0o600);
}

const present = (value) => typeof value === "string" && value.trim() !== "";

export function routineCandidateObservation(content) {
  return String(content ?? "")
    .replace(/<@!?\d+>/gu, " ")
    .replace(/\b(?:please\s+)?(?:save|record|draft|turn)\b[\s\S]*?\broutine candidate\b\s*[:\-]?/iu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function routineCandidateUpdateCommand(content) {
  const normalized = String(content ?? "").replace(/<@!?\d+>/gu, " ").replace(/\s+/gu, " ").trim();
  const match = /\b(?:set|update|refine)\s+routine candidate\s+(\S+)\s+(observed repetition|observation|beneficiary|trigger or cadence|trigger-or-cadence|actor|output|authority boundary|failure mode|retirement condition)\s*:\s*(.+)$/iu.exec(normalized);
  if (match === null) return null;
  const field = EDITABLE_LABELS[match[2].toLowerCase()];
  const value = match[3].trim();
  if (value.length === 0) return null;
  return Object.freeze({ handle: match[1], field, value });
}

export function routineCandidateSubmitHandle(content) {
  const normalized = String(content ?? "").replace(/<@!?\d+>/gu, " ").replace(/\s+/gu, " ").trim();
  return /\bsubmit\s+routine candidate\s+(\S+)\b/iu.exec(normalized)?.[1] ?? null;
}

export async function readRoutineCandidateIntake(dataRoot) {
  if (typeof dataRoot !== "string" || dataRoot.trim() === "") throw new TypeError("routine candidate intake requires dataRoot");
  const records = await readLines(candidateFile(dataRoot));
  return Object.freeze(records.map((record) => Object.freeze(record)));
}

export async function readRoutineCandidateEvents(dataRoot) {
  if (typeof dataRoot !== "string" || dataRoot.trim() === "") throw new TypeError("routine candidate events require dataRoot");
  const records = await readLines(candidateEventFile(dataRoot));
  return Object.freeze(records.map((record) => Object.freeze(record)));
}

export async function readRoutineCandidateSubmissionEvents(dataRoot) {
  if (typeof dataRoot !== "string" || dataRoot.trim() === "") throw new TypeError("routine candidate submission events require dataRoot");
  const records = await readLines(candidateSubmissionFile(dataRoot));
  return Object.freeze(records.map((record) => Object.freeze(record)));
}

export function routineCandidateHandle(record) {
  const digest = String(record?.id ?? "").split(";").at(-1) ?? "";
  if (digest.length < 8) throw new TypeError("routine candidate has no stable content-addressed id");
  return digest.slice(0, 10);
}

function projectCandidate(record, events, submissions) {
  const projected = { ...record };
  for (const event of events) {
    if (event.type !== "TurntideRoutineCandidateFieldUpdate" || event.candidateId !== record.id) continue;
    projected[event.field] = event.value;
  }
  projected.missing = REQUIRED_FIELDS.filter((field) => !present(projected[field]));
  projected.status = projected.missing.length === 0 ? "complete" : "incomplete";
  const matching = submissions.filter((event) => event.candidateId === record.id);
  const receipt = matching.findLast((event) => event.type === "TurntideRoutineCandidateSubmissionReceipt");
  const intent = matching.findLast((event) => event.type === "TurntideRoutineCandidateSubmissionIntent");
  if (receipt !== undefined) {
    projected.state = "proposed";
    projected.status = "submitted";
    projected.routineProposalId = receipt.routineProposalId;
    projected.publicMessage = receipt.publicMessage;
    projected.missing = [];
  } else if (intent !== undefined) {
    projected.status = "submission-pending";
    projected.routineProposalId = intent.routineProposalId;
  }
  return Object.freeze(projected);
}

async function allProjectedCandidates(dataRoot) {
  const [records, events, submissions] = await Promise.all([
    readRoutineCandidateIntake(dataRoot),
    readRoutineCandidateEvents(dataRoot),
    readRoutineCandidateSubmissionEvents(dataRoot),
  ]);
  return records.map((record) => projectCandidate(record, events, submissions));
}

export async function routineCandidateInboxForAuthor(dataRoot, authorId) {
  if (typeof authorId !== "string" || authorId.trim() === "") throw new TypeError("routine candidate inbox requires an author id");
  const records = await allProjectedCandidates(dataRoot);
  return Object.freeze(records
    .filter((record) => record.source?.authorId === authorId)
    .sort((left, right) => String(right.createdAt ?? "").localeCompare(String(left.createdAt ?? "")))
    .map((record) => Object.freeze({
      handle: routineCandidateHandle(record),
      id: record.id,
      state: record.state,
      status: record.status,
      channelName: record.source?.channelName ?? null,
      channelId: record.source?.channelId ?? null,
      messageId: record.source?.messageId ?? null,
      missing: Object.freeze([...(record.missing ?? [])]),
      routineProposalId: record.routineProposalId ?? null,
      publicMessage: record.publicMessage ?? null,
      createdAt: record.createdAt ?? null,
    })));
}

export async function routineCandidateForAuthor(dataRoot, authorId, handle) {
  if (typeof authorId !== "string" || authorId.trim() === "") throw new TypeError("routine candidate lookup requires an author id");
  if (typeof handle !== "string" || handle.trim() === "") throw new TypeError("routine candidate lookup requires a handle");
  const normalized = handle.trim();
  const records = (await allProjectedCandidates(dataRoot)).filter((record) =>
    record.source?.authorId === authorId
    && (record.id === normalized || routineCandidateHandle(record) === normalized));
  if (records.length > 1) throw new TypeError("routine candidate handle is ambiguous");
  return records[0] === undefined ? null : Object.freeze(records[0]);
}

export async function recordRoutineCandidateIntake({
  dataRoot,
  channel,
  message,
  observation,
  missing = [],
}) {
  if (typeof dataRoot !== "string" || dataRoot.trim() === "") throw new TypeError("routine candidate intake requires dataRoot");
  if (typeof channel?.id !== "string" || typeof message?.id !== "string") throw new TypeError("routine candidate intake requires Discord channel/message ids");
  if (typeof observation !== "string" || observation.trim() === "") throw new TypeError("routine candidate intake requires observed repetition");
  const normalized = observation.trim();
  const id = candidateId(message.id, channel.id, normalized);
  const target = candidateFile(dataRoot);
  const existing = await readLines(target);
  const prior = existing.find((entry) => entry.id === id);
  if (prior) return Object.freeze({ appended: false, record: Object.freeze(prior), target });

  const record = Object.freeze({
    type: "TurntideRoutineCandidateIntake",
    version: 1,
    id,
    state: "draft",
    status: "incomplete",
    authorityDomain: "turntide-governance",
    bindingEffect: "none",
    observation: normalized,
    beneficiary: null,
    triggerOrCadence: null,
    actor: null,
    output: null,
    authorityBoundary: null,
    failureMode: null,
    retirementCondition: null,
    missing: Object.freeze([...missing]),
    source: Object.freeze({
      adapter: "discord",
      channelId: channel.id,
      channelName: channel.name ?? null,
      messageId: message.id,
      authorId: message.authorId ?? null,
    }),
    createdAt: message.timestamp ?? new Date().toISOString(),
    next: "The author or Zelo may refine the missing routine fields. Moving draft → proposed remains a separate civic transition and creates no enactment or schedule.",
  });
  await appendPrivateJsonl(target, record);
  return Object.freeze({ appended: true, record, target });
}

export async function recordRoutineCandidateFieldUpdate({
  dataRoot,
  authorId,
  handle,
  message,
  field,
  value,
}) {
  if (!Object.values(EDITABLE_LABELS).includes(field)) throw new TypeError("routine candidate update names an unsupported field");
  if (!present(value)) throw new TypeError("routine candidate update requires a value");
  if (String(value).trim().length > 600) throw new RangeError("routine candidate field must be 600 characters or fewer");
  const candidate = await routineCandidateForAuthor(dataRoot, authorId, handle);
  if (candidate === null) throw new TypeError("routine candidate is unavailable to this author");
  if (candidate.state === "proposed" || candidate.status === "submission-pending") throw new TypeError("routine candidate can no longer be edited after submission begins");
  if (candidate.source?.channelId !== message?.channelId) throw new TypeError("routine candidate updates must occur in the original channel");
  const normalized = String(value).trim();
  const event = Object.freeze({
    type: "TurntideRoutineCandidateFieldUpdate",
    version: 1,
    id: ni([candidate.id, message?.id, field, normalized]),
    candidateId: candidate.id,
    authorId,
    field,
    value: normalized,
    sourceMessageId: message?.id ?? null,
    createdAt: message?.timestamp ?? new Date().toISOString(),
    bindingEffect: "draft-only",
  });
  const target = candidateEventFile(dataRoot);
  const existing = await readLines(target);
  const prior = existing.find((entry) => entry.id === event.id);
  if (prior === undefined) await appendPrivateJsonl(target, event);
  const projected = await routineCandidateForAuthor(dataRoot, authorId, candidate.id);
  return Object.freeze({ appended: prior === undefined, event: Object.freeze(prior ?? event), candidate: projected, target });
}

export function routineCandidatePublicText(candidate, routineProposalId) {
  if (candidate?.status !== "complete" && candidate?.state !== "proposed") throw new TypeError("only a complete routine candidate can be rendered for submission");
  const content = [
    "**Turntide routine candidate — proposed, not enacted or scheduled**",
    `${routineProposalId}`,
    `Proposer: <@${candidate.source?.authorId}>`,
    `Observed repetition: ${candidate.observation}`,
    `Beneficiary: ${candidate.beneficiary}`,
    `Trigger or cadence: ${candidate.triggerOrCadence}`,
    `Actor: ${candidate.actor}`,
    `Output: ${candidate.output}`,
    `Authority boundary: ${candidate.authorityBoundary}`,
    `Failure mode: ${candidate.failureMode}`,
    `Retirement condition: ${candidate.retirementCondition}`,
    "",
    "State: proposed. This offers a routine for governance consideration; it does not enact, schedule, delegate, or authorize the routine.",
  ].join("\n");
  if (content.length > 1850) throw new RangeError("routine candidate is too long for one bounded Governance Rock post; shorten one or more fields before submission");
  return content;
}

export async function beginRoutineCandidateSubmission({ dataRoot, authorId, handle, message }) {
  const candidate = await routineCandidateForAuthor(dataRoot, authorId, handle);
  if (candidate === null) throw new TypeError("routine candidate is unavailable to this author");
  if (candidate.source?.channelId !== message?.channelId) throw new TypeError("routine candidate submission must be requested in the original channel");
  const target = candidateSubmissionFile(dataRoot);
  const events = await readLines(target);
  const receipt = events.findLast((event) => event.type === "TurntideRoutineCandidateSubmissionReceipt" && event.candidateId === candidate.id);
  if (receipt !== undefined) return Object.freeze({ state: "proposed", candidate, routineProposalId: receipt.routineProposalId, receipt: Object.freeze(receipt) });
  const prior = events.findLast((event) => event.type === "TurntideRoutineCandidateSubmissionIntent" && event.candidateId === candidate.id);
  if (prior !== undefined) return Object.freeze({ state: "pending", candidate, routineProposalId: prior.routineProposalId, intent: Object.freeze(prior) });
  if (candidate.missing?.length > 0 || candidate.status !== "complete") {
    return Object.freeze({ state: "incomplete", candidate, missing: Object.freeze([...(candidate.missing ?? [])]) });
  }

  const routineProposalId = ni(REQUIRED_FIELDS.map((field) => candidate[field]));
  const publicText = routineCandidatePublicText(candidate, routineProposalId);
  const intent = Object.freeze({
    type: "TurntideRoutineCandidateSubmissionIntent",
    version: 1,
    id: ni(["routine-candidate-submit-intent", candidate.id, routineProposalId]),
    candidateId: candidate.id,
    routineProposalId,
    proposer: authorId,
    state: "submission-pending",
    authorityDomain: "turntide-governance",
    performedBy: "proposer-via-zelo-transport",
    sourceMessageId: message?.id ?? null,
    requestedAt: message?.timestamp ?? new Date().toISOString(),
    bindingEffect: "routine-proposal-transition-request-only",
  });
  await appendPrivateJsonl(target, intent);
  return Object.freeze({ state: "ready", candidate, routineProposalId, intent, content: publicText });
}

export async function completeRoutineCandidateSubmission({ dataRoot, intent, publicMessage }) {
  if (intent?.type !== "TurntideRoutineCandidateSubmissionIntent") throw new TypeError("routine candidate submission completion requires an intent");
  if (typeof publicMessage?.id !== "string" || typeof publicMessage?.channelId !== "string") {
    throw new TypeError("routine candidate submission completion requires a public Discord message receipt");
  }
  const target = candidateSubmissionFile(dataRoot);
  const events = await readLines(target);
  const prior = events.findLast((event) => event.type === "TurntideRoutineCandidateSubmissionReceipt" && event.candidateId === intent.candidateId);
  if (prior !== undefined) return Object.freeze({ appended: false, receipt: Object.freeze(prior), target });
  const receipt = Object.freeze({
    type: "TurntideRoutineCandidateSubmissionReceipt",
    version: 1,
    id: ni(["routine-candidate-submit-receipt", intent.id, publicMessage.id]),
    candidateId: intent.candidateId,
    routineProposalId: intent.routineProposalId,
    proposer: intent.proposer,
    state: "proposed",
    authorityDomain: "turntide-governance",
    performedBy: "proposer-via-zelo-transport",
    publicMessage: Object.freeze({
      adapter: "discord",
      channelId: publicMessage.channelId,
      channelName: publicMessage.channelName ?? "governance-proposals",
      messageId: publicMessage.id,
    }),
    proposedAt: publicMessage.createdAt ?? new Date().toISOString(),
    bindingEffect: "routine-proposal-only",
    enactmentCreated: false,
    scheduleCreated: false,
  });
  await appendPrivateJsonl(target, receipt);
  return Object.freeze({ appended: true, receipt, target });
}
