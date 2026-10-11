import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  recordRoutineCandidateIntake,
  routineCandidateObservation,
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
