#!/usr/bin/env node
import { orchestrationCarrier } from "../carriers.mjs";

writeJson(orchestrationCarrier());

function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

