import { chmod, mkdir, open, readFile, unlink } from "node:fs/promises";
import path from "node:path";
const issuedLeases = new WeakSet<object>();
export interface ZeloLease { readonly ownerId: string; readonly active: () => boolean; release(): Promise<void>; }
/** A structural lookalike is not a capability. */
export function hasActiveZeloLease(lease: unknown): lease is ZeloLease { return !!lease && typeof lease === "object" && issuedLeases.has(lease as object) && (lease as ZeloLease).active(); }
export async function acquireZeloProcessLease(file: string, ownerId: string): Promise<ZeloLease> {
  if (typeof ownerId !== "string" || !/^[A-Za-z][A-Za-z0-9._:-]{0,127}$/u.test(ownerId)) throw new TypeError("lease owner id invalid");
  const directory = path.dirname(file); await mkdir(directory, { recursive: true, mode: 0o700 }); await chmod(directory, 0o700);
  let handle; try { handle = await open(file, "wx", 0o600); await handle.writeFile(`${JSON.stringify({ type: "ZeloProcessLease", version: 1, ownerId })}\n`); await handle.sync(); await handle.close(); } catch (error: unknown) { await handle?.close().catch(() => undefined); if ((error as { code?: string }).code === "EEXIST") throw new Error("Zelo process ownership is already held; inspect and remove stale lease manually"); throw error; }
  let active = true;
  const lease: ZeloLease = Object.freeze({ ownerId, active: () => active, async release() {
    if (!active) return;
    const current = JSON.parse(await readFile(file, "utf8")) as { ownerId?: unknown };
    if (current.ownerId !== ownerId) throw new Error("Zelo reaction process lease ownership changed");
    await unlink(file); active = false;
  } });
  issuedLeases.add(lease as object);
  return lease;
}
