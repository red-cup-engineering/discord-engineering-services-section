#!/usr/bin/env node
// A one-shot cron entrypoint for sky-desk's daily-report-publication duty —
// distinct from serveTurntide's own hourly check-and-post-if-not-yet-today
// loop (serve.mts), for a box that runs this as a scheduled job instead of
// (or alongside) the standing server process. Idempotent per UTC day via
// runDailyDivinationReport's own state marker either way.

import { loadRuntimeEnv } from "../env.mjs";
import { runDailyDivinationReport } from "../daily-divination-report.mjs";

loadRuntimeEnv(process.env);
const result = await runDailyDivinationReport(process.env);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (result.outcome === "refused") process.exitCode = 1;
