import { readFileSync } from "node:fs";
import path from "node:path";
import { identifyTurntideDiscordPlatformRecord as semanticId } from "./discord-platform-record-semantic-content.mts";
import { type SettlementWitness } from "./settlement-witness.mts";
import { env, integerEnv, publicTurntideContentPath, publicTurntideDataPath, type EnvMap } from "./env.mts";
import { appendOneTimeSessionRecord, consumeOneTimeSession, inspectOneTimeSession, issueOneTimeSession } from "./one-time-session.mts";
import {
  VAULT_OFFERING_ID,
  VAULT_PLAN_ID,
  VAULT_PRODUCT_ID,
  beginVaultCheckout,
  loadVaultPaymentActivation,
  vaultPaymentReadiness,
  type VaultPaymentActivation,
} from "./vault-payment.mts";

const productPath = (source: EnvMap) => publicTurntideContentPath(source, "products", "founding-knowledge-vault.json");
const INVITATION_TYPE = "TTIVaultCheckoutInvitation";
const CONSUMPTION_TYPE = "TTIVaultCheckoutInvitationConsumption";

export interface VaultCheckoutInvitationConfig {
  readonly source: EnvMap;
  readonly guildId: string;
  readonly baseUrl: string;
  readonly sessionsFile: string;
  readonly intentsFile: string;
  readonly ttlMinutes: number;
  readonly product: Readonly<Record<string, unknown>>;
  readonly productDigest: string;
  readonly activation: VaultPaymentActivation;
  readonly activationDigest: string;
  readonly commercialTerms: Readonly<Record<string, unknown>> | null;
  readonly commercialTermsDigest: string | null;
}

export interface VaultCheckoutInvitation {
  readonly type: "TTIVaultCheckoutInvitation";
  readonly version: 1;
  readonly status: "pending";
  readonly tokenDigest: string;
  readonly discord: Readonly<{ guildId: string; interactionId: string; userId: string }>;
  readonly productId: string;
  readonly productDigest: string;
  readonly activationDigest: string;
  readonly offeringId: string;
  readonly planId: string;
  readonly orderReference: string;
  readonly providerRequestId: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly legalEffect: "private-checkout-invitation-only-no-charge-payment-entitlement-or-revenue";
}

export interface VaultCheckoutHttpResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
  readonly intentId?: string;
  readonly checkoutBindingId?: string;
}

export function vaultCheckoutInvitationConfig(source: EnvMap = process.env): VaultCheckoutInvitationConfig | null {
  const baseUrl = env("TTI_PUBLIC_ORIGIN", source), guildId = env("DISCORD_GUILD_ID", source);
  if (baseUrl === undefined || guildId === undefined) return null;
  const url = new URL(baseUrl);
  if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("Vault checkout invitation origin must use HTTPS");
  const product = JSON.parse(readFileSync(productPath(source), "utf8")) as Record<string, unknown>;
  const activation = loadVaultPaymentActivation(env("TTI_VAULT_PAYMENT_ACTIVATION_FILE", source));
  if (product["id"] !== VAULT_PRODUCT_ID) throw new Error("Vault checkout product identity mismatch");
  const root = env("TURNTIDE_DATA_ROOT", source) ?? publicTurntideDataPath(source);
  const termsFile = env("TTI_VAULT_COMMERCIAL_TERMS_FILE", source);
  const commercialTerms = termsFile === undefined ? null : JSON.parse(readFileSync(termsFile, "utf8")) as Record<string, unknown>;
  return Object.freeze({
    source,
    guildId,
    baseUrl: url.href,
    sessionsFile: env("TTI_VAULT_CHECKOUT_INVITATIONS_FILE", source) ?? path.join(root, "vault-checkout", "invitations.jsonl"),
    intentsFile: env("TTI_VAULT_CHECKOUT_INTENTS_FILE", source) ?? path.join(root, "vault-checkout", "qualified-intents.jsonl"),
    ttlMinutes: integerEnv("TTI_VAULT_CHECKOUT_TTL_MINUTES", 15, source),
    product: Object.freeze(product),
    productDigest: semanticId(product),
    activation,
    activationDigest: semanticId(activation),
    commercialTerms: commercialTerms === null ? null : Object.freeze(commercialTerms),
    commercialTermsDigest: commercialTerms === null ? null : semanticId(commercialTerms),
  });
}

