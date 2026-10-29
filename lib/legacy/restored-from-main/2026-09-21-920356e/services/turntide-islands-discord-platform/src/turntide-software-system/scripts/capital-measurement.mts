#!/usr/bin/env node
import { capitalMeasurementCarrier } from "../carriers.mts";

writeJson(capitalMeasurementCarrier());

function writeJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

