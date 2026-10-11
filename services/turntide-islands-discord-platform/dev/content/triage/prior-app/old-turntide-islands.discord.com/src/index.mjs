import {
  discordCapabilityGrant,
  discordOrchestrationProfile,
  discordOrganizer,
  ARCHIVE_ELSEWHERE,
  CAPITAL_FORMS,
  EVALUATION_CRITERIA,
  HUMAN_ONLY,
  induceDiscordTopology,
  membershipProgram,
  renderOrchestrationSystem,
  renderMembershipSystem,
  summarizeMembershipProgram,
  summarizeOrchestrationProfile,
  toolsFor,

} from "@red-cup-engineering/organizing-with-discord";
import {
  catalogCorpus,
  knowledgeVaultRigging,
  knowledgeVaultRoot,
  searchCatalogDocuments,
} from "@red-cup-engineering/organizing-a-knowledge-vault";
import path from "node:path";
import { fileURLToPath } from "node:url";

const siteRoot = path.resolve(fileURLToPath(import.meta.url), "../..");

export const siteId = "turntide-islands.discord.com";
export const communityName = "Turntide Islands";
export const guildId = "turntide-islands";
export const organizerId = `discord-organizer:${guildId}`;

export const grantedCapabilities = Object.freeze([
  "read",
  "message",
  "manage-messages",
  "manage-channels",
  "manage-roles",
  "manage-personas",
  "manage-commands",
  "manage-memberships",
  "moderate",
  "measure",
]);

export const capabilityGrant = discordCapabilityGrant({
  capabilities: [...grantedCapabilities],
});

export const operationVocabulary = Object.freeze(
  toolsFor(capabilityGrant.capabilities).map((tool) => ({
    name: tool.name,
    description: tool.description ?? "",
  })),
);

export const organizer = discordOrganizer({
  id: organizerId,
  guildId,
});

export const topology = induceDiscordTopology(organizer.utterances);

export const vaultRoot = knowledgeVaultRoot(siteRoot);

export const vaultRigging = knowledgeVaultRigging({
  root: vaultRoot,
  rigs: [
    {
      inputKind: "newscable",
      name: "koios.news climate breakdown production",
      mount: "content/climate-breakdown",
      configPath: "../koios.news",
      href: "https://koios.news/",
    },
    {
      inputKind: "newswire",
      name: "Turntide Islands Discord archive",
      mount: "_archive",
      href: "https://turntide-islands.discord.com/_archive/",
    },
  ],
});

export const vaultCatalog = catalogCorpus(siteRoot, {
  path: "content",
  limit: 50,
  maxScan: 500,
});

export const climateBreakdownDocuments = Object.freeze(
  searchCatalogDocuments(vaultCatalog.documents, "climate breakdown", 12),
);

export const membershipGate = Object.freeze({
  role: "islander",
  roleIdEnv: "TURNTIDE_ISLANDER_ROLE_ID",
  unlocks: "Turntide Islands climate-breakdown knowledge vault",
  vaultMount: "content/climate-breakdown",
  fulfillment: "Discord membership grants the role; the role grants vault access and archive-assisted agent support.",
});

export const bootstrapChannels = Object.freeze([
  {
    name: "start-here",
    topic: "Orientation for Turntide Islands: what this community is for, how to ask the steward, and how to join member lanes.",
    access: "public",
  },
  {
    name: "weather-report",
    topic: "Compact climate, collapse, technology, and culture signals worth discussing now.",
    access: "public",
  },
  {
    name: "rot-watch",
    topic: "Memes, screenshots, jokes, dread-posting, and terminally-online climate signals treated as material for sense-making.",
    access: "public",
  },
  {
    name: "serious-threading",
    topic: "Member lane for slower threads, arguments, context recovery, and conversation that should not evaporate.",
    access: "member",
  },
  {
    name: "vault-briefings",
    topic: "Member lane for climate-breakdown vault briefings, reading paths, and agent-assisted synthesis.",
    access: "member",
  },
  {
    name: "archive-desk",
    topic: "Where useful Discord knowledge gets rescued into durable archive or vault material.",
    access: "member",
  },
  {
    name: "receipts",
    topic: "Source trails, links, citations, screenshots, and provenance for claims worth preserving.",
    access: "member",
  },
  {
    name: "moderator-bridge",
    topic: "Staff lane for steward recommendations, risk notes, and human-only judgment calls.",
    access: "staff",
  },
  {
    name: "ai-archipelago",
    topic: "Staff sandbox for agent-to-agent and bot-to-bot experiments before anything is moved into public or member lanes.",
    access: "staff",
  },
  {
    name: "admin-channel",
    topic: "Private staff lane where the steward pings the configured admin for human-only matters.",
    access: "staff",
  },
]);

