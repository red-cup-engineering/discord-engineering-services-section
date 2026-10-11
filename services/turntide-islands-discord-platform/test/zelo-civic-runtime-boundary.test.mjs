import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { civicAnswerForMessage, shouldReply } from "../src/turntide-software-system/steward.mjs";
import { runCivicScheduledRoutines } from "../src/turntide-software-system/civic-scheduled-routines.mjs";
import { decisionProcedureWayfinding, explainTurntide, formatZelo, loadZeloCivicContext, orientTurntider } from "../src/turntide-software-system/zelo-civic-service.mjs";

// The enacted Zelo civic runtime record (causeway-services/turntide-islands-services-section,
// data/records/governance/zelo-civic-runtime.json, version 15) binds this delivery adapter to these rules.
const RUNTIME_RULES = Object.freeze({
  deliveryAdapterIsAuthority: false,
  runtimeMayExpandAuthority: false,
  runtimeMayInferVoteFromDiscord: false,
  runtimeMayCreateBindingActFromRehearsal: false,
  silenceWhenNoMaterialOutput: true,
});

// The civic kernel is this package's; the governance records it reads are Turntide's and come from
// TURNTIDE_PUBLIC_ROOT. Here that root is a small set of invented records, so the test can tell exactly
// what the real kernel answers and whether the adapter added anything on the way out.
const FIXTURE_ROOT = path.join(import.meta.dirname, "fixtures", "turntide-governance");

async function civicRoot(t) {
  const dataRoot = await mkdtemp(path.join(tmpdir(), "zelo-runtime-boundary-"));
  t.after(() => rm(dataRoot, { recursive: true, force: true }));
  return { source: { TURNTIDE_PUBLIC_ROOT: FIXTURE_ROOT, TTI_AGENT_DATA_ROOT: dataRoot }, dataRoot };
}

class RecordingTransport {
  constructor() { this.sent = []; }
  async createMessage(channelId, input) {
    this.sent.push({ channelId, content: input.content });
    return { id: `sent-${this.sent.length}` };
  }
}

const channel = (name) => ({ id: `channel-${name}`, name });

test("the delivery adapter relays the kernel's answer and adds no authority of its own", async (t) => {
  assert.equal(RUNTIME_RULES.deliveryAdapterIsAuthority, false);
  assert.equal(RUNTIME_RULES.runtimeMayExpandAuthority, false);
  const { source, dataRoot } = await civicRoot(t);
  const answer = await civicAnswerForMessage(channel("dock"), { id: "m1", authorId: "islander", content: "Zelo: what is Turntide?" }, source);
  const context = await loadZeloCivicContext(FIXTURE_ROOT);
  assert.equal(answer, formatZelo(explainTurntide(context)));
  assert.match(answer, /^Turntide has three useful layers/u);
  assert.deepEqual(await readdir(dataRoot), []);
});

test("Discord reactions, roles and mentions never become a vote or standing", async (t) => {
  assert.equal(RUNTIME_RULES.runtimeMayInferVoteFromDiscord, false);
  const { source, dataRoot } = await civicRoot(t);
  const place = channel("governance-discussion");
  const bare = { id: "m2", authorId: "islander", content: "Zelo: does this need a vote?" };
  const loud = {
    ...bare,
    id: "m3",
    reactions: [{ emoji: "👍", count: 40 }],
    memberRoles: ["governor", "islander"],
    mentionedUserIds: ["zelo-bot", "governor-1", "governor-2"],
  };
  const quiet = await civicAnswerForMessage(place, bare, source);
  assert.equal(await civicAnswerForMessage(place, loud, source), quiet);
  const context = await loadZeloCivicContext(FIXTURE_ROOT);
  assert.equal(quiet, formatZelo(decisionProcedureWayfinding(context, { kind: "ordinary-governance-act" })));
  assert.match(quiet, /Fixture ordinary act/u);
  assert.match(quiet, /Numeric voting weights currently established: no/u);
  assert.deepEqual(await readdir(dataRoot), []);
});

test("a rehearsal leaves no binding act behind", async (t) => {
  assert.equal(RUNTIME_RULES.runtimeMayCreateBindingActFromRehearsal, false);
  const { source, dataRoot } = await civicRoot(t);
  const answer = await civicAnswerForMessage(channel("governance-proposals"), {
    id: "m4", authorId: "islander", content: "Zelo, walk me through this governance change as a dry run",
  }, source);
  const context = await loadZeloCivicContext(FIXTURE_ROOT);
  assert.equal(answer, formatZelo(orientTurntider(context)));
  assert.doesNotMatch(answer, /\benacted\b|\bexecuted\b/u);
  assert.deepEqual(await readdir(dataRoot), []);
});

test("scheduled civic review is silent when the kernel has no material output", async (t) => {
  assert.equal(RUNTIME_RULES.silenceWhenNoMaterialOutput, true);
  const { source, dataRoot } = await civicRoot(t);
  const transport = new RecordingTransport();
  const channels = [channel("governance-action"), channel("governance-questions"), channel("governance-discussion")];
  const baseline = await runCivicScheduledRoutines({ transport, channels, source, dataRoot, now: "2026-10-10T12:00:00.000Z" });
  const quiet = await runCivicScheduledRoutines({ transport, channels, source, dataRoot, now: "2026-10-10T13:00:00.000Z" });
  assert.deepEqual(baseline.outputs, []);
  assert.deepEqual(quiet.outputs, []);
  assert.deepEqual(transport.sent, []);
  assert.deepEqual(quiet.deliveries, []);
});

test("scheduled civic review delivers the kernel's output as written", async (t) => {
  const content = "Decision/action reconciliation found 1 unsettled governance act(s): fixture-act-unexecuted [not-started] → name or confirm the authorized executor and execution receipt";
  const { source, dataRoot } = await civicRoot(t);
  const transport = new RecordingTransport();
  const channels = [channel("governance-action")];
  await runCivicScheduledRoutines({ transport, channels, source, dataRoot, now: "2026-10-10T12:00:00.000Z" });
  const due = await runCivicScheduledRoutines({ transport, channels, source, dataRoot, now: "2026-10-11T12:00:00.000Z" });
  assert.deepEqual(due.outputs.map((output) => output.content), [content]);
  assert.deepEqual(transport.sent, [{ channelId: "channel-governance-action", content }]);
});

test("the runtime record the kernel loads carries the same five rules", async () => {
  const context = await loadZeloCivicContext(FIXTURE_ROOT);
  assert.deepEqual({ ...context.runtime.rules }, RUNTIME_RULES);
});

test("Zelo answers a mention anywhere and its name only in the civic places", () => {
  assert.equal(shouldReply("<@zelo-bot> hello", "zelo-bot", "general"), true);
  assert.equal(shouldReply("Zelo: what can I actually do here?", "zelo-bot", "governance-questions"), true);
  assert.equal(shouldReply("zelo, walk me through it", "zelo-bot", "dock"), true);
  assert.equal(shouldReply("Zelo: hello", "zelo-bot", "general"), false);
  assert.equal(shouldReply("I wonder how proposals work", "zelo-bot", "governance-questions"), false);
  assert.equal(shouldReply("zeloto is a word", "zelo-bot", "governance-questions"), false);
  assert.equal(shouldReply("Zelo: hello", "zelo-bot"), false);
});
