import { readFileSync } from "node:fs";
import { admitJsonSemanticContent } from "@red-cup-engineering/relation-model-notation-runtime/semantic-content-identity";
import { EMPTY_WITNESS_ROOT, identifyJsonSemanticContent } from "@red-cup-engineering/relation-model-notation-runtime/semantic-content-identity";
import { identifyTurntideDiscordPlatformRecord as semanticId } from "./discord-platform-record-semantic-content.mts";
// Objects that cross the boundary into @causeway-services/turntide-union-media-syndication-service (the placement
// request itself, and the TTIUnionMediaPlacementRequestAdmission it produces/records) are self-addressed under
// that service's own "turntide-islands.record" objectKind, not this app's "turntide-islands.discord-platform-record"
// convention -- the two are different semantic-identity namespaces and must not be conflated.
const unionMediaSemanticId = (value: unknown): string => identifyJsonSemanticContent({ objectKind: "turntide-islands.record", value, witnessRoot: EMPTY_WITNESS_ROOT }).token;
import { type SettlementWitness } from "./settlement-witness.mts";
// @ts-expect-error This TTI-root management die is canonical JavaScript and intentionally remains outside the app compiler root.
import { admitUnionMediaPlacementRequest, UNION_MEDIA_PLACEMENT_INGRESS_CONTRACT } from "@causeway-services/turntide-union-media-syndication-service";
import { publicTurntideContentPath } from "./env.mts";
import { UNION_MEDIA_DESTINATION_PROOF_CATEGORY, UNION_MEDIA_INTENT_CONTRACT, UNION_MEDIA_PRODUCT, type UnionMediaDestinationControlAdmission } from "./union-media-intent.mts";
import { UNION_MEDIA_ENTERPRISE_AUTH_CATEGORY, UNION_MEDIA_ENTERPRISE_AUTH_CONTRACT, type UnionMediaEnterpriseAuthenticationAdmission } from "./union-media-enterprise-authentication.mts";

export const UNION_MEDIA_PLACEMENT_REQUEST_CATEGORY = "tti-union-media-placement-request-admission-v1";
export const UNION_MEDIA_PLACEMENT_REQUEST_CONTRACT = UNION_MEDIA_PLACEMENT_INGRESS_CONTRACT as string;
export const ACTIVITYSTREAMS_CONTEXT = "https://www.w3.org/ns/activitystreams";
const TTI_ACTOR = "urn:ame:turntide-islands";
const treatyPath = () => publicTurntideContentPath(process.env, "contracts", "union-media-activitypub-treaty.json");
const writeLocks = new Map<string, Promise<unknown>>();

export type UnionMediaPlacementRequestAdmission = Readonly<Record<string, unknown> & { readonly type: "TTIUnionMediaPlacementRequestAdmission"; readonly id: string; readonly requestId: string; readonly authenticationId: string }>;
export type UnionMediaPlacementRequestRefusal = Readonly<Record<string, unknown> & { readonly type: "TTIUnionMediaPlacementRequestRefusal"; readonly reasons: readonly string[] }>;
export interface VerifiedActivityPubRmnCarrier {
  extract(activity: unknown, expected: Readonly<{ expectedActor: string; expectedRecipient: string; expectedAgentCard: string }>): Readonly<{ type: string; objectBytes: Uint8Array }>;
}

export function loadUnionMediaActivityPubTreaty(file = treatyPath()): Record<string, any> { return JSON.parse(readFileSync(file, "utf8")); }

export function unionMediaPlacementRequestFromBytes(bytes: Uint8Array): Record<string, unknown> {
  const value = admitJsonSemanticContent({ bytes, objectKind: "rsc-quiescent.a2a-json" }).value;
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("Union Media ActivityPub value is not one placement request");
  return value as Record<string, unknown>;
}

