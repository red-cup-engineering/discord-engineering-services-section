import { createHash } from "node:crypto";

export interface JsonObject { readonly [name: string]: JsonValue; }
export type JsonValue = null | boolean | number | string | readonly JsonValue[] | JsonObject;
export interface DesiredCommunityConfiguration { readonly type: "DiscordCommunityDesiredConfiguration"; readonly version: 1; readonly revision: string; readonly resources: readonly Readonly<{ key: string; kind: string; specification: Readonly<Record<string, JsonValue>> }>[]; }
export interface ObservedCommunityConfiguration { readonly type: "DiscordCommunityObservedConfiguration"; readonly version: 1; readonly observedAt: string; readonly sourceRevision: string; readonly resources: readonly Readonly<{ key: string; kind: string; specification: Readonly<Record<string, JsonValue>> }>[]; }
export interface CommunityConfigurationChange { readonly type: "DiscordCommunityConfigurationReviewProposal"; readonly version: 1; readonly id: string; readonly executable: false; readonly authority: "review-required"; readonly action: "create" | "update" | "remove"; readonly resourceKey: string; readonly resourceKind: string; readonly desiredDigest?: string; readonly observedDigest?: string; }
export interface CommunityConfigurationReconciliation { readonly type: "DiscordCommunityConfigurationReconciliation"; readonly version: 1; readonly desiredRevision: string; readonly observedRevision: string; readonly observedAt: string; readonly changes: readonly CommunityConfigurationChange[]; }
export interface ReconciliationOptions { readonly now?: Date; readonly maxObservedAgeMs?: number; }

