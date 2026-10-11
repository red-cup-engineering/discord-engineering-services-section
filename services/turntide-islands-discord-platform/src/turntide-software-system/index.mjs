import { UNION_MEDIA_DISCORD_ADMINISTRATOR_PERMISSIONS } from "./union-media-discord-boundary.mjs";

export const packageName = "@red-cup-engineering/turntide-islands-discord-platform";
export const siteId = "turntide-islands";
export const communityName = "Turntide Islands";
export const siteUrl = "https://turntide.561.group/";

export const membershipProgram = Object.freeze({
  role: "islander",
  unlocks: Object.freeze([
    "member Discord lanes",
    "project and research conversations",
    "community events and working sessions",
    "member-led proposals and showcases",
  ]),
  entitlement: "Turntide Islands community membership is free; completing Discord orientation grants the islander role.",
  fulfillment: "Discord onboarding and the islander role open the member community lanes. Paid products, if offered, use separate roles and terms.",
  cancellation: "Leaving a paid product never removes ordinary community membership and is not a moderation judgment.",
});

export const personas = Object.freeze([
  {
    id: "tidewatcher",
    name: "Tidewatcher",
    remit: "Bring in climate, collapse, technology, and culture signals; translate fast-moving news into grounded discussion prompts.",
    posture: "curious, brief, meme-literate, never engagement-baiting",
    humanBoundary: Object.freeze(["do not adjudicate panic, trauma, conflict, or political legitimacy"]),
  },
  {
    id: "vault-keeper",
    name: "Vault Keeper",
    remit: "Rescue useful Discord knowledge into durable vault material and reconnect old threads, research, and archive fragments.",
    posture: "careful, provenance-minded, quietly editorial",
    humanBoundary: Object.freeze(["do not publish member-private material outside its intended access lane"]),
  },
  {
    id: "harbor-master",
    name: "Harbor Master",
    remit: "Shape onboarding, role access, channel topology, slash commands, and member pathways for an idle server becoming active.",
    posture: "practical, hospitable, low-drama",
    humanBoundary: Object.freeze(["do not moderate conflict or perform care; recommend to human moderators"]),
  },
  {
    id: "admin-pinger",
    name: "Admin Pinger",
    remit: "Move every human-only matter into the private admin channel with an explicit admin mention.",
    posture: "brief, factual, impossible to miss",
    humanBoundary: Object.freeze(["do not resolve the matter; only alert the admin with observations and the requested decision"]),
  },
]);

export function persona(id) {
  const found = personas.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`unknown persona ${id}`);
  return found;
}

export const lanes = Object.freeze([
  {
    name: "start-here",
    access: "public",
    topic: "Orientation for Turntide Islands: what this community is for, how to ask the steward, and how to join member lanes.",
    persona: "harbor-master",
  },
  {
    name: "sky-desk",
    access: "public",
    topic: "Daily sky report — astrology/moon numbers infographic and lection, contracted from lenticule-science Divination and red-cup-engineering LISS. Not climate news; see #weather-report for that.",
    persona: "harbor-master",
  },
  {
    name: "weather-report",
    access: "public",
    topic: "Compact climate, collapse, technology, and culture signals worth discussing now.",
    persona: "tidewatcher",
  },
  {
    name: "rot-watch",
    access: "public",
    topic: "Memes, screenshots, jokes, dread-posting, and terminally-online climate signals treated as material for sense-making.",
    persona: "tidewatcher",
  },
  {
    name: "serious-threading",
    access: "member",
    topic: "Slower threads, arguments, context recovery, and conversation that should not evaporate.",
    persona: "tidewatcher",
  },
  {
    name: "vault-briefings",
    access: "member",
    topic: "Climate-breakdown vault briefings, reading paths, and agent-assisted synthesis.",
    persona: "vault-keeper",
  },
  {
    name: "archive-desk",
    access: "member",
    topic: "Where useful Discord knowledge gets rescued into durable archive or vault material.",
    persona: "vault-keeper",
  },
  {
    name: "receipts",
    access: "member",
    topic: "Source trails, links, citations, screenshots, and provenance for claims worth preserving.",
    persona: "vault-keeper",
  },
  {
    name: "moderator-bridge",
    access: "staff",
    topic: "Staff lane for steward recommendations, risk notices, and matters requiring human authority.",
    persona: "admin-pinger",
  },
  {
    name: "ai-archipelago",
    access: "staff",
    topic: "Private sandbox for bot-to-bot experiments and agent rehearsals.",
    persona: "harbor-master",
  },
]);

