#!/usr/bin/env node
/**
 * @skill listing-open-obligations
 * @verb-phrase listing open obligations
 * @closure-kind process
 * @description Reads the dispatch board and derives which dispatches are OPEN — a dispatch is open while its task's goal is unachieved, achievement derived by re-running the goal (make-a-task.js --verify), never read from any record. Given an office, reads only that office's board; given nothing, the whole board. Use at session start to learn what an office owes, and any time the question is what work is outstanding — the answer is executed, not remembered.
 *
 * @precondition every seated dispatch names a task that seats in the tasks pool
 * @precondition an office argument, when given, seats in a roster somewhere in the tree
 * @postcondition every dispatch on the queried board is reported exactly once, open or settled
 * @postcondition openness was derived by re-running each task's goal, and read from no record
 * @witness each dispatch queried, its task, its office, and the goal conditions still in the gap
 * @witness on contradiction, the dispatch whose task seats nowhere, named rather than skipped
 *
 * The board is the truth because nobody wrote it down.
 *
 * A dispatch record names a task and an office, and nothing else — no status,
 * no open key, no closed key. So the only way to know what is outstanding is
 * to ask the goals, and that is this script: for every dispatch (or every
 * dispatch to one office), re-run the dispatched task's goal and report the
 * dispatch OPEN where the goal is unachieved. Achievement is derived by
 * `make-a-task.js --verify` — the one derivation, called and never copied —
 * so this query and the witness's instrument can never disagree.
 *
 * Slower than reading a status field, on every occasion. That is the cost of
 * a board that cannot drift: a status field is the worker's memory of the
 * work, and this is the work, asked directly.
 *
 * ## Run it
 *
 * ```sh
 * node .../list-open-obligations.js                    # the whole board
 * node .../list-open-obligations.js <office>           # one office's board
 * node .../list-open-obligations.js --pool <enterprise>/dispatches --task-pool <enterprise>/tasks
 * ```
 *
 * `--pool` names the dispatch board and `--task-pool` the tasks pool the
 * derivation runs against — absent, both fall back to the emsenn enterprise's,
 * so a foreign enterprise's board names its own pools or reads the wrong ones.
 *
 * Output is JSON: every dispatch on the queried board, `open` (with the gap —
 * the goal conditions that did not settle) or `settled`. Exits 0 when the
 * query ran whole, 1 on a contradiction — a dispatch naming a task that
 * seats nowhere, or an office argument that seats in no roster.
 *
 * ## When NOT to use
 *
 * - Not to close a dispatch. Nothing closes a dispatch; the goal settling
 *   closes it, and this only reports that it has.
 * - Not as the worker's proof its own work is done. The same rule as
 *   --verify, whose readout this carries: a worker running it on itself
 *   proves nothing. Attestation belongs to attesting-a-work-product.
 * - Not to decide what to work first. The board is a board, not a queue;
 *   ordering the work is the incumbent's judgment at the board.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { dataDir, findUnit, readDataPool, resolveIdentifier } from "./resolve-an-identifier.js";

const HERE = dirname(fileURLToPath(import.meta.url));

// A goal condition must never read the board: the board readout re-runs every
// task's goal, so a condition that calls this instrument recurses — every open
// dispatch multiplies the swarm each generation. This fork-bombed the node on
// 2026-07-16. GOAL_DERIVATION is set by make-a-task's condition runner.
if (process.env.GOAL_DERIVATION) {
  process.stdout.write(JSON.stringify({ ok: false, error: "⊥ refusing to read the board inside a goal derivation — a condition that derives the board while the board derives conditions is a cycle" }) + "\n");
  process.exit(1);
}

if (process.argv.includes("--help")) {
  process.stdout.write(
    [
      "Usage:",
      "  node list-open-obligations.js                    # the whole board",
      "  node list-open-obligations.js <office>           # one office's board",
      "  node list-open-obligations.js --pool <enterprise>/dispatches --task-pool <enterprise>/tasks",
      "  node list-open-obligations.js --help",
      "",
      "Output is JSON: every dispatch on the queried board, open (with the gap)",
      "or settled. Exits 0 when the query ran whole, 1 on a contradiction.",
    ].join("\n") + "\n",
  );
  process.exit(0);
}

const REPO_ROOT = argValue("--root") ?? process.cwd();
const UNIT = join(REPO_ROOT, "lib/emsenn");
// Dispatches are write-once, so per the Chairperson's content/data/lib rule
// they seat as data/, a day-bucketed log — not one file per slug.
const DISPATCH_POOL = argValue("--pool") ?? dataDir(UNIT, "dispatches");
// The tasks pool the derivation runs against, passed through to make-a-task's
// --pool. Absent, make-a-task falls back to its own default — right for the
// emsenn enterprise, wrong for any other, so a foreign board names its pool.
const TASK_POOL = argValue("--task-pool");

const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/u;

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

function out(value, code = 0) {
  process.stdout.write(JSON.stringify(value, null, 2) + "\n");
  process.exit(code);
}

function die(message) {
  out({ ok: false, error: message }, 1);
}

// Walk from the asking point UP, testing <D>/<shape> at each D — the same
// resolution as project-a-skill.js's, because this script runs both flat in
// the pool and projected into a scripts/ directory two levels down.
function findUp(from, shape) {
  let d = from;
  for (;;) {
    const at = join(d, shape);
    if (existsSync(at)) return at;
    const up = dirname(d);
    if (up === d) return null;
    d = up;
  }
}

// Achievement is derived by make-a-task.js --verify — the one derivation,
// called and never copied, so this query and the witness's instrument can
// never disagree. Found flat in the pool, or in its projected seat.
//
// No make-a-task.js seats anywhere under 561-group at TTI — it is
// governance tooling that has not been vendored here. Until it is, every
// call through this function dies at the `!instrument` check below: the
// whole-board (and per-office) query is dormant, not broken, and vendoring
// the instrument is the fix, not inventing one in its place.
function verifier() {
  const beside = join(HERE, "make-a-task.js");
  if (existsSync(beside)) return beside;
  const pool = findUp(HERE, "lib/management/skills");
  if (pool) {
    for (const form of [join(pool, "make-a-task.js"), join(pool, "making-a-task/scripts/make-a-task.js")]) {
      if (existsSync(form)) return form;
    }
  }
  return null;
}

// An office seats where the shared law's NEAREST strategy finds it — the
// same form dispatch-a-task.js's own officeSeats uses. The GLOBAL strategy
// this function formerly used is refused by the resolver since the
// membrane hardening (ownership.json seats, 2026-07-17): a board is queried
// from one node, and the office must seat in that node's own roster rather
// than anywhere in the tree.
function officeSeats(id) {
  const unitRoot = findUnit(REPO_ROOT) ?? findUnit(HERE);
  if (!unitRoot) return [];
  const hit = resolveIdentifier(id, { kind: "offices", strategy: "nearest", from: unitRoot });
  return hit.ok ? hit.seats : [];
}

const FLAGS_TAKING_VALUE = new Set(["--root", "--pool", "--task-pool"]);
const positionals = [];
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg.startsWith("--")) {
    if (FLAGS_TAKING_VALUE.has(arg)) i++;
    continue;
  }
  positionals.push(arg);
}
const office = positionals[0];

if (office !== undefined) {
  if (!ID.test(office)) die(`office '${office}' is not kebab-case`);
  if (officeSeats(office).length === 0) {
    die(`office '${office}' seats in no roster — the board of an office that does not exist is not an empty board, it is a wrong question`);
  }
}

const instrument = verifier();
if (!instrument) die(`⊥ cannot find making-a-task at or above ${relative(REPO_ROOT, HERE) || "."} — achievement is derived by its --verify, and this query derives rather than remembers`);

const dispatches = readDataPool(DISPATCH_POOL, "dispatches").map((r) => r.record);

// A superseded task's dispatch never disappears from the log — data/ pools
// are write-once — so "no longer open" is derived the same way achievement
// already is: scan the tasks pool for any record whose own x-provenance
// points supersedes at this dispatch's task, exactly what supersede-a-task.js
// now stamps into the successor at creation instead of archiving the old
// record. A dispatch whose task was superseded is neither open nor settled
// work anymore — its successor's own dispatch answers for it instead.
const effectiveTaskPool = TASK_POOL ?? dataDir(UNIT, "tasks");
const supersededTaskIds = new Set(
  readDataPool(effectiveTaskPool, "tasks")
    .map((r) => r.record?.["x-provenance"]?.supersedes)
    .filter(Boolean),
);

const board = (office === undefined ? dispatches : dispatches.filter((d) => d.office === office))
  .filter((d) => !supersededTaskIds.has(d.task));

const open = [];
const settled = [];
for (const d of board) {
  const id = d.id;
  const r = spawnSync(
    process.execPath,
    [instrument, "--verify", d.task, "--root", REPO_ROOT, ...(TASK_POOL ? ["--pool", TASK_POOL] : [])],
    { encoding: "utf8" },
  );
  let verdict;
  try {
    verdict = JSON.parse(r.stdout);
  } catch {
    die(`⊥ make-a-task.js --verify ${d.task} returned nothing parseable: ${(r.stderr || r.stdout || "").trim()}`);
  }
  // A dispatch naming a task that seats nowhere is a contradiction between
  // the board and the pool — named, never skipped over to keep the readout tidy.
  if (verdict.ok === false && verdict.error) {
    die(`⊤ dispatch '${id}' names task '${d.task}', and verifying it failed: ${verdict.error}`);
  }
  const entry = { dispatch: id, task: d.task, office: d.office, discharges: verdict.discharges };
  if (verdict.achieved) settled.push(entry);
  else open.push({ ...entry, gap: verdict.gap });
}

out({
  ok: true,
  board: office ?? "the whole board",
  dispatches: board.length,
  open,
  settled,
});
