import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const packageRoot = path.resolve(fileURLToPath(import.meta.url), "../../..");
export const infoRoot = path.resolve(packageRoot, ...Array(22).fill(".."));
const repositoryDevelopmentPublicTurntideRoot = path.resolve(
  packageRoot,
  ...Array(17).fill(".."),
  "public-services-section",
  "services",
  "public-community-services-section",
  "services",
  "turntide-islands",
);

export function env(name, source = process.env) {
  const value = source[name];
  return value === undefined || value.length === 0 ? undefined : value;
}

export function integerEnv(name, fallback, source = process.env) {
  const value = Number(env(name, source));
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

/**
 * Turntide's public content and durable data boundary. Deployments provide
 * TURNTIDE_PUBLIC_ROOT; the repository layout is only a development default.
 */
export function publicTurntideRoot(source = process.env) {
  const configured = env("TURNTIDE_PUBLIC_ROOT", source);
  return configured === undefined ? repositoryDevelopmentPublicTurntideRoot : path.resolve(configured);
}

export function publicTurntideContentPath(source, ...segments) {
  return path.join(publicTurntideRoot(source), "content", ...segments);
}

export function publicTurntideDataPath(source, ...segments) {
  return path.join(publicTurntideRoot(source), "data", ...segments);
}

export function loadRuntimeEnv(source = process.env) {
  loadDotEnv(path.join(packageRoot, ".env"), source);
  loadDotEnv(path.join(infoRoot, ".envrc"), source);
}

export function loadDotEnv(file, source = process.env) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
    const assignment = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/u.exec(trimmed);
    if (assignment === null) continue;
    const key = assignment[1];
    let value = assignment[2].trim();
    const quoted =
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"));
    if (quoted && value.length >= 2) value = value.slice(1, -1);
    if (source[key] === undefined) source[key] = value;
  }
}
