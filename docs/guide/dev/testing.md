# 테스트

TypeScript 코드는 vitest, Python 코드는 pytest로 테스트해요. 테스트 파일은 `tests/` 아래에 `apps/`와 동일한 구조로 배치해 두었습니다.

```bash
npm test              # vitest run --config tests/vitest.config.ts
npm run typecheck     # tsc: core, ui, proxy, extension, tests
uv run pytest         # tests/researchtree (npm run test:py 와 같음)
```

## vitest (TypeScript)

| 파일 | 검증 내용 |
|---|---|
| `tests/core/prbody.test.ts` | PR 본문 무손실 왕복 검증. 블록 없음, 깨진 YAML, 여러 블록 등 엣지 케이스를 공유 fixture로 확인해요 |
| `tests/core/tree.test.ts` | 부모 및 상태 결정 규칙, 고아·순환 노드 처리, `main`/`develop` PR 숨김, research 버전 연결, 브랜치 설정, 시간과 계절(`started`/`ended`) 계산 |
| `tests/core/i18n.test.ts` | 한국어와 영어 문구 표의 키 일치 여부, 빈 문구 확인, 자리표시자 채우기, 환경 언어로 UI 언어 선택 |
| `tests/core/github.test.ts` | API 경로 검증(`assertApiPath`), Link 헤더 페이지네이션, 304 캐시 응답, 오류 처리 동작 |
| `tests/extension/rpc.test.ts` | 확장 호스트의 Webview 메시지 처리와 메서드 제한, 응답과 오류에 토큰이 노출되지 않는지 확인 |
| `tests/proxy/proxy.test.ts` | 허용되지 않은 origin 차단, preflight 요청, code 교환, 오류 응답 시 secret 비노출 검증 |

설정 파일은 `tests/vitest.config.ts`(Node 환경, `**/*.test.ts`)이고, 타입 검사는 `tests/tsconfig.json`으로 진행해요.

## pytest (Python)

| 파일 | 검증 내용 |
|---|---|
| `tests/researchtree/experiment/test_body.py` | `body.py`가 TS와 동일한 fixture로 같은 결과를 내는지 확인해요 |
| `tests/researchtree/experiment/test_tracking.py` | `rt.log`/`set`/`conclude`, rank 처리, 실패 시 경고만 남기는지 여부, 접두사 환경변수 |
| `tests/researchtree/github/test_auth.py` | Device Flow 응답(`authorization_pending`, `slow_down`, `expired_token`) 처리 로직 |
| `tests/researchtree/github/test_tokens.py` | 토큰 조회 우선순위와 저장 과정 |
| `tests/researchtree/server/test_server.py` | 로컬 서버의 Host 헤더 검사, 세션 토큰 검증, 중계 엔드포인트 제한 |

pytest는 `pyproject.toml` 설정에 따라 `--import-mode=importlib` 옵션으로 실행돼요. `tests/researchtree/` 경로가 실제 패키지 이름 `researchtree`를 가리지 않도록 하기 위해서입니다. `conftest.py`에서 테스트용 `RESEARCHTREE_CLIENT_ID` 등을 미리 설정해 줘요.

## 공유 fixture

`tests/fixtures/`에는 TS와 Python이 함께 사용하는 데이터가 들어 있어요.

| 파일 | 용도 |
|---|---|
| `prbody-cases.json` | PR 본문 파싱/재작성 케이스. `prbody.test.ts`와 `test_body.py`가 모두 통과해야 해요 |
| `prs-sample.json` | 트리 규칙 테스트에 쓰는 샘플 PR 목록 |

PR 본문 규칙을 변경할 때는 **fixture를 먼저** 고치고, 그다음 TS와 Python 구현 코드를 수정해 주세요.

## 아직 없는 테스트

- Playwright E2E("로그인 → 레포 선택 → 노드 클릭")와 `@vscode/test-electron` 기반 확장 통합 테스트
- `uv tool install ./dist/*.whl && researchtree --version` 형태의 CI 스모크 테스트
