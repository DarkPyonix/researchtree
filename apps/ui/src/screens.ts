import type { GitHubClient, GitHubUser, Host, LocalePreference, TreeConfig } from "@researchtree/core";
import { LOCALE_NAMES, LOCALES, parseRepo, t } from "@researchtree/core";
import logoUrl from "./assets/logo.svg";
import { clear, h, icon, type Child } from "./dom";

/** The ResearchTree logo: the voxel research tree from the 3D view (same as docs/guide/public/logo.svg). */
function logo(size = 56): HTMLElement {
  return h("img", { src: logoUrl, width: String(size), height: String(size), alt: "" });
}

/** Public example repository for first-time users (a year of made-up TTS research). */
export const DEMO_REPO = "DarkPyonix/researchtree-demo";

function screen(...children: Child[]): HTMLElement {
  return h("div", { class: "screen" }, h("div", { class: "card screen-card" }, ...children));
}

export function loadingScreen(text: string): HTMLElement {
  return h("div", { class: "screen" }, h("div", { class: "loading" }, h("span", { class: "spinner", "aria-hidden": "true" }), text));
}

export function messageScreen(opts: {
  eyebrow?: string;
  title: string;
  body: (string | Node)[];
  /** The button is handed to its own handler, so an action can report back on itself. */
  actions: { label: string; onClick: (button: HTMLButtonElement) => void; primary?: boolean }[];
}): HTMLElement {
  return screen(
    h("div", { class: "eyebrow" }, opts.eyebrow ?? "ResearchTree"),
    h("h2", { class: "screen-title" }, opts.title),
    h("div", { class: "screen-body" }, ...opts.body.map((b) => (typeof b === "string" ? h("p", null, b) : b))),
    h(
      "div",
      { class: "screen-actions" },
      opts.actions.map((a) => {
        const button = h("button", { class: a.primary ? "btn primary" : "btn" }, a.label) as HTMLButtonElement;
        button.onclick = () => a.onClick(button);
        return button;
      }),
    ),
  );
}

export function loginScreen(opts: {
  host: Host;
  error?: string;
  onSignedIn: (user: GitHubUser) => void;
  /** Open the public demo repository without signing in. Only where there is no address bar. */
  onDemo?: () => void;
}): HTMLElement {
  const { host } = opts;
  const avail = host.auth.availability();
  const errorBox = h("p", { class: "form-error", role: "alert" }, opts.error ?? "");
  errorBox.hidden = !opts.error;
  const showError = (msg: string) => {
    errorBox.textContent = msg;
    errorBox.hidden = false;
  };

  const deviceBox = h("div", { class: "device", hidden: true });
  const loginBtn = h(
    "button",
    {
      class: "btn primary big",
      disabled: !avail.ok,
      onclick: async () => {
        loginBtn.disabled = true;
        errorBox.hidden = true;
        try {
          const user = await host.auth.signIn({
            showDeviceCode(info) {
              clear(deviceBox);
              deviceBox.hidden = false;
              deviceBox.append(
                h("p", { class: "muted" }, t("login.deviceCodePrompt")),
                h("div", { class: "device-code" }, info.userCode),
                h(
                  "button",
                  { class: "btn", onclick: () => host.openExternal(info.verificationUri) },
                  icon("external"),
                  ` ${t("login.openGitHub")}`,
                ),
                h("p", { class: "muted small" }, t("login.deviceAuto")),
              );
              host.openExternal(info.verificationUri);
            },
          });
          opts.onSignedIn(user);
        } catch (e) {
          deviceBox.hidden = true;
          loginBtn.disabled = false;
          showError(e instanceof Error ? e.message : String(e));
        }
      },
    },
    icon("github", 18),
    ` ${t("login.withGitHub")}`,
  );

  const parts: Node[] = [
    h("div", { class: "logo" }, logo()),
    h("h1", { class: "screen-title big" }, "ResearchTree"),
    h("p", { class: "tagline" }, "Every branch is an experiment. Every PR is its lab note."),
    h(
      "p",
      { class: "screen-body" },
      t("login.intro"),
    ),
    loginBtn,
  ];
  if (!avail.ok) parts.push(h("p", { class: "muted small" }, avail.reason));
  if (opts.onDemo) {
    parts.push(h("button", { class: "btn demo-btn", type: "button", onclick: opts.onDemo }, icon("repo", 14), ` ${t("office.demo")}`));
  }
  parts.push(deviceBox, errorBox);

  const withToken = host.capabilities.signInWithToken;
  if (withToken) {
    const input = h("input", {
      type: "password",
      class: "input",
      placeholder: "github_pat_…",
      autocomplete: "off",
      "aria-label": t("login.tokenLabel"),
    });
    const submit = h("button", { class: "btn", type: "submit" }, t("login.withToken"));
    const form = h(
      "form",
      {
        class: "token-form",
        onsubmit: async (e: SubmitEvent) => {
          e.preventDefault();
          if (!input.value.trim()) return;
          submit.disabled = true;
          try {
            opts.onSignedIn(await withToken(input.value));
          } catch {
            submit.disabled = false;
            showError(t("login.tokenInvalid"));
          }
        },
      },
      h("div", { class: "row" }, input, submit),
      h(
        "p",
        { class: "muted small" },
        t("login.tokenHelp"),
      ),
    );
    parts.push(
      h("details", { class: "token-details", open: !avail.ok }, h("summary", null, t("login.patSummary")), form),
    );
  }

  return screen(...parts);
}

