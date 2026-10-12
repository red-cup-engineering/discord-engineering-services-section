import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import { get, readHead, walk } from "@red-cup-engineering/semiotic-eavt-services-section/store";

import { activeDelegationOf, deriveDelegationRegistry } from "./delegation-registry.mjs";

const GOVERNANCE = "data/records/governance";

/**
 * The kind of Turntide's governance journal and the categories of the records the kernel reads from it.
 * The civic-kernel laws and the delegation events are signed, cell-typed semantic records, each carrying
 * its own for/against evidence, kept in Turntide's semiotic-eavt store; they are not files of a new
 * JSON record format. The store belongs to Turntide's public records like the governance directory does.
 * A category is the store type its records are put under: each law is the one record the head `current` of
 * its type names, and the delegation events are the thread the head `events` of their type names. A record
 * told other than plainly for carries `told`.
 */
export const TURNTIDE_GOVERNANCE_JOURNAL_KIND = "turntide-governance";
export const TURNTIDE_GOVERNANCE_JOURNAL_CATEGORIES = Object.freeze({
  decisionClassification: "decision-classification-law",
  delegationLaw: "delegation-event-law",
  conformanceLaw: "civic-kernel-conformance-law",
  delegationEvent: "delegation-event",
});
const LAW_TYPES = Object.freeze({
  decisionClassification: "TurntideDecisionClassificationLaw",
  delegationLaw: "TurntideDelegationEventLaw",
  conformanceLaw: "TurntideCivicKernelConformanceLaw",
});

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function held(row) {
  return row.told === undefined || (row.told.for === true && row.told.against === false);
}

/** A stored record as `{id, record, told?}`: `id` is its address, `told` the telling when it is not plain. */
function rowOf(address, stored) {
  const { told, ...record } = stored;
  return told === undefined ? { id: address, record } : { id: address, record, told };
}

/**
 * The law a journal category currently holds: its latest record, when that record is told for and not
 * against. A newer record that is denied or contested leaves the law unheld rather than falling back to an
 * older version, and a category with no record leaves it absent; either way the kernel reads null.
 */
function heldLaw(journalRoot, key) {
  const type = TURNTIDE_GOVERNANCE_JOURNAL_CATEGORIES[key];
  const frontier = readHead(journalRoot, type, "current")?.frontier ?? [];
  if (frontier.length > 1) throw new TypeError(`Turntide governance journal ${type} holds more than one current record`);
  const stored = frontier.length === 0 ? undefined : get(journalRoot, type, frontier[0]);
  if (frontier.length === 1 && stored === undefined) throw new TypeError(`Turntide governance journal ${type} current record ${frontier[0]} is absent`);
  const latest = stored === undefined ? undefined : rowOf(frontier[0], stored);
  if (latest === undefined || !held(latest)) return null;
  if (latest.record?.type !== LAW_TYPES[key]) {
    throw new TypeError(`Turntide governance journal ${TURNTIDE_GOVERNANCE_JOURNAL_CATEGORIES[key]} record ${latest.id} is not a ${LAW_TYPES[key]}`);
  }
  return Object.freeze(structuredClone(latest.record));
}

/**
 * Every delegation event in the journal. An event that is denied or contested cannot be read back either way
 * (dropping a contested revocation would leave a grant looking active), so the kernel refuses the history.
 */
function delegationEventsOf(journalRoot) {
  const type = TURNTIDE_GOVERNANCE_JOURNAL_CATEGORIES.delegationEvent;
  const frontier = readHead(journalRoot, type, "events")?.frontier ?? [];
  const thread = [...walk(journalRoot, type, frontier, { limit: 100_000 })];
  if (thread.some((item) => item.missing === true || item.truncated === true)) throw new TypeError("delegation-event: the event history is incomplete or too long to read back");
  return Object.freeze(thread.reverse().map(({ address, record }) => rowOf(address, record)).map((row) => {
    if (!held(row)) throw new TypeError(`delegation-event: journal record ${row.id} is not held (told for and not against); a denied or contested event cannot be read back`);
    return Object.freeze(structuredClone(row.record));
  }));
}

/**
 * Load the Turntide governance records the civic kernel reads. The records live
 * in the Turntide public checkout, not beside this code, so the caller names
 * that root (the steward passes TURNTIDE_PUBLIC_ROOT); no location is guessed.
 *
 * The civic-kernel laws (decision classification, delegation events, kernel conformance) and the delegation
 * events are read from Turntide's governance journal at `journalRoot` (the public root unless named). Each is
 * optional: a law Turntide has not recorded reads as null and the logic that needs it says so or stays quiet,
 * and no delegation registry is derived unless the delegation-event law is held.
 */
export async function loadZeloCivicContext(root, { journalRoot = root } = {}) {
  if (typeof root !== "string" || root.trim() === "") {
    throw new TypeError("loadZeloCivicContext requires the Turntide public root (TURNTIDE_PUBLIC_ROOT) holding data/records/governance");
  }
  const governance = resolve(root, GOVERNANCE);
  const [standing, protocol, mandate, routines, runtime, routinePatterns, civicPlaces, standingPathways, tidepoolStatus, tidepoolParticipantGovernance, contestability, decisionProcedures] = await Promise.all([
    readJson(resolve(governance, "current-standing.json")),
    readJson(resolve(governance, "civic-action-protocol.json")),
    readJson(resolve(governance, "zelo-civic-steward.json")),
    readJson(resolve(governance, "civic-routines.json")),
    readJson(resolve(governance, "zelo-civic-runtime.json")),
    readJson(resolve(governance, "routine-pattern-library.json")),
    readJson(resolve(governance, "place-civic-affordances.json")),
    readJson(resolve(governance, "standing-pathways.json")),
    readJson(resolve(governance, "tidepool-civic-status.json")),
    readJson(resolve(governance, "tidepool-participant-governance.json")),
    readJson(resolve(governance, "contestability-pathways.json")),
    readJson(resolve(governance, "decision-procedures.json")),
  ]);
  const actsRoot = resolve(governance, "acts");
  const acts = [];
  for (const name of (await readdir(actsRoot)).filter((name) => name.endsWith(".json")).sort()) {
    acts.push(await readJson(resolve(actsRoot, name)));
  }
  const journal = resolve(journalRoot);
  const decisionClassification = heldLaw(journal, "decisionClassification");
  const delegationLaw = heldLaw(journal, "delegationLaw");
  const conformanceLaw = heldLaw(journal, "conformanceLaw");
  const delegationEvents = delegationLaw === null ? Object.freeze([]) : delegationEventsOf(journal);
  const delegations = delegationLaw === null ? null : deriveDelegationRegistry(delegationEvents, acts);
  return Object.freeze({
    root, standing, protocol, mandate, routines, runtime, routinePatterns, civicPlaces, standingPathways,
    tidepoolStatus, tidepoolParticipantGovernance, contestability, decisionProcedures, decisionClassification,
    delegationLaw, delegations, delegationEvents, conformanceLaw,
    acts: Object.freeze(acts),
  });
}

function artifact(context, kind) {
  const value = context.protocol.artifactKinds?.[kind];
  if (!value) throw new TypeError(`unknown Turntide civic artifact kind ${JSON.stringify(kind)}`);
  return value;
}

function duplicateValues(values) {
  return [...new Set(values.filter((value, index) => values.indexOf(value) !== index))].sort();
}

function transitionKey(value) {
  return `${value.artifactKind}:${value.from}->${value.to}`;
}

/**
 * Audit the executable civic runtime against Turntide's enacted standing, protocol, mandate, routine and
 * runtime records, and against the civic-kernel conformance law when Turntide's governance journal holds
 * one. Without that law the audit still checks what the base records say, and reports the law's absence as
 * a violation: conformance to a law Turntide has not recorded cannot be claimed. The report grants nothing.
 */
