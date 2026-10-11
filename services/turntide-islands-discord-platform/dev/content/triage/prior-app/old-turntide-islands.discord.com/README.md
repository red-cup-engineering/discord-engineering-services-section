# turntide-islands.discord.com

Turntide Islands is the Discord-community site and archive for the material that was previously scattered through the super-repo.

This package is intentionally downstream of `@emsenn/organizing-with-discord` and `@emsenn/organizing-a-knowledge-vault`.

The Discord organizing package declares the server capability grant, exposes the operation vocabulary, and seeds a Discord organizer topology for the community.
The knowledge-vault package makes the site root a vault root: Discord membership can grant access to `content/climate-breakdown/`, while Koios/news production and the local Discord archive are rigged as vault inputs.

The site also instantiates a Discord orchestration profile.
That profile names the agent roles, public/member/staff lanes, cadences, and public brand boundary: Turntide Islands and koios.news may share internal infrastructure, but they are separate projects in public.

Agent steward actuator:

- `pnpm steward:check` - verify the Turntide steward can see its Discord token, NVIDIA/OpenAI-compatible endpoint key, runtime membership role env, and run configuration.
  Stripe checkout price env is reported separately and does not block the Discord agent runtime.
- `pnpm steward:discover-env` - with a live Discord token, resolve the bot application id, Turntide guild id, guild-owner admin fallback, and any existing `admin-channel` / `islander` ids into copyable non-secret env lines.
- `pnpm steward:live-permissions` - compare the bot's current server role permissions with the Turntide capability grant and print the repair invite when Discord cannot yet perform live bootstrap or moderation operations.
- `pnpm steward:measure` - with live Discord access, read the server's channel, role, pin, webhook, and recent-message shape, then settle the Discord capital and enclosure measurement into the steward data mount.
- `pnpm steward:ingest-history` - with live Discord access, read recent messages from every channel the bot can access and append deduped `discord-message` entries to the steward data mount without printing message contents.
- `pnpm steward:invite` - print the OAuth2 invite URL from `DISCORD_CLIENT_ID`.
- `pnpm steward:bootstrap:smoke` - run a token-free in-memory Discord setup pass that creates/verifies the lanes, `/ask`, `/join`, `/vault`, the `islander` role, the `ai-archipelago` bot sandbox, and an admin-channel mention.
- `pnpm steward:bootstrap` - with a live Discord token, create or verify the Turntide server lanes, slash commands, `islander` role, and admin notice; it gates staff/member lanes with Discord permission overwrites and prints `DISCORD_GUILD_ID`, `DISCORD_ADMIN_CHANNEL_ID`, and `TURNTIDE_ISLANDER_ROLE_ID`.
- `pnpm steward:preflight` - run the local message-pulse smoke test, then the live environment readiness gate.
- `pnpm steward:probe` - after rotated live secrets are configured, make a real Discord REST check and a tiny OpenAI-compatible endpoint call.
- `pnpm steward:smoke` - run a token-free in-memory Turntide message pulse and confirm that an agent answer is posted back to the source channel.
- `pnpm steward:context:smoke` - run two token-free message pulses and prove the second OpenAI-compatible call receives rendered server grounding from the first.
- `pnpm steward:gateway:smoke` - run the actual `runSteward` app runner with an injected Discord gateway event and prove a user message posts an agent reply to the source channel and is ingested into the data mount without Discord or NVIDIA credentials.
- `pnpm steward:supervision:smoke` - run the app runner through a simulated gateway close, prove it reconnects with backoff, then verify the next user message still receives a source-channel agent reply.
- `pnpm steward:archipelago:smoke` - run a token-free bot-to-bot rehearsal in the staff-only `ai-archipelago` sandbox, verify it does not post into public lanes, and ping the admin lane with the experiment summary.
- `pnpm steward:membership:reconcile:smoke` - run a token-free membership ledger check that proves a cancelled Stripe entitlement replaces the earlier potential entitlement and removes the `islander` role.
- `pnpm steward:membership:service:smoke` - import the HTTP service membership reconciler without opening a listener, read a durable ledger, apply the role projection through an in-memory guild, and verify the service log summary.
- `pnpm steward:membership:reconcile` - with live Discord credentials, read the durable membership entitlement ledger and apply the current role projection.
- `pnpm steward:cultivate:smoke` - run a token-free proactive cultivation cycle that creates a lane, registers a command, and posts through the same operation loop the live steward uses.
- `pnpm steward:cultivate` - run one live, readiness-gated cultivation cycle that can inspect and improve the server without waiting for a user message.
- `pnpm steward:run` - connect the Discord gateway and turn user messages into OpenAI-compatible agent pulses grounded in the Turntide orchestration, membership system, and local context mount.
  Each pulse line reports the projected input/output token use, and configured pricing appears as dollars.

Set `DISCORD_BOT_TOKEN` or `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID`, `DISCORD_ADMIN_CHANNEL_ID`, `DISCORD_ADMIN_USER_ID`, `NVIDIA_API_KEY` or `API_KEY_NVIDIA_NIM`, `TURNTIDE_ISLANDER_ROLE_ID`, and the Stripe price env vars before turning it on.
Optional overrides: `DISCORD_SERVER_NAME`, `DISCORD_BOT_NAME`, `DISCORD_ADMIN`, `TTI_AGENT_ENDPOINT`, `TTI_AGENT_MODEL`, `TTI_AGENT_DATA_ROOT`, `TTI_CONTEXT_BUDGET`, `TTI_GATE_MODE`, `TTI_MEMBERSHIP_ENTITLEMENTS_FILE`, `TTI_MEMBERSHIP_RECONCILE_INTERVAL_MS`, and the optional `TTI_COST_*` projection rates.
Use `.env.example` as the checklist for live deployment; `src/steward.mts`, `src/serve.mts`, and `src/ingest-history.mts` load a local `.env` in this package and then the repo-root `.envrc` before reading the ambient environment.
See `RUNBOOK.md` for the turn-on sequence and smoke test.

Preview endpoints:

- `/summary.json` - the site summary, including Discord tools, vault rigging, and orchestration and membership digests.
- `/orchestration.json` - the full orchestration carrier.
- `/orchestration.txt` - a prompt-readable projection of the orchestration carrier for agent runs.
- `/membership.json` - the paid membership carrier: plans, providers, vault access, and Discord role fulfillment.
- `/membership.txt` - a prompt-readable projection of the membership carrier.

Archive material moved from elsewhere in the repo lives under `_archive/moved/`.
Files that merely mention Turntide Islands, but belong to another potential package or persona library, are listed in `_archive/references.md`.
