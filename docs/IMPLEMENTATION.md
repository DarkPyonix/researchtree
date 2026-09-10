# Implementation

아키텍처, 디렉토리 구조, 호스트 어댑터, 인증 흐름, 배포 방법을 정리한다.

## 1. 아키텍처

TypeScript로 만든 뷰어 하나를 세 가지 호스트에 싣는다. 뷰어는 GitHub을 직접 알지 못한다. 인증과 API 호출은 모두 **호스트 어댑터**(`Host` 인터페이스)를 거친다.

```
                     ┌─────────────── viewer (TS SPA) ───────────────┐
                     │  UI (three.js) ── core (tree, prbody)         │
                     │                 │                             │
                     │           Host interface                      │
                     └───────┬─────────────┬─────────────┬───────────┘
                             │             │             │
                  ┌──────────▼───┐  ┌──────▼───────┐  ┌──▼──────────────────┐
                  │ host-web     │  │ host-vscode  │  │ host-local          │
                  │ (브라우저)    │  │ (Webview)    │  │ (브라우저)            │
                  └──┬────────┬──┘  └──────┬───────┘  └──┬──────────────────┘
                     │        │      postMessage          │ fetch /api/*
   OAuth code→token  │        │            │              │
   ┌─────────────────▼──┐     │   ┌────────▼─────────┐  ┌─▼──────────────────┐
   │ proxy              │     │   │ VS Code 확장 호스트│  │ Python 로컬 서버     │
   │ (Cloudflare Worker)│     │   │ (Node)            │  │ (researchtree serve)│
   └────────────────────┘     │   │ GitHub 인증 제공자  │  │ Device Flow, keyring│
                              │   └────────┬─────────┘  └─┬──────────────────┘
                              ▼            ▼              ▼
                                   api.github.com
```

| 호스트 | 토큰 위치 | GitHub 호출 주체 | 초기 레포 |
|---|---|---|---|
| web | 브라우저 `localStorage` | 브라우저 (CORS 허용) | URL `?repo=` 또는 선택 화면 |
| vscode | 확장 호스트 (VS Code 인증 세션) | 확장 호스트 | 워크스페이스 git remote |
| local | OS 키체인 (Python) | 로컬 Python 서버 | 실행 디렉토리의 git remote 또는 `--repo` |

## 2. 디렉토리 구조

npm workspaces 모노레포다. `apps/` 아래에 제품을 한 단계로 나란히 두고, 테스트는 루트 `tests/`에서 같은 이름으로 따른다.

```
researchtree/                         # github.com/DarkPyonix/researchtree
├─ README.md · PROJECT.md · CLAUDE.md · LICENSE
├─ package.json · package-lock.json   # npm workspaces, 루트 스크립트
├─ pyproject.toml · uv.lock           # Python 패키지 (git 설치를 위해 루트에 둔다)
├─ build.py                           # static/이 없으면 wheel 빌드 시 뷰어를 빌드하는 hatch 훅
├─ tsconfig.base.json
├─ docs/
├─ apps/
│  ├─ core/                           # TS 공용 로직: Host 인터페이스, GitHub 클라이언트, prbody, tree, i18n(ko/en), 확장 메시지 타입
│  ├─ ui/                             # 브라우저 쪽 전부: 화면, 호스트, 진입점, 빌드
│  │  └─ src/
│  │     ├─ app.ts · screens.ts · panel/ · views/ · styles.css …
│  │     ├─ views/                    # tree3d.ts (three.js 섬, 입체·평면 보기) · layout.ts (시간축 배치) · view.ts (뷰 인터페이스)
│  │     ├─ hosts/                    # web.ts · local.ts · extension.ts
│  │     └─ main.web.ts · main.local.ts · main.extension.ts
│  ├─ extension/                      # VS Code 확장 (확장 호스트: extension, rpc, git)
│  ├─ proxy/                          # Cloudflare Worker (OAuth 토큰 교환)
│  └─ researchtree/                   # Python 패키지
│     ├─ __init__.py · __main__.py    # 공개 API(rt.log 등), python -m researchtree
│     ├─ cli.py · git.py              # 명령줄, 로컬 git 정보
│     ├─ github/                      # api.py(REST) · auth.py(Device Flow) · tokens.py(토큰 저장)
│     ├─ experiment/                  # body.py(PR 본문 규칙) · tracking.py(rt.log / set / conclude)
│     └─ server/                      # app.py(실행 상태) · handler.py(HTTP·중계·보안) · static/(뷰어 빌드, gitignore)
└─ tests/                             # apps/와 같은 이름과 구조
   ├─ vitest.config.ts · tsconfig.json
   ├─ core/ · extension/ · proxy/     # vitest
   ├─ researchtree/                   # pytest (github/ · experiment/ · server/)
   └─ fixtures/                       # prbody-cases.json (TS·Python 공통) · prs-sample.json (트리 규칙 테스트)
```

