# Conventions

ResearchTree가 동작하려면 팀이 지켜야 하는 브랜치/PR 규칙과 PR 본문 형식을 정리한다.

## 1. 브랜치 규칙

### 1.1 브랜치 역할

> 루트 브랜치 이름(`research`)과 실험 브랜치 접두사(`experiment/`)는 기본값이다. 바꾸려면 레포의 기본 브랜치에 있는 `.researchtree.yml`에 적는다(`root`, `prefix`). 레포 하나에 설정 하나이므로 뷰어도, CLI도, 학습 스크립트도 같은 값을 읽는다. 이 문서의 `research`, `experiment/`는 설정한 이름으로 읽는다.

| 브랜치 | 용도 | 트리에 표시 |
|---|---|---|
| `research` | **연구 트리의 루트.** 실험의 출발점이 되는 초기 구현이며, 채택된 실험이 최종적으로 모이는 곳 | O (루트) |
| `experiment/*` | 실험 하나당 브랜치 하나 | O (노드) |
| `main`, `develop` | 연구와 다른 용도(배포, 일반 개발 등) | X |
| 그 밖의 모든 브랜치 | 연구와 무관 | X |

- 뷰어는 `research`와 `experiment/*`만 그리고, 나머지 브랜치와 그 PR은 **화면에서 숨긴다.** 예를 들어 `experiment/*` → `main` PR이나 `develop` → `main` PR은 트리에 나타나지 않는다.
- `research`와 `main`/`develop` 사이의 코드 교류는 이 문서의 범위 밖이다. 교류하더라도 트리에는 영향을 주지 않는다.

### 1.2 실험 브랜치

- 실험 브랜치 이름은 `experiment/<짧은-이름>`으로 짓는다. 예: `experiment/depth-lr-half`
- research에서 시작하는 실험은 **기반으로 삼는 research 버전 태그(`vN`)에서** 딴다(1.3 참고). 파생 실험은 **부모 실험 브랜치에서** 딴다.
  ```bash
  git switch experiment/baseline-moshi
  git switch -c experiment/depth-lr-half
  ```
- `experiment/` 아래의 이름은 평평하게(한 단계로) 둔다. 계층은 브랜치 이름이 아니라 부모 관계로 표현한다.
- 한 브랜치는 가설 하나만 검증한다. 가설이 두 개면 브랜치도 두 개다.
- 레포 설정에서 **"Automatically delete head branches"를 끈다.** 진행 중인 자식이 있는 부모 브랜치가 삭제되면 자식 PR의 base가 바뀌기 때문이다. 브랜치는 새 버전을 낼 때 한꺼번에 정리한다(1.4).

### 1.3 research 버전 태그

`research`는 채택된 실험이 계속 합쳐지는 본선이다. 합쳐진 상태마다 버전 태그를 붙여서, 트리가 버전을 따라 뻗어 나가게 한다.

- `research`에 `research/v1`, `research/v2`, `research/v3` … 태그를 붙인다(`research/v1.1`처럼 점 표기도 된다). `research/v1`은 초기 구현이다.
- 태그 이름 앞에는 루트 브랜치 이름을 붙인다. `main`의 릴리스 태그(`v1`, `v2` …)와 겹치지 않게 하기 위해서다. 접두사 없는 `v2` 같은 태그는 버전으로 읽지 않는다. 루트 브랜치 이름을 바꾸면 태그 접두사도 따라간다(예: `trunk/v2`).
- 화면과 YAML에서는 접두사를 뺀 이름(`v2`)으로 부른다. `parent: research@v2`는 태그 `research/v2`를 가리킨다.
- 채택된 실험을 `research`로 머지하면, 그 머지 커밋에 다음 버전 태그를 붙이고 push한다. 여러 실험을 한 번에 합쳐 한 버전으로 만들어도 된다.
  ```bash
  git switch research && git merge --no-ff experiment/depth-lr-warmup
  git tag -a research/v2 -m "v2: warmup 채택" && git push origin research research/v2
  ```
- research에서 시작하는 실험은 해당 버전 태그에서 브랜치를 따고, PR의 base는 `research`로 두며, YAML에 `parent: research@v2`처럼 버전을 적는다.
  ```bash
  git switch -c experiment/warmup-cosine research/v2
  ```
- 트리는 `research v1 → 실험 → (채택·머지) → v2 → 실험 …`처럼 본선을 따라 자란다.

### 1.4 새 버전을 낼 때 브랜치 정리

