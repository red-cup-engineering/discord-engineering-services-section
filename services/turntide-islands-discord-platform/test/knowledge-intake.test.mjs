import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { inspectKnowledgeOfferSession, issueKnowledgeOfferSession } from "../src/turntide-software-system/knowledge-broker.mjs";
import { knowledgeIntakeHttpResponse, loadEffectiveKnowledgeTerms, recoverClaimedKnowledgeContributionCandidates, submitKnowledgeContributionCandidate } from "../src/turntide-software-system/knowledge-intake.mjs";
import { route } from "../src/turntide-software-system/serve.mjs";

const termsId = "tti-knowledge-contribution-terms-effective-test-01";

async function fixture(now = new Date("2026-07-21T20:00:00.000Z")) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "tti-knowledge-intake-"));
  const config = {
    brokerBotId: "broker",
    intakeBaseUrl: "https://tti.example/",
    sessionsFile: path.join(directory, "sessions.jsonl"),
    candidatesFile: path.join(directory, "candidates.jsonl"),
    termsFile: path.join(directory, "terms.json"),
    admissionFile: path.join(directory, "admission.json"),
    ttlMinutes: 30,
    effectiveTermsId: termsId,
    marketAdmissionId: "tti-knowledge-market-pilot-admission-test",
  };
  await writeFile(config.termsFile, JSON.stringify({
    type: "TTIKnowledgeContributionTerms", id: termsId, status: "effective", operator: "Turntide Islands",
    plainLanguageNotice: ["Discord messages are not contributions.", "Direct candidates remain pending admission."],
    requiredConsent: ["adult capacity", "selected license", "affirmative submission"],
  }), { mode: 0o600 });
  await writeFile(config.admissionFile, JSON.stringify({
    type: "TTIKnowledgeMarketActivationAdmission", status: "admitted", id: config.marketAdmissionId,
    scope: "broker-mention-and-direct-candidate-pilot-no-sale", termsId, intakeOrigin: "https://tti.example", expiresAt: "2099-01-01T00:00:00.000Z",
    checks: ["qualified-legal-review", "adult-capacity-and-minor-exclusion", "privacy-and-security-review", "discord-developer-policy-review", "production-https-and-query-log-suppression", "pilot-stop-and-incident-law"].map((id) => ({ id, status: "passed", evidenceId: `evidence:${id}` })),
  }), { mode: 0o600 });
  const event = {
    type: "TTIKnowledgeBrokerMention", guildId: "guild-1", channelId: "channel-1", messageId: "message-1",
    authorId: "human-1", authorBot: false, mentionedUserIds: ["broker"], observedAt: now.toISOString(), discordMessageContentImported: false,
  };
  const token = "opaque-intake-session-token-00000001";
  const terms = await loadEffectiveKnowledgeTerms(config);
  await issueKnowledgeOfferSession(event, { ...config, effectiveTermsDigest: terms.documentDigest }, { now, token });
  return { directory, config, token };
}

function validForm(token, overrides = {}) {
  const fields = {
    session: token,
    knowledge: "In this town, spring clay soil stays wet long enough that raised rows protect young bean roots from rot.",
    subject: "local bean gardening",
    geographicContext: "example-town",
    temporalContext: "late spring",
    licenseScope: "union-licensed-pseudonymous",
    attribution: "",
    termsId,
    adultCapacityAttested: "yes",
    thirdPartyRightsAttested: "yes",
    noSensitiveDataAttested: "yes",
    knowledgeOwnWordsAttested: "yes",
    termsAccepted: "yes",
    ...overrides,
  };
  return new URLSearchParams(fields).toString();
}

