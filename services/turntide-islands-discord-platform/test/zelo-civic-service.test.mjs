import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  auditCivicKernel,
  authorityBoundary,
  civicState,
  classifyDecisionProcedure,
  delegationWayfinding,
  formatZelo,
  loadZeloCivicContext,
  orientTurntider,
  receivedTeachingExamples,
  rehearseCivicMove,
  routineIntent,
  scheduledCivicReview,
} from "../src/turntide-software-system/zelo-civic-service.mjs";
import {
  activation,
  allLaws,
  conformanceLaw,
  decisionClassificationLaw,
  event,
  law,
  revocation,
  syntheticGovernanceJournal,
} from "./fixtures/turntide-governance-journal.mjs";

// Small invented governance records that exercise the kernel's code paths. Turntide's real records
// live in their own checkout; the adapter integration test reads those through TURNTIDE_PUBLIC_ROOT.
const FIXTURE_ROOT = path.join(import.meta.dirname, "fixtures", "turntide-governance");

test("loadZeloCivicContext reads every governance record and the acts from the named root", async () => {
  const context = await loadZeloCivicContext(FIXTURE_ROOT);
  assert.equal(context.root, FIXTURE_ROOT);
  for (const key of ["standing", "protocol", "mandate", "routines", "runtime", "routinePatterns", "civicPlaces", "standingPathways", "tidepoolStatus", "tidepoolParticipantGovernance", "contestability", "decisionProcedures"]) {
    assert.equal(typeof context[key], "object", key);
  }
  assert.deepEqual(context.acts.map((act) => act.id), ["fixture-act-received", "fixture-act-unexecuted"]);
  assert.ok(Object.isFrozen(context));
  assert.ok(Object.isFrozen(context.acts));
});

test("loadZeloCivicContext refuses to guess where the governance records are", async () => {
  for (const root of [undefined, null, "", "   "]) {
    await assert.rejects(() => loadZeloCivicContext(root), (error) => error instanceof TypeError && /TURNTIDE_PUBLIC_ROOT/u.test(error.message));
  }
});

test("orientTurntider lists only active standing and binds nothing", async () => {
  const context = await loadZeloCivicContext(FIXTURE_ROOT);
  const orientation = orientTurntider(context);
  assert.equal(orientation.type, "ZeloCivicOrientation");
  assert.equal(orientation.governance, "turntide-governance");
  assert.deepEqual(orientation.activeStanding.map((entry) => entry.id), ["fixture-governor", "fixture-steward", "fixture-unbased-helper"]);
  assert.equal(orientation.bindingEffect, "informational-only");
  assert.match(formatZelo(orientation), /^Turntide is a DAO whose authority lives in recorded standing/u);
});

test("civicState answers from the protocol's transitions and rejects unknown kinds", async () => {
  const context = await loadZeloCivicContext(FIXTURE_ROOT);
  const initial = civicState(context, { artifactKind: "proposal" });
  assert.equal(initial.state, "draft-proposal");
  assert.deepEqual(initial.transitions.map((move) => move.to), ["proposed"]);
  assert.deepEqual(initial.transitions[0].requires, ["requested act", "evidence"]);
  assert.equal(initial.bindingEffect, "informational-only");
  assert.equal(
    formatZelo(initial),
    "proposal is currently draft-proposal. Lawful next move(s):\nproposed — by proposer; needs requested act, evidence",
  );

  const terminal = civicState(context, { artifactKind: "proposal", state: "enacted" });
  assert.deepEqual(terminal.transitions, []);
  assert.equal(formatZelo(terminal), "proposal is currently enacted; the enacted protocol names no automatic next transition from there.");

  assert.throws(() => civicState(context, { artifactKind: "spell" }), /unknown Turntide civic artifact kind "spell"/u);
});

test("authorityBoundary separates the authority domains and refuses unknown ones", async () => {
  const context = await loadZeloCivicContext(FIXTURE_ROOT);
  const tidepool = authorityBoundary(context, " Tidepool ");
  assert.equal(tidepool.subject, "tidepool");
  assert.equal(tidepool.authorityDomain, "tidepool-financial-membership");
  assert.equal(tidepool.standingMustBeRecorded, true);
  assert.equal(tidepool.bindingEffect, "informational-only");
  assert.equal(formatZelo(authorityBoundary(context, "discord")), "Discord participation and roles are civic instruments; they do not create Turntide governance standing.");
  assert.throws(() => authorityBoundary(context, "moon"), /unknown authority domain "moon"/u);
});

