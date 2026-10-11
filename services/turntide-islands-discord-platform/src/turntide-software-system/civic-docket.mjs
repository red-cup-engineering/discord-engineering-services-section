import { readProposalSubmissionEvents } from "./civic-proposal-drafts.mjs";

function proposalTransition(context) {
  const proposal = context?.protocol?.artifactKinds?.proposal;
  if (proposal === undefined) throw new TypeError("civic docket requires Turntide proposal protocol");
  return (proposal.transitions ?? [])
    .filter((transition) => transition.from === "proposed")
    .map((transition) => Object.freeze({
      to: transition.to,
      mayBePerformedBy: Object.freeze([...(transition.mayBePerformedBy ?? [])]),
      requires: Object.freeze([...(transition.requires ?? [])]),
      effect: transition.effect ?? null,
    }));
}

function latestPublicProposalReceipts(events) {
  const byProposal = new Map();
  for (const event of events) {
    if (event?.type !== "TurntideProposalSubmissionReceipt"
      || typeof event.proposalId !== "string"
      || event.proposalId.length === 0
      || event.state !== "proposed"
      || event.publicMessage?.adapter !== "discord"
      || typeof event.publicMessage?.channelId !== "string"
      || typeof event.publicMessage?.messageId !== "string") continue;
    byProposal.set(event.proposalId, event);
  }
  return [...byProposal.values()].sort((left, right) =>
    String(right.proposedAt ?? "").localeCompare(String(left.proposedAt ?? ""))
      || left.proposalId.localeCompare(right.proposalId));
}

function unsettledActs(context) {
  return (context?.acts ?? [])
    .filter((act) => act?.state !== "received")
    .map((act) => Object.freeze({
      id: act.id,
      state: act.state ?? "unknown",
      requestedAct: act.requestedAct ?? null,
      recordedAt: act.recordedAt ?? null,
      authorityDomain: act.authorityDomain ?? null,
    }))
    .sort((left, right) =>
      String(right.recordedAt ?? "").localeCompare(String(left.recordedAt ?? ""))
        || String(left.id).localeCompare(String(right.id)));
}

/**
 * Turntide's non-ranking civic docket.
 *
 * The docket projects only explicit public proposal-submission receipts plus
 * unsettled durable governance acts. It deliberately has no reactions,
 * popularity, sentiment, activity score, model priority, or inferred support.
 * An unlinked proposal remains proposed until an explicit governance receipt
 * establishes a later state.
 */
export async function buildCivicDocket({ dataRoot, context } = {}) {
  if (typeof dataRoot !== "string" || dataRoot.trim() === "") {
    throw new TypeError("civic docket requires dataRoot");
  }
  const receipts = latestPublicProposalReceipts(await readProposalSubmissionEvents(dataRoot));
  const next = Object.freeze(proposalTransition(context));
  const proposals = receipts.map((receipt) => Object.freeze({
    proposalId: receipt.proposalId,
    proposer: receipt.proposer ?? null,
    state: "proposed",
    proposedAt: receipt.proposedAt ?? null,
    publicMessage: Object.freeze({ ...receipt.publicMessage }),
    next,
    supportMeasurement: "not-measured",
    priority: "not-ranked",
  }));

  return Object.freeze({
    type: "TurntideCivicDocket",
    version: 1,
    state: "current-observed-projection",
    proposals: Object.freeze(proposals),
    unsettledActs: Object.freeze(unsettledActs(context)),
    participation: Object.freeze([
      "read the authored proposal and its evidence",
      "ask questions or add evidence in Governance Rock",
      "state an objection or alternative without pretending it is a vote",
      "volunteer for execution if a later governing act authorizes the work",
      "ask Zelo what lawful transition or receipt is still missing",
    ]),
    rankingInputs: Object.freeze([]),
    rankingLaw: "No ranking, endorsement, sentiment, reaction count, message volume, popularity, silence, tenure, or model preference becomes governance weight.",
    inferenceLaw: "A submitted proposal remains proposed unless an explicit linked governance receipt establishes a later state.",
    bindingEffect: "informational-only",
  });
}

export function formatCivicDocket(docket) {
  if (docket?.type !== "TurntideCivicDocket") throw new TypeError("civic docket formatter requires a TurntideCivicDocket");
  const lines = ["**Turntide civic docket — state, not ranking**"];
  if (docket.proposals.length === 0) {
    lines.push("No public proposal-submission receipts are currently in this docket.");
  } else {
    lines.push(`${docket.proposals.length} submitted proposal(s) are recorded as proposed:`);
    for (const proposal of docket.proposals) {
      const where = proposal.publicMessage.channelName
        ? `#${proposal.publicMessage.channelName}`
        : "Governance Rock";
      const next = proposal.next.map((move) => move.to).join(" / ") || "no automatic transition";
      lines.push(`- ${proposal.proposalId} — proposed in ${where}; lawful governance outcomes: ${next}.`);
    }
  }
  if (docket.unsettledActs.length > 0) {
    lines.push(`Unsettled governance acts: ${docket.unsettledActs.map((act) => `${act.id} [${act.state}]`).join(", ")}.`);
  }
  lines.push("You can read, question, add evidence, object, offer an alternative, or ask what lawful move is missing. None of that is silently counted as a vote.");
  lines.push(docket.rankingLaw);
  return lines.join("\n");
}