export function repoPicker(opts: {
  gh: GitHubClient;
  user: GitHubUser;
  recent: string[];
  error?: string;
  onPick: (repo: string) => void;
  onSignOut: () => void;
}): HTMLElement {
  const input = h("input", { class: "input", placeholder: "owner/name", "aria-label": t("picker.repoLabel"), autocomplete: "off", spellcheck: "false" });
  const errorBox = h("p", { class: "form-error", role: "alert" }, opts.error ?? "");
  errorBox.hidden = !opts.error;
  const list = h("div", { class: "repo-list" }, h("p", { class: "muted small" }, t("picker.loading")));
  let repos: { full_name: string; private: boolean }[] = [];

  const renderList = () => {
    const q = input.value.trim().toLowerCase();
    clear(list);
    const items = repos.filter((r) => r.full_name.toLowerCase().includes(q)).slice(0, 12);
    if (items.length === 0) list.append(h("p", { class: "muted small" }, t("picker.noMatch")));
    for (const r of items) {
      list.append(
        h(
          "button",
          { class: "repo-item", onclick: () => opts.onPick(r.full_name) },
          icon("repo", 14),
          h("span", null, r.full_name),
          r.private ? h("span", { class: "tag" }, t("picker.private")) : null,
        ),
      );
    }
  };
  input.addEventListener("input", renderList);
  opts.gh
    .listUserRepos()
    .then((r) => {
      repos = r;
      renderList();
    })
    .catch(() => {
      clear(list);
      list.append(h("p", { class: "muted small" }, t("picker.listFailed")));
    });

  const form = h(
    "form",
    {
      class: "row",
      onsubmit: (e: SubmitEvent) => {
        e.preventDefault();
        const v = input.value.trim();
        if (!parseRepo(v)) {
          errorBox.textContent = t("picker.formatError");
          errorBox.hidden = false;
          return;
        }
        opts.onPick(v);
      },
    },
    input,
    h("button", { class: "btn primary", type: "submit" }, t("common.open")),
  );

  return screen(
    h("div", { class: "eyebrow" }, `@${opts.user.login}`),
    h("h2", { class: "screen-title" }, t("picker.title")),
    h("p", { class: "screen-body" }, t("picker.body")),
    form,
    errorBox,
    h(
      "div",
      { class: "demo" },
      h("button", { class: "btn demo-btn", type: "button", onclick: () => opts.onPick(DEMO_REPO) }, icon("repo", 14), ` ${t("picker.demo")}`),
      h("p", { class: "muted small" }, t("picker.demoHint")),
    ),
    opts.recent.length
      ? h(
          "div",
          { class: "recent" },
          h("div", { class: "section-label" }, t("picker.recent")),
          h("div", { class: "chips" }, opts.recent.map((r) => h("button", { class: "chip", onclick: () => opts.onPick(r) }, r))),
        )
      : null,
    h("div", { class: "section-label" }, t("picker.mine")),
    list,
    h("button", { class: "btn ghost small", onclick: opts.onSignOut }, icon("logout", 14), ` ${t("common.signOut")}`),
  );
}

/**
 * Settings modal: the global language preference plus the per-repo branch names
 * (root branch and experiment prefix).
 */
export function settingsDialog(opts: {
  repo: string;
  /** Lines about the repo's `.researchtree`: the branches it sets, and anything it got wrong. */
  notes?: string[];
  locale: LocalePreference;
  /** Where the automatic language comes from, e.g. "browser language". */
  autoSource: string;
  onSave: (settings: { locale: LocalePreference }) => void;
  onCancel: () => void;
}): HTMLElement {
  const language = h(
    "select",
    { class: "input", "aria-label": t("settings.language") },
    h("option", { value: "auto" }, t("settings.languageAuto", { source: opts.autoSource })),
    LOCALES.map((l) => h("option", { value: l, lang: l }, LOCALE_NAMES[l])),
  );
  language.value = opts.locale;
  const close = (e: Event) => {
    if (e.target === overlay) opts.onCancel();
  };
  const form = h(
    "form",
    {
      class: "card dialog",
      role: "dialog",
      "aria-modal": "true",
      "aria-label": t("settings.title"),
      onsubmit: (e: SubmitEvent) => {
        e.preventDefault();
        opts.onSave({ locale: language.value as LocalePreference });
      },
    },
    h("div", { class: "eyebrow" }, opts.repo),
    h("h2", { class: "screen-title" }, t("settings.title")),
    h("label", { class: "field" }, h("span", null, t("settings.language")), language),
    h("p", { class: "muted small" }, t("settings.languageNote")),
    h("div", { class: "section-label" }, t("settings.branchTitle")),
    h("p", { class: "screen-body" }, t("settings.branchBody")),
    (opts.notes ?? []).map((note) => h("p", { class: "muted small repo-note" }, note)),
    h(
      "div",
      { class: "screen-actions" },
      h("button", { class: "btn primary", type: "submit" }, t("settings.save")),
      h("button", { class: "btn ghost", type: "button", onclick: opts.onCancel }, t("common.cancel")),
    ),
  );
  const overlay = h("div", { class: "overlay", onclick: close, onkeydown: (e: KeyboardEvent) => e.key === "Escape" && opts.onCancel() }, form);
  return overlay;
}
