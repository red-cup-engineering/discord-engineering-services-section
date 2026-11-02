import { botToken, record } from "./discord.mts";
import { interactionFromWire, interactionResponseToWire } from "./discord-interactions.mts";
import { env, type EnvMap } from "./env.mts";
import { respondToInteraction } from "./serve.mts";

interface SocketEvent { readonly data?: unknown }
interface SocketCloseEvent { readonly code?: number }
interface SocketLike {
  readonly readyState: number;
  addEventListener(type: "open" | "message" | "close" | "error", listener: (event: SocketEvent & SocketCloseEvent) => void): void;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}
type SocketConstructor = new (url: string) => SocketLike;

async function gatewayUrl(token: string, fetchImpl: typeof fetch): Promise<string> {
  const response = await fetchImpl("https://discord.com/api/v10/gateway/bot", { headers: { authorization: `Bot ${token}`, "user-agent": "@red-cup-engineering/turntide-islands interaction gateway (https://561.group)" } });
  const text = await response.text();
  if (!response.ok) throw new Error(`Discord gateway discovery -> ${response.status}: ${text.slice(0, 400)}`);
  const base = String((JSON.parse(text) as Record<string, unknown>)["url"] ?? "");
  if (base === "") throw new Error("Discord gateway discovery omitted URL");
  const url = new URL(base); url.searchParams.set("v", "10"); url.searchParams.set("encoding", "json"); return url.href;
}

export async function postGatewayInteractionResponse(raw: Record<string, unknown>, source: EnvMap, options: Readonly<{ fetch?: typeof fetch; respond?: typeof respondToInteraction }> = {}): Promise<void> {
  const fetchImpl = options.fetch ?? fetch, interaction = interactionFromWire(raw);
  const response = await (options.respond ?? respondToInteraction)(interaction, raw, source);
  const callback = await fetchImpl(`https://discord.com/api/v10/interactions/${encodeURIComponent(interaction.id)}/${encodeURIComponent(interaction.token)}/callback`, {
    method: "POST", headers: { "content-type": "application/json", "user-agent": "@red-cup-engineering/turntide-islands interaction gateway (https://561.group)" }, body: JSON.stringify(interactionResponseToWire(response)),
  });
  if (!callback.ok) {
    const text = await callback.text(); let code: unknown;
    try { code = (JSON.parse(text) as Record<string, unknown>)["code"]; } catch {}
    if (!(callback.status === 400 && code === 40060)) throw new Error(`Discord interaction callback -> ${callback.status}: ${text.slice(0, 400)}`);
  }
}

export async function startDiscordInteractionGateway(source: EnvMap = process.env, options: Readonly<{ log?: (message: string) => void; WebSocket?: SocketConstructor; fetch?: typeof fetch; readyTimeoutMs?: number }> = {}) {
  const token = botToken(source); if (token === undefined) throw new Error("Discord interaction gateway requires DISCORD_BOT_TOKEN or DISCORD_TOKEN");
  const configuredGuildId = env("DISCORD_GUILD_ID", source); if (configuredGuildId === undefined) throw new Error("Discord interaction gateway requires DISCORD_GUILD_ID");
  const Socket = options.WebSocket ?? (globalThis as unknown as { WebSocket?: SocketConstructor }).WebSocket; if (Socket === undefined) throw new Error("this Node runtime does not provide WebSocket");
  const fetchImpl = options.fetch ?? fetch, url = await gatewayUrl(token, fetchImpl);
  let running = true, socket: SocketLike | undefined, heartbeat: NodeJS.Timeout | undefined, reconnect: NodeJS.Timeout | undefined, sequence: number | null = null, botId: string | null = null, applicationId: string | null = null;
  let acceptReady!: () => void, rejectReady!: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => { acceptReady = resolve; rejectReady = reject; });
  const readyTimeout = setTimeout(() => rejectReady(new Error("Discord interaction gateway READY timed out")), options.readyTimeoutMs ?? 20_000); readyTimeout.unref?.();
  const connect = () => {
    if (!running) return;
    socket = new Socket(url);
    socket.addEventListener("message", (event) => {
      const rawText = typeof event.data === "string" ? event.data : Buffer.isBuffer(event.data) ? event.data.toString("utf8") : ""; if (rawText === "") return;
      const packet = JSON.parse(rawText) as Record<string, unknown>, opcode = packet["op"];
      if (typeof packet["s"] === "number") sequence = packet["s"];
      if (opcode === 10) {
        const interval = Number(record(packet["d"])["heartbeat_interval"]); if (heartbeat !== undefined) clearInterval(heartbeat);
        heartbeat = setInterval(() => socket?.send(JSON.stringify({ op: 1, d: sequence })), Number.isFinite(interval) ? interval : 45_000); heartbeat.unref?.();
        socket?.send(JSON.stringify({ op: 2, d: { token, intents: 0, properties: { os: process.platform, browser: "turntide-interactions", device: "turntide-interactions" } } })); return;
      }
      if (opcode === 1) socket?.send(JSON.stringify({ op: 1, d: sequence }));
      if (opcode === 7 || opcode === 9) socket?.close(1012, "Discord requested reconnect");
      if (opcode !== 0) return;
      if (packet["t"] === "READY") {
        const data = record(packet["d"]), user = record(data["user"]); botId = String(user["id"] ?? "") || null; applicationId = String(data["application"] === undefined ? "" : record(data["application"])["id"] ?? "") || null;
        if (botId === null || applicationId === null) { rejectReady(new Error("Discord READY omitted bot or application identity")); return; }
        clearTimeout(readyTimeout); acceptReady(); options.log?.(`[discord interactions] gateway READY for application ${applicationId}`); return;
      }
      if (packet["t"] !== "INTERACTION_CREATE") return;
      const raw = record(packet["d"]); if (raw["guild_id"] !== configuredGuildId) return;
      void postGatewayInteractionResponse(raw, source, { fetch: fetchImpl })
        .then(() => options.log?.(`[discord interactions] responded to ${String(record(raw["data"])["name"] ?? "interaction")}`))
        .catch((error: unknown) => options.log?.(`[discord interactions] response failed: ${error instanceof Error ? error.message : String(error)}`));
    });
    socket.addEventListener("close", (event) => {
      if (heartbeat !== undefined) clearInterval(heartbeat); heartbeat = undefined;
      if (!running) return;
      if ([4004, 4013, 4014].includes(event.code ?? 0)) { running = false; rejectReady(new Error(`Discord interaction gateway closed permanently with ${event.code ?? "unknown"}`)); return; }
      reconnect = setTimeout(connect, 5_000); reconnect.unref?.();
    });
    socket.addEventListener("error", () => options.log?.("[discord interactions] gateway socket error"));
  };
  connect(); await ready;
  return Object.freeze({ botId: botId!, applicationId: applicationId!, guildId: configuredGuildId, close: () => { running = false; if (heartbeat !== undefined) clearInterval(heartbeat); if (reconnect !== undefined) clearTimeout(reconnect); socket?.close(1000, "TTI interaction gateway shutdown"); } });
}