export function auditCivicKernel(context) {
  const violations = [];
  const require = (ok, code, detail) => {
    if (!ok) violations.push(Object.freeze({ code, detail }));
  };

  for (const [name, record] of [
    ["standing", context.standing],
    ["protocol", context.protocol],
    ["mandate", context.mandate],
    ["routines", context.routines],
    ["runtime", context.runtime],
    ["standing-pathways", context.standingPathways],
    ["place-affordances", context.civicPlaces],
  ]) require(record?.status === "enacted", "kernel-record-not-enacted", name);
  for (const [name, law] of [
    ["decision-classification-law", context.decisionClassification],
    ["delegation-event-law", context.delegationLaw],
    ["conformance-law", context.conformanceLaw],
  ]) if (law) require(law.status === "enacted", "kernel-record-not-enacted", name);
  require(Boolean(context.conformanceLaw), "conformance-law-unavailable",
    `no ${TURNTIDE_GOVERNANCE_JOURNAL_CATEGORIES.conformanceLaw} record is held in Turntide's governance journal`);

  const routineIds = context.routines.routines.map((routine) => routine.id);
  const runtimeIds = context.runtime.routineExecution.map((entry) => entry.routine);
  require(duplicateValues(routineIds).length === 0, "duplicate-routine-id", duplicateValues(routineIds));
  require(duplicateValues(runtimeIds).length === 0, "duplicate-runtime-routine-id", duplicateValues(runtimeIds));

  const routineSet = new Set(routineIds);
  const runtimeSet = new Set(runtimeIds);
  require(routineIds.every((id) => runtimeSet.has(id)), "routine-missing-runtime-binding", routineIds.filter((id) => !runtimeSet.has(id)));
  require(runtimeIds.every((id) => routineSet.has(id)), "runtime-orphan-routine", runtimeIds.filter((id) => !routineSet.has(id)));

  const allowedEffects = new Set(context.conformanceLaw?.allowedAutonomousEffects ?? []);
  for (const entry of context.runtime.routineExecution) {
    if (context.conformanceLaw) {
      require(allowedEffects.has(entry.autonomousEffect), "autonomous-effect-not-admitted", {
        routine: entry.routine,
        autonomousEffect: entry.autonomousEffect,
      });
    }
    if (entry.mode === "scheduled") {
      require(entry.silenceWhenEmpty === true, "scheduled-routine-must-be-silent-when-empty", entry.routine);
    }
  }

  for (const routine of context.routines.routines) {
    if (routine.mayExecuteAutonomously === true) {
      require(runtimeSet.has(routine.id), "autonomous-routine-missing-runtime", routine.id);
    }
  }

  // A scheduled routine the runtime declares but the kernel does not interpret would silently never run. The
  // kernel runs a routine it supports only when the runtime declares it, so support beyond the declaration
  // is not drift.
  const unsupportedScheduled = context.runtime.routineExecution
    .filter((entry) => entry.mode === "scheduled" && !SCHEDULED_CIVIC_ROUTINES.has(entry.routine))
    .map((entry) => entry.routine)
    .sort();
  require(unsupportedScheduled.length === 0, "scheduled-runtime-interpreter-drift", {
    unsupported: unsupportedScheduled,
    supported: [...SCHEDULED_CIVIC_ROUTINES].sort(),
  });

  require(context.runtime.rules?.runtimeMayExpandAuthority === false, "runtime-may-expand-authority", context.runtime.rules?.runtimeMayExpandAuthority);
  require(context.runtime.rules?.deliveryAdapterIsAuthority === false, "delivery-adapter-is-authority", context.runtime.rules?.deliveryAdapterIsAuthority);
  require(context.runtime.rules?.runtimeMayInferVoteFromDiscord === false, "runtime-may-infer-discord-vote", context.runtime.rules?.runtimeMayInferVoteFromDiscord);
  require(context.runtime.rules?.runtimeMayCreateBindingActFromRehearsal === false, "rehearsal-may-create-binding-act", context.runtime.rules?.runtimeMayCreateBindingActFromRehearsal);
  require(context.standing.principles?.standingRequiresRecord === true, "standing-no-longer-requires-record", context.standing.principles?.standingRequiresRecord);
  require(context.standing.principles?.tidepoolMembershipCreatesTurntideStanding === false, "tidepool-membership-creates-turntide-standing", context.standing.principles?.tidepoolMembershipCreatesTurntideStanding);

  if (context.delegationLaw) {
    require(context.delegations?.type === "TurntideDelegationRegistry", "delegation-registry-unavailable", context.delegations?.type);
    require(context.delegations?.authorityEffect === "readback-only", "delegation-registry-claims-authority", context.delegations?.authorityEffect);
    require(context.delegationLaw.invariants?.derivedRegistryIsProjectionNotAuthoritySource === true,
      "delegation-law-allows-registry-authority", context.delegationLaw.invariants?.derivedRegistryIsProjectionNotAuthoritySource);

    const delegationTransitions = context.protocol.artifactKinds?.delegation?.transitions ?? [];
    const requiredDelegationEvidence = new Map([
      ["requested->active", "append-only activation event in the public delegation carrier"],
      ["active->revoked", "append-only revocation event"],
      ["active->expired", "append-only expiry event carrying the matching condition witness"],
      ["active->superseded", "append-only supersession event"],
    ]);
    for (const transition of delegationTransitions) {
      const key = `${transition.from}->${transition.to}`;
      if (!requiredDelegationEvidence.has(key)) continue;
      require((transition.requires ?? []).includes(requiredDelegationEvidence.get(key)),
        "delegation-transition-missing-event-evidence", { key, required: requiredDelegationEvidence.get(key) });
    }
  }
  if (context.decisionClassification) {
    require(context.decisionClassification.rules?.delegationShortcutRequiresIndependentActiveReadback === true,
      "classifier-no-longer-requires-delegation-readback", context.decisionClassification.rules?.delegationShortcutRequiresIndependentActiveReadback);
  }

  const actualTransitions = [];
  for (const [artifactKind, spec] of Object.entries(context.protocol.artifactKinds ?? {})) {
    for (const transition of spec.transitions ?? []) {
      if ((transition.mayBePerformedBy ?? []).includes("zelo-civic-steward")) {
        actualTransitions.push({ artifactKind, from: transition.from, to: transition.to });
      }
    }
  }
  if (context.conformanceLaw) {
    const admittedTransitions = context.conformanceLaw.allowedZeloProtocolTransitions ?? [];
    const actualKeys = actualTransitions.map(transitionKey).sort();
    const admittedKeys = admittedTransitions.map(transitionKey).sort();
    require(JSON.stringify(actualKeys) === JSON.stringify(admittedKeys), "zelo-protocol-transition-drift", {
      actual: actualKeys,
      admitted: admittedKeys,
    });
  }

  return Object.freeze({
    type: "TurntideCivicKernelConformanceReport",
    version: 1,
    ok: violations.length === 0,
    violations: Object.freeze(violations),
    laws: Object.freeze({
      decisionClassification: context.decisionClassification !== null && context.decisionClassification !== undefined,
      delegationEvents: context.delegationLaw !== null && context.delegationLaw !== undefined,
      conformance: context.conformanceLaw !== null && context.conformanceLaw !== undefined,
    }),
    counts: Object.freeze({
      routines: routineIds.length,
      runtimeBindings: runtimeIds.length,
      autonomousEffects: allowedEffects.size,
      delegationEvents: context.delegations?.eventCount ?? 0,
      activeDelegations: context.delegations?.active.length ?? 0,
      zeloProtocolTransitions: actualTransitions.length,
    }),
    authorityEffect: "none",
  });
}


export function civicState(context, { artifactKind, state }) {
  const spec = artifact(context, artifactKind);
  const current = state ?? spec.initialState;
  const transitions = (spec.transitions ?? []).filter((transition) => transition.from === current);
  return Object.freeze({
    type: "ZeloCivicStateAnswer",
    version: 1,
    artifactKind,
    state: current,
    transitions: Object.freeze(transitions.map((transition) => Object.freeze({
      to: transition.to,
      mayBePerformedBy: Object.freeze([...(transition.mayBePerformedBy ?? [])]),
      requires: Object.freeze([...(transition.requires ?? [])]),
      effect: transition.effect,
    }))),
    bindingEffect: "informational-only",
  });
}

export function orientTurntider(context) {
  const active = context.standing.entries
    .filter((entry) => String(entry.state).includes("active"))
    .map((entry) => ({ id: entry.id, kind: entry.kind, state: entry.state, scope: entry.scope }));
  return Object.freeze({
    type: "ZeloCivicOrientation",
    version: 1,
    polity: "Turntide Islands",
    governance: context.protocol.authorityDomain,
    model: "decentralized-autonomous-organization",
    activeStanding: Object.freeze(active),
    ordinaryPath: Object.freeze([
      "ask a question",
      "open discussion when something may need to change",
      "draft a proposal",
      "place the proposal before recorded governance",
      "execute only after authority exists",
      "receive only when the stated receiving evidence exists",
    ]),
    askZelo: Object.freeze([
      "what state is this in?",
      "what is the smallest lawful next move?",
      "who can make that move?",
      "what evidence or authority is missing?",
      "walk me through this as a nonbinding rehearsal",
      "does this belong to Turntide governance or Tidepool governance?",
    ]),
    bindingEffect: "informational-only",
  });
}


export function explainTurntide(context) {
  return Object.freeze({
    type: "ZeloTurntideExplanation",
    version: 1,
    polity: Object.freeze({
      name: "Turntide Islands",
      kind: "DAO community",
      authority: "recorded standing, delegations, and governing acts",
    }),
    layers: Object.freeze([
      Object.freeze({
        id: "community",
        title: "Community",
        explanation: "Turntide is the people and agents participating in the islands: asking, learning, sharing observations, organizing, making, and helping each other.",
        bindingEffect: "participation itself grants no governance standing",
      }),
      Object.freeze({
        id: "governance",
        title: "DAO governance",
        explanation: "Questions and discussion are open participation; proposals ask for explicit acts; binding decisions require current recorded authority; execution and receiving are tracked separately.",
        bindingEffect: "only recorded authority can create binding Turntide acts",
      }),
      Object.freeze({
        id: "instruments",
        title: "Instruments",
        explanation: "Discord, the public site, Zelo, provider systems, and Tidepool are instruments or adjacent systems. Capability to act does not make an instrument sovereign.",
        bindingEffect: "none",
      }),
    ]),
    usefulQuestions: Object.freeze([
      "How can I help without being a governor?",
      "What state is this matter in?",
      "How do I turn this into a proposal?",
      "Could this repeated work become a routine?",
      "What can Zelo do here, and what still needs a person or governing act?",
      "Is this Turntide governance or Tidepool governance?",
    ]),
    bindingEffect: "informational-only",
  });
}

