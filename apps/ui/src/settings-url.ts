/**
 * Settings carried in the URL, so a link opens the viewer the way the sender sees it: `?lang=en`.
 *
 * Only what belongs to the reader lives here. Branch names do not: they belong to the repository,
 * in its `.researchtree.yml` (docs/CONVENTIONS.md), so everyone who opens it sees the same tree.
 */
import { isLocalePreference, type LocalePreference } from "@researchtree/core";

/** Settings queries, in the order they are written to the address. */
export const SETTING_PARAMS = ["lang"] as const;

export interface UrlSettings {
  locale?: LocalePreference;
  /** Queries the link asked for whose value was rejected. */
  ignored: string[];
}

export function parseSettings(search: string | URLSearchParams): UrlSettings {
  const params = typeof search === "string" ? new URLSearchParams(search) : params0(search);
  const out: UrlSettings = { ignored: [] };
  const value = params.get("lang")?.trim();
  if (value) {
    if (isLocalePreference(value)) out.locale = value;
    else out.ignored.push("lang");
  } else if (params.has("lang")) out.ignored.push("lang");
  return out;
}

function params0(p: URLSearchParams): URLSearchParams {
  return p;
}

/** What the address should say about the current settings; a null value means "leave it out". */
export function settingParams(s: { locale: LocalePreference }): Record<(typeof SETTING_PARAMS)[number], string | null> {
  return { lang: s.locale === "auto" ? null : s.locale };
}