test("rehearseCivicMove is a nonbinding dry run that creates nothing", async () => {
  const context = await loadZeloCivicContext(FIXTURE_ROOT);
  const rehearsal = rehearseCivicMove(context, { artifactKind: "proposal", state: "proposed" });
  assert.equal(rehearsal.type, "ZeloGovernanceRehearsal");
  assert.equal(rehearsal.nonbinding, true);
  assert.deepEqual({ ...rehearsal.creates }, { standing: false, vote: false, decision: false, authority: false, execution: false });
  assert.deepEqual(rehearsal.scenario.transitions.map((move) => move.to), ["enacted"]);
  assert.match(formatZelo(rehearsal), /^DRY RUN — no standing, vote, decision, authority, or execution is created\.\nproposal is currently proposed\./u);
});

test("receivedTeachingExamples offers only received, teaching-eligible acts and never as precedent", async () => {
  const context = await loadZeloCivicContext(FIXTURE_ROOT);
  const examples = receivedTeachingExamples(context);
  assert.equal(examples.length, 1);
  assert.equal(examples[0].id, "fixture-act-received");
  assert.equal(examples[0].lesson, "Fixture lesson: execution and receiving are separate.");
  assert.equal(examples[0].precedentEffect, "none");
});

test("scheduledCivicReview baselines silently on first observation", async () => {
  const context = await loadZeloCivicContext(FIXTURE_ROOT);
  const now = "2026-01-10T12:00:00.000Z";
  const baseline = scheduledCivicReview(context, { state: {}, now });
  assert.deepEqual(baseline.outputs, []);
  assert.equal(baseline.nextState.initialized, true);
  assert.deepEqual(baseline.nextState.knownReceivedActIds, ["fixture-act-received"]);
  assert.deepEqual(baseline.nextState.pendingTeachingIds, []);
  assert.equal(baseline.nextState.lastRunAt["governance-rock-sweep"], now);
  assert.throws(() => scheduledCivicReview(context, { now: "not a time" }), /requires an ISO timestamp/u);
});

test("scheduledCivicReview stays silent when nothing is due and reports only what is", async () => {
  const context = await loadZeloCivicContext(FIXTURE_ROOT);
  const baseline = scheduledCivicReview(context, { state: {}, now: "2026-01-10T12:00:00.000Z" });

  const soon = scheduledCivicReview(context, { state: baseline.nextState, now: "2026-01-10T13:00:00.000Z" });
  assert.deepEqual(soon.outputs, []);

  const nextDay = scheduledCivicReview(context, { state: baseline.nextState, now: "2026-01-11T12:00:00.000Z" });
  assert.deepEqual(nextDay.outputs.map((output) => output.routine), ["decision-action-reconciliation"]);
  assert.equal(
    nextDay.outputs[0].content,
    "Decision/action reconciliation found 1 unsettled governance act(s): fixture-act-unexecuted [not-started] → name or confirm the authorized executor and execution receipt",
  );

  const nextWeek = scheduledCivicReview(context, { state: nextDay.nextState, now: "2026-01-17T12:00:00.000Z" });
  const review = nextWeek.outputs.find((output) => output.routine === "standing-delegation-review");
  assert.ok(review);
  assert.match(review.content, /fixture-unbased-helper/u);
  assert.match(review.content, /not an automatic revocation/u);
});

test("scheduledCivicReview teaches a newly received act once, weekly", async () => {
  const context = await loadZeloCivicContext(FIXTURE_ROOT);
  const baseline = scheduledCivicReview(context, { state: {}, now: "2026-01-10T12:00:00.000Z" });
  const before = { ...baseline.nextState, knownReceivedActIds: [] };
  const taught = scheduledCivicReview(context, { state: before, now: "2026-01-10T13:00:00.000Z" });
  assert.deepEqual(taught.outputs.map((output) => output.routine), ["received-act-teaching-example"]);
  assert.match(taught.outputs[0].content, /^How Turntide governed a real change: Adopt the fixture ledger\. Lesson: Fixture lesson/u);
  assert.deepEqual(taught.nextState.taughtActIds, ["fixture-act-received"]);
  const again = scheduledCivicReview(context, { state: taught.nextState, now: "2026-01-10T14:00:00.000Z" });
  assert.deepEqual(again.outputs, []);
});

