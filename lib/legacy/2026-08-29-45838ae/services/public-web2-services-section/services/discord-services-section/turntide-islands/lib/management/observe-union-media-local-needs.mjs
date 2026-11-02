#!/usr/bin/env node

import { lookup } from "node:dns/promises";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EMPTY_WITNESS_ROOT, identifyJsonSemanticContent } from "@red-cup-engineering/semantic-content-identify-service";
const semanticId = (value) => identifyJsonSemanticContent({ objectKind: "turntide-islands.record", value, witnessRoot: EMPTY_WITNESS_ROOT }).token;
import { createSettlementStore } from "@red-cup-engineering/settlement-record-store-service";
import { turntideWitnessJournalBindingFromEnvironment } from "./settlement-witness-journal-binding.mjs";
import { deriveUnionMediaLocalNeedsPolicy, UNION_MEDIA_PRODUCT_PATH } from "./union-media-syndication.mjs";

const TTI_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SOLICITATION_PATH = join(TTI_ROOT, "content/solicitations/union-media-activitypub-and-hosting.json");
const RESOURCE_DESK = "urn:ame:turntide-islands:resource-desk";
const ORIGIN_HOST = "turntide-islands.561.group";
const PRIVACY = "NO-PERSONAL-DISCORD-CONTENT-OR-CREDENTIALS";

export const UNION_MEDIA_BUSINESS_EVIDENCE_CATEGORY = "tti-union-media-business-evidence-v1";
export const UNION_MEDIA_RESOURCE_NEED_CATEGORY = "tti-union-media-resource-need-observation-v1";
export const UNION_MEDIA_LOCAL_NEEDS_POLICY_CATEGORY = "tti-union-media-local-needs-policy-v3";

function addressed(body) { return Object.freeze({ ...body, id: semanticId(body) }); }
function after(at, milliseconds) { return new Date(new Date(at).getTime() + milliseconds).toISOString(); }

export function formUnionMediaCurrentOperationsNeed(input) {
  const { product, solicitation, publicOriginProbe, recordedAt } = input ?? {};
  if (!Number.isFinite(Date.parse(recordedAt))) throw new TypeError("current-needs observation requires an exact recordedAt instant");
  if (product?.id !== "tti-union-media-syndication-2026-01" || !String(product?.launchExperiment?.status ?? "").startsWith("live-")) throw new TypeError("Union Media qualified-demand experiment is not live");
  const exactLotIds = ["custody-clean-activitypub-carrier", "tti-signed-agent-card-and-public-jwks", "tti-public-https-activitypub-host"];
  if (solicitation?.customer !== "urn:ame:turntide-islands" || solicitation?.productId !== product.id || !Array.isArray(solicitation?.lots) || JSON.stringify(solicitation.lots.map((lot) => lot?.id)) !== JSON.stringify(exactLotIds)) throw new TypeError("Union Media boundary solicitation is not the exact TTI three-lot procurement");
  if (publicOriginProbe?.host !== ORIGIN_HOST || !["resolvable", "unresolvable"].includes(publicOriginProbe?.status)) throw new TypeError("public-origin probe is absent or malformed");
  if (!/^(?:dns-(?:enotfound|enodata)|dns-address-family-[46])$/u.test(publicOriginProbe?.evidence ?? "")) throw new TypeError("public-origin probe evidence is not an admitted bounded result");
  if (product?.advertiserBoundary?.liveStatus === undefined || !String(product.advertiserBoundary.liveStatus).includes("awaiting-executable-accepted-carrier-public-host")) throw new TypeError("Union Media advertiser ingress is not evidenced as carrier-and-host blocked");

  const expiresAt = after(recordedAt, 75 * 60_000);
  const evidence = addressed({
    type: "TTIUnionMediaQualifiedDemandExperimentEvidence",
    version: 1,
    recordedAt,
    expiresAt,
    productId: product.id,
    experimentId: product.launchExperiment.id,
    experimentStatus: product.launchExperiment.status,
    demandInference: product.measurement?.latestAdvertiserDiscoverySnapshot?.inference ?? "unknown",
    discoverySnapshotId: product.measurement?.latestAdvertiserDiscoverySnapshot?.receipt ?? null,
    publicOrigin: `https://${ORIGIN_HOST}/`,
    publicOriginStatus: publicOriginProbe.status,
    publicOriginEvidence: publicOriginProbe.evidence,
    advertiserIngressStatus: product.advertiserBoundary.liveStatus,
    serviceSolicitationId: solicitation.id,
    serviceLotIds: solicitation.lots.map((lot) => lot.id),
    acceptedProviderCount: product.infrastructureProviderBoundary?.currentAcceptedProviders ?? null,
    privacyAttestation: PRIVACY,
    economicEffect: "current-qualified-demand-experiment-evidence-only-no-bid-award-transfer-publication-revenue-or-profit",
  });
  const observation = addressed({
    type: "TTIUnionMediaResourceNeedObservation",
    version: 1,
    issuer: RESOURCE_DESK,
    evaluator: RESOURCE_DESK,
    recordedAt,
    validThrough: expiresAt,
    resourceClass: "operations",
    basis: "TTI's live Union Media demand experiment cannot admit external placement requests or sealed bids until a public signed-message carrier, signed Agent Card and JWKS, and HTTPS origin are accepted.",
    bindingConstraint: "No accepted provider currently exposes the authenticated advertiser ingress required to test demand and acquire a winning agent resource.",
    nextProfitableAct: "Open authenticated placement and bid ingress to Union enterprises for the live demand experiment.",
    unit: "accepted-carrier-origin-hour",
    minimumUsableQuantity: 1,
    maximumUsefulQuantity: 1,
    businessImpactClass: "ENABLES_QUALIFIED_DEMAND_EXPERIMENT",
    businessEvidence: { type: "qualified-demand-experiment", evidenceId: evidence.id, experimentId: product.launchExperiment.id, expiresAt },
    privacyAttestation: PRIVACY,
  });
  return Object.freeze({ evidence, observation });
}