export function participationPaths(context) {
  return Object.freeze({
    type: "ZeloParticipationPaths",
    version: 1,
    standingRequiredToBegin: false,
    paths: Object.freeze([
      Object.freeze({
        id: "ask",
        action: "Ask a question or challenge an explanation.",
        creates: "information or discussion",
        standingRequired: false,
        bindingEffect: "none",
      }),
      Object.freeze({
        id: "discuss",
        action: "Join discussion, add lived experience, objections, evidence, or alternatives.",
        creates: "deliberative input",
        standingRequired: false,
        bindingEffect: "none",
      }),
      Object.freeze({
        id: "propose",
        action: "Draft or submit a concrete proposal for Turntide to consider.",
        creates: "a governance artifact that current governance may enact, refuse, or supersede",
        standingRequired: false,
        bindingEffect: "proposal only",
      }),
      Object.freeze({
        id: "volunteer",
        action: "Offer to carry out an already-authorized task or ask for a bounded delegation.",
        creates: "an execution offer or delegation request",
        standingRequired: false,
        bindingEffect: "none until accepted or delegated",
      }),
      Object.freeze({
        id: "routine",
        action: "Point out repeated work and ask Zelo to turn it into a routine candidate.",
        creates: "a routine candidate",
        standingRequired: false,
        bindingEffect: "draft only",
      }),
      Object.freeze({
        id: "govern",
        action: "Exercise binding governance authority.",
        creates: "a binding civic transition when the applicable rule and evidence are satisfied",
        standingRequired: true,
        bindingEffect: "depends on recorded standing or delegation",
      }),
    ]),
    currentStandingRule: context.standing.principles.standingRequiresRecord === true
      ? "Binding authority requires a current record; participation does not."
      : "See the current standing ledger.",
    bindingEffect: "informational-only",
  });
}

function normalizePlace(place) {
  return String(place ?? "").trim().toLowerCase().replace(/^#/, "");
}

export function contestWayfinding(context, { kind = null } = {}) {
  const selected = kind === null
    ? context.contestability.pathways
    : context.contestability.pathways.filter((entry) => entry.id === String(kind).trim().toLowerCase());
  if (kind !== null && selected.length === 0) throw new TypeError(`unknown Turntide contestability path ${JSON.stringify(kind)}`);
  const executed = civicState(context, { artifactKind: "decision", state: "executed" }).transitions.find((move) => move.to === "contested");
  const received = civicState(context, { artifactKind: "decision", state: "received" }).transitions.find((move) => move.to === "reopened");
  return Object.freeze({
    type: "ZeloContestabilityWayfinding",
    version: 1,
    standingRequiredToRaiseEvidence: !context.contestability.rules.standingNotRequiredToRaiseEvidence,
    pathways: Object.freeze(selected.map((entry) => Object.freeze(structuredClone(entry)))),
    evidenceTemplate: Object.freeze({ ...context.contestability.evidenceTemplate }),
    protocol: Object.freeze({
      executedToContested: executed === undefined ? null : Object.freeze({
        mayBePerformedBy: Object.freeze([...executed.mayBePerformedBy]),
        requires: Object.freeze([...executed.requires]),
        effect: executed.effect,
      }),
      receivedToReopened: received === undefined ? null : Object.freeze({
        mayBePerformedBy: Object.freeze([...received.mayBePerformedBy]),
        requires: Object.freeze([...received.requires]),
        effect: received.effect,
      }),
    }),
    note: "Raising contradictory or missing evidence is open participation. Contesting evidence does not automatically reverse, suspend, reopen, or invalidate an act.",
    bindingEffect: "informational-and-draft-only",
  });
}

function normalizedDecisionToken(value) {
  return String(value ?? "").trim().toLowerCase();
}

function uniqueDecisionTokens(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(normalizedDecisionToken).filter(Boolean))].sort();
}

function decisionProcedureRecord(context, id) {
  return context.decisionProcedures.procedures.find((entry) => entry.id === id) ?? null;
}

function requestedProcedureAssessment(context, requestedProcedure, minimumProcedure) {
  if (requestedProcedure === undefined || requestedProcedure === null || String(requestedProcedure).trim() === "") return null;
  const requested = normalizedDecisionToken(requestedProcedure);
  const floors = context.decisionClassification.procedureFloors ?? {};
  if (!Object.hasOwn(floors, requested)) {
    return Object.freeze({
      requested,
      state: "refused-nonterminal-or-unknown-procedure",
      note: "The requested procedure is not one of the terminal procedure floors admitted by the classification law.",
    });
  }
  const requestedRank = floors[requested];
  const minimumRank = floors[minimumProcedure];
  return Object.freeze({
    requested,
    state: requestedRank < minimumRank ? "refused-below-minimum" : "not-below-minimum",
    requestedRank,
    minimumRank,
    note: requestedRank < minimumRank
      ? "Turntide refuses procedural downgrade below the consequence-derived minimum."
      : "This comparison only proves the requested procedure is not below the minimum; it does not grant authority or satisfy that procedure's own conditions.",
  });
}

/**
 * Derive a conservative minimum decision procedure from typed civic facts.
 * This is a procedure-floor classifier, never an authorizer or natural-language
 * policy oracle. Unknown consequence labels fail closed; structural effects
 * dominate convenience claims; foreign financial authority routes out of Turntide.
 */
export function classifyDecisionProcedure(context, input = {}) {
  const law = context.decisionClassification;
  const domain = normalizedDecisionToken(input.authorityDomain || "turntide-governance");
  const consequences = uniqueDecisionTokens(input.consequences);
  const base = {
    type: "ZeloDecisionProcedureClassification",
    version: 1,
    authorityDomain: domain,
    consequences: Object.freeze(consequences),
    authorizationCreated: false,
    bindingEffect: "informational-only",
  };
  if (!law) {
    return Object.freeze({
      ...base,
      state: "refused",
      minimumProcedure: null,
      reason: "classification-law-unavailable",
      requestedProcedure: null,
    });
  }
  const classes = law.consequenceClasses ?? {};
  const knownConsequences = new Set(Object.values(classes).flat());
  const unknownConsequences = consequences.filter((value) => !knownConsequences.has(value));

  if (unknownConsequences.length > 0) {
    return Object.freeze({
      ...base,
      state: "refused",
      minimumProcedure: null,
      reason: "unknown-consequence",
      unknownConsequences: Object.freeze(unknownConsequences),
      requestedProcedure: null,
    });
  }

  const foreignDomains = new Set(law.foreignAuthorityDomains ?? []);
  if (foreignDomains.has(domain)) {
    const foreign = context.decisionProcedures.foreignAuthorityRoutes.find((entry) => entry.id === "tidepool-financial-governance") ?? null;
    return Object.freeze({
      ...base,
      state: "foreign-authority",
      minimumProcedure: null,
      foreignAuthority: foreign === null ? null : Object.freeze(structuredClone(foreign)),
      reason: "Tidepool financial authority is outside Turntide decision authority.",
      requestedProcedure: null,
    });
  }
  if (domain !== "turntide-governance") {
    return Object.freeze({
      ...base,
      state: "refused",
      minimumProcedure: null,
      reason: "unknown-authority-domain",
      requestedProcedure: null,
    });
  }
  if (consequences.length === 0) {
    return Object.freeze({
      ...base,
      state: "incomplete",
      minimumProcedure: null,
      reason: "consequences-required",
      missing: Object.freeze(["consequences"]),
      requestedProcedure: null,
    });
  }

  const structural = consequences.filter((value) => (classes.structural ?? []).includes(value));
  const ordinary = consequences.filter((value) => (classes.ordinary ?? []).includes(value));
  const clericalOnly = consequences.every((value) => (classes.clerical ?? []).includes(value));
  const currentRecordEvidence = uniqueDecisionTokens(input.currentRecordEvidence);
  const prior = input.priorAuthority && typeof input.priorAuthority === "object"
    ? { kind: normalizedDecisionToken(input.priorAuthority.kind), id: String(input.priorAuthority.id ?? "").trim() }
    : { kind: "", id: "" };

  let state = "classified";
  let minimumProcedure;
  const reasons = [];
  let missing = [];

  if (structural.length > 0) {
    minimumProcedure = "structural-governance-act";
    reasons.push(`structural consequence: ${structural.join(", ")}`);
  } else if (input.contested === true || input.createsNewPolicy === true || ordinary.length > 0) {
    minimumProcedure = "ordinary-governance-act";
    if (input.contested === true) reasons.push("contested matter cannot use a clerical shortcut");
    if (input.createsNewPolicy === true) reasons.push("new policy requires an explicit governance act");
    if (ordinary.length > 0) reasons.push(`ordinary governance consequence: ${ordinary.join(", ")}`);
  } else if (prior.kind === "enacted-routine") {
    const knownRoutine = context.routines.routines.some((routine) => routine.id === prior.id);
    if (!knownRoutine) {
      return Object.freeze({
        ...base,
        state: "refused",
        minimumProcedure: null,
        reason: "unknown-enacted-routine",
        priorAuthority: Object.freeze(prior),
        requestedProcedure: null,
      });
    }
    if (input.withinPriorAuthority === true && clericalOnly) {
      minimumProcedure = "enacted-routine-instance";
      reasons.push(`known enacted routine ${prior.id}; exact-scope claim still requires runtime/receiver enforcement`);
    } else {
      minimumProcedure = "ordinary-governance-act";
      reasons.push("routine shortcut not proven wholly inside the enacted routine's authority boundary");
    }
  } else if (prior.kind === "active-delegation") {
    const delegation = context.delegations ? activeDelegationOf(context.delegations, prior.id) : null;
    if (delegation === null) {
      minimumProcedure = "ordinary-governance-act";
      state = "needs-authority-readback";
      missing = ["independent active delegation readback"];
      reasons.push(context.delegations
        ? `no active delegation event readback exists for ${prior.id}; caller assertion cannot establish authority`
        : `Turntide's governance journal holds no delegation-event law, so ${prior.id} cannot be read back; caller assertion cannot establish authority`);
    } else {
      const requestedAction = String(input.requestedAction ?? "").trim();
      const requestedScope = String(input.requestedScope ?? "").trim();
      if (requestedAction === "" || requestedScope === "") {
        minimumProcedure = "ordinary-governance-act";
        state = "needs-authority-match";
        missing = [
          ...(requestedAction === "" ? ["requestedAction"] : []),
          ...(requestedScope === "" ? ["requestedScope"] : []),
        ];
        reasons.push("delegated-clerical classification requires an explicit requested action and scope to compare against the active delegation");
      } else {
        const actionAllowed = delegation.grantedActions.includes(requestedAction);
        const scopeMatches = delegation.scope === requestedScope;
        if (clericalOnly && actionAllowed && scopeMatches) {
          minimumProcedure = "delegated-clerical";
          reasons.push(`active delegation ${prior.id} independently read back; requested action and scope match its bounded grant`);
        } else {
          minimumProcedure = "ordinary-governance-act";
          if (!clericalOnly) reasons.push("delegation cannot downgrade non-clerical consequences");
          if (!actionAllowed) reasons.push(`requested action ${JSON.stringify(requestedAction)} is not in the delegation's grantedActions`);
          if (!scopeMatches) reasons.push(`requested scope ${JSON.stringify(requestedScope)} does not exactly match delegated scope ${JSON.stringify(delegation.scope)}`);
        }
      }
    }
  } else if (clericalOnly && currentRecordEvidence.length > 0) {
    minimumProcedure = "record-grounded-correction";
    reasons.push("clerical-only correction carries checkable current-record evidence and creates no new policy");
  } else {
    minimumProcedure = "ordinary-governance-act";
    reasons.push(clericalOnly
      ? "clerical-looking change lacks the record evidence or admitted prior authority required for a shortcut"
      : "no lower-constraint admitted prior authority establishes the requested change");
  }

  const procedure = decisionProcedureRecord(context, minimumProcedure);
  if (procedure === null) throw new TypeError(`decision classification law names missing procedure ${minimumProcedure}`);
  const requestedProcedure = requestedProcedureAssessment(context, input.requestedProcedure, minimumProcedure);

  return Object.freeze({
    ...base,
    state,
    minimumProcedure,
    procedure: Object.freeze(structuredClone(procedure)),
    reasons: Object.freeze(reasons),
    ...(missing.length === 0 ? {} : { missing: Object.freeze(missing) }),
    priorAuthority: prior.kind === "" ? null : Object.freeze(prior),
    ...(prior.kind === "active-delegation"
      ? { delegationReadback: context.delegations ? activeDelegationOf(context.delegations, prior.id) : null }
      : {}),
    currentRecordEvidence: Object.freeze(currentRecordEvidence),
    requestedProcedure,
  });
}


