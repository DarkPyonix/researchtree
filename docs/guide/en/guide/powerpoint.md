# PowerPoint add-in

You can put the research island straight onto a slide. It stays alive while you present: drag to
turn it, click an experiment to open it. It is the real viewer, not a screenshot.

::: info In progress
The add-in is built and you can install it today by sideloading. Listing it on Microsoft AppSource
still has to go through review.
:::

## Installing it now

Before the store listing, one manifest file installs it, with nothing missing. The file is in the
repository at [`apps/office/manifest.xml`](https://github.com/DarkPyonix/researchtree/blob/main/apps/office/manifest.xml).

- **Windows, the short way** (no shared folder, no administrator):

  ```bash
  npx office-addin-dev-settings register apps/office/manifest.xml
  ```

  It then shows up under Insert → My Add-ins → Developer Add-ins. `unregister` removes it.
- **PowerPoint on the web**: Insert → Add-ins → **Upload My Add-in**, then pick `manifest.xml`.
- **Windows, the shared-folder way**: put `manifest.xml` in a shared folder and add that folder under
  File → Options → Trust Center → Trust Center Settings → Trusted Add-in Catalogs, tick
  **Show in Menu**, restart PowerPoint, then Insert → My Add-ins. Use this to hand it to other people.
- **Mac**: copy `manifest.xml` into `~/Library/Containers/com.microsoft.Powerpoint/Data/Documents/wef`,
  then Insert → My Add-ins.

## What to know before you present

- **You can show it without signing in.** For a public repository, putting the repo in the address is
  enough, so no sign-in window ever interrupts a talk. See the shareable links in [Hosted web](/guide/web).
- **The page reloads every time the slideshow starts.** If there is one experiment you want on screen,
  put the node in the address too.
- **It needs the internet**, because the record comes from GitHub.
- **Signing in works too.** For a private repository a GitHub sign-in window opens inside the add-in.
  The add-in never stores the token, so reopening the deck means signing in again.

## If something goes wrong

- **If 3D is slow**, switch to the flat view or the board. Some presentation machines fall back to
  software rendering.
- **If the frame is blank**, check the network and the repository in the address.
- Try it once on the machine you will actually present from.
