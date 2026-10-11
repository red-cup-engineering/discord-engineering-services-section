import { discordPermissions } from "./discord.mjs";

export const permissionBitNames =
  Object.freeze(Object.keys(discordPermissions));

function principalKey(overwrite) { return `${overwrite.type}:${overwrite.id}`; }
function bitEvidence(allow, deny, bit) {
  return Object.freeze({ positiveEvidence: (allow & bit) !== 0n, negativeEvidence: (deny & bit) !== 0n });
}

/** Discord allow/deny is projected directly as the two evidence bits of FOUR. */
export function overwriteRelation(overwrites) {
  const cells = new Map();
  for (const overwrite of overwrites ?? []) {
    const allow = BigInt(overwrite.allow || "0"), deny = BigInt(overwrite.deny || "0");
    for (const bitName of permissionBitNames) cells.set(`${principalKey(overwrite)}\u0000${bitName}`, bitEvidence(allow, deny, discordPermissions[bitName]));
  }
  return Object.freeze({ at: (principal, bit) => cells.get(`${principal}\u0000${bit}`) ?? Object.freeze({ positiveEvidence: false, negativeEvidence: false }) });
}

export function sameOverwriteSet(left, right) {
  const leftList = left ?? [], rightList = right ?? [], principals = new Set([...leftList.map(principalKey), ...rightList.map(principalKey)]);
  const leftRelation = overwriteRelation(leftList), rightRelation = overwriteRelation(rightList);
  for (const principal of principals) for (const bitName of permissionBitNames) {
    const a = leftRelation.at(principal, bitName), b = rightRelation.at(principal, bitName);
    if (a.positiveEvidence !== b.positiveEvidence || a.negativeEvidence !== b.negativeEvidence) return false;
  }
  return true;
}
