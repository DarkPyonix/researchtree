# ResearchTree for PowerPoint

The viewer as a PowerPoint **content add-in**: the experiment tree sits on a slide and stays live
while you present. Drag, zoom and open an experiment without leaving the slideshow.

This folder holds only the add-in manifest. The pages it points at are built with the web app
(`apps/ui/office.html` and `office-auth.html`) and published on GitHub Pages, so the add-in and its
sign-in dialog share one origin, which Office requires.

| File | What |
|---|---|
| `manifest.xml` | The add-in itself: name, icons, the page to load, the size it asks for |

Icons live in `apps/ui/pwa/office/` and are published at `/researchtree/office/icon-*.png`.

## Try it before it is in the store

Sideloading installs the add-in straight from the manifest file, with nothing missing.

```bash
npm run build            # emits office.html into apps/ui/dist
npx office-addin-manifest validate apps/office/manifest.xml
```

- **PowerPoint on the web**: Insert → Add-ins → **Upload My Add-in** → pick `manifest.xml`.
- **Windows**: put `manifest.xml` in a shared folder, add that folder under
  File → Options → Trust Center → Trust Center Settings → Trusted Add-in Catalogs, tick
  **Show in Menu**, restart PowerPoint, then Insert → My Add-ins → Shared Folder.
- **Mac**: copy `manifest.xml` into `~/Library/Containers/com.microsoft.Powerpoint/Data/Documents/wef`,
  then Insert → My Add-ins.

The manifest points at the published site, so a sideloaded add-in shows whatever is deployed. To try
local changes, serve `apps/ui/dist` over HTTPS and point `SourceLocation` at it.

## Signing in

An add-in may not navigate the slide away or open its own window, so sign-in runs in an Office
dialog (`office-auth.html`) and the token comes back with `messageParent`. Storage inside the add-in
frame is partitioned and can be blocked outright, so the token falls back to memory: sign-in then
lasts for the session, which is enough for a talk. Pasting a personal access token works too, and
the demo repository needs no sign-in at all.

## Publishing

Distribution goes through Partner Center (Microsoft 365 and Copilot program). It is free for a free
add-in. Keep `Version` in step with the VS Code extension and the Python package.
