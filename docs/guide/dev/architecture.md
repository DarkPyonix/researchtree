# 아키텍처

TypeScript로 작성한 뷰어 하나를 중앙 웹, VS Code 확장, 로컬 서버라는 세 가지 호스트에 올려 사용해요. 뷰어는 GitHub을 직접 호출하지 않고, 인증과 API 요청은 모두 `Host` 인터페이스를 거칩니다. 트리 구성 로직과 PR 본문 파싱, UI는 호스트 환경과 무관하게 독립적으로 동작해요.

```
                     ┌─────────────── viewer (TS SPA) ───────────────┐
                     │  UI (three.js) ── core (tree, prbody)         │
                     │                 │                             │
                     │           Host interface                      │
                     └───────┬─────────────┬─────────────┬───────────┘
                             │             │             │
                  ┌──────────▼───┐  ┌──────▼───────┐  ┌──▼──────────────────┐
                  │ web host     │  │ extension    │  │ local host          │
                  │ (browser)    │  │ (webview)    │  │ (browser)           │
                  └──┬────────┬──┘  └──────┬───────┘  └──┬──────────────────┘
                     │        │      postMessage          │ fetch /api/*
   OAuth code→token  │        │            │              │
   ┌─────────────────▼──┐     │   ┌────────▼─────────┐  ┌─▼──────────────────┐
   │ proxy              │     │   │ extension host   │  │ Python local server │
   │ (Cloudflare Worker)│     │   │ (Node)           │  │ (researchtree serve)│
   └────────────────────┘     │   │ GitHub auth      │  │ Device Flow, keyring│
                              │   └────────┬─────────┘  └─┬──────────────────┘
                              ▼            ▼              ▼
                                   api.github.com
```

| 호스트 | 토큰 위치 | GitHub 호출 주체 | 처음 여는 레포 |
|---|---|---|---|
| web | 브라우저 `localStorage` | 브라우저 (CORS 허용) | URL `?repo=`, 마지막 레포, 또는 선택 화면 |
| extension | 확장 호스트 (VS Code 인증 세션) | 확장 호스트 | 워크스페이스 git remote |
| local | OS 키체인 / 설정 파일 (Python) | 로컬 Python 서버 | 실행 디렉토리의 git remote 또는 `--repo` |

## Host 인터페이스

