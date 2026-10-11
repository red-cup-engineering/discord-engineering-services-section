import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { normalizedName } from "./discord.mjs";
import { env, packageRoot, publicTurntideRoot } from "./env.mjs";
import { readRoutineCandidateIntake } from "./civic-routine-candidates.mjs";
import { readProposalSubmissionEvents } from "./civic-proposal-drafts.mjs";
import { loadZeloCivicContext, scheduledCivicReview } from "./zelo-civic-service.mjs";

const defaultState = Object.freeze({ version: 1, initialized: false });

export function civicScheduledStateFile(dataRoot) {
  return path.join(dataRoot, "civic", "scheduled-routines.json");
}

export async function readCivicScheduledState(file) {
  try {
    return { ...defaultState, ...JSON.parse(await readFile(file, "utf8")) };
  } catch (error) {
    if (error?.code === "ENOENT") return { ...defaultState };
    throw error;
  }
}

export async function writeCivicScheduledState(file, state) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(state, null, 2)}\n`);
}

export async function runCivicScheduledRoutines({
  transport,
  channels,
  source = process.env,
  dataRoot = env("TTI_AGENT_DATA_ROOT", source) ?? path.join(packageRoot, "data", "agent"),
  now = new Date().toISOString(),
} = {}) {
  if (!transport || typeof transport.createMessage !== "function") throw new TypeError("scheduled civic routines require a Discord transport");
  if (!Array.isArray(channels)) throw new TypeError("scheduled civic routines require channel listings");

  const [context, candidates, proposalEvents] = await Promise.all([
    loadZeloCivicContext(publicTurntideRoot(source)),
    readRoutineCandidateIntake(dataRoot),
    readProposalSubmissionEvents(dataRoot),
  ]);
  const proposalSubmissions = proposalEvents.filter((event) =>
    event.type === "TurntideProposalSubmissionReceipt" && event.state === "proposed");
  const stateFile = civicScheduledStateFile(dataRoot);
  const state = await readCivicScheduledState(stateFile);
  const review = scheduledCivicReview(context, {
    state,
    routineCandidates: candidates,
    proposalSubmissions,
    now,
  });

  const deliveries = [];
  for (const output of review.outputs) {
    const channel = channels.find((candidate) => normalizedName(candidate.name) === normalizedName(output.channel));
    if (channel === undefined) {
      deliveries.push(Object.freeze({
        routine: output.routine,
        channel: output.channel,
        ok: false,
        reason: "delivery channel unavailable",
      }));
      continue;
    }
    try {
      await transport.createMessage(channel.id, {
        content: String(output.content).slice(0, 1900),
        allowedMentions: { users: [] },
      });
      deliveries.push(Object.freeze({
        routine: output.routine,
        channel: output.channel,
        ok: true,
        subjectId: output.subjectId ?? null,
      }));
    } catch (error) {
      deliveries.push(Object.freeze({
        routine: output.routine,
        channel: output.channel,
        ok: false,
        reason: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  const nextState = {
    ...review.nextState,
    lastReviewAt: now,
    lastDeliveries: deliveries,
  };
  await writeCivicScheduledState(stateFile, nextState);
  return Object.freeze({
    type: "TurntideScheduledCivicRun",
    version: 1,
    outputs: review.outputs,
    deliveries: Object.freeze(deliveries),
    stateFile,
    bindingEffect: "informational-only",
  });
}
