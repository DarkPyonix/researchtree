/**
 * PowerPoint host: the viewer as a content add-in sitting on a slide (apps/office).
 *
 * Same GitHub plumbing as the central web host, with three differences the add-in runtime forces:
 * - Sign-in happens in an Office dialog. A redirect would navigate the slide's frame away, and
 *   `window.open` is not supported in add-ins.
 * - Links open with `openBrowserWindow`, the only way an add-in may send the reader to a browser.
 * - Storage may be blocked outright in the add-in frame (partitioned third-party storage), so the
 *   token falls back to memory: sign-in then lasts as long as the slideshow, which is enough.
 */
import { t, type GitHubUser, type Host } from "@researchtree/core";
import { repoFromUrl } from "../host-utils";
import { CLIENT_ID } from "./github-oauth";
import { fetchUser, githubRequest, TOKEN_KEY } from "./web";

const PREFIX = "researchtree.";
const AUTH_PAGE = "office-auth.html";

/** The message the dialog page sends back (see office-auth.ts). */
interface AuthMessage {
  token?: string;
  error?: string;
}

/** localStorage when the add-in frame allows it, memory when it does not. */
function officeStore(): Host["storage"] {
  const memory = new Map<string, unknown>();
  return {
    get<T>(key: string): T | undefined {
      try {
        const raw = localStorage.getItem(PREFIX + key);
        if (raw != null) return JSON.parse(raw) as T;
      } catch {
        /* Blocked: fall through to memory. */
      }
      return memory.get(key) as T | undefined;
    },
    set(key: string, value: unknown) {
      if (value === undefined) memory.delete(key);
      else memory.set(key, value);
      try {
        if (value === undefined) localStorage.removeItem(PREFIX + key);
        else localStorage.setItem(PREFIX + key, JSON.stringify(value));
      } catch {
        /* Memory already holds it. */
      }
    },
  };
}

/** Sign in through an Office dialog, which is the only supported window an add-in may open. */
function signInWithDialog(): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = new URL(AUTH_PAGE, location.href).toString();
    Office.context.ui.displayDialogAsync(url, { height: 60, width: 30, promptBeforeOpen: false }, (result) => {
      if (result.status !== Office.AsyncResultStatus.Succeeded) {
        reject(new Error(result.error?.message ?? t("office.dialogFailed")));
        return;
      }
      const dialog = result.value;
      let done = false;
      dialog.addEventHandler(Office.EventType.DialogMessageReceived, (arg) => {
        done = true;
        dialog.close();
        const message = JSON.parse("message" in arg ? arg.message : "{}") as AuthMessage;
        if (message.token) resolve(message.token);
        else reject(new Error(message.error ?? t("web.noToken")));
      });
      // Fires when the reader closes the dialog themselves, and on dialog errors.
      dialog.addEventHandler(Office.EventType.DialogEventReceived, () => {
        if (!done) reject(new Error(t("office.dialogClosed")));
      });
    });
  });
}

export function createOfficeHost(): Host {
  const storage = officeStore();
  const token = () => storage.get<string>(TOKEN_KEY);

  const signedInWith = async (value: string): Promise<GitHubUser> => {
    const user = await fetchUser(value);
    storage.set(TOKEN_KEY, value);
    return user;
  };

  return {
    kind: "office",
    storage,
    auth: {
      async current() {
        const value = token();
        if (!value) return null;
        try {
          return await fetchUser(value);
        } catch {
          // In a slideshow there is nowhere to report this; treat it as signed out and offer sign-in.
          storage.set(TOKEN_KEY, undefined);
          return null;
        }
      },
      availability() {
        return CLIENT_ID ? { ok: true } : { ok: false, reason: t("web.noClientId") };
      },
      async signIn() {
        if (!CLIENT_ID) throw new Error(t("web.noClientIdShort"));
        return signedInWith(await signInWithDialog());
      },
      async signOut() {
        storage.set(TOKEN_KEY, undefined);
      },
    },
    request: (req) => githubRequest(token(), req),
    async initialRepo() {
      return repoFromUrl();
    },
    openExternal(url: string) {
      if (!/^https?:\/\//.test(url)) return;
      Office.context.ui.openBrowserWindow(url);
    },
    capabilities: {
      signInWithToken: (value: string) => signedInWith(value.trim()),
    },
  };
}