export function decisionProcedureWayfinding(context, { kind = null } = {}) {
  const selected = kind === null
    ? context.decisionProcedures.procedures
    : context.decisionProcedures.procedures.filter((entry) => entry.id === String(kind).trim().toLowerCase());
  if (kind !== null && selected.length === 0) {
    const foreign = context.decisionProcedures.foreignAuthorityRoutes.find((entry) => entry.id === String(kind).trim().toLowerCase());
    if (foreign) {
      return Object.freeze({
        type: "ZeloDecisionProcedureWayfinding",
        version: 1,
        kind: foreign.id,
        foreignAuthority: Object.freeze(structuredClone(foreign)),
        procedures: Object.freeze([]),
        numericVotingWeightsEstablished: context.standing.activeParticipation.numericVotingWeightsEstablished === true,
        note: "This matter is outside Turntide decision authority; Zelo can explain and route but cannot manufacture authority.",
        bindingEffect: "informational-only",
      });
    }
    throw new TypeError(`unknown Turntide decision procedure ${JSON.stringify(kind)}`);
  }
  return Object.freeze({
    type: "ZeloDecisionProcedureWayfinding",
    version: 1,
    kind: kind === null ? null : String(kind).trim().toLowerCase(),
    foreignAuthority: null,
    procedures: Object.freeze(selected.map((entry) => Object.freeze(structuredClone(entry)))),
    numericVotingWeightsEstablished: context.standing.activeParticipation.numericVotingWeightsEstablished === true,
    note: "Turntide selects a decision procedure by authority and consequence, not by reactions, message volume, popularity, or convenience. Proposal state, decision authority, execution, and receiving stay separate.",
    bindingEffect: "informational-only",
  });
}


export function delegationWayfinding(context, { delegationId = null, delegate = null } = {}) {
  if (!context.delegations) {
    return Object.freeze({
      type: "ZeloDelegationWayfinding",
      version: 1,
      registryAvailable: false,
      eventCount: 0,
      states: Object.freeze([]),
      active: Object.freeze([]),
      unmatchedStanding: Object.freeze([]),
      note: "Turntide's governance journal holds no delegation-event law, so Zelo derives no delegation registry and cannot independently read a delegation back. Standing remains as recorded; a caller's claim of delegation is not readback.",
      bindingEffect: "informational-only",
    });
  }
  const wantedId = delegationId === null ? null : String(delegationId).trim();
  const wantedDelegate = delegate === null ? null : String(delegate).trim();
  let states = context.delegations.states;
  if (wantedId) states = states.filter((entry) => entry.delegationId === wantedId);
  if (wantedDelegate) states = states.filter((entry) => entry.delegate === wantedDelegate);
  const active = states.filter((entry) => entry.state === "active");
  const standingClaims = context.standing.entries.filter((entry) => String(entry.state).includes("delegated"));
  const unmatchedStanding = standingClaims.filter((entry) =>
    !context.delegations.active.some((delegation) => delegation.delegate === entry.id));
  return Object.freeze({
    type: "ZeloDelegationWayfinding",
    version: 1,
    registryAvailable: true,
    eventCount: context.delegations.eventCount,
    states: Object.freeze(states.map((entry) => Object.freeze(structuredClone(entry)))),
    active: Object.freeze(active.map((entry) => Object.freeze(structuredClone(entry)))),
    unmatchedStanding: Object.freeze(unmatchedStanding.map((entry) => Object.freeze({
      id: entry.id,
      state: entry.state,
      scope: entry.scope,
      basis: entry.basis,
      problem: "standing says delegated but no conforming active delegation event independently proves that modern bounded grant",
    }))),
    note: "The delegation registry is derived from the append-only delegation events in Turntide's governance journal. It is readback, not a grant. Missing event history does not auto-revoke older standing; it is a conformance exception to repair through governance.",
    bindingEffect: "informational-only",
  });
}

export function standingWayfinding(context) {
  return Object.freeze({
    type: "ZeloStandingWayfinding",
    version: 1,
    authorityEffect: context.standingPathways.authorityEffect,
    standingRequiresRecord: context.standing.principles.standingRequiresRecord === true,
    pathways: Object.freeze(context.standingPathways.pathways.map((path) => Object.freeze({
      id: path.id,
      title: path.title,
      when: path.when,
      creates: path.creates,
      requires: path.requires,
      zeloCan: path.zeloCan,
      next: path.next,
    }))),
    currentStanding: Object.freeze(context.standing.entries.map((entry) => Object.freeze({
      id: entry.id,
      kind: entry.kind,
      state: entry.state,
      scope: entry.scope,
    }))),
    note: "Turntide has no automatic promotion ladder. Participation is open; authority must remain legible as a recorded standing or delegation.",
    bindingEffect: "informational-only",
  });
}


export function placeCivicGuide(context, { place } = {}) {
  const normalized = normalizePlace(place);
  if (normalized === "") throw new TypeError("Turntide place is required");
  const matches = context.civicPlaces.places.filter((entry) =>
    normalizePlace(entry.id) === normalized || (entry.aliases ?? []).map(normalizePlace).includes(normalized));
  if (matches.length === 0) {
    return Object.freeze({
      type: "ZeloPlaceCivicGuide",
      version: 1,
      place: normalized,
      known: false,
      note: "That place is not in Turntide's civic affordance map yet. Zelo can still help classify the work or draft a place-map improvement.",
      bindingEffect: "informational-only",
    });
  }
  const patterns = context.routinePatterns.patterns.filter((pattern) =>
    pattern.places.map(normalizePlace).includes(normalized));
  return Object.freeze({
    type: "ZeloPlaceCivicGuide",
    version: 1,
    place: normalized,
    known: true,
    affordances: Object.freeze(matches.map((entry) => Object.freeze({
      id: entry.id,
      title: entry.title,
      civicPurpose: entry.civicPurpose,
      ordinaryMoves: Object.freeze([...(entry.ordinaryMoves ?? [])]),
      routineSeeds: Object.freeze([...(entry.routineSeeds ?? [])]),
      escalation: entry.escalation,
      zeloPrompts: Object.freeze([...(entry.zeloPrompts ?? [])]),
      authorityBoundary: entry.authorityBoundary,
    }))),
    routinePatterns: Object.freeze(patterns.map((pattern) => Object.freeze({
      id: pattern.id,
      title: pattern.title,
      useWhen: pattern.useWhen,
    }))),
    next: "Pick an ordinary move, ask Zelo one of the prompts, or describe repeated work and ask for routine studio. Binding changes still follow Turntide's civic action protocol.",
    bindingEffect: "informational-only",
    createsAuthority: false,
    createsRoutine: false,
  });
}