export function laneByName(name) {
  return lanes.find((lane) => lane.name.toLowerCase() === name.toLowerCase());
}

export function renderPersonaSystem(target, lane) {
  return [
    `You are ${target.name}, one of Turntide Islands' four stewarding personas (the others are ${personas.filter((candidate) => candidate.id !== target.id).map((candidate) => candidate.name).join(", ")} — do not speak for them).`,
    `Remit: ${target.remit}`,
    `Posture: ${target.posture}`,
    lane === undefined ? undefined : `You are speaking in #${lane.name}: ${lane.topic}`,
    "Human boundaries (never cross these; escalate to a human instead):",
    ...target.humanBoundary.map((item) => `- ${item}`),
    orchestrationProfile.publicBoundary,
  ].filter((line) => line !== undefined).join("\n");
}

export const bootstrapChannels = Object.freeze([
  ...lanes,
  {
    name: "admin-channel",
    access: "staff",
    topic: "Private lane where the steward pings the configured admin for human-only matters, live risk, and decisions it must not take itself.",
    persona: "admin-pinger",
  },
]);

export const bootstrapCommands = Object.freeze([
  {
    name: "ask",
    description: "Ask the Turntide steward for context or help.",
    options: Object.freeze([
      { name: "question", description: "What do you want to ask the Turntide steward?", required: true },
    ]),
  },
  {
    name: "join",
    description: "Join the free Turntide community and find your first conversation.",
  },
  {
    name: "help",
    description: "See what Zelo can do and where a human can help.",
  },
  {
    name: "rules",
    description: "Read the short Turntide community agreement.",
  },
  {
    name: "report",
    description: "Privately send a safety or moderation concern to human moderators.",
    dmPermission: false,
    options: Object.freeze([
      { name: "concern", description: "What happened and what help do you want?", required: true },
      { name: "message_link", description: "Optional Discord message link for context." },
    ]),
  },
  {
    name: "roles",
    description: "Add, remove, or list allowed interest and notification preferences.",
    options: Object.freeze([
      { name: "action", description: "Required: add, remove, or list.", required: true },
      { name: "role", description: "Role key from action:list; required for add or remove." },
    ]),
  },
  {
    name: "events",
    description: "Find current gatherings and learn how to host one.",
  },
  {
    name: "vault",
    description: "Ask for vault access, reading paths, or archive retrieval.",
  },
  {
    name: "l-space-login",
    description: "Confirm a pending L-Space browser login for a Turntide islander.",
    options: Object.freeze([
      { name: "code", description: "The one-time code shown by L-Space in this browser.", required: true },
    ]),
  },
  {
    name: "locality-pilot",
    description: "Submit one explicit no-charge locality-answer buyer query to TTI.",
    options: Object.freeze([
      { name: "question", description: "One non-personal practical question (20–500 characters).", required: true },
      { name: "subject", description: "Bounded topic, such as gardening or rainwater collection.", required: true },
      { name: "locality", description: "Town, city, county, or other non-personal locality.", required: true },
      { name: "use", description: "Type research, decision, or memory.", required: true },
      { name: "delivery_interest", description: "Type chat, vault, mcp, or a2a; no charge or answer promise occurs.", required: true },
      { name: "consent", description: "Type AGREE-PERMANENT-NONPERSONAL-QUERY exactly; see command help.", required: true },
    ]),
  },
  {
    name: "union-media-intent",
    description: "UHC private: refer nonbinding interest in a future TTI Union Media resource auction.",
    defaultMemberPermissions: UNION_MEDIA_DISCORD_ADMINISTRATOR_PERMISSIONS,
    dmPermission: false,
    options: Object.freeze([
      { name: "enterprise", description: "Union enterprise URN, such as urn:ame:example-enterprise.", required: true },
      { name: "destination", description: "HTTPS advertiser destination without query or fragment.", required: true },
      { name: "resource_class", description: "compute, research, data-access, image-access, editorial, moderation, operations, or other.", required: true },
      { name: "resource_offer", description: "Non-personal resource you could supply (20–300 characters).", required: true },
      { name: "auction_interest", description: "Type YES-FUTURE-AUCTION exactly.", required: true },
      { name: "consent", description: "Type AGREE-PERMANENT-NONPERSONAL-UNION-MEDIA-INTENT exactly.", required: true },
    ]),
  },
  {
    name: "union-media-verify",
    description: "UHC private: verify DNS control for one referred Union Media intent.",
    defaultMemberPermissions: UNION_MEDIA_DISCORD_ADMINISTRATOR_PERMISSIONS,
    dmPermission: false,
    options: Object.freeze([
      { name: "intent_receipt", description: "The ni:///sha-256 receipt returned by /union-media-intent.", required: true },
      { name: "verification", description: "Type VERIFY-DESTINATION-CONTROL exactly.", required: true },
    ]),
  },
  {
    name: "union-media-authenticate",
    description: "UHC private: authenticate a referred lead using its enterprise account commitment.",
    defaultMemberPermissions: UNION_MEDIA_DISCORD_ADMINISTRATOR_PERMISSIONS,
    dmPermission: false,
    options: Object.freeze([
      { name: "destination_proof", description: "The destination-control receipt returned by /union-media-verify.", required: true },
      { name: "transaction_hash", description: "Finalized enterprise typed-commitment transaction hash.", required: true },
      { name: "log_index", description: "TypedCommitment receipt log index as a decimal integer.", required: true },
      { name: "authentication", description: "Type AUTHENTICATE-UNION-MEDIA-ENTERPRISE exactly.", required: true },
    ]),
  },
  {
    name: "spacetime",
    description: "Read recent activity as a causal set: open threads, discourse islands, coordination cycles.",
  },
  {
    name: "preview-signal",
    description: "Admin only: draft the next undrafted climate-wire signal for review.",
  },
  {
    name: "approve-draft",
    description: "Admin only: post an approved signal draft to its channel.",
    options: Object.freeze([
      { name: "draft_id", description: "The draft id shown by /preview-signal.", required: true },
    ]),
  },
]);

