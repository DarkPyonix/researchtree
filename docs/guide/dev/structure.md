# 모노레포 구조

ResearchTree는 npm workspaces 모노레포예요. pnpm은 쓰지 않으며, Python 쪽은 uv를 씁니다. `pyproject.toml`이 레포 루트에 있어서 `pip install git+https://github.com/DarkPyonix/researchtree` 명령으로 바로 설치해 쓸 수 있어요.

## 디렉토리

`apps/` 아래에 각 프로젝트를 한 단계로 나란히 두고, 테스트는 루트 `tests/`에서 같은 이름 구조를 따라요. 중간에 불필요하게 감싸는 폴더는 두지 않습니다.

```
researchtree/
├─ README.md · LICENSE
├─ package.json · package-lock.json   # npm workspaces, 루트 스크립트
├─ pyproject.toml                     # Python 패키지 (git 설치를 위해 루트에 둠)
├─ build.py                           # static/이 없으면 wheel 빌드 때 뷰어를 빌드하는 hatch 훅
├─ tsconfig.base.json
├─ docs/
│  ├─ locale/                         # README 번역
│  └─ guide/                          # 이 가이드 (VitePress, @researchtree/guide)
├─ apps/
│  ├─ core/                           # TS 공용 로직
│  ├─ ui/                             # 브라우저 쪽 전부: 화면, 뷰, 호스트, 진입점, 빌드
│  ├─ extension/                      # VS Code 확장 호스트
│  ├─ proxy/                          # Cloudflare Worker (OAuth 토큰 교환)
│  └─ researchtree/                   # Python 패키지
└─ tests/                             # apps/와 같은 이름과 구조
```

## 패키지

| 경로 | 패키지 | 내용 |
|---|---|---|
| [`apps/core`](https://github.com/DarkPyonix/researchtree/tree/main/apps/core) | `@researchtree/core` | `Host` 인터페이스(`host.ts`), GitHub 클라이언트(`github.ts`), PR 본문 파서(`prbody.ts`), 트리 빌더(`tree.ts`), 브랜치 설정(`config.ts`), UI 문구 한국어/영어(`i18n/`), 확장 메시지 타입(`extension-protocol.ts`) |
| [`apps/ui`](https://github.com/DarkPyonix/researchtree/tree/main/apps/ui) | `@researchtree/ui` | 앱 셸(`app.ts`), 화면(`screens.ts`), 패널(`panel/`), 뷰(`views/tree3d.ts` three.js 섬(입체·평면 보기), `views/layout.ts` 시간축 레이아웃, `views/view.ts` 뷰 인터페이스), 호스트(`hosts/web.ts`, `local.ts`, `extension.ts`), 진입점(`main.web.ts`, `main.local.ts`, `main.extension.ts`), Vite 빌드 |
| [`apps/extension`](https://github.com/DarkPyonix/researchtree/tree/main/apps/extension) | `researchtree` (`darkpyonix.researchtree`) | `extension.ts`(Webview 패널, 인증, 상태 표시줄), `rpc.ts`(Webview 메시지 처리), `git.ts`(내장 Git API로 레포 추론, 체크아웃, diff) |
| [`apps/proxy`](https://github.com/DarkPyonix/researchtree/tree/main/apps/proxy) | `@researchtree/proxy` | `POST /token` 하나만 있는 Worker |
| [`apps/researchtree`](https://github.com/DarkPyonix/researchtree/tree/main/apps/researchtree) | PyPI `researchtree` | `cli.py`, `git.py`, `github/`(`api.py` REST, `auth.py` Device Flow, `tokens.py` 토큰 저장), `experiment/`(`body.py` PR 본문 규칙, `tracking.py` `rt.log`/`set`/`conclude`), `server/`(`app.py` 실행 상태, `handler.py` HTTP·중계·보안, `static/` 뷰어 빌드 · gitignore) |
| `docs/guide` | `@researchtree/guide` | 이 문서 사이트 |

## 테스트 디렉토리

```
tests/
├─ vitest.config.ts · tsconfig.json
├─ core/                # prbody, tree, github (vitest)
├─ extension/           # rpc (vitest)
├─ proxy/               # proxy (vitest)
├─ researchtree/        # pytest: experiment/ · github/ · server/
└─ fixtures/            # prbody-cases.json (TS·Python 공통) · prs-sample.json (트리 규칙)
```

## 명령어

프로젝트 루트에서 실행해요.

```bash
npm install                 # 의존성 설치 (모든 workspace)
npm test                    # vitest (config: tests/vitest.config.ts)
npm run typecheck           # core, ui, proxy, extension, tests 타입 검사
npm run dev                 # 웹 개발 서버 http://localhost:5173
npm run build               # web + local + extension 빌드 (모두 apps/ui에서)
npm run build:web           # apps/ui/dist/ (GitHub Pages)
npm run build:local         # apps/researchtree/server/static/
npm run build:extension     # apps/extension/media/ + dist/extension.js
npm run package:extension   # .vsix
npm run docs:dev            # 이 가이드 개발 서버
npm run docs:build          # 이 가이드 빌드 → docs/guide/.vitepress/dist

uv run pytest               # Python 테스트 (= npm run test:py)
uv build                    # Python wheel (먼저 npm run build:local, 또는 빌드 훅이 대신 함)
```

작업을 마치기 전에 수정한 패키지의 테스트와 타입 검사를 꼭 실행해 주세요.
