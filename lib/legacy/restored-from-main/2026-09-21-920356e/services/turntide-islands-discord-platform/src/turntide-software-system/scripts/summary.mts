#!/usr/bin/env node
import { summaryCarrier } from "../carriers.mts";

writeJson(summaryCarrier());

function writeJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

