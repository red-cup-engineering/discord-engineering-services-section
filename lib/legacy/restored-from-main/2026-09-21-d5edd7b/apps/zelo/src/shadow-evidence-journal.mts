import { createHash } from "node:crypto";
import { chmod, mkdir, open, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { validateCommunityConfigurationReconciliation, type CommunityConfigurationReconciliation, type ReconciliationOptions } from "./reconciliation.mjs";

export interface ZeloShadowEvidenceEntry { readonly type: "ZeloShadowEvidenceEntry"; readonly version: 1; readonly sequence: number; readonly recordedAt: string; readonly previousHash: string | null; readonly reconciliation: CommunityConfigurationReconciliation; readonly hash: string; }
export interface ShadowEvidenceOptions extends ReconciliationOptions { readonly maxFutureMs?: number; }
const stable = (value: unknown): string => Array.isArray(value) ? `[${value.map(stable).join(",")}]` : value !== null && typeof value === "object" ? `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([name, item]) => `${JSON.stringify(name)}:${stable(item)}`).join(",")}}` : JSON.stringify(value);
const entryHash = (entry: Omit<ZeloShadowEvidenceEntry, "hash">): string => createHash("sha256").update(stable(entry)).digest("hex");
const instant = (value: string, label: string): string => { if (!Number.isFinite(Date.parse(value))) throw new TypeError(`${label} must be an ISO timestamp`); return new Date(value).toISOString(); };
async function assertPrivateFile(file: string): Promise<void> {
  try { const mode = (await stat(file)).mode & 0o777; if (mode !== 0o600) throw new Error(`shadow evidence journal must have mode 0600; found ${mode.toString(8)}`); } catch (error: unknown) { if ((error as { code?: string }).code !== "ENOENT") throw error; }
}
export function validateZeloShadowEvidence(entries: readonly ZeloShadowEvidenceEntry[], options: ShadowEvidenceOptions = {}): readonly ZeloShadowEvidenceEntry[] {
  const now = options.now ?? new Date(), maxFuture = options.maxFutureMs ?? 5_000; if (!Number.isFinite(maxFuture) || maxFuture < 0) throw new TypeError("maxFutureMs must be nonnegative");
  let previousHash: string | null = null, previousAt = -Infinity;
  return Object.freeze(entries.map((entry, index) => {
    if (entry === null || typeof entry !== "object" || Object.getPrototypeOf(entry) !== Object.prototype || entry.type !== "ZeloShadowEvidenceEntry" || entry.version !== 1 || entry.sequence !== index + 1 || entry.previousHash !== previousHash) throw new TypeError(`shadow evidence chain is structurally invalid at sequence ${index + 1}`);
    const recordedAt = instant(entry.recordedAt, "recordedAt"), recordedMs = Date.parse(recordedAt);
    if (recordedMs < previousAt || recordedMs > now.getTime() + maxFuture) throw new TypeError(`shadow evidence chronology is invalid at sequence ${index + 1}`);
    const reconciliation = validateCommunityConfigurationReconciliation(entry.reconciliation, options), bare = { type: entry.type, version: entry.version, sequence: entry.sequence, recordedAt, previousHash: entry.previousHash, reconciliation };
    if (recordedMs < Date.parse(reconciliation.observedAt)) throw new TypeError(`shadow evidence precedes its observation at sequence ${index + 1}`);
    if (entry.hash !== entryHash(bare)) throw new TypeError(`shadow evidence chain hash mismatch at sequence ${index + 1}`);
    previousHash = entry.hash; previousAt = recordedMs; return Object.freeze({ ...bare, hash: entry.hash });
  }));
}
export function parseZeloShadowEvidenceLines(text: string, options: ShadowEvidenceOptions = {}): readonly ZeloShadowEvidenceEntry[] {
  const entries = text.split(/\r?\n/u).filter(Boolean).map((line, index) => { try { return JSON.parse(line) as ZeloShadowEvidenceEntry; } catch { throw new TypeError(`shadow evidence journal contains malformed JSON at line ${index + 1}`); } });
  return validateZeloShadowEvidence(entries, options);
}
export async function readZeloShadowEvidence(file: string, options: ShadowEvidenceOptions = {}): Promise<readonly ZeloShadowEvidenceEntry[]> {
  try {
    await assertPrivateFile(file);
    return parseZeloShadowEvidenceLines(await readFile(file, "utf8"), options);
  } catch (error: unknown) { if ((error as { code?: string }).code === "ENOENT") return Object.freeze([]); throw error; }
}
export function createZeloShadowEvidenceEntry(entries: readonly ZeloShadowEvidenceEntry[], input: CommunityConfigurationReconciliation, recordedAt: string, options: ShadowEvidenceOptions = {}): ZeloShadowEvidenceEntry {
  const normalizedAt = instant(recordedAt, "recordedAt"), now = options.now ?? new Date(); if (Date.parse(normalizedAt) > now.getTime() + (options.maxFutureMs ?? 5_000)) throw new TypeError("recordedAt is in the future");
  const reconciliation = validateCommunityConfigurationReconciliation(input, options), verified = validateZeloShadowEvidence(entries, options), prior = verified.at(-1);
  if (prior !== undefined && Date.parse(normalizedAt) < Date.parse(prior.recordedAt)) throw new TypeError("recordedAt moves backward");
  const bare = { type: "ZeloShadowEvidenceEntry" as const, version: 1 as const, sequence: verified.length + 1, recordedAt: normalizedAt, previousHash: prior?.hash ?? null, reconciliation };
  return Object.freeze({ ...bare, hash: entryHash(bare) });
}
export async function appendZeloShadowEvidence(file: string, input: CommunityConfigurationReconciliation, recordedAt: string, options: ShadowEvidenceOptions = {}): Promise<ZeloShadowEvidenceEntry> {
  const entry = createZeloShadowEvidenceEntry(await readZeloShadowEvidence(file, options), input, recordedAt, options);
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 }); await assertPrivateFile(file);
  const handle = await open(file, "a", 0o600);
  try { await handle.chmod(0o600); await handle.appendFile(`${JSON.stringify(entry)}\n`); await handle.sync(); }
  finally { await handle.close(); }
  await chmod(file, 0o600); await assertPrivateFile(file);
  return entry;
}
