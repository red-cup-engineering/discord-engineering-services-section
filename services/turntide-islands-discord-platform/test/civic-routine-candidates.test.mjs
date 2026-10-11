import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  beginRoutineCandidateSubmission,
  completeRoutineCandidateSubmission,
  readRoutineCandidateSubmissionEvents,
  recordRoutineCandidateFieldUpdate,
  recordRoutineCandidateIntake,
  routineCandidateForAuthor,
  routineCandidateHandle,
  routineCandidateObservation,
  routineCandidateSubmitHandle,
  routineCandidateUpdateCommand,
  routineCandidatePublicText,
} from "../src/turntide-software-system/civic-routine-candidates.mjs";

test("routine candidate intake is append-only and dedupes one Discord source", async () => {
  const dataRoot = await mkdtemp(path.join(tmpdir(), "turntide-routine-candidates-"));
  const channel = { id: "channel-1", name: "question-quarry" };
  const message = {
    id: "message-1",
    authorId: "turntider-1",
    timestamp: "2026-10-03T19:30:00.000Z",
  };
  const observation = "people keep asking where a stalled research question should go next";
  const first = await recordRoutineCandidateIntake({
    dataRoot,
    channel,
    message,
    observation,
    missing: ["beneficiary", "actor"],
  });
  const second = await recordRoutineCandidateIntake({
    dataRoot,
    channel,
    message,
    observation,
    missing: ["beneficiary", "actor"],
  });

  assert.equal(first.appended, true);
  assert.equal(second.appended, false);
  assert.equal(first.record.id, second.record.id);
  assert.equal(first.record.state, "draft");
  assert.equal(first.record.status, "incomplete");
  assert.equal(first.record.bindingEffect, "none");
  assert.deepEqual(first.record.missing, ["beneficiary", "actor"]);
  assert.equal(first.record.source.messageId, "message-1");

  const lines = (await readFile(first.target, "utf8")).trim().split("\n");
  assert.equal(lines.length, 1);
  if (process.platform !== "win32") {
    const civicDir = await stat(path.dirname(first.target));
    const draftFile = await stat(first.target);
    assert.equal(civicDir.mode & 0o777, 0o700);
    assert.equal(draftFile.mode & 0o777, 0o600);
  }
});

test("routine candidate observation removes the explicit intake command and mention", () => {
  assert.equal(
    routineCandidateObservation("<@12345> please save this as a routine candidate: we keep losing the next actor on garden projects"),
    "we keep losing the next actor on garden projects",
  );
});


test("routine candidate refinement projects a complete author-owned draft", async () => {
  const dataRoot = await mkdtemp(path.join(tmpdir(), "turntide-routine-refine-"));
  const channel = { id: "channel-refine", name: "garden-grove" };
  const authorId = "turntider-routine";
  const first = await recordRoutineCandidateIntake({
    dataRoot,
    channel,
    message: { id: "routine-source", authorId, timestamp: "2026-10-03T21:40:00.000Z" },
    observation: "garden projects keep losing their next actor",
    missing: ["beneficiary", "triggerOrCadence", "actor", "output", "authorityBoundary", "failureMode", "retirementCondition"],
  });
  const handle = routineCandidateHandle(first.record);
  const fields = {
    beneficiary: "Garden Grove project participants",
    triggerOrCadence: "when a tracked project lacks an accepted next actor",
    actor: "zelo-civic-steward",
    output: "one owner/next-move/receiving-condition summary",
    authorityBoundary: "coordination only; Zelo cannot assign work nobody accepted",
    failureMode: "ownership or consent is ambiguous",
    retirementCondition: "the project closes or participants no longer need stewarded tracking",
  };
  let n = 0;
  for (const [field, value] of Object.entries(fields)) {
    await recordRoutineCandidateFieldUpdate({
      dataRoot,
      authorId,
      handle,
      message: { id: `routine-update-${n += 1}`, channelId: channel.id },
      field,
      value,
    });
  }
  const candidate = await routineCandidateForAuthor(dataRoot, authorId, handle);
  assert.equal(candidate.status, "complete");
  assert.deepEqual(candidate.missing, []);
  assert.equal(candidate.beneficiary, fields.beneficiary);
  await assert.rejects(
    recordRoutineCandidateFieldUpdate({
      dataRoot,
      authorId: "other-turntider",
      handle,
      message: { id: "wrong-author", channelId: channel.id },
      field: "actor",
      value: "someone else",
    }),
    /unavailable to this author/u,
  );
});

test("routine candidate refinement and submit commands are explicit", () => {
  assert.deepEqual(
    routineCandidateUpdateCommand("<@zelo> set routine candidate abc123 beneficiary: Garden Grove"),
    { handle: "abc123", field: "beneficiary", value: "Garden Grove" },
  );
  assert.deepEqual(
    routineCandidateUpdateCommand("refine routine candidate abc123 trigger or cadence: every Monday"),
    { handle: "abc123", field: "triggerOrCadence", value: "every Monday" },
  );
  assert.equal(routineCandidateSubmitHandle("<@zelo> submit routine candidate abc123"), "abc123");
  assert.equal(routineCandidateSubmitHandle("discuss routine candidate abc123"), null);
});

