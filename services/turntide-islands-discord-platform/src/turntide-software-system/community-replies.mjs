#!/usr/bin/env node
// Only explicit bot mentions in the question and AI channels become inference requests.
// Durable state is a message ID per channel, never member message content.
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const guildId = "1184863861065658419";
const channels = [
  { id: "1396155279208484997", name: "question-quarry" },
  { id: "1344134778978439290", name: "ai-archipelago" },
];
const discordBase = "https://discord.com/api/v10";
const model = "nvidia/nemotron-3-super-120b-a12b";
const rainGardenRecord = "https://turntide-islands.561.group/rain-garden-question/";
const stateFile = process.env.TTI_REPLY_CURSOR_FILE ?? "/home/emsenn/services/turntide-islands-discord-platform/shared/data/question-quarry-reply-cursor.json";

function concernsRainGarden(question) {
  return /rain[ -]?garden|stormwater|runoff|downspout/iu.test(question);
}

async function discord(method, route, body) {
  const response = await fetch(`${discordBase}${route}`, {
    method,
    headers: { authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Discord ${method} ${route}: ${response.status}`);
  return response.json();
}

async function infer(question, channel) {
  const task = channel.name === "question-quarry"
    ? "You are the Turntide Islands research steward in #question-quarry. Help the person frame a checkable question and identify what source or observation would answer it. Distinguish established guidance, a proposed idea, and an observed local result. You cannot browse or inspect the live public record; do not pretend to have checked a current source. Ask for a human source review when a claim needs one."
    : "You are Zelo, answering a direct mention in Turntide Islands' private #ai-archipelago experiment channel. Answer the person's actual question in a conversational voice. Do not treat a bot experiment as a completed community decision.";
  const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.NVIDIA_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: `${task} Answer the explicit question in at most four short sentences. Never claim a local trial, human review, or member consent that did not occur. Give a source URL only if you know it accurately; otherwise suggest what to verify. The mentioned message is for this reply only and does not enter the public Vault. Do not make financial, moderation, or admission decisions. Keep the answer under 1200 characters.` },
        { role: "user", content: question },
      ],
      temperature: 0.3,
      reasoning_effort: "none",
      max_tokens: 350,
      stream: false,
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`NVIDIA inference: ${response.status}`);
  const result = await response.json();
  const answer = result.choices?.[0]?.message?.content;
  if (typeof answer !== "string" || answer.trim() === "") throw new Error("Inference returned no answer");
  const concise = answer.trim();
  return concise.length <= 1450 ? concise : `${concise.slice(0, 1450).replace(/\s+\S*$/u, "").trimEnd()}…`;
}

async function saveCursors(cursors) {
  await mkdir(path.dirname(stateFile), { recursive: true });
  const temporary = `${stateFile}.tmp`;
  await writeFile(temporary, JSON.stringify({ cursors }) + "\n");
  await rename(temporary, stateFile);
}

async function start() {
  if (!process.env.DISCORD_BOT_TOKEN || !process.env.NVIDIA_API_KEY) throw new Error("Discord bot and NVIDIA inference credentials are required");
  const bot = await discord("GET", "/users/@me");
  for (const channel of channels) {
    const observed = await discord("GET", `/channels/${channel.id}`);
    if (observed.guild_id !== guildId || observed.name !== channel.name) throw new Error(`${channel.name} identity changed`);
  }
  if (process.argv.includes("--probe")) {
    process.stdout.write(`${await infer("What evidence would help answer the rain-garden question?", channels[0])}\n`);
    return;
  }
  const stored = JSON.parse(await readFile(stateFile, "utf8").catch(() => "null"));
  const cursors = {};
  for (const channel of channels) {
    const previous = stored?.cursors?.[channel.id] ?? (stored?.channelId === channel.id ? stored.cursor : undefined);
    if (typeof previous === "string" && /^\d+$/u.test(previous)) cursors[channel.id] = previous;
    else {
      const latest = await discord("GET", `/channels/${channel.id}/messages?limit=1`);
      cursors[channel.id] = latest[0]?.id ?? "0";
    }
    process.stderr.write(`Turntide replies watching #${channel.name} after ${cursors[channel.id]}\n`);
  }
  await saveCursors(cursors);
  for (;;) {
    for (const channel of channels) {
      try {
        const messages = await discord("GET", `/channels/${channel.id}/messages?after=${cursors[channel.id]}&limit=100`);
        messages.sort((a, b) => BigInt(a.id) < BigInt(b.id) ? -1 : 1);
        for (const message of messages) {
          if (!message.author?.bot && message.mentions?.some((mention) => mention.id === bot.id)) {
            const prior = await discord("GET", `/channels/${channel.id}/messages?limit=100`);
            const alreadyReplied = prior.some((entry) => entry.author?.id === bot.id && entry.message_reference?.message_id === message.id);
            if (!alreadyReplied) {
              const question = (message.content ?? "").replaceAll(new RegExp(`<@!?${bot.id}>`, "g"), "").trim().slice(0, 4000);
              let answer;
              try { answer = question ? await infer(question, channel) : "Please include a question with the mention."; }
              catch (error) {
                process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
                answer = "I could not reach the model just now. Please try mentioning me again later.";
              }
              const recordLink = channel.name === "question-quarry" && concernsRainGarden(question)
                ? `\n\nCurrent rain-garden question and source trail: ${rainGardenRecord} (no local trial or witnessed result recorded).`
                : "";
              await discord("POST", `/channels/${channel.id}/messages`, {
                content: `${channel.name === "question-quarry" ? "AI research draft — verify sources and local conditions." : "AI reply — check factual claims before relying on them."}\n\n${answer}${recordLink}`,
                message_reference: { message_id: message.id, channel_id: channel.id, guild_id: guildId, fail_if_not_exists: false },
                allowed_mentions: { parse: [] },
              });
            }
          }
          cursors[channel.id] = message.id;
          await saveCursors(cursors);
        }
      } catch (error) {
        process.stderr.write(`Turntide #${channel.name} reply poll: ${error instanceof Error ? error.message : String(error)}\n`);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 15000));
  }
}

start().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
