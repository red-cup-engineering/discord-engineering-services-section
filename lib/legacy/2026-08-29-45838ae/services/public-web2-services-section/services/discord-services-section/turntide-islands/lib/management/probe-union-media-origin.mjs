#!/usr/bin/env node

import { execFile as execFileCallback } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { EMPTY_WITNESS_ROOT, identifyJsonSemanticContent } from "@red-cup-engineering/semantic-content-identify-service";
const semanticId = (value) => identifyJsonSemanticContent({ objectKind: "turntide-islands.record", value, witnessRoot: EMPTY_WITNESS_ROOT }).token;
import { recordWitnessJournalBatch } from "@red-cup-engineering/witness-journal-document-service";
import { turntideWitnessJournalBindingFromEnvironment } from "./settlement-witness-journal-binding.mjs";

const TTI_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const MANIFEST_PATH = join(TTI_ROOT, "content/configurations/union-media-origin-route-manifest.json");
const TTI_ACCOUNT = "eip155:31337:0xcfe1b9960ddbbe2b95e48114c281d7f24eb87b4d";
const TTI_ACTOR = "urn:ame:turntide-islands";
const SUBJECT = "acct:union-media@turntide-islands.561.group";
const UNIT = "turntide-islands-union-media-origin.service";
const execFile = promisify(execFileCallback);

async function readOriginUnitState(options = {}) {
  const run = options.execFile ?? execFile;
  const { stdout } = await run("systemctl", ["--user", "show", UNIT, "--no-pager", "-p", "ActiveState", "-p", "SubState", "-p", "MainPID", "-p", "NoNewPrivileges", "-p", "ProtectSystem", "-p", "ProtectHome", "-p", "PrivateDevices", "-p", "IPAddressDeny", "-p", "IPAddressAllow"]);
  const fields = Object.fromEntries(String(stdout).trim().split(/\r?\n/u).filter(Boolean).map((line) => { const at = line.indexOf("="); return [line.slice(0, at), line.slice(at + 1)]; }));
  const pid = Number(fields.MainPID);
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error("Union Media origin systemd unit has no live main process");
  const environmentNames = (await readFile(`/proc/${pid}/environ`, "utf8")).split("\0").filter(Boolean).map((entry) => entry.slice(0, entry.indexOf("="))).sort();
  const sensitiveEnvironmentNames = environmentNames.filter((name) => /(?:TOKEN|PASSWORD|SECRET|SIGNING|PRIVATE|DISCORD|WitnessJournal|EVM|CAIP)/u.test(name));
  const hardeningReady = fields.ActiveState === "active" && fields.SubState === "running" && fields.NoNewPrivileges === "yes" && fields.ProtectSystem === "strict" && fields.ProtectHome === "read-only" && fields.PrivateDevices === "yes" && fields.IPAddressDeny.includes("0.0.0.0/0") && fields.IPAddressDeny.includes("::/0") && fields.IPAddressAllow.includes("127.0.0.0/8") && fields.IPAddressAllow.includes("::1/128") && sensitiveEnvironmentNames.length === 0;
  return Object.freeze({ activeState: fields.ActiveState, subState: fields.SubState, noNewPrivileges: fields.NoNewPrivileges, protectSystem: fields.ProtectSystem, protectHome: fields.ProtectHome, privateDevices: fields.PrivateDevices, ipAddressDeny: fields.IPAddressDeny, ipAddressAllow: fields.IPAddressAllow, environmentNames, sensitiveEnvironmentNames, hardeningReady });
}

