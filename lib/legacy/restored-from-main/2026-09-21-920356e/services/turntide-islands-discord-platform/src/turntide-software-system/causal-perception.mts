import type { DiscordMessage } from "./discord.mts";

export interface CausalLink { readonly from: string; readonly to: string }
export interface CausalSetCarrier { readonly kind: "lorentzian.causalSet"; readonly events: readonly string[]; readonly links: readonly CausalLink[] }
interface CausalWitness { readonly kind: "lorentzian.causalSettle:witness"; readonly events: readonly string[]; readonly links: readonly CausalLink[]; readonly closure: readonly CausalLink[] }
interface CausalObstruction { readonly kind: "lorentzian.causalSettle-obstruction"; readonly reason: "closed-timelike-curve"; readonly events: readonly string[]; readonly links: readonly CausalLink[]; readonly offending: CausalLink }
type CausalSettlementJudgment = CausalWitness | CausalObstruction;
const mentionPattern = /<@!?(\d+)>/gu;

export function causalSetOfMessages(messages: readonly DiscordMessage[]): CausalSetCarrier {
  const known = new Set(messages.map((message) => message.id));
  const sorted = [...messages].sort((left, right) => left.timestamp.localeCompare(right.timestamp));
  const lastMessageByAuthor = new Map<string, string>(), lastMessageByChannel = new Map<string, string>();
  const links: CausalLink[] = [];
  for (const message of sorted) {
    const causes = new Set<string>();
    if (message.replyToId !== undefined && known.has(message.replyToId) && message.replyToId !== message.id) causes.add(message.replyToId);
    for (const match of message.content.matchAll(mentionPattern)) {
      const mentioned = lastMessageByAuthor.get(match[1]!); if (mentioned !== undefined && mentioned !== message.id) causes.add(mentioned);
    }
    if (causes.size === 0) { const previous = lastMessageByChannel.get(message.channelId); if (previous !== undefined) causes.add(previous); }
    for (const cause of causes) links.push(Object.freeze({ from: cause, to: message.id }));
    lastMessageByAuthor.set(message.authorId, message.id); lastMessageByChannel.set(message.channelId, message.id);
  }
  return Object.freeze({ kind: "lorentzian.causalSet", events: Object.freeze(messages.map((message) => message.id)), links: Object.freeze(links) });
}

function settle(carrier: CausalSetCarrier): CausalSettlementJudgment {
  const reach = new Map(carrier.events.map((event) => [event, new Set<string>()]));
  for (const link of carrier.links) reach.get(link.from)?.add(link.to);
  let changed = true;
  while (changed) {
    changed = false;
    for (const from of carrier.events) for (const middle of [...(reach.get(from) ?? [])]) for (const to of reach.get(middle) ?? []) {
      if (!reach.get(from)!.has(to)) { reach.get(from)!.add(to); changed = true; }
    }
  }
  for (const event of carrier.events) if (reach.get(event)?.has(event)) return { kind: "lorentzian.causalSettle-obstruction", reason: "closed-timelike-curve", events: carrier.events, links: carrier.links, offending: { from: event, to: event } };
  const closure = carrier.events.flatMap((from) => [...(reach.get(from) ?? [])].map((to) => Object.freeze({ from, to })));
  return Object.freeze({ ...carrier, kind: "lorentzian.causalSettle:witness" as const, closure: Object.freeze(closure) });
}

export function openEvents(settlement: CausalSettlementJudgment): readonly string[] {
  if (settlement.kind !== "lorentzian.causalSettle:witness") return [];
  const hasSuccessor = new Set(settlement.closure.map((link: CausalLink) => link.from));
  return settlement.events.filter((event: string) => !hasSuccessor.has(event));
}

function componentCount(events: readonly string[], links: readonly CausalLink[]): number {
  const parent = new Map(events.map((event) => [event, event]));
  const find = (event: string): string => { let root = event; while (parent.get(root) !== root) root = parent.get(root)!; let cursor = event; while (parent.get(cursor) !== root) { const next = parent.get(cursor)!; parent.set(cursor, root); cursor = next; } return root; };
  for (const link of links) { const left = find(link.from), right = find(link.to); if (left !== right) parent.set(left, right); }
  return new Set(events.map(find)).size;
}
function layerCount(carrier: CausalSetCarrier): number {
  const incoming = new Map(carrier.events.map((event) => [event, 0]));
  const outgoing = new Map(carrier.events.map((event) => [event, [] as string[]]));
  for (const link of carrier.links) { incoming.set(link.to, (incoming.get(link.to) ?? 0) + 1); outgoing.get(link.from)?.push(link.to); }
  let frontier = carrier.events.filter((event) => incoming.get(event) === 0), layers = 0, seen = 0;
  while (frontier.length) { layers += 1; seen += frontier.length; const next: string[] = []; for (const event of frontier) for (const target of outgoing.get(event) ?? []) { const count = incoming.get(target)! - 1; incoming.set(target, count); if (count === 0) next.push(target); } frontier = next; }
  return seen === carrier.events.length ? layers : 0;
}

export interface CausalPerceptionReport {
  readonly kind: "turntide.causal-perception.report"; readonly eventCount: number; readonly linkCount: number;
  readonly closedTimelikeCurve: boolean; readonly offending?: CausalLink; readonly orderingFraction: number;
  readonly layerCount: number; readonly openEventCount: number; readonly openEvents: readonly string[];
  readonly discourseIslands: number; readonly coordinationCost: number;
}

export function perceive(messages: readonly DiscordMessage[]): CausalPerceptionReport {
  const carrier = causalSetOfMessages(messages), settlement = settle(carrier), sound = settlement.kind === "lorentzian.causalSettle:witness";
  const comparable = sound ? settlement.closure.length : 0, possible = carrier.events.length * Math.max(0, carrier.events.length - 1) / 2;
  const components = componentCount(carrier.events, carrier.links), open = openEvents(settlement);
  return Object.freeze({ kind: "turntide.causal-perception.report", eventCount: carrier.events.length, linkCount: carrier.links.length,
    closedTimelikeCurve: !sound, offending: sound ? undefined : settlement.offending, orderingFraction: possible === 0 ? 0 : comparable / possible,
    layerCount: sound ? layerCount(carrier) : 0, openEventCount: open.length, openEvents: open.slice(0, 10), discourseIslands: components,
    coordinationCost: Math.max(0, carrier.links.length - carrier.events.length + components) });
}

export function renderCausalReport(report: CausalPerceptionReport): string {
  return [
    `Turntide Islands causal reading — ${report.eventCount} events, ${report.linkCount} causal links.`,
    report.closedTimelikeCurve ? `⚠ closed timelike curve detected${report.offending ? ` at ${report.offending.from} → ${report.offending.to}` : ""}.` : "causal structure is sound (no closed timelike curve).",
    `ordering fraction: ${report.orderingFraction.toFixed(3)}`, `${report.layerCount} light-cone layers deep.`,
    `${report.openEventCount} open event(s): ${report.openEvents.join(", ") || "none"}.`, `${report.discourseIslands} causally disconnected discourse island(s) (H0).`,
    `${report.coordinationCost} independent coordination cycle(s) (H1).`,
  ].join("\n");
}