작업이 끝난 실험 브랜치가 계속 쌓이면 관리할 수 없다. 새 버전 태그를 붙일 때 끝난 브랜치를 모두 지운다. 다만 머지되지 않은 브랜치를 그냥 지우면 그 커밋이 어느 브랜치에서도 닿지 않게 되므로, 먼저 기록을 `research`에 남긴다.

- 대상: PR이 끝난(머지되었거나 close된) `experiment/*` 브랜치.
- 이미 `research`에 포함된 브랜치(`research`로 머지된 채택 실험, 그런 브랜치에 머지된 자식)는 그대로 삭제한다.
- 포함되지 않은 브랜치(기각, 또는 `research`까지 올라가지 못한 채택)는 **보관 머지**한다.
  1. 브랜치 위에서 그 실험의 커밋을 모두 **revert**한다(reset이 아니다. 기존 커밋은 그대로 두고 되돌리는 커밋을 더한다). 이제 브랜치의 내용은 갈라져 나온 지점과 같다.
  2. 그 브랜치를 `research`에 `--no-ff`로 머지한다. 코드 변경은 되돌려졌으므로 `research`의 내용은 바뀌지 않고, 실험 커밋과 revert 커밋이 `research`의 기록에 남는다.
  3. 브랜치를 삭제한다.
- **진행 중인 자손 실험이 있는 브랜치는 이번에 정리하지 않는다.** 부모의 revert가 먼저 `research`에 들어가면, 나중에 자식을 머지할 때 자식이 기대는 부모 코드가 함께 빠지기 때문이다. 자손이 모두 끝난 뒤의 버전에서 정리된다.
- 순서: 채택 실험을 `research`로 머지 → 보관 머지 → 버전 태그 → push → 브랜치 삭제. 태그는 보관 머지까지 끝난 `research`에 붙인다.
- PR은 GitHub에 그대로 남으므로 트리는 바뀌지 않는다. 기각 PR은 이미 close되어 있어서 보관 머지 뒤에도 기각으로 남는다.
- 실험마다 `git worktree`로 작업 폴더를 나눠 쓴다면, 끝난 실험의 worktree를 먼저 지우고 메인 클론에서 실행한다. 다른 worktree에 체크아웃된 브랜치는 전환하거나 삭제할 수 없어서, `researchtree release --yes`는 그런 브랜치가 있으면 아무것도 바꾸기 전에 멈추고 지울 worktree를 알려준다.
- `researchtree release`가 이 과정을 수행한다. 옵션 없이 실행하면 계획만 보여주고, `--yes`를 붙여야 실제로 실행한다.
  ```bash
  git switch research && git merge --no-ff experiment/depth-lr-warmup   # 채택 (또는 GitHub에서 PR 머지)
  researchtree release            # 계획 확인: 삭제 / 보관 머지 / 보류
  researchtree release --yes      # 보관 머지 → research/v3 태그 → push → 브랜치 삭제
  ```

## 2. PR 규칙

- **모든 실험 브랜치에는 PR이 정확히 하나 있다.** 실험을 시작할 때 Draft PR로 연다.
- PR의 base는 부모 실험 브랜치로 둔다. PR 제목은 가설을 한 줄로 요약한다.
- 추가 커밋은 자유롭게 한다. 기록은 PR 본문이 유지한다.
- 결론을 낼 때:
  - **채택(adopted):** 부모 브랜치(`research` 또는 부모 실험)로 머지한다. `research`로 머지했다면 다음 버전 태그를 붙인다(1.3).
  - **기각(rejected):** 결론을 쓴 뒤 PR을 close한다. 브랜치는 다음 버전을 낼 때 보관 머지 후 삭제된다(1.4).
- 여러 경쟁 아이디어 중 하나가 최종 채택되면, 나머지 PR은 모두 close해서 결과를 확정한다.

## 3. PR 본문 형식

PR 본문 **맨 위에** `yaml` 코드 블록 하나를 둔다. 뷰어는 본문에서 첫 번째 `yaml` 블록만 파싱한다. 그 아래는 자유 형식 마크다운이다.

````markdown
```yaml
parent: experiment/baseline-moshi
hypothesis: depth transformer lr을 절반으로 줄이면 초반 발산이 줄어든다
change: lr 3e-4 → 1.5e-4
metrics:
  val_loss: 2.31
  wer: 0.184
wandb: https://wandb.ai/...
status: rejected
```

## 결론
발산은 줄었지만 수렴이 느려서 기각.

## 메모
...
````

### 필드

