

/**
 * AutoMod can only hold a message and tell the human moderator bridge. It does
 * not decide membership consequences or appeals; those remain a human duty.
 */
export const communityModerationBoundary = Object.freeze({
  automodMay: Object.freeze(["block-message", "send-alert"]),
  humanOnly: Object.freeze([
    "delete-message",
    "timeout-member",
    "ban-member",
    "unban-member",
    "restore-content",
    "appeal-review",
    "external-escalation",
  ]),
  appeal: "A human moderator owns every escalation and appeal; an AutoMod hold is never a final membership decision.",
});

export const baselineAutoModerationRuleNames = Object.freeze({
  mentionSpam: "TTI baseline: mention spam",
  slurFilter: "TTI baseline: slur filter",
});

/** Safe, narrow early-community rules. The caller supplies the resolved ID of #moderator-bridge. */
export function baselineCommunityAutoModerationRules(moderatorBridgeChannelId) {
  if (moderatorBridgeChannelId.trim() === "") throw new TypeError("moderatorBridgeChannelId is required");
  return Object.freeze([
    Object.freeze({
      name: baselineAutoModerationRuleNames.mentionSpam,
      triggerType: "mention-spam",
      triggerMetadata: Object.freeze({ mention_total_limit: 5, mention_raid_protection_enabled: true }),
      actions: Object.freeze([
        Object.freeze({ type: "block-message", customMessage: "This message is held for moderator review." }),
        Object.freeze({ type: "send-alert", channelId: moderatorBridgeChannelId }),
      ]),
      enabled: true,
    }),
    Object.freeze({
      name: baselineAutoModerationRuleNames.slurFilter,
      triggerType: "keyword-preset",
      // Discord preset 3 is slurs. TTI deliberately does not apply the broad
      // profanity or sexual-content presets: those would suppress ordinary
      // adult expression and hand a generic filter too much cultural power.
      triggerMetadata: Object.freeze({ presets: [3] }),
      actions: Object.freeze([
        Object.freeze({ type: "block-message", customMessage: "This message is held for moderator review." }),
        Object.freeze({ type: "send-alert", channelId: moderatorBridgeChannelId }),
      ]),
      enabled: true,
    }),
  ]);
}

/**
 * Reconciles only the named baseline rules. It deliberately neither deletes
 * other guild rules nor calls member-discipline endpoints.
 */
export async function ensureBaselineCommunityAutoModeration(
  transport,
  guildId,
  moderatorBridgeChannelId,
) {
  const existing = await transport.listAutoModerationRules(guildId);
  const created = [];
  const updated = [];
  for (const desired of baselineCommunityAutoModerationRules(moderatorBridgeChannelId)) {
    const current = existing.find((rule) => rule.name === desired.name);
    if (current === undefined) created.push(await transport.createAutoModerationRule(guildId, desired));
    else updated.push(await transport.updateAutoModerationRule(guildId, current.id, desired));
  }
  return Object.freeze({ created: Object.freeze(created), updated: Object.freeze(updated) });
}
