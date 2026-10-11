import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  publicTurntideContentPath,
  publicTurntideDataPath,
  publicTurntideRoot,
} from "../src/turntide-software-system/env.mjs";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("engineering consumes Turntide public content through an explicit root boundary", () => {
  const expectedDevelopmentRoot = path.resolve(
    appRoot,
    ...Array(17).fill(".."),
    "public-services-section",
    "services",
    "public-social-services-section",
    "services",
    "turntide-islands",
  );
  assert.equal(publicTurntideRoot({}), expectedDevelopmentRoot);
  assert.equal(publicTurntideContentPath({ TURNTIDE_PUBLIC_ROOT: "/tmp/turntide-public" }, "contracts", "example.json"), "/tmp/turntide-public/content/contracts/example.json");
  assert.equal(publicTurntideDataPath({ TURNTIDE_PUBLIC_ROOT: "/tmp/turntide-public" }, "agency", "receipt.json"), "/tmp/turntide-public/data/agency/receipt.json");
});