test("GET renders exact effective terms without consuming the offer session", async () => {
  const { directory, config, token } = await fixture();
  try {
    const input = { method: "GET", url: new URL(`https://tti.example/knowledge/contribute?session=${token}`), config, now: new Date("2026-07-21T20:05:00.000Z") };
    const first = await knowledgeIntakeHttpResponse(input);
    const second = await knowledgeIntakeHttpResponse(input);
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.match(first.body, /pending contribution candidate/u);
    assert.match(first.body, new RegExp(termsId, "u"));
    assert.equal(first.headers["cache-control"], "no-store, max-age=0");
    assert.match(first.headers["content-security-policy"], /form-action 'self'/u);
    assert.equal((await inspectKnowledgeOfferSession(token, config.sessionsFile, { now: input.now })).accepted, true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("invalid POST preserves the session; valid POST records one pending candidate and consumes once", async () => {
  const { directory, config, token } = await fixture();
  try {
    const now = new Date("2026-07-21T20:06:00.000Z");
    const invalid = await submitKnowledgeContributionCandidate(validForm(token, { adultCapacityAttested: "" }), config, { now });
    assert.equal(invalid.accepted, false);
    assert.equal(invalid.status, 400);
    assert.equal((await inspectKnowledgeOfferSession(token, config.sessionsFile, { now })).accepted, true);

    const accepted = await submitKnowledgeContributionCandidate(validForm(token), config, { now });
    assert.equal(accepted.accepted, true);
    assert.equal(accepted.candidate.status, "pending-admission");
    assert.equal(accepted.candidate.legalEffect, "candidate-only-no-admission-license-sale-credit-or-revenue");
    assert.equal(accepted.candidate.privateDiscordIdentityLink.userId, "human-1");
    assert.equal(accepted.candidate.discordContentImported, false);
    const inbox = await readFile(config.candidatesFile, "utf8");
    assert.doesNotMatch(inbox, new RegExp(token, "u"));
    assert.match(inbox, /pending-admission/u);
    assert.equal((await inspectKnowledgeOfferSession(token, config.sessionsFile, { now })).reason, "session-already-consumed");
    const repeated = await submitKnowledgeContributionCandidate(validForm(token), config, { now });
    assert.equal(repeated.status, 409);
    await rm(config.candidatesFile, { force: true });
    const recovery = await recoverClaimedKnowledgeContributionCandidates(config);
    assert.deepEqual(recovery.recoveredCandidateIds, [accepted.candidate.id]);
    assert.deepEqual((await recoverClaimedKnowledgeContributionCandidates(config)).recoveredCandidateIds, []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("identity injection, duplicate fields, oversized bodies, and draft terms fail closed", async () => {
  const { directory, config, token } = await fixture();
  try {
    const now = new Date("2026-07-21T20:07:00.000Z");
    const injected = `${validForm(token)}&contributorAccount=urn%3Aattacker&subject=duplicate`;
    const refusal = await submitKnowledgeContributionCandidate(injected, config, { now });
    assert.equal(refusal.status, 400);
    assert.ok(refusal.errors.includes("unknown-field:contributorAccount"));
    assert.ok(refusal.errors.includes("duplicate-field:subject"));
    const oversized = await submitKnowledgeContributionCandidate(`session=${token}&knowledge=${"x".repeat(70_000)}`, config, { now });
    assert.equal(oversized.status, 413);
    assert.equal((await inspectKnowledgeOfferSession(token, config.sessionsFile, { now })).accepted, true);
    await writeFile(config.termsFile, JSON.stringify({ type: "TTIKnowledgeContributionTerms", id: termsId, status: "effective", operator: "Turntide Islands", plainLanguageNotice: ["mutated under same ID"], requiredConsent: ["same ID is not enough"] }));
    const changedTerms = await submitKnowledgeContributionCandidate(validForm(token), config, { now });
    assert.equal(changedTerms.status, 400);
    assert.ok(changedTerms.errors.includes("exact-effective-terms-not-bound"));
    await writeFile(config.termsFile, JSON.stringify({ type: "TTIKnowledgeContributionTerms", id: termsId, status: "draft", operator: "Turntide Islands", plainLanguageNotice: ["draft"], requiredConsent: ["draft"] }));
    await assert.rejects(() => loadEffectiveKnowledgeTerms(config), /not effective/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("HTTP route serves an enabled valid session but exposes no intake while disabled", async () => {
  const { directory, config, token } = await fixture(new Date());
  try {
    const makeResponse = () => ({
      status: 0, headers: {}, body: "",
      writeHead(status, headers) { this.status = status; this.headers = headers; },
      end(body = "") { this.body = String(body); },
    });
    const request = { method: "GET", url: `/knowledge/contribute?session=${token}`, headers: {}, async *[Symbol.asyncIterator]() {} };
    const enabledResponse = makeResponse();
    await route(request, enabledResponse, {
      TTI_KNOWLEDGE_BROKER_ENABLED: "true",
      TTI_KNOWLEDGE_INTAKE_BASE_URL: config.intakeBaseUrl,
      TTI_KNOWLEDGE_EFFECTIVE_TERMS_ID: config.effectiveTermsId,
      TTI_KNOWLEDGE_BROKER_SESSIONS_FILE: config.sessionsFile,
      TTI_KNOWLEDGE_CONTRIBUTION_CANDIDATES_FILE: config.candidatesFile,
      TTI_KNOWLEDGE_TERMS_FILE: config.termsFile,
      TTI_KNOWLEDGE_MARKET_ADMISSION_FILE: config.admissionFile,
    });
    assert.equal(enabledResponse.status, 200);
    assert.match(enabledResponse.body, /Offer knowledge to Turntide Islands/u);
    const disabledResponse = makeResponse();
    await route(request, disabledResponse, {});
    assert.equal(disabledResponse.status, 404);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
