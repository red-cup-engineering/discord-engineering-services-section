# @emsenn/computing-with-discord

Agentic operation of a Discord server by **any** OpenAI-compatible endpoint.

Built directly on `@emsenn/computing-with-openai-agents`: any endpoint that
package can drive — `openai`, the in-environment NVIDIA / Groq / Cerebras clouds,
or a custom `EndpointSpec` — can here operate a Discord guild on its own. The
agent reads the server's state, decides what to do, and acts through tools:
sending messages, creating channels, roles, and threads, and minting **webhook
personas** (new bots) as the server's goals require. It is the same agentic-run
substrate the coding agents use, pointed at Discord.

## Layers

| subpath | concern |
| --- | --- |
| `./holography` | the bot token as presence, never value — the only reader of the secret, with the two boundaries below |
| `./transport` | the thin Discord REST binding, plus `inMemoryGuild` for token-free dry runs and tests |
| `./gateway` | the thin Discord Gateway v10 receive side (live events) |
| `./operations` | the Discord operation vocabulary as agent `ToolDefinition`s, gated by the capability each needs |
| `./capital` | the corpus's theory of Discord (`capital.md`, `discord.md`) as carriers: the §2 sixteen capital forms, §13 evaluation framework, §12 durable-vs-trapped + automate-vs-human lists, and pure scoring |
| `./witnessing` | observe a guild through the transport and project its measurement into the `@emsenn/relating` topology and the data mount (the measurement analogue of `holography`) |
| `./enclosure` | the de-enclosing act — rescue buried knowledge out of Discord's weak archive into durable, exportable markdown the community owns |
| `./policy` | the §12 automate-vs-keep-human boundary, enforced: human-reserved actions become recommendations, never autonomous acts |
| `./dispatch` | execute one tool call against the transport, settling it into a `running` `ToolRun` and emitting the topology it grew |
| `./topology` | guilds, channels, roles, and personas as `@emsenn/relating` meme carriers, mounted with the agent that operates them |
| `./loop` | the tool-executing agentic run: infer → act → observe → repeat, settling into the shared `AgentRun` carrier |
| `./tending` | the autonomous pulse — one agentic run per received message — and `tendGuild`, which runs a guild autonomously until closed |

## Capabilities are the permission surface

Each operation declares the capability it needs (`read`, `message`,
`manage-messages`, `manage-channels`, `manage-roles`, `manage-personas`,
`manage-commands`, `moderate`). An agent is handed exactly the tools its grant
allows: pass `ALL_CAPABILITIES` for full autonomy, or a subset to scope what it
may do — "given the appropriate permissions" made literal.

## Parity with production bot frameworks

This is the surface a modern Discord bot (discord.js / discord.py, MEE6,
Carl-bot, Dyno) is built on, here driven by an autonomous agent rather than
hand-written handlers:

| capability | covered by |
| --- | --- |
| send / edit / delete messages, reactions, pins, bulk-delete (purge) | `send_message`, `edit_message`, `delete_message`, `add_reaction`, `pin_message`, `bulk_delete` |
| **rich embeds** (titled cards, fields, colors) | `send_message` `embed` arg |
| **interactive components** — buttons & select menus | `send_message` `buttons` arg + the `interaction` event |
| **slash commands** — register, list, delete, respond | `register_command`, `list_commands`, `delete_command`, `respond_interaction` |
| channels / categories / threads / forums | `create_channel`, `modify_channel`, `delete_channel`, `create_thread` |
| roles + role assignment (reaction-role-style flows) | `create_role`, `assign_role`, `remove_role`, `delete_role` |
| **moderation** — kick, ban (with message purge), timeout/mute | `kick_member`, `ban_member`, `timeout_member` |
| direct messages | `send_dm` |
| **welcome automation** (on member join) | the `member-join` event → tending pulse |
| multiple bot identities in one server | webhook **personas** (`create_persona`, `post_as_persona`) |
| event-driven autonomy | the gateway → `tending` pulse, one agentic run per event |
| safety: default-deny `@everyone`/`@here` pings | `allowedMentions` on every send |

What a hand-written bot does with code, the agent does by **deciding** — and it can
extend its own surface at runtime (registering a new command, minting a new
persona) the way a developer would ship a new handler.

