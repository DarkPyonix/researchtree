import { startApp } from "./app";
import { createOfficeHost } from "./hosts/office";

// PowerPoint content add-in entry. Office.js has to be ready before the page touches the host API,
// and the slide reloads this page every time the slideshow starts, so startup stays cheap.
Office.onReady(() => {
  const root = document.getElementById("app")!;
  document.body.classList.add("office-embed");
  void startApp(createOfficeHost(), root);
});
