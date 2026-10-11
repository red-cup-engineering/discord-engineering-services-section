// Projects the declared guild shape. Dry-run unless `--live`; `--shape -`
// reads the record from stdin, which is how the Discord host receives it.
import { readFileSync } from "node:fs";
import { DiscordRestTransport } from "../discord.mjs";
import { loadRuntimeEnv } from "../env.mjs";
import { admitGuildShape, guildShapePath, projectGuildShape, readGuildShape } from "../guild-shape.mjs";

loadRuntimeEnv(process.env);
const args = process.argv.slice(2);
const shapeArgument = args.includes("--shape") ? args[args.indexOf("--shape") + 1] : guildShapePath(process.env);
const shape = shapeArgument === "-" ? admitGuildShape(JSON.parse(readFileSync(0, "utf8"))) : await readGuildShape(shapeArgument);
const result = await projectGuildShape(new DiscordRestTransport({ env: process.env }), shape, { apply: args.includes("--live") });
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