## Measuring and de-enclosing the server's political economy

This is where the package departs from every other bot framework. It is grounded
in the corpus's actual theory of Discord —
`content/library/applied-sciences/communication/content/discord/capital.md`
("What Is the Capital of Discord?") and `discord.md` ("Discord as Social-Technical
Infrastructure"). That theory says Discord's distinctive capital is **dependency
capital**: value captured precisely when the relationships, knowledge, and care a
community builds *cannot be exported, governed, or reproduced elsewhere*. So a good
agent's job is not to maximize engagement — that deepens the enclosure — but to
**make the political economy legible and reduce the enclosure**.

- **measure_server** — reads the guild as the §13 evaluation framework and the §2
  sixteen capital forms, scoring how much of its value is platform-trapped vs.
  community-durable, its dependency/switching-cost intensity, and what knowledge is
  buried in chat. Projected as charges into the same `@emsenn/relating` topology and
  data mount the agents dream over.
- **rescue_knowledge** — treats Discord's pins/search as the *anti-archive*
  `discord.md` names ("buries knowledge as fast as it records it") and exports buried
  rules, FAQs, decisions, onboarding, and histories into durable, portable markdown
  the community owns — additively; the Discord original is untouched.
- **surface_economy** — posts a plain, legible summary so members can see who
  produces value and who captures it.
- **The §12 human boundary, enforced.** `policy` reserves conflict mediation, care,
  ban appeals, crisis decisions, and governance to people. Under the default
  `enforce` gate, `kick_member` / `ban_member` / `timeout_member` / `bulk_delete` /
  `delete_role` / `delete_channel` are **not executed** — they become
  recommendations to the human moderators (`recommend_to_moderators`). The agent
  automates only what §12 permits: spam filtering, role assignment, reminders,
  scheduling, FAQ retrieval, low-stakes onboarding.

```
discord-agent measure --dry --rescue          # measure a sample guild and rescue its buried knowledge
discord-agent measure --guild G --rescue --root ./data
```

A measurement run prints the enclosure %, the capital bars (durable ▣ / trapped ▤),
the weak §13 criteria (where to act), and exports buried knowledge to
`./data/durable/<guild>/*.md` — files that exist *outside* Discord, lowering the
server's exportability debt each time.

## Bins

```
discord-agent tools                        # the operation vocabulary
discord-agent run --dry --goal "…"         # one agentic run vs an in-memory guild (no token)
discord-agent run --guild G --goal "…"     # one agentic run vs a live guild
discord-agent measure --dry --rescue       # measure the political economy + de-enclose
discord-agent tend --guild G --charter "…" # operate the guild autonomously (gateway loop)

discord-ops tools                          # discovery (JSON)
discord-ops token                          # redacted bot-token presence projection
echo '{"name":"create_channel","arguments":{"name":"welcome"}}' \
  | discord-ops exec --guild G             # run one operation, JSONL outcome
```

`discord-ops` is the thin stdin/stdout package-bin surface the 561 Group
Operations Manifold projects; `discord-agent` is the operator's entry point.

## Example

```
$ discord-agent run --dry --goal "Welcome new members: post in #general, create \
    an #introductions channel and a 'Concierge' persona that greets there."

run · guild guild-0 · groq/llama-3.1-8b-instant · stabilized · 1 step(s)
stop: final-answer
summary: Welcomed new members and created #introductions channel with Concierge persona.
topology edges grown: 6

dry-run guild after the run:
  channels: general, off-topic, #introductions
  personas (bots): Concierge
  posts:
    [agent] Welcome to our community! Please check out #introductions to introduce yourself.
```

## Environment

- An inference key: `NVIDIA_API_KEY` / `GROQ_API_KEY` / `CEREBRAS_API_KEY` /
  `OPENAI_API_KEY` (the first present is used; override with `--endpoint`).
- For live operation: `DISCORD_BOT_TOKEN` (or `DISCORD_TOKEN`) for a bot with the
  guild permissions matching the capabilities you grant, and the **Message
  Content** privileged intent enabled for the gateway tending loop.

Dry runs need only an inference key — the in-memory guild stands in for Discord,
so the whole loop is exercised with no token and no network to Discord.