| 필드 | 필수 | 타입 | 설명 |
|---|---|---|---|
| `parent` | 권장 | string | 부모 실험의 브랜치 이름, 또는 research에서 시작했다면 `research@vN`. 없으면 PR의 `base.ref`를 쓴다 |
| `hypothesis` | 필수 | string | 검증하려는 가설 한 문장 |
| `change` | 권장 | string | 코드/설정 변경 요약 |
| `metrics` | 선택 | map<string, number \| string> | 최종 메트릭. 키 이름은 팀 안에서 통일한다 |
| `wandb` | 선택 | URL | 학습 곡선 등 외부 기록 링크 |
| `status` | 선택 | `running` \| `adopted` \| `rejected` | PR 상태에서 유도한 값을 덮어쓸 때만 쓴다 |
| `tags` | 선택 | list<string> | 필터용 태그 (예: `lr`, `data`, `arch`) |
| `started` | 선택 | 날짜 (`2025-08-01` 또는 ISO 8601) | 실험을 시작한 때. 시간축 위치를 정한다 |
| `ended` | 선택 | 날짜 | 마지막으로 작업한 때. 계절 표시를 정한다 |
| `claims` | 선택 | list<string> | 이 실험이 검증하는 의도 문서의 주장 id (4절) |
| `spec` | 선택 | `none` | 값만 조정해 스펙을 바꾸지 않는 실험이라는 표시 (4절) |

알 수 없는 필드는 무시하되 보존한다. 뷰어나 로깅 API가 본문을 고쳐 쓸 때 사람이 추가한 필드와 YAML 블록 아래의 마크다운을 절대 지우지 않는다.

### 상태 결정 순서

1. YAML에 `status`가 있으면 그 값을 쓴다.
2. PR이 merged면 `adopted`로 본다.
3. PR이 closed이고 머지되지 않았으면 `rejected`로 본다.
4. 그 밖(open, draft)이면 `running`으로 본다.

### 부모 결정 순서

1. YAML에 `parent`가 있으면 그 값을 쓴다. `research@vN`이면 그 버전에 붙는다. 없는 버전이면 경고를 표시하고 research 첫 버전에 붙인다.
2. 없으면 PR의 `base.ref`를 쓴다. 그 값이 `research`이고 버전 태그가 있으면, PR을 연 시점에 가장 최근이었던 버전에 붙인다.
3. 부모가 `research`도 아니고 `experiment/*` PR도 아니면(예: `main`, `develop`), 노드를 "고아"로 표시하고 루트 아래에 붙인다. 실험 브랜치 자체는 숨기지 않는다.

### 버전이 만들어진 경로

- `research`로 머지된 채택 실험은 버전을 하나 만든다. 머지 커밋이 버전 태그 커밋과 같으면 그 버전이고, 아니면 머지 이후 처음 붙은 버전이다.
- 버전은 합쳐진 실험의 **채택 줄기 끝**에서 이어진다. research로 머지된 실험에 채택되어 머지된 자식이 있으면 그 자식을, 그 자식에게 또 채택된 자식이 있으면 그 자식을 따라 내려간 끝이 버전의 출발점이다(코드가 그 끝까지의 변경을 모두 담고 있기 때문이다). 줄기 끝이 여러 개이거나 여러 실험이 한 버전에 합쳐지면, 가장 나중에 합쳐진 줄기의 끝에서 버전이 이어지고 나머지 끝은 모두 점선 합류선으로 새 버전에 연결한다. 합쳐진 실험이 없으면 이전 버전에서 이어진다.
- 버전의 메트릭은 마지막으로 합쳐진 실험의 메트릭으로 보고, 그 버전에서 시작한 실험의 비교 기준(Δ)으로 쓴다.

### 시간 결정 순서

- 시작 시각: YAML `started` → 브랜치 첫 커밋의 작성 시각 → PR을 연 시각.
- 마지막 작업 시각: YAML `ended` → 브랜치 마지막 커밋의 커밋 시각 → 머지/닫힌 시각 → PR 갱신 시각.
- 시작 시각은 트리의 가로 위치(시간축)를, 마지막 작업 시각은 노드의 계절(북반구 기준, 3–5월 봄, 6–8월 여름, 9–11월 가을, 12–2월 겨울)을 정한다. 다른 저장소에서 옮겨 온 기록처럼 PR 날짜가 실제 날짜와 다르면 `started`/`ended`를 적는다.

### 표시 대상

