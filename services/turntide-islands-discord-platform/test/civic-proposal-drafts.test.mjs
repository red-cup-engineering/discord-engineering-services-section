import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  beginProposalSubmission,
  completeProposalSubmission,
  proposalDraftForAuthor,
  proposalDraftHandle,
  proposalDraftInboxForAuthor,
  proposalDraftRequestedAct,
  proposalDraftSubmitHandle,
  proposalDraftUpdateCommand,
  proposalPublicText,
  readProposalDraftIntake,
  readProposalSubmissionEvents,
  recordProposalDraftFieldUpdate,
  recordProposalDraftIntake,
} from "../src/turntide-software-system/civic-proposal-drafts.mjs";

test("proposal draft intake is append-only, author-scoped, and dedupes one Discord source", async () => {
  const dataRoot = await mkdtemp(path.join(tmpdir(), "turntide-proposal-draft-"));
  const channel = { id: "governance-discussion-1", name: "governance-discussion" };
  const message = { id: "message-proposal-1", authorId: "turntider-a", timestamp: "2026-10-03T20:40:00.000Z" };
  const requestedAct = "create a weekly public garden workboard";

  const first = await recordProposalDraftIntake({
    dataRoot, channel, message, requestedAct,
    missing: ["affectedScope", "evidence", "authorityNeeded", "reversibility", "receivingCondition"],
  });
  const second = await recordProposalDraftIntake({
    dataRoot, channel, message, requestedAct,
    missing: ["affectedScope", "evidence", "authorityNeeded", "reversibility", "receivingCondition"],
  });
  assert.equal(first.appended, true);
  assert.equal(second.appended, false);

  const records = await readProposalDraftIntake(dataRoot);
  assert.equal(records.length, 1);
  assert.equal(records[0].state, "draft-proposal");
  assert.equal(records[0].bindingEffect, "draft-only");
  assert.equal(records[0].proposer, "turntider-a");
  assert.equal(records[0].requestedAct, requestedAct);

  const mine = await proposalDraftInboxForAuthor(dataRoot, "turntider-a");
  const other = await proposalDraftInboxForAuthor(dataRoot, "turntider-b");
  assert.equal(mine.length, 1);
  assert.equal(other.length, 0);
  assert.equal(Object.hasOwn(mine[0], "requestedAct"), false);

  const found = await proposalDraftForAuthor(dataRoot, "turntider-a", mine[0].handle);
  assert.equal(found.id, records[0].id);
  assert.equal(await proposalDraftForAuthor(dataRoot, "turntider-b", mine[0].handle), null);
});

test("proposal request parser strips the explicit Zelo command instead of treating it as the requested act", () => {
  assert.equal(
    proposalDraftRequestedAct("<@12345> please save this as a draft proposal: create a weekly public garden workboard"),
    "create a weekly public garden workboard",
  );
  assert.equal(
    proposalDraftRequestedAct("<@12345> draft proposal - publish governance receipts after every received act"),
    "publish governance receipts after every received act",
  );
});


test("proposal draft fields refine append-only and completeness is projected", async () => {
  const dataRoot = await mkdtemp(path.join(tmpdir(), "turntide-proposal-refine-"));
  const channel = { id: "governance-discussion-refine", name: "governance-discussion" };
  const authorId = "turntider-refine";
  const sourceMessage = { id: "proposal-refine-source", authorId, timestamp: "2026-10-03T21:10:00.000Z" };
  const first = await recordProposalDraftIntake({
    dataRoot,
    channel,
    message: sourceMessage,
    requestedAct: "create a weekly public garden workboard",
    missing: ["affectedScope", "evidence", "authorityNeeded", "reversibility", "receivingCondition"],
  });
  const handle = proposalDraftHandle(first.record);
  const updates = {
    affectedScope: "Garden Grove project coordination",
    evidence: "three work sessions each required manual owner and next-step reconstruction",
    authorityNeeded: "Turntide governance approval to admit the public workboard",
    reversibility: "retire it by a later governance act",
    receivingCondition: "the workboard exists and a civic receipt identifies its owner and retirement path",
  };
  let sequence = 0;
  for (const [field, value] of Object.entries(updates)) {
    await recordProposalDraftFieldUpdate({
      dataRoot,
      authorId,
      handle,
      message: { id: `proposal-update-${sequence += 1}`, channelId: channel.id, timestamp: "2026-10-03T21:11:00.000Z" },
      field,
      value,
    });
  }
  const projected = await proposalDraftForAuthor(dataRoot, authorId, handle);
  assert.equal(projected.status, "complete");
  assert.deepEqual(projected.missing, []);
  assert.equal(projected.affectedScope, updates.affectedScope);
  const inbox = await proposalDraftInboxForAuthor(dataRoot, authorId);
  assert.equal(inbox[0].status, "complete");
  assert.deepEqual(inbox[0].missing, []);

  await assert.rejects(
    recordProposalDraftFieldUpdate({
      dataRoot,
      authorId: "turntider-other",
      handle,
      message: { id: "other-update", channelId: channel.id },
      field: "evidence",
      value: "nope",
    }),
    /unavailable to this author/u,
  );
});

