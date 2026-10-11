import { botToken, DiscordRestTransport, record } from "./discord.mjs";
import { env } from "./env.mjs";
import { brokerKnowledgeOfferFromMessage, knowledgeBrokerConfig } from "./knowledge-broker.mjs";
import { loadEffectiveKnowledgeTerms, recoverClaimedKnowledgeContributionCandidates } from "./knowledge-intake.mjs";

const GUILD_MESSAGES_INTENT = 1 << 9;

async function gatewayUrl(token) {
  const response = await fetch("https://discord.com/api/v10/gateway/bot", {
    headers: { authorization: `Bot ${token}`, "user-agent": "@red-cup-engineering/turntide-islands-discord-platform knowledge broker (https://561.group)" },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Discord gateway discovery -> ${response.status}: ${text.slice(0, 400)}`);
  const body = JSON.parse(text);
  const base = typeof body["url"] === "string" ? body["url"] : "";
  if (base === "") throw new Error("Discord gateway discovery omitted URL");
  const url = new URL(base);
  url.searchParams.set("v", "10");
  url.searchParams.set("encoding", "json");
  return url.href;
}

/**
 * Start the broker's one narrow Gateway ingress. It requests GUILD_MESSAGES,
 * not the privileged MESSAGE_CONTENT intent, and only acts on MESSAGE_CREATE
 * events whose explicit mentions include this bot.
 */
export async function startKnowledgeBrokerGateway(
  source = process.env,
  options = {},
) {
  const token = env("TTI_KNOWLEDGE_BROKER_DISCORD_TOKEN", source) ?? botToken(source);
  if (token === undefined) throw new Error("knowledge broker requires TTI_KNOWLEDGE_BROKER_DISCORD_TOKEN, DISCORD_BOT_TOKEN, or DISCORD_TOKEN");
  const transport = new DiscordRestTransport({ token });
  const currentUser = await transport.getCurrentUser();
  const config = knowledgeBrokerConfig(source, currentUser.id);
  if (config === null) throw new Error("knowledge broker is not enabled");
  const terms = await loadEffectiveKnowledgeTerms(config);
  const runtimeConfig = { ...config, effectiveTermsDigest: terms.documentDigest };
  const recovery = await recoverClaimedKnowledgeContributionCandidates(config);
  if (recovery.recoveredCandidateIds.length > 0 || recovery.recoveredConsumptionDigests.length > 0) {
    options.log?.(`[knowledge broker] recovered ${recovery.recoveredCandidateIds.length} candidate projection(s) and ${recovery.recoveredConsumptionDigests.length} consumption projection(s)`);
  }
  const configuredGuildId = env("DISCORD_GUILD_ID", source);
  const Socket = options.WebSocket ?? (globalThis).WebSocket;
  if (Socket === undefined) throw new Error("this Node runtime does not provide WebSocket");
  const url = await gatewayUrl(token);
  let running = true;
  let socket;
  let heartbeat;
  let reconnect;
  let sequence = null;

  const connect = () => {
    if (!running) return;
    socket = new Socket(url);
    socket.addEventListener("message", (event) => {
      const rawText = typeof event.data === "string" ? event.data : Buffer.isBuffer(event.data) ? event.data.toString("utf8") : "";
      if (rawText === "") return;
      const packet = JSON.parse(rawText);
      const opcode = packet["op"];
      if (typeof packet["s"] === "number") sequence = packet["s"];
      if (opcode === 10) {
        const interval = Number(record(packet["d"])["heartbeat_interval"]);
        if (heartbeat !== undefined) clearInterval(heartbeat);
        heartbeat = setInterval(() => socket?.send(JSON.stringify({ op: 1, d: sequence })), Number.isFinite(interval) ? interval : 45_000);
        heartbeat.unref?.();
        socket?.send(JSON.stringify({
          op: 2,
          d: { token, intents: GUILD_MESSAGES_INTENT, properties: { os: process.platform, browser: "turntide-knowledge-broker", device: "turntide-knowledge-broker" } },
        }));
        return;
      }
      if (opcode === 1) socket?.send(JSON.stringify({ op: 1, d: sequence }));
      if (opcode === 7) socket?.close(4000, "Discord requested reconnect");
      if (opcode !== 0 || packet["t"] !== "MESSAGE_CREATE") return;
      const message = record(packet["d"]);
      if (configuredGuildId !== undefined && message["guild_id"] !== configuredGuildId) return;
      void brokerKnowledgeOfferFromMessage(message, runtimeConfig, transport)
        .then((result) => result.outcome === "dm-sent" && options.log?.(`[knowledge broker] offer session DM sent: ${result.session?.discord.messageId ?? "unknown"}`))
        .catch((error) => options.log?.(`[knowledge broker] refused/failed: ${error instanceof Error ? error.message : String(error)}`));
    });
    socket.addEventListener("close", (event) => {
      if (heartbeat !== undefined) clearInterval(heartbeat);
      heartbeat = undefined;
      if (!running) return;
      if ([4004, 4013, 4014].includes(event.code ?? 0)) {
        running = false;
        options.log?.(`[knowledge broker] gateway closed permanently with ${event.code ?? "unknown"}`);
        return;
      }
      reconnect = setTimeout(connect, 5_000);
      reconnect.unref?.();
    });
    socket.addEventListener("error", () => options.log?.("[knowledge broker] gateway socket error"));
  };
  connect();
  return {
    botId: currentUser.id,
    close: () => {
      running = false;
      if (heartbeat !== undefined) clearInterval(heartbeat);
      if (reconnect !== undefined) clearTimeout(reconnect);
      socket?.close(1000, "TTI broker shutdown");
    },
  };
}
