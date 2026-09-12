# Direction

프로젝트의 배경, 설계 원칙, 그리고 지금까지 내린 결정과 그 이유를 기록한다.

## 1. 배경

- 팀이 Moshi / PersonaPlex 학습 코드를 함께 만들고 있다. 두 모델을 이해하는 데 한두 달이 걸렸기 때문에 초반부터 작업을 나누면 오버헤드가 크다. 그래서 **학습 코드는 함께 완성하고, 그 뒤 학습 가정을 수정하는 단계부터 역할을 나누기로** 했다.
- 가정을 나눠서 실험하면 "메인 코드에서 조금씩 바꿔 본 기록"이 빠르게 늘어난다. 이 기록을 **나무 그림으로 보고, 노드를 누르면 결과가 보이는** 실험 일지가 필요하다.
- 목표는 git 기록만이 아니라 **실험 기록까지 시각화하는, PR 기반 솔루션**이다.

## 2. 설계 원칙

1. **Git과 GitHub이 유일한 저장소다.** 별도 DB를 두지 않는다. 실험 기록은 PR 본문에 있고, 뷰어는 이를 읽고 쓰기만 한다. 도구를 지워도 기록은 GitHub에 남는다.
2. **사람이 읽을 수 있는 것이 우선이다.** PR 본문은 GitHub에서 그대로 읽어도 이해되어야 한다. 기계용 YAML 블록은 맨 위에 짧게 두고, 나머지는 자유로운 마크다운이다.
3. **작은 변경, 명확한 가설.** 브랜치 하나는 가설 하나를 검증하기 위한 최소한의 수정만 담는다.
4. **입체적이고 아기자기한 화면이 기본이다.** 레퍼런스(로마 여행 앱, 미코노스 복셀)처럼 등각 시점의 복셀 섬 위에서 연구가 나무처럼 자라는 모습을 보여준다. 라벨 칩과 상세 패널로 수치를 읽을 수 있게 하고, 같은 장면을 위에서 내려다보는 평면 보기는 전환해서 볼 수 있는 보조 화면으로 둔다.
5. **기본은 설치 없이.** URL 하나만 열면 트리가 보여야 한다. 교수님이나 다른 연구실에도 링크 하나로 공유할 수 있어야 한다. VS Code 확장과 로컬 실행은 같은 뷰어를 다른 곳에서 여는 추가 경로다.
6. **기록은 에이전트의 기억이기도 하다.** PR 트리는 사람이 보는 화면이면서, 코딩 에이전트가 코드로 탐색하는 계층적 기억이다. 가설·메트릭·부모·상태가 정해진 자리에 있으므로 에이전트는 마크다운을 다시 읽는 대신 타입이 있는 객체 위에서 조회하고, 모으고, 규칙을 실행한다(3.10).
7. **연구 브랜치만 보여준다.** 레포에는 `main`, `develop` 같은 연구 외 브랜치가 함께 있다. 트리는 `research`와 `experiment/*`만 다룬다.

## 3. 결정 사항

### 3.1 기록 위치: PR 본문

- 후보는 커밋 메시지, 브랜치 안의 기록 파일, PR 본문이었다.
- **PR 본문으로 결정했다.** PR은 브랜치의 최신 상태를 따라가므로, 브랜치에 커밋이 더 쌓여도 기록이 한곳에 유지된다. 커밋 메시지는 흩어지고, 파일은 머지할 때 충돌하거나 메인 코드를 오염시킨다.
- 이에 따라 **모든 실험 브랜치에는 반드시 PR이 하나 있어야 한다.**

### 3.2 트리 구조: PR base + YAML `parent`

- 트리의 루트는 `research` 브랜치다. `main`과 `develop`은 레포에 있지만 연구가 아닌 다른 용도로 쓰기 때문에 루트로 삼지 않는다.
- 실험 B를 A 위에서 파생하면 `experiment/B`를 `experiment/A`에서 따고 PR의 base도 `experiment/A`로 잡는다. 그러면 GitHub API의 `base.ref`와 `head.ref`만으로 부모-자식 관계가 나온다.
- 문제가 있다. 부모 PR이 머지된 뒤 브랜치가 삭제되면 GitHub가 자식 PR의 base를 자동으로 바꿔서 트리가 망가진다.
- **대응:** PR 본문 YAML에 `parent`를 명시하고 이것을 1순위로 쓴다. `base.ref`는 `parent`가 없을 때만 쓴다. 레포 설정에서 "Automatically delete head branches"도 끈다.

### 3.3 결론 확정: PR 상태

