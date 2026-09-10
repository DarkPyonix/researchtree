# 로컬 실행

`researchtree serve`는 뷰어를 내 컴퓨터(`127.0.0.1`)에 직접 띄우는 셀프 호스팅 방식이에요. 외부 중앙 사이트나 인증 프록시를 거치지 않고, 로컬 Python 서버가 GitHub API 호출을 대신 처리해 줍니다. 빌드된 뷰어가 패키지 안에 포함되어 있어 Node.js가 없어도 바로 실행할 수 있어요. Python 3.11 이상 환경이 필요합니다.

## 설치

```bash
uv tool install researchtree    # 또는 pip install researchtree
uvx researchtree serve          # 설치 없이 한 번만 실행
```

레포의 최신 개발 버전은 `uv tool install git+https://github.com/DarkPyonix/researchtree`로 설치해요. Git에서 직접 설치할 때는 wheel 빌드 훅이 뷰어를 함께 빌드해요. 이때 Node.js와 npm이 필요하며, 환경에 없으면 뷰어 없이 설치됩니다. 그래도 학습 스크립트용 `rt.log()` 같은 기능은 정상 동작하고, `researchtree serve` 실행 시에만 뷰어 빌드 안내 메시지가 나타나요. OS 키체인에 토큰을 안전하게 보관하고 싶다면 선택 의존성인 `keyring`을 함께 설치해 주세요 (`pip install "researchtree[keyring]"`).

## 명령

| 명령 | 설명 |
|---|---|
| `researchtree serve [--repo owner/name] [--port N] [--no-browser]` | 로컬 서버를 띄우고 브라우저를 엽니다. 현재 디렉토리가 GitHub 레포라면 해당 레포를 기본으로 열어줘요. 기본 포트는 `7337`이며, 이미 사용 중이라면 비어 있는 포트를 자동으로 찾습니다 (`--port`를 직접 지정한 경우에는 실패합니다) |
| `researchtree login` | 터미널에서 GitHub Device Flow로 로그인합니다. 브라우저를 띄울 수 없는 GPU 서버 환경에 유용해요 |
| `researchtree logout` | 저장된 토큰을 삭제합니다. 단, `RESEARCHTREE_TOKEN` 환경변수 값은 그대로 유지돼요 |
| `researchtree open [--repo owner/name]` | 현재 레포의 트리를 [중앙 웹](/guide/web) 뷰어로 열어줍니다 |
| `researchtree --version` | 버전 출력 |

`python -m researchtree serve`처럼 모듈로도 실행할 수 있습니다.

```bash
cd ~/work/moshi-research
researchtree serve
# ResearchTree: http://127.0.0.1:7337/?repo=lab/moshi-research
# 기본 레포: lab/moshi-research
# 종료하려면 Ctrl+C를 누르세요.
```

## 로그인

로컬 페이지에 처음 접속한 뒤 "GitHub로 로그인"을 누르면 Device Flow 코드가 발급돼요. `github.com/login/device`에서 코드를 입력하고 승인하면 자동으로 트리 화면으로 넘어갑니다. 터미널에서는 `researchtree login` 명령어로 동일한 흐름을 진행할 수 있어요.

::: tip 다른 로그인 방법
- 브라우저를 쓸 수 없는 서버라면 `RESEARCHTREE_TOKEN` 환경변수에 [개인 액세스 토큰](/guide/web#개인-액세스-토큰-pat-으로-로그인)을 넣고 실행합니다.
  ```bash
  export RESEARCHTREE_TOKEN=github_pat_...
  researchtree serve
  ```
- 직접 등록한 OAuth App(Device Flow 활성화)을 쓰려면 그 client ID를 `RESEARCHTREE_CLIENT_ID`에 넣습니다.
:::

## 토큰 저장 위치

토큰은 아래 우선순위에 따라 순서대로 탐색해요. 로그인하면 keyring에 우선 저장하고, keyring을 쓸 수 없으면 파일에 저장합니다.

1. `RESEARCHTREE_TOKEN` 환경변수
2. OS 키체인 (`keyring` 설치 시, 서비스명 `researchtree`)
3. 설정 파일 (권한 0600)

| OS | 파일 경로 |
|---|---|
| Windows | `%APPDATA%\researchtree\token` |
| macOS | `~/Library/Application Support/researchtree/token` |
| Linux | `$XDG_CONFIG_HOME/researchtree/token` (기본 `~/.config/researchtree/token`) |

저장된 토큰은 [학습 스크립트 연동](/guide/tracking)의 `rt.log()`에서도 함께 사용해요.

## 로컬 서버의 보안

- `127.0.0.1`에만 바인딩되어 같은 네트워크의 다른 기기에서는 접속할 수 없어요.
- DNS rebinding 방지를 위해 `Host` 헤더가 `127.0.0.1:<포트>` 또는 `localhost:<포트>`가 아니면 요청을 거부합니다.
- 실행할 때마다 새 세션 토큰을 만들어 페이지에 넣고, 모든 `/api/*` 요청마다 이를 검증해요.
- GitHub 중계는 GET, POST, PATCH, PUT만 허용하며, 토큰은 브라우저로 노출되지 않습니다.

자세한 내용은 [보안과 개인정보](/guide/security)를 참고해 주세요.