export const bootstrapCommands = Object.freeze([
  {
    name: "ask",
    description: "Ask the Turntide steward for context or help.",
  },
  {
    name: "join",
    description: "Get Turntide membership and vault unlock instructions.",
  },
  {
    name: "vault",
    description: "Ask for vault access, reading paths, or archive retrieval.",
  },
]);

export const orchestrationProfile = discordOrchestrationProfile({
  id: "turntide-islands-climate-breakdown-community",
  guildId,
  charter:
    "Turntide Islands is a Discord-native community for people seriously talking through climate breakdown while still meeting the internet culture, humor, dread, and collapse-awareness they actually live inside.",
  audience: [
    "people tracking climate breakdown, adaptation, and social collapse",
    "younger and terminally online members whose first language for crisis may be memes, jokes, screenshots, and dread",
    "members who want a useful archive and agent-supported briefings rather than another disposable chat room",
  ],
  brandBoundary: {
    publicName: communityName,
    publicSeparation: ["koios.news"],
    internalSharedSystems: [
      "organizing-a-knowledge-vault",
      "climate-breakdown corpus",
      "agent run logs",
      "membership ledger",
      "newswire/source catalogs",
      "Discord archive exports",
    ],
    rule:
      "Turntide Islands and koios.news are publicly separate projects. Agents may share internal datastores and climate-breakdown production infrastructure, but public posts must not imply that Turntide is a Koios newsroom, funnel, or official community.",
  },
  roles: [
    {
      id: "tidewatcher",
      name: "Tidewatcher",
      remit: "Bring in climate, collapse, technology, and culture signals; translate fast-moving news into grounded discussion prompts.",
      posture: "curious, brief, meme-literate, never engagement-baiting",
      capabilities: ["read", "message", "measure"],
      channels: ["weather-report", "rot-watch", "serious-threading"],
      humanBoundary: ["do not adjudicate panic, trauma, conflict, or political legitimacy"],
    },
    {
      id: "vault-keeper",
      name: "Vault Keeper",
      remit: "Rescue useful Discord knowledge into durable vault material and reconnect old threads, Koios-adjacent research, and archive fragments.",
      posture: "careful, provenance-minded, quietly editorial",
      capabilities: ["read", "message", "measure"],
      channels: ["vault-briefings", "receipts", "archive-desk"],
      humanBoundary: ["do not publish member-private material outside its intended access lane"],
    },
    {
      id: "harbor-master",
      name: "Harbor Master",
      remit: "Shape onboarding, role access, channel topology, slash commands, and member pathways for an idle server becoming active.",
      posture: "practical, hospitable, low-drama",
      capabilities: ["read", "message", "manage-channels", "manage-roles", "manage-commands", "manage-memberships"],
      channels: ["welcome", "start-here", "moderator-bridge", "ai-archipelago"],
      humanBoundary: ["do not moderate conflict or perform care; recommend to human moderators"],
    },
    {
      id: "admin-pinger",
      name: "Admin Pinger",
      remit: "Move every human-only matter into the private admin channel with an explicit admin mention.",
      posture: "brief, factual, impossible to miss",
      capabilities: ["read", "message"],
      channels: ["admin-channel", "moderator-bridge"],
      humanBoundary: ["do not resolve the matter; only alert the admin with observations and the requested decision"],
    },
  ],
  lanes: [
    {
      id: "rot-surface",
      name: "Rot Surface",
      access: "public",
      purpose: "Let climate dread, jokes, screenshots, and weird internet signals enter without demanding seminar posture first.",
      sourceKinds: ["meme-stream", "member-report", "newswire"],
      channelHint: "rot-watch",
      cadence: "continuous, throttled by taste and non-duplication",
      output: "short prompts, lightly contextualized links, jokes that open a path into sense-making",
    },
    {
      id: "weather-report",
      name: "Weather Report",
      access: "public",
      purpose: "Turn breaking climate/collapse news into discussable observations without making the server feel like a newsroom.",
      sourceKinds: ["newswire", "member-report", "archive"],
      channelHint: "weather-report",
      cadence: "daily when there is real signal; quiet when there is not",
      output: "one compact post with source links, uncertainty, and a question worth answering",
    },
    {
      id: "serious-threading",
      name: "Serious Threading",
      access: "member",
      purpose: "Move high-signal public chatter into slower member threads where people can think, argue, and collect context.",
      sourceKinds: ["member-report", "knowledge-vault", "archive"],
      channelHint: "serious-threading",
      cadence: "as public conversations ripen",
      output: "thread prompts, summaries, and links back to the originating surface",
    },
    {
      id: "vault-briefings",
      name: "Vault Briefings",
      access: "member",
      purpose: "Give paying or role-granted members the durable value: climate-breakdown briefs, reading paths, and agent-assisted synthesis.",
      sourceKinds: ["knowledge-vault", "newswire", "archive"],
      channelHint: "vault-briefings",
      cadence: "weekly digest plus event-driven briefs",
      output: "briefing posts, vault links, unanswered questions, and research tasks",
    },
    {
      id: "admin-channel",
      name: "Admin Channel",
      access: "staff",
      purpose: "Private channel where the steward pings the admin for human-only matters, live risk, and decisions it must not take itself.",
      sourceKinds: ["moderator-note", "member-report", "archive"],
      channelHint: "admin-channel",
      cadence: "only when human attention is required",
      output: "short admin mention with matter, reason, and the action the steward did not take",
    },
    {
      id: "ai-archipelago",
      name: "AI Archipelago",
      access: "staff",
      purpose: "Private sandbox where the steward can stage bot-to-bot or agent-to-agent experiments without confusing public community surfaces.",
      sourceKinds: ["moderator-note", "archive", "member-report"],
      channelHint: "ai-archipelago",
      cadence: "only for explicit experiments, diagnostics, or multi-agent rehearsal",
      output: "contained experiment transcripts, summaries, and recommendations for whether anything should be promoted elsewhere",
    },
    {
      id: "moderator-bridge",
      name: "Moderator Bridge",
      access: "staff",
      purpose: "Surface recommendations, risk notes, channel-structure proposals, and human-only judgment calls to moderators.",
      sourceKinds: ["moderator-note", "archive", "member-report"],
      channelHint: "moderator-bridge",
      cadence: "only when action is warranted",
      output: "recommendations with observations, alternatives, and the reason the agent did not act directly",
    },
  ],
  sourceStreams: [
    {
      id: "collapse-climate-store",
      name: "Collapse Climate Store",
      kind: "newswire",
      mount: "../filum.561.group/store/collapse-climate",
      use: "Bring in climate breakdown news as prompts and briefings after source-quality and duplication checks.",
      publicAttribution: "Attribute the original article/source, not Koios or Filum.",
    },
    {
      id: "collapse-tech-store",
      name: "Collapse Tech Store",
      kind: "newswire",
      mount: "../filum.561.group/store/collapse-tech",
      use: "Track platform, AI, infrastructure, surveillance, and energy stories that intersect climate/collapse.",
      publicAttribution: "Attribute the original article/source; keep internal store names private.",
    },
    {
      id: "turntide-archive",
      name: "Turntide Archive",
      kind: "archive",
      mount: "_archive",
      use: "Reconnect old Turntide language, invitations, images, and Discord naming conversations to current community design.",
      publicAttribution: "Attribute as Turntide Islands archive material.",
    },
    {
      id: "climate-breakdown-vault",
      name: "Climate Breakdown Vault",
      kind: "knowledge-vault",
      mount: "content/climate-breakdown",
      use: "Support member briefings, reading paths, and synthesis that should survive outside Discord.",
      publicAttribution: "Attribute as Turntide member/vault material unless separately published elsewhere.",
    },
    {
      id: "member-rot",
      name: "Member Rot Stream",
      kind: "meme-stream",
      mount: "discord://turntide-islands/rot-watch",
      use: "Treat memes, screenshots, jokes, and dread-posting as signals to contextualize, not as engagement fuel.",
      publicAttribution: "Do not export member-originating posts outside their access lane without human approval.",
    },
  ],
  cadences: [
    {
      id: "daily-tide-check",
      trigger: "once per active day",
      action: "scan newswire/member signals, post at most one public weather report, and nominate anything durable for the vault",
    },
    {
      id: "weekly-vault-digest",
      trigger: "weekly",
      action: "publish a member vault briefing that separates public chatter, climate evidence, adaptation implications, and open questions",
    },
    {
      id: "spike-response",
      trigger: "major climate/collapse story or member anxiety spike",
      action: "open or revive a serious thread, summarize what is known, name uncertainty, and route care/conflict matters to humans",
    },
  ],
  escalation: [
    "member distress, trauma, or care needs",
    "conflict mediation or political judgment",
    "ban, timeout, purge, or deletion requests",
    "whether Turntide should publicly coordinate with another project or brand",
  ],
});

