#!/usr/bin/env node
import { membershipCarrier } from "../carriers.mjs";

writeJson(membershipCarrier());

function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

