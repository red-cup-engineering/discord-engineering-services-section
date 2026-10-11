# @red-cup-engineering/turntide-islands-discord-platform

This is the engineering implementation of the Turntide Islands Discord platform.
It consumes Turntide's public configuration and declared service boundaries to
provide the Discord-native runtime and durable knowledge-vault surface.

It replaces the earlier `@emsenn/turntide-islands.discord.com` app boundary.
The implementation owns its Discord-specific runtime and hires the RMN
conformance, Divination, Logical Inference, and A2A providers through their
declared standard boundaries. It has no ambient enterprise runtime and vendors
no provider settlement.

## Commands

- `pnpm check` - typecheck the package.
- `pnpm build` - build `dist/`.
- `pnpm test` - verify the built package surface and dependency boundary.
- `pnpm emit` - print the package carrier as JSON.
- `pnpm build:site` - write the static semantic site to `dist/site/`.
- `pnpm serve` - serve the static site, carrier JSON, and membership HTTP endpoints.
- `pnpm steward:check` - verify live Discord, membership, and agent endpoint environment.
- `pnpm steward:discover-env` - print the Discord environment values the bot can infer from the visible guild.
- `pnpm steward:live-permissions` - compare the live bot role permissions with the package's required Discord permission bitset.
- `pnpm steward:measure` - write a server measurement log and print the surface verdict.
- `pnpm steward:invite` - print the Discord OAuth invite URL from `DISCORD_CLIENT_ID`.
- `pnpm steward:bootstrap:smoke` - create the Turntide lanes, slash commands, islander role, and admin notice in memory.
- `pnpm steward:bootstrap` - create or verify those same surfaces against live Discord using `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, and `DISCORD_ADMIN_USER_ID`.
- `pnpm steward:probe` - verify live Discord identity and the configured agent endpoint.
- `pnpm steward:ingest-history` - backfill recent visible Discord messages into `data/agent/log/...`.
- `pnpm steward:ingest-history:smoke` - verify history ingestion and duplicate suppression in memory.
- `pnpm steward:membership:reconcile` - apply the local entitlement ledger to the live Discord islander role.
- `pnpm steward:membership:reconcile:smoke` - verify active/cancelled entitlement role changes in memory.
- `pnpm steward:membership:service:smoke` - verify stored entitlement reconciliation behavior.
- `pnpm steward:smoke` - run the local bootstrap plus message/reply steward path without network credentials.
- `pnpm steward:context:smoke` - verify logged Discord context can be reintroduced into a steward reply.
- `pnpm steward:gateway:smoke` - verify the message-to-reply steward path.
- `pnpm steward:supervision:smoke` - verify repeat gateway runs simulate reconnect supervision.
- `pnpm steward:archipelago:smoke` - verify private bot rehearsal stays contained in the staff lane.
- `pnpm steward:cultivate` - measure the live server and bootstrap missing infrastructure.
- `pnpm steward:cultivate:smoke` - verify cultivation moves an incomplete in-memory server to the surface.
- `pnpm steward:preflight` - run local smoke and then live readiness checks.
- `pnpm steward:run` - run the direct polling steward loop over Discord REST.
- `pnpm steward:snapshot-guild` - make a GET-only snapshot of guild metadata, roles, channels, onboarding, and the welcome screen at Turntide's public `data/state/discord-guild-state.json`. It deliberately excludes messages, members, invites, reaction users, and secrets.

## Runtime Boundary

The steward implementation is direct TypeScript in this package: Discord REST calls, in-memory smoke transport, membership ledger reconciliation, history ingestion, and a polling message loop.
The daily report is an RMN effect-cell composition. Divination uses its declared
HTTP projection; inference crosses one standard A2A 1.0 seam carrying one
recursively composed RMN bundle. It requires
`TURNTIDE_ACCOUNT_CAIP10`, `WITNESS_JOURNAL_RDF_AGENT`,
`DIVINATION_SERVICE_URL`, and `TTI_PROSE_INFERENCE_AGENT_CARD_URL`. The signed
sovereign inference-provider card supplies its exact law and smart-account
pinout; TTI contracts that provider directly. No provider may write
Turntide's interior.

## Contributor knowledge broker

The contributor market is fail-closed. When admitted, an author mentions the
TTI Knowledge Broker; the broker keeps only the Discord identity/message
pointer, DMs an opaque 30-minute offer-session link, and requires the author to
re-submit knowledge at `/knowledge/contribute`. GET does not consume the
session. One fully valid POST atomically claims it and records a private
`TTIKnowledgeContributionCandidate` with status `pending-admission`. Neither a
mention nor a candidate is a license, sale, credit, payment, revenue, or profit.

Activation requires all of:

- `TTI_KNOWLEDGE_BROKER_ENABLED=true`
- `TTI_KNOWLEDGE_BROKER_DISCORD_TOKEN` for a dedicated bot, or the incumbent
  `DISCORD_BOT_TOKEN`
- `TTI_KNOWLEDGE_INTAKE_BASE_URL` using production HTTPS
- `TTI_KNOWLEDGE_EFFECTIVE_TERMS_ID`
- `TTI_KNOWLEDGE_TERMS_FILE` containing that exact ID with status `effective`
- `TTI_KNOWLEDGE_MARKET_ADMISSION_FILE` containing an unexpired `admitted`
  pilot admission whose evidence, terms ID, and HTTPS origin match the runtime
- optional private overrides `TTI_KNOWLEDGE_BROKER_SESSIONS_FILE` and
  `TTI_KNOWLEDGE_CONTRIBUTION_CANDIDATES_FILE`

The running gateway verifies and digest-binds the exact terms bytes before it
opens. Startup recovers any atomically claimed candidate whose append-only
candidate or consumption projection was interrupted. The HTTPS proxy MUST
suppress `/knowledge/contribute` query strings from access logs, and deployment
remains prohibited until TTI's legal, age/capacity, privacy/security, tax, and
payout blockers are discharged in the product and circuit records.
