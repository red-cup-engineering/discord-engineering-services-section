import { appendFile, mkdir, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { identifyTurntideDiscordPlatformRecord as semanticId } from "./discord-platform-record-semantic-content.mjs";
import {
  consumeKnowledgeOfferSession,
  inspectKnowledgeOfferSession,

} from "./knowledge-broker.mjs";
import { sha256Base64Url } from "@red-cup-engineering/cryptographic-computer-data-engineering-services-section/integrity";

const MAX_FORM_BYTES = 64 * 1024;
const LICENSE_SCOPES = new Set(["community-memory", "union-licensed-pseudonymous", "union-licensed-attributed"]);
const FORM_FIELDS = new Set([
  "session", "knowledge", "subject", "geographicContext", "temporalContext", "licenseScope", "attribution", "termsId",
  "adultCapacityAttested", "thirdPartyRightsAttested", "noSensitiveDataAttested", "knowledgeOwnWordsAttested", "termsAccepted",
]);

export async function loadEffectiveKnowledgeTerms(config) {
  const source = await readFile(config.termsFile, "utf8");
  const raw = JSON.parse(source);
  if (raw["type"] !== "TTIKnowledgeContributionTerms" || raw["id"] !== config.effectiveTermsId || raw["status"] !== "effective") {
    throw new Error("configured knowledge-contribution terms are absent, mismatched, or not effective");
  }
  const notices = Array.isArray(raw["plainLanguageNotice"]) ? raw["plainLanguageNotice"].filter((value) => typeof value === "string") : [];
  const requiredConsent = Array.isArray(raw["requiredConsent"]) ? raw["requiredConsent"].filter((value) => typeof value === "string") : [];
  const operator = typeof raw["operator"] === "string" ? raw["operator"] : "";
  if (notices.length === 0 || requiredConsent.length === 0 || operator === "") throw new Error("effective knowledge-contribution terms are structurally incomplete");
  const documentDigest = `sha256:${sha256Base64Url(source)}`;
  return { type: "TTIKnowledgeContributionTerms", id: config.effectiveTermsId, status: "effective", operator, plainLanguageNotice: notices, requiredConsent, documentDigest };
}

function checked(params, name) {
  return ["yes", "true", "on", "accepted"].includes(params.get(name) ?? "");
}

function bounded(params, name, minimum, maximum, errors) {
  const value = (params.get(name) ?? "").trim();
  if (value.length < minimum || value.length > maximum) errors.push(`${name}-length-invalid`);
  return value;
}

export function prepareKnowledgeContributionCandidate(
  params,
  session,
  terms,
  submittedAt = new Date().toISOString(),
) {
  const errors = [];
  for (const key of new Set(params.keys())) {
    if (!FORM_FIELDS.has(key)) errors.push(`unknown-field:${key}`);
    if (params.getAll(key).length !== 1) errors.push(`duplicate-field:${key}`);
  }
  const knowledge = bounded(params, "knowledge", 40, 12_000, errors);
  const subject = bounded(params, "subject", 3, 200, errors);
  const geographicContext = bounded(params, "geographicContext", 2, 200, errors);
  const temporalContextValue = (params.get("temporalContext") ?? "").trim();
  if (temporalContextValue.length > 200) errors.push("temporalContext-length-invalid");
  const licenseScope = params.get("licenseScope") ?? "";
  if (!LICENSE_SCOPES.has(licenseScope)) errors.push("license-scope-invalid");
  let attribution = (params.get("attribution") ?? "").trim();
  if (licenseScope === "union-licensed-attributed" && (attribution.length < 2 || attribution.length > 200)) errors.push("attribution-required-for-attributed-scope");
  if (licenseScope === "union-licensed-pseudonymous") attribution = "pseudonymous";
  if (licenseScope === "community-memory") attribution = "private-community-memory";
  if (params.get("termsId") !== terms.id || session.termsId !== terms.id || session.termsDigest !== terms.documentDigest) errors.push("exact-effective-terms-not-bound");
  if (!checked(params, "adultCapacityAttested")) errors.push("adult-capacity-attestation-required");
  if (!checked(params, "thirdPartyRightsAttested")) errors.push("third-party-rights-attestation-required");
  if (!checked(params, "noSensitiveDataAttested")) errors.push("sensitive-data-attestation-required");
  if (!checked(params, "knowledgeOwnWordsAttested")) errors.push("own-knowledge-attestation-required");
  if (!checked(params, "termsAccepted")) errors.push("affirmative-terms-acceptance-required");
  if (!Number.isFinite(Date.parse(submittedAt))) errors.push("consent-instant-invalid");
  if (errors.length > 0) return { accepted: false, errors };
  const body = {
    type: "TTIKnowledgeContributionCandidate",
    version: 1,
    status: "pending-admission",
    sourceProtocol: "tti-direct-intake-v1",
    contributorAccount: `urn:tti:contributor:discord:${session.discord.authorId}`,
    privateDiscordIdentityLink: { userId: session.discord.authorId, guildId: session.discord.guildId, channelId: session.discord.channelId, messageId: session.discord.messageId },
    offerSessionDigest: session.tokenDigest,
    discordContentImported: false,
    knowledge,
    subject,
    geographicContext,
    temporalContext: temporalContextValue === "" ? null : temporalContextValue,
    licenseScope,
    attribution,
    adultCapacityAttested: true,
    thirdPartyRightsAttested: true,
    noSensitiveDataAttested: true,
    knowledgeOwnWordsAttested: true,
    sensitiveClasses: [],
    termsId: terms.id,
    termsDigest: terms.documentDigest,
    marketAdmissionId: session.marketAdmissionId,
    consentedAt: submittedAt,
    legalEffect: "candidate-only-no-admission-license-sale-credit-or-revenue",
  };
  return { accepted: true, candidate: { ...body, id: semanticId(body) } };
}

async function appendCandidate(file, candidate) {
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, `${JSON.stringify(candidate)}\n`, { encoding: "utf8", mode: 0o600 });
}

