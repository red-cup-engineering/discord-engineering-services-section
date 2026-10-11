#!/usr/bin/env node
import {
  membershipDigest,
  membershipSystem,
  paidMembership,
} from "../src/index.mts";
import {
  resolveMembershipProgramEnv,
  unresolvedMembershipEnvReferences,
} from "@red-cup-engineering/organizing-with-discord";

const resolved = resolveMembershipProgramEnv(paidMembership, process.env);

process.stdout.write(`${JSON.stringify({
  kind: "turntide-islands.membership",
  digest: membershipDigest,
  program: paidMembership,
  resolved,
  unresolvedEnv: unresolvedMembershipEnvReferences(resolved).filter((name) => process.env[name] === undefined),
  system: membershipSystem,
}, null, 2)}\n`);