const key = (value: string, label: string): string => { if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value)) throw new TypeError(`${label} must be a stable identifier`); return value; };
const instant = (value: string, label: string): string => { if (!Number.isFinite(Date.parse(value))) throw new TypeError(`${label} must be an ISO timestamp`); return new Date(value).toISOString(); };
export function normalizeJson(value: unknown): JsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") { if (!Number.isFinite(value)) throw new TypeError("JSON numbers must be finite"); return value; }
  if (Array.isArray(value)) return Object.freeze(value.map(normalizeJson));
  if (typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError("configuration specifications must contain only plain JSON values");
  const output: Record<string, JsonValue> = {};
  for (const name of Object.keys(value).sort()) output[name] = normalizeJson((value as Record<string, unknown>)[name]);
  return Object.freeze(output);
}
export const stableJson = (value: JsonValue): string => Array.isArray(value) ? `[${value.map(stableJson).join(",")}]` : value !== null && typeof value === "object" ? `{${Object.entries(value).map(([name, item]) => `${JSON.stringify(name)}:${stableJson(item)}`).join(",")}}` : JSON.stringify(value);
const digest = (value: JsonValue): string => createHash("sha256").update(stableJson(value)).digest("hex");
const normalize = <T extends DesiredCommunityConfiguration | ObservedCommunityConfiguration>(input: T, options: ReconciliationOptions = {}): T => {
  if (input === null || typeof input !== "object" || Object.getPrototypeOf(input) !== Object.prototype || (input.type !== "DiscordCommunityDesiredConfiguration" && input.type !== "DiscordCommunityObservedConfiguration") || input.version !== 1 || !Array.isArray(input.resources)) throw new TypeError("unsupported community configuration");
  const now = options.now ?? new Date(), maxAge = options.maxObservedAgeMs ?? 60_000;
  if (!Number.isFinite(maxAge) || maxAge < 0) throw new TypeError("maxObservedAgeMs must be nonnegative");
  if (input.type === "DiscordCommunityDesiredConfiguration") key(input.revision, "desired revision");
  else { key(input.sourceRevision, "observed source revision"); const observedAt = instant(input.observedAt, "observedAt"), age = now.getTime() - Date.parse(observedAt); if (age < -5_000 || age > maxAge) throw new TypeError("observed configuration is not fresh"); }
  const seen = new Set<string>(), resources = input.resources.map((resource) => {
    if (resource === null || typeof resource !== "object" || Object.getPrototypeOf(resource) !== Object.prototype) throw new TypeError("resource must be a plain object");
    const resourceKey = key(resource.key, "resource key"), kind = key(resource.kind, "resource kind"); if (seen.has(resourceKey)) throw new TypeError("configuration resources must have unique keys"); seen.add(resourceKey);
    const specification = normalizeJson(resource.specification); if (Array.isArray(specification) || specification === null || typeof specification !== "object") throw new TypeError("resource specification must be a JSON object");
    return Object.freeze({ key: resourceKey, kind, specification });
  }).sort((a, b) => a.key.localeCompare(b.key));
  return Object.freeze({ ...input, ...(input.type === "DiscordCommunityObservedConfiguration" ? { observedAt: instant(input.observedAt, "observedAt") } : {}), resources: Object.freeze(resources) }) as unknown as T;
};
export const normalizeDesiredCommunityConfiguration = (input: DesiredCommunityConfiguration): DesiredCommunityConfiguration => normalize(input);
export const normalizeObservedCommunityConfiguration = (input: ObservedCommunityConfiguration, options?: ReconciliationOptions): ObservedCommunityConfiguration => normalize(input, options);
export function reconcileCommunityConfiguration(desiredInput: DesiredCommunityConfiguration, observedInput: ObservedCommunityConfiguration, options: ReconciliationOptions = {}): CommunityConfigurationReconciliation {
  const desired = normalizeDesiredCommunityConfiguration(desiredInput), observed = normalizeObservedCommunityConfiguration(observedInput, options), desiredByKey = new Map(desired.resources.map((resource) => [resource.key, resource])), observedByKey = new Map(observed.resources.map((resource) => [resource.key, resource]));
  const changes: CommunityConfigurationChange[] = [];
  for (const resourceKey of [...new Set([...desiredByKey.keys(), ...observedByKey.keys()])].sort()) {
    const expected = desiredByKey.get(resourceKey), actual = observedByKey.get(resourceKey), action = expected === undefined ? "remove" : actual === undefined ? "create" : stableJson(expected.specification) !== stableJson(actual.specification) || expected.kind !== actual.kind ? "update" : undefined;
    if (!action) continue;
    const resourceKind = expected?.kind ?? actual!.kind, desiredDigest = expected ? digest(expected.specification) : undefined, observedDigest = actual ? digest(actual.specification) : undefined;
    const material = { action, resourceKey, resourceKind, desiredDigest, observedDigest, desiredRevision: desired.revision, observedRevision: observed.sourceRevision };
    changes.push(Object.freeze({ type: "DiscordCommunityConfigurationReviewProposal", version: 1, id: `discord-community-review:${createHash("sha256").update(JSON.stringify(material)).digest("hex")}`, executable: false, authority: "review-required", action, resourceKey, resourceKind, ...(desiredDigest ? { desiredDigest } : {}), ...(observedDigest ? { observedDigest } : {}) }));
  }
  return Object.freeze({ type: "DiscordCommunityConfigurationReconciliation", version: 1, desiredRevision: desired.revision, observedRevision: observed.sourceRevision, observedAt: observed.observedAt, changes: Object.freeze(changes) });
}
export function validateCommunityConfigurationReconciliation(input: CommunityConfigurationReconciliation, options: ReconciliationOptions = {}): CommunityConfigurationReconciliation {
  if (input === null || typeof input !== "object" || Object.getPrototypeOf(input) !== Object.prototype || input.type !== "DiscordCommunityConfigurationReconciliation" || input.version !== 1 || !Array.isArray(input.changes)) throw new TypeError("unsupported reconciliation");
  key(input.desiredRevision, "desired revision"); key(input.observedRevision, "observed revision"); const observedAt = instant(input.observedAt, "observedAt"), now = options.now ?? new Date(), maxAge = options.maxObservedAgeMs ?? 60_000;
  if (!Number.isFinite(maxAge) || maxAge < 0) throw new TypeError("maxObservedAgeMs must be nonnegative");
  if (now.getTime() - Date.parse(observedAt) > maxAge || Date.parse(observedAt) > now.getTime() + 5_000) throw new TypeError("reconciliation observation is not fresh");
  const seen = new Set<string>(), resourceKeys = new Set<string>(), changes = input.changes.map((change) => {
    if (change === null || typeof change !== "object" || Object.getPrototypeOf(change) !== Object.prototype || change.type !== "DiscordCommunityConfigurationReviewProposal" || change.version !== 1 || change.executable !== false || change.authority !== "review-required" || !["create", "update", "remove"].includes(change.action)) throw new TypeError("reconciliation change is not review-only");
    key(change.resourceKey, "resource key"); key(change.resourceKind, "resource kind"); if (!/^discord-community-review:[a-f0-9]{64}$/u.test(change.id) || seen.has(change.id) || resourceKeys.has(change.resourceKey)) throw new TypeError("reconciliation change id or resource is invalid"); seen.add(change.id); resourceKeys.add(change.resourceKey);
    for (const value of [change.desiredDigest, change.observedDigest]) if (value !== undefined && !/^[a-f0-9]{64}$/u.test(value)) throw new TypeError("reconciliation digest is invalid");
    if ((change.action === "create" && (change.desiredDigest === undefined || change.observedDigest !== undefined)) || (change.action === "remove" && (change.desiredDigest !== undefined || change.observedDigest === undefined)) || (change.action === "update" && (change.desiredDigest === undefined || change.observedDigest === undefined))) throw new TypeError("reconciliation digests do not match action");
    const material = { action: change.action, resourceKey: change.resourceKey, resourceKind: change.resourceKind, desiredDigest: change.desiredDigest, observedDigest: change.observedDigest, desiredRevision: input.desiredRevision, observedRevision: input.observedRevision };
    if (change.id !== `discord-community-review:${createHash("sha256").update(JSON.stringify(material)).digest("hex")}`) throw new TypeError("reconciliation change id does not match proposal");
    return Object.freeze({ ...change });
  });
  return Object.freeze({ ...input, observedAt, changes: Object.freeze(changes) });
}
