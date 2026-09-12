# 기여 규칙

## 개발 환경

- Node 20 이상, npm (workspaces)
- Python 3.11 이상, [uv](https://docs.astral.sh/uv/)

```bash
git clone https://github.com/DarkPyonix/researchtree
cd researchtree
npm install
npm run dev        # http://localhost:5173 (웹 호스트)
```

개발 서버에서 OAuth 로그인을 쓰려면 개발용 OAuth App의 client ID를 `apps/ui/.env.local`에 넣어주세요(콜백 URL: `http://localhost:5173/`). 설정하지 않으면 PAT 로그인으로 개발하면 됩니다.

```ini
VITE_GITHUB_CLIENT_ID=Iv1.xxxxxxxx
```

로컬 서버와 확장은 각각 빌드한 뒤 확인해요.

```bash
npm run build:local && uv run researchtree serve
npm run build:extension && code --extensionDevelopmentPath="$PWD/apps/extension"
```

## 언어

- **코드 주석과 docstring**: 영어만 사용해요.
- 사용자에게 보이는 문구(UI, CLI 출력, 오류 메시지): 한국어와 영어를 함께 넣어요. 뷰어와 VS Code 확장은 `apps/core/src/i18n`에, Python 패키지는 `apps/researchtree/i18n`에 `ko`와 `en`을 나란히 둡니다.
- 이 가이드: 한국어가 원문이고, 같은 경로의 영어판을 `docs/guide/en/`에 둬요. 코드 예시 안의 주석은 영어를 씁니다.
- 커밋 메시지: 영어로 작성합니다.

## 코드 규칙

- 호스트 환경에 따라 달라지는 부분은 모두 `Host` 인터페이스를 거쳐요. 트리 로직, PR 본문 파싱, UI는 특정 호스트에 종속되지 않아야 합니다.
- PR 본문 재작성은 무손실이어야 해요. YAML 블록만 바꾸고, 기존 주석과 키 순서, 정의되지 않은 필드를 보존하며, 깨진 YAML 블록은 절대 덮어쓰지 않습니다.
- TS(`prbody.ts`)와 Python(`body.py`)은 같은 규칙으로 동작해요. 규칙을 바꿀 때는 fixture를 먼저 고친 뒤 두 언어의 구현을 함께 수정해 주세요.
- 모든 GitHub 호출은 `assertApiPath`를 거쳐요. 인증 토큰이 호스트 경계 밖으로 새어나가지 않도록 합니다.
- PR 본문은 `renderMarkdown`(DOMPurify)으로만 렌더링하고, DOM 요소는 `h()` 헬퍼로 만들어요. 외부 문자열을 `innerHTML`로 바로 넣지 않습니다.
- CDN에서 런타임 스크립트를 불러오지 않아요. 의존성은 모두 빌드 번들에 포함하고, `apps/ui/vite.config.ts`의 CSP 설정을 엄격하게 유지합니다.
- 브랜치와 PR 작성 규칙([연구 기록 규칙](/rules/branches))은 코드가 따라야 하는 약속이에요. 규칙을 바꿀 때는 이 가이드를 먼저 수정합니다.
- 주변 코드의 네이밍, 코딩 관용구, 주석 밀도를 맞추고 작고 명확한 모듈을 선호해요.
- `.dev.vars`, 토큰, client secret 같은 민감한 비밀 정보는 절대 커밋하지 않습니다.

## 커밋 규칙

- 기본 개발 작업은 `develop` 브랜치에서 진행해요. 요청이 없으면 기능 브랜치를 따로 만들지 않습니다.
- 형식: `Type: Summary` 한 줄로 작성해요.

| Type | 용도 |
|---|---|
| `Feat` | 새 기능 |
| `Fix` | 버그 수정 |
| `Refactor` | 동작 변화 없는 구조 변경 |
| `Test` | 테스트 |
| `Docs` | 문서 |
| `Chore` | 도구, 설정, 의존성 |

```
Feat: Add tree view
Docs: Add references
Chore: Add js ignores
```

- Summary는 영어 명령문으로 작성하고, 첫 글자는 대문자로 쓰며 마침표는 찍지 않아요.
- 제목만으로 변경 이유를 다 설명하기 어려울 때만 본문을 덧붙입니다.
- 커밋 하나에는 하나의 논리적 변경만 담고, 관련 없는 변경을 섞지 않아요.
- **AI 공동저자 금지**: Claude 등 AI 도구의 `Co-Authored-By` 트레일러나 "Generated with …" 문구를 커밋과 PR에 넣지 않습니다. 저자는 사람 커미터뿐이에요.

## 문서 규칙

- `README.md`는 영문 메인 페이지이고, 번역본은 `docs/locale/README_<lang>.md`(예: `README_ko.md`)에 둬요. 두 문서는 서로 링크로 연결합니다.
- `main` 브랜치의 `docs/` 디렉토리에는 `docs/locale/`과 `docs/guide/`만 남겨둡니다. 따라서 `README.md`, `docs/locale/*`, `docs/guide/*`에서 다른 `docs/` 경로를 링크하면 안 돼요. 필요한 내용은 이 가이드에 직접 옮겨 적어 주세요.
- 이 가이드 문서는 실제 구현된 기능과 항상 일치하도록 유지해요. 기능이 바뀌면 같은 변경 작업에서 가이드도 함께 수정합니다. 아직 없는 기능은 적지 않고, 준비 중인 기능은 `::: warning` 컨테이너로 표시해 주세요.
- 가이드 로컬 미리보기는 `npm run docs:dev`로 실행할 수 있어요. 빌드(`npm run docs:build`) 시 깨진 링크가 하나라도 있으면 실패하니 주의해 주세요.