- 뷰어는 `apps/ui` 하나에서 세 번 빌드한다.

| 명령 | 모드 | 결과 |
|---|---|---|
| `npm run build:web` | 기본 | `apps/ui/dist/` (GitHub Pages) |
| `npm run build:local` | `serve` | `apps/researchtree/server/static/` |
| `npm run build:extension` | `extension` | `apps/extension/media/main.js`, `main.css` |

- 각 번들에는 해당 진입점이 쓰는 호스트만 들어간다.
- `pyproject.toml`이 루트에 있어서 `pip install git+https://github.com/DarkPyonix/researchtree`로 바로 설치할 수 있다. 소스 위치는 hatch 설정(`packages = ["apps/researchtree"]`)으로 지정한다.
- pytest는 `--import-mode=importlib`로 실행한다. `tests/researchtree/`가 실제 패키지 이름을 가리지 않게 하기 위해서다.

## 3. Host 인터페이스

```ts
export interface Host {
  kind: "web" | "vscode" | "local";
  auth: {
    current(): Promise<User | null>;
    signIn(): Promise<User>;              // web: OAuth 리다이렉트, vscode: getSession, local: Device Flow UI
    signOut(): Promise<void>;
  };
  request(req: GitHubRequest): Promise<GitHubResponse>; // method, path, query, body, etag
  initialRepo(): Promise<string | null>;
  openExternal(url: string): void;
  storage: { get(k: string): unknown; set(k: string, v: unknown): void };
  capabilities: {
    checkout?(branch: string): Promise<void>;           // vscode만
    openDiff?(base: string, head: string): Promise<void>; // vscode만
  };
}
```

- `request`는 `api.github.com` 경로만 받는다. 전체 URL은 받지 않는다. 그래서 어떤 호스트에서도 토큰이 다른 도메인으로 새지 않는다.
- 뷰어는 `capabilities`에 있는 기능만 버튼으로 노출한다.

## 4. 데이터 모델

`apps/core/src/tree.ts`가 만드는 트리 모델은 다음 형태다.

```jsonc
{
  "repo": "owner/name",
  "root": "research",
  "nodes": [
    {
      "id": "experiment/depth-lr-half",        // head 브랜치 이름 = 노드 ID
      "parent": "experiment/baseline-moshi",   // 루트 직속이면 "research"
      "pr": { "number": 12, "url": "...", "title": "...", "author": "...",
              "state": "closed", "merged": false, "draft": false,
              "created_at": "...", "updated_at": "...", "closed_at": null },
      "status": "rejected",                    // running | adopted | rejected
      "meta": { "hypothesis": "...", "change": "...", "metrics": {...},
                "wandb": "...", "tags": [] },
      "body_md": "## 결론\n...",                 // YAML 블록을 뺀 나머지
      "warnings": ["yaml-parse-error"],
      "orphan": false
    }
  ]
}
```

