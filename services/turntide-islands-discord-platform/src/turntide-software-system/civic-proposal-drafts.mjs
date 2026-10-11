import { appendFile, chmod, mkdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const proposalFile = (dataRoot) => path.join(dataRoot, "civic", "proposal-drafts.jsonl");
const proposalEventFile = (dataRoot) => path.join(dataRoot, "civic", "proposal-draft-events.jsonl");
const proposalSubmissionFile = (dataRoot) => path.join(dataRoot, "civic", "proposal-submissions.jsonl");

const REQUIRED_FIELDS = Object.freeze([
  "proposer",
  "requestedAct",
  "affectedScope",
  "evidence",
  "authorityNeeded",
  "reversibility",
  "receivingCondition",
]);

const EDITABLE_LABELS = Object.freeze({
  "requested act": "requestedAct",
  "affected scope": "affectedScope",
  evidence: "evidence",
  "authority needed": "authorityNeeded",
  reversibility: "reversibility",
  "receiving condition": "receivingCondition",
});

function ni(value) {
  return `ni:///sha-256;${createHash("sha256").update(JSON.stringify(value)).digest("base64url")}`;
}

function proposalId(messageId, channelId, requestedAct) {
  return ni([messageId, channelId, requestedAct]);
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

export function proposalDraftRequestedAct(content) {
  return String(content ?? "")
    .replace(/<@!?\d+>/gu, " ")
    .replace(/\b(?:please\s+)?(?:save|record|draft|turn)\b[\s\S]*?\b(?:draft\s+)?proposal\b\s*[:\-]?/iu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function proposalDraftUpdateCommand(content) {
  const normalized = String(content ?? "").replace(/<@!?\d+>/gu, " ").replace(/\s+/gu, " ").trim();
  const match = /\b(?:set|update|refine)\s+proposal(?:\s+draft)?\s+(\S+)\s+(requested act|affected scope|evidence|authority needed|reversibility|receiving condition)\s*:\s*(.+)$/iu.exec(normalized);
  if (match === null) return null;
  const field = EDITABLE_LABELS[match[2].toLowerCase()];
  const value = match[3].trim();
  if (value.length === 0) return null;
  return Object.freeze({ handle: match[1], field, value });
}

export function proposalDraftSubmitHandle(content) {
  const normalized = String(content ?? "").replace(/<@!?\d+>/gu, " ").replace(/\s+/gu, " ").trim();
  return /\bsubmit\s+proposal(?:\s+draft)?\s+(\S+)\b/iu.exec(normalized)?.[1] ?? null;
}

export async function readProposalDraftIntake(dataRoot) {
  if (typeof dataRoot !== "string" || dataRoot.trim() === "") throw new TypeError("proposal draft intake requires dataRoot");
  const records = await readLines(proposalFile(dataRoot));
  return Object.freeze(records.map((record) => Object.freeze(record)));
}

export async function readProposalDraftEvents(dataRoot) {
  if (typeof dataRoot !== "string" || dataRoot.trim() === "") throw new TypeError("proposal draft events require dataRoot");
  const records = await readLines(proposalEventFile(dataRoot));
  return Object.freeze(records.map((record) => Object.freeze(record)));
}

export async function readProposalSubmissionEvents(dataRoot) {
  if (typeof dataRoot !== "string" || dataRoot.trim() === "") throw new TypeError("proposal submission events require dataRoot");
  const records = await readLines(proposalSubmissionFile(dataRoot));
  return Object.freeze(records.map((record) => Object.freeze(record)));
}

export function proposalDraftHandle(record) {
  const digest = String(record?.id ?? "").split(";").at(-1) ?? "";
  if (digest.length < 8) throw new TypeError("proposal draft has no stable content-addressed id");
  return digest.slice(0, 10);
}

function projectDraft(record, events, submissions) {
  const projected = { ...record };
  for (const event of events) {
    if (event.type !== "TurntideProposalDraftFieldUpdate" || event.draftId !== record.id) continue;
    projected[event.field] = event.value;
  }
  projected.missing = REQUIRED_FIELDS.filter((field) => !present(projected[field]));
  projected.status = projected.missing.length === 0 ? "complete" : "incomplete";

  const submission = submissions.filter((event) => event.draftId === record.id);
  const receipt = submission.findLast((event) => event.type === "TurntideProposalSubmissionReceipt");
  const intent = submission.findLast((event) => event.type === "TurntideProposalSubmissionIntent");
  if (receipt !== undefined) {
    projected.state = "proposed";
    projected.status = "submitted";
    projected.proposalId = receipt.proposalId;
    projected.publicMessage = receipt.publicMessage;
    projected.missing = [];
  } else if (intent !== undefined) {
    projected.status = "submission-pending";
    projected.proposalId = intent.proposalId;
  }
  return Object.freeze(projected);
}

async function allProjectedDrafts(dataRoot) {
  const [records, events, submissions] = await Promise.all([
    readProposalDraftIntake(dataRoot),
    readProposalDraftEvents(dataRoot),
    readProposalSubmissionEvents(dataRoot),
  ]);
  return records.map((record) => projectDraft(record, events, submissions));
}

export async function proposalDraftInboxForAuthor(dataRoot, authorId) {
  if (typeof authorId !== "string" || authorId.trim() === "") throw new TypeError("proposal draft inbox requires an author id");
  const records = await allProjectedDrafts(dataRoot);
  return Object.freeze(records
    .filter((record) => record.source?.authorId === authorId)
    .sort((left, right) => String(right.createdAt ?? "").localeCompare(String(left.createdAt ?? "")))
    .map((record) => Object.freeze({
      handle: proposalDraftHandle(record),
      id: record.id,
      state: record.state,
      status: record.status,
      channelName: record.source?.channelName ?? null,
      channelId: record.source?.channelId ?? null,
      messageId: record.source?.messageId ?? null,
      missing: Object.freeze([...(record.missing ?? [])]),
      proposalId: record.proposalId ?? null,
      publicMessage: record.publicMessage ?? null,
      createdAt: record.createdAt ?? null,
    })));
}

export async function proposalDraftForAuthor(dataRoot, authorId, handle) {
  if (typeof authorId !== "string" || authorId.trim() === "") throw new TypeError("proposal draft lookup requires an author id");
  if (typeof handle !== "string" || handle.trim() === "") throw new TypeError("proposal draft lookup requires a handle");
  const normalized = handle.trim();
  const records = (await allProjectedDrafts(dataRoot)).filter((record) =>
    record.source?.authorId === authorId
    && (record.id === normalized || proposalDraftHandle(record) === normalized));
  if (records.length > 1) throw new TypeError("proposal draft handle is ambiguous");
  return records[0] === undefined ? null : Object.freeze(records[0]);
}

export async function recordProposalDraftIntake({
  dataRoot,
  channel,
  message,
  requestedAct,
  missing = [],
}) {
  if (typeof dataRoot !== "string" || dataRoot.trim() === "") throw new TypeError("proposal draft intake requires dataRoot");
  if (typeof channel?.id !== "string" || typeof message?.id !== "string") throw new TypeError("proposal draft intake requires Discord channel/message ids");
  if (typeof requestedAct !== "string" || requestedAct.trim() === "") throw new TypeError("proposal draft intake requires a requested act");
  const normalized = requestedAct.trim();
  const id = proposalId(message.id, channel.id, normalized);
  const target = proposalFile(dataRoot);
  const existing = await readLines(target);
  const prior = existing.find((entry) => entry.id === id);
  if (prior) return Object.freeze({ appended: false, record: Object.freeze(prior), target });

  const record = Object.freeze({
    type: "TurntideProposalDraftIntake",
    version: 1,
    id,
    state: "draft-proposal",
    status: "incomplete",
    authorityDomain: "turntide-governance",
    bindingEffect: "draft-only",
    proposer: message.authorId ?? null,
    requestedAct: normalized,
    missing: Object.freeze([...missing]),
    source: Object.freeze({
      adapter: "discord",
      channelId: channel.id,
      channelName: channel.name ?? null,
      messageId: message.id,
      authorId: message.authorId ?? null,
    }),
    createdAt: message.timestamp ?? new Date().toISOString(),
    next: "The author or Zelo may refine the missing proposal fields. Moving draft-proposal → proposed remains a separate civic transition and creates no enactment.",
  });
  await appendPrivateJsonl(target, record);
  return Object.freeze({ appended: true, record, target });
}

export async function recordProposalDraftFieldUpdate({
  dataRoot,
  authorId,
  handle,
  message,
  field,
  value,
}) {
  if (!Object.values(EDITABLE_LABELS).includes(field)) throw new TypeError("proposal draft update names an unsupported field");
  if (!present(value)) throw new TypeError("proposal draft update requires a value");
  if (String(value).trim().length > 600) throw new RangeError("proposal draft field must be 600 characters or fewer");
  const draft = await proposalDraftForAuthor(dataRoot, authorId, handle);
  if (draft === null) throw new TypeError("proposal draft is unavailable to this author");
  if (draft.state === "proposed" || draft.status === "submission-pending") throw new TypeError("proposal draft can no longer be edited after submission begins");
  if (draft.source?.channelId !== message?.channelId) throw new TypeError("proposal draft updates must occur in the original channel");
  const normalized = String(value).trim();
  const event = Object.freeze({
    type: "TurntideProposalDraftFieldUpdate",
    version: 1,
    id: ni([draft.id, message?.id, field, normalized]),
    draftId: draft.id,
    authorId,
    field,
    value: normalized,
    sourceMessageId: message?.id ?? null,
    createdAt: message?.timestamp ?? new Date().toISOString(),
    bindingEffect: "draft-only",
  });
  const target = proposalEventFile(dataRoot);
  const existing = await readLines(target);
  const prior = existing.find((entry) => entry.id === event.id);
  if (prior === undefined) await appendPrivateJsonl(target, event);
  const projected = await proposalDraftForAuthor(dataRoot, authorId, draft.id);
  return Object.freeze({ appended: prior === undefined, event: Object.freeze(prior ?? event), draft: projected, target });
}

export function proposalPublicText(draft, proposalId) {
  if (draft?.status !== "complete" && draft?.state !== "proposed") throw new TypeError("only a complete proposal draft can be rendered for submission");
  const content = [
    "**Turntide proposal — proposed, not enacted**",
    `${proposalId}`,
    `Proposer: <@${draft.proposer}>`,
    `Requested act: ${draft.requestedAct}`,
    `Affected scope: ${draft.affectedScope}`,
    `Evidence: ${draft.evidence}`,
    `Authority needed: ${draft.authorityNeeded}`,
    `Reversibility: ${draft.reversibility}`,
    `Receiving condition: ${draft.receivingCondition}`,
    "",
    "State: proposed. This post places the act before Turntide governance; it does not enact, execute, or receive it.",
  ].join("\n");
  if (content.length > 1850) throw new RangeError("proposal is too long for one bounded Governance Rock post; shorten one or more fields before submission");
  return content;
}

export async function beginProposalSubmission({ dataRoot, authorId, handle, message }) {
  const draft = await proposalDraftForAuthor(dataRoot, authorId, handle);
  if (draft === null) throw new TypeError("proposal draft is unavailable to this author");
  if (draft.source?.channelId !== message?.channelId) throw new TypeError("proposal submission must be requested in the original channel");
  const target = proposalSubmissionFile(dataRoot);
  const events = await readLines(target);
  const receipt = events.findLast((event) => event.type === "TurntideProposalSubmissionReceipt" && event.draftId === draft.id);
  if (receipt !== undefined) return Object.freeze({ state: "proposed", draft, proposalId: receipt.proposalId, receipt: Object.freeze(receipt) });
  const prior = events.findLast((event) => event.type === "TurntideProposalSubmissionIntent" && event.draftId === draft.id);
  if (prior !== undefined) return Object.freeze({ state: "pending", draft, proposalId: prior.proposalId, intent: Object.freeze(prior) });
  if (draft.missing?.length > 0 || draft.status !== "complete") {
    return Object.freeze({ state: "incomplete", draft, missing: Object.freeze([...(draft.missing ?? [])]) });
  }
  const proposalId = ni(REQUIRED_FIELDS.map((field) => draft[field]));

  proposalPublicText(draft, proposalId);
  const intent = Object.freeze({
    type: "TurntideProposalSubmissionIntent",
    version: 1,
    id: ni(["proposal-submit-intent", draft.id, proposalId]),
    draftId: draft.id,
    proposalId,
    proposer: authorId,
    state: "submission-pending",
    authorityDomain: "turntide-governance",
    performedBy: "proposer-via-zelo-transport",
    sourceMessageId: message?.id ?? null,
    requestedAt: message?.timestamp ?? new Date().toISOString(),
    bindingEffect: "proposal-transition-request-only",
  });
  await appendPrivateJsonl(target, intent);
  return Object.freeze({ state: "ready", draft, proposalId, intent, content: proposalPublicText(draft, proposalId) });
}

export async function completeProposalSubmission({ dataRoot, intent, publicMessage }) {
  if (intent?.type !== "TurntideProposalSubmissionIntent") throw new TypeError("proposal submission completion requires an intent");
  if (typeof publicMessage?.id !== "string" || typeof publicMessage?.channelId !== "string") {
    throw new TypeError("proposal submission completion requires a public Discord message receipt");
  }
  const target = proposalSubmissionFile(dataRoot);
  const events = await readLines(target);
  const prior = events.findLast((event) => event.type === "TurntideProposalSubmissionReceipt" && event.draftId === intent.draftId);
  if (prior !== undefined) return Object.freeze({ appended: false, receipt: Object.freeze(prior), target });
  const receipt = Object.freeze({
    type: "TurntideProposalSubmissionReceipt",
    version: 1,
    id: ni(["proposal-submit-receipt", intent.id, publicMessage.id]),
    draftId: intent.draftId,
    proposalId: intent.proposalId,
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
    bindingEffect: "proposal-only",
    enactmentCreated: false,
  });
  await appendPrivateJsonl(target, receipt);
  return Object.freeze({ appended: true, receipt, target });
}