test("routineIntent admits only runtime routines and grants no authority", async () => {
  const context = await loadZeloCivicContext(FIXTURE_ROOT);
  const intent = routineIntent(context, { routineId: "governance-rock-sweep" });
  assert.equal(intent.office, "zelo-civic-steward");
  assert.equal(intent.silenceWhenEmpty, true);
  assert.equal(intent.grantsAuthority, false);
  assert.equal(intent.deliveryAdapterIsAuthority, false);
  assert.throws(() => routineIntent(context, { routineId: "unlisted" }), /not admitted to the Zelo civic runtime/u);
});

test("formatZelo falls back to the value itself for an unknown answer", () => {
  assert.equal(formatZelo({ type: "Unknown", n: 1 }), JSON.stringify({ type: "Unknown", n: 1 }));
});


// The civic-kernel laws and delegation events are semantic records in Turntide's governance journal. These
// tests record synthetic ones into a throwaway journal; see fixtures/turntide-governance-journal.mjs.
async function contextWithJournal(t, entries) {
  return loadZeloCivicContext(FIXTURE_ROOT, { journalRoot: await syntheticGovernanceJournal(t, entries) });
}

// The audit requires enacted kernel records; the synthetic records say they are synthetic, so the audit tests
// mark a copy enacted rather than the fixtures pretending to be Turntide's.
function enacted(context) {
  const copy = structuredClone(context);
  for (const key of ["standing", "protocol", "mandate", "routines", "runtime", "standingPathways", "civicPlaces", "decisionClassification", "delegationLaw", "conformanceLaw"]) {
    if (copy[key]) copy[key].status = "enacted";
  }
  return copy;
}

test("without a governance journal the civic-kernel laws read as absent and no delegation registry is derived", async () => {
  const context = await loadZeloCivicContext(FIXTURE_ROOT);
  assert.equal(context.decisionClassification, null);
  assert.equal(context.delegationLaw, null);
  assert.equal(context.conformanceLaw, null);
  assert.equal(context.delegations, null);
  assert.deepEqual(context.delegationEvents, []);
});

test("the civic-kernel laws and delegation events are read from the governance journal", async (t) => {
  const context = await contextWithJournal(t, [...allLaws(), event(activation)]);
  assert.equal(context.decisionClassification.type, "TurntideDecisionClassificationLaw");
  assert.equal(context.delegationLaw.type, "TurntideDelegationEventLaw");
  assert.equal(context.conformanceLaw.type, "TurntideCivicKernelConformanceLaw");
  assert.equal(context.delegations.authorityEffect, "readback-only");
  assert.deepEqual(context.delegations.active.map((entry) => entry.delegationId), [activation.delegationId]);
});

test("a law whose latest journal record is denied or contested is not held, and never falls back", async (t) => {
  const context = await contextWithJournal(t, [
    law("decisionClassification", decisionClassificationLaw, { recordedAt: "2026-01-01T00:00:00.000Z" }),
    law("decisionClassification", { ...decisionClassificationLaw, version: 2 }, { recordedAt: "2026-01-02T00:00:00.000Z", told: { for: true, against: true } }),
  ]);
  assert.equal(context.decisionClassification, null);
  const refused = classifyDecisionProcedure(context, { consequences: ["projection"] });
  assert.equal(refused.state, "refused");
  assert.equal(refused.reason, "classification-law-unavailable");
});

test("the kernel refuses a journal record of the wrong kind under a law category, and a contested delegation event", async (t) => {
  await assert.rejects(
    contextWithJournal(t, [law("conformanceLaw", decisionClassificationLaw)]),
    /civic-kernel-conformance-law record .* is not a TurntideCivicKernelConformanceLaw/u,
  );
  await assert.rejects(
    contextWithJournal(t, [...allLaws(), event(activation), event(revocation, { told: { for: true, against: true } })]),
    /delegation-event: journal record .* is not held/u,
  );
});

