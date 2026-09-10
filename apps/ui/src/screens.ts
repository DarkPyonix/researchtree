import type { GitHubClient, GitHubUser, Host } from "@researchtree/core";
import { parseRepo } from "@researchtree/core";
import { clear, h, icon, type Child } from "./dom";

function logo(size = 44): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 48 48");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("aria-hidden", "true");
  const paths: [string, string][] = [
    ["M9 24c8 0 8-13 18-13", "#c8553d"],
    ["M9 24h18", "#e09f3e"],
    ["M9 24c8 0 8 13 18 13", "#3d7a6b"],
    ["M27 11c5 0 5-4 10-4", "#c8553d"],
    ["M27 37c5 0 5 5 10 5", "#3d7a6b"],
  ];
  for (const [d, c] of paths) {
    const p = document.createElementNS(ns, "path");
    p.setAttribute("d", d);
    p.setAttribute("fill", "none");
    p.setAttribute("stroke", c);
    p.setAttribute("stroke-width", "3");
    p.setAttribute("stroke-linecap", "round");
    svg.appendChild(p);
  }
  const dots: [number, number, string, boolean][] = [
    [27, 11, "#c8553d", true],
    [27, 24, "#e09f3e", false],
    [27, 37, "#3d7a6b", true],
    [37, 7, "#c8553d", false],
    [37, 42, "#3d7a6b", true],
  ];
  for (const [cx, cy, c, filled] of dots) {
    const e = document.createElementNS(ns, "circle");
    e.setAttribute("cx", String(cx));
    e.setAttribute("cy", String(cy));
    e.setAttribute("r", "3.6");
    e.setAttribute("fill", filled ? c : "#fffdf9");
    e.setAttribute("stroke", c);
    e.setAttribute("stroke-width", "2.4");
    svg.appendChild(e);
  }
  const root = document.createElementNS(ns, "circle");
  root.setAttribute("cx", "9");
  root.setAttribute("cy", "24");
  root.setAttribute("r", "4.5");
  root.setAttribute("fill", "#fffdf9");
  root.setAttribute("stroke", "#1d2a30");
  root.setAttribute("stroke-width", "3");
  svg.appendChild(root);
  return svg;
}

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
  actions: { label: string; onClick: () => void; primary?: boolean }[];
}): HTMLElement {
  return screen(
    h("div", { class: "eyebrow" }, opts.eyebrow ?? "ResearchTree"),
    h("h2", { class: "screen-title" }, opts.title),
    h("div", { class: "screen-body" }, ...opts.body.map((b) => (typeof b === "string" ? h("p", null, b) : b))),
    h(
      "div",
      { class: "screen-actions" },
      opts.actions.map((a) => h("button", { class: a.primary ? "btn primary" : "btn", onclick: a.onClick }, a.label)),
    ),
  );
}

export function loginScreen(opts: { host: Host; error?: string; onSignedIn: (user: GitHubUser) => void }): HTMLElement {
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
                h("p", { class: "muted" }, "GitHub에서 아래 코드를 입력하고 승인해 주세요."),
                h("div", { class: "device-code" }, info.userCode),
                h(
                  "button",
                  { class: "btn", onclick: () => host.openExternal(info.verificationUri) },
                  icon("external"),
                  " GitHub 열기",
                ),
                h("p", { class: "muted small" }, "승인하면 자동으로 넘어갑니다."),
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
    " GitHub로 로그인",
  );

  const parts: Node[] = [
    h("div", { class: "logo" }, logo()),
    h("h1", { class: "screen-title big" }, "ResearchTree"),
    h("p", { class: "tagline" }, "Every branch is an experiment. Every PR is its lab note."),
    h(
      "p",
      { class: "screen-body" },
      "실험 브랜치와 PR을 읽어 연구가 자라온 과정을 나무로 보여줍니다. 처음 한 번만 GitHub 로그인이 필요해요.",
    ),
    loginBtn,
  ];
  if (!avail.ok) parts.push(h("p", { class: "muted small" }, avail.reason));
  parts.push(deviceBox, errorBox);

  const withToken = host.capabilities.signInWithToken;
  if (withToken) {
    const input = h("input", {
      type: "password",
      class: "input",
      placeholder: "github_pat_…",
      autocomplete: "off",
      "aria-label": "개인 액세스 토큰",
    });
    const submit = h("button", { class: "btn", type: "submit" }, "토큰으로 로그인");
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
            showError("토큰을 확인할 수 없습니다. 권한과 만료일을 확인해 주세요.");
          }
        },
      },
      h("div", { class: "row" }, input, submit),
      h(
        "p",
        { class: "muted small" },
        "fine-grained 토큰이면 대상 레포에 Pull requests(읽기/쓰기), Contents(읽기) 권한을 주세요. 토큰은 이 브라우저에만 저장됩니다.",
      ),
    );
    parts.push(
      h("details", { class: "token-details", open: !avail.ok }, h("summary", null, "개인 액세스 토큰(PAT)으로 로그인"), form),
    );
  }

  if (host.kind === "web") {
    parts.push(
      h("a", { class: "demo-link", href: "?demo" }, "로그인 없이 데모 보기 →"),
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
  const input = h("input", { class: "input", placeholder: "owner/name", "aria-label": "레포", autocomplete: "off", spellcheck: "false" });
  const errorBox = h("p", { class: "form-error", role: "alert" }, opts.error ?? "");
  errorBox.hidden = !opts.error;
  const list = h("div", { class: "repo-list" }, h("p", { class: "muted small" }, "레포 목록을 불러오는 중…"));
  let repos: { full_name: string; private: boolean }[] = [];

  const renderList = () => {
    const q = input.value.trim().toLowerCase();
    clear(list);
    const items = repos.filter((r) => r.full_name.toLowerCase().includes(q)).slice(0, 12);
    if (items.length === 0) list.append(h("p", { class: "muted small" }, "일치하는 레포가 없습니다."));
    for (const r of items) {
      list.append(
        h(
          "button",
          { class: "repo-item", onclick: () => opts.onPick(r.full_name) },
          icon("repo", 14),
          h("span", null, r.full_name),
          r.private ? h("span", { class: "tag" }, "비공개") : null,
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
      list.append(h("p", { class: "muted small" }, "레포 목록을 불러오지 못했습니다. 직접 입력해 주세요."));
    });

  const form = h(
    "form",
    {
      class: "row",
      onsubmit: (e: SubmitEvent) => {
        e.preventDefault();
        const v = input.value.trim();
        if (!parseRepo(v)) {
          errorBox.textContent = "owner/name 형식으로 입력해 주세요.";
          errorBox.hidden = false;
          return;
        }
        opts.onPick(v);
      },
    },
    input,
    h("button", { class: "btn primary", type: "submit" }, "열기"),
  );

  return screen(
    h("div", { class: "eyebrow" }, `@${opts.user.login}`),
    h("h2", { class: "screen-title" }, "어떤 연구를 볼까요?"),
    h("p", { class: "screen-body" }, "research 브랜치와 experiment/* PR이 있는 레포를 골라 주세요."),
    form,
    errorBox,
    opts.recent.length
      ? h(
          "div",
          { class: "recent" },
          h("div", { class: "section-label" }, "최근에 본 레포"),
          h("div", { class: "chips" }, opts.recent.map((r) => h("button", { class: "chip", onclick: () => opts.onPick(r) }, r))),
        )
      : null,
    h("div", { class: "section-label" }, "내 레포"),
    list,
    h("button", { class: "btn ghost small", onclick: opts.onSignOut }, icon("logout", 14), " 로그아웃"),
  );
}
