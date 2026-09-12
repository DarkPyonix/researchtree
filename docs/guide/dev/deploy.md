# 배포

| 대상 | 방법 | 소유 |
|---|---|---|
| 중앙 웹 + 이 가이드 | GitHub Actions `pages.yml` → GitHub Pages | DarkPyonix/researchtree |
| 인증 프록시 | `apps/proxy`에서 `wrangler deploy` (변경 시에만) | thisisthepy Cloudflare 계정 |
| VS Code 확장 | `v*` 태그 → GitHub Actions `release.yml` (`vsce publish`, `ovsx publish`) | Marketplace 퍼블리셔 `darkpyonix`, Open VSX |
| Python 패키지 | `v*` 태그 → GitHub Actions `release.yml` (`uv build`, `uv publish`) | PyPI `researchtree` |
| OAuth App | GitHub 조직 설정에서 등록 (운영용 + 개발용) | DarkPyonix 조직 |

## 릴리스 (PyPI, VS Code Marketplace, Open VSX)

`pyproject.toml`의 `version`과 `apps/extension/package.json`의 `version`을 같은 값으로 올리고 `main`에 머지한 뒤, 그 버전의 태그를 push해요.

```bash
git switch main && git pull
git tag -a v1.0.0 -m "v1.0.0" && git push origin v1.0.0
```

`.github/workflows/release.yml`이 태그와 두 버전이 같은지 확인한 다음, Python 패키지와 VS Code 확장을 동시에 배포합니다. research 버전 태그는 `research/v1`처럼 루트 브랜치 이름이 붙어서 이 태그와 겹치지 않아요.

**처음 한 번 설정**

- **PyPI**: [pypi.org](https://pypi.org/manage/account/publishing/)의 **Publishing → Add a new pending publisher**에서 GitHub를 고르고 PyPI 프로젝트 `researchtree`, owner `DarkPyonix`, repository `researchtree`, workflow `release.yml`, environment `pypi`를 등록해요. Trusted Publishing이라 API 토큰을 저장하지 않습니다.
- **VS Code Marketplace**: [퍼블리셔 관리 페이지](https://marketplace.visualstudio.com/manage)에서 퍼블리셔 `darkpyonix`를 만들고, Azure DevOps에서 **Marketplace (Manage)** 권한과 **All accessible organizations** 범위로 Personal Access Token을 발급해요.
  Azure DevOps를 쓸 수 없으면 토큰 없이 두고, 워크플로가 남긴 `vsix` 아티팩트나 `npm run package:extension`으로 만든 파일을 같은 관리 페이지에서 **New extension → Visual Studio Code**로 직접 올려요. 토큰이 없는 스토어는 워크플로가 건너뜁니다.
- **Open VSX**: [open-vsx.org](https://open-vsx.org)에 GitHub로 로그인해 Eclipse 계정을 연결하고 **Publisher Agreement**에 서명한 뒤, 액세스 토큰을 만들고 네임스페이스를 한 번 만들어요(`npx ovsx create-namespace darkpyonix -p <토큰>`).
- 레포 **Settings → Environments**에 `pypi`와 `marketplace` 환경을 만들고, `marketplace`에 secret `VSCE_PAT`(Marketplace 토큰)와 `OVSX_PAT`(Open VSX 토큰)를 넣어요.

## GitHub Pages

`.github/workflows/pages.yml` 워크플로우는 `main` 브랜치에 push되거나 수동 실행(`workflow_dispatch`)할 때 다음 작업을 진행해요.

1. `npm ci`
2. 뷰어 빌드: `npm run build:web`을 실행해 `apps/ui/dist/`에 빌드해요. 레포 변수 `GITHUB_CLIENT_ID`(없으면 `RESEARCHTREE_CLIENT_ID`)가 있으면 `VITE_GITHUB_CLIENT_ID`로 넘깁니다.
3. 가이드 빌드: `npm run docs:build`로 문서를 빌드해 `docs/guide/.vitepress/dist/`에 생성해요.
4. `_site/` 조립: 뷰어 결과물을 루트에 두고, 가이드는 `_site/guide/`에 배치합니다.
5. `actions/upload-pages-artifact`와 `actions/deploy-pages`로 배포해요.

| 주소 | 내용 |
|---|---|
| `https://darkpyonix.dev/researchtree/` | 뷰어 |
| `https://darkpyonix.dev/researchtree/guide/` | 이 가이드 (VitePress `base: "/researchtree/guide/"`) |

**처음 한 번 설정**

- 레포 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 지정해 주세요.
- OAuth App을 등록한 뒤 **Settings → Secrets and variables → Actions → Variables**에서 OAuth App client ID(공개 값)를 `RESEARCHTREE_CLIENT_ID`로 추가해요. GitHub는 `GITHUB_`로 시작하는 새 변수 이름을 받지 않아서 이 이름을 사용합니다. 설정하지 않으면 PAT 로그인만 되는 뷰어가 배포돼요.
- OAuth App 콜백 URL은 `https://darkpyonix.dev/researchtree/`입니다. 콜백 URL이 하나로 고정되어 있어 프리뷰 배포는 따로 두지 않아요. 로컬 개발은 `localhost:5173`과 개발용 OAuth App으로 진행합니다.

## 인증 프록시 (Cloudflare Worker)

```bash
cd apps/proxy
npx wrangler secret put GITHUB_CLIENT_SECRET   # 처음 한 번
npm run deploy                                 # = npx wrangler deploy
```

- `wrangler.jsonc`의 `vars`에 `GITHUB_CLIENT_ID`(공개 값)와 `ALLOWED_ORIGINS`(`https://darkpyonix.github.io,http://localhost:5173`)를 설정해요.
- 로컬 개발(`npm run dev` = `wrangler dev`)에 쓰는 secret은 `.dev.vars`에 둡니다. git에 절대 커밋하지 마세요.
- 배포 주소: `https://researchtree.thisisthepy.workers.dev`

## VS Code 확장

```bash
npm run package:extension           # apps/extension/researchtree-<버전>.vsix
```

배포는 릴리스 워크플로가 이 `.vsix`를 VS Code Marketplace(퍼블리셔 `darkpyonix`)와 Open VSX에 올려요.

`vscode:prepublish` 스크립트가 루트 `LICENSE`를 복사하고 Webview와 확장 호스트를 함께 빌드해요. 최소 지원 VS Code 버전은 `engines.vscode`(`^1.90.0`)입니다.

## Python 패키지

```bash
npm run build:local     # 뷰어를 apps/researchtree/server/static/에 빌드
uv build                # dist/ 에 sdist와 wheel
```

배포는 릴리스 워크플로가 PyPI Trusted Publishing으로 올려요.

- 플랫폼 무관 순수 Python wheel(`py3-none-any`) 구조를 유지해요. `[project.scripts] researchtree = "researchtree.cli:main"`이 선언되어 있어 `uv tool install`로 바로 설치할 수 있습니다.
- 소스 위치는 hatch 설정인 `packages = ["apps/researchtree"]`로 지정해요. `static/` 폴더는 gitignore 대상이지만 빌드 산출물(artifacts)로 wheel과 sdist에 함께 포함됩니다.
- `build.py` 훅은 `static/index.html`이 없으면 npm으로 뷰어를 알아서 빌드해요. 환경변수 `RESEARCHTREE_SKIP_WEBVIEW=1`을 주면 이 빌드 단계를 건너뜁니다.
