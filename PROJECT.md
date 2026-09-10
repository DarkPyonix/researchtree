# ResearchTree

*Every branch is an experiment. Every PR is its lab note.*

## 한 줄 요약

Git 브랜치와 Pull Request를 기반으로, 연구 과정을 **초기 구현에서 점점 자라나는 실험 트리**로 시각화하는 웹 도구.

## 왜 만드는가

연구 과정에서는 메인 코드를 기준으로 조금씩 바꿔 보는 실험이 수없이 생긴다. 이런 실험 기록은 보통 W&B 대시보드, 노트, 메신저, 커밋 메시지에 흩어진다. 그래서 어떤 아이디어가 어디서 파생됐고, 무엇이 채택됐고, 무엇이 왜 기각됐는지 한눈에 보기 어렵다.

ResearchTree는 이 문제를 다음 규칙으로 푼다.

- **브랜치 하나 = 실험 하나.** 브랜치에는 작고 명확한 코드 수정만 담는다.
- **PR 하나 = 실험 일지 하나.** PR 본문에 가설, 변경점, 메트릭, 결론을 기록한다.
- **분기 관계 = 트리.** 실험 B를 실험 A 위에서 파생하면 트리에서도 A의 자식이 된다.
- **PR 상태 = 실험 결론.** open은 진행 중, merged는 채택, closed는 기각이다.

뷰어는 이 PR들을 읽어 트리로 그린다. 노드를 클릭하면 실험 결과를 보여주고, 그 자리에서 PR을 수정할 수 있다.

## 첫 사용처

Moshi / PersonaPlex 기반 음성 모델 학습 연구에서 쓴다. 팀이 함께 학습 코드를 완성한 뒤, 각자 학습 가정을 바꿔 보는 실험부터 ResearchTree로 기록한다. 지도교수님께 이 방식으로 연구를 기록하겠다고 공유할 예정이다.

## 사용 방법

같은 뷰어를 세 가지 방법으로 연다. 어느 방법이든 처음 한 번 GitHub 로그인을 하면 된다.

| 방법 | 시작하기 |
|---|---|
| **중앙 웹** (기본, 설치 없음) | `https://darkpyonix.github.io/researchtree/` 접속 → 로그인 → 레포 선택. `?repo=owner/name&node=experiment/...` 링크로 공유 |
| **VS Code 확장** | 확장 `darkpyonix.researchtree` 설치 → `ResearchTree: Open Tree`. 열린 워크스페이스의 레포가 자동 선택된다 |
| **로컬 실행** (셀프 호스팅) | `uv tool install researchtree` → `researchtree serve`. localhost에서 뜨고 중앙 서버를 거치지 않는다 |

학습 스크립트에서는 `uv add researchtree` 후 `rt.log(val_loss=...)`로 PR에 메트릭을 기록한다.

> 위 주소와 기능은 설계 목표이며 아직 구현되지 않았다.

## 브랜치 구조

```
research                    ← 트리의 루트 (초기 구현)
├─ experiment/baseline-moshi
│  ├─ experiment/depth-lr-half
│  └─ experiment/...
└─ experiment/...

main, develop, 기타          ← 연구 외 용도. 트리에 표시하지 않음
```

## 구성

| 부분 | 기술 | 역할 |
|---|---|---|
| 코어 (`apps/core/`) | TypeScript | 트리 구성, PR 본문 파싱, GitHub 클라이언트, `Host` 인터페이스 |
| 뷰어 (`apps/ui/`) | TypeScript, Vite, d3 (2D), three.js (3D) | 화면과 호스트(web·local·vscode·demo). 중앙 웹, 로컬 실행, VS Code용으로 각각 빌드한다 |
| 인증 프록시 (`apps/proxy/`) | Cloudflare Worker (TS) | 중앙 웹의 OAuth 토큰 교환만 담당한다 |
| VS Code 확장 (`apps/extension/`) | TypeScript | 뷰어를 Webview에 싣고 VS Code GitHub 인증과 git을 연결한다 |
| Python 패키지 (`apps/researchtree/`, 루트 `pyproject.toml`) | Python ≥ 3.11 | `researchtree serve`(로컬 실행)와 `rt.log()`(학습 연동) |

운영 주체는 **DarkPyonix 조직**이다. 중앙 웹 호스팅(GitHub Pages), OAuth App, 인증 프록시, VS Code 퍼블리셔, PyPI 패키지를 모두 조직이 소유한다.

## 문서

| 문서 | 내용 |
|---|---|
| [docs/DIRECTION.md](docs/DIRECTION.md) | 배경, 설계 원칙, 검토한 대안, 결정 사항과 그 이유 |
| [docs/CONVENTIONS.md](docs/CONVENTIONS.md) | 브랜치/PR 운영 규칙, PR 본문 YAML 스키마 |
| [docs/FEATURE.md](docs/FEATURE.md) | 기능 명세 (로그인, 트리 뷰어, 편집, 투어, VS Code, 로컬 실행, 학습 연동) |
| [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md) | 아키텍처, 모노레포 구조, Host 어댑터, 호스트별 인증, 배포, 테스트 |
| [docs/ROADMAP.md](docs/ROADMAP.md) | 단계별 개발 계획과 미해결 질문 |
| [docs/references/](docs/references/) | UI 레퍼런스 자료 |

## 상태

초기 설계 단계.