export async function probeUnionMediaOrigin(options = {}) {
  const fetchImpl = options.fetch ?? fetch, baseUrl = new URL(options.baseUrl ?? "http://127.0.0.1:18849/");
  if (!["127.0.0.1", "localhost"].includes(baseUrl.hostname) || baseUrl.protocol !== "http:" || baseUrl.username || baseUrl.password || baseUrl.pathname !== "/" || baseUrl.search || baseUrl.hash) throw new TypeError("local origin probe requires an exact HTTP loopback target");
  const manifest = options.manifest ?? JSON.parse(await readFile(options.manifestPath ?? MANIFEST_PATH, "utf8"));
  if (manifest?.type !== "TTIUnionMediaOriginRouteManifest" || manifest?.version !== 1 || manifest?.owner !== TTI_ACTOR || manifest?.origin !== "https://turntide-islands.561.group/") throw new TypeError("local origin probe requires TTI's exact route manifest");
  const probes = [
    { method: "GET", path: `/.well-known/webfinger?resource=${encodeURIComponent(SUBJECT)}`, expectedStatus: 200, expectedType: "application/jrd+json" },
    { method: "GET", path: "/.well-known/nodeinfo", expectedStatus: 200, expectedType: "application/json" },
    { method: "GET", path: "/nodeinfo/2.1", expectedStatus: 200, expectedType: "application/json" },
    { method: "GET", path: "/actors/union-media", expectedStatus: 200, expectedType: "application/activity+json" },
    { method: "GET", path: "/actors/union-media/outbox", expectedStatus: 200, expectedType: "application/activity+json" },
    { method: "POST", path: "/actors/union-media/inbox", expectedStatus: 503, expectedType: "application/json", body: "not-json-and-never-read" },
    { method: "POST", path: "/inbox", expectedStatus: 503, expectedType: "application/json", body: "not-json-and-never-read" },
    { method: "GET", path: "/.well-known/agent-card.json", expectedStatus: 503, expectedType: "application/json" },
    { method: "GET", path: "/.well-known/jwks.json", expectedStatus: 503, expectedType: "application/json" },
    { method: "GET", path: "/.well-known/tti-union-media-origin.json", expectedStatus: 200, expectedType: "application/json" },
    { method: "GET", path: "/summary.json", expectedStatus: 404, expectedType: "application/json" },
  ];
  const readings = [];
  for (const probe of probes) {
    const response = await fetchImpl(new URL(probe.path, baseUrl), { method: probe.method, headers: { connection: "close", ...(probe.body === undefined ? {} : { "content-type": "application/activity+json" }) }, body: probe.body });
    const contentType = response.headers.get("content-type") ?? "", body = await response.json();
    let exact = response.status === probe.expectedStatus && contentType.startsWith(probe.expectedType);
    if (probe.path.startsWith("/.well-known/webfinger")) exact &&= body?.subject === SUBJECT && body?.links?.[0]?.href === manifest.actor;
    if (probe.path === "/actors/union-media") exact &&= body?.id === manifest.actor && body?.type === "Service" && body?.discoverable === false && body?.publicKey === undefined;
    if (probe.path === "/actors/union-media/outbox") exact &&= body?.type === "OrderedCollection" && body?.totalItems === 0 && Array.isArray(body?.orderedItems) && body.orderedItems.length === 0;
    if (["/actors/union-media/inbox", "/inbox"].includes(probe.path)) exact &&= body?.reason === "hired-signature-verification-carrier-unavailable" && body?.bodyRead === false && body?.callbackInvoked === false && body?.advertiserRequestAdmitted === false && response.headers.get("connection") === "close";
    if (probe.path === "/.well-known/agent-card.json") exact &&= body?.reason === "signed-agent-card-not-provisioned";
    if (probe.path === "/.well-known/jwks.json") exact &&= body?.reason === "signed-agent-card-jwks-not-provisioned" && body?.privateKeyAccepted === false;
    if (probe.path === "/.well-known/tti-union-media-origin.json") exact &&= body?.type === manifest.type && JSON.stringify(body?.routes) === JSON.stringify(manifest.routes);
    if (probe.path === "/summary.json") exact &&= body?.reason === "path-not-admitted-by-origin-manifest";
    readings.push(Object.freeze({ method: probe.method, path: new URL(probe.path, baseUrl).pathname, expectedStatus: probe.expectedStatus, observedStatus: response.status, expectedContentType: probe.expectedType, observedContentType: contentType, exact }));
  }
  const unitState = options.unitState ?? await readOriginUnitState(options);
  const passed = readings.every((reading) => reading.exact) && unitState.hardeningReady === true;
  const body = {
    type: "TTIUnionMediaLocalOriginProbe",
    version: 1,
    recordedAt: options.recordedAt ?? new Date().toISOString(),
    customer: TTI_ACTOR,
    declaredOrigin: manifest.origin,
    actor: manifest.actor,
    localTarget: `${baseUrl.origin}/`,
    serviceUnit: UNIT,
    unitState,
    manifestVersion: manifest.version,
    routeReadings: readings,
    localDiscoveryReady: passed,
    rawInboxBodyRead: false,
    rawInboxCallbackInvoked: false,
    carrierActive: false,
    signedAgentCardActive: false,
    publicHostingAccepted: false,
    publicDeploymentClaimed: false,
    advertiserRequestAdmissions: 0,
    bidAdmissions: 0,
    externalRevenueReceiptCount: 0,
    recognizedRevenueMicros: 0,
    recognizedProfitMicros: null,
    externalEffect: false,
    status: passed ? "passed-local-origin-contract-ready-carrier-host-and-agent-card-pending" : "refused-local-origin-contract-probe-failed",
  };
  return Object.freeze({ ...body, id: semanticId(body) });
}

export async function recordUnionMediaOriginProbe(options = {}) {
  const probe = await probeUnionMediaOrigin(options);
  if (!options.witnessJournalAgentUrl) throw new Error("Union Media origin probe recording requires the contracted witness-journal RDF provider");
  const graph = semanticId(probe);
  const witnessJournal = options.witnessJournal ?? turntideWitnessJournalBindingFromEnvironment();
  await recordWitnessJournalBatch({ agentUrl: options.witnessJournalAgentUrl, ...(witnessJournal ?? {}), batch: { settlement: TTI_ACCOUNT, graph, recordedAt: probe.recordedAt, document: probe, assertions: [
    { subject: TTI_ACTOR, predicate: "urn:emsenn:venture:probed-union-media-local-origin", object: { kind: "iri", value: graph } },
    { subject: graph, predicate: "urn:emsenn:venture:local-discovery-ready", object: { kind: "literal", value: String(probe.localDiscoveryReady), datatype: "http://www.w3.org/2001/XMLSchema#boolean" } },
  ] } });
  return Object.freeze({ ...probe, receiptId: graph });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = process.argv.includes("--record") ? await recordUnionMediaOriginProbe({ witnessJournalAgentUrl: process.env.WITNESS_JOURNAL_RDF_AGENT }) : await probeUnionMediaOrigin();
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.localDiscoveryReady) process.exitCode = 2;
}