부모, 상태, 표시 대상을 정하는 규칙은 [CONVENTIONS.md](CONVENTIONS.md)를 따른다. 루트 노드는 PR이 없는 가상 노드이고, 버전 태그가 있으면 첫 버전을 뜻한다.

버전 태그는 `GET /repos/{o}/{r}/tags`와 태그 커밋의 날짜(`GET /commits/{sha}`)로 읽어 `buildTree(prs, repo, config, tags)`에 넘긴다. 두 번째 버전부터는 `tree.versions`의 `VersionNode`(`research@v2`)가 되고, 트리 안에서 실험 노드와 같은 부모/자식 관계를 갖는다. 뷰는 `childrenOf`·`parentOf`로 두 종류를 함께 다룬다.

## 5. 호스트별 구현

### 5.1 web (중앙 웹)

OAuth App은 DarkPyonix 조직 소유다. 콜백 URL은 `https://darkpyonix.github.io/researchtree/`이다.

1. 로그인 버튼을 누르면 무작위 `state`를 만들어 `sessionStorage`에 저장한다. 그다음 `github.com/login/oauth/authorize?client_id=…&scope=repo&state=…`로 이동한다. 이때 돌아올 화면(레포, 노드)도 함께 저장한다.
2. 콜백으로 돌아오면 `state`를 검증하고 `code`를 꺼낸다. 그리고 주소창에서 `code`를 즉시 지운다(`history.replaceState`).
3. `POST https://researchtree.thisisthepy.workers.dev/token { code }`를 호출한다. 프록시가 client secret을 붙여 토큰으로 교환해 돌려준다.
4. 받은 토큰을 `localStorage`에 저장한다. `request`는 `fetch("https://api.github.com" + path)`에 `Authorization: Bearer` 헤더를 붙여 호출한다.

GitHub의 OAuth App PKCE 지원 현황을 구현 시점에 확인한다. 지원하면 `code_verifier`를 함께 쓴다.

**proxy 요구사항**

- 엔드포인트는 `POST /token` 하나다.
- `Origin` 허용 목록을 둔다. 공식 사이트와 `http://localhost:5173`만 허용한다.
- client secret은 Worker secret으로 보관한다.
- 요청 본문과 토큰은 로그에 남기지 않는다.

**XSS 방어** (토큰이 `localStorage`에 있으므로 필수)

- PR 본문 마크다운 렌더링 결과는 DOMPurify로 sanitize한다.
- CSP로 스크립트는 `'self'`만 허용한다. 연결 대상은 `api.github.com`과 프록시만 허용한다.
- 외부 CDN을 런타임에 부르지 않는다.

### 5.2 vscode (VS Code 확장)

- `extension.ts`
  - `ResearchTree: Open Tree` 명령으로 `WebviewPanel`을 만든다. `localResourceRoots`는 확장 안의 viewer 빌드 폴더로 제한하고, nonce 기반 CSP를 건다.
- 인증
  - `vscode.authentication.getSession("github", ["repo"], { createIfNone: true })`로 세션을 받는다.
  - 토큰은 확장 호스트에만 두고 Webview에는 넘기지 않는다.
- RPC
  - Webview는 `postMessage({ id, type: "github", req })`를 보낸다.
  - 확장 호스트가 Node `fetch`로 GitHub을 호출하고 `{ id, res }`로 답한다.
  - 경로 검증은 `Host.request` 규칙을 그대로 적용한다.
- git 연동(`git.ts`)
  - 내장 `vscode.git` 확장 API로 remote URL을 읽어 `owner/name`을 추론한다.
  - `checkout`은 fetch 후 브랜치 전환으로 처리한다.
  - `openDiff`는 `vscode.diff` 명령과 git URI로 처리한다.
- 상태 저장: `vscode.getState()`/`setState()`로 선택 노드와 필터를 보존한다. 탭을 숨겼다가 다시 열어도 상태가 유지된다.
- 최소 VS Code 버전은 구현 시점에 결정한다. `engines.vscode`에 명시한다.

