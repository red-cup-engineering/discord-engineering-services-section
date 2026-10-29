/**
 * A minimal, real RSS 2.0 / Atom feed item parser. MetroPlat has an RSS
 * writer (codecs/text/xml/rss projects our own articles as RSS) but no
 * parser for reading someone else's feed — checked before writing this.
 * Regex-based block extraction is a deliberate, scoped choice for this one
 * well-known, regularly-structured format rather than a general XML DOM.
 */

const itemPattern = /<item\b[^>]*>([\s\S]*?)<\/item>/giu;
const entryPattern = /<entry\b[^>]*>([\s\S]*?)<\/entry>/giu;

export function parseFeedItems(xml) {
  const items = [...xml.matchAll(itemPattern)].map((match) => rssItem(match[1] ?? ""));
  if (items.length > 0) return items;
  return [...xml.matchAll(entryPattern)].map((match) => atomEntry(match[1] ?? ""));
}

function rssItem(block) {
  return Object.freeze({
    title: tag(block, "title") ?? "",
    link: tag(block, "link"),
    summary: tag(block, "description") ?? tag(block, "content:encoded"),
    published: tag(block, "pubDate"),
    guid: tag(block, "guid"),
  });
}

function atomEntry(block) {
  return Object.freeze({
    title: tag(block, "title") ?? "",
    link: attr(block, "link", "href"),
    summary: tag(block, "summary") ?? tag(block, "content"),
    published: tag(block, "published") ?? tag(block, "updated"),
    guid: tag(block, "id"),
  });
}

function tag(block, name) {
  const pattern = new RegExp(`<${escapeRegex(name)}\\b[^>]*>([\\s\\S]*?)<\\/${escapeRegex(name)}>`, "iu");
  const match = pattern.exec(block);
  if (match === null) return undefined;
  return decodeXmlText(match[1] ?? "").trim() || undefined;
}

function attr(block, name, attrName) {
  const pattern = new RegExp(`<${escapeRegex(name)}\\b[^>]*\\b${escapeRegex(attrName)}="([^"]*)"[^>]*\\/?>`, "iu");
  const match = pattern.exec(block);
  return match?.[1] === undefined ? undefined : decodeXmlText(match[1]).trim() || undefined;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

const namedEntities = Object.freeze({
  amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ",
});

function decodeXmlText(value) {
  const cdataMatch = /^\s*<!\[CDATA\[([\s\S]*)\]\]>\s*$/u.exec(value);
  const raw = cdataMatch?.[1] ?? value;
  return raw
    .replace(/&#(\d+);/gu, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/giu, (_match, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/giu, (match, name) => namedEntities[name.toLowerCase()] ?? match)
    .replace(/<[^>]*>/gu, " ")
    .trim();
}

export async function fetchFeedItems(url, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const res = await fetchImpl(url, { headers: { "user-agent": "@red-cup-engineering/turntide-islands-discord-platform signal ingest (https://turntide-islands.561.group)" } });
  if (!res.ok) throw new Error(`feed fetch failed ${url} -> ${res.status}`);
  return parseFeedItems(await res.text());
}
