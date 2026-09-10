import type { GitHubRequest, GitHubResponse, GitHubUser, Host, RpcCall, RpcEvent, RpcResponse } from "@researchtree/core";

interface VsCodeApi {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

/** Default timeout for calls that do not wait on the user. */
const TIMEOUT_MS = 60_000;

type Pending = { resolve(v: unknown): void; reject(e: Error): void; timer?: ReturnType<typeof setTimeout> };

/** Promise-based RPC over `postMessage`. Replies are matched by `id`. */
function createRpc(api: VsCodeApi) {
  let nextId = 1;
  const pending = new Map<number, Pending>();

  window.addEventListener("message", (e: MessageEvent) => {
    const msg = e.data as Partial<RpcResponse> & Partial<RpcEvent>;
    if (!msg || typeof msg !== "object") return;
    // Unsolicited events (e.g. `currentBranch`) carry no id and are ignored for now.
    if (typeof msg.event === "string" || typeof msg.id !== "number") return;
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (p.timer) clearTimeout(p.timer);
    const res = msg as RpcResponse;
    if (res.ok) p.resolve(res.result);
    else p.reject(new Error(res.error));
  });

  return {
    /** `timeout: 0` waits indefinitely (for calls that involve sign-in or QuickPick prompts). */
    call<T>(msg: RpcCall, timeout = TIMEOUT_MS): Promise<T> {
      const id = nextId++;
      return new Promise<T>((resolve, reject) => {
        const p: Pending = { resolve: resolve as (v: unknown) => void, reject };
        if (timeout > 0) {
          p.timer = setTimeout(() => {
            pending.delete(id);
            reject(new Error(`VS Code 확장 응답 시간 초과 (${msg.type})`));
          }, timeout);
        }
        pending.set(id, p);
        api.postMessage({ ...msg, id });
      });
    },
  };
}

/** Host that runs inside a VS Code webview. GitHub calls and the token stay in the extension host. */
export function createExtensionHost(): Host {
  const api = acquireVsCodeApi();
  const rpc = createRpc(api);

  const readState = (): Record<string, unknown> => {
    const s = api.getState();
    return s && typeof s === "object" ? (s as Record<string, unknown>) : {};
  };

  return {
    kind: "extension",
    storage: {
      get<T>(key: string): T | undefined {
        return readState()[key] as T | undefined;
      },
      set(key: string, value: unknown) {
        const s = { ...readState() };
        if (value === undefined) delete s[key];
        else s[key] = value;
        api.setState(s);
      },
    },
    auth: {
      current: () => rpc.call<GitHubUser | null>({ type: "auth.current" }),
      signIn: () => rpc.call<GitHubUser>({ type: "auth.signIn" }, 0),
      signOut: () => rpc.call<void>({ type: "auth.signOut" }),
      availability: () => ({ ok: true }),
    },
    request: (req: GitHubRequest) => rpc.call<GitHubResponse>({ type: "github", req }),
    initialRepo: () => rpc.call<string | null>({ type: "initialRepo" }, 0),
    openExternal(url: string) {
      if (!/^https?:\/\//.test(url)) return;
      void rpc.call({ type: "openExternal", url }).catch(() => {});
    },
    capabilities: {
      checkout: (branch: string) => rpc.call<void>({ type: "checkout", branch }, 0),
      openDiff: (base: string, head: string) => rpc.call<void>({ type: "openDiff", base, head }, 0),
    },
  };
}
