/**
 * Invocation-bounded WitnessJournal byte custody for the Turntide Islands settlement.
 *
 * Current provider law (witness-journal-rdf-projection-service 1.0.2) refuses every
 * settlement read or write without an explicitly injected byte custody and
 * category lookup; there is deliberately no ambient singleton and no default
 * persistent path here, matching resource-brokerage-service-section's
 * createWitnessJournalDataRootBinding. The category index half is transitional: per the
 * 2026-07-27 chain-and-bucket canonical-data cut, chain eip155 state is the
 * durable reference holder and witness-journal-category-reference-index-service is slated
 * for retirement once the chain seal path is live.
 */
import { resolve } from "node:path";
import { createImmutableContentCustody } from "@red-cup-engineering/immutable-content-custody-service";
import { createFileStore } from "@red-cup-engineering/immutable-content-custody-service/file-store";
import { createCategoryReferenceIndex } from "@red-cup-engineering/category-reference-index-service";

function requiredDataRoot(value) {
  if (typeof value !== "string" || value.trim() === "") throw new Error("WitnessJournal data root must be named explicitly (TURNTIDE_WITNESS_JOURNAL_DATA_ROOT or an explicit option)");
  return resolve(value);
}

export function createTurntideWitnessJournalBinding(dataRoot) {
  const store = createFileStore(requiredDataRoot(dataRoot));
  return Object.freeze({
    custody: createImmutableContentCustody({ store }),
    categoryIndex: createCategoryReferenceIndex({ r2: store }),
  });
}

/** Binding from the environment, or null when no root is named — callers keep
 * their existing fail-closed behavior instead of inventing a default path. */
export function turntideWitnessJournalBindingFromEnvironment(source = process.env) {
  const root = source.TURNTIDE_WITNESS_JOURNAL_DATA_ROOT;
  if (typeof root !== "string" || root.trim() === "") return null;
  return createTurntideWitnessJournalBinding(root);
}
