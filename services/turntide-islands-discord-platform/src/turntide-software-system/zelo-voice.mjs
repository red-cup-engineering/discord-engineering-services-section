

/**
 * Zelo's public voice for surfacing what it measures. The register isn't a
 * costume over the numbers — it's the same materialist move the community
 * already applies to climate news (dread stated flat, treated as evidence,
 * never smoothed over with forced positivity; blame goes to structure, not
 * to individuals; no engagement bait). Every line below traces to a real
 * field of the report — the voice reframes what was measured, it does not
 * invent additional content.
 */
export function surfaceCausalSignal(report) {
  if (report.closedTimelikeCurve) {
    return [
      "found a message that traces back to causing itself. not a metaphor, an actual loop in the reply chain.",
      report.offending ? `${report.offending.from} ↔ ${report.offending.to}, near as I can tell.` : undefined,
      "that's not a vibes problem, that's a broken record. flagging it for a human, not smoothing it over.",
    ].filter((line) => line !== undefined).join(" ");
  }

  const lines = [];

  if (report.discourseIslands <= 1) {
    lines.push("ran the numbers: everyone's actually cross-talking right now, one connected structure, no islands. that's rare here. not going to pretend it's normal.");
  } else {
    lines.push(`${report.discourseIslands} separate conversation islands right now. nobody's cross-referencing anybody else's thread.`);
    lines.push("not a vibes problem — that's what atomized response to a shared problem looks like. same failure mode as the actual crisis: everyone dealing with it alone instead of together.");
  }

  if (report.coordinationCost === 0) {
    lines.push("zero redundant paths holding any of this together, which means every thread here is one dropped reply from just not existing. no backup, no safety net. sound familiar.");
  } else {
    lines.push(`${report.coordinationCost} place(s) where independent threads reconverged on their own, no one telling them to. that's coordination happening without being asked for. worth noticing when it's rare.`);
  }

  if (report.openEventCount > 0) {
    lines.push(`${report.openEventCount} thread(s) nobody followed up on. someone opened something and it just sat there. that's not on them, that's on whoever didn't pick it up.`);
  }

  lines.push(`${report.orderingFraction < 0.2
    ? "conversation's mostly parallel monologues right now, barely anyone building on the last thing said."
    : report.orderingFraction > 0.7
      ? "conversation's basically one long thread, everyone actually building on what came before."
      : "some of this builds on what came before, some of it doesn't."} (${report.eventCount} events read, ${report.layerCount} layers deep.)`);

  return lines.join("\n");
}
