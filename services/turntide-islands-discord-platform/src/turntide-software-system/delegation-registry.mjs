/**
 * Turntide delegation readback: the current state of each bounded delegation, derived from its append-only
 * events (activate, then at most one of revoke, expire or supersede) and the governance acts that authorize
 * them. The civic kernel reads the events from Turntide's governance journal; this module only derives.
 */
const NI = /^ni:\/\/\/sha-256;[A-Za-z0-9_-]+$/u;

function text(value, name) {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`delegation-event: ${name} must be nonempty text`);
  return value.trim();
}

function instant(value, name) {
  const raw = text(value, name);
  const time = Date.parse(raw);
  if (Number.isNaN(time)) throw new TypeError(`delegation-event: ${name} must be an ISO date/time`);
  return new Date(time).toISOString();
}

function stringList(value, name) {
  if (!Array.isArray(value) || value.length === 0) throw new TypeError(`delegation-event: ${name} must be a nonempty array`);
  const out = value.map((entry, index) => text(entry, `${name}[${index}]`));
  if (new Set(out).size !== out.length) throw new TypeError(`delegation-event: ${name} contains duplicates`);
  return Object.freeze(out);
}

function receivedActs(acts) {
  const byId = new Map();
  for (const act of acts ?? []) {
    if (act?.type !== "TurntideGovernanceAct" || typeof act.id !== "string") continue;
    if (byId.has(act.id)) throw new TypeError(`delegation-event: duplicate governance act id ${act.id}`);
    byId.set(act.id, act);
  }
  return byId;
}

function enactedReceivedAct(byId, id) {
  const act = byId.get(text(id, "governingActId"));
  if (!act || act.state !== "received" || act.decision?.state !== "enacted") {
    throw new TypeError(`delegation-event: governingActId ${JSON.stringify(id)} is not a received enacted Turntide governance act`);
  }
  return act;
}

function common(event) {
  if (event?.type !== "TurntideDelegationEvent" || event.version !== 1) {
    throw new TypeError("delegation-event: event must be TurntideDelegationEvent v1");
  }
  const eventId = text(event.eventId, "eventId");
  const delegationId = text(event.delegationId, "delegationId");
  const kind = text(event.event, "event");
  if (!["activate", "revoke", "expire", "supersede"].includes(kind)) {
    throw new TypeError(`delegation-event: unsupported event ${JSON.stringify(kind)}`);
  }
  if (!Number.isSafeInteger(event.sequence) || event.sequence < 1) {
    throw new TypeError("delegation-event: sequence must be a positive integer");
  }
  return Object.freeze({
    eventId,
    delegationId,
    event: kind,
    sequence: event.sequence,
    recordedAt: instant(event.recordedAt, "recordedAt"),
  });
}

function activationOf(event, header, actsById) {
  if (header.sequence !== 1) throw new TypeError("delegation-event: activation must have sequence 1");
  const act = enactedReceivedAct(actsById, event.governingActId);
  const grantor = text(event.grantor, "grantor");
  if (act.origin?.by !== grantor) {
    throw new TypeError(`delegation-event: activation grantor ${JSON.stringify(grantor)} does not match governing act origin ${JSON.stringify(act.origin?.by)}`);
  }
  const delegate = text(event.delegate, "delegate");
  const reviewOrExpiry = text(event.reviewOrExpiry, "reviewOrExpiry");
  return Object.freeze({
    ...header,
    state: "active",
    delegate,
    purpose: text(event.purpose, "purpose"),
    scope: text(event.scope, "scope"),
    grantedActions: stringList(event.grantedActions, "grantedActions"),
    limits: stringList(event.limits, "limits"),
    reviewOrExpiry,
    revocationCondition: text(event.revocationCondition, "revocationCondition"),
    receivingCondition: text(event.receivingCondition, "receivingCondition"),
    grantor,
    governingActId: act.id,
    activationEventId: header.eventId,
    activatedAt: header.recordedAt,
    latestEventId: header.eventId,
    latestRecordedAt: header.recordedAt,
  });
}

function governingTerminal(event, header, current, actsById, terminalState) {
  const act = enactedReceivedAct(actsById, event.governingActId);
  return Object.freeze({
    ...current,
    state: terminalState,
    sequence: header.sequence,
    latestEventId: header.eventId,
    latestRecordedAt: header.recordedAt,
    terminalGoverningActId: act.id,
    endedAt: header.recordedAt,
    ...(terminalState === "revoked" ? { revokedReason: text(event.reason, "reason") } : {}),
    ...(terminalState === "superseded" ? { replacementDelegationId: text(event.replacementDelegationId, "replacementDelegationId") } : {}),
  });
}

