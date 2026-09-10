import * as vscode from "vscode";
import { randomBytes } from "node:crypto";
import { GitBridge } from "./git";
import { githubFetch, handleMessage, type RpcDeps } from "./rpc";
import type { RpcEvent } from "@researchtree/core";

const SIGNED_OUT_KEY = "researchtree.signedOut";
const SCOPES = ["repo"];

let panel: vscode.WebviewPanel | undefined;

function webviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const media = vscode.Uri.joinPath(extensionUri, "media");
  const script = webview.asWebviewUri(vscode.Uri.joinPath(media, "main.js"));
  const style = webview.asWebviewUri(vscode.Uri.joinPath(media, "main.css"));
  const nonce = randomBytes(16).toString("base64");
  const csp = [
    "default-src 'none'",
    `img-src ${webview.cspSource} https://avatars.githubusercontent.com data:`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
    `font-src ${webview.cspSource}`,
  ].join("; ");
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="stylesheet" href="${style}" />
  <title>ResearchTree</title>
</head>
<body class="host-extension">
  <div id="app"></div>
  <script type="module" nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
}

export function activate(context: vscode.ExtensionContext): void {
  const state = context.globalState;

  async function getToken(interactive: boolean): Promise<string | undefined> {
    if (!interactive && state.get<boolean>(SIGNED_OUT_KEY)) return undefined;
    const session = interactive
      ? await vscode.authentication.getSession("github", SCOPES, { createIfNone: true })
      : await vscode.authentication.getSession("github", SCOPES, { silent: true });
    if (interactive) await state.update(SIGNED_OUT_KEY, undefined);
    return session?.accessToken;
  }

  const git = new GitBridge(async (req) => githubFetch({ fetch }, await getToken(false), req));

  const deps: RpcDeps = {
    fetch,
    getToken,
    // Does not sign VS Code out of GitHub; this extension just stops using the session.
    signOut: async () => void (await state.update(SIGNED_OUT_KEY, true)),
    initialRepo: () => git.initialRepo(),
    openExternal: async (url) => void (await vscode.env.openExternal(vscode.Uri.parse(url))),
    checkout: (branch) => git.checkout(branch),
    openDiff: (base, head) => git.openDiff(base, head),
    currentBranch: () => git.currentBranch(),
  };

  function open(): void {
    if (panel) {
      panel.reveal();
      return;
    }
    const p = vscode.window.createWebviewPanel("researchtree", "ResearchTree", vscode.ViewColumn.Active, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")],
    });
    panel = p;
    p.webview.html = webviewHtml(p.webview, context.extensionUri);
    const subs: vscode.Disposable[] = [];
    subs.push(
      p.webview.onDidReceiveMessage(async (msg: unknown) => {
        const reply = await handleMessage(deps, msg);
        if (reply) void p.webview.postMessage(reply);
      }),
    );
    void git.onBranchChange((branch) => {
      const ev: RpcEvent = { event: "currentBranch", branch };
      void p.webview.postMessage(ev);
    }).then((d) => d && subs.push(d));
    p.onDidDispose(() => {
      panel = undefined;
      subs.forEach((d) => d.dispose());
    });
  }

  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  status.text = "$(git-branch) ResearchTree";
  status.tooltip = "ResearchTree 열기";
  status.command = "researchtree.open";
  context.subscriptions.push(status);

  // Show the status bar button only when the workspace has a GitHub repository.
  void git.candidates().then((list) => (list.length > 0 ? status.show() : status.hide()), () => status.hide());

  context.subscriptions.push(
    vscode.commands.registerCommand("researchtree.open", open),
    vscode.commands.registerCommand("researchtree.signOut", async () => {
      await deps.signOut();
      // Reload the webview so it returns to the sign-in screen.
      if (panel) panel.webview.html = webviewHtml(panel.webview, context.extensionUri);
      void vscode.window.showInformationMessage("ResearchTree: 로그아웃했습니다.");
    }),
  );
}

export function deactivate(): void {}
