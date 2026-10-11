import { randomBytes } from "node:crypto";
import { access, appendFile, mkdir, open, readFile } from "node:fs/promises";
import path from "node:path";
import { sha256Base64Url } from "@red-cup-engineering/cryptographic-computer-data-engineering-services-section/integrity";

export function oneTimeSessionTokenDigest(token) {
  return `sha256:${sha256Base64Url(token)}`;
}

export async function appendOneTimeSessionRecord(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, `${JSON.stringify(value)}\n`, { encoding: "utf8", mode: 0o600 });
}

export async function issueOneTimeSession(input

) {
  const token = input.token ?? randomBytes(32).toString("base64url");
  if (token.length < 16 || token.length > 200) throw new Error("one-time session token must be a bounded high-entropy value");
  if (!Number.isFinite(Date.parse(input.record.expiresAt))) throw new Error("one-time session expiry must be an ISO timestamp");
  const record = Object.freeze({ ...input.record, tokenDigest: oneTimeSessionTokenDigest(token) });
  await appendOneTimeSessionRecord(input.file, record);
  return { token, record };
}

export async function inspectOneTimeSession(input

) {
  const now = input.now ?? new Date();
  const digest = oneTimeSessionTokenDigest(input.token);
  const rows = await readRows(input.file);
  const session = rows.find((row) => row["type"] === input.sessionType && row["tokenDigest"] === digest);
  if (session === undefined) return { accepted: false, reason: "unknown-session" };
  if (rows.some((row) => row["type"] === input.consumptionType && row["tokenDigest"] === digest)) return { accepted: false, reason: "session-already-consumed" };
  const claimExists = await access(claimPath(input.file, input.sessionType, digest)).then(() => true).catch((error) => error.code === "ENOENT" ? false : Promise.reject(error));
  if (claimExists) return { accepted: false, reason: "session-already-consumed" };
  if (Date.parse(session.expiresAt) <= now.getTime()) return { accepted: false, reason: "session-expired" };
  return { accepted: true, session };
}

export async function consumeOneTimeSession(input

) {
  const now = input.now ?? new Date();
  const digest = oneTimeSessionTokenDigest(input.token);
  const inspection = await inspectOneTimeSession({ ...input, now });
  if (!inspection.accepted || inspection.session === undefined) return inspection;
  const target = claimPath(input.file, input.sessionType, digest);
  await mkdir(path.dirname(target), { recursive: true });
  try {
    const claim = await open(target, "wx", 0o600);
    await claim.writeFile(`${JSON.stringify({ sessionType: input.sessionType, tokenDigest: digest, claimedAt: now.toISOString(), claimPayload: input.claimPayload ?? null })}\n`, "utf8");
    await claim.close();
  } catch (error) {
    if ((error).code === "EEXIST") return { accepted: false, reason: "session-already-consumed" };
    throw error;
  }
  await appendOneTimeSessionRecord(input.file, { type: input.consumptionType, version: 1, tokenDigest: digest, consumedAt: now.toISOString(), ...(input.consumption ?? {}) });
  return { accepted: true, session: inspection.session };
}

async function readRows(file) {
  const text = await readFile(file, "utf8").catch((error) => error.code === "ENOENT" ? "" : Promise.reject(error));
  return text.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
}

function claimPath(file, sessionType, digest) {
  const safe = `${sessionType}-${digest}`.replace(/[^a-zA-Z0-9_-]/gu, "_");
  return path.join(`${file}.claims`, `${safe}.claim`);
}