test("proposal refinement and submit commands are explicit and bounded", () => {
  assert.deepEqual(
    proposalDraftUpdateCommand("<@123> set proposal abc123 affected scope: Garden Grove"),
    { handle: "abc123", field: "affectedScope", value: "Garden Grove" },
  );
  assert.deepEqual(
    proposalDraftUpdateCommand("refine proposal abc123 receiving condition: a public receipt exists"),
    { handle: "abc123", field: "receivingCondition", value: "a public receipt exists" },
  );
  assert.equal(proposalDraftSubmitHandle("<@123> submit proposal abc123"), "abc123");
  assert.equal(proposalDraftSubmitHandle("talk about proposal abc123"), null);
});

test("proposal submission is two-phase, content-addressed, and cannot silently become enactment", async () => {
  const dataRoot = await mkdtemp(path.join(tmpdir(), "turntide-proposal-submit-"));
  const channel = { id: "governance-discussion-submit", name: "governance-discussion" };
  const authorId = "turntider-submit";
  const intake = await recordProposalDraftIntake({
    dataRoot,
    channel,
    message: { id: "submit-source", authorId, timestamp: "2026-10-03T21:20:00.000Z" },
    requestedAct: "create a weekly public garden workboard",
    missing: ["affectedScope", "evidence", "authorityNeeded", "reversibility", "receivingCondition"],
  });
  const handle = proposalDraftHandle(intake.record);
  const values = [
    ["affectedScope", "Garden Grove project coordination"],
    ["evidence", "three repeated coordination failures"],
    ["authorityNeeded", "Turntide governance approval"],
    ["reversibility", "retire by a later governing act"],
    ["receivingCondition", "public workboard and received civic receipt exist"],
  ];
  let index = 0;
  for (const [field, value] of values) {
    await recordProposalDraftFieldUpdate({
      dataRoot,
      authorId,
      handle,
      message: { id: `submit-update-${index += 1}`, channelId: channel.id },
      field,
      value,
    });
  }

  const begin = await beginProposalSubmission({
    dataRoot,
    authorId,
    handle,
    message: { id: "submit-request", channelId: channel.id, timestamp: "2026-10-03T21:25:00.000Z" },
  });
  assert.equal(begin.state, "ready");
  assert.match(begin.proposalId, /^ni:\/\/\/sha-256;/u);
  assert.match(begin.content, /proposed, not enacted/u);
  assert.match(begin.content, /State: proposed/u);
  assert.doesNotMatch(begin.content, /enacted by/u);

  const pending = await beginProposalSubmission({
    dataRoot,
    authorId,
    handle,
    message: { id: "submit-retry", channelId: channel.id },
  });
  assert.equal(pending.state, "pending");
  assert.equal(pending.proposalId, begin.proposalId);

  const completion = await completeProposalSubmission({
    dataRoot,
    intent: begin.intent,
    publicMessage: {
      id: "discord-proposal-message-1",
      channelId: "governance-proposals",
      channelName: "governance-proposals",
      createdAt: "2026-10-03T21:26:00.000Z",
    },
  });
  assert.equal(completion.receipt.state, "proposed");
  assert.equal(completion.receipt.bindingEffect, "proposal-only");
  assert.equal(completion.receipt.enactmentCreated, false);

  const proposed = await proposalDraftForAuthor(dataRoot, authorId, handle);
  assert.equal(proposed.state, "proposed");
  assert.equal(proposed.status, "submitted");
  assert.equal(proposed.proposalId, begin.proposalId);
  assert.equal(proposed.publicMessage.messageId, "discord-proposal-message-1");
  assert.equal((await readProposalSubmissionEvents(dataRoot)).length, 2);

  await assert.rejects(
    recordProposalDraftFieldUpdate({
      dataRoot,
      authorId,
      handle,
      message: { id: "late-edit", channelId: channel.id },
      field: "evidence",
      value: "late mutation",
    }),
    /can no longer be edited/u,
  );
});

test("incomplete proposal drafts cannot begin submission", async () => {
  const dataRoot = await mkdtemp(path.join(tmpdir(), "turntide-proposal-incomplete-submit-"));
  const channel = { id: "governance-discussion-incomplete", name: "governance-discussion" };
  const authorId = "turntider-incomplete";
  const intake = await recordProposalDraftIntake({
    dataRoot,
    channel,
    message: { id: "incomplete-source", authorId },
    requestedAct: "change the garden schedule",
    missing: ["affectedScope", "evidence", "authorityNeeded", "reversibility", "receivingCondition"],
  });
  const begin = await beginProposalSubmission({
    dataRoot,
    authorId,
    handle: proposalDraftHandle(intake.record),
    message: { id: "incomplete-submit", channelId: channel.id },
  });
  assert.equal(begin.state, "incomplete");
  assert.ok(begin.missing.includes("affectedScope"));
  assert.equal((await readProposalSubmissionEvents(dataRoot)).length, 0);
});

test("public proposal rendering refuses an overlong one-message carrier", () => {
  assert.throws(
    () => proposalPublicText({
      status: "complete",
      proposer: "a",
      requestedAct: "x".repeat(2000),
      affectedScope: "scope",
      evidence: "evidence",
      authorityNeeded: "authority",
      reversibility: "reversible",
      receivingCondition: "received",
    }, "ni:///sha-256;example"),
    /too long/u,
  );
});