test("delegation events are ignored without the delegation-event law", async (t) => {
  const context = await contextWithJournal(t, [law("decisionClassification", decisionClassificationLaw), event(activation)]);
  assert.equal(context.delegations, null);
  assert.deepEqual(context.delegationEvents, []);
});

test("civic kernel conforms when the enacted records and the conformance law agree", async (t) => {
  const context = enacted(await contextWithJournal(t, allLaws()));
  const report = auditCivicKernel(context);
  assert.equal(report.ok, true, JSON.stringify(report.violations));
  assert.deepEqual({ ...report.laws }, { decisionClassification: true, delegationEvents: true, conformance: true });
  assert.equal(report.counts.routines, context.routines.routines.length);
  assert.equal(report.counts.runtimeBindings, context.runtime.routineExecution.length);
  assert.equal(report.authorityEffect, "none");
  assert.match(formatZelo(report), /^Turntide civic kernel conforms: 5 routines, 5 runtime bindings, 0 Zelo protocol transitions\.$/u);
});

test("civic kernel conformance cannot be claimed without the conformance law or over synthetic records", async () => {
  const context = await loadZeloCivicContext(FIXTURE_ROOT);
  const report = auditCivicKernel(context);
  assert.equal(report.ok, false);
  const codes = report.violations.map((entry) => entry.code);
  assert.ok(codes.includes("conformance-law-unavailable"));
  assert.ok(codes.includes("kernel-record-not-enacted"));
  assert.ok(!codes.includes("autonomous-effect-not-admitted"));
  assert.ok(!codes.includes("zelo-protocol-transition-drift"));
  assert.ok(!codes.includes("delegation-transition-missing-event-evidence"));
  assert.equal(auditCivicKernel(enacted(context)).violations.map((entry) => entry.code).join(), "conformance-law-unavailable");
});

test("civic kernel conformance fails closed on authority and scheduler drift", async (t) => {
  const context = enacted(await contextWithJournal(t, allLaws()));
  const codes = (value) => auditCivicKernel(value).violations.map((entry) => entry.code);

  const badEffect = structuredClone(context);
  badEffect.runtime.routineExecution[0].autonomousEffect = "enact-policy";
  assert.ok(codes(badEffect).includes("autonomous-effect-not-admitted"));

  const noisy = structuredClone(context);
  noisy.runtime.routineExecution.find((entry) => entry.mode === "scheduled").silenceWhenEmpty = false;
  assert.ok(codes(noisy).includes("scheduled-routine-must-be-silent-when-empty"));

  const expanded = structuredClone(context);
  expanded.protocol.artifactKinds.proposal.transitions.find((entry) => entry.to === "enacted").mayBePerformedBy.push("zelo-civic-steward");
  assert.ok(codes(expanded).includes("zelo-protocol-transition-drift"));

  const orphanSchedule = structuredClone(context);
  orphanSchedule.runtime.routineExecution.push({
    routine: "imaginary-scheduled-routine",
    mode: "scheduled",
    cadence: "daily",
    preferredDelivery: "governance-action",
    dedupe: "imaginary",
    autonomousEffect: "review-only",
    silenceWhenEmpty: true,
  });
  assert.ok(codes(orphanSchedule).includes("runtime-orphan-routine"));
  assert.ok(codes(orphanSchedule).includes("scheduled-runtime-interpreter-drift"));

  const unevidencedDelegation = structuredClone(context);
  unevidencedDelegation.protocol.artifactKinds.delegation.transitions[0].requires = ["governing act"];
  assert.ok(codes(unevidencedDelegation).includes("delegation-transition-missing-event-evidence"));

  const authorityRegistry = structuredClone(context);
  authorityRegistry.delegationLaw.invariants.derivedRegistryIsProjectionNotAuthoritySource = false;
  assert.ok(codes(authorityRegistry).includes("delegation-law-allows-registry-authority"));
});

