import assert from "node:assert/strict";
import { appendFile, mkdir, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path, { resolve } from "node:path";
import test from "node:test";

import { civicAnswerForMessage, executeProposalSubmissionIntent, executeRoutineCandidateSubmissionIntent } from "../src/turntide-software-system/steward.mjs";
import { runCivicScheduledRoutines } from "../src/turntide-software-system/civic-scheduled-routines.mjs";
import { auditCivicKernel, classifyDecisionProcedure, delegationWayfinding, loadZeloCivicContext } from "../src/turntide-software-system/zelo-civic-service.mjs";

const message = (content) => ({ content });
const channel = (name) => ({ name });

// These tests drive the civic kernel against Turntide's real governance records. The records are
// Turntide's and live in their own checkout, named by TURNTIDE_PUBLIC_ROOT; without it they skip.
const NEEDS_RECORDS = "needs TURNTIDE_PUBLIC_ROOT pointing at a checkout of causeway-services/turntide-islands-services-section";
const civicSource = () => ({ TURNTIDE_PUBLIC_ROOT: process.env.TURNTIDE_PUBLIC_ROOT });
const integration = (name, fn) => test(name, { skip: process.env.TURNTIDE_PUBLIC_ROOT ? false : NEEDS_RECORDS }, fn);

integration("Zelo answers Turntide civic orientation from the enacted kernel before inference", async () => {
  const answer = await civicAnswerForMessage(
    channel("governance-questions"),
    message("<@zelo> what is Turntide and how does it work?"),
    civicSource(),
  );
  assert.match(answer, /Turntide has three useful layers/u);
  assert.match(answer, /Binding decisions are different/u);
});

integration("Zelo gives place-aware civic guidance in the channel where a Turntider asks", async () => {
  const answer = await civicAnswerForMessage(
    channel("question-quarry"),
    message("<@zelo> what can we do here?"),
    civicSource(),
  );
  assert.match(answer, /#question-quarry/u);
  assert.match(answer, /Question Quarry/u);
  assert.match(answer, /Routine seeds/u);
  assert.match(answer, /Classification and research routing are informational; Zelo cannot fabricate an answer or decision/u);
});

integration("Zelo explains responsibility pathways without granting standing", async () => {
  const answer = await civicAnswerForMessage(
    channel("governance-questions"),
    message("<@zelo> how do I take on more responsibility or get governance standing?"),
    civicSource(),
  );
  assert.match(answer, /no automatic promotion ladder/u);
  assert.match(answer, /bounded delegation/u);
  assert.match(answer, /broader Turntide governance standing/u);
});

integration("Zelo keeps Tidepool financial authority separate from Turntide governance", async () => {
  const answer = await civicAnswerForMessage(
    channel("economy-estuary"),
    message("<@zelo> does my Turntide role let me vote in Tidepool?"),
    civicSource(),
  );
  assert.match(answer, /Tidepool is Turntide-adjacent/u);
  assert.match(answer, /As of 2026-10-03T21:22:01\.708Z/u);
  assert.match(answer, /Tidepool Protocol Clerk is vacant/u);
  assert.match(answer, /first operating loop is unreceived/u);
  assert.match(answer, /General Turntide\/Board civic-office protocol availability: unavailable/u);
  assert.match(answer, /Turntide-wide standing is not a substitute/u);
});

test("ordinary non-civic mentions remain available to the existing inference path", async () => {
  const answer = await civicAnswerForMessage(
    channel("soundwaves"),
    message("<@zelo> what song are you listening to?"),
    {},
  );
  assert.equal(answer, null);
});


test("steward service executes the current source carrier", async () => {
  const service = await readFile(resolve(import.meta.dirname, "../deploy/systemd/tti-zelo-steward.service"), "utf8");
  assert.match(service, /src\/turntide-software-system\/steward\.mjs run/u);
  assert.doesNotMatch(service, /dist\/turntide-software-system\/steward\.mjs/u);
  assert.match(service, /EnvironmentFile=\/home\/emsenn\/561-group\/lib\/turntide-islands\/\.env/u);
  assert.match(service, /TURNTIDE_PUBLIC_ROOT=\/home\/emsenn\/561-group\/lib\/turntide-islands/u);
});


integration("explicit Zelo routine-candidate intake persists one private draft and dedupes replay", async () => {
  const dataRoot = await mkdtemp(path.join(tmpdir(), "turntide-zelo-candidate-"));
  const source = { ...civicSource(), TTI_AGENT_DATA_ROOT: dataRoot };
  const place = { id: "channel-routine-1", name: "question-quarry" };
  const request = {
    id: "message-routine-1",
    content: "<@12345> save this as a routine candidate: people keep losing track of who owns the next research step",
    authorId: "turntider-1",
    timestamp: "2026-10-03T19:35:00.000Z",
  };

  const first = await civicAnswerForMessage(place, request, source);
  const second = await civicAnswerForMessage(place, request, source);
  assert.match(first, /Saved draft routine intake ni:\/\/\/sha-256;/u);
  assert.match(first, /Routine draft is incomplete/u);
  assert.match(second, /already saved/u);

  const stored = (await readFile(path.join(dataRoot, "civic", "routine-candidates.jsonl"), "utf8"))
    .trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(stored.length, 1);
  assert.equal(stored[0].state, "draft");
  assert.equal(stored[0].bindingEffect, "none");
  assert.equal(stored[0].source.messageId, request.id);
  assert.equal(stored[0].observation, "people keep losing track of who owns the next research step");
});


integration("scheduled civic adapter baselines silently and persists dedupe state", async () => {
  const dataRoot = await mkdtemp(path.join(tmpdir(), "turntide-zelo-scheduled-"));
  const sent = [];
  const transport = {
    async createMessage(channelId, payload) {
      sent.push({ channelId, payload });
      return { id: `sent-${sent.length}` };
    },
  };
  const channels = [
    { id: "ga", name: "governance-action" },
    { id: "gq", name: "governance-questions" },
    { id: "gd", name: "governance-discussion" },
  ];
  const first = await runCivicScheduledRoutines({
    transport,
    channels,
    source: { ...civicSource(), TTI_AGENT_DATA_ROOT: dataRoot },
    dataRoot,
    now: "2026-10-03T20:00:00.000Z",
  });
  assert.deepEqual(first.outputs, []);
  assert.equal(sent.length, 0);

  const state = JSON.parse(await readFile(path.join(dataRoot, "civic", "scheduled-routines.json"), "utf8"));
  assert.equal(state.initialized, true);
  assert.equal(state.lastReviewAt, "2026-10-03T20:00:00.000Z");

  const second = await runCivicScheduledRoutines({
    transport,
    channels,
    source: { ...civicSource(), TTI_AGENT_DATA_ROOT: dataRoot },
    dataRoot,
    now: "2026-10-03T20:05:00.000Z",
  });
  assert.deepEqual(second.outputs, []);
  assert.equal(sent.length, 0);
});

test("live steward source invokes the scheduled civic adapter instead of a separate engagement bot", async () => {
  const steward = await readFile(resolve(import.meta.dirname, "../src/turntide-software-system/steward.mjs"), "utf8");
  assert.match(steward, /runCivicScheduledRoutines/u);
  assert.match(steward, /TTI_CIVIC_SCHEDULE_CHECK_MS/u);
  assert.match(steward, /scheduled civic review failed/u);
});


integration("saved routine candidate inbox is author-scoped and omits observation text", async () => {
  const dataRoot = await mkdtemp(path.join(tmpdir(), "turntide-zelo-private-inbox-"));
  const source = { ...civicSource(), TTI_AGENT_DATA_ROOT: dataRoot };
  const place = { id: "channel-private-routine", name: "question-quarry" };
  const observation = "people keep losing track of the next research witness";
  const saved = await civicAnswerForMessage(place, {
    id: "message-private-routine",
    content: "<@12345> save this as a routine candidate: " + observation,
    authorId: "turntider-a",
    timestamp: "2026-10-03T20:30:00.000Z",
  }, source);
  assert.match(saved, /Saved draft routine intake/u);

  const mine = await civicAnswerForMessage(place, {
    id: "message-list-a",
    content: "<@12345> show me my routine candidates",
    authorId: "turntider-a",
    timestamp: "2026-10-03T20:31:00.000Z",
  }, source);
  assert.match(mine, /You have 1 saved routine candidate/u);
  assert.match(mine, /#question-quarry/u);
  assert.doesNotMatch(mine, new RegExp(observation, "u"));

  const other = await civicAnswerForMessage(place, {
    id: "message-list-b",
    content: "<@12345> show me my routine candidates",
    authorId: "turntider-b",
    timestamp: "2026-10-03T20:32:00.000Z",
  }, source);
  assert.match(other, /no saved routine candidates/u);
});

integration("routine candidate continuation stays with its author and original channel", async () => {
  const dataRoot = await mkdtemp(path.join(tmpdir(), "turntide-zelo-private-continue-"));
  const source = { ...civicSource(), TTI_AGENT_DATA_ROOT: dataRoot };
  const original = { id: "channel-original-routine", name: "question-quarry" };
  await civicAnswerForMessage(original, {
    id: "message-continue-source",
    content: "<@12345> save this as a routine candidate: research questions keep stalling before anyone names the next witness",
    authorId: "turntider-a",
    timestamp: "2026-10-03T20:35:00.000Z",
  }, source);
  const list = await civicAnswerForMessage(original, {
    id: "message-continue-list",
    content: "<@12345> show my routine candidates",
    authorId: "turntider-a",
  }, source);
  const handle = /- ([A-Za-z0-9_-]{10}) —/u.exec(list)?.[1];
  assert.ok(handle);

  const wrongPlace = await civicAnswerForMessage(
    { id: "channel-other", name: "mainland" },
    { id: "message-wrong-place", content: "<@12345> continue routine candidate " + handle, authorId: "turntider-a" },
    source,
  );
  assert.match(wrongPlace, /belongs to #question-quarry/u);
  assert.match(wrongPlace, /Continue it there/u);

  const wrongAuthor = await civicAnswerForMessage(
    original,
    { id: "message-wrong-author", content: "<@12345> continue routine candidate " + handle, authorId: "turntider-b" },
    source,
  );
  assert.match(wrongAuthor, /cannot find that routine candidate in your private draft inbox/u);

  const resumed = await civicAnswerForMessage(
    original,
    { id: "message-right-author", content: "<@12345> continue routine candidate " + handle, authorId: "turntider-a" },
    source,
  );
  assert.match(resumed, new RegExp("Continuing routine candidate " + handle, "u"));
  assert.match(resumed, /Routine studio suggestions for #question-quarry/u);
  assert.match(resumed, /remains draft-only until all required fields are complete and you explicitly submit it/u);
});


integration("Zelo routes evidence-backed civic contests before generic inference", async () => {
  const answer = await civicAnswerForMessage(
    channel("governance-action"),
    message("<@zelo> I challenge this receipt: the execution is missing its receiving evidence."),
    civicSource(),
  );
  assert.match(answer, /does not automatically reverse, suspend, reopen, or invalidate/u);
  assert.match(answer, /contest-executed-act/u);
  assert.match(answer, /specific contradiction, missing receipt, or falsifying evidence/u);
});

integration("Zelo keeps Tidepool receipt contests inside Tidepool authority", async () => {
  const answer = await civicAnswerForMessage(
    channel("economy-estuary"),
    message("<@zelo> I challenge the Tidepool disclosure because its receipt contradicts the ledger witness."),
    civicSource(),
  );
  assert.match(answer, /tidepool-receipt-contest/u);
  assert.match(answer, /Tidepool's own reconciliation\/contest process/u);
  assert.match(answer, /change Tidepool membership, voting weight, financial state/u);
});


integration("explicit Zelo proposal drafting persists a private draft without proposing it", async () => {
  const dataRoot = await mkdtemp(path.join(tmpdir(), "turntide-zelo-proposal-"));
  const source = { ...civicSource(), TTI_AGENT_DATA_ROOT: dataRoot };
  const place = { id: "governance-discussion-proposal", name: "governance-discussion" };
  const request = {
    id: "message-proposal-source",
    content: "<@12345> save this as a draft proposal: create a weekly public garden workboard",
    authorId: "turntider-a",
    timestamp: "2026-10-03T20:40:00.000Z",
  };
  const first = await civicAnswerForMessage(place, request, source);
  const second = await civicAnswerForMessage(place, request, source);
  assert.match(first, /Saved proposal draft ni:\/\/\/sha-256;/u);
  assert.match(first, /Proposal draft is incomplete/u);
  assert.match(first, /private\/draft-only/u);
  assert.match(second, /already saved/u);

  const stored = (await readFile(path.join(dataRoot, "civic", "proposal-drafts.jsonl"), "utf8"))
    .trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(stored.length, 1);
  assert.equal(stored[0].state, "draft-proposal");
  assert.equal(stored[0].bindingEffect, "draft-only");
  assert.equal(stored[0].requestedAct, "create a weekly public garden workboard");
});

integration("proposal draft inbox and continuation stay author-scoped and in the original channel", async () => {
  const dataRoot = await mkdtemp(path.join(tmpdir(), "turntide-zelo-proposal-private-"));
  const source = { ...civicSource(), TTI_AGENT_DATA_ROOT: dataRoot };
  const original = { id: "proposal-original", name: "governance-discussion" };
  await civicAnswerForMessage(original, {
    id: "proposal-private-source",
    content: "<@12345> draft proposal: maintain a public ledger of received governance acts",
    authorId: "turntider-a",
    timestamp: "2026-10-03T20:41:00.000Z",
  }, source);

  const mine = await civicAnswerForMessage(original, {
    id: "proposal-list-a",
    content: "<@12345> show me my proposal drafts",
    authorId: "turntider-a",
  }, source);
  assert.match(mine, /You have 1 saved proposal draft/u);
  assert.match(mine, /#governance-discussion/u);
  assert.doesNotMatch(mine, /maintain a public ledger of received governance acts/u);
  const handle = /- ([A-Za-z0-9_-]{10}) —/u.exec(mine)?.[1];
  assert.ok(handle);

  const other = await civicAnswerForMessage(original, {
    id: "proposal-list-b",
    content: "<@12345> show me my proposal drafts",
    authorId: "turntider-b",
  }, source);
  assert.match(other, /no saved proposal drafts/u);

  const wrongPlace = await civicAnswerForMessage(
    { id: "proposal-other", name: "mainland" },
    { id: "proposal-wrong-place", content: "<@12345> continue proposal " + handle, authorId: "turntider-a" },
    source,
  );
  assert.match(wrongPlace, /belongs to #governance-discussion/u);

  const resumed = await civicAnswerForMessage(
    original,
    { id: "proposal-resume", content: "<@12345> continue proposal " + handle, authorId: "turntider-a" },
    source,
  );
  assert.match(resumed, new RegExp("Continuing proposal draft " + handle, "u"));
  assert.match(resumed, /Proposal draft is incomplete/u);
  assert.match(resumed, /private\/draft-only/u);
});


integration("Zelo lets an author refine and explicitly submit a complete proposal without enacting it", async () => {
  const dataRoot = await mkdtemp(path.join(tmpdir(), "turntide-zelo-proposal-submit-"));
  const source = { ...civicSource(), TTI_AGENT_DATA_ROOT: dataRoot, DISCORD_GUILD_ID: "guild-turntide" };
  const place = { id: "governance-discussion-submit-live", name: "governance-discussion" };
  const authorId = "turntider-submit-live";
  await civicAnswerForMessage(place, {
    id: "proposal-submit-live-source",
    content: "<@12345> save this as a draft proposal: create a weekly public garden workboard",
    authorId,
    timestamp: "2026-10-03T21:30:00.000Z",
  }, source);
  const inbox = await civicAnswerForMessage(place, {
    id: "proposal-submit-list",
    content: "<@12345> show me my proposal drafts",
    authorId,
  }, source);
  const handle = /- ([A-Za-z0-9_-]{10}) —/u.exec(inbox)?.[1];
  assert.ok(handle);

  const refinements = [
    ["affected scope", "Garden Grove project coordination"],
    ["evidence", "three recent work sessions needed manual next-step reconstruction"],
    ["authority needed", "Turntide governance approval to admit the workboard"],
    ["reversibility", "retire the workboard by a later governing act"],
    ["receiving condition", "the public workboard exists and a received receipt identifies its owner"],
  ];
  let index = 0;
  for (const [field, value] of refinements) {
    const answer = await civicAnswerForMessage(place, {
      id: `proposal-refinement-${index += 1}`,
      content: `<@12345> set proposal ${handle} ${field}: ${value}`,
      authorId,
      timestamp: "2026-10-03T21:31:00.000Z",
    }, source);
    assert.match(answer, /Updated proposal draft/u);
  }

  const request = await civicAnswerForMessage(place, {
    id: "proposal-submit-explicit",
    content: `<@12345> submit proposal ${handle}`,
    authorId,
    timestamp: "2026-10-03T21:35:00.000Z",
  }, source);
  assert.equal(request.kind, "turntide.civic.proposal-submission-request");

  const posts = [];
  const transport = {
    async listGuilds() { return [{ id: "guild-turntide", name: "Turntide Islands" }]; },
    async listChannels() { return [{ id: "governance-proposals-channel", name: "governance-proposals" }]; },
    async createMessage(channelId, payload) {
      posts.push({ channelId, payload });
      return { id: "public-proposal-message", timestamp: "2026-10-03T21:36:00.000Z" };
    },
  };
  const receipt = await executeProposalSubmissionIntent(transport, request, source);
  assert.match(receipt, /Submitted proposal ni:\/\/\/sha-256;/u);
  assert.match(receipt, /proposed, not enacted/u);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].channelId, "governance-proposals-channel");
  assert.match(posts[0].payload.content, /Turntide proposal — proposed, not enacted/u);
  assert.match(posts[0].payload.content, /Requested act: create a weekly public garden workboard/u);
  assert.match(posts[0].payload.content, /State: proposed/u);
  assert.deepEqual(posts[0].payload.allowedMentions, { users: [] });

  const retryRequest = await civicAnswerForMessage(place, {
    id: "proposal-submit-explicit-retry",
    content: `<@12345> submit proposal ${handle}`,
    authorId,
  }, source);
  const retry = await executeProposalSubmissionIntent(transport, retryRequest, source);
  assert.match(retry, /already proposed/u);
  assert.equal(posts.length, 1);
});

integration("Zelo fails closed on an ambiguous proposal post instead of duplicating it", async () => {
  const dataRoot = await mkdtemp(path.join(tmpdir(), "turntide-zelo-proposal-ambiguous-"));
  const source = { ...civicSource(), TTI_AGENT_DATA_ROOT: dataRoot, DISCORD_GUILD_ID: "guild-turntide" };
  const place = { id: "governance-discussion-ambiguous", name: "governance-discussion" };
  const authorId = "turntider-ambiguous";
  await civicAnswerForMessage(place, {
    id: "ambiguous-source",
    content: "<@12345> draft proposal: create a monthly island project index",
    authorId,
  }, source);
  const inbox = await civicAnswerForMessage(place, { id: "ambiguous-list", content: "<@12345> show my proposal drafts", authorId }, source);
  const handle = /- ([A-Za-z0-9_-]{10}) —/u.exec(inbox)?.[1];
  assert.ok(handle);
  const fields = [
    ["affected scope", "all public island projects"],
    ["evidence", "project status is repeatedly reconstructed by hand"],
    ["authority needed", "Turntide governance approval"],
    ["reversibility", "retire the index by later act"],
    ["receiving condition", "an index exists and has a named maintainer"],
  ];
  let sequence = 0;
  for (const [field, value] of fields) {
    await civicAnswerForMessage(place, {
      id: `ambiguous-update-${sequence += 1}`,
      content: `<@12345> update proposal ${handle} ${field}: ${value}`,
      authorId,
    }, source);
  }
  const request = await civicAnswerForMessage(place, { id: "ambiguous-submit", content: `<@12345> submit proposal ${handle}`, authorId }, source);
  let postAttempts = 0;
  const failingTransport = {
    async listGuilds() { return [{ id: "guild-turntide", name: "Turntide Islands" }]; },
    async listChannels() { return [{ id: "governance-proposals-channel", name: "governance-proposals" }]; },
    async createMessage() { postAttempts += 1; throw new Error("network outcome unknown"); },
  };
  const first = await executeProposalSubmissionIntent(failingTransport, request, source);
  assert.match(first, /entered pending state/u);
  assert.match(first, /will not duplicate/u);
  const second = await executeProposalSubmissionIntent(failingTransport, request, source);
  assert.match(second, /already pending/u);
  assert.match(second, /will not duplicate/u);
  assert.equal(postAttempts, 1);
});


integration("scheduled civic adapter reads proposal submission receipts and announces new proposals only when due", async () => {
  const dataRoot = await mkdtemp(path.join(tmpdir(), "turntide-zelo-proposal-agenda-"));
  const sent = [];
  const transport = {
    async createMessage(channelId, payload) {
      sent.push({ channelId, payload });
      return { id: `sent-proposal-${sent.length}` };
    },
  };
  const channels = [
    { id: "gp", name: "governance-proposals" },
    { id: "ga", name: "governance-action" },
    { id: "gq", name: "governance-questions" },
    { id: "gd", name: "governance-discussion" },
  ];

  await runCivicScheduledRoutines({
    transport,
    channels,
    source: { ...civicSource(), TTI_AGENT_DATA_ROOT: dataRoot },
    dataRoot,
    now: "2026-10-01T12:00:00.000Z",
  });
  assert.equal(sent.length, 0);

  const submissionFile = path.join(dataRoot, "civic", "proposal-submissions.jsonl");
  await import("node:fs/promises").then(({ mkdir, appendFile }) =>
    mkdir(path.dirname(submissionFile), { recursive: true }).then(() =>
      appendFile(submissionFile, JSON.stringify({
        type: "TurntideProposalSubmissionReceipt",
        version: 1,
        draftId: "draft-example",
        proposalId: "ni:///sha-256;adapter-proposal",
        state: "proposed",
        publicMessage: {
          adapter: "discord",
          channelId: "gp",
          channelName: "governance-proposals",
          messageId: "public-proposal-1",
        },
      }) + "\n")));

  const early = await runCivicScheduledRoutines({
    transport,
    channels,
    source: { ...civicSource(), TTI_AGENT_DATA_ROOT: dataRoot },
    dataRoot,
    now: "2026-10-01T12:05:00.000Z",
  });
  assert.equal(early.outputs.some((entry) => entry.routine === "proposal-intake-review"), false);
  assert.equal(sent.length, 0);

  const stateFile = path.join(dataRoot, "civic", "scheduled-routines.json");
  const state = JSON.parse(await readFile(stateFile, "utf8"));
  state.lastRunAt["proposal-intake-review"] = "2026-09-30T00:00:00.000Z";
  await import("node:fs/promises").then(({ writeFile }) => writeFile(stateFile, JSON.stringify(state, null, 2) + "\n"));

  const due = await runCivicScheduledRoutines({
    transport,
    channels,
    source: { ...civicSource(), TTI_AGENT_DATA_ROOT: dataRoot },
    dataRoot,
    now: "2026-10-03T12:00:00.000Z",
  });
  const output = due.outputs.find((entry) => entry.routine === "proposal-intake-review");
  assert.ok(output);
  assert.equal(output.channel, "governance-proposals");
  assert.match(output.content, /adapter-proposal/u);
  assert.match(output.content, /proposed, not enacted/u);
  assert.equal(sent.filter((entry) => entry.channelId === "gp").length, 1);

  const replay = await runCivicScheduledRoutines({
    transport,
    channels,
    source: { ...civicSource(), TTI_AGENT_DATA_ROOT: dataRoot },
    dataRoot,
    now: "2026-10-04T13:00:00.000Z",
  });
  assert.equal(replay.outputs.some((entry) => entry.routine === "proposal-intake-review"), false);
  const announcements = () => sent.filter((entry) => entry.channelId === "gp" && /new public proposal submission receipt/u.test(entry.payload.content));
  assert.equal(announcements().length, 1);
  // Turntide's runtime schedules the next-move nudge: a proposal seen at an earlier review that is still
  // proposed gets one bounded nudge in its lane, and not again while its state is unchanged.
  const nudges = () => sent.filter((entry) => entry.channelId === "gp" && /remains proposed\. Smallest lawful next move/u.test(entry.payload.content));
  assert.deepEqual(replay.outputs.filter((entry) => entry.routine === "next-move-nudge").map((entry) => entry.subjectId), ["ni:///sha-256;adapter-proposal"]);
  assert.equal(nudges().length, 1);

  await runCivicScheduledRoutines({
    transport,
    channels,
    source: { ...civicSource(), TTI_AGENT_DATA_ROOT: dataRoot },
    dataRoot,
    now: "2026-10-05T13:00:00.000Z",
  });
  assert.equal(announcements().length, 1);
  assert.equal(nudges().length, 1);
  assert.equal(sent.filter((entry) => entry.channelId === "gp").length, 2);
});


integration("Zelo answers governance-docket questions from public proposal receipts without ranking them", async () => {
  const dataRoot = await mkdtemp(path.join(tmpdir(), "turntide-zelo-docket-"));
  const civicDir = path.join(dataRoot, "civic");
  await mkdir(civicDir, { recursive: true });
  await appendFile(path.join(civicDir, "proposal-submissions.jsonl"), JSON.stringify({
    type: "TurntideProposalSubmissionReceipt",
    version: 1,
    draftId: "docket-draft",
    proposalId: "ni:///sha-256;docket-proposal",
    proposer: "turntider-docket",
    state: "proposed",
    authorityDomain: "turntide-governance",
    publicMessage: {
      adapter: "discord",
      channelId: "governance-proposals-id",
      channelName: "governance-proposals",
      messageId: "docket-message",
    },
    proposedAt: "2026-10-03T22:15:00.000Z",
    bindingEffect: "proposal-only",
    enactmentCreated: false,
  }) + "\n");

  const answer = await civicAnswerForMessage(
    channel("governance-questions"),
    { id: "docket-query", content: "<@zelo> what's happening in Turntide governance?", authorId: "turntider-reader" },
    { ...civicSource(), TTI_AGENT_DATA_ROOT: dataRoot },
  );
  assert.match(answer, /Turntide civic docket — state, not ranking/u);
  assert.match(answer, /docket-proposal/u);
  assert.match(answer, /lawful governance outcomes: enacted \/ refused \/ superseded/u);
  assert.match(answer, /silently counted as a vote/u);
  assert.match(answer, /No ranking, endorsement, sentiment, reaction count, message volume, popularity, silence, tenure, or model preference/u);
});


integration("Zelo routes decision-procedure questions without inventing a vote", async () => {
  const ordinary = await civicAnswerForMessage(
    channel("governance-questions"),
    message("<@zelo> how would Turntide decide a change to the public website integration?"),
    civicSource(),
  );
  assert.match(ordinary, /Ordinary governance act/u);
  assert.match(ordinary, /Numeric voting weights currently established: no/u);
  assert.match(ordinary, /recorded governance standing/u);

  const structural = await civicAnswerForMessage(
    channel("governance-questions"),
    message("<@zelo> does this structural governance change need a vote?"),
    civicSource(),
  );
  assert.match(structural, /Structural governance act/u);
  assert.match(structural, /turntide-wide recorded-governance-standing/u);
  assert.match(structural, /Numeric voting weights currently established: no/u);
});

integration("Zelo routes Tidepool financial decisions outside Turntide authority", async () => {
  const answer = await civicAnswerForMessage(
    channel("economy-estuary"),
    message("<@zelo> who decides Tidepool distribution voting?"),
    civicSource(),
  );
  assert.match(answer, /outside Turntide decision authority/u);
  assert.match(answer, /tidepool-financial-membership \/ Tidepool protocol authority/u);
  assert.match(answer, /not a substitute for Tidepool financial authority/u);
});

integration("Zelo recognizes prior-authority procedures for delegated and routine work", async () => {
  const delegated = await civicAnswerForMessage(
    channel("governance-questions"),
    message("<@zelo> what procedure applies when this is already within the existing delegation?"),
    civicSource(),
  );
  assert.match(delegated, /Delegated clerical execution/u);
  assert.match(delegated, /active delegation is the prior governance decision/u);

  const routine = await civicAnswerForMessage(
    channel("governance-questions"),
    message("<@zelo> how would Turntide decide an enacted routine instance?"),
    civicSource(),
  );
  assert.match(routine, /Enacted routine instance/u);
  assert.match(routine, /enacted routine is the prior governance decision/u);
});

integration("Zelo lets an author refine and explicitly submit a routine candidate without enacting or scheduling it", async () => {
  const dataRoot = await mkdtemp(path.join(tmpdir(), "turntide-zelo-routine-submit-"));
  const source = { ...civicSource(), TTI_AGENT_DATA_ROOT: dataRoot, DISCORD_GUILD_ID: "guild-turntide" };
  const place = { id: "question-quarry-routine-submit", name: "question-quarry" };
  const authorId = "turntider-routine-submit";
  await civicAnswerForMessage(place, {
    id: "routine-submit-live-source",
    content: "<@12345> save this as a routine candidate: useful research questions keep stalling without a next actor",
    authorId,
    timestamp: "2026-10-03T21:50:00.000Z",
  }, source);
  const inbox = await civicAnswerForMessage(place, {
    id: "routine-submit-list",
    content: "<@12345> show me my routine candidates",
    authorId,
  }, source);
  const handle = /- ([A-Za-z0-9_-]{10}) —/u.exec(inbox)?.[1];
  assert.ok(handle);

  const refinements = [
    ["beneficiary", "Turntiders asking practical and research questions"],
    ["trigger or cadence", "when a tracked question stalls without a next actor"],
    ["actor", "zelo-civic-steward"],
    ["output", "one bounded next-move classification"],
    ["authority boundary", "routing only; no fabricated answer, obligation, or governance act"],
    ["failure mode", "the question is private or lacks enough context"],
    ["retirement condition", "questions reliably reach a next actor without steward intervention"],
  ];
  let index = 0;
  for (const [field, value] of refinements) {
    const answer = await civicAnswerForMessage(place, {
      id: `routine-submit-refinement-${index += 1}`,
      content: `<@12345> set routine candidate ${handle} ${field}: ${value}`,
      authorId,
      timestamp: "2026-10-03T21:51:00.000Z",
    }, source);
    assert.match(answer, /Updated routine candidate/u);
  }

  const request = await civicAnswerForMessage(place, {
    id: "routine-submit-explicit",
    content: `<@12345> submit routine candidate ${handle}`,
    authorId,
    timestamp: "2026-10-03T21:55:00.000Z",
  }, source);
  assert.equal(request.kind, "turntide.civic.routine-candidate-submission-request");

  const posts = [];
  const transport = {
    async listGuilds() { return [{ id: "guild-turntide", name: "Turntide Islands" }]; },
    async listChannels() { return [{ id: "governance-proposals-channel", name: "governance-proposals" }]; },
    async createMessage(channelId, payload) {
      posts.push({ channelId, payload });
      return { id: "public-routine-candidate-message", timestamp: "2026-10-03T21:56:00.000Z" };
    },
  };
  const receipt = await executeRoutineCandidateSubmissionIntent(transport, request, source);
  assert.match(receipt, /Submitted routine candidate ni:\/\/\/sha-256;/u);
  assert.match(receipt, /proposed, not enacted or scheduled/u);
  assert.equal(posts.length, 1);
  assert.match(posts[0].payload.content, /routine candidate — proposed, not enacted or scheduled/u);
  assert.match(posts[0].payload.content, /Observed repetition: useful research questions keep stalling/u);
  assert.match(posts[0].payload.content, /State: proposed/u);

  const retryRequest = await civicAnswerForMessage(place, {
    id: "routine-submit-retry",
    content: `<@12345> submit routine candidate ${handle}`,
    authorId,
  }, source);
  const retry = await executeRoutineCandidateSubmissionIntent(transport, retryRequest, source);
  assert.match(retry, /already proposed/u);
  assert.equal(posts.length, 1);
});

integration("ambiguous routine-candidate submission stays pending and is not blindly duplicated", async () => {
  const dataRoot = await mkdtemp(path.join(tmpdir(), "turntide-zelo-routine-ambiguous-"));
  const source = { ...civicSource(), TTI_AGENT_DATA_ROOT: dataRoot, DISCORD_GUILD_ID: "guild-turntide" };
  const place = { id: "garden-routine-ambiguous", name: "garden-grove" };
  const authorId = "turntider-routine-ambiguous";
  await civicAnswerForMessage(place, {
    id: "routine-ambiguous-source",
    content: "<@12345> save this as a routine candidate: garden projects keep losing the next accepted owner",
    authorId,
  }, source);
  const inbox = await civicAnswerForMessage(place, { id: "routine-ambiguous-list", content: "<@12345> show my routine candidates", authorId }, source);
  const handle = /- ([A-Za-z0-9_-]{10}) —/u.exec(inbox)?.[1];
  assert.ok(handle);
  const fields = [
    ["beneficiary", "Garden Grove project participants"],
    ["trigger or cadence", "when a tracked project lacks an accepted next actor"],
    ["actor", "zelo-civic-steward"],
    ["output", "one current-state owner and next-move summary"],
    ["authority boundary", "coordination only; no assignment without acceptance"],
    ["failure mode", "ownership or consent is ambiguous"],
    ["retirement condition", "the project closes"],
  ];
  let n = 0;
  for (const [field, value] of fields) {
    await civicAnswerForMessage(place, {
      id: `routine-ambiguous-update-${n += 1}`,
      content: `<@12345> update routine candidate ${handle} ${field}: ${value}`,
      authorId,
    }, source);
  }
  const request = await civicAnswerForMessage(place, { id: "routine-ambiguous-submit", content: `<@12345> submit routine candidate ${handle}`, authorId }, source);
  let attempts = 0;
  const transport = {
    async listGuilds() { return [{ id: "guild-turntide", name: "Turntide Islands" }]; },
    async listChannels() { return [{ id: "gp", name: "governance-proposals" }]; },
    async createMessage() { attempts += 1; throw new Error("network outcome unknown"); },
  };
  const first = await executeRoutineCandidateSubmissionIntent(transport, request, source);
  assert.match(first, /entered pending state/u);
  assert.match(first, /will not duplicate/u);
  const second = await executeRoutineCandidateSubmissionIntent(transport, request, source);
  assert.match(second, /already pending/u);
  assert.equal(attempts, 1);
});

integration("the civic kernel tolerates the civic-kernel laws Turntide has not recorded in its governance journal", async () => {
  const context = await loadZeloCivicContext(process.env.TURNTIDE_PUBLIC_ROOT);
  // Turntide's records hold none of these yet; each reads as absent rather than failing the kernel.
  assert.equal(context.decisionClassification, null);
  assert.equal(context.delegationLaw, null);
  assert.equal(context.conformanceLaw, null);
  assert.equal(context.delegations, null);

  const report = auditCivicKernel(context);
  assert.equal(report.ok, false);
  assert.deepEqual(report.violations.map((entry) => entry.code), ["conformance-law-unavailable"]);
  assert.equal(report.authorityEffect, "none");

  const classification = classifyDecisionProcedure(context, { consequences: ["projection"] });
  assert.equal(classification.state, "refused");
  assert.equal(classification.reason, "classification-law-unavailable");
  assert.equal(classification.authorizationCreated, false);

  const delegations = delegationWayfinding(context);
  assert.equal(delegations.registryAvailable, false);
  assert.deepEqual(delegations.unmatchedStanding, []);
});
