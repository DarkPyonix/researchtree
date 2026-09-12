/**
 * Settings carried in the URL, so a link can open the viewer configured the way the sender sees it:
 * `?repo=lab/moshi&node=…&setting=lang:en,root:research,prefix:experiment/`.
 *
 * Everything the settings dialog can set has a key here. The `setting` query always goes last, and
 * holds `key:value` pairs separated by commas. Unknown keys and invalid values are ignored, so an
 * old link never breaks the viewer.
 */
import { isLocalePreference, normalizeTreeConfig, type LocalePreference, type TreeConfig } from "@researchtree/core";

export const SETTING_PARAM = "setting";

export interface UrlSettings {
  locale?: LocalePreference;
  /** Branch settings, only when the link carries a valid pair of them. */
  config?: Partial<TreeConfig>;
  /** Keys the link asked for that this version does not know, or whose value was rejected. */
  ignored: string[];
}

/** Read `lang:en,root:research,prefix:experiment/`. A value may be empty (`lang:`), which is ignored. */
export function parseSettings(raw: string | null | undefined): UrlSettings {
  const out: UrlSettings = { ignored: [] };
  const config: Partial<TreeConfig> = {};
  for (const item of (raw ?? "").split(",")) {
    const text = item.trim();
    if (!text) continue;
    const at = text.indexOf(":");
    const key = (at < 0 ? text : text.slice(0, at)).trim().toLowerCase();
    const value = at < 0 ? "" : text.slice(at + 1).trim();
    if (!value) {
      out.ignored.push(key);
      continue;
    }
    if (key === "lang") {
      if (isLocalePreference(value)) out.locale = value;
      else out.ignored.push(key);
    } else if (key === "root" || key === "prefix") {
      config[key] = value;
    } else {
      out.ignored.push(key);
    }
  }
  if (config.root !== undefined || config.prefix !== undefined) {
    out.config = config;
  }
  return out;
}

/** The `setting` value for the current settings, or null when they are all at their default. */
export function settingParam(s: { locale: LocalePreference; config: TreeConfig; defaults: TreeConfig }): string | null {
  const parts: string[] = [];
  if (s.locale !== "auto") parts.push(`lang:${s.locale}`);
  if (s.config.root !== s.defaults.root) parts.push(`root:${s.config.root}`);
  if (s.config.prefix !== s.defaults.prefix) parts.push(`prefix:${s.config.prefix}`);
  return parts.length ? parts.join(",") : null;
}

/** The branch settings a link asks for, merged onto what is saved here. Invalid pairs are dropped. */
export function mergeConfig(saved: TreeConfig, wanted: Partial<TreeConfig> | undefined): TreeConfig | null {
  if (!wanted) return null;
  const merged = normalizeTreeConfig({ root: wanted.root ?? saved.root, prefix: wanted.prefix ?? saved.prefix });
  if ("error" in merged) return null;
  return merged.root === saved.root && merged.prefix === saved.prefix ? null : merged;
}