export function routineStudio(context, { place, observation = "" } = {}) {
  const normalized = normalizePlace(place);
  const patterns = context.routinePatterns.patterns.filter((pattern) =>
    normalized === "" || pattern.places.map(normalizePlace).includes(normalized));
  return Object.freeze({
    type: "ZeloRoutineStudio",
    version: 1,
    place: normalized || null,
    observation: String(observation ?? "").trim() || null,
    patterns: Object.freeze(patterns.map((pattern) => Object.freeze({
      id: pattern.id,
      title: pattern.title,
      useWhen: pattern.useWhen,
      places: Object.freeze([...pattern.places]),
      draft: Object.freeze({
        observedRepetition: String(observation ?? "").trim() || pattern.useWhen,
        ...pattern.candidateDefaults,
      }),
      state: "advisory-pattern",
      bindingEffect: "none",
    }))),
    next: patterns.length === 0
      ? "Name a Turntide place or describe the repeated work so Zelo can draft a routine candidate from the civic routine schema."
      : "Choose a pattern and revise its draft around the actual observed repetition; proposing or enacting it remains a separate civic transition.",
    enactmentCreated: false,
    authorityCreated: false,
  });
}


export function routineFromPattern(context, { patternId, observation } = {}) {
  const pattern = context.routinePatterns.patterns.find((candidate) => candidate.id === patternId);
  if (!pattern) throw new TypeError(`unknown Turntide routine pattern ${JSON.stringify(patternId)}`);
  const observedRepetition = String(observation ?? "").trim();
  if (observedRepetition === "") {
    return Object.freeze({
      type: "ZeloRoutinePatternDraft",
      version: 1,
      state: "incomplete",
      patternId,
      missing: Object.freeze(["observedRepetition"]),
      note: "An advisory pattern is not evidence of demand; name the repeated work before Zelo can form a routine candidate.",
      bindingEffect: "none",
    });
  }
  const draft = draftRoutineCandidate(context, {
    observedRepetition,
    ...pattern.candidateDefaults,
  });
  return Object.freeze({
    type: "ZeloRoutinePatternDraft",
    version: 1,
    patternId,
    patternTitle: pattern.title,
    routine: draft,
    bindingEffect: draft.bindingEffect,
  });
}

export function tidepoolParticipantGuide(context, { lane = null } = {}) {
  const guide = context.tidepoolParticipantGovernance;
  const selected = lane === null
    ? guide.lanes
    : guide.lanes.filter((entry) => entry.id === String(lane).trim().toLowerCase());
  if (lane !== null && selected.length === 0) throw new TypeError(`unknown Tidepool governance lane ${JSON.stringify(lane)}`);
  return Object.freeze({
    type: "ZeloTidepoolParticipantGovernanceGuide",
    version: 1,
    authorityDomain: guide.authorityDomain,
    lanes: Object.freeze(selected.map((entry) => Object.freeze(structuredClone(entry)))),
    currentExecutionBoundary: Object.freeze(structuredClone(guide.currentExecutionBoundary)),
    currentState: Object.freeze({
      asOf: context.tidepoolStatus.observedAt,
      runtime: context.tidepoolStatus.runtime.operationState,
      protocolClerk: context.tidepoolStatus.executor.incumbentState,
      firstOperatingLoop: context.tidepoolStatus.firstOperatingLoop.state,
      blocker: context.tidepoolStatus.firstOperatingLoop.currentBlocker,
    }),
    bindingEffect: "informational-only",
    createsMembership: false,
    createsVote: false,
    createsFinancialAuthority: false,
  });
}

export function tidepoolCivicMap(context) {
  const status = context.tidepoolStatus;
  const participant = tidepoolParticipantGuide(context);
  return Object.freeze({
    type: "ZeloTidepoolCivicMap",
    version: 3,
    relationship: "Tidepool is Turntide-adjacent but financially governed in the separate tidepool-financial-membership authority domain.",
    asOf: status.observedAt,
    currentState: Object.freeze({
      runtime: status.runtime.operationState,
      installedOperations: Object.freeze([...status.runtime.operations]),
      generalCivicOfficeAvailability: status.runtime.availableToGeneralTurntideOrBoardOffice,
      protocolClerk: status.executor.incumbentState,
      protocolClerkSeatReady: status.executor.seatReady === true,
      participantIntentOperations: Object.freeze([...(status.executor.participantIntentOperations ?? [])]),
      protocolCloseCandidates: Object.freeze([...(status.executor.protocolCloseCandidates ?? [])]),
      staffing: status.staffing.state,
      firstOperatingLoop: status.firstOperatingLoop.state,
      blocker: status.firstOperatingLoop.currentBlocker,
    }),
    participantGovernance: participant.lanes,
    paths: Object.freeze([
      Object.freeze({
        id: "status",
        ask: "What is Tidepool and what is actually received or available?",
        route: "Zelo may explain current durable/public receipts and unavailable states.",
        authority: "informational",
        zeloMayDo: true,
      }),
      ...participant.lanes.map((lane) => Object.freeze({
        id: lane.id,
        ask: lane.participantQuestion,
        route: lane.zeloRole,
        authority: "tidepool-financial-membership",
        zeloMayDo: "explain-and-route-only",
      })),
      Object.freeze({
        id: "turntide-integration",
        ask: "Should Turntide link to, explain, host discussion about, or otherwise integrate Tidepool?",
        route: "This is a Turntide governance/product-surface question and may become Turntide discussion or a proposal.",
        authority: "turntide-governance",
        zeloMayDo: "draft-and-route",
      }),
      Object.freeze({
        id: "financial-operation",
        ask: "Can Zelo move principal, yield, or execute a Tidepool transaction for me?",
        route: "No. Financial execution requires Tidepool-authorized operations and the applicable member/protocol authority.",
        authority: "tidepool-financial-protocol",
        zeloMayDo: false,
      }),
    ]),
    tidepoolMembershipCreatesTurntideStanding: context.standing.principles.tidepoolMembershipCreatesTurntideStanding === true,
    turntideStandingCreatesTidepoolFinancialAuthority: false,
    zeloHasTidepoolProtocolExecutionAuthority: status.authorityBoundaries.zeloHasTidepoolProtocolExecutionAuthority,
    freshness: Object.freeze({ ...status.freshness }),
    bindingEffect: "informational-only",
  });
}

export function authorityBoundary(context, domain) {
  const value = String(domain ?? "").trim().toLowerCase();
  const boundaries = {
    turntide: {
      authorityDomain: "turntide-governance",
      rule: "Turntide-wide authority comes from recorded Turntide standing, delegation, or governing acts.",
    },
    discord: {
      authorityDomain: "turntide-discord-participation",
      rule: "Discord participation and roles are civic instruments; they do not create Turntide governance standing.",
    },
    tidepool: {
      authorityDomain: "tidepool-financial-membership",
      rule: "Tidepool financial membership and voting are governed by Tidepool's own rules and do not automatically grant Turntide-wide standing.",
    },
    provider: {
      authorityDomain: "provider-capability",
      rule: "A 561 Group or infrastructure capability can execute delegated work but does not become Turntide authority merely because it can act.",
    },
  };
  const selected = boundaries[value];
  if (!selected) throw new TypeError(`unknown authority domain ${JSON.stringify(domain)}`);
  return Object.freeze({
    type: "ZeloAuthorityBoundaryAnswer",
    version: 1,
    subject: value,
    ...selected,
    standingMustBeRecorded: context.standing.principles.standingRequiresRecord === true,
    bindingEffect: "informational-only",
  });
}

export function rehearseCivicMove(context, { artifactKind, state }) {
  const answer = civicState(context, { artifactKind, state });
  return Object.freeze({
    type: "ZeloGovernanceRehearsal",
    version: 1,
    nonbinding: true,
    creates: Object.freeze({
      standing: false,
      vote: false,
      decision: false,
      authority: false,
      execution: false,
    }),
    scenario: answer,
    note: "Choose any listed transition to discuss what would be required; rehearsal never performs it.",
  });
}


const PROPOSAL_FIELDS = Object.freeze([
  "proposer",
  "requestedAct",
  "affectedScope",
  "evidence",
  "authorityNeeded",
  "reversibility",
  "receivingCondition",
]);

export function draftProposal(context, input = {}) {
  const missing = PROPOSAL_FIELDS.filter((field) => typeof input[field] !== "string" || input[field].trim() === "");
  const state = civicState(context, { artifactKind: "proposal", state: "draft-proposal" });
  const proposal = state.transitions.find((transition) => transition.to === "proposed");
  if (missing.length > 0) {
    return Object.freeze({
      type: "ZeloProposalDraft",
      version: 1,
      state: "incomplete",
      missing: Object.freeze(missing),
      next: "draft-proposal",
      bindingEffect: "draft-only",
    });
  }
  return Object.freeze({
    type: "ZeloProposalDraft",
    version: 1,
    state: "draft-proposal",
    proposal: Object.freeze(Object.fromEntries(PROPOSAL_FIELDS.map((field) => [field, input[field].trim()]))),
    next: "proposed",
    nextAuthority: Object.freeze([...(proposal?.mayBePerformedBy ?? [])]),
    nextRequires: Object.freeze([...(proposal?.requires ?? [])]),
    note: "This is a private/draft civic artifact. It is not before governance until the separate draft-proposal → proposed transition is performed, and it is not enacted merely because it is proposed.",
    bindingEffect: "draft-only",
  });
}


const DELEGATION_FIELDS = Object.freeze([
  "delegate",
  "purpose",
  "scope",
  "grantedActions",
  "limits",
  "reviewOrExpiry",
  "revocationCondition",
  "receivingCondition",
]);

