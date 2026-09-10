import type { GitHubRequest } from "./host";

/**
 * Message protocol between the VS Code webview (apps/ui/src/hosts/extension.ts)
 * and the extension host (apps/extension/src/). Types only.
 */
export type RpcCall =
  | { type: "auth.current" }
  | { type: "auth.signIn" }
  | { type: "auth.signOut" }
  | { type: "github"; req: GitHubRequest }
  | { type: "initialRepo" }
  | { type: "openExternal"; url: string }
  | { type: "checkout"; branch: string }
  | { type: "openDiff"; base: string; head: string }
  | { type: "currentBranch" };

export type RpcType = RpcCall["type"];

/** Webview → extension */
export type RpcRequest = RpcCall & { id: number };

/** Extension → webview (reply to a request) */
export type RpcResponse = { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string };

/** Extension → webview (unsolicited notification) */
export type RpcEvent = { event: "currentBranch"; branch: string | null };