- open은 진행 중(running), merged는 채택(adopted), closed-unmerged는 기각(rejected)이다.
- 최종 채택할 아이디어가 정해지면 경쟁 관계의 나머지 PR은 close해서 실험 결과를 확정한다.
- YAML의 `status`로 이 값을 덮어쓸 수 있다. 예를 들어 머지는 안 했지만 채택된 경우다.

### 3.4 기술 스택: TypeScript 코어 하나, 제공 형태 셋

- 뷰어는 **TypeScript로 만든 SPA 하나**다. Vite로 빌드하고, 화면은 three.js 하나로 그린다(평면 보기도 같은 3D 장면). 배치에는 d3-hierarchy를 쓴다.
- 이 SPA를 세 가지 형태로 제공한다(3.5). 형태마다 달라지는 것은 **인증과 GitHub 호출 경로**뿐이다. 이 차이는 "호스트 어댑터" 인터페이스 하나로 감싼다. 트리 구성, PR 본문 파싱, 화면 코드는 전부 공유한다.
- 처음에는 Python 패키지가 뷰어를 싣고 로컬 서버로 띄우는 구조(TensorBoard 방식)만 검토했다. 설치 없이 링크 하나로 공유할 수 있어야 해서, 이제는 중앙 웹을 기본으로 하고 로컬 실행은 셀프 호스팅용 선택지로 둔다.

### 3.5 제공 형태

| 형태 | 대상 | 설치 | 인증 | GitHub 호출 |
|---|---|---|---|---|
| **중앙 웹** (기본) | 누구나, 특히 링크로 공유받는 사람 | 없음 | OAuth 웹 흐름 + 인증 프록시 | 브라우저 → `api.github.com` 직접 |
| **VS Code 확장** | 코드를 쓰면서 트리를 보는 연구자 | Marketplace / Open VSX | VS Code 내장 GitHub 인증 | 확장 호스트가 대신 호출 |
| **로컬 실행** (셀프 호스팅) | 중앙 사이트를 쓰지 않으려는 사람 | `uv tool install researchtree` | 터미널/웹 Device Flow | 로컬 Python 서버가 대신 호출 |

**중앙 웹**

- **DarkPyonix 조직**이 GitHub Pages로 호스팅한다. 주소는 `https://darkpyonix.dev/researchtree/`이고, 나중에 커스텀 도메인을 붙일 수 있다.
- 사용자는 접속해서 로그인한 뒤 레포를 고른다. 주소에 레포가 드러나서(`?repo=owner/name`) 링크로 공유할 수 있다.
- 사이트에는 코드만 있고 실험 데이터는 없다. 데이터는 매번 보는 사람의 GitHub 권한으로 불러온다.

**VS Code 확장**

- 같은 SPA를 Webview 패널에 띄운다. 레포는 열려 있는 워크스페이스의 git remote로 자동 선택한다.
- 확장 형태에서만 할 수 있는 기능이 있다. 노드에서 로컬 브랜치로 바로 체크아웃하고, 부모 대비 diff를 에디터로 연다.
- DarkPyonix 퍼블리셔로 VS Code Marketplace에 올리고, Cursor 같은 호환 에디터를 위해 Open VSX에도 올린다.

**로컬 실행 (셀프 호스팅)**

- `uv tool install researchtree`로 설치하고 `researchtree serve`로 실행한다. 빌드된 SPA를 `localhost`에서 띄운다.
- 셀프 호스팅 방법으로 "각자 GitHub Pages에 배포"가 아니라 이 방식을 택했다. 사용자마다 OAuth App과 프록시를 만들 필요가 없고, 레포가 비공개여도 Pages 유료 플랜이 필요 없기 때문이다.
- 중앙 사이트나 프록시를 전혀 거치지 않는다. 토큰은 사용자 머신에만 있다.
- 같은 패키지가 학습 스크립트용 `rt.log()`도 제공한다(3.8).

### 3.6 PR 편집 방식

1. 노드의 "편집" 버튼으로 GitHub PR 페이지를 연다. 공수가 거의 없다.
2. 뷰어 안에서 직접 수정한다. 호스트 어댑터를 통해 `PATCH /repos/{owner}/{repo}/pulls/{number}`를 호출한다.

**1로 시작해서 2를 목표로 한다.**

### 3.7 인증: 최초 접속 시 GitHub 로그인 한 번

세 형태 모두 "처음 한 번 로그인하면 끝"이라는 경험은 같다. 방식만 다르다.

**중앙 웹**

