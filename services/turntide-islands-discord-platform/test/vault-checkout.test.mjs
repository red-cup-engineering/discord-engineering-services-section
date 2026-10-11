import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { identifyTurntideDiscordPlatformRecord as semanticId } from "../src/turntide-software-system/discord-platform-record-semantic-content.mjs";


import { serveTurntide } from "../src/turntide-software-system/serve.mjs";
import { verifyDiscordInteractionSignature } from "../src/turntide-software-system/discord-interactions.mjs";
import { issueVaultCheckoutInvitation, vaultCheckoutHttpResponse, vaultCheckoutInvitationConfig } from "../src/turntide-software-system/vault-checkout.mjs";
import { PAYMENT_PROVIDER_ACTOR, TTI_ACTOR, VAULT_OFFERING_ID, VAULT_PLAN_ID, VAULT_PRODUCT_ID, beginVaultCheckout, vaultPaymentReadiness } from "../src/turntide-software-system/vault-payment.mjs";
import { PROVIDER_OFFER_CONTRACT, PROVIDER_OPERATIONAL_ADMISSION_CATEGORY, PROVIDER_OPERATIONAL_TEST_RECEIPT_CATEGORY } from "../src/turntide-software-system/vault-market-constants.mjs";

// RFC 6920 canonical sha-256 ni URIs only accept a terminal base64url character from
// {A,E,I,M,Q,U,Y,c,g,k,o,s,w,0,4,8} (the last sextet's two zero-pad bits); "B" is not in that
// set, so a repeated-"B" placeholder is never a valid canonical address. NI_B is a real sha-256
// digest of a fixture seed string, computed via node:crypto and base64url-encoded.
const NI_A = "ni:///sha-256;AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const NI_B = "ni:///sha-256;nTRJypkgLv5mqsXXtj3_aiioNWsMUIJqoUbzL761WM4";

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "tti-vault-checkout-"));
  const source = {
    TTI_PUBLIC_ORIGIN: "http://127.0.0.1:9999",
    DISCORD_GUILD_ID: "1184863861065658419",
    TURNTIDE_DATA_ROOT: root,
    TTI_VAULT_CHECKOUT_INVITATIONS_FILE: path.join(root, "invitations.jsonl"),
    TTI_VAULT_CHECKOUT_INTENTS_FILE: path.join(root, "intents.jsonl"),
  };
  return { root, source, config: vaultCheckoutInvitationConfig(source) };
}

function withSemanticId(body) { return { ...body, id: semanticId(body) }; }
function operationalEvidence(provider) {
  const testReceipts = Array.from({ length: 7 }, (_, index) => withSemanticId({ type: `TTIProviderOperationalTestReceipt${index + 1}`, status: "passed", simulation: false, witnessed: true, witnessReceiptId: NI_A, provider: PAYMENT_PROVIDER_ACTOR, contracts: provider }));
  const decision = withSemanticId({ type: "TTIVaultProviderOperationalAdmissionDecision", version: 1, status: "admitted", simulation: false, evidenceClass: "tti-customer-observed-test", liveActivationAuthority: false, contractExecuted: false, checkoutCreated: false, paymentObserved: false, revenueRecognized: false, profitRecognized: false, provider: PAYMENT_PROVIDER_ACTOR, offeringId: VAULT_OFFERING_ID, contracts: { offer: provider.offerContract, checkout: provider.checkoutContract, webhook: provider.webhookContract, receiptDelivery: provider.receiptDeliveryContract }, counts: { requiredTests: 7, passed: 7, failed: 0 }, evidenceReceiptIds: testReceipts.map((receipt) => receipt.id) });
  return { testReceipts, decision };
}