export async function recoverClaimedKnowledgeContributionCandidates(config) {
  const claimsDirectory = `${config.sessionsFile}.claims`;
  const claimFiles = await readdir(claimsDirectory).catch((error) => error.code === "ENOENT" ? [] : Promise.reject(error));
  const inboxText = await readFile(config.candidatesFile, "utf8").catch((error) => error.code === "ENOENT" ? "" : Promise.reject(error));
  const sessionsText = await readFile(config.sessionsFile, "utf8").catch((error) => error.code === "ENOENT" ? "" : Promise.reject(error));
  const existingIds = new Set(inboxText.split(/\r?\n/u).filter(Boolean).map((line) => (JSON.parse(line))["id"]).filter((value) => typeof value === "string"));
  const consumedDigests = new Set(sessionsText.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line)).filter((row) => row["type"] === "TTIKnowledgeOfferSessionConsumption").map((row) => row["tokenDigest"]).filter((value) => typeof value === "string"));
  const recoveredCandidateIds = [];
  const recoveredConsumptionDigests = [];
  for (const file of claimFiles.sort()) {
    const claim = JSON.parse(await readFile(path.join(claimsDirectory, file), "utf8"));
    const payload = claim["claimPayload"];
    const digest = typeof claim["tokenDigest"] === "string" ? claim["tokenDigest"] : undefined;
    if (digest !== undefined && !consumedDigests.has(digest)) {
      const identity = payload?.["privateDiscordIdentityLink"];
      await appendFile(config.sessionsFile, `${JSON.stringify({ type: "TTIKnowledgeOfferSessionConsumption", version: 1, tokenDigest: digest, consumedAt: claim["claimedAt"], sourceMessageId: identity?.["messageId"] ?? null, recoveredFromClaim: true })}\n`, { encoding: "utf8", mode: 0o600 });
      consumedDigests.add(digest);
      recoveredConsumptionDigests.push(digest);
    }
    if (payload?.["type"] !== "TTIKnowledgeContributionCandidate" || typeof payload["id"] !== "string" || existingIds.has(payload["id"])) continue;
    await appendCandidate(config.candidatesFile, payload);
    existingIds.add(payload["id"]);
    recoveredCandidateIds.push(payload["id"]);
  }
  return { recoveredCandidateIds, recoveredConsumptionDigests };
}

export async function submitKnowledgeContributionCandidate(
  formBody,
  config,
  options = {},
) {
  if (Buffer.byteLength(formBody, "utf8") > MAX_FORM_BYTES) return { accepted: false, status: 413, errors: ["form-body-too-large"] };
  const params = new URLSearchParams(formBody);
  const token = params.get("session") ?? "";
  if (token.length < 16 || token.length > 200) return { accepted: false, status: 404, errors: ["offer-session-unavailable"] };
  const now = options.now ?? new Date();
  const [terms, inspection] = await Promise.all([
    loadEffectiveKnowledgeTerms(config),
    inspectKnowledgeOfferSession(token, config.sessionsFile, { now }),
  ]);
  if (!inspection.accepted || inspection.session === undefined) {
    const status = inspection.reason === "session-already-consumed" ? 409 : 404;
    return { accepted: false, status, errors: ["offer-session-unavailable"] };
  }
  const prepared = prepareKnowledgeContributionCandidate(params, inspection.session, terms, now.toISOString());
  if (!prepared.accepted) return { accepted: false, status: 400, errors: prepared.errors };
  const consumption = await consumeKnowledgeOfferSession(token, config.sessionsFile, { now, claimPayload: prepared.candidate });
  if (!consumption.accepted) return { accepted: false, status: 409, errors: ["offer-session-unavailable"] };
  await appendCandidate(config.candidatesFile, prepared.candidate);
  return { accepted: true, candidate: prepared.candidate };
}