export async function issueVaultCheckoutInvitation(input: Readonly<{
  interactionId: string;
  guildId: string;
  userId: string;
  config: VaultCheckoutInvitationConfig;
  now?: Date;
  token?: string;
}>): Promise<Readonly<{ invitation: VaultCheckoutInvitation; checkoutUrl: string }>> {
  if (input.guildId !== input.config.guildId || !snowflake(input.interactionId) || !snowflake(input.userId)) throw new Error("verified in-territory Discord interaction identity is required");
  const now = input.now ?? new Date();
  const issued = await issueOneTimeSession({ file: input.config.sessionsFile, token: input.token, record: {
    type: INVITATION_TYPE,
    version: 1 as const,
    status: "pending" as const,
    discord: { guildId: input.guildId, interactionId: input.interactionId, userId: input.userId },
    productId: VAULT_PRODUCT_ID,
    productDigest: input.config.productDigest,
    activationDigest: input.config.activationDigest,
    offeringId: VAULT_OFFERING_ID,
    planId: VAULT_PLAN_ID,
    orderReference: `urn:tti:vault-order:${input.interactionId}`,
    providerRequestId: `urn:tti:vault-checkout-request:${input.interactionId}`,
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + input.config.ttlMinutes * 60_000).toISOString(),
    legalEffect: "private-checkout-invitation-only-no-charge-payment-entitlement-or-revenue" as const,
  } });
  const checkoutUrl = new URL("/membership/checkout", input.config.baseUrl);
  checkoutUrl.searchParams.set("session", issued.token);
  return { invitation: issued.record as VaultCheckoutInvitation, checkoutUrl: checkoutUrl.href };
}

export async function inspectVaultCheckoutInvitation(token: string, config: VaultCheckoutInvitationConfig, now?: Date) {
  return inspectOneTimeSession<VaultCheckoutInvitation>({ token, file: config.sessionsFile, sessionType: INVITATION_TYPE, consumptionType: CONSUMPTION_TYPE, now });
}

export function vaultCheckoutInvitationMessage(checkoutUrl: string, ttlMinutes: number): string {
  return [
    "Turntide Islands verified your Discord account for a private Knowledge Vault checkout invitation.",
    `Review the exact offer within ${ttlMinutes} minutes: ${checkoutUrl}`,
    "Opening the link does not charge you. Any live checkout requires a second affirmative action on TTI's page; while payments are not admitted, that action records only no-charge purchase interest.",
  ].join("\n\n");
}

