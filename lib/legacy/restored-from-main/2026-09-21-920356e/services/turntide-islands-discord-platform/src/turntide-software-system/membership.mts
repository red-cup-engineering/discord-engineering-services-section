import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { DiscordTransport } from "./discord.mts";
import { env, publicTurntideDataPath, type EnvMap } from "./env.mts";

export type MembershipStatus = "active" | "cancelled" | "expired";

export interface MembershipEntitlement {
  readonly id: string;
  readonly userId: string;
  readonly provider: string;
  readonly planId: string;
  readonly status: MembershipStatus;
  readonly observedAt: string;
}

/** What a tier actually unlocks, beyond the Discord role it grants. */
export type MembershipCapability = "discord-injection" | "vault-access" | "mcp-access";

export interface MembershipTier {
  readonly planId: string;
  readonly roleId: string;
  readonly capabilities: readonly MembershipCapability[];
}

export interface MembershipProgramConfig {
  readonly guildId: string;
  readonly roleId: string;
  readonly entitlementsFile: string;
  readonly tiers: readonly MembershipTier[];
}

/** The tier a plan resolves to, or `undefined` for an unrecognized plan. */
export function tierForPlan(config: MembershipProgramConfig, planId: string): MembershipTier | undefined {
  return config.tiers.find((tier) => tier.planId === planId);
}

/** The Discord role an admitted plan grants. Unknown plans fail closed. */
export function roleForPlan(config: MembershipProgramConfig, planId: string): string | undefined {
  return tierForPlan(config, planId)?.roleId ?? (planId === "islander-monthly" ? config.roleId : undefined);
}

/** Whether an active admitted plan carries a given capability. Unknown plans grant nothing. */
export function planHasCapability(config: MembershipProgramConfig, planId: string, capability: MembershipCapability): boolean {
  const tier = tierForPlan(config, planId);
  if (tier !== undefined) return tier.capabilities.includes(capability);
  return false;
}

export interface MembershipReconciliation {
  readonly entitlements: readonly MembershipEntitlement[];
  readonly latestByUser: readonly MembershipEntitlement[];
  readonly applied: readonly Readonly<{ userId: string; status: MembershipStatus; roleId: string; action: "add" | "remove" }>[];
}

export function membershipConfig(source: EnvMap = process.env): MembershipProgramConfig {
  const guildId = env("DISCORD_GUILD_ID", source);
  const roleId = env("TURNTIDE_ISLANDER_ROLE_ID", source);
  if (guildId === undefined) throw new Error("DISCORD_GUILD_ID is required");
  if (roleId === undefined) throw new Error("TURNTIDE_ISLANDER_ROLE_ID is required");
  const tiers: MembershipTier[] = [
    { planId: "islander-monthly", roleId, capabilities: ["discord-injection", "vault-access"] },
  ];
  const vaultSubscriberRoleId = env("TTI_VAULT_SUBSCRIBER_ROLE_ID", source);
  if (vaultSubscriberRoleId !== undefined) {
    tiers.push({ planId: "vault-subscriber-monthly", roleId: vaultSubscriberRoleId, capabilities: ["vault-access"] });
  }
  const patronRoleId = env("TURNTIDE_PATRON_ROLE_ID", source);
  if (patronRoleId !== undefined) {
    tiers.push({ planId: "harbor-patron-monthly", roleId: patronRoleId, capabilities: ["discord-injection", "vault-access", "mcp-access"] });
  }
  return {
    guildId,
    roleId,
    tiers: Object.freeze(tiers),
    entitlementsFile: env("TTI_MEMBERSHIP_ENTITLEMENTS_FILE", source) ?? publicTurntideDataPath(source, "membership", "entitlements.json"),
  };
}

export async function readMembershipEntitlements(file: string): Promise<readonly MembershipEntitlement[]> {
  try {
    const raw = JSON.parse(await readFile(file, "utf8")) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.map(readEntitlement).filter((entry): entry is MembershipEntitlement => entry !== null);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function recordMembershipEntitlement(file: string, entitlement: MembershipEntitlement): Promise<readonly MembershipEntitlement[]> {
  const entitlements = [...await readMembershipEntitlements(file), entitlement];
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(entitlements, null, 2)}\n`);
  return entitlements;
}

export async function reconcileMembershipEntitlements(
  transport: Pick<DiscordTransport, "addGuildMemberRole" | "removeGuildMemberRole">,
  config: MembershipProgramConfig,
  entitlements: readonly MembershipEntitlement[],
): Promise<MembershipReconciliation> {
  const latest = latestEntitlements(entitlements);
  const applied: Array<Readonly<{ userId: string; status: MembershipStatus; roleId: string; action: "add" | "remove" }>> = [];
  for (const entitlement of latest) {
    const roleId = roleForPlan(config, entitlement.planId);
    if (roleId === undefined) continue;
    if (entitlement.status === "active") {
      await transport.addGuildMemberRole(config.guildId, entitlement.userId, roleId);
      applied.push({ userId: entitlement.userId, status: entitlement.status, roleId, action: "add" });
    } else {
      await transport.removeGuildMemberRole(config.guildId, entitlement.userId, roleId);
      applied.push({ userId: entitlement.userId, status: entitlement.status, roleId, action: "remove" });
    }
  }
  return { entitlements, latestByUser: latest, applied };
}

export function latestEntitlements(entitlements: readonly MembershipEntitlement[]): readonly MembershipEntitlement[] {
  const byUser = new Map<string, MembershipEntitlement>();
  for (const entitlement of entitlements) {
    const previous = byUser.get(entitlement.userId);
    if (previous === undefined || previous.observedAt <= entitlement.observedAt) byUser.set(entitlement.userId, entitlement);
  }
  return [...byUser.values()].sort((left, right) => left.userId.localeCompare(right.userId));
}

export function entitlement(input: Readonly<{
  id: string;
  userId: string;
  status: MembershipStatus;
  provider?: string;
  planId?: string;
  observedAt?: string;
}>): MembershipEntitlement {
  return Object.freeze({
    id: input.id,
    userId: input.userId,
    provider: input.provider ?? "manual",
    planId: input.planId ?? "islander-monthly",
    status: input.status,
    observedAt: input.observedAt ?? new Date().toISOString(),
  });
}

function readEntitlement(value: unknown): MembershipEntitlement | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (
    typeof raw["id"] !== "string" ||
    typeof raw["userId"] !== "string" ||
    typeof raw["provider"] !== "string" ||
    typeof raw["planId"] !== "string" ||
    typeof raw["observedAt"] !== "string" ||
    (raw["status"] !== "active" && raw["status"] !== "cancelled" && raw["status"] !== "expired")
  ) return null;
  return raw as unknown as MembershipEntitlement;
}
