import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTurntideWitnessJournalBinding, turntideWitnessJournalBindingFromEnvironment } from "../src/turntide-software-system/witness-journal-binding.mjs";

test("binding constructs over a data root and round-trips immutable content", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "twjb-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const binding = createTurntideWitnessJournalBinding(root);
  const bytes = Buffer.from("hello");
  const ni = `ni:///sha-256;${createHash("sha256").update(bytes).digest("base64url")}`;
  await binding.custody.put({ ni, bytes, mediaType: "text/plain" });
  assert.equal((await binding.custody.get(ni)).bytes.toString("utf8"), "hello");
});

test("environment construction is absent without a configured data root", () => {
  assert.equal(turntideWitnessJournalBindingFromEnvironment({}), null);
});
