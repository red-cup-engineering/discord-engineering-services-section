#!/usr/bin/env bash
# Ships Zelo's guild-shape projector and placement desk to the Discord host as
# self-contained bundles, with the guild shape record they read. The bot
# credential stays on the host; nothing here reads it.
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
info="$(git -C "$here" rev-parse --show-toplevel)"
host="${TTI_DISCORD_HOST:-red-cedar-gate}"
remote=services/turntide-islands-discord-platform
shape="$info/lib/emsenn/services/561-group/services/public-services-section/services/public-community-services-section/services/turntide-islands/data/records/discord-guild/turntide-islands.guild.json"
out="$(mktemp -d)"
trap 'rm -rf "$out"' EXIT
for entry in project-guild-shape place-offers; do
  # Bundled modules share one import.meta; house scripts that run as CLIs
  # under import.meta.main must not all fire inside a bundle.
  "$info/node_modules/.pnpm/node_modules/.bin/esbuild" "$here/src/turntide-software-system/scripts/$entry.mjs" \
    --bundle --platform=node --format=esm --target=node22 --define:import.meta.main=false --log-level=warning \
    --outfile="$out/$entry.mjs"
done
node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))' "$shape"
scp -q "$out/project-guild-shape.mjs" "$out/place-offers.mjs" "$host:$remote/shared/"
scp -q "$shape" "$host:$remote/shared/turntide-islands.guild.json"
scp -q "$here/deploy/systemd/tti-zelo-placement.service" "$here/deploy/systemd/tti-zelo-placement.timer" "$host:.config/systemd/user/"
ssh "$host" "mkdir -p $remote/shared/data/agent && systemctl --user daemon-reload && systemctl --user enable --now tti-zelo-placement.timer >/dev/null && systemctl --user is-active tti-zelo-placement.timer"
