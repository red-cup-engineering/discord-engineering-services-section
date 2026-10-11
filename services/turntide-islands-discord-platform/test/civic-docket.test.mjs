import assert from "node:assert/strict";
import { appendFile, mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { buildCivicDocket, formatCivicDocket } from "../src/turntide-software-system/civic-docket.mjs";

async function writeSubmission(dataRoot, event) {
  const target = path.join(dataRoot, "civic", "proposal-submissions.jsonl");
  await mkdir(path.dirname(target), { recursive: true });
  await appendFile(target, JSON.stringify(event) + "\n");
}

const context = Object.freeze({
  protocol: Object.freeze({
    artifactKinds: Object.freeze({
      proposal: Object.freeze({
        transitions: Object.freeze([
          Object.freeze({ from: "proposed", to: "enacted", mayBePerformedBy: Object.freeze(["recorded-governance-standing"]), requires: Object.freeze(["governing act naming the proposal and authority basis"]), effect: "authorizes the requested act" }),
          Object.freeze({ from: "proposed", to: "refused", mayBePerformedBy: Object.freeze(["recorded-governance-standing"]), requires: Object.freeze(["refusal reason or governing act"]), effect: "does not authorize the requested act" }),
          Object.freeze({ from: "proposed", to: "superseded", mayBePerformedBy: Object.freeze(["proposer", "recorded-governance-standing"]), requires: Object.freeze(["reference to replacement proposal"]), effect: "preserves provenance" }),
        ]),
      }),
    }),
  }),
  acts: Object.freeze([
    Object.freeze({ id: "act-received", state: "received", requestedAct: "done", recordedAt: "2026-10-03T10:00:00Z", authorityDomain: "turntide-governance" }),
    Object.freeze({ id: "act-executing", state: "executing", requestedAct: "still moving", recordedAt: "2026-10-03T11:00:00Z", authorityDomain: "turntide-governance" }),
  ]),
});

test("civic docket projects public submitted proposals without ranking or support inference", async () => {
  const dataRoot = await mkdtemp(path.join(tmpdir(), "turntide-civic-docket-"));
  await writeSubmission(dataRoot, {
    type: "TurntideProposalSubmissionIntent",
    version: 1,
    draftId: "draft-one",
    proposalId: "ni:///sha-256;proposal-one",
    proposer: "turntider-one",
    state: "submission-pending",
  });
  await writeSubmission(dataRoot, {
    type: "TurntideProposalSubmissionReceipt",
    version: 1,
    draftId: "draft-one",
    proposalId: "ni:///sha-256;proposal-one",
    proposer: "turntider-one",
    state: "proposed",
    publicMessage: {
      adapter: "discord",
      channelId: "channel-proposals",
      channelName: "governance-proposals",
      messageId: "message-one",
    },
    proposedAt: "2026-10-03T12:00:00Z",
    bindingEffect: "proposal-only",
    enactmentCreated: false,
  });

  const docket = await buildCivicDocket({ dataRoot, context });
  assert.equal(docket.bindingEffect, "informational-only");
  assert.deepEqual(docket.rankingInputs, []);
  assert.match(docket.rankingLaw, /No ranking, endorsement, sentiment, reaction count, message volume, popularity, silence, tenure, or model preference/u);
  assert.match(docket.inferenceLaw, /remains proposed unless an explicit linked governance receipt/u);
  assert.equal(docket.proposals.length, 1);
  assert.equal(docket.proposals[0].state, "proposed");
  assert.equal(docket.proposals[0].priority, "not-ranked");
  assert.equal(docket.proposals[0].supportMeasurement, "not-measured");
  assert.deepEqual(docket.proposals[0].next.map((move) => move.to), ["enacted", "refused", "superseded"]);
  assert.deepEqual(docket.unsettledActs.map((act) => act.id), ["act-executing"]);

  const rendered = formatCivicDocket(docket);
  assert.match(rendered, /state, not ranking/u);
  assert.match(rendered, /proposal-one/u);
  assert.match(rendered, /lawful governance outcomes: enacted \/ refused \/ superseded/u);
  assert.match(rendered, /None of that is silently counted as a vote/u);
});

test("civic docket ignores pending intents and does not expose private proposal draft text", async () => {
  const dataRoot = await mkdtemp(path.join(tmpdir(), "turntide-civic-docket-pending-"));
  await writeSubmission(dataRoot, {
    type: "TurntideProposalSubmissionIntent",
    version: 1,
    draftId: "private-draft",
    proposalId: "ni:///sha-256;pending-only",
    proposer: "turntider-two",
    state: "submission-pending",
    privateRequestedAct: "this must never appear",
  });

  const docket = await buildCivicDocket({ dataRoot, context: { ...context, acts: [] } });
  assert.equal(docket.proposals.length, 0);
  assert.equal(JSON.stringify(docket).includes("this must never appear"), false);
  assert.match(formatCivicDocket(docket), /No public proposal-submission receipts/u);
});