test("next-move nudge runs once per artifact state and stays quiet after dedupe", async () => {
  const context = await loadZeloCivicContext(FIXTURE_ROOT);
  const baseline = scheduledCivicReview(context, { now: "2026-01-10T12:00:00.000Z" });
  assert.deepEqual(baseline.outputs, []);
  assert.deepEqual(baseline.nextState.nudgedArtifactStates, ["act:fixture-act-unexecuted:not-started"]);

  const changed = structuredClone(context);
  changed.acts.push({
    type: "TurntideGovernanceAct",
    version: 1,
    id: "fixture-act-new",
    state: "enacted",
    decision: { state: "enacted" },
    execution: { state: "not-started" },
    receiving: { state: "unreceived" },
  });
  const first = scheduledCivicReview(changed, { state: baseline.nextState, now: "2026-01-11T12:00:01.000Z" });
  const nudge = first.outputs.find((entry) => entry.routine === "next-move-nudge");
  assert.ok(nudge);
  assert.equal(nudge.subjectId, "fixture-act-new");
  assert.equal(nudge.bindingEffect, "one-bounded-nudge");
  assert.match(nudge.content, /Zelo will not repeat this nudge until the artifact state or evidence changes/u);

  const second = scheduledCivicReview(changed, { state: first.nextState, now: "2026-01-12T12:00:02.000Z" });
  assert.equal(second.outputs.some((entry) => entry.routine === "next-move-nudge"), false);
});

test("next-move nudge runs only where the runtime declares it, and older state baselines silently", async () => {
  const context = await loadZeloCivicContext(FIXTURE_ROOT);
  const baseline = scheduledCivicReview(context, { now: "2026-01-10T12:00:00.000Z" });
  const { nudgedArtifactStates, ...olderState } = baseline.nextState;
  assert.ok(nudgedArtifactStates);
  const older = scheduledCivicReview(context, { state: olderState, now: "2026-01-11T12:00:00.000Z" });
  assert.equal(older.outputs.some((entry) => entry.routine === "next-move-nudge"), false);
  assert.deepEqual(older.nextState.nudgedArtifactStates, ["act:fixture-act-unexecuted:not-started"]);

  const undeclared = structuredClone(context);
  undeclared.runtime.routineExecution = undeclared.runtime.routineExecution.filter((entry) => entry.routine !== "next-move-nudge");
  const quiet = scheduledCivicReview(undeclared, { state: { ...baseline.nextState, nudgedArtifactStates: [] }, now: "2026-01-11T12:00:00.000Z" });
  assert.equal(quiet.outputs.some((entry) => entry.routine === "next-move-nudge"), false);
});

test("constitutional conformance review runs only where declared, and is silent while the kernel conforms", async (t) => {
  const context = enacted(await contextWithJournal(t, allLaws()));
  context.routines.routines.push({ id: "constitutional-conformance-review", title: "fixture constitutional-conformance-review" });
  context.runtime.routineExecution.push({
    routine: "constitutional-conformance-review",
    mode: "scheduled",
    cadence: "daily",
    preferredDelivery: "governance-action",
    dedupe: "civic-kernel-conformance:evidence-digest",
    autonomousEffect: "review-only",
    silenceWhenEmpty: true,
  });
  const baseline = scheduledCivicReview(context, { now: "2026-01-10T12:00:00.000Z" });
  const healthy = scheduledCivicReview(context, { state: baseline.nextState, now: "2026-01-11T12:00:01.000Z" });
  assert.equal(healthy.outputs.some((entry) => entry.routine === "constitutional-conformance-review"), false);

  const drifted = structuredClone(context);
  drifted.runtime.routineExecution[0].autonomousEffect = "enact-policy";
  const report = scheduledCivicReview(drifted, { state: baseline.nextState, now: "2026-01-11T12:00:01.000Z" });
  const review = report.outputs.find((entry) => entry.routine === "constitutional-conformance-review");
  assert.ok(review);
  assert.match(review.content, /autonomous-effect-not-admitted/u);
  assert.match(review.content, /not authority to auto-repair or expand Zelo powers/u);

  const undeclared = await loadZeloCivicContext(FIXTURE_ROOT);
  const undeclaredBaseline = scheduledCivicReview(undeclared, { now: "2026-01-10T12:00:00.000Z" });
  const silent = scheduledCivicReview(undeclared, { state: undeclaredBaseline.nextState, now: "2026-01-11T12:00:01.000Z" });
  assert.equal(silent.outputs.some((entry) => entry.routine === "constitutional-conformance-review"), false);
});

