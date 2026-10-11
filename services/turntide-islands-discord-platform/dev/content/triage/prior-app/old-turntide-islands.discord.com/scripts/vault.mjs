#!/usr/bin/env node
import {
  climateBreakdownDocuments,
  renderVaultSystem,
  vaultCatalog,
  vaultRigging,
  vaultRoot,
} from "../src/index.mts";

process.stdout.write(`${JSON.stringify({
  kind: "turntide-islands.vault",
  root: vaultRoot,
  rigging: vaultRigging,
  catalog: {
    total: vaultCatalog.total,
    documents: climateBreakdownDocuments,
  },
  system: renderVaultSystem(),
}, null, 2)}\n`);
