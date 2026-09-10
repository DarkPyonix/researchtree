# Roadmap

## P-1. 준비

- [ ] 레포를 `DarkPyonix/researchtree`로 두고 GitHub Pages 켜기
- [ ] DarkPyonix 조직으로 OAuth App 등록 (운영용 + 개발용). 콜백은 `https://darkpyonix.github.io/researchtree/`, Device Flow 활성화
- [ ] thisisthepy Cloudflare 계정에서 Worker `researchtree` 배포 → `https://researchtree.thisisthepy.workers.dev`
- [ ] VS Code Marketplace 퍼블리셔 `darkpyonix` 등록, Open VSX 네임스페이스 확보
- [ ] 연구 레포에 `research` 브랜치 만들기, "Automatically delete head branches" 끄기
- [x] npm workspaces 모노레포 골격, 루트 `pyproject.toml` 정리(오타 수정, `[build-system]`, 버전 `0.0.1`)
- [ ] PyPI 이름 선점 (`uv build && uv publish`)

## P0. 중앙 웹, 읽기 전용 MVP (교수님 시연 최소 조건)

- [x] `core`: `Host` 인터페이스, `github.ts`, `prbody.ts`, `tree.ts` (+ 공유 fixture 테스트)
- [x] `proxy`: `/token` 엔드포인트 구현과 테스트
- [ ] `proxy` 배포 (OAuth App 등록 후)
- [x] 웹 호스트: OAuth 웹 흐름, PAT 로그인, 토큰 저장과 로그아웃 (실제 OAuth App으로는 미검증)
- [x] 3D 연구의 섬 (기본 화면, 버전마다 섬 하나) + 평면 보기 전환 (같은 장면을 눌러 내리기/솟아오르기)
- [x] research 버전 태그로 본선을 그리기 (v1 → 채택 실험 → v2 …)
- [x] 글꼴 번들 (Pretendard + Fraunces + JetBrains Mono)
- [ ] 실제 연구 기록(Haan)을 `DarkPyonix/researchtree-test`에 재구성해서 실데이터로 검증
- [x] 레포 선택, `?repo=&node=` 공유 링크
- [x] 상세 패널(가설·결론/메트릭/커밋), 경고 배지, "GitHub에서 열기"
- [x] CSP와 마크다운 sanitize 적용
- [ ] Pages 자동 배포 (GitHub Actions 워크플로)
- [ ] 실제 연구 레포에서 가짜 실험 PR 몇 개로 검증

## P1. 쓰기, VS Code, 로컬 실행

- [ ] 뷰어 안 PR 편집, 채택/기각 버튼, 충돌 감지 (core API는 있음, UI 미구현)
- [ ] 새 실험 만들기 UI (core `createExperiment`는 있음)
- [x] 상태 레이어, 섬별 라벨 메트릭, 자식 실험 칩, 세대 네비게이터, 키보드 이동
- [x] 한국어/영어 UI (기본은 브라우저·VS Code 언어, 설정에서 변경)
- [ ] 메트릭 색칠, 검색, 미니맵
- [ ] 타임라인 재생, 투어 모드
- [x] **VS Code 확장**: Webview 패널, 내장 GitHub 인증, 워크스페이스 레포 자동 선택, 체크아웃, diff, `.vsix` 패키징 (실제 VS Code에서는 미검증)
- [ ] VS Code: 현재 체크아웃된 실험 강조 (`Host`에 이벤트 필요)
- [x] **로컬 실행**: `researchtree serve` / `login` / `logout` / `open`, Device Flow, git 설치용 빌드 훅 (실제 Device Flow는 미검증)
- [ ] `uv tool install` CI 스모크 테스트, Playwright E2E (web, local)

## P2. 발표와 확장

- [ ] 3D 연출 확장 (타임라인과 투어 결합, 섬 테마)
- [x] 학습 연동: `rt.log` / `rt.set` / `rt.conclude`
- [x] `researchtree open`
- [ ] 탭이 활성화될 때 자동 갱신
- [ ] 메트릭 비교 뷰(형제 노드끼리 비교)

## 미해결 질문

- OAuth App의 `repo` scope는 권한이 넓다(모든 비공개 레포에 쓰기 가능). 권한을 레포 단위로 좁히려면 GitHub App의 user access token이 필요한데, 대상 조직마다 앱을 설치해야 한다. 우선 OAuth App으로 시작하고, 외부 연구실로 사용이 넓어지면 다시 검토한다.
- 커스텀 도메인을 쓸 것인가? 도메인이 바뀌면 OAuth 콜백 URL도 함께 바뀐다.
- VS Code 확장에서도 투어 모드와 3D를 제공할 것인가? Webview 성능과 에디터 안이라는 맥락을 고려해야 한다.
- 한 실험을 여러 seed로 반복한 결과를 `metrics`에 어떻게 표현할 것인가? (평균±표준편차, 또는 run 목록)
- 채택된 실험이 부모로 머지된 뒤, 그 자식 실험의 부모를 어떻게 표시할 것인가? (원래 부모 유지 vs 머지된 지점)
- 프론트엔드 UI 프레임워크를 도입할 것인가?