export async function vaultCheckoutHttpResponse(input: Readonly<{
  method: string;
  url: URL;
  contentType?: string;
  body?: string;
  config: VaultCheckoutInvitationConfig;
  now?: Date;
  store?: Pick<SettlementWitness, "record" | "records">;
  fetchImpl?: typeof fetch;
}>): Promise<VaultCheckoutHttpResponse> {
  if (input.method === "GET") return renderCheckoutInvitation(input.url.searchParams.get("session") ?? "", input.config, input.now);
  if (input.method !== "POST") return { status: 405, headers: { ...secureHeaders, allow: "GET, POST" }, body: page("Method not allowed", "<p>Use the private checkout invitation.</p>") };
  if (!(input.contentType ?? "").toLowerCase().startsWith("application/x-www-form-urlencoded")) return { status: 415, headers: secureHeaders, body: page("Unsupported submission", "<p>The checkout surface accepts only its own form.</p>") };
  const params = new URLSearchParams(input.body ?? "");
  const token = uniqueField(params, "session"), confirmed = uniqueField(params, "checkoutIntentConfirmed"), productDigest = uniqueField(params, "productDigest");
  if (token === undefined || confirmed !== "yes" || productDigest === undefined) return refusedPage(400, "The required checkout confirmation was not supplied.");
  const now = input.now ?? new Date();
  const inspection = await inspectVaultCheckoutInvitation(token, input.config, now);
  if (!inspection.accepted || inspection.session === undefined) return unavailablePage(inspection.reason === "session-already-consumed" ? 409 : 404);
  const invitation = inspection.session;
  if (productDigest !== invitation.productDigest || invitation.productDigest !== input.config.productDigest || invitation.activationDigest !== input.config.activationDigest || invitation.productId !== VAULT_PRODUCT_ID || invitation.offeringId !== VAULT_OFFERING_ID || invitation.planId !== VAULT_PLAN_ID) return refusedPage(409, "The product or activation evidence changed; request a fresh invitation.");
  const readiness = await vaultPaymentReadiness(input.config.source, input.config.activation);
  if (!readiness.liveReady) {
    const intentBody = {
      type: "TTIVaultCheckoutIntent", version: 1, status: "qualified-no-charge", recordedAt: now.toISOString(),
      discordUserId: invitation.discord.userId, sourceInteractionId: invitation.discord.interactionId,
      productId: invitation.productId, productDigest: invitation.productDigest, offeringId: invitation.offeringId, planId: invitation.planId,
      candidatePrice: candidatePrice(input.config.product), paymentCreated: false, revenueRecognized: false,
    };
    const intent = { ...intentBody, id: semanticId(intentBody) };
    const consumed = await consumeOneTimeSession<VaultCheckoutInvitation>({ token, file: input.config.sessionsFile, sessionType: INVITATION_TYPE, consumptionType: CONSUMPTION_TYPE, now, claimPayload: intent, consumption: { outcome: "qualified-no-charge", intentId: intent.id } });
    if (!consumed.accepted) return unavailablePage(409);
    await appendOneTimeSessionRecord(input.config.intentsFile, intent);
    return { status: 202, headers: secureHeaders, body: page("Checkout interest recorded", `<p>TTI recorded qualified purchase interest <code>${escapeHtml(intent.id)}</code> at the candidate price. No Checkout Session, charge, payment, entitlement, revenue, or profit was created. TTI will need a fresh affirmative invitation after live terms and payment admission exist.</p>`), intentId: intent.id };
  }
  const acceptedTermsId = uniqueField(params, "termsId"), acceptedTerms = uniqueField(params, "commercialTermsAccepted");
  if (acceptedTerms !== "yes" || acceptedTermsId !== input.config.activation.evidenceBindings.commercialTerms || acceptedTermsId !== input.config.commercialTermsDigest) return refusedPage(400, "The exact effective commercial terms were not accepted.");
  const started = await beginVaultCheckout({ discordUserId: invitation.discord.userId, orderReference: invitation.orderReference, requestId: invitation.providerRequestId, source: input.config.source, activation: input.config.activation, store: input.store, fetchImpl: input.fetchImpl, recordedAt: now.toISOString() });
  if (started.type === "TTIVaultPaymentRefusal") return refusedPage(503, `Checkout remains unavailable: ${started.reason}.`);
  const consumed = await consumeOneTimeSession<VaultCheckoutInvitation>({ token, file: input.config.sessionsFile, sessionType: INVITATION_TYPE, consumptionType: CONSUMPTION_TYPE, now, claimPayload: { checkoutBindingId: started.binding.id, termsId: acceptedTermsId }, consumption: { outcome: "provider-checkout-started", checkoutBindingId: started.binding.id } });
  if (!consumed.accepted) return unavailablePage(409);
  return { status: 303, headers: { ...secureHeaders, location: started.checkoutUrl }, body: "", checkoutBindingId: started.binding.id };
}

