#!/usr/bin/env node
import process from "node:process";
import { invokeDiscordStewardCommand } from "../../../../../../discord-engineering-services-section/lib/legacy/discord-steward-service/src/scripts/steward.mts";

invokeDiscordStewardCommand("invite", process.argv.slice(2)).then((code) => process.exit(code)).catch((error) => {
  process.stderr.write(`discord-steward invite: ${(error as Error).message}\n`);
  process.exit(1);
});
