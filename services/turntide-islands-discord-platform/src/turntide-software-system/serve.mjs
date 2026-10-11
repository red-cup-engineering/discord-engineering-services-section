#!/usr/bin/env node
import { createServer } from "node:http";
import { createHmac } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { membershipProgram, turntideCarrier, vaultRigs, renderOrchestrationSystem } from "./index.mjs";
import { buildTurntideSite, siteSummary, turntideStructuredData } from "./site.mjs";
import { env, loadRuntimeEnv, packageRoot } from "./env.mjs";
import { latestEntitlements, membershipConfig, planHasCapability, readMembershipEntitlements, reconcileMembershipEntitlements } from "./membership.mjs";
import { DiscordRestTransport, postInteractionFollowup } from "./discord.mjs";
import { perceive } from "./causal-perception.mjs";
import { surfaceCausalSignal } from "./zelo-voice.mjs";
import {
  admitVaultProviderReceipt,
  CHECKOUT_BINDING_CATEGORY,
  ENTITLEMENT_DECISION_CATEGORY,
  providerReceiptAuthorized,
  readVaultEntitlementDecisions,
  recordVaultEntitlementDecision,
  vaultPaymentReadiness,
  vaultSettlementWitness,

} from "./vault-payment.mjs";
import { issueVaultCheckoutInvitation, vaultCheckoutHttpResponse, vaultCheckoutInvitationConfig, vaultCheckoutInvitationMessage } from "./vault-checkout.mjs";
import { climateWireStoreDir, readClimateSignals } from "./climate-signals.mjs";
import { draftFromSignal, latestDraftsById, nextUndraftedSignal, readSignalDrafts, recordSignalDraft, signalDraftsFile } from "./signal-drafts.mjs";
import {
  deferredResponse,
  interactionFromWire,
  interactionResponseToWire,
  interactionStringOption,
  messageResponse,
  pingResponse,
  verifyDiscordInteractionSignature,
} from "./discord-interactions.mjs";

import { inferAnswer } from "./steward.mjs";
import { runZeloTick } from "./zelo-tick.mjs";
import { runDailyDivinationReport } from "./daily-divination-report.mjs";
import { startKnowledgeBrokerGateway } from "./knowledge-broker-gateway.mjs";
import { knowledgeIntakeConfig } from "./knowledge-broker.mjs";
import { knowledgeIntakeHttpResponse } from "./knowledge-intake.mjs";
import { providerOfferAuthorized, vaultProviderOfferHttpResponse } from "./vault-provider-offer.mjs";
import {
  localityPilotAcknowledgement,
  localityPilotConfiguration,
  localityPilotRecorderFromSettlementWitness,
  localityPilotSettlementWitness,
  prepareDiscordLocalityQueryPilot,

} from "./locality-query-pilot.mjs";
import {
  prepareDiscordUnionMediaIntent,
  verifyDiscordUnionMediaDestinationControl,
  unionMediaDestinationProofAcknowledgement,
  unionMediaDestinationProofRecorderFromSettlementWitness,
  unionMediaIntentAcknowledgement,
  unionMediaIntentConfiguration,
  unionMediaIntentRecorderFromSettlementWitness,
  unionMediaIntentSettlementWitness,

} from "./union-media-intent.mjs";
import {
  authenticateDiscordUnionMediaEnterprise,
  enterpriseDelegationInstructions,
  unionMediaEnterpriseAuthenticationAcknowledgement,
  unionMediaEnterpriseAuthenticationRecorderFromSettlementWitness,

} from "./union-media-enterprise-authentication.mjs";
import { UNION_MEDIA_DISCORD_UNAVAILABLE, unionMediaDiscordCommandAuthorized } from "./union-media-discord-boundary.mjs";
import { communityEvents, communityHelp, communityRoles, communityRules, joinCommunityInstructions, prepareCommunityReport } from "./community-commands.mjs";
import { performSelfServiceRoleAction, selfServiceRoleConfiguration, selfServiceRoleResponse } from "./self-service-roles.mjs";

