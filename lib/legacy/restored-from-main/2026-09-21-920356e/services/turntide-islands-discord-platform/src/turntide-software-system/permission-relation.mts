import { discordPermissions, type DiscordPermissionOverwrite } from "./discord.mts";

export interface FourEvidence { readonly positiveEvidence: boolean; readonly negativeEvidence: boolean }
export interface PermissionRelation { readonly at: (principal: string, bit: string) => FourEvidence }

export const permissionBitNames: readonly (keyof typeof discordPermissions)[] =
  Object.freeze(Object.keys(discordPermissions) as (keyof typeof discordPermissions)[]);

function principalKey(overwrite: DiscordPermissionOverwrite): string { return `${overwrite.type}:${overwrite.id}`; }
function bitEvidence(allow: bigint, deny: bigint, bit: bigint): FourEvidence {
  return Object.freeze({ positiveEvidence: (allow & bit) !== 0n, negativeEvidence: (deny & bit) !== 0n });
}

/** Discord allow/deny is projected directly as the two evidence bits of FOUR. */
export function overwriteRelation(overwrites: readonly DiscordPermissionOverwrite[] | undefined): PermissionRelation {
  const cells = new Map<string, FourEvidence>();
  for (const overwrite of overwrites ?? []) {
    const allow = BigInt(overwrite.allow || "0"), deny = BigInt(overwrite.deny || "0");
    for (const bitName of permissionBitNames) cells.set(`${principalKey(overwrite)}\u0000${bitName}`, bitEvidence(allow, deny, discordPermissions[bitName]));
  }
  return Object.freeze({ at: (principal: string, bit: string) => cells.get(`${principal}\u0000${bit}`) ?? Object.freeze({ positiveEvidence: false, negativeEvidence: false }) });
}

export function sameOverwriteSet(left: readonly DiscordPermissionOverwrite[] | undefined, right: readonly DiscordPermissionOverwrite[] | undefined): boolean {
  const leftList = left ?? [], rightList = right ?? [], principals = new Set([...leftList.map(principalKey), ...rightList.map(principalKey)]);
  const leftRelation = overwriteRelation(leftList), rightRelation = overwriteRelation(rightList);
  for (const principal of principals) for (const bitName of permissionBitNames) {
    const a = leftRelation.at(principal, bitName), b = rightRelation.at(principal, bitName);
    if (a.positiveEvidence !== b.positiveEvidence || a.negativeEvidence !== b.negativeEvidence) return false;
  }
  return true;
}
