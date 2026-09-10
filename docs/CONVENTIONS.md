# Conventions

ResearchTree가 동작하려면 팀이 지켜야 하는 브랜치/PR 규칙과 PR 본문 형식을 정리한다.

## 1. 브랜치 규칙

### 1.1 브랜치 역할

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
- 첫 실험은 `research`에서 딴다. 파생 실험은 **부모 실험 브랜치에서** 딴다.
  ```bash
  git switch experiment/baseline-moshi
  git switch -c experiment/depth-lr-half
  ```
- `experiment/` 아래의 이름은 평평하게(한 단계로) 둔다. 계층은 브랜치 이름이 아니라 부모 관계로 표현한다.
- 한 브랜치는 가설 하나만 검증한다. 가설이 두 개면 브랜치도 두 개다.
- 레포 설정에서 **"Automatically delete head branches"를 끈다.** 부모 브랜치가 삭제되면 자식 PR의 base가 바뀌기 때문이다.

## 2. PR 규칙

- **모든 실험 브랜치에는 PR이 정확히 하나 있다.** 실험을 시작할 때 Draft PR로 연다.
- PR의 base는 부모 실험 브랜치로 둔다. PR 제목은 가설을 한 줄로 요약한다.
- 추가 커밋은 자유롭게 한다. 기록은 PR 본문이 유지한다.
- 결론을 낼 때:
  - **채택(adopted):** 부모 브랜치(`research` 또는 부모 실험)로 머지한다.
  - **기각(rejected):** 결론을 쓴 뒤 PR을 close한다. 브랜치는 지우지 않는다.
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
| `parent` | 권장 | string | 부모 실험의 브랜치 이름. 루트 직속이면 `research`. 없으면 PR의 `base.ref`를 쓴다 |
| `hypothesis` | 필수 | string | 검증하려는 가설 한 문장 |
| `change` | 권장 | string | 코드/설정 변경 요약 |
| `metrics` | 선택 | map<string, number \| string> | 최종 메트릭. 키 이름은 팀 안에서 통일한다 |
| `wandb` | 선택 | URL | 학습 곡선 등 외부 기록 링크 |
| `status` | 선택 | `running` \| `adopted` \| `rejected` | PR 상태에서 유도한 값을 덮어쓸 때만 쓴다 |
| `tags` | 선택 | list<string> | 필터용 태그 (예: `lr`, `data`, `arch`) |

알 수 없는 필드는 무시하되 보존한다. 뷰어나 로깅 API가 본문을 고쳐 쓸 때 사람이 추가한 필드와 YAML 블록 아래의 마크다운을 절대 지우지 않는다.

### 상태 결정 순서

1. YAML에 `status`가 있으면 그 값을 쓴다.
2. PR이 merged면 `adopted`로 본다.
3. PR이 closed이고 머지되지 않았으면 `rejected`로 본다.
4. 그 밖(open, draft)이면 `running`으로 본다.

### 부모 결정 순서

1. YAML에 `parent`가 있으면 그 값을 쓴다.
2. 없으면 PR의 `base.ref`를 쓴다.
3. 부모가 `research`도 아니고 `experiment/*` PR도 아니면(예: `main`, `develop`), 노드를 "고아"로 표시하고 루트 아래에 붙인다. 실험 브랜치 자체는 숨기지 않는다.

### 표시 대상

- head가 `experiment/*`인 PR만 노드가 된다.
- head가 `experiment/*`여도 base가 `main`/`develop` 같은 연구 외 브랜치인 PR은 연구 외 용도로 보고 숨긴다. 단 YAML에 `parent`가 있으면 표시한다.
- 한 실험 브랜치에 PR이 여러 개면, base가 `research` 또는 `experiment/*`인 가장 최근 PR을 쓴다.

## 4. 메트릭 키 권장

학습 연구 초기에는 다음 키를 우선 쓴다. 필요할 때 팀에서 합의하고 추가한다.

- `val_loss`, `train_loss`
- `wer`, `cer`
- `steps`, `gpu_hours`
