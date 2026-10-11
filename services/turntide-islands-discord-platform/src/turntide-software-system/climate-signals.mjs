import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { env, publicTurntideDataPath } from "./env.mjs";

/**
 * One claim-state bundle's climate-relevant content, read from Turntide's own
 * signal store (written by signal-ingest.mts's real RSS fetches).
 */

/** Turntide's own public signal store directory, with an explicit deployment override. */
export function climateWireStoreDir(source = process.env) {
  return env("TTI_SIGNALS_STORE_DIR", source) ?? publicTurntideDataPath(source, "signals", "store");
}

/** Read every claim-state bundle in a wire store directory as a climate signal. Missing directory or unreadable file is skipped, not thrown. */
export async function readClimateSignals(storeDir) {
  let entries;
  try {
    entries = await readdir(storeDir);
  } catch (error) {
    if ((error).code === "ENOENT") return [];
    throw error;
  }
  const signals = [];
  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    try {
      const raw = JSON.parse(await readFile(path.join(storeDir, entry), "utf8"));
      const signal = signalFromBundle(raw);
      if (signal !== undefined) signals.push(signal);
    } catch {
      continue;
    }
  }
  return signals.sort((left, right) => right.asserted.localeCompare(left.asserted));
}

function signalFromBundle(raw) {
  if (raw === null || typeof raw !== "object") return undefined;
  const bundle = raw;
  const subject = bundle["subject"];
  const claims = bundle["claims"];
  if (typeof subject !== "string" || !Array.isArray(claims)) return undefined;
  const byPredicate = new Map();
  let witness;
  let asserted;
  for (const entry of claims) {
    if (entry === null || typeof entry !== "object") continue;
    const claim = entry;
    const id = claim["id"];
    if (typeof id === "string") byPredicate.set(id, claim);
    const provenance = claim["provenance"];
    if (witness === undefined && provenance !== null && typeof provenance === "object") {
      const candidate = (provenance)["witness"];
      if (typeof candidate === "string") witness = candidate;
    }
    const time = claim["time"];
    if (asserted === undefined && time !== null && typeof time === "object") {
      const candidate = (time)["asserted"];
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

function objectField(claim) {
  if (claim === undefined) return undefined;
  const proposition = claim["proposition"];
  if (proposition === null || typeof proposition !== "object") return undefined;
  const value = (proposition)["object"];
  return typeof value === "string" ? value : undefined;
}