export const vaultRigs = Object.freeze([
  {
    inputKind: "newscable",
    name: "Koios/news climate-breakdown production",
    mount: "content/climate-breakdown",
    href: "https://koios.news/",
  },
  {
    inputKind: "newswire",
    name: "Turntide Islands Discord archive",
    mount: "dev/content/triage/prior-app",
    href: "https://turntide.561.group/archive/",
  },
]);

export const orchestrationProfile = Object.freeze({
  name: communityName,
  platform: "discord",
  publicBoundary: "Turntide Islands runs its own climate-breakdown signal ingestion and vault, independent of koios.news's stores and agents; Turntide is not Koios's Discord, newsroom, funnel, or official community.",
  stewardDuty: Object.freeze([
    "notice signals",
    "bring in news and cultural material",
    "ask better questions",
    "rescue useful chat into the vault",
    "route human-only matters to people",
  ]),
  humanOnly: Object.freeze([
    "final moderation appeals",
    "identity-sensitive membership judgments",
    "public commitments on behalf of Turntide Islands",
    "decisions that bind Koios/news as a separate public project",
  ]),
  lanes,
  vaultRigs,
});

export const articles = Object.freeze([
  {
    title: "Turntide Islands Operating Model",
    slug: "operating-model",
    author: "emsenn",
    date: "2026-07-02T00:00:00.000Z",
    draft: false,
    description: "The community's public/member/staff lanes, vault relation, and public boundary.",
    tags: Object.freeze(["turntide-islands", "discord", "community"]),
    categories: Object.freeze(["operations"]),
    body: [
      "Turntide Islands is a Discord-native community for people seriously talking about climate breakdown without pretending that everyone arrives in a sober, academic, already-composed mode.",
      "",
      "The public surface lets climate dread, jokes, screenshots, links, and collapse-aware internet culture enter. The member surface turns that material into durable knowledge: briefings, reading paths, vault links, archive exports, and agent-assisted research tasks.",
      "",
      "The steward's job is not to farm engagement. It notices signals, brings in news and cultural material, asks better questions, rescues useful chat into the vault, and routes human-only matters to people.",
      "",
      orchestrationProfile.publicBoundary,
    ].join("\n"),
  },
  {
    title: "Climate Breakdown Knowledge Vault",
    slug: "climate-breakdown-knowledge-vault",
    author: "emsenn",
    date: "2026-07-02T00:00:00.000Z",
    draft: false,
    description: "The durable member-access vault mount for Turntide Islands climate-breakdown work.",
    tags: Object.freeze(["climate-breakdown", "turntide-islands", "vault"]),
    categories: Object.freeze(["knowledge-vault"]),
    body: [
      "Turntide Islands uses the climate-breakdown vault mount as the member-access knowledge store for research, field notes, guides, and agent-readable briefings.",
      "",
      "The Discord server handles membership, roles, discussion, and support. The vault is the durable substrate: what membership unlocks, what agents can search, and what climate work can reuse without becoming trapped inside chat.",
      "",
      `Membership role: ${membershipProgram.role}.`,
      `Unlocks: ${membershipProgram.unlocks.join(", ")}.`,
    ].join("\n"),
  },
]);

