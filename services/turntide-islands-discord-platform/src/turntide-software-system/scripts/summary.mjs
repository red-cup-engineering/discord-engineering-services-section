#!/usr/bin/env node
import { summaryCarrier } from "../carriers.mjs";

writeJson(summaryCarrier());

function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

