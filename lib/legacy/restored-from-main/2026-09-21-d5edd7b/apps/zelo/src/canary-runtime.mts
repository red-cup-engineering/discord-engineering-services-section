import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { DiscordRestTransport } from "@red-cup-engineering/discord-rest-transport-service";
import { acquireZeloProcessLease, type ZeloLease } from "./lease.mjs";
import { deliverProgrammableResponse, parseZeloProgrammableResponseDeliveryConfig, type ResponseRateState, type ZeloProgrammableResponseDeliveryConfig } from "./programmable-response-delivery.mjs";
import { normalizeDiscordCommunityResponseDispatch } from "./gateway-community-responses.mjs";

const snowflake = (value: unknown, label: string): string => {
  if (typeof value !== "string" || !/^[0-9]{17,20}$/u.test(value)) throw new TypeError(`${label} must be a Discord snowflake`);
  return value;
};
const record = (value: unknown, label: string): Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value) || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) throw new TypeError(`${label} must be an object`);
  return value as Record<string, unknown>;
};
const exactKeys = (value: Record<string, unknown>, expected: readonly string[]): boolean => {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && actual.every((item, index) => item === expected[index]);
};
const canonical = (value: unknown): string => value === null || typeof value !== "object" ? JSON.stringify(value) : Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : `{${Object.keys(value as Record<string, unknown>).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;

/** The canary is deliberately an ingress consumer, not a Discord gateway client. */
export interface ZeloCanaryEnvironment {
  readonly ZELO_CANARY_MODE?: string;
  readonly ZELO_CANARY_CONFIG_FILE?: string;
  readonly ZELO_CANARY_RECEIPT_FILE?: string;
  readonly ZELO_CANARY_LEASE_FILE?: string;
  readonly ZELO_CANARY_INGRESS_SECRET_FILE?: string;
  readonly ZELO_DISCORD_BOT_TOKEN_FILE?: string;
  readonly ZELO_CANARY_LISTEN_HOST?: string;
  readonly ZELO_CANARY_LISTEN_PORT?: string;
}
export interface ZeloCanaryConfig {
  readonly type: "ZeloCanaryConfig";
  readonly version: 1;
  readonly mode: "disabled" | "active";
  readonly delivery: ZeloProgrammableResponseDeliveryConfig;
  readonly listenHost: string;
  readonly listenPort: number;
  readonly receiptFile: string;
  readonly leaseFile: string;
  readonly ingressSecretFile: string;
  readonly discordBotTokenFile: string;
}
export interface ZeloCanaryRuntime { readonly server: Server; close(): Promise<void>; readiness(): Readonly<{ readonly ready: boolean; readonly reason: string }>; }

export function parseZeloCanaryConfig(environment: ZeloCanaryEnvironment, deliveryInput: unknown): ZeloCanaryConfig {
  const mode = environment.ZELO_CANARY_MODE ?? "disabled";
  if (mode !== "disabled" && mode !== "active") throw new TypeError("ZELO_CANARY_MODE must be disabled or active");
  const file = (name: keyof ZeloCanaryEnvironment): string => {
    const value = environment[name];
    if (typeof value !== "string" || !value.startsWith("/") || value.includes("\u0000")) throw new TypeError(`${name} must be an absolute path`);
    return value;
  };
  const host = environment.ZELO_CANARY_LISTEN_HOST ?? "127.0.0.1";
  if (host !== "127.0.0.1" && host !== "::1") throw new TypeError("ZELO_CANARY_LISTEN_HOST must be loopback");
  const rawPort = environment.ZELO_CANARY_LISTEN_PORT ?? "18186";
  if (!/^[0-9]{1,5}$/u.test(rawPort) || Number(rawPort) < 1024 || Number(rawPort) > 65535) throw new TypeError("ZELO_CANARY_LISTEN_PORT must be an unprivileged TCP port");
  const delivery = parseZeloProgrammableResponseDeliveryConfig(deliveryInput);
  if (mode === "active" && delivery.mode !== "programmable-response-delivery") throw new TypeError("active canary requires programmable-response-delivery configuration");
  if (mode === "disabled" && delivery.mode !== "disabled") throw new TypeError("disabled canary requires disabled delivery configuration");
  return Object.freeze({ type: "ZeloCanaryConfig", version: 1, mode, delivery, listenHost: host, listenPort: Number(rawPort), receiptFile: file("ZELO_CANARY_RECEIPT_FILE"), leaseFile: file("ZELO_CANARY_LEASE_FILE"), ingressSecretFile: file("ZELO_CANARY_INGRESS_SECRET_FILE"), discordBotTokenFile: file("ZELO_DISCORD_BOT_TOKEN_FILE") });
}

export async function loadZeloCanaryConfig(environment: ZeloCanaryEnvironment = process.env): Promise<ZeloCanaryConfig> {
  const source = environment.ZELO_CANARY_CONFIG_FILE;
  if (typeof source !== "string" || !source.startsWith("/")) throw new TypeError("ZELO_CANARY_CONFIG_FILE must be an absolute path");
  return parseZeloCanaryConfig(environment, JSON.parse(await readFile(source, "utf8")) as unknown);
}

function parseIngress(value: unknown): { readonly dispatch: unknown; readonly guildId: string; readonly rateState: ResponseRateState } {
  const body = record(value, "ingress payload");
  if (!exactKeys(body, ["dispatch", "guildId", "rateState"])) throw new TypeError("ingress payload schema invalid");
  const rate = record(body.rateState, "rate state");
  if (!exactKeys(rate, ["commandId", "observedAt", "responseCount", "scopeId", "sourceRevision", "window"]) || typeof rate.observedAt !== "string" || typeof rate.sourceRevision !== "string" || typeof rate.commandId !== "string" || typeof rate.scopeId !== "string" || typeof rate.window !== "string" || !Number.isSafeInteger(rate.responseCount) || (rate.responseCount as number) < 0) throw new TypeError("rate state schema invalid");
  return Object.freeze({ dispatch: body.dispatch, guildId: snowflake(body.guildId, "ingress guildId"), rateState: Object.freeze(rate as unknown as ResponseRateState) });
}

async function body(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const part of request) { const chunk = Buffer.isBuffer(part) ? part : Buffer.from(part); length += chunk.length; if (length > 32_768) throw new TypeError("request body too large"); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
const respond = (response: ServerResponse, status: number, payload: Record<string, unknown>): void => { response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }); response.end(`${JSON.stringify(payload)}\n`); };
const signature = (secret: Buffer, payload: Buffer): string => createHmac("sha256", secret).update(payload).digest("hex");
const validSignature = (provided: string | undefined, expected: string): boolean => {
  if (typeof provided !== "string" || !/^[a-f0-9]{64}$/u.test(provided)) return false;
  return timingSafeEqual(Buffer.from(provided, "ascii"), Buffer.from(expected, "ascii"));
};

/** Starts only a localhost ingress and the Discord send transport. It opens no gateway and exposes no role, reaction, moderation, member, or delete route. */
export async function startZeloCanary(config: ZeloCanaryConfig, options: { readonly now?: () => Date } = {}): Promise<ZeloCanaryRuntime> {
  const [secret, token] = await Promise.all([readFile(config.ingressSecretFile), readFile(config.discordBotTokenFile, "utf8")]);
  if (secret.length < 32) throw new TypeError("ZELO_CANARY_INGRESS_SECRET_FILE must contain at least 32 bytes");
  if (!token.trim() || /[\r\n]/u.test(token)) throw new TypeError("ZELO_DISCORD_BOT_TOKEN_FILE must contain one token");
  const lease = await acquireZeloProcessLease(config.leaseFile, `zelo-canary:${process.pid}`);
  const rest = new DiscordRestTransport({ token: token.trim() });
  let closing = false;
  let started = false;
  // The shared REST transport already covers the wire call (auth header, JSON body, 429
  // retry-backoff); this adapts it to the narrow send-only shape deliverProgrammableResponse
  // expects, carrying the idempotency key as an extra header rather than as a body field.
  const transport = Object.freeze({ authenticated: true as const, async send(input: { readonly channelId: string; readonly content: string; readonly idempotencyKey: string; readonly allowed_mentions: { readonly parse: readonly [] } }): Promise<{ readonly messageId: string }> {
    const message = await rest.createMessage(input.channelId, { content: input.content, allowedMentions: { users: [] } }, { headers: { "x-zelo-idempotency-key": input.idempotencyKey } });
    return Object.freeze({ messageId: snowflake(message.id, "Discord response id") });
  }, async delete(): Promise<void> { throw new Error("canary runtime never deletes Discord messages"); } });
  const server = createServer(async (request, response) => {
    try {
      if (request.method === "GET" && request.url === "/healthz") return respond(response, 200, { ok: true, mode: config.mode, gateway: false, mutationSurface: "send-public-response-only" });
      if (request.method === "GET" && request.url === "/readyz") return respond(response, config.mode === "active" && started && !closing && lease.active() ? 200 : 503, { ready: config.mode === "active" && started && !closing && lease.active(), reason: config.mode === "active" ? (closing ? "shutting-down" : started ? "ready" : "starting") : "disabled" });
      if (request.method !== "POST" || request.url !== "/v1/ingress/community-response") return respond(response, 404, { error: "not-found" });
      if (closing || config.mode !== "active" || !lease.active()) return respond(response, 503, { error: "not-ready" });
      const payload = await body(request), expected = signature(secret, payload);
      if (!validSignature(request.headers["x-zelo-ingress-signature"] as string | undefined, expected)) return respond(response, 401, { error: "unauthorized" });
      const ingress = parseIngress(JSON.parse(payload.toString("utf8")) as unknown), event = normalizeDiscordCommunityResponseDispatch(ingress.dispatch);
      if (!event) return respond(response, 202, { accepted: false, reason: "unsupported-dispatch" });
      const receipt = await deliverProgrammableResponse({ config: config.delivery, lease, event, eventGuildId: ingress.guildId, rateState: ingress.rateState, variables: {}, receiptFile: config.receiptFile, transport, recheck: async () => ingress.rateState, now: (options.now ?? (() => new Date()))() });
      return respond(response, 202, { accepted: receipt !== undefined, status: receipt?.status ?? "not-proposed", receiptId: receipt?.id });
    } catch { return respond(response, 400, { error: "invalid-request" }); }
  });
  try { await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(config.listenPort, config.listenHost, () => { server.off("error", reject); resolve(); }); }); started = true; } catch (error) { await lease.release().catch(() => undefined); throw error; }
  return Object.freeze({ server, readiness: () => Object.freeze({ ready: config.mode === "active" && started && !closing && lease.active(), reason: closing ? "shutting-down" : config.mode === "active" ? "ready" : "disabled" }), async close() { if (closing) return; closing = true; await new Promise<void>(resolve => server.close(() => resolve())); await lease.release(); } });
}
