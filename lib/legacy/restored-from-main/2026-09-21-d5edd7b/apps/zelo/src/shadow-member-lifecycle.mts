import { planMemberLifecycle, projectLifecycleReceipt, type LifecycleEvent, type LifecycleKind } from "@red-cup-engineering/discord-member-lifecycle-planning-service";
import type { ZeloRuntimeConfig } from "./config.mjs";

export interface ZeloMemberLifecycleReview {
  readonly type: "ZeloMemberLifecycleReview";
  readonly version: 1;
  readonly communityId: string;
  readonly memberId: string;
  readonly kind: LifecycleKind;
  readonly event: LifecycleEvent;
}
export type ReadZeloMemberLifecycleState = (binding: Readonly<{ communityId: string; memberId: string; sourceRevision: string }>) => Promise<unknown>;

/**
 * Projects a human-reviewable lifecycle receipt from one supplied event. It has
 * no Discord transport, never enumerates members, and cannot deliver a message.
 */
export async function planZeloShadowMemberLifecycle(review: ZeloMemberLifecycleReview, config: ZeloRuntimeConfig, readState: ReadZeloMemberLifecycleState, now = new Date()): Promise<Readonly<Record<string, unknown>> | undefined> {
  const lifecycle = config.memberLifecycle;
  if (config.mode === "disabled" || lifecycle === undefined) return undefined;
  if (review.type !== "ZeloMemberLifecycleReview" || review.version !== 1 || review.communityId !== lifecycle.communityId) throw new TypeError("admitted same-community lifecycle review required");
  if (!lifecycle.permittedKinds.includes(review.kind)) throw new TypeError("lifecycle kind is not admitted");
  const state = await readState(Object.freeze({ communityId: review.communityId, memberId: review.memberId, sourceRevision: lifecycle.policy.sourceRevision }));
  const proposal = planMemberLifecycle({ communityId: review.communityId, memberId: review.memberId, kind: review.kind, event: review.event, policy: lifecycle.policy, state: state as Parameters<typeof planMemberLifecycle>[0]["state"], now });
  if (proposal.delivery !== "forbidden" || proposal.executable !== false || proposal.allowedMentions !== "none") throw new TypeError("upstream lifecycle proposal is not shadow-safe");
  return Object.freeze({ ...projectLifecycleReceipt(proposal, { key: config.projectionKey, purpose: lifecycle.purpose, recordedAt: now.toISOString() }), executable: false, delivery: "forbidden", authority: "adapter-review-required" });
}
