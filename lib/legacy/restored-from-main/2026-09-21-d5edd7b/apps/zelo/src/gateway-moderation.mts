import type { ModerationAction } from "@red-cup-engineering/discord-community-moderation-planning-service";

export interface ZeloModerationInteraction { readonly caseId: string; readonly guildId: string; readonly actorId: string; readonly subjectId: string; readonly action: ModerationAction; readonly severity: "low" | "moderate" | "high"; readonly reasonCode: string; readonly evidenceDigest: string; readonly appealOf?: string; readonly arguments: Readonly<Record<string, unknown>>; }
const object = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === "object" && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null) ? value as Record<string, unknown> : undefined;
const id = (value: unknown): string | undefined => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u.test(value) ? value : undefined;
/**
 * Normalizes Zelo's pre-normalized interaction dispatch contract, not Discord's
 * raw wire payload. It opens no transport and deliberately does not parse
 * Discord option arrays; a gateway adapter must perform that mapping first.
 */
export function normalizeDiscordModerationInteraction(raw: unknown): ZeloModerationInteraction | undefined {
  const packet = object(raw), data = packet && object(packet["d"]), command = data && object(data["data"]), member = data && object(data["member"]), user = member && object(member["user"]), args = command && object(command["arguments"]);
  if (packet?.["t"] !== "INTERACTION_CREATE" || command?.["kind"] !== "moderation-review" || !data || !args) return undefined;
  const caseId = id(command["case_id"]), guildId = id(data["guild_id"]), actorId = id(user?.["id"]), subjectId = id(command["subject_id"]), appealOf = command["appeal_of"] === undefined ? undefined : id(command["appeal_of"]), action = command["action"], severity = command["severity"], reasonCode = id(command["reason_code"]), evidenceDigest = command["evidence_digest"];
  if (!caseId || !guildId || !actorId || !subjectId || actorId === subjectId || (command["appeal_of"] !== undefined && (!appealOf || appealOf === caseId)) || !reasonCode || typeof evidenceDigest !== "string" || !/^[a-f0-9]{64}$/u.test(evidenceDigest) || !["warn", "timeout", "remove-role", "restore-role"].includes(String(action)) || !["low", "moderate", "high"].includes(String(severity))) return undefined;
  return Object.freeze({ caseId, guildId, actorId, subjectId, action: action as ModerationAction, severity: severity as ZeloModerationInteraction["severity"], reasonCode, evidenceDigest, ...(appealOf === undefined ? {} : { appealOf }), arguments: Object.freeze({ ...args }) });
}
