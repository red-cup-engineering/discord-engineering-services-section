import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  installGracefulShutdown,
  jsonRepr,
  mergeApps,
  readJsonBody,
  readTextBody,
  start,

} from "@red-cup-engineering/http-server";
import { createJsnodeIckPackageBinWebApp } from "@emsenn/jsnode-ick/package-bin-web";
import {
  discordRestTransport,
  localMembershipService,
  readMembershipEntitlements,
  recordMembershipEntitlement,
  reconcileMembershipEntitlements,
  resolveMembershipProgramEnv,
  stripeWebhookToMembershipEntitlement,
  unresolvedMembershipEnvReferences,
  verifyStripeMembershipWebhook,

} from "@red-cup-engineering/organizing-with-discord";

import {
  communityName,
  paidMembership,
} from "./index.mjs";

const siteRoot = path.resolve(fileURLToPath(import.meta.url), "../..");
const repoRoot = path.resolve(siteRoot, "../..");
loadDotEnv(path.join(siteRoot, ".env"));
loadDotEnv(path.join(repoRoot, ".envrc"));

const port = Number(process.env["PORT"] ?? 18847);
const host = process.env["HOST"] ?? "127.0.0.1";
const membershipEntitlementsFile = process.env["TTI_MEMBERSHIP_ENTITLEMENTS_FILE"]
  ?? path.join(siteRoot, "data", "membership", "entitlements.json");
const defaultMembershipReconcileIntervalMs = 15 * 60 * 1000;

