# Hosted web

The simplest way to open the viewer: nothing to install, just a web browser.

```
https://darkpyonix.github.io/researchtree/
```

## Signing in

![Sign-in screen](/images/readme/en/sign-in.png)

The first time you visit without a token, you get the sign-in screen instead of the tree. There are two ways to sign in.

### Sign in with GitHub (OAuth)

Press "Sign in with GitHub" and you're taken to GitHub's authorization page. Approve the permissions and you come back to the screen you were headed for (repo, node). The scope requested is `repo`, which is needed to load PR data from private repos.

Trading the authorization code for a token is handled by the auth proxy (`https://researchtree.thisisthepy.workers.dev`). The proxy stores nothing ([Security and privacy](/guide/security)).

### Sign in with a personal access token (PAT)

Expand "Sign in with a personal access token (PAT)" on the sign-in screen and paste in a token you've created. This is nice when you want to grant access to specific repos only.

1. Create a token in GitHub under **Settings → Developer settings → Personal access tokens**.
2. For a fine-grained token, give it these permissions on the target repo.
   - **Pull requests**: read/write
   - **Contents**: read
3. Paste the token (`github_pat_…`) and press "Sign in with token".

The token you enter is stored only in your browser's `localStorage`, and it's never sent anywhere but `api.github.com` ([Security and privacy](/guide/security)).

### Signing out and expiry

Hover over the avatar at the top right to open the account menu, then press **Sign out** to delete the token stored in your browser. The same menu has **Open another repo**, which takes you back to the repo picker. If the token expires or access is revoked and GitHub returns a 401, you're sent back to the sign-in screen automatically.

## Install it as an app (PWA)

You can install the hosted web viewer like an app. It then opens in its own window without browser tabs, and a ResearchTree icon shows up on your home screen or start menu.

- **Chrome or Edge on desktop**: press the install icon at the right of the address bar, or choose **Install app** from the menu.
- **Chrome on Android**: choose **Add to Home screen** (or **Install app**) from the menu.
- **Safari on iPhone or iPad**: press the share button, then **Add to Home Screen**.

On a phone, the status bar and the bottom bar take their color from the screen underneath: the sea color in the 3D view, the background color in the flat view and on the sign-in screen. On iPhone the screen is drawn behind the status bar.

The installed app keeps the viewer itself (HTML, scripts, styles, fonts) on your device so it opens fast. Experiment records are read fresh from GitHub every time, and neither your token nor GitHub responses are put in that storage.

## Picking a repo

Once you're signed in, you get the "Which research do you want to see?" screen.

- Type `owner/name` yourself, or pick from the **My repos** list. Typing filters the list as you go.
- If it's your first time, try **Look around the demo repo**. It opens an [example repo](https://github.com/DarkPyonix/researchtree-demo) holding a year of imaginary speech synthesis research.
- **Recently viewed repos** appear as chips at the top (up to six).
- The last repo you opened opens automatically next time.
- If the repo doesn't exist or you don't have access, you see a "repo not found or no access" message.

## Shareable links

The repo you're looking at and the node you've selected are reflected in the address bar.

```
https://darkpyonix.github.io/researchtree/?repo=lab/moshi&node=experiment/depth-lr-half
```

| Parameter | Meaning |
|---|---|
| `repo` | The repo to open (`owner/name`) |
| `node` | The node to select. An experiment is the branch name (`experiment/...`); a version looks like `research@v2` |
| `setting` | Settings, always last in the address (see below) |

### Putting settings in the link

Everything the settings dialog can set can also go in the `setting` query: `key:value` pairs joined by commas, at the end of the address.

```
https://darkpyonix.github.io/researchtree/?repo=lab/moshi&setting=lang:en,root:trunk,prefix:try/
```

| Key | Value | Meaning |
|---|---|---|
| `lang` | `auto` · `ko` · `en` | Viewer language |
| `root` | A branch name | Root branch (`research` by default) |
| `prefix` | A prefix ending in `/` | Experiment branch prefix (`experiment/` by default) |

Any setting that is not at its default shows up in the address bar on its own, so you can copy the address and the other person opens it the same way. Settings that arrive in a link are saved in that browser, and the settings dialog can change them at any time. Unknown keys and invalid values are ignored.

A prefix set in the repo's `.researchtree.yml` still wins: a link never overrides what the team agreed on.

Whoever you send the link to sees the same screen once they sign in. For a private repo, they also need access to that repo to see anything — without it, they get an access message.

::: tip Open it straight from the terminal
If you've installed the Python package, run `researchtree open` in the repo directory. It prints the hosted web address for the current repo (`?repo=…`) and opens it in your browser.
:::
