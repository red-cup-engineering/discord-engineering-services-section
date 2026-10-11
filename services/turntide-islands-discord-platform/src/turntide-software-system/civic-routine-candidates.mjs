import { appendFile, chmod, mkdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const candidateFile = (dataRoot) => path.join(dataRoot, "civic", "routine-candidates.jsonl");

function candidateId(messageId, channelId, observation) {
  const digest = createHash("sha256")
    .update(JSON.stringify([messageId, channelId, observation]))
    .digest("base64url");
  return `ni:///sha-256;${digest}`;
}

function parseLines(text) {
  return text.split(/\r?\n/u)
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line));
}

export function routineCandidateObservation(content) {
  return String(content ?? "")
    .replace(/<@!?\d+>/gu, " ")
    .replace(/\b(?:please\s+)?(?:save|record|draft|turn)\b[\s\S]*?\broutine candidate\b\s*[:\-]?/iu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export async function readRoutineCandidateIntake(dataRoot) {
  if (typeof dataRoot !== "string" || dataRoot.trim() === "") throw new TypeError("routine candidate intake requires dataRoot");
  const target = candidateFile(dataRoot);
  const records = await readFile(target, "utf8").then(parseLines).catch((error) => {
    if (error?.code === "ENOENT") return [];
    throw error;
  });
  return Object.freeze(records.map((record) => Object.freeze(record)));
}

export function routineCandidateHandle(record) {
  const digest = String(record?.id ?? "").split(";").at(-1) ?? "";
  if (digest.length < 8) throw new TypeError("routine candidate has no stable content-addressed id");
  return digest.slice(0, 10);
}

export async function routineCandidateInboxForAuthor(dataRoot, authorId) {
  if (typeof authorId !== "string" || authorId.trim() === "") throw new TypeError("routine candidate inbox requires an author id");
  const records = await readRoutineCandidateIntake(dataRoot);
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
      createdAt: record.createdAt ?? null,
    })));
}

export async function routineCandidateForAuthor(dataRoot, authorId, handle) {
  if (typeof authorId !== "string" || authorId.trim() === "") throw new TypeError("routine candidate lookup requires an author id");
  if (typeof handle !== "string" || handle.trim() === "") throw new TypeError("routine candidate lookup requires a handle");
  const normalized = handle.trim();
  const records = (await readRoutineCandidateIntake(dataRoot)).filter((record) =>
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
  const existing = await readFile(target, "utf8").then(parseLines).catch((error) => {
    if (error?.code === "ENOENT") return [];
    throw error;
  });
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
    missing: Object.freeze([...missing]),
    source: Object.freeze({
      adapter: "discord",
      channelId: channel.id,
      channelName: channel.name ?? null,
      messageId: message.id,
      authorId: message.authorId ?? null,
    }),
    createdAt: message.timestamp ?? new Date().toISOString(),
    next: "A participant or Zelo may refine the missing routine fields; proposing or enacting remains a separate civic transition.",
  });
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  await chmod(path.dirname(target), 0o700);
  await appendFile(target, `${JSON.stringify(record)}\n`, { mode: 0o600 });
  await chmod(target, 0o600);
  return Object.freeze({ appended: true, record, target });
}