export function draftDelegationRequest(context, input = {}) {
  const missing = DELEGATION_FIELDS.filter((field) => typeof input[field] !== "string" || input[field].trim() === "");
  if (missing.length > 0) {
    return Object.freeze({
      type: "ZeloDelegationRequestDraft",
      version: 1,
      state: "incomplete",
      missing: Object.freeze(missing),
      bindingEffect: "none",
    });
  }
  const state = civicState(context, { artifactKind: "delegation", state: "requested" });
  const activation = state.transitions.find((transition) => transition.to === "active");
  return Object.freeze({
    type: "ZeloDelegationRequestDraft",
    version: 1,
    state: "requested-draft",
    request: Object.freeze(Object.fromEntries(DELEGATION_FIELDS.map((field) => [field, input[field].trim()]))),
    next: "active",
    activationAuthority: Object.freeze([...(activation?.mayBePerformedBy ?? [])]),
    activationRequires: Object.freeze([...(activation?.requires ?? [])]),
    note: "This draft requests bounded authority. It does not activate the delegation, create standing, or expand any existing scope.",
    bindingEffect: "draft-only",
  });
}

const ROUTINE_FIELD_MAP = Object.freeze({
  "observed repetition": "observedRepetition",
  beneficiary: "beneficiary",
  "trigger-or-cadence": "triggerOrCadence",
  actor: "actor",
  output: "output",
  "authority boundary": "authorityBoundary",
  "failure mode": "failureMode",
  "retirement condition": "retirementCondition",
});

export function draftRoutineCandidate(context, input) {
  const transitions = artifact(context, "routine-candidate").transitions;
  const proposal = transitions.find((transition) => transition.from === "draft" && transition.to === "proposed");
  const required = (proposal?.requires ?? []).map((label) => ROUTINE_FIELD_MAP[label] ?? label);
  const missing = required.filter((field) => typeof input?.[field] !== "string" || input[field].trim() === "");
  if (missing.length > 0) {
    return Object.freeze({
      type: "ZeloRoutineCandidateDraft",
      version: 1,
      state: "incomplete",
      missing: Object.freeze(missing),
      bindingEffect: "none",
    });
  }
  return Object.freeze({
    type: "ZeloRoutineCandidateDraft",
    version: 1,
    state: "draft",
    candidate: Object.freeze(Object.fromEntries(required.map((field) => [field, input[field].trim()]))),
    next: "proposed",
    nextAuthority: Object.freeze([...(proposal.mayBePerformedBy ?? [])]),
    bindingEffect: "draft-only",
  });
}

export function receivedTeachingExamples(context) {
  return Object.freeze(context.acts
    .filter((act) => act.state === "received" && act.teachingUse?.eligible === true)
    .map((act) => Object.freeze({
      id: act.id,
      requestedAct: act.requestedAct,
      authority: act.origin,
      execution: act.execution,
      receiving: act.receiving,
      lesson: act.teachingUse.lesson,
      precedentEffect: "none",
    })));
}


const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const MONTH_MS = 30 * DAY_MS;
// The scheduled routines this kernel interprets. A routine added by PR to this set runs only where Turntide's
// runtime record declares it scheduled (see runtimeSchedules); the set never admits a routine on its own.
const SCHEDULED_CIVIC_ROUTINES = new Set([
  "governance-rock-sweep",
  "decision-action-reconciliation",
  "next-move-nudge",
  "island-routine-discovery",
  "standing-delegation-review",
  "routine-retirement-review",
  "proposal-intake-review",
  "constitutional-conformance-review",
]);

function runtimeSchedules(context, routine) {
  return context.runtime.routineExecution.some((entry) => entry.routine === routine && entry.mode === "scheduled");
}

function civicSnapshot(context) {
  return Object.freeze({
    standing: Object.freeze(context.standing.entries
      .map((entry) => `${entry.id}|${entry.state}|${entry.scope ?? ""}`)
      .sort()),
    // Present only with a derived registry, so a Turntide without the delegation-event law keeps the digest
    // it had before delegation readback existed.
    ...(context.delegations ? {
      delegations: Object.freeze(context.delegations.states
        .map((entry) => `${entry.delegationId}|${entry.state}|${entry.delegate}|${entry.scope}`)
        .sort()),
    } : {}),
    acts: Object.freeze(context.acts
      .map((act) => `${act.id}|${act.state ?? ""}|${act.decision?.state ?? ""}|${act.execution?.state ?? ""}|${act.receiving?.state ?? ""}`)
      .sort()),
    routines: Object.freeze(context.routines.routines.map((routine) => routine.id).sort()),
  });
}

function snapshotDigest(snapshot) {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("base64url");
}

function due(lastAt, interval, nowMs) {
  if (typeof lastAt !== "string") return true;
  const last = Date.parse(lastAt);
  return !Number.isFinite(last) || nowMs - last >= interval;
}

function reconciliationExceptions(context) {
  const exceptions = [];
  for (const act of context.acts) {
    const decision = act.decision?.state;
    const execution = act.execution?.state;
    const receiving = act.receiving?.state;
    if (act.state === "contested") {
      exceptions.push(Object.freeze({ id: act.id, state: "contested", next: "resolve the specific contradiction or falsifying evidence before settlement" }));
    } else if (decision === "enacted" && !["executing", "executed"].includes(execution) && receiving !== "received") {
      exceptions.push(Object.freeze({ id: act.id, state: execution ?? "not-executing", next: "name or confirm the authorized executor and execution receipt" }));
    } else if (execution === "executed" && receiving !== "received") {
      exceptions.push(Object.freeze({ id: act.id, state: receiving ?? "unreceived", next: "supply receiving evidence matching the act's stated receiving condition" }));
    }
  }
  return Object.freeze(exceptions);
}

function nextMoveCandidates(context, proposalSubmissions, previouslySeenProposalIds = []) {
  const candidates = reconciliationExceptions(context).map((entry) => Object.freeze({
    key: `act:${entry.id}:${entry.state}`,
    subjectId: entry.id,
    channel: "governance-action",
    content: `${entry.id} is still ${entry.state}. Smallest next move: ${entry.next}.`,
  }));

  const seenProposals = new Set(previouslySeenProposalIds);
  for (const submission of proposalSubmissions) {
    if (submission?.state !== "proposed" || typeof submission.proposalId !== "string" || !seenProposals.has(submission.proposalId)) continue;
    candidates.push(Object.freeze({
      key: `proposal:${submission.proposalId}:proposed`,
      subjectId: submission.proposalId,
      channel: "governance-proposals",
      content: `${submission.proposalId} remains proposed. Smallest lawful next move: current recorded governance may enact, refuse, or supersede it; participants can add questions, evidence, objections, alternatives, or execution offers without those becoming votes.`,
    }));
  }
  return Object.freeze(candidates.sort((left, right) => left.key.localeCompare(right.key)));
}

function standingExceptions(context) {
  const exceptions = [];
  for (const entry of context.standing.entries) {
    if (String(entry.state).includes("active") && (
      typeof entry.basis !== "string" || entry.basis.trim() === ""
      || typeof entry.scope !== "string" || entry.scope.trim() === ""
    )) {
      exceptions.push(Object.freeze({
        id: entry.id,
        state: entry.state,
        problem: "active standing lacks an explicit basis or scope",
      }));
    }
    // Delegated standing is checked against delegation readback only where Turntide holds the delegation-event
    // law; without it there is no registry, and the absence of an event is not evidence of anything.
    if (context.delegations && String(entry.state).includes("delegated")) {
      const active = context.delegations.active.filter((delegation) => delegation.delegate === entry.id);
      if (active.length === 0) {
        exceptions.push(Object.freeze({
          id: entry.id,
          state: entry.state,
          problem: "standing says delegated but the append-only delegation event ledger in Turntide's governance journal contains no conforming active activation",
          next: "restatement requires a governance act with the modern bounded delegation fields; do not fabricate retroactive authority or auto-revoke the older standing record",
        }));
      }
    }
  }
  return Object.freeze(exceptions);
}

function snapshotChanges(previous, current) {
  const priorStanding = new Set(previous?.standing ?? []);
  const priorDelegations = new Set(previous?.delegations ?? []);
  const priorActs = new Set(previous?.acts ?? []);
  const priorRoutines = new Set(previous?.routines ?? []);
  return Object.freeze({
    standing: current.standing.filter((entry) => !priorStanding.has(entry)),
    delegations: (current.delegations ?? []).filter((entry) => !priorDelegations.has(entry)),
    acts: current.acts.filter((entry) => !priorActs.has(entry)),
    routines: current.routines.filter((entry) => !priorRoutines.has(entry)),
  });
}

/**
 * Derive the bounded scheduled civic outputs that Zelo may deliver from durable
 * Turntide records. The adapter owns clocks and delivery; this function owns
 * meaning. First observation baselines silently so a bot restart cannot turn
 * historical state into unsolicited chatter.
 */
