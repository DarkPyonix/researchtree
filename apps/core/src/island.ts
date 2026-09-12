/**
 * The ResearchIsland map: which research an account shows, grouped into lands, and where each sits.
 *
 * The settings are the first ```yaml block of the README in the account's `.researchisland`
 * repository (docs/ISLAND.md). Python reads the same file (apps/researchtree/island.py) and both
 * must turn tests/fixtures/island-cases.json into island-expected.json.
 *
 * A broken entry is dropped with a warning rather than emptying the map: half a map beats a blank sea.
 */
import { parse as parseYaml } from "yaml";

export const ISLAND_CONFIG_REPO = ".researchisland";
export const ISLAND_CONFIG_PATH = "README.md";
export const ISLAND_PROFILE_PATH = "PROFILE.md";

export interface IslandResearch {
  repo: string;
  /** Place within its land, as [column, row]. */
  at: [number, number];
  root: string;
  prefix: string;
}

export interface IslandLand {
  name: string;
  /** Place on the world map, as [column, row]. */
  at: [number, number];
  /** Path of a document introducing the land, in the settings repository. */
  intro?: string;
  repos: IslandResearch[];
}

export interface IslandMap {
  islands: IslandLand[];
  warnings: string[];
}

const REPO_RE = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
const FENCE_RE = /^```[ \t]*ya?ml[ \t]*$/i;
const DEFAULT_ROOT = "research";
const DEFAULT_PREFIX = "experiment/";

/** The body of the first ```yaml block in a Markdown document, or null when it has none. */
export function yamlBlock(text: string): string | null {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!FENCE_RE.test(lines[i]!.trim())) continue;
    const body: string[] = [];
    for (const rest of lines.slice(i + 1)) {
      if (rest.trim().startsWith("```")) return body.join("\n");
      body.push(rest);
    }
    return body.join("\n");
  }
  return null;
}

function coords(value: unknown, where: string, warnings: string[]): [number, number] {
  if (Array.isArray(value) && value.length === 2 && value.every((n) => Number.isInteger(n))) {
    return [value[0] as number, value[1] as number];
  }
  if (value !== undefined && value !== null) warnings.push(`${where}: at must be two whole numbers, e.g. [0, 1]`);
  return [0, 0];
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Read the map out of a settings README. Never throws: anything unreadable becomes a warning. */
export function parseIslandMap(source: string): IslandMap {
  const warnings: string[] = [];
  const block = yamlBlock(source);
  if (block === null) return { islands: [], warnings: ["no ```yaml block in the settings file"] };

  let data: unknown;
  try {
    data = parseYaml(block);
  } catch {
    // The reason comes from the yaml library and reads differently in each language, so the message
    // stays the same on both sides (tests/fixtures/island-cases.json).
    return { islands: [], warnings: ["the yaml block could not be read"] };
  }
  if (data === null || data === undefined) return { islands: [], warnings: [] };
  if (typeof data !== "object" || Array.isArray(data)) return { islands: [], warnings: ["the yaml block is not key: value pairs"] };

  const rawIslands = (data as Record<string, unknown>).islands;
  if (!Array.isArray(rawIslands)) return { islands: [], warnings: ["islands: must be a list of lands"] };

  const seen = new Set<string>();
  const islands: IslandLand[] = [];
  rawIslands.forEach((raw, i) => {
    const where = `islands[${i}]`;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      warnings.push(`${where}: not a land`);
      return;
    }
    const entry = raw as Record<string, unknown>;
    const name = text(entry.name);
    if (!name) {
      warnings.push(`${where}: name is required`);
      return;
    }
    const land: IslandLand = { name, at: coords(entry.at, where, warnings), repos: [] };
    const intro = text(entry.intro);
    if (intro) land.intro = intro;

    const rawRepos = Array.isArray(entry.repos) ? entry.repos : [];
    rawRepos.forEach((item, j) => {
      const spot = `${where}.repos[${j}]`;
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        warnings.push(`${spot}: not a research entry`);
        return;
      }
      const research = item as Record<string, unknown>;
      const repo = text(research.repo);
      if (!REPO_RE.test(repo)) {
        warnings.push(`${spot}: repo must be owner/name`);
        return;
      }
      if (seen.has(repo)) {
        warnings.push(`${spot}: ${repo} is already on the map`);
        return;
      }
      seen.add(repo);
      let prefix = text(research.prefix) || DEFAULT_PREFIX;
      if (!prefix.endsWith("/")) prefix += "/";
      land.repos.push({ repo, at: coords(research.at, spot, warnings), root: text(research.root) || DEFAULT_ROOT, prefix });
    });

    if (land.repos.length === 0) warnings.push(`${where}: ${name} has no research on it`);
    islands.push(land);
  });
  return { islands, warnings };
}

/** Every research on the map, in reading order. */
export function islandResearch(map: IslandMap): IslandResearch[] {
  return map.islands.flatMap((land) => land.repos);
}