function terminalOf(event, header, current, actsById) {
  if (current.state !== "active") {
    throw new TypeError(`delegation-event: ${header.event} cannot follow delegation state ${current.state}`);
  }
  if (header.sequence !== current.sequence + 1) {
    throw new TypeError(`delegation-event: sequence ${header.sequence} does not follow ${current.sequence}`);
  }
  if (Date.parse(header.recordedAt) < Date.parse(current.latestRecordedAt)) {
    throw new TypeError("delegation-event: recordedAt moves backwards");
  }
  if (header.event === "revoke") {
    return governingTerminal(event, header, current, actsById, "revoked");
  }
  if (header.event === "supersede") {
    const replacement = text(event.replacementDelegationId, "replacementDelegationId");
    if (replacement === current.delegationId) throw new TypeError("delegation-event: a delegation cannot supersede itself");
    return governingTerminal(event, header, current, actsById, "superseded");
  }
  if (header.event === "expire") {
    const witness = event.conditionWitness;
    if (witness === null || typeof witness !== "object" || Array.isArray(witness)) {
      throw new TypeError("delegation-event: conditionWitness must be an object");
    }
    const condition = text(witness.condition, "conditionWitness.condition");
    if (condition !== current.reviewOrExpiry) {
      throw new TypeError("delegation-event: expiry witness condition must exactly match the activation reviewOrExpiry condition");
    }
    const recordNi = text(witness.recordNi, "conditionWitness.recordNi");
    if (!NI.test(recordNi)) throw new TypeError("delegation-event: conditionWitness.recordNi must be a sha-256 ni URI");
    const observedAt = instant(witness.observedAt, "conditionWitness.observedAt");
    if (Date.parse(observedAt) > Date.parse(header.recordedAt)) {
      throw new TypeError("delegation-event: expiry witness cannot be observed after the event");
    }
    return Object.freeze({
      ...current,
      state: "expired",
      sequence: header.sequence,
      latestEventId: header.eventId,
      latestRecordedAt: header.recordedAt,
      endedAt: header.recordedAt,
      conditionWitness: Object.freeze({ condition, recordNi, observedAt }),
    });
  }
  throw new TypeError(`delegation-event: activation cannot follow active delegation ${current.delegationId}`);
}

/**
 * Derive current delegation state from append-only delegation events, failing closed on any history that
 * is not a contiguous, forward-moving sequence beginning with an activation backed by a received enacted act.
 *
 * The result is a read model. It creates no authority and has no mutation path.
 */
export function deriveDelegationRegistry(events = [], acts = []) {
  if (!Array.isArray(events)) throw new TypeError("delegation-event: events must be an array");
  const actsById = receivedActs(acts);
  const eventIds = new Set();
  const grouped = new Map();

  for (const raw of events) {
    const header = common(raw);
    if (eventIds.has(header.eventId)) throw new TypeError(`delegation-event: duplicate eventId ${header.eventId}`);
    eventIds.add(header.eventId);
    const group = grouped.get(header.delegationId) ?? [];
    group.push(Object.freeze({ raw, header }));
    grouped.set(header.delegationId, group);
  }

  const states = [];
  for (const [delegationId, group] of [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    group.sort((left, right) => left.header.sequence - right.header.sequence);
    const sequences = group.map((entry) => entry.header.sequence);
    if (new Set(sequences).size !== sequences.length) {
      throw new TypeError(`delegation-event: delegation ${delegationId} repeats a sequence`);
    }
    for (let index = 0; index < sequences.length; index += 1) {
      if (sequences[index] !== index + 1) {
        throw new TypeError(`delegation-event: delegation ${delegationId} has non-contiguous sequence; expected ${index + 1}, found ${sequences[index]}`);
      }
    }
    const first = group[0];
    if (first.header.event !== "activate") {
      throw new TypeError(`delegation-event: delegation ${delegationId} must begin with activate`);
    }
    let state = activationOf(first.raw, first.header, actsById);
    for (const entry of group.slice(1)) state = terminalOf(entry.raw, entry.header, state, actsById);
    states.push(state);
  }

  const frozenStates = Object.freeze(states.map((state) => Object.freeze(state)));
  const active = Object.freeze(frozenStates.filter((state) => state.state === "active"));
  return Object.freeze({
    type: "TurntideDelegationRegistry",
    version: 1,
    authorityEffect: "readback-only",
    eventCount: events.length,
    states: frozenStates,
    active,
  });
}

export function activeDelegationOf(registry, delegationId) {
  if (registry?.type !== "TurntideDelegationRegistry") throw new TypeError("delegation registry is unavailable");
  return registry.active.find((entry) => entry.delegationId === delegationId) ?? null;
}
