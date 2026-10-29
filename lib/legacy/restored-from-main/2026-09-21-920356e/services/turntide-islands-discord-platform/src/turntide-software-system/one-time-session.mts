import { createHash, randomBytes } from "node:crypto";
import { access, appendFile, mkdir, open, readFile } from "node:fs/promises";
import path from "node:path";

export interface OneTimeSessionRecord {
  readonly type: string;
  readonly tokenDigest: string;
  readonly expiresAt: string;
}

export function oneTimeSessionTokenDigest(token: string): string {
  return `sha256:${createHash("sha256").update(token).digest("base64url")}`;
}

export async function appendOneTimeSessionRecord(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, `${JSON.stringify(value)}\n`, { encoding: "utf8", mode: 0o600 });
}

export async function issueOneTimeSession<T extends Omit<OneTimeSessionRecord, "tokenDigest">>(input: Readonly<{
  file: string;
  record: T;
  token?: string;
}>): Promise<Readonly<{ token: string; record: T & Readonly<{ tokenDigest: string }> }>> {
  const token = input.token ?? randomBytes(32).toString("base64url");
  if (token.length < 16 || token.length > 200) throw new Error("one-time session token must be a bounded high-entropy value");
  if (!Number.isFinite(Date.parse(input.record.expiresAt))) throw new Error("one-time session expiry must be an ISO timestamp");
  const record = Object.freeze({ ...input.record, tokenDigest: oneTimeSessionTokenDigest(token) });
  await appendOneTimeSessionRecord(input.file, record);
  return { token, record };
}

export async function inspectOneTimeSession<T extends OneTimeSessionRecord>(input: Readonly<{
  token: string;
  file: string;
  sessionType: string;
  consumptionType: string;
  now?: Date;
}>): Promise<Readonly<{ accepted: boolean; reason?: "unknown-session" | "session-already-consumed" | "session-expired"; session?: T }>> {
  const now = input.now ?? new Date();
  const digest = oneTimeSessionTokenDigest(input.token);
  const rows = await readRows(input.file);
  const session = rows.find((row) => row["type"] === input.sessionType && row["tokenDigest"] === digest) as unknown as T | undefined;
  if (session === undefined) return { accepted: false, reason: "unknown-session" };
  if (rows.some((row) => row["type"] === input.consumptionType && row["tokenDigest"] === digest)) return { accepted: false, reason: "session-already-consumed" };
  const claimExists = await access(claimPath(input.file, input.sessionType, digest)).then(() => true).catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? false : Promise.reject(error));
  if (claimExists) return { accepted: false, reason: "session-already-consumed" };
  if (Date.parse(session.expiresAt) <= now.getTime()) return { accepted: false, reason: "session-expired" };
  return { accepted: true, session };
}

export async function consumeOneTimeSession<T extends OneTimeSessionRecord>(input: Readonly<{
  token: string;
  file: string;
  sessionType: string;
  consumptionType: string;
  now?: Date;
  claimPayload?: unknown;
  consumption?: Readonly<Record<string, unknown>>;
}>): Promise<Readonly<{ accepted: boolean; reason?: string; session?: T }>> {
  const now = input.now ?? new Date();
  const digest = oneTimeSessionTokenDigest(input.token);
  const inspection = await inspectOneTimeSession<T>({ ...input, now });
  if (!inspection.accepted || inspection.session === undefined) return inspection;
  const target = claimPath(input.file, input.sessionType, digest);
  await mkdir(path.dirname(target), { recursive: true });
  try {
    const claim = await open(target, "wx", 0o600);
    await claim.writeFile(`${JSON.stringify({ sessionType: input.sessionType, tokenDigest: digest, claimedAt: now.toISOString(), claimPayload: input.claimPayload ?? null })}\n`, "utf8");
    await claim.close();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return { accepted: false, reason: "session-already-consumed" };
    throw error;
  }
  await appendOneTimeSessionRecord(input.file, { type: input.consumptionType, version: 1, tokenDigest: digest, consumedAt: now.toISOString(), ...(input.consumption ?? {}) });
  return { accepted: true, session: inspection.session };
}

async function readRows(file: string): Promise<Record<string, unknown>[]> {
  const text = await readFile(file, "utf8").catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? "" : Promise.reject(error));
  return text.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>);
}

function claimPath(file: string, sessionType: string, digest: string): string {
  const safe = `${sessionType}-${digest}`.replace(/[^a-zA-Z0-9_-]/gu, "_");
  return path.join(`${file}.claims`, `${safe}.claim`);
}
