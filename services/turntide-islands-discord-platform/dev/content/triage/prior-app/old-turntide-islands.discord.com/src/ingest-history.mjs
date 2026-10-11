#!/usr/bin/env node
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const siteRoot = path.resolve(fileURLToPath(import.meta.url), "../..");
const repoRoot = path.resolve(siteRoot, "../..");
loadDotEnv(path.join(siteRoot, ".env"));
loadDotEnv(path.join(repoRoot, ".envrc"));

const namespace = "discord-organizer";
const dataRoot = env("TTI_AGENT_DATA_ROOT") ?? path.join(siteRoot, "data", "agent");
const limit = integerEnv("TTI_INGEST_HISTORY_LIMIT", 50);
const token = env("DISCORD_BOT_TOKEN") ?? env("DISCORD_TOKEN");
const guildId = env("DISCORD_GUILD_ID");

function env(name) {
  const value = process.env[name];
  return value === undefined || value.length === 0 ? undefined : value;
}

function integerEnv(name, fallback) {
  const value = Number(env(name));
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function loadDotEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
    const assignment = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
    if (assignment === null) continue;
    const key = assignment[1];
    let value = assignment[2].trim();
    const quoted =
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"));
    if (quoted && value.length >= 2) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function safe(name) {
  return name.replace(/[^A-Za-z0-9._-]/g, "_");
}

function logPath(root, at) {
  const stamp = at.slice(0, 10);
  return path.join(root, "log", stamp.slice(0, 4), stamp.slice(5, 7), stamp.slice(8, 10), `${stamp}-${safe(namespace)}-log.jsonl`);
}

function walkFiles(dir) {
  let names;
  try {
    names = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const entry of names) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
}

function existingMessageIds(root) {
  const ids = new Set();
  for (const file of walkFiles(path.join(root, "log")).filter((item) => item.endsWith(`-${safe(namespace)}-log.jsonl`))) {
    let raw = "";
    try {
      raw = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const line of raw.split(/\r?\n/)) {
      if (line.trim().length === 0) continue;
      try {
        const entry = JSON.parse(line);
        if (entry["kind"] === "discord-message" && typeof entry["message"] === "string") ids.add(entry["message"]);
      } catch {
        // Ignore partial or non-JSON lines; this is an append-only operational log.
      }
    }
  }
  return ids;
}

async function discordGet(route) {
  if (token === undefined) throw new Error("DISCORD_BOT_TOKEN or DISCORD_TOKEN is required");
  const res = await fetch(`https://discord.com/api/v10${route}`, {
    headers: {
      authorization: `Bot ${token}`,
      "content-type": "application/json",
      "user-agent": "turntide-islands.discord.com history ingestion (https://561.group, 0.0.1)",
    },
  });
  if (res.status === 429) {
    const body = await res.json().catch(() => ({}));
    await new Promise((resolve) => setTimeout(resolve, Math.ceil((body.retry_after ?? 1) * 1000)));
    return discordGet(route);
  }
  const text = await res.text();
  if (!res.ok) throw new Error(`discord GET ${route} -> ${res.status}: ${text.slice(0, 200)}`);
  return text.length === 0 ? null : JSON.parse(text);
}

function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function stringField(value, name) {
  const field = value[name];
  return typeof field === "string" ? field : "";
}

function boolField(value, name) {
  return value[name] === true;
}

async function main() {
  if (guildId === undefined) {
    process.stderr.write("ingest-history blocked by DISCORD_GUILD_ID\n");
    return 1;
  }

  const now = new Date().toISOString();
  const seen = existingMessageIds(dataRoot);
  const channelsRaw = await discordGet(`/guilds/${guildId}/channels`);
  const channels = Array.isArray(channelsRaw) ? channelsRaw.map(record) : [];
  let channelsRead = 0;
  let channelsSkipped = 0;
  let messagesSeen = 0;
  let messagesAdded = 0;
  const entries = [];

  for (const channel of channels) {
    const channelId = stringField(channel, "id");
    if (channelId.length === 0) continue;
    let messagesRaw;
    try {
      messagesRaw = await discordGet(`/channels/${channelId}/messages?limit=${Math.min(100, Math.max(1, limit))}`);
    } catch {
      channelsSkipped += 1;
      continue;
    }
    channelsRead += 1;
    const messages = Array.isArray(messagesRaw) ? messagesRaw.map(record) : [];
    messagesSeen += messages.length;
    for (const message of messages) {
      const messageId = stringField(message, "id");
      if (messageId.length === 0 || seen.has(messageId)) continue;
      seen.add(messageId);
      const author = record(message["author"]);
      const content = stringField(message, "content");
      entries.push({
        t: now,
        kind: "discord-message",
        source: "rest-history",
        session: `discord-organizer:${guildId}`,
        guild: guildId,
        channel: channelId,
        channelName: stringField(channel, "name"),
        message: messageId,
        author: stringField(author, "id"),
        actor: stringField(author, "username"),
        authorBot: boolField(author, "bot"),
        content,
        contentPresent: content.length > 0,
      });
    }
  }

  if (entries.length > 0) {
    const target = logPath(dataRoot, now);
    mkdirSync(path.dirname(target), { recursive: true });
    appendFileSync(target, entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n", "utf8");
    messagesAdded = entries.length;
  }

  process.stdout.write(`guild: ${guildId}\n`);
  process.stdout.write(`channels seen: ${channels.length}\n`);
  process.stdout.write(`channels read: ${channelsRead}\n`);
  process.stdout.write(`channels skipped: ${channelsSkipped}\n`);
  process.stdout.write(`messages seen: ${messagesSeen}\n`);
  process.stdout.write(`messages added: ${messagesAdded}\n`);
  return 0;
}

main().then((code) => process.exit(code)).catch((error) => {
  process.stderr.write(`ingest-history failed: ${(error).message}\n`);
  process.exit(1);
});