export const orchestrationDigest = summarizeOrchestrationProfile(orchestrationProfile);
export const orchestrationSystem = renderOrchestrationSystem(orchestrationProfile);

export const paidMembership = membershipProgram({
  id: "turntide-islands-membership",
  guildId: "env:DISCORD_GUILD_ID",
  currency: "usd",
  successUrl: "https://turntide-islands.discord.com/membership/success?session_id={CHECKOUT_SESSION_ID}",
  cancelUrl: "https://turntide-islands.discord.com/membership/cancel",
  providers: ["stripe-checkout", "stripe-stablecoin", "hive-transfer", "mock"],
  fulfillment: [
    "A cleared membership entitlement grants the islander Discord role.",
    "The islander role unlocks member Discord lanes and the climate-breakdown vault surface.",
    "Failed, cancelled, or expired entitlements remove the role after human-configured grace.",
    "Payment status changes are access events, not moderation judgments.",
  ],
  plans: [
    {
      id: "islander-monthly",
      name: "Islander",
      roleId: `env:${membershipGate.roleIdEnv}`,
      access: "member",
      interval: "month",
      priceUsd: "9.00",
      vaultMounts: [membershipGate.vaultMount],
      lanes: ["serious-threading", "vault-briefings"],
      benefits: [
        "member Discord lanes",
        "weekly climate-breakdown vault briefings",
        "agent-assisted reading paths and archive retrieval",
        "participation in structured serious threads",
      ],
      providerPrices: [
        {
          provider: "stripe-checkout",
          externalPriceId: "env:STRIPE_TURNTIDE_ISLANDER_MONTHLY_PRICE_ID",
          notes: "Recurring card/payment-method subscription through Stripe Checkout.",
        },
        {
          provider: "stripe-stablecoin",
          externalPriceId: "env:STRIPE_TURNTIDE_ISLANDER_STABLECOIN_PRICE_ID",
          cryptoAsset: "USDC",
          network: "stripe-supported",
          notes: "Recurring stablecoin subscription where Stripe support is enabled.",
        },
        {
          provider: "hive-transfer",
          cryptoAsset: "HIVE",
          network: "hive",
          notes: "Manual or polled transfer fallback, modeled after the flickering.561.group payment boundary.",
        },
      ],
    },
  ],
});

