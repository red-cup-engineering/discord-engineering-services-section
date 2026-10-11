// The one intake for content entering Turntide's channels. Offering services
// never post to Discord themselves and never hold the bot credential: they
// send TTIPlacementOffer values to Zelo's placement desk on the Discord host
// over SSH, and Zelo routes, paces, and posts.
import { spawn } from "node:child_process";

export const placementHost = Object.freeze({
  host: "red-cedar-gate",
  node: "/home/emsenn/.nvm/versions/node/v24.16.0/bin/node",
  root: "/home/emsenn/services/turntide-islands-discord-platform",
});

/**
 * TTIPlacementOffer v1: { type, version, key, kind: "video" | "news",
 * source: { id, name }, item: { url, title, summary?, tags?, published? },
 * subjects?: [declared], hints?: [weak] }. `key` is the dedupe identity.
 */
export function admitPlacementOffer(raw) {
  const fail = (reason) => { throw new TypeError(`placement offer ${raw?.key ?? "?"}: ${reason}`); };
  if (raw?.type !== "TTIPlacementOffer" || raw.version !== 1) fail("must be TTIPlacementOffer v1");
  if (typeof raw.key !== "string" || raw.key.length === 0 || raw.key.length > 300) fail("key must be 1-300 characters");
  if (raw.kind !== "video" && raw.kind !== "news") fail("kind must be video or news");
  if (typeof raw.source?.id !== "string" || typeof raw.source?.name !== "string" || raw.source.name.length === 0 || raw.source.name.length > 100) fail("source needs an id and a 1-100 character name");
  const item = raw.item ?? {};
  let url;
  try { url = new URL(item.url); } catch { fail("item.url must be a URL"); }
  if (url.protocol !== "https:") fail("item.url must be https");
  if (typeof item.title !== "string" || item.title.trim().length === 0 || item.title.length > 300) fail("item.title must be 1-300 characters");
  if (item.summary !== undefined && (typeof item.summary !== "string" || item.summary.length > 2000)) fail("item.summary must be at most 2000 characters");
  if (item.tags !== undefined && (!Array.isArray(item.tags) || item.tags.some((tag) => typeof tag !== "string"))) fail("item.tags must be strings");
  if (item.published !== undefined && !Number.isFinite(Date.parse(item.published))) fail("item.published must be a date");
  if(item.resources!==undefined&&(!Array.isArray(item.resources)||item.resources.length>2||item.resources.some(resource=>!['image/png','application/pdf'].includes(resource.mimeType)||typeof resource.label!=='string'||resource.label.length>100||!/^https:\/\/drive\.google\.com\//u.test(resource.url??''))))fail('teaching resources must be at most two public Drive images or PDFs');
  for (const field of ["subjects", "hints"]) {
    if (raw[field] !== undefined && (!Array.isArray(raw[field]) || raw[field].some((subject) => typeof subject !== "string"))) fail(`${field} must be subject names`);
  }
  return Object.freeze({
    type: "TTIPlacementOffer",
    version: 1,
    key: raw.key,
    kind: raw.kind,
    source: { id: raw.source.id, name: raw.source.name },
    item: {
      url: url.href,
      title: item.title.trim(),
      ...(item.summary === undefined || item.summary.trim() === "" ? {} : { summary: item.summary.trim() }),
      ...(item.tags === undefined ? {} : { tags: item.tags.slice(0, 30) }),
      ...(item.published === undefined ? {} : { published: new Date(item.published).toISOString() }),
      ...(item.resources===undefined?{}:{resources:item.resources.map(({label,url,mimeType})=>({label,url,mimeType}))}),
    },
    ...(raw.subjects === undefined ? {} : { subjects: raw.subjects }),
    ...(raw.hints === undefined ? {} : { hints: raw.hints }),
  });
}

/** Hand offers to Zelo's placement desk; resolves with the desk's report of what was admitted and posted. */
export function offerToZelo(offers, { live = true, host = placementHost } = {}) {
  const admitted = offers.map(admitPlacementOffer);
  const command = [
    `cd ${host.root} &&`,
    host.node,
    "--env-file=runtime.env",
    "shared/place-offers.mjs",
    "--shape shared/turntide-islands.guild.json",
    "--ledger shared/data/agent/placement-ledger.json",
    ...(live ? ["--live"] : []),
  ].join(" ");
  return new Promise((resolve, reject) => {
    const ssh = spawn("ssh", ["-o", "BatchMode=yes", "-o", "ConnectTimeout=10", host.host, command], { stdio: ["pipe", "pipe", "pipe"] });
    let output = "", error = "";
    ssh.stdout.on("data", (chunk) => { output += chunk; });
    ssh.stderr.on("data", (chunk) => { error += chunk; });
    ssh.on("error", reject);
    ssh.on("close", (code) => code === 0 ? resolve(JSON.parse(output)) : reject(new Error(`Zelo placement failed: ${error.trim() || `SSH exit ${code}`}`)));
    ssh.stdin.end(JSON.stringify(admitted));
  });
}
