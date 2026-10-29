#!/usr/bin/env node
import { vaultCarrier } from "../carriers.mts";

writeJson(vaultCarrier());

function writeJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

