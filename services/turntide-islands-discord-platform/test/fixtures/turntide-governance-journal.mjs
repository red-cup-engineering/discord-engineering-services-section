// Small invented civic-kernel laws and delegation events, recorded at test time into a throwaway Turntide
// governance journal (a semantic record journal, kind "turntide-governance") beside the synthetic governance
// records in ./turntide-governance. None of this is a Turntide record; Turntide's own laws, when it enacts
// them, are recorded by Turntide in its own journal.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { extend } from "@red-cup-engineering/semiotic-eavt-services-section/store";

import { TURNTIDE_GOVERNANCE_JOURNAL_CATEGORIES, TURNTIDE_GOVERNANCE_JOURNAL_KIND } from "../../src/turntide-software-system/zelo-civic-service.mjs";

export const SYNTHETIC = "synthetic test fixture; not a Turntide record";
export const HELD = Object.freeze({ for: true, against: false });

export const decisionClassificationLaw = Object.freeze({
  type: "TurntideDecisionClassificationLaw",
  version: 1,
  status: SYNTHETIC,
  authorityDomain: "turntide-governance",
  authorityEffect: "classification-only",
  consequenceClasses: {
    clerical: ["projection", "index", "explanation", "receipt-projection"],
    ordinary: ["policy", "public-integration", "community-facing-service-boundary"],
    structural: ["standing", "authority-domain", "civic-action-protocol", "office-powers", "decision-procedures", "institutional-identity", "future-governance-rules"],
  },
  procedureFloors: {
    "record-grounded-correction": 10,
    "delegated-clerical": 10,
    "enacted-routine-instance": 10,
    "ordinary-governance-act": 20,
    "structural-governance-act": 30,
  },
  foreignAuthorityDomains: ["tidepool-financial-membership", "tidepool-financial-protocol"],
  rules: {
    structuralConsequenceForcesStructuralProcedure: true,
    unknownConsequenceFailsClosed: true,
    classifierNeverGrantsAuthorization: true,
    proposedProcedureBelowMinimumIsRejected: true,
    delegationShortcutRequiresIndependentActiveReadback: true,
    delegationShortcutRequiresExactActionAndScope: true,
  },
});

export const delegationEventLaw = Object.freeze({
  type: "TurntideDelegationEventLaw",
  version: 1,
  status: SYNTHETIC,
  authorityDomain: "turntide-governance",
  authorityEffect: "authority-readback-only",
  carrier: {
    journalKind: TURNTIDE_GOVERNANCE_JOURNAL_KIND,
    category: TURNTIDE_GOVERNANCE_JOURNAL_CATEGORIES.delegationEvent,
    eventType: "TurntideDelegationEvent",
  },
  invariants: {
    eventIdsUnique: true,
    delegationSequenceUniqueAndContiguous: true,
    firstEventMustActivate: true,
    terminalStateCannotTransitionAgain: true,
    activationMustCiteReceivedEnactedAct: true,
    callerAssertionIsNotReadback: true,
    derivedRegistryIsProjectionNotAuthoritySource: true,
  },
});

// Admits exactly the autonomous effects and Zelo-performable transitions of the synthetic runtime and protocol.
export const conformanceLaw = Object.freeze({
  type: "TurntideCivicKernelConformanceLaw",
  version: 1,
  status: SYNTHETIC,
  allowedAutonomousEffects: ["informational", "status-only", "reconciliation-only", "one-bounded-nudge", "teaching-only", "review-only"],
  allowedZeloProtocolTransitions: [],
});

// fixture-act-received is the synthetic received, enacted act whose origin is fixture-governor.
export const activation = Object.freeze({
  type: "TurntideDelegationEvent",
  version: 1,
  eventId: "fixture-delegation:clerk:1",
  delegationId: "fixture-delegation:clerk",
  event: "activate",
  sequence: 1,
  delegate: "fixture-steward",
  purpose: "keep the fixture projection current",
  scope: "projection:fixture",
  grantedActions: ["refresh-projection"],
  limits: ["no policy changes", "no standing changes"],
  reviewOrExpiry: "the fixture project closes",
  revocationCondition: "revocable by fixture governance",
  receivingCondition: "the projection matches the fixture record",
  grantor: "fixture-governor",
  governingActId: "fixture-act-received",
  recordedAt: "2026-01-04T00:00:00.000Z",
});

export const revocation = Object.freeze({
  type: "TurntideDelegationEvent",
  version: 1,
  eventId: "fixture-delegation:clerk:2",
  delegationId: activation.delegationId,
  event: "revoke",
  sequence: 2,
  reason: "fixture work ended",
  governingActId: "fixture-act-received",
  recordedAt: "2026-01-05T00:00:00.000Z",
});

/**
 * A throwaway governance journal holding the given records in order, each `{ category, record, told }`
 * (told defaults to held). Removed when the test ends.
 */
export async function syntheticGovernanceJournal(t, entries) {
  const root = await mkdtemp(path.join(tmpdir(), "turntide-governance-journal-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  // A law is the record its type's head `current` names, the latest recorded; the events are one thread.
  for (const { category, record, told = HELD } of entries) {
    const plain = told.for === true && told.against === false;
    extend(root, category, category === TURNTIDE_GOVERNANCE_JOURNAL_CATEGORIES.delegationEvent ? "events" : "current", plain ? record : { ...record, told });
  }
  return root;
}

export const law = (key, record, extra = {}) => ({ category: TURNTIDE_GOVERNANCE_JOURNAL_CATEGORIES[key], record, ...extra });
export const event = (record, extra = {}) => ({ category: TURNTIDE_GOVERNANCE_JOURNAL_CATEGORIES.delegationEvent, record, recordedAt: record.recordedAt, ...extra });
export const allLaws = () => [
  law("decisionClassification", decisionClassificationLaw),
  law("delegationLaw", delegationEventLaw),
  law("conformanceLaw", conformanceLaw),
];
