#!/usr/bin/env node
import { siteSummary } from "../src/index.mts";

process.stdout.write(`${JSON.stringify(siteSummary(), null, 2)}\n`);