test("decision classifier makes structural consequence monotone over a requested clerical shortcut", async (t) => {
  const context = await contextWithJournal(t, allLaws());
  const answer = classifyDecisionProcedure(context, {
    authorityDomain: "turntide-governance",
    consequences: ["projection", "standing"],
    currentRecordEvidence: ["record:standing-ledger"],
    requestedProcedure: "record-grounded-correction",
  });
  assert.equal(answer.state, "classified");
  assert.equal(answer.minimumProcedure, "structural-governance-act");
  assert.equal(answer.requestedProcedure.state, "refused-below-minimum");
  assert.equal(answer.authorizationCreated, false);
  assert.ok(answer.reasons.some((reason) => /structural consequence/u.test(reason)));
  assert.match(formatZelo(answer), /^Minimum Turntide procedure: structural-governance-act\..*Classification creates no authority\.$/u);
});

test("decision classifier routes Tidepool financial authority out of Turntide", async (t) => {
  const context = await contextWithJournal(t, allLaws());
  const answer = classifyDecisionProcedure(context, {
    authorityDomain: "tidepool-financial-membership",
    consequences: ["policy"],
    requestedProcedure: "ordinary-governance-act",
  });
  assert.equal(answer.state, "foreign-authority");
  assert.equal(answer.minimumProcedure, null);
  assert.equal(answer.foreignAuthority.routeTo, "fixture Tidepool authority");
  assert.equal(answer.authorizationCreated, false);
});

test("decision classifier permits record-grounded correction only with current-record evidence", async (t) => {
  const context = await contextWithJournal(t, allLaws());
  const withEvidence = classifyDecisionProcedure(context, { consequences: ["projection", "explanation"], currentRecordEvidence: ["record:current-standing"] });
  assert.equal(withEvidence.minimumProcedure, "record-grounded-correction");
  const withoutEvidence = classifyDecisionProcedure(context, { consequences: ["projection", "explanation"] });
  assert.equal(withoutEvidence.minimumProcedure, "ordinary-governance-act");
  assert.ok(withoutEvidence.reasons.some((reason) => /lacks the record evidence/u.test(reason)));
});

test("decision classifier can recognize an enacted routine instance without authorizing execution", async (t) => {
  const context = await contextWithJournal(t, allLaws());
  const answer = classifyDecisionProcedure(context, {
    consequences: ["projection"],
    priorAuthority: { kind: "enacted-routine", id: "civic-orientation" },
    withinPriorAuthority: true,
  });
  assert.equal(answer.state, "classified");
  assert.equal(answer.minimumProcedure, "enacted-routine-instance");
  assert.equal(answer.authorizationCreated, false);
  const unknown = classifyDecisionProcedure(context, {
    consequences: ["projection"],
    priorAuthority: { kind: "enacted-routine", id: "not-a-real-routine" },
    withinPriorAuthority: true,
  });
  assert.equal(unknown.state, "refused");
  assert.equal(unknown.reason, "unknown-enacted-routine");
});

test("decision classifier fails closed on unknown consequence vocabulary and missing consequences", async (t) => {
  const context = await contextWithJournal(t, allLaws());
  const unknown = classifyDecisionProcedure(context, { consequences: ["make-it-vibesier"] });
  assert.equal(unknown.state, "refused");
  assert.equal(unknown.reason, "unknown-consequence");
  assert.deepEqual(unknown.unknownConsequences, ["make-it-vibesier"]);
  const empty = classifyDecisionProcedure(context, {});
  assert.equal(empty.state, "incomplete");
  assert.deepEqual(empty.missing, ["consequences"]);
});