export const pages = Object.freeze([
  {
    title: "About",
    slug: "about",
    path: "about.md",
    frontMatter: Object.freeze({ title: "About" }),
    date: "2026-07-02",
    body: [
      "Turntide Islands is the Discord-community and knowledge-vault package carried under the 561 Group package tree.",
      "",
      "The runtime uses Turntide's own deterministic code and contracts for SEN, Divination, LISS, A2A, Discord, and provenance services at explicit boundaries. Prior steward material is digest-retained as provenance only.",
    ].join("\n"),
  },
  {
    title: "Lanes",
    slug: "lanes",
    path: "lanes.md",
    frontMatter: Object.freeze({ title: "Lanes" }),
    date: "2026-07-02",
    body: lanes.map((lane) => `## ${lane.name}\n\nAccess: ${lane.access}.\n\n${lane.topic}`).join("\n\n"),
  },
]);

export function turntideCarrier() {
  return Object.freeze({
    kind: "turntide-islands.package",
    packageName,
    siteId,
    communityName,
    siteUrl,
    membership: membershipProgram,
    orchestration: orchestrationProfile,
    articles,
    pages,
  });
}

export function renderOrchestrationSystem(profile = orchestrationProfile) {
  const laneLines = profile.lanes.map((lane) => `- #${lane.name} [${lane.access}]: ${lane.topic}`).join("\n");
  const dutyLines = profile.stewardDuty.map((duty) => `- ${duty}`).join("\n");
  const humanLines = profile.humanOnly.map((item) => `- ${item}`).join("\n");
  return [
    `${profile.name} orchestration profile`,
    "",
    profile.publicBoundary,
    "",
    "Steward duties:",
    dutyLines,
    "",
    "Human-only matters:",
    humanLines,
    "",
    "Lanes:",
    laneLines,
  ].join("\n");
}
