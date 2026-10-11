import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { env, publicTurntideDataPath } from "./env.mjs";
import { DiscordRestTransport } from "./discord.mjs";
import { climateWireStoreDir, readClimateSignals } from "./climate-signals.mjs";
import { draftFromSignal, nextUndraftedSignal, readSignalDrafts, recordSignalDraft, signalDraftsFile, undraftedSignals } from "./signal-drafts.mjs";
import { chooseZeloAction } from "./zelo-agency.mjs";

const defaultTickState = Object.freeze({ lastAlertedIslandCount: 0 });

export function tickStateFile(source = process.env) {
  return env("TTI_TICK_STATE_FILE", source) ?? publicTurntideDataPath(source, "agency", "tick-state.json");
}

export async function readTickState(file) {
  try {
    return { ...defaultTickState, ...(JSON.parse(await readFile(file, "utf8"))) };
  } catch {
    return defaultTickState;
  }
}

export async function writeTickState(file, state) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(state, null, 2)}\n`);
}

/**
 * Read the world the way npcAgency reads the scene: real signals, real
 * drafts. Deliberately NOT running /spacetime's causal-set topology read
 * here: metroplat's causalClosure is a naive O(V^3)-per-round transitive
 * closure with no size guard. That's fine for a rare, human-triggered,
 * small-scale diagnostic; it is not safe to run unattended on a schedule
 * against however many real messages exist, on a box this small (1.6GB) --
 * verified the hard way, it OOM-crash-looped production. Fragmentation
 * escalation needs a properly bounded topology read before it can run here;
 * it isn't one yet, so it's cut from the autonomous loop, not worked around.
 */
export async function gatherSituation(source, state) {
  const storeDir = climateWireStoreDir(source);
  const draftsFile = signalDraftsFile(source);
  const [signals, rawDrafts] = await Promise.all([readClimateSignals(storeDir), readSignalDrafts(draftsFile)]);
  const undraftedCount = undraftedSignals(signals, rawDrafts).length;

  return Object.freeze({
    undraftedSignalCount: undraftedCount,
    discourseIslands: 0,
    coordinationCost: 0,
    lastAlertedIslandCount: state.lastAlertedIslandCount,
  });
}

/** Execute the chosen action against the real world, exactly the way scene.mts's npcAgency does after chooseNpcAction. */
export async function executeZeloAction(action, source, state) {
  if (action.kind === "idle") return state;

  if (action.kind === "draft-next-signal") {
    const storeDir = climateWireStoreDir(source);
    const draftsFile = signalDraftsFile(source);
    const [signals, drafts] = await Promise.all([readClimateSignals(storeDir), readSignalDrafts(draftsFile)]);
    const signal = nextUndraftedSignal(signals, drafts);
    if (signal !== undefined) await recordSignalDraft(draftsFile, draftFromSignal(signal, "weather-report"));
    return state;
  }

  const guildId = env("DISCORD_GUILD_ID", source);
  if (guildId === undefined) return state;
  const transport = new DiscordRestTransport({ env: source });
  const channels = await transport.listChannels(guildId);

  if (action.kind === "escalate-fragmentation") {
    const channel = channels.find((candidate) => candidate.name.toLowerCase() === "moderator-bridge");
    if (channel === undefined) return state;
    await transport.createMessage(
      channel.id,
      `reading the server as a causal set: ${action.islands} disconnected discourse islands right now (coordination cost ${action.coordinationCost}). worth a look — nobody's cross-referencing anybody else's thread.`,
    );
    return { ...state, lastAlertedIslandCount: action.islands };
  }

  return state;
}

/** One tick: gather the situation, choose, execute, persist. The whole point is that nothing here needs a slash command. */
export async function runZeloTick(source = process.env) {
  const stateFile = tickStateFile(source);
  const state = await readTickState(stateFile);
  const situation = await gatherSituation(source, state);
  const action = chooseZeloAction(situation);
  const nextState = await executeZeloAction(action, source, state);
  await writeTickState(stateFile, { ...nextState, lastTickAt: new Date().toISOString() });
  return { situation, action };
}