### 5.3 local (`uv tool` 로컬 실행)

- `researchtree serve`는 표준 라이브러리 `http.server`로 `127.0.0.1:{port}`에 뜬다. `static/`(viewer local 빌드)을 서빙하고 브라우저를 연다.
- 로컬 API

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/context` | 실행 디렉토리 기준 기본 레포 |
| GET | `/api/auth` | 로그인 상태, 사용자 정보 |
| POST | `/api/auth/device` | Device Flow 시작 → `{ user_code, verification_uri, expires_in }` |
| GET | `/api/auth/device/poll` | 승인 여부 (`pending` / `ok` / `expired`) |
| POST | `/api/auth/logout` | 저장된 토큰 삭제 |
| * | `/api/github/{path}` | `api.github.com/{path}`로 중계. 토큰은 서버가 붙인다 |

- **보안**
  - `Host` 헤더가 `127.0.0.1:{port}` 또는 `localhost:{port}`가 아니면 거부한다. DNS rebinding을 막기 위해서다.
  - 모든 `/api/*` 요청에는 실행할 때마다 새로 만든 세션 토큰을 요구한다. 이 토큰은 서빙하는 HTML에 주입한다.
  - `/api/github/*`의 메서드는 GET, POST, PATCH, PUT으로 제한한다. DELETE는 막는다.
- **인증**(`github/auth.py`, `github/tokens.py`)
  - `POST github.com/login/device/code`로 코드를 받는다.
  - `interval` 간격으로 `POST github.com/login/oauth/access_token`을 폴링한다. `slow_down` 응답이 오면 간격을 늘린다.
  - client ID는 DarkPyonix OAuth App의 것을 상수로 둔다. 이를 위해 OAuth App 설정에서 Device Flow를 켠다.
  - 토큰을 찾는 순서는 `RESEARCHTREE_TOKEN` 환경변수, keyring(서비스명 `researchtree`), `<user_config_dir>/researchtree/token`(0600) 순이다.
  - `keyring`은 선택 의존성으로 두고, 없으면 파일로 대체한다.
- **학습 연동**(`experiment/tracking.py`)
  - 현재 브랜치는 `git rev-parse --abbrev-ref HEAD`로 알아낸다.
  - `GET /pulls?head={owner}:{branch}`로 PR을 찾는다.
  - 본문을 읽고 병합한 뒤 `PATCH`한다. 실패하면 한 번 재시도한 뒤 경고로 끝낸다.

## 6. core 구현 포인트

### 6.1 트리 구성 (`tree.ts`)

- head가 `experiment/`로 시작하고 base가 `research` 또는 `experiment/*`인 PR만 남긴다. YAML `parent`가 있으면 base 조건은 예외로 둔다. `main`, `develop` 등은 모델에 넣지 않는다.
- PR 목록은 `GET /repos/{o}/{r}/pulls?state=all&per_page=100`으로 받고 페이지네이션한다. 호출 수가 문제가 되면 GraphQL로 바꾸는 것을 검토한다.

### 6.1.1 Python 트리와 에이전트 기억 (`researchtree/memory/`)

- `build.py`: `tree.ts`의 `buildTree`를 줄 단위로 옮긴 것. 시각은 aware `datetime`으로 비교한다. `tests/fixtures/tree-sample.json`(PR, 태그, 활동) → `tree-expected.json`을 TS 테스트(`tests/core/tree-fixture.test.ts`)와 Python 테스트(`tests/researchtree/memory/test_build.py`)가 함께 검사한다. 규칙을 바꾸면 픽스처를 `RT_UPDATE_FIXTURES=1 npm test`로 다시 만들고 Python을 맞춘다.
- `model.py`: `Research`, `Version`, `Experiment`, `Experiments`. 탐색(`parent`, `children`, `ancestors`, `path`, `version`), 필드, 섹션 파싱, 부모 대비 `delta`/`improved`(메트릭 방향은 뷰어와 같은 이름 규칙), `describe()`, `to_dict()`.
- `source.py`: GitHub 읽기. PR(페이지네이션), 버전 태그와 커밋 날짜, GraphQL 활동(첫·마지막 커밋). 커밋·코멘트·파일은 실험별로 처음 부를 때 읽고 객체 수명 동안 캐시한다. 모든 호출은 `github/api.py`의 경로 검사를 거친다.
- `rules.py`: `Alert`와 기본 규칙 함수. 규칙은 `(Research) -> Iterable[Alert]`.
- `manifest.py`: 요약 텍스트. 섬별 실험 수와 방향을 아는 지표의 최고값, 진행 중 실험, info를 뺀 경고, 다음 단계 안내.
- 진입점: `researchtree.load()` / `from_data()`, CLI `researchtree memory`.

### 6.2 PR 본문의 무손실 재작성 (`core/src/prbody.ts` / `researchtree/experiment/body.py`)

- 본문에서 첫 번째 ` ```yaml ` 펜스 블록을 찾아 파싱하고, 앞뒤 텍스트는 그대로 둔다.
- 수정할 때는 그 블록만 교체한다. 블록이 없으면 본문 맨 위에 새로 넣는다.
- 주석과 필드 순서를 보존한다. TS는 `yaml` 패키지(eemeli/yaml)의 Document API를 쓰고, Python은 `ruamel.yaml`을 쓴다.
- 파싱에 실패하면 노드 `warnings`에 기록하고, 편집 폼 대신 원문 편집만 허용한다.
- TS와 Python 두 구현은 `tests/fixtures/prbody-cases.json`으로 같은 결과를 내는지 검증한다.

### 6.3 새 실험 만들기

- `GET /git/ref/heads/{parent}`로 부모 커밋을 알아낸다.
- `POST /git/refs`로 `experiment/<name>` 브랜치를 만든다.
- `POST /pulls`(draft)로 YAML 템플릿이 채워진 PR을 연다.

### 6.4 프론트엔드

- 상태는 작은 전역 store 하나로 관리하고 URL 쿼리와 동기화한다. vscode 호스트에서는 `storage`와 동기화한다. 프레임워크 없이 시작하고, 패널 UI가 복잡해지면 Preact나 Svelte 도입을 검토한다.
- 화면은 `views/tree3d.ts`(`Tree3D`) 하나이고 `views/view.ts`의 인터페이스를 구현한다. 배치는 `views/layout.ts`의 `placeTree`다. `d3-hierarchy` tidy tree로 행을 정하고(행 간격 `ROW_STEP` 16, 다른 섬의 이웃 행은 separation 2.6), 가로는 부모 → 자식마다 같은 간격(`LAYOUT_COL`의 1.3배, 새 버전 섬으로 넘어가면 1.8배)이다. 날짜는 위치를 정하지 않는다. 날짜↔x 변환(`dateToX`/`xToDate`)은 노드의 (시각, x)를 지나는 단조 구간 선형 함수(pool-adjacent-violators)라서, 밀린 노드가 있어도 연도·계절 눈금이 노드 날짜와 맞는다. 시각은 core가 GraphQL로 읽은 브랜치 첫·마지막 커밋 날짜(`listPullActivity`)와 YAML `started`/`ended`로 정한다.
- 평면 보기는 별도 렌더러 없이 같은 장면을 쓴다. 카메라가 위에서 내려다보는 시점으로 돌고, 식물을 납작하게 누르고, 땅·물·나루터·나룻배·장식을 숨기고, 바다를 건너는 구간은 평면에서만 보이는 점선 길 타일로 잇는다. 평면에서는 회전을 막고 이동과 확대만 허용한다. 전환해도 선택 상태가 유지된다.
- WebGL을 쓸 수 없으면 트리를 그릴 수 없다는 안내를 보여준다. 대체 화면은 없다.
- 3D는 직교 카메라와 OrbitControls, 인스턴싱한 복셀 타일로 그린다. research 버전(루트 v1 포함)마다 섬을 하나씩 두고, 각 노드는 부모를 따라 올라가 가장 가까운 버전(또는 루트)의 섬에 속한다. 섬 사이는 넓은 바다다. 섬을 떠나는 길은 기둥 위 나무 나루터로 끝나고, 바다 가운데에는 돛과 가지 색 깃발을 단 나룻배를 띄워 살짝 흔든다. 섬 모양과 장식은 레포 이름을 시드로 한 난수로 만들어 매번 같다. 라벨은 3D 좌표를 화면에 투영한 HTML 칩이다.
- VS Code 테마와 어울리도록 색은 CSS 변수로 정의한다. vscode 호스트에서는 `--vscode-*` 변수에 연결한다.

## 7. 빌드와 배포

| 대상 | 방법 | 소유 |
|---|---|---|
| 중앙 웹 | `npm run build:web` → `apps/ui/dist/`를 GitHub Pages로 배포 (GitHub Actions) | DarkPyonix/researchtree |
| 인증 프록시 | `apps/proxy`에서 `wrangler deploy` (변경 시에만) → `researchtree.thisisthepy.workers.dev` | thisisthepy Cloudflare 계정 |
| VS Code 확장 | `npm run package:extension` → `vsce publish`, `ovsx publish` | Marketplace 퍼블리셔 `darkpyonix`, Open VSX |
| Python 패키지 | `npm run build:local` → 루트에서 `uv build` → `uv publish` (Trusted Publishing) | PyPI `researchtree` |
| OAuth App | GitHub 조직 설정에서 등록 (운영용 + 개발용) | DarkPyonix 조직 |

- 세 산출물의 버전은 하나로 맞춘다. 태그 `v*`를 푸시하면 릴리스 워크플로가 전부 배포한다.
- `uv tool` 지원 조건
  - 순수 Python wheel(`py3-none-any`)을 유지한다.
  - `[project.scripts] researchtree = "researchtree.cli:main"`을 둔다.
  - CI에서 `uv tool install ./dist/*.whl && researchtree --version`을 실행하는 스모크 테스트를 한다.
- 중앙 웹은 프리뷰 배포를 두지 않는다. OAuth 콜백 URL이 하나로 고정되기 때문이다. 개발은 `localhost:5173`과 개발용 OAuth App으로 한다.

## 8. 테스트

- **core** (vitest)
  - `prbody`: 무손실 왕복을 검증한다. 블록 없음, 깨진 YAML, 여러 블록 같은 엣지 케이스를 포함한다.
  - `tree`: 다음을 검증한다.
    - 부모/상태 규칙
    - 고아 노드
    - 삭제된 부모 브랜치 상황
    - `main`/`develop` 관련 PR 숨김
- **Python** (pytest)
  - `experiment/body.py`가 같은 fixture로 TS와 동일한 결과를 내는지 검증한다.
  - Device Flow 응답(`authorization_pending`, `slow_down`, `expired_token`) 처리를 검증한다.
  - 로컬 서버의 Host 헤더와 세션 토큰 검사를 검증한다.
  - `rt.log`의 rank 처리를 검증한다.
- **호스트 어댑터**
  - web: `state` 불일치와 401 처리를 검증한다.
  - extension: `@vscode/test-electron`으로 명령 실행과 RPC를 검증한다.
  - proxy: 허용되지 않은 origin 거부를 검증한다.
- **E2E**: Playwright와 GitHub API 목(mock)으로 "로그인 → 레포 선택 → 노드 클릭 → 편집 저장"을 검증한다. web과 local 호스트 각각에서 돌린다.
- **보안**: 악성 HTML이 담긴 PR 본문 fixture가 렌더링될 때 스크립트가 실행되지 않는지 검증한다.
