# research 버전 태그

`research`는 채택된 실험이 차곡차곡 합쳐지는 본선이에요. 실험이 합쳐질 때마다 버전 태그를 달아두면 트리가 버전을 따라 자연스럽게 뻗어나갑니다.

```
research v1 ─┬─ experiment/a (기각)
             └─ experiment/b (채택) ── v2 ─┬─ experiment/c
                                           └─ experiment/d (채택) ── v3 ─ …
```

## 규칙

- `research`에 `research/v1`, `research/v2`, `research/v3` 같은 태그를 붙여요. `research/v1.1`처럼 점(.) 표기도 쓸 수 있습니다. `research/` 뒤에 `v`와 숫자가 오는 태그만 버전으로 읽고 숫자 순서대로 정렬해요.
- 태그 앞에 루트 브랜치 이름을 붙이는 건 `main`의 릴리스 태그(`v1`, `v2` …)와 겹치지 않게 하려는 거예요. 접두사 없는 `v2`는 버전으로 읽지 않아요. 루트 브랜치 이름을 바꾸면 접두사도 따라가요(예: `trunk/v2`).
- 화면과 YAML에서는 접두사를 뺀 `v2`로 불러요. `parent: research@v2`는 태그 `research/v2`를 가리켜요.
- `v1`은 프로젝트의 초기 구현입니다. 이 첫 번째 버전이 트리 전체의 루트가 돼요.
- 채택된 실험을 `research`에 머지했다면 그 머지 커밋에 다음 버전 태그를 붙여 push해 주세요. 여러 실험을 한 번에 합쳐 하나의 버전으로 만들어도 괜찮습니다.
- research에서 시작하는 실험은 기준이 될 버전 태그에서 브랜치를 땁니다. PR의 base는 `research`로 두고, YAML에 `parent: research@v2`처럼 기준 버전을 적어주세요.

## git 명령 예시

**1. 첫 버전**

```bash
git switch research
git tag -a research/v1 -m "v1: 초기 구현"
git push origin research research/v1
```

**2. 버전에서 실험 시작**

```bash
git switch -c experiment/depth-lr-warmup research/v1
# ... 수정, 커밋 ...
git push -u origin experiment/depth-lr-warmup
# GitHub에서 base=research 인 Draft PR을 열고 YAML에 parent: research@v1
```

**3. 채택 → 머지 → 다음 버전**

```bash
git switch research && git merge --no-ff experiment/depth-lr-warmup
git tag -a research/v2 -m "v2: warmup 채택"
git push origin research research/v2
```

GitHub의 "Merge pull request" 버튼으로 머지했다면, 로컬에서 `research` 브랜치를 pull 받은 뒤 머지 커밋에 태그를 달아 push해 주면 돼요.

```bash
git switch research && git pull
git tag -a research/v2 -m "v2: warmup 채택"
git push origin research/v2
```

**4. 새 버전에서 이어서 실험**

```bash
git switch -c experiment/warmup-cosine research/v2
```

## 버전이 트리에 놓이는 방법

- `research`로 머지된 채택 실험은 새 버전을 구성해요. 머지 커밋이 버전 태그 커밋과 같으면 해당 버전이 되고, 아니라면 머지 이후 처음 붙은 버전에 속하게 됩니다.
- 각 버전은 합쳐진 실험의 **채택 줄기 끝**에서 이어져요. research에 머지된 실험에 채택되어 머지된 자식이 있으면, 그 자식을 따라 끝까지 내려간 곳이 출발점이에요. 코드가 그 끝까지의 변경을 모두 담고 있으니까요.
- 줄기 끝이 여러 개이거나 여러 실험이 한 버전에 합쳐지면, 가장 나중에 합쳐진 끝에서 버전이 이어지고 나머지 끝도 모두 점선 합류선(3D에서는 나루터)으로 새 섬에 연결돼요. 합쳐진 실험이 없다면 이전 버전에서 곧바로 이어져요.
- 한 버전에 여러 실험이 동시에 합쳐질 때는 나머지 경로들을 흙길 **합류선**으로 이어줍니다.
- 버전 노드의 메트릭은 버전이 이어진 줄기 끝 실험의 메트릭을 따르며, 그 버전에서 새로 뻗어나간 실험들의 비교 기준(Δ)이 돼요.
- 화면에서는 돌 기념탑과 깃발로 표현돼요. 버전마다 섬이 따로 있고, [평면 보기](/viewer/flat)에서는 기념탑을 위에서 내려다본 모습으로 나타납니다.

