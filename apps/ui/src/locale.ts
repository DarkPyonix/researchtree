import { isLocalePreference, LOCALE_KEY, resolveLocale, setLocale, type Host, type Locale, type LocalePreference } from "@researchtree/core";

/** Languages of the environment: the host's own (e.g. VS Code) or the browser's. */
export function environmentLanguages(host?: Pick<Host, "languages">): readonly string[] {
  if (host?.languages?.length) return host.languages;
  if (typeof navigator === "undefined") return [];
  return navigator.languages?.length ? navigator.languages : [navigator.language];
}

export function localePreference(host: Pick<Host, "storage">): LocalePreference {
  const saved = host.storage.get<unknown>(LOCALE_KEY);
  return isLocalePreference(saved) ? saved : "auto";
}

/** Set the UI locale and the document language. */
export function useLocale(locale: Locale): void {
  setLocale(locale);
  document.documentElement.lang = locale;
}

/** Apply the saved preference, or the environment language when there is none (or it is "auto"). */
export function applyLocale(host: Pick<Host, "storage" | "languages">): Locale {
  const locale = resolveLocale(localePreference(host), environmentLanguages(host));
  useLocale(locale);
  return locale;
}
