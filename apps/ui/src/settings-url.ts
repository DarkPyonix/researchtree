/**
 * Settings carried in the URL, so a link can open the viewer configured the way the sender sees it:
 * `?repo=lab/moshi&node=…&lang=en&root=trunk&prefix=try/`.
 *
 * Everything the settings dialog can set has a query of its own, written after `repo` and `node`.
 * Unknown values are ignored, so an old link never breaks the viewer.
 */
import { isLocalePreference, normalizeTreeConfig, type LocalePreference, type TreeConfig } from "@researchtree/core";

/** Settings queries, in the order they are written to the address. */
export const SETTING_PARAMS = ["lang", "root", "prefix"] as const;

export interface UrlSettings {
  locale?: LocalePreference;
  /** Branch settings, only when the link carries at least one valid one. */
  config?: Partial<TreeConfig>;
  /** Queries the link asked for whose value was rejected. */
  ignored: string[];
}

export function parseSettings(search: string | URLSearchParams): UrlSettings {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const out: UrlSettings = { ignored: [] };
  const config: Partial<TreeConfig> = {};
  for (const key of SETTING_PARAMS) {
    const value = params.get(key)?.trim();
    if (!value) {
      if (params.has(key)) out.ignored.push(key);
      continue;
    }
    if (key === "lang") {
      if (isLocalePreference(value)) out.locale = value;
      else out.ignored.push(key);
    } else {
      config[key] = value;
    }
  }
  if (config.root !== undefined || config.prefix !== undefined) out.config = config;
  return out;
}

/** What the address should say about the current settings; a null value means "leave it out". */
export function settingParams(s: { locale: LocalePreference; config: TreeConfig; defaults: TreeConfig }): Record<(typeof SETTING_PARAMS)[number], string | null> {
  return {
    lang: s.locale === "auto" ? null : s.locale,
    root: s.config.root === s.defaults.root ? null : s.config.root,
    prefix: s.config.prefix === s.defaults.prefix ? null : s.config.prefix,
  };
}

/** The branch settings a link asks for, merged onto what is saved here. Invalid pairs are dropped. */
export function mergeConfig(saved: TreeConfig, wanted: Partial<TreeConfig> | undefined): TreeConfig | null {
  if (!wanted) return null;
  const merged = normalizeTreeConfig({ root: wanted.root ?? saved.root, prefix: wanted.prefix ?? saved.prefix });
  if ("error" in merged) return null;
  return merged.root === saved.root && merged.prefix === saved.prefix ? null : merged;
}
