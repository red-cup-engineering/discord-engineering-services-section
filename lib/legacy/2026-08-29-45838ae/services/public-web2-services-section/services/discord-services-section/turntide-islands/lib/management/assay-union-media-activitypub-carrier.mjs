#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EMPTY_WITNESS_ROOT, identifyJsonSemanticContent } from "@red-cup-engineering/semantic-content-identify-service";
const semanticId = (value) => identifyJsonSemanticContent({ objectKind: "turntide-islands.record", value, witnessRoot: EMPTY_WITNESS_ROOT }).token;

const TTI_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const PROPOSAL_PATH = join(TTI_ROOT, "content/contracts/union-media-activitypub-carrier-proposal.json");
const CUSTOMER = "urn:ame:turntide-islands";
const PROVIDER = "urn:ame:activitypub-services-section";

export async function assayUnionMediaActivityPubCarrier(options = {}) {
  const recordedAt = options.recordedAt;
  if (!Number.isFinite(Date.parse(recordedAt))) throw new TypeError("Union Media carrier assay requires an exact recordedAt instant");
  const proposal = options.proposal ?? JSON.parse(await readFile(options.proposalPath ?? PROPOSAL_PATH, "utf8"));
  if (proposal?.type !== "TTIUnionMediaActivityPubCarrierServiceProposal" || proposal?.customer !== CUSTOMER || proposal?.provider !== PROVIDER) throw new TypeError("Union Media carrier assay requires TTI's exact carrier proposal");
  if (proposal.providerAccepted !== false || proposal.publicHostingAccepted !== false || proposal.liveEffectsAuthorized !== false) throw new TypeError("Union Media carrier assay refuses to run against a proposal that is no longer unaccepted");

  const body = {
    type: "TTIUnionMediaActivityPubCarrierAssay",
    version: 1,
    recordedAt,
    customer: CUSTOMER,
    provider: PROVIDER,
    proposalId: proposal.id,
    status: "refused-provider-runtime-unavailable",
    failureCode: "declared-runtime-dependency-unavailable",
    reason: "A fresh customer-owned loopback assay could not load the provider's declared runtime dependency from the provider settlement; an already-running provider process is not a restartability or TTI service-acceptance proof.",
    unsignedInboxStatus: null,
    unsignedCallbackInvocations: 0,
    signedDeliveryObserved: false,
    exactRmnBytesRecovered: false,
    callbackInvocations: 0,
    providerPackageCopiedIntoTti: false,
    providerCustodyBytesInspected: false,
    persistentKeysCreated: false,
    externalPublicEffect: false,
    providerAccepted: proposal.providerAccepted,
    publicHostingAccepted: proposal.publicHostingAccepted,
    cashRevenueRecognized: false,
    monetaryProfitRecognized: false,
  };
  return Object.freeze({ ...body, id: semanticId(body) });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await assayUnionMediaActivityPubCarrier({ recordedAt: new Date().toISOString() });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
