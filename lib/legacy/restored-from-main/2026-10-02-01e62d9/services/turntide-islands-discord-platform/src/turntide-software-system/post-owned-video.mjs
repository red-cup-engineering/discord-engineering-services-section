#!/usr/bin/env node
// Runs on the Discord host. The YouTube observer sends one validated message
// over SSH; the bot credential never leaves this host.
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

const GUILD = "1184863861065658419";
const CHATTER = "1304191468834918541";
const CHANNELS = new Set([
  "1424106171735998464", // academic-acantilado
  "1419140845742981130", // analysis-atoll
  "1314589752644735016", // blockchain-bay
  "1346541935984115774", // cooking-cove
  "1346507970070052944", // economy-estuary
  "1346508698809532416", // garden-grove
  "1346508058603421778", // praxis-penisula
  "1264035560624881674", // silicon-sandbar
]);
const token = process.env.DISCORD_BOT_TOKEN ?? parseEnv(readFileSync("/home/emsenn/services/turntide-islands-discord-platform/runtime.env", "utf8")).DISCORD_BOT_TOKEN;
if (!token) throw new Error("TTI Discord bot credential is unavailable");
const input = JSON.parse(readFileSync(0, "utf8"));
if (!/^[\w-]{11}$/.test(input.videoId) || !CHANNELS.has(input.channelId) || typeof input.content !== "string" || input.content.length > 1800 || !input.content.includes(`https://youtu.be/${input.videoId}`)) throw new Error("Invalid video placement");

async function discord(method, path, body) {
  const response = await fetch(`https://discord.com/api/v10${path}`, {
    method,
    headers: { authorization: `Bot ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(`Discord ${method} ${path}: HTTP ${response.status} ${JSON.stringify(value)}`);
  return value;
}
const channel = await discord("GET", `/channels/${input.channelId}`);
if (channel.guild_id !== GUILD || channel.parent_id !== CHATTER || channel.type !== 0) throw new Error("Target is no longer a TTI chatter channel");
const recent = await discord("GET", `/channels/${input.channelId}/messages?limit=100`);
let message = recent.find((item) => item.author?.bot && item.content?.includes(`https://youtu.be/${input.videoId}`));
let posted = false;
if (!message) {
  message = await discord("POST", `/channels/${input.channelId}/messages`, { content: input.content, allowed_mentions: { parse: [] } });
  posted = true;
}
process.stdout.write(`${JSON.stringify({ videoId: input.videoId, channelId: input.channelId, messageId: message.id, posted })}\n`);