test("verified Discord interaction issues a private token whose bearer bytes are never persisted", async () => {
  const f = await fixture();
  try {
    const issued = await issueVaultCheckoutInvitation({ interactionId: "1529000000000000001", guildId: f.source.DISCORD_GUILD_ID, userId: "1529000000000000002", config: f.config, now: new Date("2026-07-21T23:00:00.000Z"), token: "synthetic-private-token-00000001" });
    assert.match(issued.checkoutUrl, /session=synthetic-private-token-00000001/u);
    const stored = await readFile(f.source.TTI_VAULT_CHECKOUT_INVITATIONS_FILE, "utf8");
    assert.doesNotMatch(stored, /synthetic-private-token-00000001/u);
    assert.match(stored, /sha256:/u);
    assert.equal(issued.invitation.discord.userId, "1529000000000000002");
    assert.equal(issued.invitation.legalEffect, "private-checkout-invitation-only-no-charge-payment-entitlement-or-revenue");
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test("GET does not consume; a confirmed non-live POST records qualified interest once and never calls a provider", async () => {
  const f = await fixture();
  try {
    const token = "synthetic-private-token-00000002";
    const issued = await issueVaultCheckoutInvitation({ interactionId: "1529000000000000011", guildId: f.source.DISCORD_GUILD_ID, userId: "1529000000000000012", config: f.config, now: new Date("2026-07-21T23:00:00.000Z"), token });
    const url = new URL(issued.checkoutUrl);
    const firstGet = await vaultCheckoutHttpResponse({ method: "GET", url, config: f.config, now: new Date("2026-07-21T23:01:00.000Z") });
    const secondGet = await vaultCheckoutHttpResponse({ method: "GET", url, config: f.config, now: new Date("2026-07-21T23:02:00.000Z") });
    assert.equal(firstGet.status, 200); assert.equal(secondGet.status, 200);
    assert.match(firstGet.body, /Payments are not live/u);
    let providerCalled = false;
    const body = new URLSearchParams({ session: token, productDigest: issued.invitation.productDigest, checkoutIntentConfirmed: "yes" }).toString();
    const post = await vaultCheckoutHttpResponse({ method: "POST", url, contentType: "application/x-www-form-urlencoded", body, config: f.config, now: new Date("2026-07-21T23:03:00.000Z"), fetchImpl: async () => { providerCalled = true; throw new Error("must not run"); } });
    assert.equal(post.status, 202);
    assert.equal(providerCalled, false);
    assert.match(post.body, /No Checkout Session, charge, payment, entitlement, revenue, or profit/u);
    const [intent] = (await readFile(f.source.TTI_VAULT_CHECKOUT_INTENTS_FILE, "utf8")).trim().split("\n").map(JSON.parse);
    assert.equal(intent.status, "qualified-no-charge");
    assert.equal(intent.candidatePrice.unitAmount, 500);
    const duplicate = await vaultCheckoutHttpResponse({ method: "POST", url, contentType: "application/x-www-form-urlencoded", body, config: f.config, now: new Date("2026-07-21T23:04:00.000Z") });
    assert.equal(duplicate.status, 409);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test("live-capable provider solicitation keeps Discord identity local and returns URL only after binding witness", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "tti-vault-provider-"));
  try {
    const terms = { type: "TTIKnowledgeVaultSubscriptionTerms", status: "effective", productId: VAULT_PRODUCT_ID, offeringId: VAULT_OFFERING_ID, planId: VAULT_PLAN_ID };
    const termsFile = path.join(root, "terms.json"); await writeFile(termsFile, JSON.stringify(terms));
    const termsId = semanticId(terms);
    const provider = { actor: PAYMENT_PROVIDER_ACTOR, offerContract: PROVIDER_OFFER_CONTRACT, checkoutContract: "ni:///sha-256;3EBj3TDXwaixs8x0ZhgpqddX_cWrof8wIJkZ4GpBS5Y", webhookContract: "ni:///sha-256;i_TblBaOnEGrk6UEzqP23piKpu_wZD5NDJdoreuGPpY", receiptDeliveryContract: NI_B };
    const operational = operationalEvidence(provider);
    const activation = { type: "TTIKnowledgeVaultPaymentActivationAdmission", version: 1, status: "admitted", productId: VAULT_PRODUCT_ID, offeringId: VAULT_OFFERING_ID, planId: VAULT_PLAN_ID, provider, evidenceBindings: { commercialTerms: termsId, providerOffering: operational.decision.id, providerSubscriptionLifecycle: NI_A, providerReceiptDelivery: NI_A, discordIdentityIngress: NI_A, publicOriginControl: NI_A, witnessJournalProviderContract: NI_A, discordRoleTerritory: NI_A }, blockers: [] };
    const source = { TTI_PUBLIC_ORIGIN: "https://tti.example", TTI_VAULT_PAYMENT_PROVIDER_URL: "https://payments.example", TTI_VAULT_PAYMENT_CUSTOMER_CONTRACT_TOKEN: "customer-secret", TTI_VAULT_PAYMENT_RECEIPT_TOKEN: "receipt-secret", TTI_VAULT_SUBSCRIBER_ROLE_ID: "role", TTI_VAULT_COMMERCIAL_TERMS_FILE: termsFile, WITNESS_JOURNAL_RDF_AGENT: "https://witnessJournal.example/card" };
    const records = [], calls = [];
    const store = { records: (category) => category === PROVIDER_OPERATIONAL_ADMISSION_CATEGORY ? [operational.decision] : category === PROVIDER_OPERATIONAL_TEST_RECEIPT_CATEGORY ? operational.testReceipts : records, record: async ({ record }) => { records.push(record); return { digest: NI_B }; } };
    const tamperedReceipts = operational.testReceipts.map((receipt, index) => index === 0 ? { ...receipt, status: "failed" } : receipt);
    const tamperedReadiness = await vaultPaymentReadiness(source, activation, [operational.decision], tamperedReceipts);
    assert.equal(tamperedReadiness.liveReady, false);
    assert.ok(tamperedReadiness.blockers.includes("provider-operational-admission-not-witnessed-or-activation-binding-mismatch"));
    const fetchImpl = async (_url, options) => {
      calls.push(options);
      const activity = JSON.parse(options.body);
      assert.doesNotMatch(options.body, /1529000000000000099/u);
      assert.equal(activity.object.request.customerReference, "urn:tti:vault-order:1529000000000000098");
      return new Response(JSON.stringify({ type: "Accept", actor: PAYMENT_PROVIDER_ACTOR, target: TTI_ACTOR, object: { id: "urn:stripe-checkout-receipt:cs_live_1", type: "StripeCheckoutSessionReceipt", contract: activation.provider.checkoutContract, customerSettlement: TTI_ACTOR, offeringId: VAULT_OFFERING_ID, requestDigest: NI_B, checkoutUrl: "https://checkout.stripe.com/c/pay/live" } }), { status: 201, headers: { "content-type": "application/activity+json" } });
    };
    const started = await beginVaultCheckout({ discordUserId: "1529000000000000099", orderReference: "urn:tti:vault-order:1529000000000000098", requestId: "urn:tti:vault-checkout-request:1529000000000000098", source, activation, store, fetchImpl, recordedAt: "2026-07-21T23:10:00.000Z" });
    assert.equal(started.type, "TTIVaultCheckoutStart");
    assert.equal(started.revenueRecognized, false);
    assert.equal(records.length, 1);
    assert.equal(calls.length, 1);
    assert.equal(started.binding.discordUserId, "1529000000000000099");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("provider URL is never disclosed if the append-only checkout binding cannot be witnessed", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "tti-vault-provider-failure-"));
  try {
    const terms = { type: "TTIKnowledgeVaultSubscriptionTerms", status: "effective", productId: VAULT_PRODUCT_ID, offeringId: VAULT_OFFERING_ID };
    const termsFile = path.join(root, "terms.json"); await writeFile(termsFile, JSON.stringify(terms));
    const termsId = semanticId(terms);
    const provider = { actor: PAYMENT_PROVIDER_ACTOR, offerContract: PROVIDER_OFFER_CONTRACT, checkoutContract: "ni:///sha-256;3EBj3TDXwaixs8x0ZhgpqddX_cWrof8wIJkZ4GpBS5Y", webhookContract: "ni:///sha-256;i_TblBaOnEGrk6UEzqP23piKpu_wZD5NDJdoreuGPpY", receiptDeliveryContract: NI_B };
    const operational = operationalEvidence(provider);
    const activation = { type: "TTIKnowledgeVaultPaymentActivationAdmission", version: 1, status: "admitted", productId: VAULT_PRODUCT_ID, offeringId: VAULT_OFFERING_ID, planId: VAULT_PLAN_ID, provider, evidenceBindings: { commercialTerms: termsId, providerOffering: operational.decision.id, providerSubscriptionLifecycle: NI_A, providerReceiptDelivery: NI_A, discordIdentityIngress: NI_A, publicOriginControl: NI_A, witnessJournalProviderContract: NI_A, discordRoleTerritory: NI_A }, blockers: [] };
    const source = { TTI_PUBLIC_ORIGIN: "https://tti.example", TTI_VAULT_PAYMENT_PROVIDER_URL: "https://payments.example", TTI_VAULT_PAYMENT_CUSTOMER_CONTRACT_TOKEN: "customer-secret", TTI_VAULT_PAYMENT_RECEIPT_TOKEN: "receipt-secret", TTI_VAULT_SUBSCRIBER_ROLE_ID: "role", TTI_VAULT_COMMERCIAL_TERMS_FILE: termsFile, WITNESS_JOURNAL_RDF_AGENT: "https://witnessJournal.example/card" };
    const fetchImpl = async () => new Response(JSON.stringify({ type: "Accept", actor: PAYMENT_PROVIDER_ACTOR, target: TTI_ACTOR, object: { id: "urn:stripe-checkout-receipt:cs_live_2", type: "StripeCheckoutSessionReceipt", contract: activation.provider.checkoutContract, customerSettlement: TTI_ACTOR, offeringId: VAULT_OFFERING_ID, requestDigest: NI_B, checkoutUrl: "https://checkout.stripe.com/c/pay/secret" } }), { status: 201 });
    await assert.rejects(() => beginVaultCheckout({ discordUserId: "1529000000000000199", orderReference: "urn:tti:vault-order:1529000000000000198", requestId: "urn:tti:vault-checkout-request:1529000000000000198", source, activation, store: { records: (category) => category === PROVIDER_OPERATIONAL_ADMISSION_CATEGORY ? [operational.decision] : category === PROVIDER_OPERATIONAL_TEST_RECEIPT_CATEGORY ? operational.testReceipts : [], record: async () => { throw new Error("WitnessJournal unavailable"); } }, fetchImpl }), /WitnessJournal unavailable/u);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("signed /vault interaction returns an ephemeral one-time checkout invitation", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "tti-vault-interaction-"));
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicHex = Buffer.from(publicKey.export({ format: "jwk" }).x, "base64url").toString("hex");
  const env = { DISCORD_PUBLIC_KEY: publicHex, DISCORD_GUILD_ID: "1184863861065658419", TURNTIDE_ISLANDER_ROLE_ID: "islander-role", TURNTIDE_DATA_ROOT: root, TTI_PUBLIC_ORIGIN: "http://127.0.0.1:9999", TTI_TICK_INTERVAL_MS: "0", TTI_DAILY_DIVINATION_CHECK_INTERVAL_MS: "0" };
  const running = await serveTurntide({ port: 0, env });
  try {
    await new Promise((resolve) => setTimeout(resolve, 50));
    const payload = JSON.stringify({ id: "1529000000000000301", application_id: "1529000000000000302", type: 2, data: { id: "1529000000000000303", name: "vault" }, guild_id: env.DISCORD_GUILD_ID, channel_id: "1529000000000000304", member: { user: { id: "1529000000000000305", username: "synthetic" } }, token: "synthetic-interaction-token", version: 1 });
    const timestamp = String(Math.floor(Date.now() / 1000)), signature = sign(null, Buffer.from(timestamp + payload), privateKey).toString("hex");
    assert.equal(verifyDiscordInteractionSignature({ rawBody: payload, timestamp, signature, publicKey: publicHex, now: Number(timestamp) + 301 }), false);
    const response = await fetch(`http://${running.host}:${running.port}/discord/interactions`, { method: "POST", headers: { "content-type": "application/json", "x-signature-ed25519": signature, "x-signature-timestamp": timestamp }, body: payload });
    assert.equal(response.status, 200);
    const wire = await response.json();
    assert.equal(wire.data.flags, 64);
    assert.match(wire.data.content, /private Knowledge Vault checkout invitation/u);
    const link = wire.data.content.match(/http:\/\/127\.0\.0\.1:9999\/membership\/checkout\?session=[^\s]+/u)?.[0];
    assert.ok(link);
    const token = new URL(link).searchParams.get("session");
    const stored = await readFile(path.join(root, "vault-checkout", "invitations.jsonl"), "utf8");
    assert.doesNotMatch(stored, new RegExp(token, "u"));
    const pageResponse = await fetch(`http://${running.host}:${running.port}/membership/checkout?session=${encodeURIComponent(token)}`);
    assert.equal(pageResponse.status, 200);
    assert.match(await pageResponse.text(), /Record purchase interest — no charge/u);
  } finally { await running.close(); await rm(root, { recursive: true, force: true }); }
});