[`apps/core/src/host.ts`](https://github.com/DarkPyonix/researchtree/tree/main/apps/core/src/host.ts)

```ts
export interface Host {
  kind: "web" | "extension" | "local";
  auth: {
    current(): Promise<GitHubUser | null>;
    signIn(ui: SignInUI): Promise<GitHubUser>; // web: OAuth redirect, extension: getSession, local: Device Flow
    signOut(): Promise<void>;
    availability(): { ok: true } | { ok: false; reason: string };
  };
  request(req: GitHubRequest): Promise<GitHubResponse>; // method, path, query, body, etag
  initialRepo(): Promise<string | null>;
  openExternal(url: string): void;
  storage: { get<T>(key: string): T | undefined; set(key: string, value: unknown): void };
  capabilities: {
    checkout?(branch: string): Promise<void>;           // extension only
    openDiff?(base: string, head: string): Promise<void>; // extension only
    signInWithToken?(token: string): Promise<GitHubUser>; // web only (PAT)
  };
}
```

- `request`는 `api.github.com`의 경로만 받아요. 호스트가 요청을 보내기 전에 `assertApiPath`로 전체 URL이나 `//`, 스킴, 역슬래시를 모두 검사하고 거부하므로, 어떤 호스트에서도 토큰이 다른 도메인으로 새지 않습니다. 사용할 수 있는 메서드는 GET, POST, PATCH, PUT뿐이에요.
- 뷰어는 `capabilities`에 정의된 기능만 버튼으로 노출해요.

## 세 가지 빌드 모드

뷰어는 `apps/ui` 하나에서 Vite 모드만 바꿔 세 번 빌드해요. 각 번들에는 해당 진입점에 필요한 호스트 코드만 포함됩니다.

| 명령 | Vite 모드 | 진입점 | 결과 | CSP `connect-src` |
|---|---|---|---|---|
| `npm run build:web` | 기본 (web) | `main.web.ts` | `apps/ui/dist/` (GitHub Pages) | `'self'`, `api.github.com`, 인증 프록시 |
| `npm run build:local` | `serve` | `main.local.ts` | `apps/researchtree/server/static/` | `'self'` (로컬 서버가 모두 중계) |
| `npm run build:extension` | `extension` | `main.extension.ts` | `apps/extension/media/main.js`, `main.css` | 확장에서 nonce 기반 CSP를 따로 설정해요 |

web 빌드는 다음 환경변수를 읽어요(`apps/ui/.env*` 파일이나 셸 환경변수).

| 변수 | 뜻 |
|---|---|
| `VITE_GITHUB_CLIENT_ID` | OAuth App client ID(공개 값). 설정하지 않으면 "GitHub로 로그인"이 비활성화되고 PAT 로그인만 남아요 |
| `VITE_AUTH_PROXY_URL` | 인증 프록시 주소. 기본값은 `https://researchtree.thisisthepy.workers.dev` |
| `VITE_OAUTH_PKCE` | `"true"`로 설정하면 PKCE(`code_verifier`)를 함께 써요 |

## 데이터 흐름

1. **부팅**: 호스트의 `auth.current()`로 로그인 사용자를 확인해요. 없으면 로그인 화면을 띄우고, 있으면 `?repo=` → `initialRepo()` → 마지막 레포 순서로 열어볼 대상을 정합니다.
2. **로딩**: `GitHubClient`가 루트 브랜치가 있는지 확인하고, PR 목록(`/pulls?state=all`, 페이지네이션)과 버전 태그(`/tags` 및 태그 커밋 날짜)를 병렬로 불러와요. ETag 조건부 요청으로 응답을 캐시합니다.
3. **트리 구성**: `buildTree(prs, repo, config, tags, activity)`가 표시 대상 필터링, 상태 및 부모 결정, 버전 연결, 고아·순환 노드 처리, 세대 계산을 진행해요([트리 결정 규칙](/rules/tree-rules)).
4. **레이아웃**: `views/layout.ts`의 `placeTree`가 `d3-hierarchy` tidy tree로 행을 배치하고 날짜로 열을 정해요. 노드가 공간을 확보하느라 날짜보다 오른쪽으로 밀릴 수 있는데, 연도·계절 눈금도 노드가 실제로 놓인 자리에 맞춘 단조 변환으로 그려서 노드 날짜와 위치를 맞춰줍니다. 다른 섬에 놓이는 형제 노드 사이나 새 버전 앞에는 넉넉한 간격을 둬요.
5. **렌더링**: `Tree3D`가 화면을 그립니다(three.js, 직교 카메라, 인스턴싱한 복셀 타일, 레포 이름을 시드로 쓴 난수). research 버전마다 섬을 하나씩 만들고, 섬을 떠나는 길은 기둥 위 나무 나루터로 끝나며 섬 사이 바다에는 가지 색 깃발을 단 나룻배를 띄워요. 평면 보기는 같은 장면에서 카메라를 위로 돌리고 식물을 누른 뒤 땅·물·나루터·나룻배·장식을 숨긴 모드예요(회전 없이 이동과 확대만 지원). 바다를 건너는 구간은 평면 보기에서만 보이는 점선 길 타일로 이어집니다. 라벨은 3D 좌표를 화면에 투영한 HTML 칩이에요.
6. **패널**: PR 본문 마크다운은 안전하게 `renderMarkdown`(marked + DOMPurify)으로만 렌더링하고, DOM은 `h()` 헬퍼로 직접 생성해요. 외부 문자열을 `innerHTML`로 바로 넣지 않습니다.
7. **상태 동기화**: 선택한 노드와 레포를 URL 쿼리에 실시간으로 동기화해요(extension 제외). 언어나 레포별 브랜치 이름 같은 설정, 보기 모드, 섬별 라벨 메트릭은 `host.storage`에 저장해 유지합니다.

## PR 본문 무손실 재작성

[`apps/core/src/prbody.ts`](https://github.com/DarkPyonix/researchtree/tree/main/apps/core/src/prbody.ts)와 [`apps/researchtree/experiment/body.py`](https://github.com/DarkPyonix/researchtree/tree/main/apps/researchtree/experiment/body.py)는 동일한 규칙으로 동작해요.

- 본문에서 첫 번째 ` ```yaml ` 펜스 블록을 찾아 파싱하고, 앞뒤 텍스트는 건드리지 않고 그대로 둡니다.
- 내용을 수정할 때는 그 블록만 교체해요. 만약 블록이 없으면 본문 맨 위에 새로 추가합니다.
- 주석과 필드 순서, 알 수 없는 필드까지 그대로 보존해요. TS는 `yaml`(eemeli/yaml) Document API를 쓰고 Python은 `ruamel.yaml`을 사용합니다.
- 파싱에 실패한 블록은 절대 덮어쓰지 않아요.
- 두 구현 모두 `tests/fixtures/prbody-cases.json` 테스트를 통과해야 합니다. 규칙을 바꿀 때는 fixture를 먼저 고친 뒤 두 구현 코드를 수정해 주세요.

## 호스트별 요점

- **web**: OAuth 웹 흐름(`state` 검증, 콜백 직후 `code` 제거) → 프록시 `POST /token` → `localStorage` 저장 순서로 이어져요. PAT 로그인은 `/user`로 검증한 뒤 저장합니다. 401 오류를 받으면 토큰을 지우고 로그인 화면으로 되돌아가요.
- **extension**: `vscode.authentication.getSession("github", ["repo"])`를 씁니다. Webview가 `postMessage({ id, type: "github", req })`를 보내면 확장 호스트가 Node `fetch`로 호출해 `{ id, res }`로 응답해요. `retainContextWhenHidden` 옵션이 켜져 있어서 탭을 숨겨도 상태가 그대로 유지됩니다.
- **local**: 표준 라이브러리 `http.server`를 사용해요. 엔드포인트는 `/api/context`, `/api/auth`, `/api/auth/device`, `/api/auth/device/poll`, `/api/auth/logout`, `/api/github/{path}`(중계)로 나뉩니다. Device Flow는 `slow_down` 응답을 받으면 폴링 간격을 자동으로 늘려요.
