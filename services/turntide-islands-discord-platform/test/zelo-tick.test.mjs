import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { executeZeloAction } from "../src/turntide-software-system/zelo-tick.mjs";

test("drafting a wire signal remains private and performs no Discord request", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "tti-zelo-tick-"));
  const store = path.join(root, "signals");
  const drafts = path.join(root, "drafts.jsonl");
  await mkdir(store, { recursive: true });
  await writeFile(path.join(store, "signal.json"), JSON.stringify({
    subject: "urn:tti:test-signal",
    claims: [
      { id: "title", proposition: { object: "A witnessed test signal" }, provenance: { witness: "test-wire" }, time: { asserted: "2026-08-29T20:00:00.000Z" } },
      { id: "url", proposition: { object: "https://example.test/signal" } },
    ],
  }));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("draft action attempted a Discord request"); };
  try {
    await executeZeloAction(
      { kind: "draft-next-signal" },
      { TTI_SIGNALS_STORE_DIR: store, TTI_SIGNAL_DRAFTS_FILE: drafts, DISCORD_GUILD_ID: "guild", DISCORD_BOT_TOKEN: "must-not-be-used" },
      { lastAlertedIslandCount: 0 },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
  const recorded = JSON.parse((await readFile(drafts, "utf8")).trim());
  assert.equal(recorded.status, "pending");
  assert.equal(recorded.channelHint, "weather-report");
  assert.match(recorded.content, /A witnessed test signal/u);
});
