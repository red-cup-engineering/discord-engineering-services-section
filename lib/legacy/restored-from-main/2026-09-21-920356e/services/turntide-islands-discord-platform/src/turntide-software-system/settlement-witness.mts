export type SettlementRecordInput = Readonly<{ category: string; recordedAt: string; record: unknown; assertions?: readonly unknown[] }>;

/** The app's callback carrier: document effects supplied by the caller or composed at its boundary. */
export interface SettlementWitness {
  records(category: string): Promise<readonly unknown[]>;
  record(input: SettlementRecordInput): Promise<unknown>;
}

// @ts-expect-error binding package has no published declaration yet.
import { loadSettlementAccount } from "@red-cup-engineering/settlement-account-binding-service";
import { querySettlementRecords, recordSettlementRecord } from "@red-cup-engineering/witness-journal-document-service";

/** Compose the app's concrete account and contracted document provider once at an environment boundary. */
export function turntideSettlementWitness(input: Readonly<{ settlementRoot: string; agentUrl: string; signal?: AbortSignal; custody?: unknown; categoryIndex?: unknown; caip2?: string; deploymentRegistry?: unknown }>): SettlementWitness {
  const account = loadSettlementAccount(input.settlementRoot, { caip2: input.caip2, deploymentRegistry: input.deploymentRegistry });
  const options = { agentUrl: input.agentUrl, signal: input.signal, custody: input.custody, categoryIndex: input.categoryIndex };
  return Object.freeze({
    records: (category: string) => querySettlementRecords(category, options),
    record: ({ category, recordedAt, record, assertions }: SettlementRecordInput) => recordSettlementRecord({ settlement: account.settlement, actor: account.actor, ...options, category, recordedAt, record, assertions }),
  }) as SettlementWitness;
}
