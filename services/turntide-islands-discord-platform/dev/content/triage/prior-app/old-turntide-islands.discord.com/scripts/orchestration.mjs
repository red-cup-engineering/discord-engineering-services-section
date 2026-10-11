#!/usr/bin/env node
import {
  orchestrationDigest,
  orchestrationProfile,
  orchestrationSystem,
} from "../src/index.mts";

process.stdout.write(`${JSON.stringify({
  kind: "turntide-islands.orchestration",
  digest: orchestrationDigest,
  profile: orchestrationProfile,
  system: orchestrationSystem,
}, null, 2)}\n`);
