import {
  communityName,
  lanes,
  membershipProgram,
  orchestrationProfile,
  packageName,
  renderOrchestrationSystem,
  siteId,
  siteUrl,
  turntideCarrier,
  vaultRigs,
} from "./index.mjs";
import { siteSummary } from "./site.mjs";

export function capitalMeasurementCarrier() {
  const byAccess = Object.fromEntries(["public", "member", "staff"].map((access) => [
    access,
    lanes.filter((lane) => lane.access === access).map((lane) => lane.name),
  ]));
  return {
    kind: "turntide-islands.capital-measurement",
    packageName,
    communityName,
    measuringCommand: "pnpm steward:measure",
    cultivationCommand: "pnpm steward:cultivate",
    dimensions: [
      "social capital",
      "affective capital",
      "archival capital",
      "organizational capital",
      "dependency capital",
      "platform capital",
      "data capital",
      "attention capital",
    ],
    enclosureRule: "Measure server state for stewardship and infrastructure decisions; do not score individual worth.",
    lanesByAccess: byAccess,
  };
}

export function membershipCarrier() {
  return {
    kind: "turntide-islands.membership",
    packageName,
    communityName,
    program: membershipProgram,
    discord: {
      guildIdEnv: "DISCORD_GUILD_ID",
      roleIdEnv: "TURNTIDE_ISLANDER_ROLE_ID",
      roleName: membershipProgram.role,
    },
    ledger: {
      entitlementsFileEnv: "TTI_MEMBERSHIP_ENTITLEMENTS_FILE",
      reconciliationCommand: "pnpm steward:membership:reconcile",
      checkoutPath: "/membership/checkout",
      providerReceiptPath: "/membership/payment-provider/receipt",
      retiredRawStripeWebhookPath: "/membership/stripe/webhook",
    },
  };
}

export function orchestrationCarrier() {
  return {
    kind: "turntide-islands.orchestration",
    packageName,
    communityName,
    profile: orchestrationProfile,
    renderedSystem: renderOrchestrationSystem(),
  };
}

export function summaryCarrier() {
  return {
    kind: "turntide-islands.summary",
    packageName,
    siteId,
    siteUrl,
    package: turntideCarrier(),
    site: siteSummary(),
  };
}

export function vaultCarrier() {
  return {
    kind: "turntide-islands.vault",
    packageName,
    communityName,
    vaultRigs,
    memberUnlocks: membershipProgram.unlocks,
    sourceStreams: vaultRigs.map((rig) => ({
      inputKind: rig.inputKind,
      mount: rig.mount,
      name: rig.name,
      href: rig.href,
    })),
  };
}
