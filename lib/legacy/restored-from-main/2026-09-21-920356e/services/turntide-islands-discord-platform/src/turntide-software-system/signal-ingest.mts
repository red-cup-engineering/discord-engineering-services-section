import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fetchFeedItems, type FeedItem } from "./feed-parser.mts";

/**
 * Turntide's own climate-signal intake: real public RSS feeds, fetched and
 * stored by this package, not read out of another site's data directory.
 * The claim-bundle shape (subject/claims/provenance/force/status) matches
 * what climate-signals.mts already reads — chosen because it's a real,
 * useful provenance format, not because it's shared storage with anything.
 */
export const DEFAULT_CLIMATE_SOURCES: readonly string[] = Object.freeze([
  "https://www.theguardian.com/environment/climate-crisis/rss",
  "https://grist.org/feed/",
  "https://www.carbonbrief.org/feed/",
  "https://insideclimatenews.org/feed/",
]);

export interface FeedIngestResult {
  readonly source: string;
  readonly witness: string;
  readonly written: number;
  readonly skipped: number;
  readonly error?: string;
}

export async function ingestClimateSignals(
  storeDir: string,
  sources: readonly string[] = DEFAULT_CLIMATE_SOURCES,
  options: { fetchImpl?: typeof fetch } = {},
): Promise<readonly FeedIngestResult[]> {
  const results: FeedIngestResult[] = [];
  for (const source of sources) {
    const witness = witnessOf(source);
    try {
      const items = await fetchFeedItems(source, options);
      let written = 0;
      let skipped = 0;
      for (const item of items) {
        const wrote = await writeSignalBundleIfAbsent(storeDir, witness, item);
        if (wrote) written += 1;
        else skipped += 1;
      }
      results.push(Object.freeze({ source, witness, written, skipped }));
    } catch (error) {
      results.push(Object.freeze({ source, witness, written: 0, skipped: 0, error: error instanceof Error ? error.message : String(error) }));
    }
  }
  return Object.freeze(results);
}

function witnessOf(sourceUrl: string): string {
  try {
    return new URL(sourceUrl).hostname.replace(/^www\./u, "");
  } catch {
    return sourceUrl;
  }
}

async function writeSignalBundleIfAbsent(storeDir: string, witness: string, item: FeedItem): Promise<boolean> {
  if (item.title.length === 0) return false;
  const subject = slug(item.guid ?? item.link ?? item.title);
  const target = path.join(storeDir, `${subject}.json`);
  const exists = await readFile(target, "utf8").then(() => true, () => false);
  if (exists) return false;
  const asserted = new Date().toISOString();
  const claim = (id: string, object: string | undefined) => object === undefined ? undefined : Object.freeze({
    id,
    proposition: Object.freeze({ predicate: id, object }),
    time: Object.freeze({ asserted }),
    force: "alleges" as const,
    provenance: Object.freeze({ witness, citation: item.link ?? "" }),
    status: "supported" as const,
  });
  const bundle = {
    subject,
    claims: [claim("title", item.title), claim("url", item.link), claim("summary", item.summary), claim("published", item.published)]
      .filter((entry): entry is NonNullable<typeof entry> => entry !== undefined),
  };
  await mkdir(storeDir, { recursive: true });
  await writeFile(target, `${JSON.stringify(bundle, null, 2)}\n`);
  return true;
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/^https?:\/\//u, "")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 120) || "signal";
}
