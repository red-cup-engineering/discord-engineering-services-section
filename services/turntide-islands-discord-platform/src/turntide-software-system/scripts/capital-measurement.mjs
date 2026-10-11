#!/usr/bin/env node
import { capitalMeasurementCarrier } from "../carriers.mjs";

writeJson(capitalMeasurementCarrier());

function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