test("routine candidate submission is two-phase and creates no enactment or schedule", async () => {
  const dataRoot = await mkdtemp(path.join(tmpdir(), "turntide-routine-submit-"));
  const channel = { id: "channel-submit", name: "question-quarry" };
  const authorId = "turntider-submit-routine";
  const intake = await recordRoutineCandidateIntake({
    dataRoot,
    channel,
    message: { id: "routine-submit-source", authorId },
    observation: "research questions keep stalling without a next actor",
    missing: ["beneficiary", "triggerOrCadence", "actor", "output", "authorityBoundary", "failureMode", "retirementCondition"],
  });
  const handle = routineCandidateHandle(intake.record);
  const updates = [
    ["beneficiary", "Turntiders asking practical research questions"],
    ["triggerOrCadence", "when a tracked question stalls"],
    ["actor", "zelo-civic-steward"],
    ["output", "a bounded next-move classification"],
    ["authorityBoundary", "routing only; no fabricated answer or governance decision"],
    ["failureMode", "private material or insufficient context"],
    ["retirementCondition", "questions reliably reach a next actor without steward intervention"],
  ];
  let n = 0;
  for (const [field, value] of updates) {
    await recordRoutineCandidateFieldUpdate({
      dataRoot, authorId, handle,
      message: { id: `submit-routine-update-${n += 1}`, channelId: channel.id },
      field, value,
    });
  }

  const begin = await beginRoutineCandidateSubmission({
    dataRoot, authorId, handle,
    message: { id: "submit-routine-request", channelId: channel.id },
  });
  assert.equal(begin.state, "ready");
  assert.match(begin.content, /routine candidate — proposed, not enacted or scheduled/u);
  assert.match(begin.content, /State: proposed/u);
  const pending = await beginRoutineCandidateSubmission({
    dataRoot, authorId, handle,
    message: { id: "submit-routine-retry", channelId: channel.id },
  });
  assert.equal(pending.state, "pending");

  const done = await completeRoutineCandidateSubmission({
    dataRoot,
    intent: begin.intent,
    publicMessage: {
      id: "public-routine-proposal",
      channelId: "governance-proposals",
      channelName: "governance-proposals",
      createdAt: "2026-10-03T21:45:00.000Z",
    },
  });
  assert.equal(done.receipt.state, "proposed");
  assert.equal(done.receipt.bindingEffect, "routine-proposal-only");
  assert.equal(done.receipt.enactmentCreated, false);
  assert.equal(done.receipt.scheduleCreated, false);
  assert.equal((await readRoutineCandidateSubmissionEvents(dataRoot)).length, 2);

  const projected = await routineCandidateForAuthor(dataRoot, authorId, handle);
  assert.equal(projected.state, "proposed");
  assert.equal(projected.status, "submitted");
  assert.equal(projected.publicMessage.messageId, "public-routine-proposal");

  const replay = await beginRoutineCandidateSubmission({
    dataRoot, authorId, handle,
    message: { id: "submit-routine-replay", channelId: channel.id },
  });
  assert.equal(replay.state, "proposed");

  await assert.rejects(
    recordRoutineCandidateFieldUpdate({
      dataRoot, authorId, handle,
      message: { id: "late-routine-edit", channelId: channel.id },
      field: "output",
      value: "late mutation",
    }),
    /can no longer be edited/u,
  );
});

test("incomplete routine candidate cannot submit and overlong public carrier refuses", async () => {
  const dataRoot = await mkdtemp(path.join(tmpdir(), "turntide-routine-incomplete-"));
  const channel = { id: "channel-incomplete", name: "mainland" };
  const authorId = "turntider-incomplete-routine";
  const intake = await recordRoutineCandidateIntake({
    dataRoot, channel,
    message: { id: "incomplete-routine-source", authorId },
    observation: "projects keep stalling",
    missing: ["beneficiary"],
  });
  const begin = await beginRoutineCandidateSubmission({
    dataRoot, authorId,
    handle: routineCandidateHandle(intake.record),
    message: { id: "incomplete-routine-submit", channelId: channel.id },
  });
  assert.equal(begin.state, "incomplete");
  assert.equal((await readRoutineCandidateSubmissionEvents(dataRoot)).length, 0);

  assert.throws(() => routineCandidatePublicText({
    status: "complete",
    source: { authorId },
    observation: "x".repeat(2000),
    beneficiary: "b",
    triggerOrCadence: "t",
    actor: "a",
    output: "o",
    authorityBoundary: "boundary",
    failureMode: "failure",
    retirementCondition: "retire",
  }, "ni:///sha-256;example"), /too long/u);
});
