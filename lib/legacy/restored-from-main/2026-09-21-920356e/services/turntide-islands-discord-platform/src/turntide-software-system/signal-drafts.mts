import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { env, publicTurntideDataPath, type EnvMap } from "./env.mts";
import type { ClimateSignal } from "./climate-signals.mts";

export function signalDraftsFile(source: EnvMap = process.env): string {
  return env("TTI_SIGNAL_DRAFTS_FILE", source) ?? publicTurntideDataPath(source, "signals", "drafts.jsonl");
}

export type DraftStatus = "pending" | "approved" | "rejected";

export interface SignalDraft {
  readonly id: string;
  readonly subject: string;
  readonly channelHint: string;
  readonly content: string;
  readonly sourceUrl?: string;
  readonly witness: string;
  readonly generatedAt: string;
  readonly status: DraftStatus;
  readonly updatedAt: string;
}

/**
 * Compose an injectable Discord message from a real signal. Nothing here is
 * invented: the title, summary, and url are the signal's own; this only
 * strips wire HTML and frames it in Zelo's voice. This produces a draft, not
 * a post — the caller decides whether and when it ever reaches a channel.
 */
export function draftMessageFromSignal(signal: ClimateSignal): string {
  const summary = signal.summary === undefined ? undefined : truncate(stripHtml(signal.summary), 400);
  return [
    `zelo's reading the wire (${signal.witness}): ${signal.title}`,
    summary,
    signal.url,
  ].filter((line): line is string => line !== undefined && line.length > 0).join("\n");
}

export function draftFromSignal(signal: ClimateSignal, channelHint: string): SignalDraft {
  const now = new Date().toISOString();
  return Object.freeze({
    id: `draft-${signal.subject}`,
    subject: signal.subject,
    channelHint,
    content: draftMessageFromSignal(signal),
    sourceUrl: signal.url,
    witness: signal.witness,
    generatedAt: now,
    status: "pending" as const,
    updatedAt: now,
  });
}

export async function readSignalDrafts(file: string): Promise<readonly SignalDraft[]> {
  try {
    const lines = (await readFile(file, "utf8")).split("\n").filter((line) => line.trim().length > 0);
    return Object.freeze(lines.map((line) => JSON.parse(line) as SignalDraft));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function recordSignalDraft(file: string, draft: SignalDraft): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, `${JSON.stringify(draft)}\n`);
}

/** The append-only log's current view: the latest record per draft id. */
export function latestDraftsById(drafts: readonly SignalDraft[]): readonly SignalDraft[] {
  const byId = new Map<string, SignalDraft>();
  for (const draft of drafts) {
    const previous = byId.get(draft.id);
    if (previous === undefined || previous.updatedAt <= draft.updatedAt) byId.set(draft.id, draft);
  }
  return Object.freeze([...byId.values()]);
}

/** Every signal that doesn't have a draft yet, most recent first. */
export function undraftedSignals(signals: readonly ClimateSignal[], drafts: readonly SignalDraft[]): readonly ClimateSignal[] {
  const drafted = new Set(drafts.map((draft) => draft.subject));
  return signals.filter((signal) => !drafted.has(signal.subject));
}

/** The most recent signal not already drafted, or `undefined` if every candidate has one. */
export function nextUndraftedSignal(signals: readonly ClimateSignal[], drafts: readonly SignalDraft[]): ClimateSignal | undefined {
  return undraftedSignals(signals, drafts)[0];
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/gu, " ").replace(/&nbsp;/gu, " ").replace(/&amp;/gu, "&").replace(/&#8217;/gu, "'").replace(/\s+/gu, " ").trim();
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength).trimEnd()}…`;
}
