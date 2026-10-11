import assert from "node:assert/strict";
import test from "node:test";

import { activeDelegationOf, deriveDelegationRegistry } from "../src/turntide-software-system/delegation-registry.mjs";

const act = (id, by = "emsenn") => ({
  type: "TurntideGovernanceAct",
  version: 1,
  id,
  state: "received",
  origin: { by, kind: "current-recorded-governor" },
  decision: { state: "enacted" },
});

const activation = (overrides = {}) => ({
  type: "TurntideDelegationEvent",
  version: 1,
  eventId: "delegation:test:1",
  delegationId: "delegation:test",
  event: "activate",
  sequence: 1,
  delegate: "turntider:test",
  purpose: "maintain one admitted project status",
  scope: "project:test",
  grantedActions: ["update-status", "publish-clerical-receipt"],
  limits: ["no spending", "no policy changes", "no standing changes"],
  reviewOrExpiry: "project closes or 2026-11-01T00:00:00Z, whichever comes first",
  revocationCondition: "revocable by the grantor or current recorded governance",
  receivingCondition: "project status projection matches the admitted project record",
  grantor: "emsenn",
  governingActId: "act:delegation:test",
  recordedAt: "2026-10-03T20:00:00Z",
  ...overrides,
});

test("activation derives one independently readable active delegation", () => {
  const registry = deriveDelegationRegistry([activation()], [act("act:delegation:test")]);
  assert.equal(registry.authorityEffect, "readback-only");
  assert.equal(registry.eventCount, 1);
  assert.equal(registry.active.length, 1);
  const current = activeDelegationOf(registry, "delegation:test");
  assert.ok(current);
  assert.equal(current.delegate, "turntider:test");
  assert.equal(current.scope, "project:test");
  assert.deepEqual(current.grantedActions, ["update-status", "publish-clerical-receipt"]);
  assert.equal(current.governingActId, "act:delegation:test");
});

test("activation refuses a missing, unreceived, or wrong-grantor governing act", () => {
  assert.throws(() => deriveDelegationRegistry([activation()], []), /not a received enacted/u);
  assert.throws(() => deriveDelegationRegistry([activation()], [{
    ...act("act:delegation:test"),
    state: "executing",
  }]), /not a received enacted/u);
  assert.throws(() => deriveDelegationRegistry([activation({ grantor: "someone-else" })], [act("act:delegation:test")]), /does not match governing act origin/u);
});

test("revoke closes authority and terminal state cannot transition again", () => {
  const revokeAct = act("act:delegation:revoke");
  const events = [
    activation(),
    {
      type: "TurntideDelegationEvent",
      version: 1,
      eventId: "delegation:test:2",
      delegationId: "delegation:test",
      event: "revoke",
      sequence: 2,
      reason: "project custody moved elsewhere",
      governingActId: revokeAct.id,
      recordedAt: "2026-10-10T00:00:00Z",
    },
  ];
  const registry = deriveDelegationRegistry(events, [act("act:delegation:test"), revokeAct]);
  assert.equal(registry.active.length, 0);
  assert.equal(registry.states[0].state, "revoked");
  assert.equal(registry.states[0].revokedReason, "project custody moved elsewhere");

  assert.throws(() => deriveDelegationRegistry([...events, {
    type: "TurntideDelegationEvent",
    version: 1,
    eventId: "delegation:test:3",
    delegationId: "delegation:test",
    event: "expire",
    sequence: 3,
    conditionWitness: {
      condition: activation().reviewOrExpiry,
      recordNi: "ni:///sha-256;expiry",
      observedAt: "2026-10-11T00:00:00Z",
    },
    recordedAt: "2026-10-11T00:00:00Z",
  }], [act("act:delegation:test"), revokeAct]), /cannot follow delegation state revoked/u);
});

test("expiry must witness the exact predeclared condition", () => {
  const expire = {
    type: "TurntideDelegationEvent",
    version: 1,
    eventId: "delegation:test:2",
    delegationId: "delegation:test",
    event: "expire",
    sequence: 2,
    conditionWitness: {
      condition: activation().reviewOrExpiry,
      recordNi: "ni:///sha-256;expiry",
      observedAt: "2026-11-01T00:00:00Z",
    },
    recordedAt: "2026-11-01T00:00:00Z",
  };
  const registry = deriveDelegationRegistry([activation(), expire], [act("act:delegation:test")]);
  assert.equal(registry.states[0].state, "expired");
  assert.equal(registry.active.length, 0);

  assert.throws(() => deriveDelegationRegistry([activation(), {
    ...expire,
    conditionWitness: { ...expire.conditionWitness, condition: "some other condition" },
  }], [act("act:delegation:test")]), /must exactly match/u);
});

test("supersede closes the old grant but never activates the replacement implicitly", () => {
  const supersedeAct = act("act:delegation:supersede");
  const registry = deriveDelegationRegistry([
    activation(),
    {
      type: "TurntideDelegationEvent",
      version: 1,
      eventId: "delegation:test:2",
      delegationId: "delegation:test",
      event: "supersede",
      sequence: 2,
      replacementDelegationId: "delegation:replacement",
      governingActId: supersedeAct.id,
      recordedAt: "2026-10-15T00:00:00Z",
    },
  ], [act("act:delegation:test"), supersedeAct]);
  assert.equal(registry.states[0].state, "superseded");
  assert.equal(registry.states[0].replacementDelegationId, "delegation:replacement");
  assert.equal(activeDelegationOf(registry, "delegation:replacement"), null);
});

test("event histories fail closed on duplicate ids, sequence gaps, and backwards time", () => {
  const first = activation();
  assert.throws(() => deriveDelegationRegistry([first, { ...first }], [act("act:delegation:test")]), /duplicate eventId/u);
  assert.throws(() => deriveDelegationRegistry([first, {
    type: "TurntideDelegationEvent",
    version: 1,
    eventId: "delegation:test:3",
    delegationId: "delegation:test",
    event: "revoke",
    sequence: 3,
    reason: "gap",
    governingActId: "act:delegation:revoke",
    recordedAt: "2026-10-10T00:00:00Z",
  }], [act("act:delegation:test"), act("act:delegation:revoke")]), /non-contiguous sequence/u);

  assert.throws(() => deriveDelegationRegistry([first, {
    type: "TurntideDelegationEvent",
    version: 1,
    eventId: "delegation:test:2",
    delegationId: "delegation:test",
    event: "revoke",
    sequence: 2,
    reason: "backwards",
    governingActId: "act:delegation:revoke",
    recordedAt: "2026-10-01T00:00:00Z",
  }], [act("act:delegation:test"), act("act:delegation:revoke")]), /recordedAt moves backwards/u);
});
