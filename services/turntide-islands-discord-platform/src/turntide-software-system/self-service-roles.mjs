
import { env } from "./env.mjs";

/**
 * Configuration is intentionally data, not role names inferred from the guild.
 * This prevents command input from becoming a way to grant staff, paid, or
 * integration-managed roles.
 */
export function selfServiceRoleConfiguration(source = process.env) {
  const encoded = env("TTI_SELF_SERVICE_ROLE_ALLOWLIST_JSON", source);
  if (encoded === undefined) return Object.freeze({ roles: Object.freeze([]) });
  let value;
  try { value = JSON.parse(encoded); }
  catch { throw new Error("TTI_SELF_SERVICE_ROLE_ALLOWLIST_JSON must be valid JSON"); }
  if (!Array.isArray(value) || value.length > 25) throw new Error("TTI_SELF_SERVICE_ROLE_ALLOWLIST_JSON must be an array of at most 25 roles");
  const seenKeys = new Set(), seenIds = new Set();
  const roles = value.map((entry) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) throw new Error("self-service role entries must be objects");
    const role = entry;
    const key = typeof role["key"] === "string" ? role["key"].trim().toLowerCase() : "";
    const roleId = typeof role["roleId"] === "string" ? role["roleId"].trim() : "";
    const label = typeof role["label"] === "string" ? role["label"].trim() : "";
    if (!/^[a-z0-9][a-z0-9-]{0,31}$/u.test(key) || roleId === "" || label === "" || label.length > 80 || seenKeys.has(key) || seenIds.has(roleId)) {
      throw new Error("self-service role entries require unique key, roleId, and label");
    }
    seenKeys.add(key); seenIds.add(roleId);
    return Object.freeze({ key, roleId, label });
  });
  return Object.freeze({ roles: Object.freeze(roles) });
}

export async function performSelfServiceRoleAction(
  transport,
  input,
  configuration,
) {
  const action = parseAction(input.action);
  if (action === undefined) return refusal("Choose action:add, action:remove, or action:list.");
  if (input.guildId === undefined || input.userId === undefined) return refusal("Role preferences can only be changed inside the Turntide Islands server.");
  if (configuration.roles.length === 0) return refusal("Self-service preferences are not configured yet. Ask a human moderator if you need help.");
  if (action === "list") return Object.freeze({ kind: "listed", roles: configuration.roles });
  const roleKey = input.roleKey?.trim().toLowerCase();
  const allowed = roleKey === undefined ? undefined : configuration.roles.find((role) => role.key === roleKey);
  if (allowed === undefined) return refusal("Choose a role key from /roles action:list; staff, paid, and moderation roles cannot be changed here.");

  const [guildRoles, bot] = await Promise.all([transport.listRoles(input.guildId), transport.getCurrentUser()]);
  const botRoleIds = await transport.listGuildMemberRoleIds(input.guildId, bot.id);
  const target = guildRoles.find((role) => role.id === allowed.roleId);
  const hierarchyReason = roleSafetyReason(target, guildRoles, botRoleIds, bot.id);
  if (hierarchyReason !== undefined) return refusal(hierarchyReason);

  if (action === "add") await transport.addGuildMemberRole(input.guildId, input.userId, allowed.roleId);
  else await transport.removeGuildMemberRole(input.guildId, input.userId, allowed.roleId);
  return Object.freeze({ kind: "changed", action, role: allowed });
}

export function selfServiceRoleResponse(result) {
  if (result.kind === "refused") return result.reason;
  if (result.kind === "listed") return ["Available self-service preferences:", ...result.roles.map((role) => `• ${role.key} — ${role.label}`), "Use /roles action:add role:<key> or /roles action:remove role:<key>.", "This command cannot change staff, paid, or moderation roles."].join("\n");
  return result.action === "add"
    ? `Added ${result.role.label} to your preferences.`
    : `Removed ${result.role.label} from your preferences.`;
}

function parseAction(value) {
  return value === "add" || value === "remove" || value === "list" ? value : undefined;
}

function refusal(reason) {
  return Object.freeze({ kind: "refused", reason });
}

function roleSafetyReason(target, guildRoles, botRoleIds, botId) {
  if (target === undefined) return "That preference is no longer available in this server. No role was changed.";
  if (target.managed === true) return "That preference is integration-managed and cannot be changed here.";
  const targetPosition = target.position;
  if (typeof targetPosition !== "number" || !Number.isInteger(targetPosition) || targetPosition <= 0) return "That preference does not have a safe Discord role position. No role was changed.";
  const positions = botRoleIds.map((id) => guildRoles.find((role) => role.id === id)?.position).filter((position) => Number.isInteger(position));
  const botHighestPosition = positions.length === 0 ? undefined : Math.max(...positions);
  if (botHighestPosition === undefined || targetPosition >= botHighestPosition) {
    return `Zelo cannot safely manage that preference because its role is at or above Zelo's role hierarchy. No role was changed.`;
  }
  if (botId === "") return "Zelo could not establish its Discord identity. No role was changed.";
  return undefined;
}