export const membershipDigest = summarizeMembershipProgram(paidMembership);
export const membershipSystem = renderMembershipSystem(paidMembership);

export function renderVaultSystem() {
  const rigs = vaultRigging.rigs
    .map((rig) => `- ${rig.name}: ${rig.mount}${rig.href === undefined ? "" : ` (${rig.href})`}`)
    .join("\n");
  const documents = climateBreakdownDocuments
    .map((document) => `- ${document.title}: ${document.path}`)
    .join("\n");
  return [
    `Knowledge vault root: ${vaultRoot.root}`,
    `Vault inputs:`,
    rigs.length > 0 ? rigs : "- none configured",
    `Climate-breakdown documents currently cataloged:`,
    documents.length > 0 ? documents : "- none cataloged yet",
    `Use these vault mounts as context anchors. Do not invent citations; when unsure, say what source or channel needs to be checked.`,
  ].join("\n");
}

export const vaultSystem = renderVaultSystem();

export function renderCapitalMeasurementSystem() {
  const durableForms = CAPITAL_FORMS
    .filter((form) => form.durable)
    .map((form) => `${form.label}: ${form.meaning}`)
    .join("\n- ");
  const trappedForms = CAPITAL_FORMS
    .filter((form) => !form.durable)
    .map((form) => `${form.label}: ${form.meaning}`)
    .join("\n- ");
  const enclosureQuestions = EVALUATION_CRITERIA
    .filter((criterion) => criterion.aboutEnclosure)
    .map((criterion) => `${criterion.key}: ${criterion.question}`)
    .join("\n- ");
  return [
    "Discord capital measurement:",
    "Treat Turntide Islands as a semi-private, programmable social jurisdiction, not only as chat.",
    "Use measure_server to read social, affective, archival, organizational, dependency, platform, data, and attention capital before making structural changes.",
    "Use rescue_knowledge when pins, decisions, rules, FAQs, onboarding, protocols, histories, or repeated answers are trapped in Discord's weak archive.",
    "Use surface_economy sparingly to show members who produces value, who captures it, and which capital is durable versus platform-trapped.",
    "Durable community capital:",
    `- ${durableForms}`,
    "Platform-trapped or extractive capital:",
    `- ${trappedForms}`,
    "Enclosure questions to keep visible:",
    `- ${enclosureQuestions}`,
    `Knowledge to rescue: ${ARCHIVE_ELSEWHERE.join(", ")}.`,
    `Human-only matters: ${HUMAN_ONLY.join(", ")}.`,
    "Do not turn social measurement into surveillance or scoring of individual worth. Aggregate channel and server activity for stewardship; route sensitive or disciplinary interpretations to humans.",
  ].join("\n");
}

