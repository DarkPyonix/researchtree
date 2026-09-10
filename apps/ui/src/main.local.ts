import { startApp } from "./app";
import { createLocalHost } from "./hosts/local";

// `researchtree serve` entry. Built into apps/researchtree/server/static/ by `vite build --mode serve`.
void startApp(createLocalHost(), document.getElementById("app")!);