export async function probeUnionMediaPublicOrigin(options = {}) {
  const host = options.host ?? ORIGIN_HOST;
  try {
    const answer = await (options.lookup ?? lookup)(host);
    return Object.freeze({ host, status: "resolvable", evidence: `dns-address-family-${answer.family}` });
  } catch (error) {
    if (!["ENOTFOUND", "ENODATA"].includes(error?.code)) throw error;
    return Object.freeze({ host, status: "unresolvable", evidence: `dns-${String(error.code).toLowerCase()}` });
  }
}

export async function observeUnionMediaLocalNeeds(options = {}) {
  const recordedAt = options.recordedAt ?? new Date().toISOString();
  const product = options.product ?? JSON.parse(await readFile(options.productPath ?? UNION_MEDIA_PRODUCT_PATH, "utf8"));
  const solicitation = options.solicitation ?? JSON.parse(await readFile(options.solicitationPath ?? SOLICITATION_PATH, "utf8"));
  const publicOriginProbe = options.publicOriginProbe ?? await probeUnionMediaPublicOrigin(options);
  const witnessJournal = options.witnessJournal ?? turntideWitnessJournalBindingFromEnvironment();
  const store = options.store ?? createSettlementStore({ settlementRoot: TTI_ROOT, agentUrl: options.witnessJournalAgentUrl, ...(witnessJournal ?? {}) });
  const { evidence, observation } = formUnionMediaCurrentOperationsNeed({ product, solicitation, publicOriginProbe, recordedAt });

  await store.record({ category: UNION_MEDIA_BUSINESS_EVIDENCE_CATEGORY, recordedAt, record: evidence, assertions: [
    { subject: evidence.id, predicate: "urn:emsenn:venture:evidences-experiment", object: { kind: "literal", value: product.launchExperiment.id } },
  ] });
  const observedEvidenceIds = store.records(UNION_MEDIA_BUSINESS_EVIDENCE_CATEGORY).map((record) => record?.id).filter(Boolean);
  if (!observedEvidenceIds.includes(evidence.id)) throw new Error("Union Media business evidence was not independently read back from TTI's settlement store");

  await store.record({ category: UNION_MEDIA_RESOURCE_NEED_CATEGORY, recordedAt, record: observation, assertions: [
    { subject: observation.id, predicate: "urn:emsenn:venture:needs-resource-class", object: { kind: "literal", value: observation.resourceClass } },
    { subject: observation.id, predicate: "urn:emsenn:venture:uses-business-evidence", object: { kind: "iri", value: evidence.id } },
  ] });
  const observedObservations = store.records(UNION_MEDIA_RESOURCE_NEED_CATEGORY);
  const observedObservationIds = observedObservations.map((record) => record?.id).filter(Boolean);
  if (!observedObservationIds.includes(observation.id)) throw new Error("Union Media resource observation was not independently read back from TTI's settlement store");

  const policy = deriveUnionMediaLocalNeedsPolicy([observation], {
    recordedAt,
    validThrough: after(recordedAt, 60 * 60_000),
    economicObjective: "Acquire the boundary operation that opens authenticated Union Media demand and bidding at the lowest attributable integration cost",
  }, {
    authorizedPolicyIssuer: RESOURCE_DESK,
    authorizedEvaluator: RESOURCE_DESK,
    observedObservationIds,
    observedBusinessEvidenceIds: observedEvidenceIds,
    now: new Date(recordedAt),
  });
  if (policy.type !== "TTIUnionMediaLocalNeedsPolicy") throw new Error(`Union Media local-needs policy refused: ${policy.reasons?.join(", ")}`);
  await store.record({ category: UNION_MEDIA_LOCAL_NEEDS_POLICY_CATEGORY, recordedAt, record: policy, assertions: [
    { subject: policy.id, predicate: "urn:emsenn:venture:freezes-enterprise-state", object: { kind: "iri", value: policy.enterpriseStateEvidence } },
  ] });
  if (!store.records(UNION_MEDIA_LOCAL_NEEDS_POLICY_CATEGORY).some((record) => record?.id === policy.id)) throw new Error("Union Media local-needs policy was not independently read back from TTI's settlement store");
  return Object.freeze({ type: "TTIUnionMediaLocalNeedsObservationReceipt", version: 1, recordedAt, evidenceId: evidence.id, observationId: observation.id, policyId: policy.id, policyValidThrough: policy.validThrough, resourceClass: observation.resourceClass, unit: observation.unit, minimumUsableQuantity: observation.minimumUsableQuantity, maximumUsefulQuantity: observation.maximumUsefulQuantity, publicOriginStatus: evidence.publicOriginStatus, bindingConstraint: observation.bindingConstraint, nextProfitableAct: observation.nextProfitableAct, monetaryClaim: false, cashRevenueRecognized: false, monetaryProfitRecognized: false });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await observeUnionMediaLocalNeeds({ witnessJournalAgentUrl: process.env.WITNESS_JOURNAL_RDF_AGENT });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
