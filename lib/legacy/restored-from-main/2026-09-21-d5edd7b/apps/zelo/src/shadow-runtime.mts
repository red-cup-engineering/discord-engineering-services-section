import { createHmac } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { evaluateReactionRoleBinding, normalizeReactionRoleBinding, type DiscordReactionEvent, type PolicyDecision, type ReactionPolicyState } from "@red-cup-engineering/discord-community-automation-service";
import type { ZeloRuntimeConfig } from "./config.mjs";
export interface ZeloShadowObservation { readonly type: "ZeloShadowReactionObservation"; readonly version: 1; readonly observedAt: string; readonly decision: PolicyDecision["kind"]; readonly planIds: readonly string[]; readonly actorPseudonym?: string; }
export async function planZeloShadowReaction(event: DiscordReactionEvent, config: ZeloRuntimeConfig, readState: () => Promise<ReactionPolicyState>, now = new Date()): Promise<readonly ZeloShadowObservation[]> {
  if (config.mode === "disabled") return Object.freeze([]);
  const state = await readState(), observations: ZeloShadowObservation[] = [];
  for (const rawBinding of config.bindings) {
    const binding = normalizeReactionRoleBinding(rawBinding), decision = evaluateReactionRoleBinding(event, binding, state, now);
    if (decision.kind === "ignore") continue;
    const planIds = decision.kind === "propose" ? decision.plans.map((plan) => plan.id) : [];
    const actorPseudonym = createHmac("sha256", config.projectionKey).update(`v1\0${event.guildId}\0${event.actorId}`).digest("hex");
    observations.push(Object.freeze({ type: "ZeloShadowReactionObservation", version: 1, observedAt: now.toISOString(), decision: decision.kind, planIds: Object.freeze(planIds), actorPseudonym: `urn:zelo:actor:${actorPseudonym}` }));
  }
  return Object.freeze(observations);
}
export async function writeZeloShadowObservations(file: string, observations: readonly ZeloShadowObservation[]): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify({ type: "ZeloShadowReactionObservationLog", version: 1, observations })}\n`, { mode: 0o600 });
  await rename(temporary, file);
}