function env() {
  return process.env;
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

function membershipService() {
  return localMembershipService(paidMembership, {
    env: env(),
    ...(process.env["STRIPE_SECRET_KEY"] === undefined ? {} : { stripeSecretKey: process.env["STRIPE_SECRET_KEY"] }),
  });
}

function liveDiscordTransport(sourceEnv = env()) {
  if (sourceEnv["DISCORD_BOT_TOKEN"] === undefined && sourceEnv["DISCORD_TOKEN"] === undefined) return null;
  try {
    return discordRestTransport({ env: sourceEnv });
  } catch {
    return null;
  }
}

function membershipReconcileIntervalMs(sourceEnv = env()) {
  const raw = sourceEnv["TTI_MEMBERSHIP_RECONCILE_INTERVAL_MS"];
  if (raw === undefined || raw.length === 0) return defaultMembershipReconcileIntervalMs;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : defaultMembershipReconcileIntervalMs;
}

export async function reconcileStoredMemberships(
  options = {},
) {
  const sourceEnv = options.env ?? env();
  const program = resolveMembershipProgramEnv(paidMembership, sourceEnv);
  const entitlements = await readMembershipEntitlements(options.entitlementsFile ?? membershipEntitlementsFile);
  const transport = options.transport === undefined ? liveDiscordTransport(sourceEnv) : options.transport;
  const result = await reconcileMembershipEntitlements(transport, program, entitlements);
  const applied = result.fulfillment.filter((entry) => entry.applied).length;
  options.log?.(
    `membership reconciliation: entitlements=${result.entitlements.length} changes=${result.changes.length} applied=${applied}`,
  );
  return result;
}

export function startPeriodicMembershipReconciliation(
  options = {},
) {
  const intervalMs = options.intervalMs ?? membershipReconcileIntervalMs(options.env);
  if (intervalMs === 0) return null;
  const run = () => {
    void reconcileStoredMemberships(options).catch((error) => {
      options.log?.(`membership reconciliation failed: ${(error).message}`);
    });
  };
  run();
  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  return {
    intervalMs,
    stop() {
      clearInterval(timer);
    },
  };
}

function membershipHttpApp() {
  return {
    resources: [
      {
        id: "turntide-islands.membership.checkout",
        match: "/membership/checkout",
        route: "/membership/checkout",
        methods: ["POST"],
        produces: ["application/json"],
        handler: membershipCheckout,
      },
      {
        id: "turntide-islands.membership.stripe-webhook",
        match: "/membership/stripe/webhook",
        route: "/membership/stripe/webhook",
        methods: ["POST"],
        produces: ["application/json"],
        handler: stripeMembershipWebhook,
      },
    ],
  };
}

async function membershipCheckout(ctx) {
  try {
    const input = await readJsonBody(ctx.req, { maxBytes: 64 * 1024, empty: {} });
    if (typeof input.userId !== "string" || typeof input.planId !== "string") {
      return jsonRepr({ error: "userId and planId are required strings" }, { status: 400, pretty: true });
    }
    const checkout = await membershipService().createCheckout({
      userId: input.userId,
      planId: input.planId,
      ...(typeof input.provider === "string" ? { provider: input.provider } : {}),
    });
    return jsonRepr(checkout, { pretty: true });
  } catch (error) {
    return jsonRepr({ error: (error).message }, { status: 400, pretty: true });
  }
}

async function stripeMembershipWebhook(ctx) {
  const payload = await readTextBody(ctx.req, { maxBytes: 1024 * 1024 });
  const signature = ctx.req.headers["stripe-signature"];
  const webhookSecret = process.env["STRIPE_WEBHOOK_SECRET"];
  if (typeof signature !== "string" || !verifyStripeMembershipWebhook(payload, signature, webhookSecret)) {
    return jsonRepr({ error: "invalid Stripe signature" }, { status: 400, pretty: true });
  }
  try {
    const program = resolveMembershipProgramEnv(paidMembership, env());
    const entitlement = stripeWebhookToMembershipEntitlement(program, payload);
    if (entitlement === null) {
      return jsonRepr({ ok: true, ignored: true }, { pretty: true });
    }
    const entitlements = await recordMembershipEntitlement(membershipEntitlementsFile, entitlement);
    const reconciliation = await reconcileMembershipEntitlements(liveDiscordTransport(), program, entitlements);
    return jsonRepr({
      ok: true,
      entitlement,
      entitlementCount: reconciliation.entitlements.length,
      fulfillment: reconciliation.fulfillment,
    }, { pretty: true });
  } catch (error) {
    return jsonRepr({ error: (error).message }, { status: 500, pretty: true });
  }
}

function turntideIckOperationSurface(packageDir) {
  return createJsnodeIckPackageBinWebApp({
    packageDir,
    basePath: "/scripts",
    webPath: "/",
    title: `${communityName} operation surface`,
    description: "Turntide Islands package binaries projected through JSNode ICK's package-bin carrier HTML, OpenAPI, and MCP surfaces.",
    mcp: {
      path: "/mcp",
      serverInfo: { name: "turntide-islands", version: "0.0.1" },
      instructions: "Use the Turntide Islands package-bin surface for site, membership, orchestration, and vault carrier readings. Invoke mutating Discord stewardship through the explicit steward package binaries only when the operator asks for actuation.",
    },
  });
}

export function createTurntideApp(packageDir = siteRoot) {
  return mergeApps(
    turntideIckOperationSurface(packageDir),
    membershipHttpApp(),
  );
}

export async function serveTurntide(options

 = {}) {
  const resolvedHost = options.host ?? host;
  const resolvedPort = options.port ?? port;
  const periodic = startPeriodicMembershipReconciliation({
    log: (message) => options.log?.(`[turntide-islands] ${message}`),
  });
  const running = await start(createTurntideApp(), { port: resolvedPort, host: resolvedHost });
  installGracefulShutdown(running, {
    onClosed: () => {
      periodic?.stop();
      options.log?.("[turntide-islands] stopped");
    },
    onError: (error) => options.log?.(`[turntide-islands] shutdown failed: ${error instanceof Error ? error.message : String(error)}`),
  });
  options.log?.(`[turntide-islands] http://${resolvedHost}:${running.port}`);
  return { ...running, host: resolvedHost, periodic };
}

function isMain() {
  return process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isMain()) {
  serveTurntide({ log: (message) => process.stderr.write(`${message}\n`) }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
