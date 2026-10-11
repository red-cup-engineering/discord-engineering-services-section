

/** The app's callback carrier: document effects supplied by the caller or composed at its boundary. */

// @ts-expect-error binding package has no published declaration yet.
import { loadSettlementAccount } from "@red-cup-engineering/ethereum-engineering-services-section/settlement-account-binding";
import { querySettlementRecords, recordSettlementRecord } from "@red-cup-engineering/witness-journal-document-service";

/** Compose the app's concrete account and contracted document provider once at an environment boundary. */
export function turntideSettlementWitness(input) {
  const account = loadSettlementAccount(input.settlementRoot, { caip2: input.caip2, deploymentRegistry: input.deploymentRegistry });
  const options = { agentUrl: input.agentUrl, signal: input.signal, custody: input.custody, categoryIndex: input.categoryIndex };
  return Object.freeze({
    records: (category) => querySettlementRecords(category, options),
    record: ({ category, recordedAt, record, assertions }) => recordSettlementRecord({ settlement: account.settlement, actor: account.actor, ...options, category, recordedAt, record, assertions }),
  });
}