export async function admitAuthenticatedUnionMediaPlacementRequest(request: Record<string, unknown>, input: Readonly<{ enterprise: string; activityPubActor: string; now?: Date; store: Pick<SettlementWitness, "records"> }>): Promise<UnionMediaPlacementRequestAdmission | UnionMediaPlacementRequestRefusal> {
  const priorByRequest = ((await input.store.records(UNION_MEDIA_PLACEMENT_REQUEST_CATEGORY)) as readonly UnionMediaPlacementRequestAdmission[]).find((row) => row.requestId === request.id);
  if (priorByRequest !== undefined) return unionMediaSelfAddressed(request) && unionMediaSelfAddressed(priorByRequest) && request.advertiser === input.enterprise && request.authenticationId === priorByRequest.authenticationId && priorByRequest.advertiser === input.enterprise && priorByRequest.advertiserActivityPubActor === input.activityPubActor ? priorByRequest : refusal(["placement-exact-replay-body-or-sender-mismatch"]);
  const reasons: string[] = [], authenticationId = String(request.authenticationId ?? "");
  const authentication = ((await input.store.records(UNION_MEDIA_ENTERPRISE_AUTH_CATEGORY)) as readonly UnionMediaEnterpriseAuthenticationAdmission[]).find((row) => row.id === authenticationId);
  if (authentication === undefined) reasons.push("placement-authentication-not-found");
  else if (!selfAddressed(authentication) || authentication.type !== "TTIUnionMediaEnterpriseAuthenticationAdmission" || authentication.contract !== UNION_MEDIA_ENTERPRISE_AUTH_CONTRACT || authentication.status !== "authenticated-for-one-later-placement-request" || authentication.enterprise !== input.enterprise || authentication.scope !== "authenticate-enterprise-and-representative-for-one-later-placement-request" || authentication.placementRequestAdmitted !== false) reasons.push("placement-authentication-invalid-or-enterprise-mismatched");
  if (authentication !== undefined && (typeof authentication.expiresAt !== "string" || (input.now ?? new Date()).getTime() >= Date.parse(authentication.expiresAt))) reasons.push("placement-authentication-expired");
  const proof = authentication === undefined ? undefined : ((await input.store.records(UNION_MEDIA_DESTINATION_PROOF_CATEGORY)) as readonly UnionMediaDestinationControlAdmission[]).find((row) => row.id === authentication.destinationProofId);
  if (proof === undefined) reasons.push("placement-destination-proof-not-found");
  else if (!selfAddressed(proof) || proof.type !== "TTIUnionMediaDestinationControlAdmission" || proof.contract !== UNION_MEDIA_INTENT_CONTRACT || proof.status !== "qualified-destination-controlled-lead" || proof.intentId !== authentication?.intentId || proof.representativePseudonym !== authentication?.representativePseudonym || (proof.declaration as any)?.enterprise !== input.enterprise || (proof.declaration as any)?.destinationControlled !== true) reasons.push("placement-destination-proof-invalid-or-unbound");
  const consumed = ((await input.store.records(UNION_MEDIA_PLACEMENT_REQUEST_CATEGORY)) as readonly UnionMediaPlacementRequestAdmission[]).find((row) => row.authenticationId === authenticationId);
  if (consumed !== undefined) reasons.push("placement-authentication-already-consumed-by-different-request");
  if (reasons.length > 0) return refusal(reasons);
  return admitUnionMediaPlacementRequest(request, { authenticatedActor: input.enterprise, expectedAuthenticationId: authenticationId, expectedDestination: (proof!.declaration as any).destination, destinationProofId: proof!.id, advertiserActivityPubActor: input.activityPubActor, now: input.now }) as UnionMediaPlacementRequestAdmission | UnionMediaPlacementRequestRefusal;
}

export function unionMediaPlacementRequestRecorderFromSettlementWitness(store: SettlementWitness | Pick<SettlementWitness, "records" | "record">) {
  if (typeof store?.records !== "function" || typeof store?.record !== "function") throw new TypeError("Union Media placement request requires TTI settlement-store witness authority");
  return async (admission: UnionMediaPlacementRequestAdmission): Promise<UnionMediaPlacementRequestAdmission> => withAuthenticationLock(admission.authenticationId, async () => {
    if (!unionMediaSelfAddressed(admission) || admission.type !== "TTIUnionMediaPlacementRequestAdmission" || admission.ingressContract !== UNION_MEDIA_PLACEMENT_REQUEST_CONTRACT || admission.authenticationConsumedForOneRequest !== true || admission.creativeApproved !== false) throw new Error("Union Media placement-request admission is invalid or effect-expanded");
    const rows = (await store.records(UNION_MEDIA_PLACEMENT_REQUEST_CATEGORY)) as readonly UnionMediaPlacementRequestAdmission[];
    const sameRequest = rows.find((row) => row.requestId === admission.requestId);
    if (sameRequest !== undefined) { if (sameRequest.id !== admission.id) throw new Error("Union Media placement-request replay conflict"); return sameRequest; }
    const consumed = rows.find((row) => row.authenticationId === admission.authenticationId);
    if (consumed !== undefined) throw new Error("Union Media authentication already consumed by another placement request");
    await store.record({ category: UNION_MEDIA_PLACEMENT_REQUEST_CATEGORY, recordedAt: String(admission.recordedAt), record: admission, assertions: [
      { subject: admission.id, predicate: "urn:emsenn:venture:admitted-union-media-placement-request", object: { kind: "literal", value: "true", datatype: "http://www.w3.org/2001/XMLSchema#boolean" } },
      { subject: admission.authenticationId, predicate: "urn:emsenn:venture:consumed-for-union-media-placement-request", object: { kind: "iri", value: admission.id } },
    ] });
    return admission;
  });
}

