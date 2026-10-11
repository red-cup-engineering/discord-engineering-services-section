import { discordGuildStatePath, observeDiscordGuildState, writeDiscordGuildState } from "../discord-guild-state.mjs";
import { loadRuntimeEnv } from "../env.mjs";

loadRuntimeEnv(process.env);
const state = await observeDiscordGuildState(process.env);
const file = discordGuildStatePath(process.env);
await writeDiscordGuildState(state, file);
process.stdout.write(`${JSON.stringify({ type: state.type, observedAt: state.observedAt, guildId: state.guild.id, roles: state.roles.length, channels: state.channels.length, file })}\n`);