- head가 `experiment/*`인 PR만 노드가 된다.
- head가 `experiment/*`여도 base가 `main`/`develop` 같은 연구 외 브랜치인 PR은 연구 외 용도로 보고 숨긴다. 단 YAML에 `parent`가 있으면 표시한다.
- 한 실험 브랜치에 PR이 여러 개면, base가 `research` 또는 `experiment/*`인 가장 최근 PR을 쓴다.

## 4. 의도·스펙 기반 개발

스펙 기반 개발(Spec-Driven Development, SDD)을 연구에 맞게 바꿔 쓴다. 스펙이 지금 설계의 유일한 기준이고 구현이 스펙을 따른다는 점은 같다. 다른 점은 스펙 변경을 확정된 요구사항이 아니라 검증할 가설로 본다는 것이다. 설계를 바꾸는 실험은 자기 브랜치에서 스펙을 먼저 고치고 구현하며, 판정(채택·기각)이 그 변경을 `research`의 스펙에 넣을지 정한다. 스펙 위에는 설계가 증명하려는 주장을 담은 의도 문서를 둔다.

흐름: 의도 세우기 → 첫 스펙과 `research/v1` → 주장이나 열린 결정을 골라 실험 제안(`claims`) → 같은 브랜치에서 스펙 수정 후 구현·측정 → 판정 → `research/vN` 태그(주장이 바뀌었으면 의도 문서도 수정).

글은 세 종류로 나눈다. 섞이면 문서가 계속 커져서 아무도 읽지 않게 되고, 실험 결과와 문서가 조용히 어긋난다.

| 종류 | 담는 것 | 위치 | 바뀌는 때 |
|---|---|---|---|
| 의도 | 문제, 목표, 주장(`N1` 같은 id), 제약, 하지 않을 것, 열린 결정 | `research`의 `INTENT.md` | 드물게, 의도적으로 |
| 스펙 | 지금 시스템의 설계. 결정만 | `research`의 `SPEC.md` | 설계를 바꾸는 실험이 채택될 때 |
| 근거 | 설정, 결과 표, 해석, 결론 | 실험 PR 본문 | 실험마다 |

- 경로는 `.researchtree.yml`로 바꾼다(`spec`, `intent`). 이 파일은 **레포의 기본 브랜치**(보통 `main`)에 둔다. 루트 브랜치 안이 아니라 기본 브랜치에 있으므로 `root`(루트 브랜치)와 `prefix`(실험 브랜치 접두사)도 여기에 적는다. 기본 브랜치에 없으면 루트 브랜치에서도 찾는다(옛 레포). Python에서는 함수 인자가 이 파일보다 먼저다.
- 스펙은 결정만 적는다. 유도, 측정, 비교 표는 PR에 두고 링크한다. 섹션마다 첫 줄은 `>` 한 줄 요약이고, 섹션 하나가 기능 하나다. 현재 상태만 적고 이력은 적지 않는다. 섹션은 40줄 안팎으로 둔다.
- 섹션 키는 `<!-- id: 이름 -->`이 있으면 그 id, 없으면 부모 섹션 키와 제목 slug를 이은 것이다. 문서 제목(`#`)은 키에 넣지 않는다. 제목을 바꿀 섹션에는 먼저 id를 단다.
- `<!-- include: 경로 -->` 줄은 그 파일의 내용으로 바뀐다(포함하는 파일 기준 상대 경로, 코드 블록 밖, 다섯 단계까지). 레포 밖 경로와 순환은 읽지 않는다.
- 설계를 바꾸는 실험은 자기 브랜치에서 같은 PR로 스펙을 고친다. 값만 조정하는 실험은 스펙을 건드리지 않고 YAML에 `spec: none`을 적는다. 기각된 실험의 스펙 수정은 1.4의 보관 머지로 revert되므로 버전의 스펙에는 채택된 설계만 남는다.
- 주장을 검증하는 실험은 YAML에 `claims: [N1]`을 적는다. 채택된 결과가 주장과 어긋나면 의도 문서를 고친다.
- 섹션 규칙, include 조립, 섹션 변경 판정, 레포 설정 파싱은 TypeScript(`apps/core/src/spec.ts`)와 Python(`apps/researchtree/memory/spec.py`)이 같이 구현하고, 둘 다 `tests/fixtures/spec-cases.json` → `spec-expected.json`을 통과해야 한다.

## 5. 메트릭 키 권장

학습 연구 초기에는 다음 키를 우선 쓴다. 필요할 때 팀에서 합의하고 추가한다.

- `val_loss`, `train_loss`
- `wer`, `cer`
- `steps`, `gpu_hours`