::: tip 태그를 붙이지 않았다면
`parent`를 적지 않고 base를 `research`로 둔 PR은, PR을 연 시점이나 `started` 날짜를 기준으로 당시 가장 최신이었던 버전에 붙습니다. 만약 `parent: research@v9`처럼 없는 버전을 적으면 경고 배지와 함께 첫 버전에 연결돼요. 태그가 하나도 없는 레포라면 `research` 브랜치 하나만 트리의 루트로 그려집니다.
:::

## 새 버전을 낼 때 브랜치 정리

끝난 실험 브랜치가 계속 쌓이면 관리가 안 돼요. 그래서 새 버전 태그를 붙일 때 끝난 브랜치를 한꺼번에 지워요. 머지되지 않은 브랜치를 그냥 지우면 그 커밋이 어디서도 닿지 않게 되니까, 지우기 전에 기록을 `research`에 남겨요.

| 브랜치 | 처리 |
|---|---|
| 이미 `research`에 들어간 브랜치 (채택되어 머지됨) | 바로 삭제 |
| 들어가지 않은 브랜치 (기각 등) | **보관 머지**: 브랜치에서 커밋을 모두 revert → `research`에 `--no-ff` 머지 → 삭제 |
| 진행 중인 자손 실험이 있는 브랜치 | 이번에는 두고, 자손이 끝난 뒤의 버전에서 정리 |
| 진행 중인 브랜치 | 그대로 |

- revert는 reset과 달라요. 기존 커밋은 그대로 두고 되돌리는 커밋을 더해요. 그래서 보관 머지를 해도 `research`의 코드는 바뀌지 않고, 실험 커밋과 revert 커밋이 기록으로 남아요.
- 진행 중인 자손이 있는 브랜치를 건너뛰는 이유가 있어요. 부모의 revert가 먼저 `research`에 들어가면, 나중에 자식을 머지할 때 자식이 기대는 부모 코드가 같이 빠지거든요.
- PR은 GitHub에 그대로 남으니 트리는 바뀌지 않아요. 기각 PR은 이미 close되어 있어서 보관 머지 뒤에도 기각으로 보여요.

`researchtree release`가 이 과정을 해 줘요.

```bash
git switch research && git merge --no-ff experiment/depth-lr-warmup   # 채택 (또는 GitHub에서 PR 머지)
researchtree release            # 계획만 보기: 삭제 / 보관 머지 / 보류
researchtree release --yes      # 보관 머지 → research/v3 태그 → push → 브랜치 삭제
researchtree release v3.1 --yes # 버전 이름을 직접 정할 때
```

- 레포의 로컬 클론에서 실행해요. 작업 트리가 깨끗해야 하고, PR 상태를 읽으려고 GitHub 토큰(`researchtree login`)을 써요.
- 실험마다 `git worktree`로 폴더를 나눠 쓰고 있다면, 끝난 실험의 worktree를 먼저 지우고(`git worktree remove <폴더>`) 메인 클론에서 실행해요. 다른 worktree에 체크아웃된 브랜치는 Git이 전환하거나 지우지 못하기 때문이에요. `--yes`는 실행 전에 이걸 확인하고, 지울 worktree 목록을 알려주고 멈춰요. 진행 중인 실험의 worktree는 그대로 둬도 돼요.
- 버전 이름을 주지 않으면 마지막 버전 다음 번호(`v2` 다음은 `v3`)를 붙여요. 태그는 보관 머지까지 끝난 `research`에 달아요.