async function renderCheckoutInvitation(token: string, config: VaultCheckoutInvitationConfig, now?: Date): Promise<VaultCheckoutHttpResponse> {
  if (token.length < 16 || token.length > 200) return unavailablePage();
  const inspection = await inspectVaultCheckoutInvitation(token, config, now);
  if (!inspection.accepted || inspection.session === undefined) return unavailablePage(inspection.reason === "session-already-consumed" ? 409 : 404);
  const invitation = inspection.session;
  if (invitation.productDigest !== config.productDigest || invitation.activationDigest !== config.activationDigest) return refusedPage(409, "The offer evidence changed; request a fresh invitation.");
  const offer = asRecord(config.product["offer"]), readiness = await vaultPaymentReadiness(config.source, config.activation);
  const included = stringArray(offer["included"]).map((value) => `<li>${escapeHtml(value)}</li>`).join("");
  const excluded = stringArray(offer["excluded"]).map((value) => `<li>${escapeHtml(value)}</li>`).join("");
  const exactTerms = config.commercialTerms === null ? "" : `<h2>Exact effective commercial terms</h2><p>The following canonical JSON is the complete agreement presented for acceptance.</p><pre>${escapeHtml(JSON.stringify(config.commercialTerms, null, 2))}</pre>`;
  const modeNotice = readiness.liveReady
    ? `<p>Payment admission is active. Continuing will create a hosted provider Checkout Session, but payment and entitlement exist only after admitted provider receipts.</p>${exactTerms}<label><input type="checkbox" name="commercialTermsAccepted" value="yes" required> I accept the complete effective commercial terms shown above, identity <code>${escapeHtml(String(config.activation.evidenceBindings.commercialTerms))}</code>.</label><input type="hidden" name="termsId" value="${escapeHtml(String(config.activation.evidenceBindings.commercialTerms))}">`
    : "<p><strong>Payments are not live.</strong> Continuing records qualified purchase interest only. It creates no Checkout Session, charge, entitlement, revenue, or obligation to buy later.</p>";
  const body = `<p>Candidate price: <strong>${escapeHtml(formatPrice(offer))} per month</strong>.</p><p>${escapeHtml(String(offer["promise"] ?? ""))}</p><h2>Included</h2><ul>${included}</ul><h2>Excluded</h2><ul>${excluded}</ul>${modeNotice}<form method="post" action="/membership/checkout"><input type="hidden" name="session" value="${escapeHtml(token)}"><input type="hidden" name="productDigest" value="${escapeHtml(invitation.productDigest)}"><label><input type="checkbox" name="checkoutIntentConfirmed" value="yes" required> I affirmatively request ${readiness.liveReady ? "the hosted checkout" : "a no-charge record of my purchase interest"} for this exact offer.</label><button type="submit">${readiness.liveReady ? "Continue to secure checkout" : "Record purchase interest — no charge"}</button></form>`;
  return { status: 200, headers: secureHeaders, body: page("Turntide Islands Knowledge Vault", body) };
}

const secureHeaders = Object.freeze({ "content-type": "text/html; charset=utf-8", "cache-control": "no-store, max-age=0", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff" });
function unavailablePage(status = 404): VaultCheckoutHttpResponse { return { status, headers: secureHeaders, body: page("Checkout invitation unavailable", "<p>This private invitation is invalid, expired, changed, or already used. Invoke /vault again for a fresh invitation.</p>") }; }
function refusedPage(status: number, message: string): VaultCheckoutHttpResponse { return { status, headers: secureHeaders, body: page("Checkout refused", `<p>${escapeHtml(message)}</p>`) }; }
function page(title: string, body: string): string { return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(title)}</title><style>body{font:16px system-ui;max-width:48rem;margin:2rem auto;padding:0 1rem;line-height:1.5}label{display:block;margin:1rem 0}input[type=checkbox]{width:auto}button{padding:.8rem 1.2rem}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f4f4f4;padding:1rem}</style></head><body><h1>${escapeHtml(title)}</h1>${body}</body></html>`; }
function escapeHtml(value: string): string { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;"); }
function uniqueField(params: URLSearchParams, name: string): string | undefined { const values = params.getAll(name); return values.length === 1 && values[0] !== "" ? values[0] : undefined; }
function snowflake(value: string): boolean { return /^\d{5,30}$/u.test(value); }
function asRecord(value: unknown): Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function stringArray(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function candidatePrice(product: Record<string, unknown>) { const offer = asRecord(product["offer"]); return { currency: offer["currency"], unitAmount: offer["candidateUnitAmount"], billingPeriod: offer["billingPeriod"] }; }
function formatPrice(offer: Record<string, unknown>): string { const amount = Number(offer["candidateUnitAmount"]); return `${String(offer["currency"] ?? "USD")} ${(amount / 100).toFixed(2)}`; }
