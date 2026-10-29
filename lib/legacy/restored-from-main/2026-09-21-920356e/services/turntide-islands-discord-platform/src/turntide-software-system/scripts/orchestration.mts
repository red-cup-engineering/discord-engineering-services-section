#!/usr/bin/env node
import { orchestrationCarrier } from "../carriers.mts";

writeJson(orchestrationCarrier());

function writeJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

