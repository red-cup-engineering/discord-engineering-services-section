import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { env, publicTurntideDataPath, type EnvMap } from "./env.mts";

/**
 * One claim-state bundle's climate-relevant content, read from Turntide's own
 * signal store (written by signal-ingest.mts's real RSS fetches).
 */
export interface ClimateSignal {
  readonly subject: string;
  readonly title: string;
  readonly summary?: string;
  readonly url?: string;
  readonly published?: string;
  readonly witness: string;
  readonly asserted: string;
}

/** Turntide's own public signal store directory, with an explicit deployment override. */
export function climateWireStoreDir(source: EnvMap = process.env): string {
  return env("TTI_SIGNALS_STORE_DIR", source) ?? publicTurntideDataPath(source, "signals", "store");
}

/** Read every claim-state bundle in a wire store directory as a climate signal. Missing directory or unreadable file is skipped, not thrown. */
export async function readClimateSignals(storeDir: string): Promise<readonly ClimateSignal[]> {
  let entries: readonly string[];
  try {
    entries = await readdir(storeDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const signals: ClimateSignal[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    try {
      const raw = JSON.parse(await readFile(path.join(storeDir, entry), "utf8")) as unknown;
      const signal = signalFromBundle(raw);
      if (signal !== undefined) signals.push(signal);
    } catch {
      continue;
    }
  }
  return signals.sort((left, right) => right.asserted.localeCompare(left.asserted));
}

function signalFromBundle(raw: unknown): ClimateSignal | undefined {
  if (raw === null || typeof raw !== "object") return undefined;
  const bundle = raw as Record<string, unknown>;
  const subject = bundle["subject"];
  const claims = bundle["claims"];
  if (typeof subject !== "string" || !Array.isArray(claims)) return undefined;
  const byPredicate = new Map<string, Record<string, unknown>>();
  let witness: string | undefined;
  let asserted: string | undefined;
  for (const entry of claims) {
    if (entry === null || typeof entry !== "object") continue;
    const claim = entry as Record<string, unknown>;
    const id = claim["id"];
    if (typeof id === "string") byPredicate.set(id, claim);
    const provenance = claim["provenance"];
    if (witness === undefined && provenance !== null && typeof provenance === "object") {
      const candidate = (provenance as Record<string, unknown>)["witness"];
      if (typeof candidate === "string") witness = candidate;
    }
    const time = claim["time"];
    if (asserted === undefined && time !== null && typeof time === "object") {
      const candidate = (time as Record<string, unknown>)["asserted"];
      if (typeof candidate === "string") asserted = candidate;
    }
  }
  const title = objectField(byPredicate.get("title"));
  if (title === undefined || witness === undefined || asserted === undefined) return undefined;
  return Object.freeze({
    subject,
    title,
    summary: objectField(byPredicate.get("summary")),
    url: objectField(byPredicate.get("url")),
    published: objectField(byPredicate.get("published")),
    witness,
    asserted,
  });
}

function objectField(claim: Record<string, unknown> | undefined): string | undefined {
  if (claim === undefined) return undefined;
  const proposition = claim["proposition"];
  if (proposition === null || typeof proposition !== "object") return undefined;
  const value = (proposition as Record<string, unknown>)["object"];
  return typeof value === "string" ? value : undefined;
}