- 처음 접속하면 "GitHub로 로그인" 버튼이 뜬다. **한 번 로그인하면** 토큰이 브라우저에 저장되어 다음부터는 바로 트리가 보인다. 사용자가 PAT를 만들거나 CLI를 설치할 필요가 없다.
- **OAuth App은 DarkPyonix 조직 소유**로 등록한다. 로그인 화면에 조직 이름이 표시된다.
- GitHub의 토큰 발급 엔드포인트(`github.com/login/oauth/access_token`)는 CORS를 지원하지 않는다. 그래서 순수 정적 페이지만으로는 로그인을 끝낼 수 없다. 이 단계만 **아주 작은 인증 프록시**가 대신한다.
  - Cloudflare Worker로 운영한다. 주소는 `https://researchtree.thisisthepy.workers.dev`이고, 무료 티어로 충분하다. 계정은 thisisthepy Cloudflare 계정이다.
  - 프록시는 client secret을 보관하고, 인가 코드를 토큰으로 바꿔 주는 일만 한다. 토큰을 저장하거나 기록하지 않는다.
  - 허용 origin은 공식 사이트와 로컬 개발 주소로 제한한다.
- 흐름은 표준 OAuth 웹 흐름이다.
  1. 사용자가 GitHub 인가 페이지로 이동해 승인한다.
  2. 뷰어로 돌아오면서 `code`를 받는다.
  3. 뷰어가 프록시에 `code`를 보내 토큰을 받는다.
  4. 토큰을 `localStorage`에 저장한다.
- 토큰이 브라우저에 있으므로 **XSS 방어가 필수다.**
  - PR 본문은 신뢰할 수 없는 입력이다. 마크다운 렌더링 결과는 반드시 sanitize한다.
  - 엄격한 CSP를 걸고, 외부 런타임 스크립트는 쓰지 않는다. 라이브러리는 모두 번들에 포함한다.
**VS Code 확장**

- VS Code 내장 GitHub 인증 제공자(`vscode.authentication.getSession('github', ['repo'])`)를 쓴다. 사용자는 VS Code의 계정 메뉴에서 한 번 허용하면 된다.
- 별도의 OAuth App이나 프록시가 필요 없다. 토큰은 확장 호스트에만 있고 Webview에는 넘기지 않는다.

**로컬 실행**

- OAuth **Device Flow**를 쓴다. 로컬 페이지에 처음 접속하면 일회용 코드를 보여주고, github.com/login/device에서 승인하면 끝난다. 브라우저가 없는 서버에서는 `researchtree login`으로 터미널에서 같은 과정을 진행한다.
- Device Flow는 client secret과 콜백 주소가 필요 없다. 그래서 DarkPyonix OAuth App의 client ID만 패키지에 넣으면 되고, 로컬 서버는 CORS 제약도 없으므로 프록시가 필요 없다.
- 토큰은 OS 키체인에 저장한다. 키체인을 쓸 수 없으면 권한을 제한한 파일에 저장한다. `RESEARCHTREE_TOKEN` 환경변수가 있으면 그것을 우선한다.

### 3.8 Python 패키지: 로컬 실행 + 학습 연동

- PyPI 패키지 `researchtree`는 세 가지를 제공한다.
  - `researchtree serve`: 빌드된 SPA를 싣고 로컬에서 띄우는 셀프 호스팅 서버.
  - `import researchtree as rt`: 학습 스크립트에서 PR에 메트릭을 쓰는 `rt.log()` 등의 API.
  - `rt.load()`: PR 트리를 에이전트가 코드로 탐색하는 객체로 읽는 API(3.10).
- 둘은 같은 토큰 저장소를 쓴다. 로컬 뷰어에서 한 번 로그인하면 학습 스크립트도 바로 쓸 수 있다.
- 설치 경로는 두 가지다. CLI는 `uv tool install researchtree`, 학습 코드에서는 `uv add researchtree`로 설치한다.
- 서버는 표준 라이브러리만으로 만든다. 순수 Python wheel을 유지해서 `uv tool`로 설치가 가볍게 끝나게 한다.

### 3.10 에이전트 기억: PR 트리를 Python 객체로

