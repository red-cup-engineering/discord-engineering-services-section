import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryDiscordTransport } from "../src/turntide-software-system/discord.mjs";
import { membershipConfig, reconcileMembershipEntitlements, roleForPlan } from "../src/turntide-software-system/membership.mjs";
import { serveTurntide } from "../src/turntide-software-system/serve.mjs";
import {
  PAYMENT_PROVIDER_ACTOR,
  TTI_ACTOR,
  VAULT_OFFERING_ID,
  VAULT_PLAN_ID,
  admitVaultProviderReceipt,
  bindProviderCheckoutResponse,
  buildVaultCheckoutSolicitation,
  recordVaultEntitlementDecision,
  vaultPaymentReadiness,
} from "../src/turntide-software-system/vault-payment.mjs";
import {
  CURRENT_PROVIDER_CHECKOUT_CONTRACT,
  CURRENT_PROVIDER_WEBHOOK_CONTRACT,
} from "../src/turntide-software-system/vault-market-constants.mjs";

const requestDigest = "ni:///sha-256;AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

function syntheticBinding() {
  const built = buildVaultCheckoutSolicitation({
    discordUserId: "123456789012345678",
    orderReference: "urn:tti:vault-order:synthetic-0001",
    requestId: "urn:tti:vault-checkout-request:synthetic-0001",
    publicOrigin: "https://simulation.invalid",
    providerCheckoutContract: CURRENT_PROVIDER_CHECKOUT_CONTRACT,
    providerWebhookContract: CURRENT_PROVIDER_WEBHOOK_CONTRACT,
  });
  const response = {
    type: "Accept",
    actor: PAYMENT_PROVIDER_ACTOR,
    target: TTI_ACTOR,
    object: {
      id: "urn:stripe-checkout-receipt:cs_test_synthetic",
      type: "StripeCheckoutSessionReceipt",
      contract: CURRENT_PROVIDER_CHECKOUT_CONTRACT,
      customerSettlement: TTI_ACTOR,
      offeringId: VAULT_OFFERING_ID,
      requestDigest,
      checkoutUrl: "https://checkout.stripe.com/c/pay/synthetic",
    },
  };
  return { built, binding: bindProviderCheckoutResponse(built.pendingBinding, response, { recordedAt: "2026-07-21T22:00:00.000Z", simulation: true }) };
}

function providerEvent(overrides = {}) {
  return {
    type: "Create",
    actor: PAYMENT_PROVIDER_ACTOR,
    target: TTI_ACTOR,
    object: {
      id: "urn:stripe-event-receipt:evt_synthetic",
      type: "StripeWebhookEventReceipt",
      law: CURRENT_PROVIDER_WEBHOOK_CONTRACT,
      stripeEventId: "evt_synthetic",
      eventType: "checkout.session.completed",
      created: 1_753_132_800,
      livemode: false,
      paymentStatus: "paid",
      status: "complete",
      requestDigest,
      offeringId: VAULT_OFFERING_ID,
      customerSettlement: TTI_ACTOR,
      signatureVerified: true,
      supported: true,
      duplicate: false,
      rawBodyRecorded: false,
      buyerPersonalDataRecorded: false,
      ...overrides,
    },
  };
}

test("checked-in activation is fail-closed and discloses no secret bytes", async () => {
  const readiness = await vaultPaymentReadiness({});
  assert.equal(readiness.liveReady, false);
  assert.equal(readiness.activationStatus, "not-admitted");
  assert.ok(readiness.blockers.includes("activation-not-admitted"));
  assert.equal(readiness.secretsDisclosed, false);
});

test("checkout solicitation fixes provider, offering, quantity, and redirects while keeping Discord identity local", () => {
  const { built, binding } = syntheticBinding();
  assert.notEqual(binding.type, "TTIVaultPaymentRefusal");
  assert.equal(built.activity.actor, TTI_ACTOR);
  assert.equal(built.activity.target, PAYMENT_PROVIDER_ACTOR);
  assert.equal(built.activity.object.request.offeringId, VAULT_OFFERING_ID);
  assert.equal(built.activity.object.request.quantity, 1);
  assert.doesNotMatch(JSON.stringify(built.activity), /123456789012345678/u);
  assert.equal(built.pendingBinding.discordUserId, "123456789012345678");
  assert.equal(binding.requestDigest, requestDigest);
});

