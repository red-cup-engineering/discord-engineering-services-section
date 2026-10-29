#!/usr/bin/env node
import { membershipCarrier } from "../carriers.mts";

writeJson(membershipCarrier());

function writeJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

