import { readFile } from "node:fs/promises";
import type { ReactionRoleBinding } from "@red-cup-engineering/discord-community-automation-service";
import { normalizeCommunityResponseProgram, type CommunityResponseProgram } from "@red-cup-engineering/programmable-community-response-service";
import type { LifecycleKind, LifecyclePolicy } from "@red-cup-engineering/discord-member-lifecycle-planning-service";
export type ZeloMode = "disabled" | "shadow";
export interface ZeloRateBudgetObservationProviderConfig { readonly type: "ZeloRateBudgetObservationProviderConfig"; readonly version: 1; readonly id: string; readonly maxObservationAgeMs: number; }
export interface ZeloCommunityResponseShadowConfig { readonly type: "ZeloCommunityResponseShadowConfig"; readonly version: 1; readonly program: CommunityResponseProgram; readonly rateBudgetObservationProvider: ZeloRateBudgetObservationProviderConfig; }
export interface ZeloModerationShadowConfig { readonly type: "ZeloModerationShadowConfig"; readonly version: 1; readonly purpose: string; readonly maxStateAgeMs: number; }
export interface ZeloMemberLifecycleShadowConfig { readonly type: "ZeloMemberLifecycleShadowConfig"; readonly version: 1; readonly communityId: string; readonly purpose: string; readonly permittedKinds: readonly LifecycleKind[]; readonly policy: LifecyclePolicy; }
export interface ZeloRuntimeConfig { readonly type: "ZeloRuntimeConfig"; readonly version: 1; readonly mode: ZeloMode; readonly bindings: readonly ReactionRoleBinding[]; readonly projectionKey: string; readonly communityResponse?: ZeloCommunityResponseShadowConfig; readonly moderation?: ZeloModerationShadowConfig; readonly memberLifecycle?: ZeloMemberLifecycleShadowConfig; }
const identifier = (value: unknown, label: string): string => { if (typeof value !== "string" || !/^[A-Za-z][A-Za-z0-9._:-]{0,127}$/u.test(value)) throw new TypeError(`${label} must be an identifier`); return value; };
function parseCommunityResponseConfig(input: unknown): ZeloCommunityResponseShadowConfig {
  if (input === null || typeof input !== "object" || Array.isArray(input)) throw new TypeError("community response config must be an object");
  const value = input as Record<string, unknown>, provider = value["rateBudgetObservationProvider"];
  if (value["type"] !== "ZeloCommunityResponseShadowConfig" || value["version"] !== 1 || provider === null || typeof provider !== "object" || Array.isArray(provider)) throw new TypeError("invalid community response config");
  const providerValue = provider as Record<string, unknown>, maxObservationAgeMs = providerValue["maxObservationAgeMs"];
  if (providerValue["type"] !== "ZeloRateBudgetObservationProviderConfig" || providerValue["version"] !== 1 || !Number.isSafeInteger(maxObservationAgeMs) || (maxObservationAgeMs as number) < 1 || (maxObservationAgeMs as number) > 300_000) throw new TypeError("invalid rate budget observation provider config");
  const program = normalizeCommunityResponseProgram(value["program"] as Parameters<typeof normalizeCommunityResponseProgram>[0]);
  return Object.freeze({ type: "ZeloCommunityResponseShadowConfig", version: 1, program, rateBudgetObservationProvider: Object.freeze({ type: "ZeloRateBudgetObservationProviderConfig", version: 1, id: identifier(providerValue["id"], "rate budget provider id"), maxObservationAgeMs: maxObservationAgeMs as number }) });
}
function parseModerationConfig(input: unknown): ZeloModerationShadowConfig {
  if (input === null || typeof input !== "object" || Array.isArray(input)) throw new TypeError("moderation config must be an object");
  const value = input as Record<string, unknown>, maxStateAgeMs = value["maxStateAgeMs"];
  if (value["type"] !== "ZeloModerationShadowConfig" || value["version"] !== 1 || !Number.isSafeInteger(maxStateAgeMs) || (maxStateAgeMs as number) < 1 || (maxStateAgeMs as number) > 300_000) throw new TypeError("invalid moderation config");
  return Object.freeze({ type: "ZeloModerationShadowConfig", version: 1, purpose: identifier(value["purpose"], "moderation purpose"), maxStateAgeMs: maxStateAgeMs as number });
}
function parseMemberLifecycleConfig(input: unknown): ZeloMemberLifecycleShadowConfig {
  if (input === null || typeof input !== "object" || Array.isArray(input)) throw new TypeError("member lifecycle config must be an object");
  const value = input as Record<string, unknown>, kinds = value["permittedKinds"], policy = value["policy"];
  if (value["type"] !== "ZeloMemberLifecycleShadowConfig" || value["version"] !== 1 || !Array.isArray(kinds) || kinds.length === 0 || policy === null || typeof policy !== "object" || Array.isArray(policy)) throw new TypeError("invalid member lifecycle config");
  const permittedKinds = kinds.map((kind) => {
    if (kind !== "arrival" && kind !== "leave" && kind !== "milestone" && kind !== "reengagement") throw new TypeError("invalid member lifecycle kind");
    return kind;
  }) as LifecycleKind[];
  if (new Set(permittedKinds).size !== permittedKinds.length) throw new TypeError("duplicate member lifecycle kind");
  return Object.freeze({ type: "ZeloMemberLifecycleShadowConfig", version: 1, communityId: identifier(value["communityId"], "member lifecycle community id"), purpose: identifier(value["purpose"], "member lifecycle purpose"), permittedKinds: Object.freeze(permittedKinds), policy: policy as LifecyclePolicy });
}
export function parseZeloRuntimeConfig(input: unknown): ZeloRuntimeConfig {
  if (input === null || typeof input !== "object" || Array.isArray(input)) throw new TypeError("Zelo config must be an object");
  const value = input as Record<string, unknown>, mode = value["mode"], bindings = value["bindings"], projectionKey = value["projectionKey"], communityResponse = value["communityResponse"], moderation = value["moderation"], memberLifecycle = value["memberLifecycle"];
  if (value["type"] !== "ZeloRuntimeConfig" || value["version"] !== 1 || !["disabled", "shadow"].includes(String(mode)) || !Array.isArray(bindings) || typeof projectionKey !== "string" || projectionKey.length < 32) throw new TypeError("invalid Zelo config");
  return Object.freeze({ type: "ZeloRuntimeConfig", version: 1, mode: mode as ZeloMode, bindings: Object.freeze(bindings as ReactionRoleBinding[]), projectionKey, ...(communityResponse === undefined ? {} : { communityResponse: parseCommunityResponseConfig(communityResponse) }), ...(moderation === undefined ? {} : { moderation: parseModerationConfig(moderation) }), ...(memberLifecycle === undefined ? {} : { memberLifecycle: parseMemberLifecycleConfig(memberLifecycle) }) });
}
export async function loadZeloRuntimeConfig(source: Record<string, string | undefined> = process.env): Promise<ZeloRuntimeConfig> {
  const file = source["ZELO_REACTION_CONFIG_FILE"]; if (!file) throw new Error("ZELO_REACTION_CONFIG_FILE is required");
  const config = parseZeloRuntimeConfig(JSON.parse(await readFile(file, "utf8")) as unknown), override = source["ZELO_REACTION_MODE"];
  if (override !== undefined && override !== "disabled" && override !== "shadow") throw new Error("ZELO_REACTION_MODE may only disable or shadow");
  return Object.freeze({ ...config, mode: override ?? config.mode });
}
