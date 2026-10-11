#!/usr/bin/env node
import {
  renderCapitalMeasurementSystem,
  siteSummary,
} from "../src/index.mts";

process.stdout.write(`${JSON.stringify({
  kind: "turntide-islands.capital-measurement",
  capitalMeasurement: siteSummary().capitalMeasurement,
  system: renderCapitalMeasurementSystem(),
}, null, 2)}\n`);
