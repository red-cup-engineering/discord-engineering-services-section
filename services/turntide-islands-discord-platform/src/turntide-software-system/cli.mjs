#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { renderOrchestrationSystem, turntideCarrier } from "./index.mjs";
import { buildTurntideSite, siteSummary, turntideStructuredData } from "./site.mjs";

const command = (process.argv[2] ?? "summary");

if (command === "emit") {
  writeJson(turntideCarrier());
} else if (command === "orchestration") {
  process.stdout.write(`${renderOrchestrationSystem()}\n`);
} else if (command === "structured-data") {
  writeJson(turntideStructuredData());
} else if (command === "summary") {
  writeJson(siteSummary());
} else if (command === "build-site") {
  const outputRoot = process.argv[3] ?? "dist/site";
  await writeSite(outputRoot);
  writeJson({ kind: "turntide-islands.build-site", outputRoot, files: buildTurntideSite().size });
} else {
  process.stderr.write("usage: turntide-islands [emit|orchestration|structured-data|summary|build-site [dir]]\n");
  process.exitCode = 2;
}

function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function writeSite(outputRoot) {
  const files = buildTurntideSite();
  await mkdir(outputRoot, { recursive: true });
  await Promise.all(Array.from(files, async ([filePath, contents]) => {
    const target = path.join(outputRoot, filePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, contents);
  }));
}