export const capitalMeasurementSystem = renderCapitalMeasurementSystem();

export const stewardSystem = [
  "Operate Turntide Islands as an agent-assisted Discord community.",
  orchestrationSystem,
  membershipSystem,
  vaultSystem,
  capitalMeasurementSystem,
  "Turntide Islands is intended to run without daily human administration. Humans are rare escalation, not routine operators: keep care, conflict, bans, appeals, and governance with people, but autonomously cultivate onboarding, channels, commands, membership pathways, vault briefings, and ordinary member questions.",
  "When a human-only matter appears, post to the configured admin channel and mention the configured admin user. Do not merely note it in internal state.",
].join("\n\n");

export const autonomousCultivationGoal = [
  "Cultivate Turntide Islands as the flagship autonomous Discord community.",
  "Inspect the current server state before changing it.",
  "Make the smallest useful improvements that let the server operate without daily human administration.",
  "Prefer durable, obvious server infrastructure: start-here, weather-report, rot-watch, serious-threading, vault-briefings, archive-desk, receipts, ai-archipelago, and moderator-bridge lanes.",
  "Use ai-archipelago as the private staff sandbox for bot-to-bot or agent-to-agent experiments; summarize experiments before moving anything into public or member lanes.",
  "Register useful slash commands when absent, especially commands for orientation, membership, vault access, and asking the steward for help.",
  "Post at most one concise public orientation or weather-report message per run, unless the server state clearly asks for more.",
  "Use membership tools when member access, checkout, or vault unlocks are relevant.",
  "Start cultivation cycles by calling measure_server when you need to understand the server's current social, archival, attention, dependency, and enclosure state.",
  "Use rescue_knowledge to keep value from being trapped only in Discord; rescue rules, onboarding, FAQs, decisions, protocols, histories, and repeated answers into durable files.",
  "Use surface_economy only when a public or member-facing summary of trapped versus durable capital would help the community govern itself.",
  "Measure channels and aggregate activity as spatiotemporal social infrastructure, but do not rank people as worthier or expose sensitive participation patterns.",
  "Route care, conflict, bans, appeals, and governance to moderator-bridge using recommend_to_moderators; do not perform those human-only judgments.",
  "For every human-only recommendation, ensure the admin is mentioned in the admin channel; it should be visible to a rare human escalator without daily server patrol.",
  "When this cultivation cycle is done, call done with a one-line summary.",
].join("\n");

export function siteSummary() {
  return Object.freeze({
    siteId,
    communityName,
    guildId,
    organizerId,
    capabilities: capabilityGrant.capabilities,
    operations: operationVocabulary,
    topologyUtterances: topology.utterances.length,
    vault: {
      root: vaultRoot.root,
      rigCount: vaultRigging.rigCount,
      rigs: vaultRigging.rigs.map((rig) => ({
        inputKind: rig.inputKind,
        name: rig.name,
        mount: rig.mount,
        ...(rig.href === undefined ? {} : { href: rig.href }),
      })),
      documentCount: vaultCatalog.total,
      climateBreakdownDocuments: climateBreakdownDocuments.map((document) => ({
        title: document.title,
        path: document.path,
      })),
    },
    membershipGate,
    orchestration: orchestrationDigest,
    membership: membershipDigest,
    capitalMeasurement: {
      capitalForms: CAPITAL_FORMS.length,
      durableForms: CAPITAL_FORMS.filter((form) => form.durable).length,
      trappedForms: CAPITAL_FORMS.filter((form) => !form.durable).length,
      enclosureCriteria: EVALUATION_CRITERIA.filter((criterion) => criterion.aboutEnclosure).length,
      rescueKinds: ARCHIVE_ELSEWHERE,
      humanOnlyKinds: HUMAN_ONLY,
    },
    stewardSystemBytes: stewardSystem.length,
  });
}
