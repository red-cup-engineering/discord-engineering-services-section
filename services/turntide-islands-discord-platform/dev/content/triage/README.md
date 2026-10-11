# Turntide Islands Triage Intake

This tree was established from `/home/emsenn/info` on 2026-07-02 while creating `@emsenn/turntide-islands`.

## Layout

- `prior-app/old-turntide-islands.discord.com/` contains a full copy of the previous `sites/triage.bare-cedar-fog.emsenn.net/src/apps/turntide-islands.discord.com` package.
- `SOURCES.txt` lists every copied triage file in this package.

## Removed: `from-ecosystem/`

This tree originally also had a `from-ecosystem/` directory: every file elsewhere in the checkout whose *content* matched `Turntide`, `turntide`, `Tideturn`, or `tideturn`, copied in wholesale with full nested path. That method over-collected badly: it pulled in whole unrelated documents (personal blog posts, journals, other people's character bios, math notes) over a single incidental mention, and because the source corpus is itself a backup-of-backups, the same incidental match got copied again for every historical snapshot containing it — one blog post appeared 8 times at 8 different paths.

Deleted 2026-07-02 after verifying (by content hash against the rest of the checkout) that every one of its 139 distinct files still exists elsewhere, mostly under `lib/emsenn/lib/triage/` — nothing here was a sole copy.

## Runtime Boundary

The old app depended on Discord, steward, vault, agent, HTTP, and jsnode packages.
Those files are preserved here as provenance only.
The executable package must contract each required faculty from its sovereign
provider; it has no umbrella-runtime dependency.
