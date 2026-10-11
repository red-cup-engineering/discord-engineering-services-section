// Zelo's placement desk on the Discord host. Reads TTIPlacementOffer values
// (a JSON array, or nothing) from stdin, admits them to the ledger, and posts
// whatever the pace allows now. The host timer runs it with no input so
// queued placements keep draining between offers. `--withdraw <source id>`
// (repeatable) retracts a source's offers and removes what it already posted.
// Dry-run unless `--live`.
import { closeSync, existsSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { DiscordRestTransport } from "../discord.mjs";
import { admitGuildShape } from "../guild-shape.mjs";
import { admitLedger, admitOffers, duePlacements, emptyLedger, recordFailure, recordPosted, recordWithdrawn, renderPlacement, settleLedger, withdrawSource } from "../placement.mjs";

const args = process.argv.slice(2);
const option = (name) => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const live = args.includes("--live");
const shapeFile = option("--shape");
const ledgerFile = option("--ledger");
const withdrawals = args.flatMap((arg, index) => arg === "--withdraw" ? [args[index + 1]] : []);
if (shapeFile === undefined || ledgerFile === undefined) throw new Error("place-offers needs --shape and --ledger");

const shape = admitGuildShape(JSON.parse(readFileSync(shapeFile, "utf8")));
const channelIds = new Map(shape.channels.filter((channel) => channel.archived !== true && channel.discordId !== undefined).map((channel) => [channel.key, channel.discordId]));
const input = process.stdin.isTTY ? "" : readFileSync(0, "utf8").trim();
const offers = input === "" ? [] : JSON.parse(input);
if (!Array.isArray(offers)) throw new TypeError("place-offers reads a JSON array of offers");

const release = live ? await lock(`${ledgerFile}.lock`) : () => {};
try {
  const now = Date.now();
  const ledger = existsSync(ledgerFile) ? admitLedger(JSON.parse(readFileSync(ledgerFile, "utf8"))) : emptyLedger();
  const transport = new DiscordRestTransport({ env: process.env });
  const withdrawn = [];
  for (const sourceId of withdrawals) {
    for (const post of withdrawSource(ledger, sourceId, now)) {
      if (!live) {
        withdrawn.push({ ...post, status: "would-withdraw" });
        continue;
      }
      try {
        const channelId = channelIds.get(post.channel);
        if (channelId !== undefined && post.messageId !== undefined) await transport.deleteMessage(channelId, post.messageId);
        recordWithdrawn(ledger, post.key, post.channel, now);
        withdrawn.push({ ...post, status: "withdrawn" });
      } catch (error) {
        withdrawn.push({ ...post, status: "failed", error: String(error instanceof Error ? error.message : error).slice(0, 300) });
      }
    }
  }
  const admitted = admitOffers(ledger, shape, offers, now);
  settleLedger(ledger, now);
  const placements = [];
  for (const due of duePlacements(ledger, shape, now)) {
    const channelId = channelIds.get(due.channel);
    const content = renderPlacement(shape, due.entry, due.channel);
    if (!live) {
      placements.push({ key: due.key, channel: due.channel, status: "would-post", content });
      continue;
    }
    try {
      if (channelId === undefined) throw new Error(`channel ${due.channel} is not a live declared channel`);
      const recent = await transport.listMessages(channelId, 50);
      const present = recent.find((message) => message.authorBot && message.content.includes(due.entry.offer.item.url) && (due.entry.offer.item.resources??[]).every(resource=>message.content.includes(resource.url)));
      const message = present ?? await transport.createMessage(channelId, { content, allowedMentions: { users: [] } });
      recordPosted(ledger, due.key, due.channel, message.id, now, present === undefined ? "posted" : "already-present");
      placements.push({ key: due.key, channel: due.channel, status: present === undefined ? "posted" : "already-present", messageId: message.id });
    } catch (error) {
      recordFailure(ledger, due.key, due.channel, error instanceof Error ? error.message : error, now);
      placements.push({ key: due.key, channel: due.channel, status: "failed", error: String(error instanceof Error ? error.message : error).slice(0, 300) });
    }
  }
  const queued = Object.values(ledger.entries).flatMap((entry) => Object.entries(entry.targets).filter(([, target]) => target.status === "queued").map(([channel]) => channel));
  if (live) save(ledgerFile, ledger);
  process.stdout.write(`${JSON.stringify({ live, ...(withdrawals.length === 0 ? {} : { withdrawn }), admitted, placements, queued: countBy(queued) })}\n`);
} finally {
  release();
}

function save(file, value) {
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(value)}\n`, { mode: 0o600 });
  renameSync(temp, file);
}

async function lock(file) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      closeSync(openSync(file, "wx"));
      return () => { try { unlinkSync(file); } catch {} };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      if (Date.now() - statSync(file, { throwIfNoEntry: false })?.mtimeMs > 10 * 60_000) unlinkSync(file);
      else if (attempt > 120) throw new Error("placement ledger stayed locked for two minutes");
      else await sleep(1000);
    }
  }
}

function countBy(values) {
  return values.reduce((counts, value) => ({ ...counts, [value]: (counts[value] ?? 0) + 1 }), {});
}
