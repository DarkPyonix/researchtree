# VS Code 확장

코드 편집기 바로 옆에서 실험 트리를 확인하고, 원하는 브랜치로 빠르게 전환할 수 있어요. 확장 ID는 `darkpyonix.researchtree`입니다.

::: warning 아직 배포 전
VS Code Marketplace와 Open VSX에는 아직 등록되지 않았어요. 현재는 소스코드에서 `.vsix` 파일을 직접 빌드해 설치할 수 있습니다.

```bash
git clone https://github.com/DarkPyonix/researchtree && cd researchtree
npm install
npm run package:extension          # apps/extension/researchtree-<버전>.vsix 생성
code --install-extension apps/extension/researchtree-*.vsix
```
:::

## 요구 사항

- VS Code 1.90 이상
- 내장 Git 확장(`vscode.git`)
- `origin` remote가 GitHub을 가리키는 워크스페이스

## 열기

- 명령 팔레트에서 **`ResearchTree: Open Tree`**를 실행합니다.
- 또는 상태 표시줄 왼쪽에 있는 **ResearchTree** 버튼을 누릅니다. 이 버튼은 워크스페이스에 GitHub 레포가 있을 때만 보여요.

트리는 에디터 탭으로 열려요. 탭을 잠시 숨겼다가 다시 열어도 보던 상태가 그대로 유지됩니다.

화면 언어는 VS Code의 기본 표시 언어를 따라가요 (한국어면 한국어, 그 외에는 영어). 원한다면 트리 화면의 [설정](/viewer/navigation#언어)에서 언제든 바꿀 수 있습니다.

## 레포 자동 선택

워크스페이스의 Git remote `origin` 주소로 레포(`owner/name`)를 자동 인식해요. 멀티 루트 워크스페이스처럼 후보가 여러 개라면 QuickPick 메뉴에서 열어볼 레포를 직접 고를 수 있습니다.

## 로그인

VS Code에 내장된 GitHub 계정을 사용해요 (요청 scope: `repo`). 처음에 뜨는 창에서 "허용"을 한 번만 눌러주면 끝납니다. 인증 토큰은 확장 호스트에만 보관되며 Webview로는 전달되지 않아요.

**`ResearchTree: Sign Out`** 명령을 실행하면 ResearchTree가 해당 GitHub 세션 사용을 멈추고 로그인 화면으로 돌아갑니다. 이때 VS Code 자체의 GitHub 로그인은 풀리지 않고 유지돼요.

## 확장 전용 기능

실험 노드의 상세 패널에 두 가지 전용 버튼이 추가됩니다.

| 버튼 | 동작 |
|---|---|
| **체크아웃** | `origin`에서 fetch한 뒤 해당 실험 브랜치로 전환합니다. 로컬에 없고 원격에만 있는 브랜치라면 새 추적 브랜치를 만들어 전환해요 |
| **부모 대비 diff** | 부모 실험과 이 실험 사이의 변경 파일 목록(GitHub compare)을 QuickPick으로 보여주고, 선택한 파일을 VS Code diff 에디터로 엽니다. 로컬에서 원격 브랜치를 찾지 못하면 GitHub 비교 화면을 띄워줘요 |

GitHub PR이나 W&B 같은 외부 링크는 기본 웹 브라우저에서 열립니다.

## 명령

| 명령 | 설명 |
|---|---|
| `ResearchTree: Open Tree` | 트리 패널 열기 |
| `ResearchTree: Sign Out` | ResearchTree에서 GitHub 세션 사용 중지 |

::: tip
트리와 패널이 제공하는 기능은 중앙 웹, VS Code 확장, 로컬 실행 환경 모두 동일해요. 다만 확장에는 브라우저 주소창이 없으므로 [공유 링크](/guide/web#공유-링크) 기능은 지원하지 않습니다.
:::