export function scheduledCivicReview(context, { state = {}, routineCandidates = [], proposalSubmissions = [], now = new Date().toISOString() } = {}) {
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) throw new TypeError("scheduled civic review requires an ISO timestamp");
  const snapshot = civicSnapshot(context);
  const digest = snapshotDigest(snapshot);
  const received = context.acts.filter((act) => act.state === "received").map((act) => act.id).sort();
  const candidateIds = routineCandidates.map((candidate) => candidate.id).filter((id) => typeof id === "string").sort();
  const proposalIds = proposalSubmissions
    .filter((submission) => submission?.state === "proposed" && typeof submission.proposalId === "string")
    .map((submission) => submission.proposalId)
    .sort();
  const eligibleTeaching = new Map(receivedTeachingExamples(context).map((example) => [example.id, example]));

  if (state.initialized !== true) {
    return Object.freeze({
      type: "ZeloScheduledCivicReview",
      version: 1,
      outputs: Object.freeze([]),
      nextState: Object.freeze({
        version: 1,
        initialized: true,
        reportedSnapshot: snapshot,
        reportedDigest: digest,
        knownReceivedActIds: Object.freeze(received),
        pendingTeachingIds: Object.freeze([]),
        taughtActIds: Object.freeze([]),
        seenRoutineCandidateIds: Object.freeze(candidateIds),
        seenProposalIds: Object.freeze(proposalIds),
        nudgedArtifactStates: Object.freeze(nextMoveCandidates(context, proposalSubmissions, proposalIds).map((entry) => entry.key)),
        lastRunAt: Object.freeze({
          "governance-rock-sweep": now,
          "decision-action-reconciliation": now,
          "next-move-nudge": now,
          "island-routine-discovery": now,
          "proposal-intake-review": now,
          "standing-delegation-review": now,
          "routine-retirement-review": now,
          "constitutional-conformance-review": now,
        }),
      }),
      bindingEffect: "informational-only",
    });
  }

  const lastRunAt = { ...(state.lastRunAt ?? {}) };
  const outputs = [];
  const knownReceived = new Set(state.knownReceivedActIds ?? []);
  const pendingTeaching = [...(state.pendingTeachingIds ?? [])];
  const taught = new Set(state.taughtActIds ?? []);
  for (const id of received) {
    if (!knownReceived.has(id)) {
      knownReceived.add(id);
      if (eligibleTeaching.has(id) && !taught.has(id) && !pendingTeaching.includes(id)) pendingTeaching.push(id);
    }
  }

  if (due(lastRunAt["governance-rock-sweep"], DAY_MS, nowMs)) {
    const changes = snapshotChanges(state.reportedSnapshot, snapshot);
    if (state.reportedDigest !== digest) {
      const labels = [];
      if (changes.standing.length > 0) labels.push(`${changes.standing.length} standing change(s)`);
      if (changes.delegations.length > 0) labels.push(`${changes.delegations.length} delegation-state change(s)`);
      if (changes.acts.length > 0) labels.push(`${changes.acts.length} governance-act change(s)`);
      if (changes.routines.length > 0) labels.push(`${changes.routines.length} routine-catalog change(s)`);
      outputs.push(Object.freeze({
        routine: "governance-rock-sweep",
        channel: "governance-action",
        content: `Turntide civic state changed since the last quiet sweep: ${labels.join(", ") || "durable state changed"}. Ask Zelo “what changed?” or “what needs a next move?” for the current record-grounded path. No vote, standing, or consensus is inferred from this notice.`,
        bindingEffect: "status-only",
      }));
    }
    lastRunAt["governance-rock-sweep"] = now;
  }

  if (runtimeSchedules(context, "next-move-nudge") && due(lastRunAt["next-move-nudge"], DAY_MS, nowMs)) {
    const candidates = nextMoveCandidates(context, proposalSubmissions, state.seenProposalIds ?? []);
    // State kept before this routine ran has no nudge memory; it baselines silently like a first observation.
    const baselining = state.nudgedArtifactStates === undefined;
    const nudged = new Set(baselining ? candidates.map((entry) => entry.key) : state.nudgedArtifactStates);
    const next = candidates.find((entry) => !nudged.has(entry.key));
    if (next) {
      outputs.push(Object.freeze({
        routine: "next-move-nudge",
        channel: next.channel,
        subjectId: next.subjectId,
        content: `${next.content} Zelo will not repeat this nudge until the artifact state or evidence changes.`,
        bindingEffect: "one-bounded-nudge",
      }));
      nudged.add(next.key);
    }
    state = { ...state, nudgedArtifactStates: [...nudged] };
    lastRunAt["next-move-nudge"] = now;
  }

  if (runtimeSchedules(context, "constitutional-conformance-review") && due(lastRunAt["constitutional-conformance-review"], DAY_MS, nowMs)) {
    const conformance = auditCivicKernel(context);
    if (!conformance.ok) {
      outputs.push(Object.freeze({
        routine: "constitutional-conformance-review",
        channel: "governance-action",
        content: `Turntide civic-kernel conformance found ${conformance.violations.length} violation(s): ${conformance.violations.map((entry) => entry.code).join(", ")}. This is a constitutional-drift exception, not authority to auto-repair or expand Zelo powers.`,
        bindingEffect: "review-only",
      }));
    }
    lastRunAt["constitutional-conformance-review"] = now;
  }

  if (due(lastRunAt["decision-action-reconciliation"], DAY_MS, nowMs)) {
    const exceptions = reconciliationExceptions(context);
    if (exceptions.length > 0) {
      outputs.push(Object.freeze({
        routine: "decision-action-reconciliation",
        channel: "governance-action",
        content: `Decision/action reconciliation found ${exceptions.length} unsettled governance act(s): ${exceptions.map((entry) => `${entry.id} [${entry.state}] → ${entry.next}`).join("; ")}`,
        bindingEffect: "reconciliation-only",
      }));
    }
    lastRunAt["decision-action-reconciliation"] = now;
  }

  if (due(lastRunAt["island-routine-discovery"], WEEK_MS, nowMs)) {
    const seen = new Set(state.seenRoutineCandidateIds ?? []);
    const newCount = candidateIds.filter((id) => !seen.has(id)).length;
    if (newCount > 0) {
      outputs.push(Object.freeze({
        routine: "island-routine-discovery",
        channel: "governance-discussion",
        content: `Zelo has ${newCount} newly saved private draft routine candidate(s) since the last routine review. The digest exposes no author or observation text. Refine candidates in their original context before any proposal or enactment.`,
        bindingEffect: "draft-candidate-only",
      }));
    }
    lastRunAt["island-routine-discovery"] = now;
  }

  let seenProposalIds = [...(state.seenProposalIds ?? [])];
  if (due(lastRunAt["proposal-intake-review"], DAY_MS, nowMs)) {
    const seen = new Set(seenProposalIds);
    const newlyProposed = proposalIds.filter((id) => !seen.has(id));
    if (newlyProposed.length > 0) {
      outputs.push(Object.freeze({
        routine: "proposal-intake-review",
        channel: "governance-proposals",
        content: `Zelo received ${newlyProposed.length} new public proposal submission receipt(s) since the last proposal intake review: ${newlyProposed.join(", ")}. These are proposed, not enacted. Read the proposal posts in this lane for their authored scope and evidence; this notice does not rank proposals or infer support from reactions, message volume, silence, or popularity.`,
        bindingEffect: "status-only",
      }));
    }
    seenProposalIds = proposalIds;
    lastRunAt["proposal-intake-review"] = now;
  }

  if (due(lastRunAt["standing-delegation-review"], WEEK_MS, nowMs)) {
    const exceptions = standingExceptions(context);
    if (exceptions.length > 0) {
      outputs.push(Object.freeze({
        routine: "standing-delegation-review",
        channel: "governance-action",
        content: context.delegations
          ? `Standing/delegation review found ${exceptions.length} exception(s): ${exceptions.map((entry) => `${entry.id} [${entry.problem}]`).join("; ")}. These are record/authority conformance findings, not automatic revocations or grants.`
          : `Standing review found ${exceptions.length} active record(s) missing an explicit basis or scope: ${exceptions.map((entry) => entry.id).join(", ")}. This is a record-integrity exception, not an automatic revocation.`,
        bindingEffect: "review-only",
      }));
    }
    lastRunAt["standing-delegation-review"] = now;
  }

  if (pendingTeaching.length > 0 && due(lastRunAt["received-act-teaching-example"], WEEK_MS, nowMs)) {
    const id = pendingTeaching.shift();
    const example = eligibleTeaching.get(id);
    if (example) {
      outputs.push(Object.freeze({
        routine: "received-act-teaching-example",
        channel: "governance-questions",
        content: `How Turntide governed a real change: ${example.requestedAct} Lesson: ${example.lesson} This is a teaching example, not precedent and not a new grant of authority.`,
        subjectId: id,
        bindingEffect: "teaching-only",
      }));
      taught.add(id);
      lastRunAt["received-act-teaching-example"] = now;
    }
  }

  if (due(lastRunAt["routine-retirement-review"], MONTH_MS, nowMs)) {
    lastRunAt["routine-retirement-review"] = now;
  }

  return Object.freeze({
    type: "ZeloScheduledCivicReview",
    version: 1,
    outputs: Object.freeze(outputs),
    nextState: Object.freeze({
      version: 1,
      initialized: true,
      reportedSnapshot: snapshot,
      reportedDigest: digest,
      knownReceivedActIds: Object.freeze([...knownReceived].sort()),
      pendingTeachingIds: Object.freeze(pendingTeaching),
      taughtActIds: Object.freeze([...taught].sort()),
      seenRoutineCandidateIds: Object.freeze(candidateIds),
      seenProposalIds: Object.freeze(seenProposalIds),
      ...(state.nudgedArtifactStates === undefined ? {} : { nudgedArtifactStates: Object.freeze([...state.nudgedArtifactStates].sort()) }),
      lastRunAt: Object.freeze(lastRunAt),
    }),
    bindingEffect: "informational-only",
  });
}

export function routineIntent(context, { routineId, subjectId = null, evidenceDigest = null }) {
  const routine = context.routines.routines.find((candidate) => candidate.id === routineId);
  const execution = context.runtime.routineExecution.find((candidate) => candidate.routine === routineId);
  if (!routine || !execution) throw new TypeError(`routine is not admitted to the Zelo civic runtime: ${JSON.stringify(routineId)}`);
  return Object.freeze({
    type: "ZeloCivicDeliveryIntent",
    version: 1,
    office: context.runtime.office,
    routine: routineId,
    mode: execution.mode,
    trigger: execution.trigger ?? null,
    cadence: execution.cadence ?? null,
    preferredDelivery: execution.preferredDelivery,
    dedupe: Object.freeze({
      rule: execution.dedupe,
      subjectId,
      evidenceDigest,
    }),
    silenceWhenEmpty: execution.silenceWhenEmpty === true || context.runtime.rules.silenceWhenNoMaterialOutput === true,
    autonomousEffect: execution.autonomousEffect,
    grantsAuthority: false,
    deliveryAdapterIsAuthority: false,
  });
}

