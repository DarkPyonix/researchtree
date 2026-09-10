import "./hosts/extension.css";
import { startApp } from "./app";
import { createExtensionHost } from "./hosts/extension";

// VS Code webview entry. Built into apps/extension/media/ by `vite build --mode extension`.
void startApp(createExtensionHost(), document.getElementById("app")!);