test("provider receipt becomes only a synthetic nonposting entitlement in simulation", async () => {
  const { binding } = syntheticBinding();
  assert.notEqual(binding.type, "TTIVaultPaymentRefusal");
  const decision = admitVaultProviderReceipt({ activity: providerEvent(), binding, observedAt: "2026-07-21T22:01:00.000Z", simulationMode: true });
  assert.equal(decision.type, "TTIVaultEntitlementDecision");
  assert.equal(decision.planId, VAULT_PLAN_ID);
  assert.equal(decision.status, "active");
  assert.equal(decision.evidenceClass, "synthetic-nonposting");
  assert.equal(decision.simulation, true);
  let recorded = false;
  await assert.rejects(() => recordVaultEntitlementDecision({ record: async () => { recorded = true; } }, decision), /cannot post/u);
  assert.equal(recorded, false);
});

test("unpaid, duplicate, mismatched, and stale provider events fail closed", () => {
  const { binding } = syntheticBinding();
  assert.notEqual(binding.type, "TTIVaultPaymentRefusal");
  const unpaid = admitVaultProviderReceipt({ activity: providerEvent({ paymentStatus: "unpaid" }), binding, simulationMode: true });
  assert.equal(unpaid.reason, "provider-event-has-no-admitted-entitlement-consequence");
  const mismatched = admitVaultProviderReceipt({ activity: providerEvent({ offeringId: "caller-price" }), binding, simulationMode: true });
  assert.equal(mismatched.reason, "provider-event-binding-mismatch");
  const first = admitVaultProviderReceipt({ activity: providerEvent(), binding, simulationMode: true });
  assert.equal(first.type, "TTIVaultEntitlementDecision");
  const duplicate = admitVaultProviderReceipt({ activity: providerEvent(), binding, priorDecisions: [first], simulationMode: true });
  assert.equal(duplicate.reason, "provider-event-duplicate");
  const stale = admitVaultProviderReceipt({ activity: providerEvent({ stripeEventId: "evt_stale", id: "urn:stripe-event-receipt:evt_stale", created: first.providerEventCreated - 1 }), binding, priorDecisions: [first], simulationMode: true });
  assert.equal(stale.reason, "provider-event-stale");
});

test("paid Vault tier grants only the dedicated subscriber role and unknown plans grant nothing", async () => {
  const config = membershipConfig({ DISCORD_GUILD_ID: "guild", TURNTIDE_ISLANDER_ROLE_ID: "islander-role", TTI_VAULT_SUBSCRIBER_ROLE_ID: "vault-role" });
  assert.equal(roleForPlan(config, "islander-monthly"), "islander-role");
  assert.equal(roleForPlan(config, VAULT_PLAN_ID), "vault-role");
  assert.equal(roleForPlan(config, "unknown-plan"), undefined);
  const transport = new InMemoryDiscordTransport();
  const guild = (await transport.listGuilds())[0];
  const islander = await transport.createRole(guild.id, { name: "islander" });
  const vault = await transport.createRole(guild.id, { name: "vault subscriber" });
  await reconcileMembershipEntitlements(transport, { ...config, guildId: guild.id, roleId: islander.id, tiers: [
    { planId: "islander-monthly", roleId: islander.id, capabilities: ["discord-injection", "vault-access"] },
    { planId: VAULT_PLAN_ID, roleId: vault.id, capabilities: ["vault-access"] },
  ] }, [{ id: "decision", userId: "member", provider: PAYMENT_PROVIDER_ACTOR, planId: VAULT_PLAN_ID, status: "active", observedAt: "2026-07-21T22:01:00.000Z" }]);
  assert.equal(transport.memberHasRole(guild.id, "member", vault.id), true);
  assert.equal(transport.memberHasRole(guild.id, "member", islander.id), false);
});

test("HTTP checkout refuses instead of fabricating a manual checkout and raw Stripe ingress is retired", async () => {
  const running = await serveTurntide({ port: 0, env: { TTI_TICK_INTERVAL_MS: "0", TTI_DAILY_DIVINATION_CHECK_INTERVAL_MS: "0" } });
  try {
    await new Promise((resolve) => setTimeout(resolve, 50));
    const checkout = await fetch(`http://${running.host}:${running.port}/membership/checkout`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: "123456789012345678" }) });
    assert.equal(checkout.status, 503);
    const body = await checkout.json();
    assert.equal(body.paymentCreated, false);
    assert.equal(body.revenueRecognized, false);
    assert.doesNotMatch(JSON.stringify(body), /manual-record/u);
    const rawStripe = await fetch(`http://${running.host}:${running.port}/membership/stripe/webhook`, { method: "POST", body: "{}" });
    assert.equal(rawStripe.status, 410);
    assert.equal((await rawStripe.json()).reason, "raw-stripe-webhooks-belong-to-sovereign-payment-provider");
  } finally {
    await running.close();
  }
});
