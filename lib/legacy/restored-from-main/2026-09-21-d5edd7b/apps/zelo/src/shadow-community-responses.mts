import { createHash } from "node:crypto";
import { planCommunityResponse, type CommunityResponseEvent, type CommunityResponseProgram, type CommunityResponseRateBudgetObservation } from "@red-cup-engineering/programmable-community-response-service";
import type { ZeloRuntimeConfig } from "./config.mjs";

export interface ZeloRateBudgetObservationRequest {
  readonly type: "ZeloRateBudgetObservationRequest";
  readonly version: 1;
  readonly providerId: string;
  readonly commandId: string;
  readonly scopeId: string;
  readonly window: string;
}
export type ReadZeloRateBudgetObservation = (request: ZeloRateBudgetObservationRequest) => Promise<unknown>;
export interface ZeloShadowCommunityResponseEvidence {
  readonly type: "ZeloShadowCommunityResponseEvidence";
  readonly version: 1;
  readonly observedAt: string;
  readonly decision: "propose" | "block";
  readonly proposalId?: string;
  readonly contentDigest?: string;
  readonly visibility?: "public" | "private" | "ephemeral";
  readonly executable: false;
  readonly allowedMentions: "none";
  readonly authority: "adapter-review-required";
}
const digest = (value: string): string => createHash("sha256").update(value).digest("hex");
const plannerProgram = (program: CommunityResponseProgram): Parameters<typeof planCommunityResponse>[0] => Object.freeze({
  ...program,
  commands: Object.freeze(program.commands.map((command) => Object.freeze({
    ...command,
    triggers: Object.freeze(command.triggers.map((value) => Object.freeze({ kind: "exact-text", value }))),
  }))),
});

/**
 * Plans a review record from injected data only. It has no Discord transport or
 * effect executor. The provider must return a fresh bounded observation; any
 * malformed or stale result rejects and therefore fails closed.
 */
export async function planZeloShadowCommunityResponse(event: CommunityResponseEvent, config: ZeloRuntimeConfig, readObservation: ReadZeloRateBudgetObservation, now = new Date()): Promise<readonly ZeloShadowCommunityResponseEvidence[]> {
  const response = config.communityResponse;
  if (config.mode === "disabled" || response === undefined) return Object.freeze([]);
  const selected = response.program.commands.find((command) => command.triggers.includes(event.content));
  if (selected === undefined) return Object.freeze([]);
  const request = Object.freeze({ type: "ZeloRateBudgetObservationRequest" as const, version: 1 as const, providerId: response.rateBudgetObservationProvider.id, commandId: selected.id, scopeId: event.scopeId, window: selected.rateBudget.window });
  const rateBudgetObservation = await readObservation(request);
  const result = planCommunityResponse(plannerProgram(response.program), event, { now, maxObservationAgeMs: response.rateBudgetObservationProvider.maxObservationAgeMs, variables: {}, rateBudgetObservation: rateBudgetObservation as CommunityResponseRateBudgetObservation });
  if (result.kind === "ignore") return Object.freeze([]);
  if (result.kind === "block") return Object.freeze([Object.freeze({ type: "ZeloShadowCommunityResponseEvidence", version: 1, observedAt: now.toISOString(), decision: "block", executable: false, allowedMentions: "none", authority: "adapter-review-required" })]);
  const proposal = result.proposal;
  if (proposal === undefined || proposal.executable !== false || proposal.allowedMentions !== "none" || proposal.authority !== "adapter-review-required") throw new TypeError("upstream proposal is not shadow-safe");
  return Object.freeze([Object.freeze({ type: "ZeloShadowCommunityResponseEvidence", version: 1, observedAt: now.toISOString(), decision: "propose", proposalId: proposal.id, contentDigest: digest(proposal.content), visibility: proposal.visibility, executable: false, allowedMentions: "none", authority: "adapter-review-required" })]);
}
