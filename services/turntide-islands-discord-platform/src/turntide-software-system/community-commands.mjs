import { membershipProgram, siteUrl } from "./index.mjs";
import { sha256Hex } from "@red-cup-engineering/cryptographic-computer-data-engineering-services-section/integrity";

export function communityHelp() {
  return [
    "Zelo is Turntide Islands' community steward, not a replacement for its people.",
    "• /join — enter the community and find a first conversation",
    "• /rules — read the community agreement",
    "• /roles — choose interests and notification preferences",
    "• /events — find or host a gathering",
    "• /report — privately ask human moderators for help",
    "• /ask — ask Zelo for orientation or source-backed context",
    "Mention Zelo when you want a reply; ordinary conversation belongs to the humans in it.",
  ].join("\n");
}

export function communityRules() {
  return [
    "Turntide Islands community agreement",
    "1. Treat people as people; no harassment, hate, threats, doxxing, or unwanted sexual content.",
    "2. Critique ideas and institutions without turning disagreement into personal punishment.",
    "3. Keep private or vulnerable material in its intended context; ask before carrying it elsewhere.",
    "4. Label speculation, cite consequential claims when practical, and correct mistakes openly.",
    "5. Do not spam, scam, impersonate, manipulate engagement, or use the community as an extraction funnel.",
    "6. Human moderators make safety decisions and hear appeals. Use /report for a private handoff.",
  ].join("\n");
}

export function communityRoles() {
  return [
    "Use /roles action:list to see self-service interests and notification preferences (alongside Discord's Channels & Roles onboarding), then action:add or action:remove with the listed role key.",
    `Completing orientation grants the free ${membershipProgram.role} community role and opens: ${membershipProgram.unlocks.join(", ")}.`,
    "Notification choices stay voluntary. Zelo does not assign paid access, staff authority, or moderation status through this command.",
  ].join("\n");
}

export function communityEvents() {
  return [
    "Open Discord's Events list for scheduled Turntide gatherings.",
    "The September 2026 intake ended on September 30. No successor cycle is active unless Turntide governance opens one; Discord's Events list is authoritative for confirmed synchronous gatherings.",
    "For a gathering, include its purpose, two possible start windows with timezone, accessibility needs, and whether you can host or need a host.",
    "A human must accept responsibility before a synchronous event is scheduled; Zelo does not volunteer or host on anyone's behalf.",
    `Current programming and joining details: ${new URL("events/", siteUrl).href}`,
  ].join("\n");
}

export function joinCommunityInstructions() {
  return [
    "Turntide Islands is free to join.",
    "Complete Discord's short onboarding, choose the conversations you want, then introduce a place, practice, question, or project in #mainland.",
    `The ${membershipProgram.role} role opens: ${membershipProgram.unlocks.join(", ")}.`,
    "No wallet, payment, or personal biography is required for ordinary community membership.",
    `Join and orientation details: ${new URL("join/", siteUrl).href}`,
  ].join("\n");
}

export function prepareCommunityReport(input

) {
  const concern = input.concern.trim();
  if (concern.length < 10 || concern.length > 1500) throw new Error("concern must be between 10 and 1500 characters");
  const messageLink = input.messageLink?.trim();
  if (messageLink !== undefined && messageLink !== "" && !/^https:\/\/discord(?:app)?\.com\/channels\/\d+\/\d+\/\d+$/u.test(messageLink)) {
    throw new Error("message link must be a Discord message URL");
  }
  const caseId = `TTI-${sha256Hex(input.interactionId).slice(0, 10).toUpperCase()}`;
  return Object.freeze({
    caseId,
    moderatorMessage: [
      `Human moderation handoff ${caseId}`,
      `Reporter: <@${input.reporterId}>`,
      input.channelId === undefined ? undefined : `Submitted from: <#${input.channelId}>`,
      messageLink === undefined || messageLink === "" ? undefined : `Message: ${messageLink}`,
      `Concern: ${concern}`,
      "Zelo has taken no moderation action. A human must acknowledge, assess, document any action, and offer an appeal path.",
    ].filter((line) => line !== undefined).join("\n"),
    acknowledgement: `Your concern was privately handed to human moderators as ${caseId}. Zelo did not notify the reported person or take action. If anyone is in immediate danger, contact the appropriate local emergency service.`,
  });
}