const secureHeaders = Object.freeze({
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store, max-age=0",
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
});

function escapeHtml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function page(title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(title)}</title><style>body{font:16px system-ui;max-width:48rem;margin:2rem auto;padding:0 1rem;line-height:1.5}label{display:block;margin:1rem 0}textarea,input,select{box-sizing:border-box;width:100%;padding:.6rem}input[type=checkbox]{width:auto}fieldset{margin:1rem 0}button{padding:.8rem 1.2rem}</style></head><body><h1>${escapeHtml(title)}</h1>${body}</body></html>`;
}

function unavailableResponse(status = 404) {
  return { status, headers: secureHeaders, body: page("Contribution session unavailable", "<p>This private offer session is invalid, expired, or already used. Mention the TTI Knowledge Broker again to request a fresh offer.</p>") };
}

export async function knowledgeIntakeHttpResponse(input

) {
  if (input.method === "GET") {
    const token = input.url.searchParams.get("session") ?? "";
    if (token.length < 16 || token.length > 200) return unavailableResponse();
    const now = input.now ?? new Date();
    const [terms, inspection] = await Promise.all([loadEffectiveKnowledgeTerms(input.config), inspectKnowledgeOfferSession(token, input.config.sessionsFile, { now })]);
    if (!inspection.accepted) return unavailableResponse();
    const notices = terms.plainLanguageNotice.map((notice) => `<li>${escapeHtml(notice)}</li>`).join("");
    const body = `<p>This form creates a <strong>pending contribution candidate</strong>. Submission is not admission, a sale, payment, credit, or revenue.</p><ul>${notices}</ul><form method="post" action="/knowledge/contribute"><input type="hidden" name="session" value="${escapeHtml(token)}"><input type="hidden" name="termsId" value="${escapeHtml(terms.id)}"><label>Knowledge in your own words<textarea name="knowledge" minlength="40" maxlength="12000" required></textarea></label><label>Subject<input name="subject" minlength="3" maxlength="200" required></label><label>Geographic context<input name="geographicContext" minlength="2" maxlength="200" required></label><label>Temporal context (optional)<input name="temporalContext" maxlength="200"></label><label>License scope<select name="licenseScope" required><option value="community-memory">Community memory — no resale</option><option value="union-licensed-pseudonymous">Union licensed — pseudonymous</option><option value="union-licensed-attributed">Union licensed — attributed</option></select></label><label>Chosen attribution (required only for attributed scope)<input name="attribution" maxlength="200"></label><fieldset><legend>Required attestations</legend><label><input type="checkbox" name="adultCapacityAttested" value="yes" required> I am an adult with capacity to make this agreement.</label><label><input type="checkbox" name="knowledgeOwnWordsAttested" value="yes" required> This is my knowledge in my own words, not copied from another Discord user.</label><label><input type="checkbox" name="thirdPartyRightsAttested" value="yes" required> I have authority to grant the selected rights and included no unauthorized third-party material.</label><label><input type="checkbox" name="noSensitiveDataAttested" value="yes" required> I included no protected health/financial data, precise vulnerable-person location, credentials, secrets, or unauthorized personal data.</label><label><input type="checkbox" name="termsAccepted" value="yes" required> I affirmatively accept terms ${escapeHtml(terms.id)} and request admission under the selected scope.</label></fieldset><button type="submit">Submit candidate to TTI</button></form>`;
    return { status: 200, headers: secureHeaders, body: page("Offer knowledge to Turntide Islands", body) };
  }
  if (input.method === "POST") {
    if (!(input.contentType ?? "").toLowerCase().startsWith("application/x-www-form-urlencoded")) {
      return { status: 415, headers: secureHeaders, body: page("Unsupported submission", "<p>The intake accepts only its own encoded form.</p>") };
    }
    const result = await submitKnowledgeContributionCandidate(input.body ?? "", input.config, { now: input.now });
    if (!result.accepted) {
      if (result.status === 404 || result.status === 409) return unavailableResponse(result.status);
      const errors = result.errors.map((error) => `<li>${escapeHtml(error)}</li>`).join("");
      return { status: result.status, headers: secureHeaders, body: page("Contribution candidate refused", `<p>No contribution was recorded and the session remains available unless it expired.</p><ul>${errors}</ul>`) };
    }
    return { status: 202, headers: secureHeaders, body: page("Contribution candidate received", `<p>Candidate <code>${escapeHtml(result.candidate.id)}</code> is pending TTI admission. No license, sale, credit, payment, or revenue exists unless later admission and settlement records say so.</p>`), candidate: result.candidate };
  }
  return { status: 405, headers: { ...secureHeaders, allow: "GET, POST" }, body: page("Method not allowed", "<p>Use the private contribution link or its form.</p>") };
}