export function createUnionMediaPlacementActivityPubCallbacks(input: Readonly<{ origin: string; identifier: string; agentCard: string; senders: Record<string, { actor: string; agentCard: string }>; carrier: VerifiedActivityPubRmnCarrier; store: SettlementWitness | Pick<SettlementWitness, "records" | "record">; now?: () => Date }>) {
  const receiverActor = actorUrl(input.origin, input.identifier), record = unionMediaPlacementRequestRecorderFromSettlementWitness(input.store);
  if (!httpsOrLoopback(receiverActor) || !httpsOrLoopback(input.agentCard) || !input.senders || Object.values(input.senders).some((sender) => !httpsOrLoopback(sender.actor) || !httpsOrLoopback(sender.agentCard)) || typeof input.carrier?.extract !== "function") throw new Error("Union Media ActivityPub face requires exact actor and Agent Card treaties plus one hired verified RMN carrier");
  return Object.freeze({
    async listOutbox() { return Object.freeze({ items: [] }); },
    async onActivity(arrival: Readonly<{ jsonLd: unknown }>) {
      const federated = arrival?.jsonLd as Record<string, unknown> | undefined, treaty = treatyForActor(federated?.actor, input.senders);
      if (treaty === null) throw new Error("verified ActivityPub sender has no TTI Union Media treaty");
      const [enterprise, sender] = treaty;
      const projection = input.carrier.extract(federated, { expectedActor: sender.actor, expectedRecipient: receiverActor, expectedAgentCard: sender.agentCard });
      if (projection.type !== "Create") throw new Error("Union Media placement ingress requires ActivityStreams Create");
      const request = unionMediaPlacementRequestFromBytes(projection.objectBytes);
      const result = await admitAuthenticatedUnionMediaPlacementRequest(request, { enterprise, activityPubActor: sender.actor, now: input.now?.(), store: input.store });
      if (result.type !== "TTIUnionMediaPlacementRequestAdmission") throw new Error(`TTI Union Media placement request refused: ${result.reasons.join(",")}`);
      return record(result);
    },
  });
}

export function validateDeployableUnionMediaActivityPubTreaty(treaty = loadUnionMediaActivityPubTreaty()): Readonly<{ origin: string; identifier: string; agentCard: string; senders: Record<string, { actor: string; agentCard: string }> }> {
  const reasons: string[] = [];
  if (treaty?.type !== "TTIUnionMediaActivityPubTreaty" || treaty?.version !== 1 || treaty?.carrierProvider !== "urn:ame:activitypub-services-section") reasons.push("activitypub-treaty-type-or-provider-invalid");
  if (!httpsOnly(treaty?.origin) || !/^[a-z0-9][a-z0-9._-]*$/u.test(treaty?.identifier ?? "") || !httpsOnly(treaty?.actor) || treaty?.actor !== actorUrl(treaty?.origin, treaty?.identifier) || !httpsOnly(treaty?.agentCard)) reasons.push("activitypub-treaty-receiver-not-public-https");
  const senders = treaty?.senders;
  if (!senders || typeof senders !== "object" || Object.values(senders).some((sender: any) => !httpsOnly(sender?.actor) || !httpsOnly(sender?.agentCard))) reasons.push("activitypub-treaty-sender-identity-incomplete");
  if (reasons.length > 0) throw new Error(reasons.join(","));
  return Object.freeze({ origin: treaty.origin, identifier: treaty.identifier, agentCard: treaty.agentCard, senders: Object.fromEntries(Object.entries(senders).map(([enterprise, sender]: [string, any]) => [enterprise, { actor: sender.actor, agentCard: sender.agentCard }])) });
}

function treatyForActor(actor: unknown, senders: Record<string, { actor: string; agentCard: string }>): readonly [string, { actor: string; agentCard: string }] | null { return Object.entries(senders).find(([, sender]) => sender.actor === actor) ?? null; }
function actorUrl(origin: string, identifier: string): string { return new URL(`/actors/${identifier}`, new URL(origin)).href; }
function httpsOnly(value: unknown): value is string { try { return typeof value === "string" && new URL(value).protocol === "https:"; } catch { return false; } }
function httpsOrLoopback(value: unknown): value is string { try { if (typeof value !== "string") return false; const url = new URL(value); return url.protocol === "https:" || (url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname)); } catch { return false; } }
function selfAddressed(value: Record<string, any>): boolean { try { const { id, ...body } = value; return typeof id === "string" && id === semanticId(body); } catch { return false; } }
function unionMediaSelfAddressed(value: Record<string, any>): boolean { try { const { id, ...body } = value; return typeof id === "string" && id === unionMediaSemanticId(body); } catch { return false; } }
function refusal(reasons: readonly string[]): UnionMediaPlacementRequestRefusal { return Object.freeze({ type: "TTIUnionMediaPlacementRequestRefusal", version: 1, reasons: [...new Set(reasons)], durableMutation: false, authenticationConsumed: false, creativeApproved: false, bidAdmitted: false, inventoryReserved: false, resourceTransferObserved: false, publicationAuthorized: false, revenueRecognized: false, profitRecognized: false }) as UnionMediaPlacementRequestRefusal; }
async function withAuthenticationLock<T>(key: string, operation: () => Promise<T>): Promise<T> { const prior = writeLocks.get(key) ?? Promise.resolve(); let release!: () => void; const mine = new Promise<void>((resolve) => { release = resolve; }), queued = prior.then(() => mine); writeLocks.set(key, queued); await prior; try { return await operation(); } finally { release(); if (writeLocks.get(key) === queued) writeLocks.delete(key); } }
