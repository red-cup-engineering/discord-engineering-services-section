// Turntide's emoji and stickers are owned as source files in the public
// Turntide content (`content/expressions/`); the guild only ever holds a
// projection of them. Projection is additive and ordered: catalog order is
// priority, so the free tier's slots carry the expressions that matter most
// and boost-only slots carry the ones the community can lose. Nothing the
// steward did not place is ever removed, and a boost lapse locks (Discord
// marks `available: false`) rather than deletes, so a returning boost
// restores the same set without a re-upload.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadImage, createCanvas } from "@napi-rs/canvas";
import { discordExpressionLimitErrorCodes, discordGuildExpressionLimits } from "./discord.mjs";
import { publicTurntideContentPath } from "./env.mjs";

const emojiName = /^[A-Za-z0-9_]{2,32}$/u;
const renderSize = Object.freeze({ emoji: 128, sticker: 320 });
const uploadCeiling = Object.freeze({ emoji: 256 * 1024, sticker: 512 * 1024 });

export function expressionsRoot(source = process.env) {
  return publicTurntideContentPath(source, "expressions");
}

export async function readExpressionCatalog(root) {
  const catalog = JSON.parse(await readFile(path.join(root, "expressions.json"), "utf8"));
  return admitExpressionCatalog(catalog);
}

export function admitExpressionCatalog(catalog) {
  if (catalog?.version !== 1 || !Array.isArray(catalog.expressions)) throw new TypeError("expression catalog must be { version: 1, expressions: [...] }");
  const seen = new Set();
  return Object.freeze(catalog.expressions.map((entry, index) => {
    const at = `expressions[${index}]`;
    if (entry.kind !== "emoji" && entry.kind !== "sticker") throw new TypeError(`${at}.kind must be emoji or sticker`);
    if (typeof entry.source !== "string" || entry.source.length === 0) throw new TypeError(`${at}.source is required`);
    if (entry.kind === "emoji" && !emojiName.test(entry.name ?? "")) throw new TypeError(`${at}.name must be 2-32 letters, digits, or underscores`);
    if (entry.kind === "sticker") {
      if (typeof entry.name !== "string" || entry.name.length < 2 || entry.name.length > 30) throw new TypeError(`${at}.name must be 2-30 characters`);
      if (typeof entry.tags !== "string" || entry.tags.length === 0 || entry.tags.length > 200) throw new TypeError(`${at}.tags must be 1-200 characters`);
      if (entry.description !== undefined && (entry.description.length < 2 || entry.description.length > 100)) throw new TypeError(`${at}.description must be 2-100 characters`);
    }
    const key = `${entry.kind}:${entry.name.toLowerCase()}`;
    if (seen.has(key)) throw new TypeError(`${at} repeats ${entry.kind} ${entry.name}`);
    seen.add(key);
    return Object.freeze({ kind: entry.kind, name: entry.name, source: entry.source, animated: entry.source.endsWith(".gif"), description: entry.description, tags: entry.tags });
  }));
}

/**
 * Pure plan: which catalog entries are already present, which fit in the
 * guild's current free slots, and which wait for capacity. Slots already
 * spent by expressions outside the catalog count against capacity.
 */
export function planExpressions(catalog, observed) {
  const limits = discordGuildExpressionLimits[observed.premiumTier] ?? discordGuildExpressionLimits[0];
  const present = {
    emoji: new Map(observed.emojis.map((emoji) => [emoji.name.toLowerCase(), emoji])),
    sticker: new Map(observed.stickers.map((sticker) => [sticker.name.toLowerCase(), sticker])),
  };
  const free = {
    static: limits.emoji - observed.emojis.filter((emoji) => !emoji.animated).length,
    animated: limits.emoji - observed.emojis.filter((emoji) => emoji.animated).length,
    sticker: limits.sticker - observed.stickers.length,
  };
  return Object.freeze(catalog.map((entry) => {
    const existing = present[entry.kind].get(entry.name.toLowerCase());
    if (existing !== undefined) return Object.freeze({ entry, action: existing.available ? "present" : "locked", id: existing.id });
    const slot = entry.kind === "sticker" ? "sticker" : entry.animated ? "animated" : "static";
    if (free[slot] <= 0) return Object.freeze({ entry, action: "awaits-capacity" });
    free[slot] -= 1;
    return Object.freeze({ entry, action: "create" });
  }));
}

export async function renderExpression(root, entry) {
  const bytes = await readFile(path.join(root, entry.source));
  if (!entry.source.endsWith(".svg")) return Object.freeze({ data: bytes, contentType: contentTypeOf(entry.source), name: path.basename(entry.source) });
  const size = renderSize[entry.kind];
  const image = await loadImage(bytes);
  const canvas = createCanvas(size, size);
  canvas.getContext("2d").drawImage(image, 0, 0, size, size);
  const data = await canvas.encode("png");
  if (data.length > uploadCeiling[entry.kind]) throw new RangeError(`${entry.kind} ${entry.name} renders to ${data.length} bytes, over Discord's ${uploadCeiling[entry.kind]}`);
  return Object.freeze({ data, contentType: "image/png", name: `${path.basename(entry.source, ".svg")}.png` });
}

export async function projectExpressions(transport, guildId, root) {
  const catalog = await readExpressionCatalog(root);
  const [boost, emojis, stickers] = await Promise.all([
    transport.getGuildBoostStatus(guildId),
    transport.listGuildEmojis(guildId),
    transport.listGuildStickers(guildId),
  ]);
  const plan = planExpressions(catalog, { premiumTier: boost.premiumTier, emojis, stickers });
  const full = new Set();
  const outcomes = [];
  for (const step of plan) {
    const { entry } = step;
    if (step.action !== "create") {
      outcomes.push({ kind: entry.kind, name: entry.name, outcome: step.action, ...(step.id === undefined ? {} : { id: step.id }) });
      continue;
    }
    if (full.has(entry.kind)) {
      outcomes.push({ kind: entry.kind, name: entry.name, outcome: "awaits-capacity" });
      continue;
    }
    const file = await renderExpression(root, entry);
    const reason = "Turntide expression catalog projection";
    try {
      const created = entry.kind === "emoji"
        ? await transport.createGuildEmoji(guildId, { name: entry.name, image: file, animated: entry.animated }, reason)
        : await transport.createGuildSticker(guildId, { name: entry.name, description: entry.description, tags: entry.tags, file }, reason);
      outcomes.push({ kind: entry.kind, name: entry.name, outcome: "created", id: created.id });
    } catch (error) {
      if (error?.discordCode !== discordExpressionLimitErrorCodes[entry.kind]) throw error;
      full.add(entry.kind);
      outcomes.push({ kind: entry.kind, name: entry.name, outcome: "awaits-capacity" });
    }
  }
  const count = (outcome) => outcomes.filter((item) => item.outcome === outcome).length;
  return Object.freeze({
    observedAt: new Date().toISOString(),
    guildId,
    premiumTier: boost.premiumTier,
    boostCount: boost.boostCount,
    catalog: catalog.length,
    created: count("created"),
    present: count("present"),
    locked: count("locked"),
    awaitsCapacity: count("awaits-capacity"),
    outcomes: Object.freeze(outcomes),
  });
}

function contentTypeOf(file) {
  if (file.endsWith(".png")) return "image/png";
  if (file.endsWith(".gif")) return "image/gif";
  if (file.endsWith(".webp")) return "image/webp";
  if (file.endsWith(".jpg") || file.endsWith(".jpeg")) return "image/jpeg";
  throw new TypeError(`unsupported expression source ${file}`);
}
