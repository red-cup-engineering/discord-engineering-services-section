/**
 * Zelo's agency: the same shape as feltos's proven NPC utility-AI
 * (src/mud/npc-agency.mts — situation read off the world, one pure scoring
 * function picks the best option, the caller executes it against the world).
 * Re-earned here rather than importing @red-cup-engineering/fizzos, since only the shape
 * is needed, not the ships/market/combat that come with the whole package.
 *
 * The one deliberate difference from the NPC pattern: nothing here ever
 * bypasses a human on PUBLIC delivery. Ingesting and drafting are autonomous
 * because they're safe (a draft is inert until approved); the escalation
 * actions are autonomous because they only ever notify a human, they never
 * post content to a public lane on their own.
 */

/** Discourse-island count at or above which fragmentation is worth a human's attention. */
export const FRAGMENTATION_ALERT_THRESHOLD = 3;

/**
 * Pure utility scoring — no LLM, no script, real thresholds against real
 * signals. Mirrors chooseNpcAction's shape exactly: score every option that
 * currently applies, take the highest, idle if nothing does.
 */
export function chooseZeloAction(s) {
  const options = [];
  if (s.discourseIslands >= FRAGMENTATION_ALERT_THRESHOLD && s.discourseIslands > s.lastAlertedIslandCount) {
    options.push([30, { kind: "escalate-fragmentation", islands: s.discourseIslands, coordinationCost: s.coordinationCost }]);
  }
  if (s.undraftedSignalCount > 0) {
    options.push([10, { kind: "draft-next-signal" }]);
  }
  if (options.length === 0) return { kind: "idle" };
  options.sort((left, right) => right[0] - left[0]);
  return options[0][1];
}
