#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { currentRun } from "@causeway-services/tti-rich-news-publication-operations/hourly-reporting-state";

const TTI_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const BEGIN_MARKER = "# BEGIN TTI CONTRACTED HOURLY NEWS";
export const END_MARKER = "# END TTI CONTRACTED HOURLY NEWS";
export const RETIRED_BEGIN_MARKER = "# BEGIN TTI STATE OF HARMONIOUS UNION HOURLY REPORTING";
export const RETIRED_END_MARKER = "# END TTI STATE OF HARMONIOUS UNION HOURLY REPORTING";

export function recurrencePaths(options = {}) {
  const root = options.ttiRoot ?? TTI_ROOT;
  return { runner: join(root, "lib/management/advance-hourly-news.mjs"), envFile: join(root, "src/apps/turntide-islands-discord-platform/.env"), lock: join(root, "data/runtime/hourly-news.lock"), log: join(root, "data/runtime/hourly-news.log") };
}
export function recurrenceBlock(options = {}) {
  const paths = recurrencePaths(options); const node = options.nodePath ?? process.execPath; const witnessJournal = options.witnessJournalAgentUrl ?? "http://127.0.0.1:19764/.well-known/agent-card.json";
  return `${BEGIN_MARKER}\n*/5 * * * * /usr/bin/env WITNESS_JOURNAL_RDF_AGENT=${witnessJournal} /usr/bin/flock -n ${paths.lock} ${node} --env-file=${paths.envFile} ${paths.runner} --live >> ${paths.log} 2>&1\n${END_MARKER}`;
}
function removeBlock(source, begin, end) {
  const begins = source.split(begin).length - 1; const ends = source.split(end).length - 1;
  if (begins !== ends || begins > 1) throw new Error(`recurrence marker set is malformed for ${begin}`);
  return begins ? source.replace(new RegExp(`${begin}[\\s\\S]*?${end}\\n?`, "u"), "") : source;
}
export function spliceRecurrence(existing, options = {}) {
  let without = removeBlock(existing, BEGIN_MARKER, END_MARKER); without = removeBlock(without, RETIRED_BEGIN_MARKER, RETIRED_END_MARKER).trimEnd();
  return `${without ? `${without}\n\n` : ""}${recurrenceBlock(options)}\n`;
}
export function stripRecurrence(existing) {
  return removeBlock(existing, BEGIN_MARKER, END_MARKER).trimEnd() + "\n";
}
export function recurrenceAdmission(records) {
  const succeeded = new Set(records.filter((row) => row?.type === "TTIDiscordPublicationReceipt" && row.status === "succeeded" && row.atomicMultipart === true).map((row) => row.edition));
  return succeeded.has("union") && succeeded.has("colonial") ? { type: "TTIHourlyNewsRecurrenceAdmission", witnessedEditions: [...succeeded].sort() } : { type: "TTIHourlyNewsRecurrenceRefusal", reason: "successful-live-union-and-colonial-publication-receipts-absent" };
}
export async function richPilotReceipts(ttiRoot = TTI_ROOT) {
  const roots = [
    join(ttiRoot, "services/state-of-harmonious-union-reporting-service/data"),
    join(ttiRoot, "data/news-editions/colonial"),
  ];
  return (await Promise.all(roots.map((root) => currentRun(root)))).map((run) => run?.publicationReceipt).filter(Boolean);
}
function currentCrontab(run) { const result = run("crontab", ["-l"], { encoding: "utf8" }); if (result.status === 0) return result.stdout; if (result.status === 1 && /no crontab/iu.test(result.stderr ?? "")) return ""; throw new Error(`crontab read failed with status ${result.status}`); }
export async function installRecurrence(options = {}) {
  const run = options.run ?? spawnSync; const records = options.records ?? await richPilotReceipts(options.ttiRoot ?? TTI_ROOT); const admission = recurrenceAdmission(records);
  if (admission.type.endsWith("Refusal")) return admission;
  const desired = spliceRecurrence(currentCrontab(run), options); const paths = recurrencePaths(options); mkdirSync(dirname(paths.lock), { recursive: true });
  const installed = run("crontab", ["-"], { encoding: "utf8", input: desired }); if (installed.status !== 0) return { type: "TTIHourlyNewsRecurrenceRefusal", reason: "crontab-install-failed", status: installed.status };
  const observed = currentCrontab(run); const valid = observed.includes(recurrenceBlock(options)) && !observed.includes(RETIRED_BEGIN_MARKER);
  return valid ? { type: "TTIHourlyNewsRecurrenceInstallationReceipt", status: "installed", schedule: "*/5 * * * *", behavior: "serialize two rich editions over the stable audio corpus; resume in-flight work and publish each complete edition atomically", retiredRecurrence: RETIRED_BEGIN_MARKER }
    : { type: "TTIHourlyNewsRecurrenceRefusal", reason: "installed-crontab-verification-failed" };
}
export function suspendRecurrence(options = {}) {
  const run = options.run ?? spawnSync; const existing = currentCrontab(run); const desired = stripRecurrence(existing);
  const installed = run("crontab", ["-"], { encoding: "utf8", input: desired });
  if (installed.status !== 0) return { type: "TTIHourlyNewsRecurrenceRefusal", reason: "crontab-suspension-failed", status: installed.status };
  const observed = currentCrontab(run);
  return !observed.includes(BEGIN_MARKER) ? { type: "TTIHourlyNewsRecurrenceSuspensionReceipt", status: "suspended", retainedUnrelatedBytes: desired.length }
    : { type: "TTIHourlyNewsRecurrenceRefusal", reason: "suspended-crontab-verification-failed" };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = process.argv.includes("--suspend") ? suspendRecurrence() : process.argv.includes("--install") ? installRecurrence() : { type: "TTIHourlyNewsRecurrenceDryRun", installed: false, block: recurrenceBlock(), paths: recurrencePaths() };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); if (result.type.endsWith("Refusal")) process.exitCode = 2;
}
