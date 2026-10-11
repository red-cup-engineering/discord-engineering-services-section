// Zelo's placement desk. Other services offer things worth bringing to the
// islands — an owned video, a newswire item — and Zelo decides where and when
// each lands. Where comes from the guild shape's subject vocabulary; when
// comes from its pace, so a burst of arrivals becomes a steady tide instead
// of a flood. The ledger is the only memory: it admits each offer once by
// key, queues its targets, and records what was posted, so re-offering is
// always safe.
import { admitPlacementOffer } from "./placement-offer.mjs";

const hour = 3_600_000;
const newsShelfLife = 36 * hour;
const ledgerMemory = 30 * 24 * hour;
const postMemory = 48 * hour;
const maxAttempts = 3;

export function emptyLedger() {
  return { type: "TTIPlacementLedger", version: 1, entries: {}, posts: [] };
}

export function admitLedger(raw) {
  if (raw?.type !== "TTIPlacementLedger" || raw.version !== 1 || typeof raw.entries !== "object" || !Array.isArray(raw.posts)) throw new TypeError("placement ledger must be TTIPlacementLedger v1");
  return raw;
}

/** Which subjects an item carries, strongest first. Declared subjects are the offering service's word; hints and keywords are evidence. */
export function scoreSubjects(shape, offer) {
  const subjects = shape.placement.subjects;
  const title = offer.item.title.toLowerCase();
  const body = `${offer.item.summary ?? ""} ${(offer.item.tags ?? []).join(" ")}`.toLowerCase();
  const scores = Object.keys(subjects).map((subject, order) => {
    let score = (offer.subjects ?? []).includes(subject) ? 3 : 0;
    if ((offer.hints ?? []).includes(subject)) score += 1;
    for (const keyword of subjects[subject].keywords) {
      const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(keyword.toLowerCase())}(e?s)?($|[^\\p{L}\\p{N}])`, "u");
      if (pattern.test(title)) score += 2;
      else if (pattern.test(body)) score += 1;
    }
    return { subject, score, order };
  });
  return scores.filter((entry) => entry.score > 0).sort((a, b) => (b.score - a.score) || (a.order - b.order));
}

/** The channels an offer should reach: a video goes to its strongest island; news goes to the wire and, when the evidence is strong enough, one island. */
export function routeOffer(shape, offer) {
  const ranked = scoreSubjects(shape, offer);
  const best = ranked[0];
  const islandKey = best !== undefined && (offer.kind === "video" || best.score >= 2) ? shape.placement.subjects[best.subject].island : undefined;
  const targets = [
    ...(offer.kind === "news" ? [shape.placement.wire] : []),
    ...(islandKey === undefined ? [] : [islandKey]),
  ];
  return { subject: best?.subject, targets: [...new Set(targets)] };
}

export function admitOffers(ledger, shape, offers, now) {
  const admitted = [];
  for (const raw of offers) {
    const offer = admitPlacementOffer(raw);
    if (ledger.entries[offer.key] !== undefined) {
      admitted.push({ key: offer.key, status: "known" });
      continue;
    }
    const route = routeOffer(shape, offer);
    ledger.entries[offer.key] = {
      offer,
      subject: route.subject ?? null,
      admittedAt: new Date(now).toISOString(),
      targets: Object.fromEntries(route.targets.map((channel) => [channel, { status: "queued", attempts: 0 }])),
    };
    admitted.push({ key: offer.key, status: route.targets.length === 0 ? "unrouted" : "queued", subject: route.subject ?? null, targets: route.targets });
  }
  return admitted;
}

/** The posts the pace allows right now, at most one per channel, owned videos before news and fresh news before stale. */
export function duePlacements(ledger, shape, now) {
  const pace = shape.placement.pace;
  const since = (channel, kind, window) => ledger.posts.filter((post) => post.channel === channel && (kind === undefined || post.kind === kind) && now - Date.parse(post.at) < window);
  const lastAt = (channel) => Math.max(0, ...ledger.posts.filter((post) => post.channel === channel).map((post) => Date.parse(post.at)));
  const open = (channel, kind) => {
    if (channel === shape.placement.wire) {
      return since(channel, "news", 24 * hour).length < pace.news.wirePerDay && now - lastAt(channel) >= pace.news.wireSpacingMinutes * 60_000;
    }
    if (kind === "video") return now - lastAt(channel) >= pace.video.islandSpacingMinutes * 60_000;
    return since(channel, "news", 24 * hour).length < pace.news.perIslandPerDay && now - lastAt(channel) >= pace.news.islandSpacingMinutes * 60_000;
  };
  const queued = Object.entries(ledger.entries)
    .flatMap(([key, entry]) => Object.entries(entry.targets).filter(([, target]) => target.status === "queued").map(([channel]) => ({ key, channel, entry })))
    .sort((a, b) => kindRank(a.entry) - kindRank(b.entry) || freshness(b.entry) - freshness(a.entry));
  const taken = new Set();
  const due = [];
  for (const candidate of queued) {
    if (taken.has(candidate.channel) || !open(candidate.channel, candidate.entry.offer.kind)) continue;
    taken.add(candidate.channel);
    due.push(candidate);
  }
  return due;
}

export function recordPosted(ledger, key, channel, messageId, now, status = "posted") {
  ledger.entries[key].targets[channel] = { status, messageId, at: new Date(now).toISOString() };
  if (status === "posted") ledger.posts.push({ channel, kind: ledger.entries[key].offer.kind, at: new Date(now).toISOString() });
}

export function recordFailure(ledger, key, channel, error, now) {
  const target = ledger.entries[key].targets[channel];
  const attempts = (target.attempts ?? 0) + 1;
  ledger.entries[key].targets[channel] = { status: attempts >= maxAttempts ? "failed" : "queued", attempts, error: String(error).slice(0, 300), at: new Date(now).toISOString() };
}

/**
 * A source retracts what it offered: queued targets are dropped, and each
 * posted target is returned so the desk can remove its message. A withdrawn
 * entry stays in the ledger, so a later re-offer of the same key stays known.
 */
export function withdrawSource(ledger, sourceId, now) {
  const posted = [];
  for (const [key, entry] of Object.entries(ledger.entries)) {
    if (entry.offer.source.id !== sourceId) continue;
    for (const [channel, target] of Object.entries(entry.targets)) {
      if (target.status === "posted" || target.status === "already-present") posted.push({ key, channel, messageId: target.messageId });
      else if (target.status === "queued") entry.targets[channel] = { status: "withdrawn", at: new Date(now).toISOString() };
    }
  }
  return posted;
}

export function recordWithdrawn(ledger, key, channel, now) {
  ledger.entries[key].targets[channel] = { ...ledger.entries[key].targets[channel], status: "withdrawn", at: new Date(now).toISOString() };
}

/** News that waited past its shelf life is dropped from the queue; terminal entries are forgotten once dedupe no longer needs them. */
export function settleLedger(ledger, now) {
  for (const [key, entry] of Object.entries(ledger.entries)) {
    for (const [channel, target] of Object.entries(entry.targets)) {
      if (target.status === "queued" && entry.offer.kind === "news" && now - freshness(entry) > newsShelfLife) entry.targets[channel] = { status: "expired", at: new Date(now).toISOString() };
    }
    const settled = Object.values(entry.targets).every((target) => target.status !== "queued");
    if (settled && now - Date.parse(entry.admittedAt) > ledgerMemory) delete ledger.entries[key];
  }
  ledger.posts = ledger.posts.filter((post) => now - Date.parse(post.at) < postMemory);
}

/** Zelo's line for a placement: plain, sourced, no hype. */
export function renderPlacement(shape, entry, channel) {
  const { offer } = entry;
  const title = escapeMarkdown(offer.item.title);
  if (offer.kind === "video") {
    if(offer.item.resources?.length)return `📚 **${title}** · ${escapeMarkdown(offer.source.name)}\n${offer.item.resources.map(resource=>`${escapeMarkdown(resource.label)}: ${resource.url}`).join('\n')}\nFull lesson: ${offer.item.url}`;
    return `🎬 new from **${escapeMarkdown(offer.source.name)}**: ${title}\n${offer.item.url}`;
  }
  if (channel === shape.placement.wire) {
    const summary = offer.item.summary === undefined ? "" : `\n> ${escapeMarkdown(clip(offer.item.summary, 280))}`;
    return `📰 **${title}** · ${escapeMarkdown(offer.source.name)}${summary}\n${offer.item.url}`;
  }
  return `from the wire · ${escapeMarkdown(offer.source.name)}: **${title}**\n${offer.item.url}`;
}

function kindRank(entry) {
  return entry.offer.kind === "video" ? 0 : 1;
}

function freshness(entry) {
  const published = Date.parse(entry.offer.item.published ?? "");
  return Number.isFinite(published) ? published : Date.parse(entry.admittedAt);
}

function clip(text, length) {
  const flat = text.replace(/\s+/gu, " ").trim();
  return flat.length <= length ? flat : `${flat.slice(0, length - 1).replace(/\s+\S*$/u, "")}…`;
}

function escapeMarkdown(text) {
  return text.replace(/[\r\n]+/gu, " ").replace(/[*_~`|>\\]/gu, "\\$&");
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\/]/gu, "\\$&");
}
