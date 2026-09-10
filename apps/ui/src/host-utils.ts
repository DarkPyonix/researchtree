import type { Host } from "@researchtree/core";

const PREFIX = "researchtree.";

/** localStorage-backed store that keeps working when storage is blocked (e.g. private mode). */
export function localStore(): Host["storage"] {
  return {
    get<T>(key: string): T | undefined {
      try {
        const raw = localStorage.getItem(PREFIX + key);
        return raw == null ? undefined : (JSON.parse(raw) as T);
      } catch {
        return undefined;
      }
    },
    set(key: string, value: unknown) {
      try {
        if (value === undefined) localStorage.removeItem(PREFIX + key);
        else localStorage.setItem(PREFIX + key, JSON.stringify(value));
      } catch {
        /* Ignore storage failures. */
      }
    },
  };
}

export function repoFromUrl(): string | null {
  return new URLSearchParams(location.search).get("repo");
}

export function openInNewTab(url: string): void {
  if (!/^https?:\/\//.test(url)) return;
  window.open(url, "_blank", "noopener,noreferrer");
}