- 배경: 에이전트 기억은 보통 텍스트나 사실 목록에 두고 검색으로 꺼낸다. 이런 방식은 개별 사실은 잘 꺼내지만, 전체 기록을 모으는 질문(몇 개, 가장 좋은 것, 추세)이나 규칙 검사에 약하다. User as Code(Bojie Li, 2026, arXiv:2606.16707)는 기억을 타입이 있는 Python 상태와 그 위의 규칙 함수로 두고, 지우지 않는 로그를 주기적으로 코드로 구조화하자고 제안한다. 레퍼런스: `docs/references/user_as_code_paper.pdf`.
- ResearchTree에 대응시키면 커밋과 PR이 지우지 않는 로그, PR 본문 YAML이 타입 상태, 버전(섬) → 실험 → 본문·커밋이 계층 모듈이다. 기록할 때 이미 구조가 정해지므로 논문의 "구조화" 단계(LLM이 로그를 코드로 다시 쓰는 과정)가 필요 없다.
- 제공: `researchtree` 패키지의 `rt.load()`가 `Research` → `Version` → `Experiment` 객체를 돌려준다. `manifest()`는 늘 문맥에 두는 짧은 요약(점진적 공개의 첫 단계)이고, 섬과 실험의 `describe()`, 본문 섹션, 커밋·코멘트·파일(지연 로딩) 순으로 내려간다. `check()`는 결정적인 규칙 함수로 경고를 만든다(오래 멈춘 실험, 퇴행한 채택 등). CLI는 `researchtree memory`.
- GitHub이 유일한 저장소라는 원칙은 그대로다. 객체는 호출할 때마다 GitHub에서 읽어 만들고, 따로 저장하지 않는다.
- 트리 규칙은 TypeScript(`apps/core/src/tree.ts`)와 Python(`apps/researchtree/memory/build.py`) 두 곳에 있다. 둘 다 `tests/fixtures/tree-sample.json` → `tree-expected.json`을 통과해야 한다.

### 3.9 이름: `researchtree`

- `forkbook`, `labgrove`, `branchbook`, `prtree`, `research-tree` 등을 검토했다.
- 이름만으로 용도가 전달되는 `researchtree`로 정했다. 웹 주소, 레포 이름, PyPI 이름, import 이름, VS Code 확장 ID(`darkpyonix.researchtree`)를 모두 같게 하려고 하이픈은 뺐다.
- 알려진 단점: 검색할 때 게임의 기술 트리 등과 섞일 수 있다. 문서에서는 "ResearchTree"로 표기해서 보완한다.
- PyPI는 하이픈을 뺀 이름을 별개 프로젝트로 본다. `research-tree`는 다른 사람이 등록할 수 있다는 점을 알고 있다.

## 4. 검토한 기존 도구

| 도구 | 가까운 점 | 부족한 점 |
|---|---|---|
| topleft/git-tree | 참고한 d3 트리 스타일 | 브랜치가 아니라 **디렉토리 구조**를 그린다 |
| W&B / MLflow / Aim | run마다 git commit을 기록한다 | 분기를 트리로 보여주지 않는다 |
| DVC `dvc exp` | git ref 기반 실험 | UI가 표 위주이고 PR과 연결되지 않는다 |
| GitHub network graph | 브랜치 분기를 보여준다 | 실험 결과가 없다 |

결론: 딱 맞는 도구가 없어서 **얇게 직접 만든다.** 이 조사는 조사한 사람이 아는 범위 기준이라 추가 확인이 필요하다.

## 5. UI 레퍼런스

- **로마 여행 앱(Threads 게시물).** 3D 지형 위 라벨을 클릭하면 카메라가 이동하고, 오른쪽 패널에 설명이 뜨고, 하단에 일차 타임라인과 재생이 있고, 미니맵이 있다. 실제로 동작하는 앱을 녹화한 것으로 보여 구조 레퍼런스로 삼는다.
- **Mykonos Island Voxels(Threads 게시물).** 이미지 생성 결과물로 보인다. 시간 슬라이더와 Layers 토글 아이디어만 가져온다.
- **git-tree.** 곡선 링크와 가지별 색상 같은 2D 트리 스타일을 참고한다.
- 구현을 보조하는 도구로 GPT-6 Astra 같은 최신 코딩 모델을 쓸 수 있다. 3D/프론트엔드 역량은 발표 기준 수치이므로 직접 써 보고 판단한다. 어떤 모델을 쓰든 [CONVENTIONS.md](CONVENTIONS.md)의 스키마와 규칙을 명세로 넘긴다.

## 6. 범위 밖 (당분간)

- 실험 실행이나 스케줄링. ResearchTree는 기록하고 보여주기만 한다.
- 메트릭 시계열 저장. 최종값만 PR에 두고, 곡선은 W&B 등 외부 링크로 본다.
- GitHub 외 호스팅(GitLab 등) 지원.
- 서버 측 데이터 저장. 중앙 호스팅은 정적 파일과 인증 프록시뿐이다. 계정, DB, 서버 캐시는 두지 않는다.
- 각자 GitHub Pages에 배포하는 방식의 셀프 호스팅. 셀프 호스팅은 `uv tool` 로컬 실행으로 지원한다.
- `research`와 `experiment/*` 외 브랜치(`main`, `develop` 등)의 시각화나 관리.