export async function serveTurntide(options = {}) {
  const source = options.env ?? process.env;
  const host = options.host ?? env("HOST", source) ?? "127.0.0.1";
  const port = options.port ?? Number(env("PORT", source) ?? 18847);
  const server = createServer((req, res) => {
    void route(req, res, source).catch((error) => json(res, 500, { error: error instanceof Error ? error.message : String(error) }));
  });
  await new Promise((resolve) => server.listen(port, host, resolve));
  const address = server.address();
  const actualPort = typeof address === "object" && address !== null ? address.port : port;
  options.log?.(`[turntide-islands] http://${host}:${actualPort}`);

  let knowledgeBroker;
  try {
    knowledgeBroker = env("TTI_KNOWLEDGE_BROKER_ENABLED", source) === "true"
      ? await startKnowledgeBrokerGateway(source, { log: options.log })
      : undefined;
  } catch (error) {
    await new Promise((resolve) => server.close(() => resolve()));
    throw error;
  }

  const tickIntervalMs = Number(env("TTI_TICK_INTERVAL_MS", source) ?? 900000);
  let tickTimer;
  if (tickIntervalMs > 0) {
    const runTick = () => {
      void runZeloTick(source)
        .then((result) => options.log?.(`[zelo tick] ${result.action.kind}`))
        .catch((error) => options.log?.(`[zelo tick] failed: ${error instanceof Error ? error.message : String(error)}`));
    };
    tickTimer = setInterval(runTick, tickIntervalMs);
    tickTimer.unref?.();
    runTick();
  }

  // A separate, independent, much lower-frequency check from the zelo tick
  // above — sky-desk's daily-report-publication duty. runDailyDivinationReport
  // is itself idempotent per UTC day (see daily-divination-report.mts's own
  // state marker), so an hourly check-and-post-if-not-yet-today is simpler
  // and just as correct as computing an exact midnight fire time, and safe
  // to run on this same small box: unlike the causal-set read zelo-tick.mts
  // cut for OOM risk, this is date math plus two bounded subprocess calls,
  // one PNG render, and one post.
  const divinationCheckIntervalMs = Number(env("TTI_DAILY_DIVINATION_CHECK_INTERVAL_MS", source) ?? 3600000);
  let divinationTimer;
  if (divinationCheckIntervalMs > 0) {
    const runDivinationCheck = () => {
      void runDailyDivinationReport(source)
        .then((result) => options.log?.(`[daily divination report] ${result.outcome}${result.reason !== undefined ? `: ${result.reason}` : ""}`))
        .catch((error) => options.log?.(`[daily divination report] failed: ${error instanceof Error ? error.message : String(error)}`));
    };
    divinationTimer = setInterval(runDivinationCheck, divinationCheckIntervalMs);
    divinationTimer.unref?.();
    runDivinationCheck();
  }

  return {
    server,
    host,
    port: actualPort,
    close: () => new Promise((resolve, reject) => {
      if (tickTimer !== undefined) clearInterval(tickTimer);
      if (divinationTimer !== undefined) clearInterval(divinationTimer);
      knowledgeBroker?.close();
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}

export async function route(req, res, source) {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname === "/knowledge/contribute") return handleKnowledgeIntakeRequest(req, res, url, source);
  if (req.method === "GET" && url.pathname === "/summary.json") return json(res, 200, siteSummary());
  if (req.method === "GET" && url.pathname === "/orchestration.txt") return text(res, 200, renderOrchestrationSystem(), "text/plain; charset=utf-8");
  if (req.method === "GET" && url.pathname === "/orchestration.json") return json(res, 200, turntideCarrier().orchestration);
  if (req.method === "GET" && url.pathname === "/membership.json") {
    const config = configOrNull(source);
    return json(res, 200, {
      program: turntideCarrier().membership,
      entitlements: config === null ? [] : await readMembershipEntitlements(config.entitlementsFile),
      configured: config !== null,
    });
  }
  if (url.pathname === "/membership/checkout") return handleVaultCheckoutRequest(req, res, url, source);
  if (req.method === "GET" && url.pathname === "/membership/checkout/success") return text(res, 200, "Checkout returned to TTI. This page is not payment or entitlement evidence; access appears only after an admitted provider receipt and TTI entitlement decision.\n", "text/plain; charset=utf-8");
  if (req.method === "GET" && url.pathname === "/membership/checkout/cancel") return text(res, 200, "Checkout was cancelled. TTI records no payment, entitlement, revenue, or profit from this return.\n", "text/plain; charset=utf-8");
  if (req.method === "POST" && url.pathname === "/membership/stripe/webhook") return json(res, 410, {
    type: "TTIVaultPaymentRefusal",
    reason: "raw-stripe-webhooks-belong-to-sovereign-payment-provider",
    replacement: "/membership/payment-provider/receipt",
  });
  if (req.method === "POST" && url.pathname === "/membership/payment-provider/receipt") return handlePaymentProviderReceipt(req, res, source);
  if (req.method === "POST" && url.pathname === "/membership/payment-provider/offer") return handlePaymentProviderOffer(req, res, source);
  if (req.method === "POST" && url.pathname === "/discord/interactions") return handleDiscordInteractionRequest(req, res, source);
  const files = buildTurntideSite();
  const filePath = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/+/u, "");
  const staticFile = files.get(filePath) ?? files.get(`${filePath.replace(/\/$/u, "")}/index.html`);
  if (staticFile !== undefined) return text(res, 200, staticFile, contentType(filePath));
  if (req.method === "GET" && url.pathname === "/index.jsonld") return json(res, 200, turntideStructuredData().graph);
  return json(res, 404, { error: "not found" });
}

async function handleKnowledgeIntakeRequest(req, res, url, source) {
  let config;
  try {
    config = knowledgeIntakeConfig(source);
  } catch {
    return json(res, 503, { error: "knowledge contribution intake is unavailable" });
  }
  if (config === null) return json(res, 404, { error: "not found" });
  const method = req.method ?? "GET";
  const boundedBody = method === "POST" ? await readBoundedRawBody(req, 64 * 1024) : "";
  try {
    const response = await knowledgeIntakeHttpResponse({
      method,
      url,
      contentType: typeof req.headers["content-type"] === "string" ? req.headers["content-type"] : undefined,
      body: boundedBody ?? "x".repeat(64 * 1024 + 1),
      config,
    });
    return sendKnowledgeIntakeResponse(res, response);
  } catch {
    return json(res, 503, { error: "knowledge contribution intake is unavailable" });
  }
}

async function handleVaultCheckoutRequest(req, res, url, source) {
  let config;
  try { config = vaultCheckoutInvitationConfig(source); }
  catch { return json(res, 503, { type: "TTIVaultPaymentRefusal", reason: "vault-checkout-configuration-invalid", paymentCreated: false, revenueRecognized: false }); }
  if (config === null) return json(res, 503, { type: "TTIVaultPaymentRefusal", reason: "vault-checkout-invitation-service-unavailable", paymentCreated: false, revenueRecognized: false });
  const method = req.method ?? "GET";
  const boundedBody = method === "POST" ? await readBoundedRawBody(req, 32 * 1024) : "";
  if (boundedBody === null) return json(res, 413, { type: "TTIVaultPaymentRefusal", reason: "vault-checkout-request-too-large", paymentCreated: false, revenueRecognized: false });
  const response = await vaultCheckoutHttpResponse({ method, url, contentType: typeof req.headers["content-type"] === "string" ? req.headers["content-type"] : undefined, body: boundedBody, config });
  return sendVaultCheckoutResponse(res, response);
}

function sendVaultCheckoutResponse(res, response) {
  res.writeHead(response.status, response.headers);
  res.end(response.body);
}

function sendKnowledgeIntakeResponse(res, response) {
  res.writeHead(response.status, response.headers);
  res.end(response.body);
}

function configOrNull(source) {
  try {
    return membershipConfig(source);
  } catch {
    return null;
  }
}

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function readBoundedRawBody(req, maximumBytes) {
  const chunks = [];
  let received = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    received += buffer.length;
    if (received > maximumBytes) {
      req.resume();
      return null;
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readJson(req) {
  const raw = await readRawBody(req);
  return raw.length === 0 ? {} : JSON.parse(raw);
}

async function handlePaymentProviderReceipt(req, res, source) {
  const readiness = await vaultPaymentReadiness(source);
  if (!readiness.liveReady) return json(res, 503, { type: "TTIVaultPaymentRefusal", reason: "vault-payment-circuit-not-live", readiness });
  if (!providerReceiptAuthorized(typeof req.headers.authorization === "string" ? req.headers.authorization : undefined, source)) {
    return json(res, 401, { type: "TTIVaultPaymentRefusal", reason: "payment-provider-not-authenticated" });
  }
  const rawBody = await readBoundedRawBody(req, 64 * 1024);
  if (rawBody === null) return json(res, 413, { type: "TTIVaultPaymentRefusal", reason: "provider-receipt-too-large" });
  let activity;
  try { activity = JSON.parse(rawBody); }
  catch { return json(res, 400, { type: "TTIVaultPaymentRefusal", reason: "provider-receipt-invalid-json" }); }
  const receipt = activity["object"] !== null && typeof activity["object"] === "object" && !Array.isArray(activity["object"])
    ? activity["object"]
    : {};
  const requestDigest = typeof receipt["requestDigest"] === "string" ? receipt["requestDigest"] : undefined;
  if (requestDigest === undefined) return json(res, 400, { type: "TTIVaultPaymentRefusal", reason: "provider-receipt-request-digest-absent" });

  const store = vaultSettlementWitness(source);
  const bindings = (await store.records(CHECKOUT_BINDING_CATEGORY));
  const binding = bindings.find((candidate) => candidate.requestDigest === requestDigest && candidate.simulation === false);
  if (binding === undefined) return json(res, 409, { type: "TTIVaultPaymentRefusal", reason: "checkout-binding-not-witnessed" });
  const priorDecisions = (await store.records(ENTITLEMENT_DECISION_CATEGORY));
  const decision = admitVaultProviderReceipt({ activity, binding, priorDecisions });
  if (decision.type === "TTIVaultPaymentRefusal") return json(res, decision.reason === "provider-event-duplicate" ? 200 : 409, decision);

  await recordVaultEntitlementDecision(store, decision);
  const config = membershipConfig(source);
  try {
    await reconcileMembershipEntitlements(new DiscordRestTransport({ env: source }), config, [...priorDecisions, decision]);
  } catch (error) {
    process.stderr.write(`membership/payment-provider/receipt: entitlement witnessed but role reconcile failed: ${error instanceof Error ? error.message : String(error)}\n`);
  }
  return json(res, 202, {
    type: "TTIVaultEntitlementAdmissionReceipt",
    entitlementDecisionId: decision.id,
    status: decision.status,
    planId: decision.planId,
    revenueRecognized: false,
    profitRecognized: false,
  });
}

async function handlePaymentProviderOffer(req, res, source) {
  const authorization = typeof req.headers.authorization === "string" ? req.headers.authorization : undefined;
  if (!providerOfferAuthorized(authorization, source)) return json(res, 401, { type: "TTIVaultProviderOfferRefusal", reason: "payment-provider-offer-not-authenticated", paymentObserved: false, revenueRecognized: false, profitRecognized: false });
  const rawBody = await readBoundedRawBody(req, 64 * 1024);
  if (rawBody === null) return json(res, 413, { type: "TTIVaultProviderOfferRefusal", reason: "provider-offer-too-large", paymentObserved: false, revenueRecognized: false, profitRecognized: false });
  let store;
  try { store = vaultSettlementWitness(source); }
  catch { return json(res, 503, { type: "TTIVaultProviderOfferRefusal", reason: "provider-offer-witness-service-unavailable", paymentObserved: false, revenueRecognized: false, profitRecognized: false }); }
  const response = await vaultProviderOfferHttpResponse({ authorization, contentType: typeof req.headers["content-type"] === "string" ? req.headers["content-type"] : undefined, body: rawBody, source, store });
  return json(res, response.status, response.body);
}

async function handleDiscordInteractionRequest(req, res, source) {
  const publicKey = env("DISCORD_PUBLIC_KEY", source);
  const signature = req.headers["x-signature-ed25519"];
  const timestamp = req.headers["x-signature-timestamp"];
  const rawBody = await readRawBody(req);
  if (
    publicKey === undefined ||
    typeof signature !== "string" ||
    typeof timestamp !== "string" ||
    !verifyDiscordInteractionSignature({ rawBody, signature, timestamp, publicKey })
  ) {
    res.writeHead(401);
    res.end();
    return;
  }
  const raw = JSON.parse(rawBody);
  const interaction = interactionFromWire(raw);
  const response = await respondToInteraction(interaction, raw, source);
  return json(res, 200, interactionResponseToWire(response));
}

export async function respondToInteraction(
  interaction,
  raw,
  source,
  options = {},
) {
  if (interaction.type === "ping") return pingResponse();
  if (interaction.type !== "application-command") return messageResponse("Turntide Islands steward did not recognize this interaction.", { ephemeral: true });
  if (interaction.commandName === "join") return messageResponse(joinCommunityInstructions(), { ephemeral: true });
  if (interaction.commandName === "help") return messageResponse(communityHelp(), { ephemeral: true });
  if (interaction.commandName === "rules") return messageResponse(communityRules(), { ephemeral: true });
  if (interaction.commandName === "roles") return selfServiceRolesResponse(interaction, raw, source, options);
  if (interaction.commandName === "events") return messageResponse(communityEvents(), { ephemeral: true });
  if (interaction.commandName === "report") {
    void handoffCommunityReport(interaction, raw, source)
      .catch((error) => process.stderr.write(`community report handoff failed: ${error instanceof Error ? error.message : String(error)}\n`));
    return deferredResponse({ ephemeral: true });
  }
  if (interaction.commandName === "vault") return vaultResponse(interaction, source);
  if (interaction.commandName === "l-space-login") return lSpaceLoginResponse(interaction, raw, source, options);
  if (interaction.commandName === "locality-pilot") return localityPilotResponse(interaction, raw, source);
  if (["union-media-intent", "union-media-verify", "union-media-authenticate"].includes(interaction.commandName ?? "")) {
    if (!unionMediaDiscordCommandAuthorized(interaction, source)) return messageResponse(UNION_MEDIA_DISCORD_UNAVAILABLE, { ephemeral: true });
    if (interaction.commandName === "union-media-intent") return unionMediaIntentResponse(interaction, raw, source);
    if (interaction.commandName === "union-media-verify") return unionMediaVerifyResponse(interaction, raw, source);
    return unionMediaAuthenticateResponse(interaction, raw, source);
  }
  if (interaction.commandName === "ask") {
    const question = interactionStringOption(raw, "question") ?? "";
    void inferAnswer(question, source)
      .then((answer) => postInteractionFollowup(interaction.applicationId, interaction.token, answer))
      .catch((error) => process.stderr.write(`discord interaction followup failed: ${error instanceof Error ? error.message : String(error)}\n`));
    return deferredResponse();
  }
  if (interaction.commandName === "spacetime") {
    void reportSpacetime(interaction, source)
      .catch((error) => process.stderr.write(`spacetime followup failed: ${error instanceof Error ? error.message : String(error)}\n`));
    return deferredResponse();
  }
  if (interaction.commandName === "preview-signal" || interaction.commandName === "approve-draft") {
    if (!isAdmin(interaction, source)) return messageResponse("Admin only.", { ephemeral: true });
    if (interaction.commandName === "preview-signal") {
      void previewSignal(interaction, source)
        .catch((error) => process.stderr.write(`preview-signal followup failed: ${error instanceof Error ? error.message : String(error)}\n`));
    } else {
      const draftId = interactionStringOption(raw, "draft_id") ?? "";
      void approveDraft(interaction, source, draftId)
        .catch((error) => process.stderr.write(`approve-draft followup failed: ${error instanceof Error ? error.message : String(error)}\n`));
    }
    return deferredResponse({ ephemeral: true });
  }
  return messageResponse(`Turntide Islands steward does not yet handle /${interaction.commandName ?? "?"}.`, { ephemeral: true });
}

async function selfServiceRolesResponse(
  interaction,
  raw,
  source,
  options,
) {
  let configuration;
  try { configuration = selfServiceRoleConfiguration(source); }
  catch { return messageResponse("Self-service role preferences are temporarily unavailable because their configuration is invalid. No role was changed.", { ephemeral: true }); }
  const transport = options.discordTransport ?? new DiscordRestTransport({ env: source });
  try {
    const result = await performSelfServiceRoleAction(transport, {
      guildId: interaction.guildId,
      userId: interaction.userId,
      action: interactionStringOption(raw, "action"),
      roleKey: interactionStringOption(raw, "role"),
    }, configuration);
    return messageResponse(result.kind === "listed" && result.roles.length === 0 ? communityRoles() : selfServiceRoleResponse(result), { ephemeral: true });
  } catch {
    return messageResponse("Self-service role preferences are temporarily unavailable. No role was changed.", { ephemeral: true });
  }
}

const L_SPACE_GATEWAY_COMMAND_URL = "https://l-space.561.group/api/v1/discord/gateway-command";

async function lSpaceLoginResponse(
  interaction,
  raw,
  source,
  options,
) {
  const challenge = interactionStringOption(raw, "code");
  const member = raw["member"];
  const pending = member !== null && typeof member === "object" && !Array.isArray(member) && (member)["pending"] === true;
  const memberRoles = member !== null && typeof member === "object" && !Array.isArray(member) ? (member)["roles"] : undefined;
  const roles = Array.isArray(memberRoles) ? memberRoles.filter((role) => typeof role === "string") : [];
  const token = env("DISCORD_BOT_TOKEN", source);
  if (challenge === undefined || interaction.guildId === undefined || interaction.userId === undefined || token === undefined) {
    return messageResponse("L-Space login is temporarily unavailable.", { ephemeral: true });
  }
  const body = JSON.stringify({ challenge, guildId: interaction.guildId, userId: interaction.userId, pending, roles });
  const timestamp = String(Math.floor((options.now ?? Date.now)() / 1000));
  const signature = createHmac("sha256", token).update(`${timestamp}.${body}`, "utf8").digest("hex");
  try {
    const response = await (options.fetch ?? fetch)(L_SPACE_GATEWAY_COMMAND_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-l-space-gateway-timestamp": timestamp,
        "x-l-space-gateway-signature": signature,
      },
      body,
    });
    if (response.ok) return messageResponse("Login confirmed. Return to L-Space in this browser.", { ephemeral: true });
  } catch { /* The command response remains a safe, non-diagnostic denial. */ }
  return messageResponse("That login code is expired, invalid, or unavailable.", { ephemeral: true });
}

function unionMediaAuthenticateResponse(interaction, raw, source) {
  let configuration, store, recorder;
  try { configuration = unionMediaIntentConfiguration(source); store = unionMediaIntentSettlementWitness(source); recorder = unionMediaEnterpriseAuthenticationRecorderFromSettlementWitness(store); }
  catch { return messageResponse("TTI's Union Media enterprise-authentication witness boundary is unavailable. Nothing was stored and no economic effect occurred.", { ephemeral: true }); }
  void authenticateDiscordUnionMediaEnterprise({ interactionId: interaction.id, guildId: interaction.guildId, userId: interaction.userId, destinationProofId: interactionStringOption(raw, "destination_proof"), transactionHash: interactionStringOption(raw, "transaction_hash"), logIndex: interactionStringOption(raw, "log_index"), authentication: interactionStringOption(raw, "authentication") }, { ...configuration, rpcUrl: env("TTI_EVM_RPC_URL", source), store })
    .then(async (prepared) => { if (prepared["type"] !== "TTIUnionMediaEnterpriseAuthenticationAdmission") { const reasons = Array.isArray(prepared["reasons"]) ? prepared["reasons"].join(", ") : "authentication-refused"; await postInteractionFollowup(interaction.applicationId, interaction.token, `TTI did not authenticate this enterprise delegation: ${reasons}. No placement request, bid, or economic effect occurred.`); return; } const recorded = await recorder(prepared); await postInteractionFollowup(interaction.applicationId, interaction.token, unionMediaEnterpriseAuthenticationAcknowledgement(recorded)); })
    .catch((error) => { process.stderr.write(`Union Media enterprise authentication failed: ${error instanceof Error ? error.message : String(error)}\n`); return postInteractionFollowup(interaction.applicationId, interaction.token, "TTI could not witness enterprise authentication. No placement request, bid, or economic effect was created."); });
  return deferredResponse({ ephemeral: true });
}

function unionMediaVerifyResponse(interaction, raw, source) {
  let configuration, store, recorder;
  try { configuration = unionMediaIntentConfiguration(source); store = unionMediaIntentSettlementWitness(source); recorder = unionMediaDestinationProofRecorderFromSettlementWitness(store); }
  catch { return messageResponse("TTI's Union Media verification witness boundary is unavailable. Nothing was stored and no economic effect occurred.", { ephemeral: true }); }
  void verifyDiscordUnionMediaDestinationControl({ interactionId: interaction.id, guildId: interaction.guildId, userId: interaction.userId, intentId: interactionStringOption(raw, "intent_receipt"), verification: interactionStringOption(raw, "verification") }, { ...configuration, store })
    .then(async (prepared) => {
      if (prepared["type"] !== "TTIUnionMediaDestinationControlAdmission") {
        const reasons = Array.isArray(prepared["reasons"]) ? prepared["reasons"].join(", ") : "verification-refused";
        await postInteractionFollowup(interaction.applicationId, interaction.token, `TTI did not verify destination control: ${reasons}. No enterprise authentication, bid, or economic effect occurred.`); return;
      }
      const recorded = await recorder(prepared);
      await postInteractionFollowup(interaction.applicationId, interaction.token, `${unionMediaDestinationProofAcknowledgement(recorded)}\n${enterpriseDelegationInstructions(recorded)}`);
    })
    .catch((error) => { process.stderr.write(`Union Media destination verification failed: ${error instanceof Error ? error.message : String(error)}\n`); return postInteractionFollowup(interaction.applicationId, interaction.token, "TTI could not witness destination control, so no qualified lead, enterprise authentication, bid, or economic effect was created."); });
  return deferredResponse({ ephemeral: true });
}

function unionMediaIntentResponse(interaction, raw, source) {
  let configuration, recorder;
  try { configuration = unionMediaIntentConfiguration(source); recorder = unionMediaIntentRecorderFromSettlementWitness(unionMediaIntentSettlementWitness(source)); }
  catch { return messageResponse("TTI's Union Media intent witness boundary is unavailable. Nothing was stored and no bid or economic effect occurred.", { ephemeral: true }); }
  const prepared = prepareDiscordUnionMediaIntent({ interactionId: interaction.id, guildId: interaction.guildId, userId: interaction.userId, enterprise: interactionStringOption(raw, "enterprise"), destination: interactionStringOption(raw, "destination"), resourceClass: interactionStringOption(raw, "resource_class"), resourceOffer: interactionStringOption(raw, "resource_offer"), auctionInterest: interactionStringOption(raw, "auction_interest"), consent: interactionStringOption(raw, "consent") }, configuration);
  if (prepared["type"] !== "TTIUnionMediaRepresentativeIntentAdmission") {
    const reasons = Array.isArray(prepared["reasons"]) ? prepared["reasons"].join(", ") : "intent-refused";
    return messageResponse(`TTI did not record this Union Media intent: ${reasons}. No bid or economic effect occurred.`, { ephemeral: true });
  }
  const admission = prepared;
  void recorder(admission).then((recorded) => postInteractionFollowup(interaction.applicationId, interaction.token, unionMediaIntentAcknowledgement(recorded))).catch((error) => { process.stderr.write(`Union Media intent witness failed: ${error instanceof Error ? error.message : String(error)}\n`); return postInteractionFollowup(interaction.applicationId, interaction.token, "TTI could not witness this intent, so it was not admitted. No enterprise authentication, bid, publication promise, or economic effect occurred."); });
  return deferredResponse({ ephemeral: true });
}

function localityPilotResponse(interaction, raw, source) {
  let configuration, recorder;
  try {
    configuration = localityPilotConfiguration(source);
    recorder = localityPilotRecorderFromSettlementWitness(localityPilotSettlementWitness(source));
  } catch {
    return messageResponse("TTI's locality-query witness boundary is unavailable. Nothing was stored, purchased, licensed, or charged.", { ephemeral: true });
  }
  const prepared = prepareDiscordLocalityQueryPilot({
    interactionId: interaction.id,
    guildId: interaction.guildId,
    userId: interaction.userId,
    question: interactionStringOption(raw, "question"),
    subject: interactionStringOption(raw, "subject"),
    locality: interactionStringOption(raw, "locality"),
    intendedUse: interactionStringOption(raw, "use"),
    deliveryInterest: interactionStringOption(raw, "delivery_interest"),
    consent: interactionStringOption(raw, "consent"),
  }, configuration);
  if (prepared["type"] !== "TTIDiscordLocalityQueryPilotAdmission") {
    const reasons = Array.isArray(prepared["reasons"]) ? prepared["reasons"].join(", ") : "query-refused";
    return messageResponse(`TTI did not record this locality pilot: ${reasons}. No charge or other economic effect occurred.`, { ephemeral: true });
  }
  const admission = prepared;
  void recorder(admission)
    .then((recorded) => postInteractionFollowup(interaction.applicationId, interaction.token, localityPilotAcknowledgement(recorded)))
    .catch((error) => {
      process.stderr.write(`locality pilot witness failed: ${error instanceof Error ? error.message : String(error)}\n`);
      return postInteractionFollowup(interaction.applicationId, interaction.token, "TTI could not witness this locality pilot, so it was not admitted. No charge, purchase, license, revenue, or other economic effect occurred.");
    });
  return deferredResponse({ ephemeral: true });
}

function isAdmin(interaction, source) {
  const adminUserId = env("DISCORD_ADMIN_USER_ID", source);
  return adminUserId !== undefined && interaction.userId === adminUserId;
}

async function previewSignal(interaction, source) {
  const storeDir = climateWireStoreDir(source);
  const draftsFile = signalDraftsFile(source);
  const [signals, drafts] = await Promise.all([readClimateSignals(storeDir), readSignalDrafts(draftsFile)]);
  const signal = nextUndraftedSignal(signals, drafts);
  if (signal === undefined) {
    await postInteractionFollowup(
      interaction.applicationId,
      interaction.token,
      signals.length === 0
        ? `no signals in ${storeDir} yet — run steward:ingest-signals first.`
        : `no undrafted signals in ${storeDir} (${signals.length} read, all already drafted).`,
    );
    return;
  }
  const draft = draftFromSignal(signal, "weather-report");
  await recordSignalDraft(draftsFile, draft);
  await postInteractionFollowup(
    interaction.applicationId,
    interaction.token,
    `draft ${draft.id} (→ #${draft.channelHint}, pending):\n\n${draft.content}\n\napprove with /approve-draft draft_id:${draft.id}`,
  );
}

async function approveDraft(interaction, source, draftId) {
  const draftsFile = signalDraftsFile(source);
  const drafts = latestDraftsById(await readSignalDrafts(draftsFile));
  const draft = drafts.find((candidate) => candidate.id === draftId);
  if (draft === undefined) {
    await postInteractionFollowup(interaction.applicationId, interaction.token, `no draft found with id ${draftId}.`);
    return;
  }
  if (draft.status !== "pending") {
    await postInteractionFollowup(interaction.applicationId, interaction.token, `draft ${draftId} is already ${draft.status}.`);
    return;
  }
  const guildId = interaction.guildId ?? env("DISCORD_GUILD_ID", source);
  if (guildId === undefined) {
    await postInteractionFollowup(interaction.applicationId, interaction.token, "no guild context to post into.");
    return;
  }
  const transport = new DiscordRestTransport({ env: source });
  const channels = await transport.listChannels(guildId);
  const channel = channels.find((candidate) => candidate.name.toLowerCase() === draft.channelHint.toLowerCase());
  if (channel === undefined) {
    await postInteractionFollowup(interaction.applicationId, interaction.token, `channel #${draft.channelHint} not found.`);
    return;
  }
  await transport.createMessage(channel.id, draft.content);
  await recordSignalDraft(draftsFile, { ...draft, status: "approved", updatedAt: new Date().toISOString() });
  await postInteractionFollowup(interaction.applicationId, interaction.token, `posted ${draft.id} to #${draft.channelHint}.`);
}

async function reportSpacetime(interaction, source) {
  const guildId = interaction.guildId ?? env("DISCORD_GUILD_ID", source);
  if (guildId === undefined) {
    await postInteractionFollowup(interaction.applicationId, interaction.token, "No guild context to read a causal set from.");
    return;
  }
  const transport = new DiscordRestTransport({ env: source });
  const channels = await transport.listChannels(guildId);
  const perChannel = await Promise.all(channels.map((channel) => transport.listMessages(channel.id, 20).catch(() => [])));
  const messages = perChannel.flat();
  const report = perceive(messages);
  await postInteractionFollowup(interaction.applicationId, interaction.token, surfaceCausalSignal(report));
}

async function handoffCommunityReport(interaction, raw, source) {
  const guildId = interaction.guildId ?? env("DISCORD_GUILD_ID", source);
  if (guildId === undefined || interaction.userId === undefined) {
    await postInteractionFollowup(interaction.applicationId, interaction.token, "This report could not be bound to a Turntide member. Please contact a human moderator directly.");
    return;
  }
  let report;
  try {
    report = prepareCommunityReport({
      interactionId: interaction.id,
      reporterId: interaction.userId,
      channelId: interaction.channelId,
      concern: interactionStringOption(raw, "concern") ?? "",
      messageLink: interactionStringOption(raw, "message_link"),
    });
  } catch (error) {
    await postInteractionFollowup(interaction.applicationId, interaction.token, error instanceof Error ? error.message : "The report was not valid.");
    return;
  }
  const transport = new DiscordRestTransport({ env: source });
  const channels = await transport.listChannels(guildId);
  const moderatorChannelId = env("TTI_MODERATOR_CHANNEL_ID", source);
  const moderatorChannel = (moderatorChannelId === undefined ? undefined : channels.find((channel) => channel.id === moderatorChannelId))
    ?? channels.find((channel) => ["moderator-bridge", "admin-channel"].includes(channel.name.toLowerCase()));
  if (moderatorChannel === undefined) {
    await postInteractionFollowup(interaction.applicationId, interaction.token, "Human moderator intake is temporarily unavailable. Please contact a moderator directly; nothing was recorded.");
    return;
  }
  await transport.createMessage(moderatorChannel.id, { content: report.moderatorMessage, allowedMentions: { users: [interaction.userId] } });
  await postInteractionFollowup(interaction.applicationId, interaction.token, report.acknowledgement);
}

/** Actually checks the invoking member's real entitlement instead of giving everyone the same answer. */
async function vaultResponse(interaction, source) {
  const config = configOrNull(source);
  const userId = interaction.userId;
  if (userId === undefined) return messageResponse(vaultInstructions(), { ephemeral: true });
  const legacyEntitlements = config === null ? [] : await readMembershipEntitlements(config.entitlementsFile);
  const paidEntitlements = await readVaultEntitlementDecisions(source);
  const entitlements = [...legacyEntitlements, ...paidEntitlements];
  const mine = latestEntitlements(entitlements).find((entry) => entry.userId === userId);
  const hasVaultAccess = mine !== undefined && mine.status === "active" && config !== null && planHasCapability(config, mine.planId, "vault-access");
  if (hasVaultAccess) return messageResponse(vaultAccessGrantedInstructions(), { ephemeral: true });
  let checkoutConfig;
  try { checkoutConfig = vaultCheckoutInvitationConfig(source); }
  catch { return messageResponse(`${vaultInstructions()}\n\nPrivate checkout invitations are temporarily unavailable because TTI's checkout evidence does not validate. No payment was attempted.`, { ephemeral: true }); }
  if (checkoutConfig === null || interaction.guildId === undefined) return messageResponse(vaultInstructions(), { ephemeral: true });
  const issued = await issueVaultCheckoutInvitation({ interactionId: interaction.id, guildId: interaction.guildId, userId, config: checkoutConfig });
  return messageResponse(`${vaultInstructions()}\n\n${vaultCheckoutInvitationMessage(issued.checkoutUrl, checkoutConfig.ttlMinutes)}`, { ephemeral: true });
}

function vaultInstructions() {
  return [
    "Turntide Islands knowledge vault:",
    ...vaultRigs.map((rig) => `- ${rig.name}: ${rig.href}`),
    "The vault is a separate product from free community membership. Any access offer must state its own current terms before payment.",
  ].join("\n");
}

function vaultAccessGrantedInstructions() {
  return [
    "You already have vault access.",
    ...vaultRigs.map((rig) => `- ${rig.name}: ${rig.href}`),
    "Check #vault-briefings for the latest agent-assisted synthesis.",
  ].join("\n");
}

function json(res, status, value) {
  text(res, status, `${JSON.stringify(value, null, 2)}\n`, "application/json; charset=utf-8");
}

function text(res, status, body, contentType) {
  res.writeHead(status, { "content-type": contentType });
  res.end(body);
}

function contentType(file) {
  if (file.endsWith(".xml")) return "application/xml; charset=utf-8";
  if (file.endsWith(".json") || file.endsWith(".jsonld")) return "application/json; charset=utf-8";
  if (file.endsWith(".txt")) return "text/plain; charset=utf-8";
  return "text/html; charset=utf-8";
}

function isMain() {
  return process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isMain()) {
  loadRuntimeEnv();
  serveTurntide({ log: (message) => process.stderr.write(`${message}\n`) }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