test("delegated-clerical is selected only from independently active exact action and scope readback", async (t) => {
  const context = await contextWithJournal(t, [...allLaws(), event(activation)]);
  const answer = classifyDecisionProcedure(context, {
    consequences: ["projection"],
    priorAuthority: { kind: "active-delegation", id: activation.delegationId },
    requestedAction: "refresh-projection",
    requestedScope: "projection:fixture",
    requestedProcedure: "delegated-clerical",
  });
  assert.equal(answer.state, "classified");
  assert.equal(answer.minimumProcedure, "delegated-clerical");
  assert.equal(answer.requestedProcedure.state, "not-below-minimum");
  assert.equal(answer.authorizationCreated, false);
  assert.equal(answer.delegationReadback.delegationId, activation.delegationId);

  const wrongAction = classifyDecisionProcedure(context, {
    consequences: ["projection"],
    priorAuthority: { kind: "active-delegation", id: activation.delegationId },
    requestedAction: "change-policy",
    requestedScope: "projection:fixture",
  });
  assert.equal(wrongAction.minimumProcedure, "ordinary-governance-act");
  assert.ok(wrongAction.reasons.some((reason) => /not in the delegation's grantedActions/u.test(reason)));

  const wrongScope = classifyDecisionProcedure(context, {
    consequences: ["projection"],
    priorAuthority: { kind: "active-delegation", id: activation.delegationId },
    requestedAction: "refresh-projection",
    requestedScope: "projection:somewhere-else",
  });
  assert.equal(wrongScope.minimumProcedure, "ordinary-governance-act");
  assert.ok(wrongScope.reasons.some((reason) => /does not exactly match delegated scope/u.test(reason)));
});

test("a revoked, caller-claimed, or unreadable delegation cannot lower the procedure floor", async (t) => {
  const claim = {
    consequences: ["projection"],
    priorAuthority: { kind: "active-delegation", id: activation.delegationId },
    requestedAction: "refresh-projection",
    requestedScope: "projection:fixture",
    requestedProcedure: "delegated-clerical",
  };
  const revoked = classifyDecisionProcedure(await contextWithJournal(t, [...allLaws(), event(activation), event(revocation)]), claim);
  assert.equal(revoked.state, "needs-authority-readback");
  assert.equal(revoked.minimumProcedure, "ordinary-governance-act");
  assert.equal(revoked.requestedProcedure.state, "refused-below-minimum");

  const callerOnly = classifyDecisionProcedure(await contextWithJournal(t, allLaws()), { ...claim, priorAuthority: { kind: "active-delegation", id: "delegation:claimed-by-caller" } });
  assert.equal(callerOnly.state, "needs-authority-readback");
  assert.ok(callerOnly.missing.includes("independent active delegation readback"));

  const noLaw = classifyDecisionProcedure(await contextWithJournal(t, [law("decisionClassification", decisionClassificationLaw), event(activation)]), claim);
  assert.equal(noLaw.state, "needs-authority-readback");
  assert.equal(noLaw.delegationReadback, null);
  assert.ok(noLaw.reasons.some((reason) => /holds no delegation-event law/u.test(reason)));
});

test("delegation wayfinding reads back the registry and names delegated standing it cannot prove", async (t) => {
  const none = delegationWayfinding(await loadZeloCivicContext(FIXTURE_ROOT));
  assert.equal(none.registryAvailable, false);
  assert.deepEqual(none.unmatchedStanding, []);
  assert.match(formatZelo(none), /holds no delegation-event law/u);

  const empty = delegationWayfinding(await contextWithJournal(t, allLaws()));
  assert.equal(empty.eventCount, 0);
  assert.deepEqual(empty.unmatchedStanding.map((entry) => entry.id), ["fixture-steward"]);
  assert.match(formatZelo(empty), /^No conforming active delegation events are currently read back\.\nMigration\/conformance exception\(s\): fixture-steward/u);

  const active = delegationWayfinding(await contextWithJournal(t, [...allLaws(), event(activation)]), { delegate: "fixture-steward" });
  assert.deepEqual(active.active.map((entry) => entry.delegationId), [activation.delegationId]);
  assert.deepEqual(active.unmatchedStanding, []);
  assert.match(formatZelo(active), /^- fixture-delegation:clerk: fixture-steward may refresh-projection within projection:fixture/u);
  assert.equal(active.bindingEffect, "informational-only");
});

test("standing review checks delegated standing against readback only where the delegation-event law is held", async (t) => {
  const context = await contextWithJournal(t, allLaws());
  const baseline = scheduledCivicReview(context, { state: {}, now: "2026-01-10T12:00:00.000Z" });
  const week = scheduledCivicReview(context, { state: baseline.nextState, now: "2026-01-17T12:00:00.000Z" });
  const review = week.outputs.find((output) => output.routine === "standing-delegation-review");
  assert.ok(review);
  assert.match(review.content, /^Standing\/delegation review found 2 exception\(s\)/u);
  assert.match(review.content, /fixture-steward \[standing says delegated but the append-only delegation event ledger in Turntide's governance journal contains no conforming active activation\]/u);
  assert.match(review.content, /not automatic revocations or grants/u);
});
