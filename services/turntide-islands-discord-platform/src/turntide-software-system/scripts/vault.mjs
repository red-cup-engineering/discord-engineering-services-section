#!/usr/bin/env node
import { vaultCarrier } from "../carriers.mjs";

writeJson(vaultCarrier());

function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