export function formatZelo(value) {
  if (value.type === "TurntideCivicKernelConformanceReport") {
    return value.ok
      ? `Turntide civic kernel conforms: ${value.counts.routines} routines, ${value.counts.runtimeBindings} runtime bindings, ${value.counts.zeloProtocolTransitions} Zelo protocol transitions.`
      : `Turntide civic kernel does not conform: ${value.violations.map((entry) => entry.code).join(", ")}`;
  }

  if (value.type === "ZeloCivicOrientation") {
    return [
      "Turntide is a DAO whose authority lives in recorded standing, delegations, and governing acts — not in Discord roles or whoever has credentials.",
      `Right now I can help you: ${value.askZelo.join(" ")}`,
    ].join("\n");
  }
  if (value.type === "ZeloTurntideExplanation") {
    return [
      "Turntide has three useful layers: the community, the DAO's recorded governance, and the instruments the community uses.",
      "You can participate without already holding governance standing: ask, discuss, propose, volunteer, or bring Zelo repeated work that might deserve a routine.",
      "Binding decisions are different: they require current recorded standing or delegation.",
    ].join("\n");
  }
  if (value.type === "ZeloParticipationPaths") {
    const paths = value.paths.map((path) => `- ${path.action} [${path.bindingEffect}]`).join("\n");
    return `You do not need Turntide-wide standing to begin participating.\n${paths}\n${value.currentStandingRule}`;
  }
  if (value.type === "ZeloContestabilityWayfinding") {
    const paths = value.pathways.map((path) => [
      `- ${path.id}: ${path.appliesWhen}`,
      `  You can: ${path.participantMay}`,
      `  What that does: ${path.stateEffect}`,
      `  Zelo can: ${path.zeloMay}`,
      ...(path.zeloMayNot === undefined ? [] : [`  Zelo cannot: ${path.zeloMayNot}`]),
    ].join("\n")).join("\n");
    return `${value.note}\n${paths}\nUseful evidence: subject, current claim, specific contradiction or missing receipt, checkable source, and the requested next move.`;
  }
  if (value.type === "ZeloDecisionProcedureClassification") {
    if (value.state === "foreign-authority") {
      return `${value.reason} Route: ${value.foreignAuthority?.routeTo ?? "the applicable foreign authority"}.`;
    }
    if (value.state === "refused" || value.state === "incomplete") {
      return `Decision procedure classification ${value.state}: ${value.reason}.`;
    }
    const request = value.requestedProcedure === null ? "" : ` Requested procedure ${value.requestedProcedure.requested}: ${value.requestedProcedure.state}.`;
    const missing = value.missing === undefined ? "" : ` Missing: ${value.missing.join(", ")}.`;
    return `Minimum Turntide procedure: ${value.minimumProcedure}. ${value.reasons.join("; ")}.${request}${missing} Classification creates no authority.`;
  }
  if (value.type === "ZeloDecisionProcedureWayfinding") {
    if (value.foreignAuthority) {
      return `${value.note}\n${value.foreignAuthority.appliesWhen}\nRoute: ${value.foreignAuthority.routeTo}. ${value.foreignAuthority.note}`;
    }
    const lines = value.procedures.map((procedure) => [
      `- ${procedure.title}`,
      `  Use when: ${procedure.appliesWhen}`,
      `  Decision rule: ${procedure.decisionMode}`,
      `  Authority: ${procedure.whoMayAuthorize.join(" or ")}`,
      `  Executor: ${procedure.executor}`,
      `  Receiving: ${procedure.receiving}`,
    ].join("\n")).join("\n");
    return `${value.note}\nNumeric voting weights currently established: ${value.numericVotingWeightsEstablished ? "yes" : "no"}.\n${lines}`;
  }
  if (value.type === "ZeloDelegationWayfinding") {
    if (value.registryAvailable === false) return value.note;
    const active = value.active.length === 0
      ? "No conforming active delegation events are currently read back."
      : value.active.map((entry) => `- ${entry.delegationId}: ${entry.delegate} may ${entry.grantedActions.join(", ")} within ${entry.scope}`).join("\n");
    const mismatch = value.unmatchedStanding.length === 0
      ? ""
      : `\nMigration/conformance exception(s): ${value.unmatchedStanding.map((entry) => `${entry.id} — ${entry.problem}`).join("; ")}`;
    return `${active}${mismatch}\n${value.note}`;
  }
  if (value.type === "ZeloStandingWayfinding") {
    const lines = value.pathways.map((path) => [
      `- ${path.title}`,
      `  Use when: ${path.when}`,
      `  Requires: ${path.requires}`,
      `  Next: ${path.next}`,
    ].join("\n")).join("\n");
    return `${value.note}\n${lines}`;
  }
  if (value.type === "ZeloPlaceCivicGuide") {
    if (!value.known) return value.note;
    const sections = value.affordances.map((entry) => [
      entry.title,
      `What this place is for: ${entry.civicPurpose}`,
      `Things you can do: ${entry.ordinaryMoves.join("; ")}`,
      `Routine seeds: ${entry.routineSeeds.join("; ")}`,
      `If it needs to move: ${entry.escalation}`,
      `Authority boundary: ${entry.authorityBoundary}`,
    ].join("\n")).join("\n\n");
    const patterns = value.routinePatterns.length === 0 ? "" : `\n\nExisting routine patterns: ${value.routinePatterns.map((pattern) => pattern.title).join(", ")}.`;
    return `#${value.place}\n${sections}${patterns}\n\n${value.next}`;
  }
  if (value.type === "ZeloRoutineStudio") {
    if (value.patterns.length === 0) return value.next;
    const lines = value.patterns.map((pattern) => `- ${pattern.title}: ${pattern.useWhen}`).join("\n");
    return `Routine studio suggestions${value.place ? ` for #${value.place}` : ""}:\n${lines}\n${value.next}`;
  }
  if (value.type === "ZeloRoutinePatternDraft") {
    if (value.state === "incomplete") return value.note;
    return `${value.patternTitle}: ${formatZelo(value.routine)}`;
  }
  if (value.type === "ZeloTidepoolParticipantGovernanceGuide") {
    const lanes = value.lanes.map((lane) => {
      const states = (lane.states ?? []).map((state) => `${state.id}: ${state.meaning}`).join("; ");
      return `- ${lane.title}: ${lane.participantQuestion}\n  Participant: ${(lane.participantMay ?? []).join("; ")}\n  Authority: ${lane.authorityBoundary}\n  Zelo: ${lane.zeloRole}${states ? `\n  States: ${states}` : ""}`;
    }).join("\n");
    return `Tidepool participant governance (as of ${value.currentState.asOf}):\n${lanes}\nCurrent protocol clerk: ${value.currentState.protocolClerk}; first operating loop: ${value.currentState.firstOperatingLoop}. This explanation creates no membership, vote, or financial authority.`;
  }
  if (value.type === "ZeloTidepoolCivicMap") {
    const lines = value.paths.map((path) => `- ${path.ask} → ${path.route}`).join("\n");
    const current = [
      `As of ${value.asOf}: CRG runtime is ${value.currentState.runtime}; the dedicated Tidepool Protocol Clerk is ${value.currentState.protocolClerk}; the first operating loop is ${value.currentState.firstOperatingLoop}.`,
      `Current blocker: ${value.currentState.blocker}.`,
      `General Turntide/Board civic-office protocol availability: ${value.currentState.generalCivicOfficeAvailability ? "available" : "unavailable"}.`,
    ].join("\n");
    return `${value.relationship}\nTurntide-wide standing is not a substitute for Tidepool financial authority.\n${current}\n${lines}`;
  }
  if (value.type === "ZeloCivicStateAnswer") {
    if (value.transitions.length === 0) return `${value.artifactKind} is currently ${value.state}; the enacted protocol names no automatic next transition from there.`;
    const moves = value.transitions.map((move) => `${move.to} — by ${move.mayBePerformedBy.join(" or ")}; needs ${move.requires.join(", ")}`).join("\n");
    return `${value.artifactKind} is currently ${value.state}. Lawful next move(s):\n${moves}`;
  }
  if (value.type === "ZeloAuthorityBoundaryAnswer") return value.rule;
  if (value.type === "ZeloGovernanceRehearsal") {
    return `DRY RUN — no standing, vote, decision, authority, or execution is created.\n${formatZelo(value.scenario)}`;
  }
  if (value.type === "ZeloProposalDraft") {
    return value.state === "incomplete"
      ? `Proposal draft is incomplete; still needed: ${value.missing.join(", ")}. It remains private/draft-only.`
      : `Proposal draft is complete but not proposed or enacted. Next state is ${value.next}; moving it there requires ${value.nextAuthority.join(" or ")} and the protocol-required proposal fields.`;
  }
  if (value.type === "ZeloDelegationRequestDraft") {
    return value.state === "incomplete"
      ? `Delegation request draft is incomplete; still needed: ${value.missing.join(", ")}.`
      : `Delegation request drafted only. Activation still requires ${value.activationAuthority.join(" or ")} and a governing act; this draft creates no authority.`;
  }
  if (value.type === "ZeloRoutineCandidateDraft") {
    return value.state === "incomplete"
      ? `Routine draft is incomplete; still needed: ${value.missing.join(", ")}.`
      : `Routine candidate drafted only; next state is ${value.next}, which still requires a civic transition.`;
  }
  return JSON.stringify(value);
}
