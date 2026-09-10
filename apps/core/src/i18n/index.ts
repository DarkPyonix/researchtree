import { en } from "./en";
import { ko, type MessageKey } from "./ko";

export type { MessageKey };
export type Locale = "ko" | "en";
/** Saved language preference. `auto` follows the host environment (browser or VS Code). */
export type LocalePreference = Locale | "auto";

export const LOCALES: readonly Locale[] = ["ko", "en"];
/** Storage key for the saved `LocalePreference`. */
export const LOCALE_KEY = "locale";
/** Language names in their own language, for the language picker. */
export const LOCALE_NAMES: Record<Locale, string> = { ko: "한국어", en: "English" };
/** BCP 47 tags for `Intl` formatting and the document `lang` attribute. */
export const LOCALE_TAGS: Record<Locale, string> = { ko: "ko-KR", en: "en-US" };

export const MESSAGES: Record<Locale, Record<MessageKey, string>> = { ko, en };

let current: Locale = "en";

export function setLocale(locale: Locale): void {
  current = locale;
}

export function getLocale(): Locale {
  return current;
}

/** Any `ko*` language picks Korean; everything else falls back to English. */
export function detectLocale(languages: readonly string[]): Locale {
  return languages.some((l) => l.toLowerCase().startsWith("ko")) ? "ko" : "en";
}

export function isLocalePreference(v: unknown): v is LocalePreference {
  return v === "auto" || v === "ko" || v === "en";
}

/** Resolve a saved preference against the environment languages. */
export function resolveLocale(pref: unknown, languages: readonly string[]): Locale {
  return pref === "ko" || pref === "en" ? pref : detectLocale(languages);
}

export type MessageParams = Record<string, string | number>;

/** `{name}` inserts a value; `{name|one|other}` picks `one` when the value is 1, otherwise `other`. */
const PLACEHOLDER_RE = /\{(\w+)(?:\|([^|{}]*)\|([^|{}]*))?\}/g;

export function formatMessage(template: string, params?: MessageParams): string {
  return template.replace(PLACEHOLDER_RE, (match, name: string, one?: string, other?: string) => {
    const v = params?.[name];
    if (v === undefined) return match;
    if (one !== undefined) return Number(v) === 1 ? one : (other ?? "");
    return String(v);
  });
}

/** Placeholder names used by a message (for checking that locales agree). */
export function placeholders(template: string): string[] {
  return [...new Set([...template.matchAll(PLACEHOLDER_RE)].map((m) => m[1]!))].sort();
}

/** Translate a message key in the current locale. */
export function t(key: MessageKey, params?: MessageParams): string {
  return formatMessage(MESSAGES[current][key] ?? ko[key], params);
}
