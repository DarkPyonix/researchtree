# 브랜치

ResearchTree를 쓸 때 팀에서 지켜야 할 브랜치 규칙이에요.

::: tip 이름은 바꿀 수 있습니다
루트 브랜치(`research`)와 실험 브랜치 접두사(`experiment/`)는 기본값입니다. 레포마다 뷰어의 [브랜치 설정](/viewer/navigation#브랜치-설정)에서 바꿀 수 있고, 학습 스크립트의 `rt.log()`도 `RESEARCHTREE_PREFIX` 환경변수로 접두사를 맞출 수 있어요. 문서에 나오는 `research`와 `experiment/`는 각자 설정한 이름에 맞춰 읽어주세요.
:::

## 브랜치 역할

| 브랜치 | 용도 | 트리에 표시 |
|---|---|---|
| `research` | 연구 트리의 루트입니다. 실험의 출발점이 되는 초기 구현을 담고, 채택된 실험이 모이는 곳이에요 | O (루트) |
| `experiment/*` | 실험 하나당 브랜치 하나를 써요 | O (노드) |
| `main`, `develop` | 배포나 일반 개발처럼 연구 외 용도로 씁니다 | X |
| 그 밖의 모든 브랜치 | 연구와 관련 없는 일반 브랜치예요 | X |

- 뷰어는 `research`와 `experiment/*`만 트리에 그려요. 다른 브랜치나 관련 PR은 화면에 나오지 않습니다. 예를 들어 `develop` → `main`이나 `experiment/*` → `main` PR은 트리에 표시되지 않아요.
- `research`와 `main`/`develop` 사이에서 코드를 주고받는 방식은 자유입니다. 트리에는 아무런 영향도 주지 않아요.

## 실험 브랜치

- 이름은 `experiment/depth-lr-half`처럼 `experiment/<짧은-이름>` 형태로 짓습니다.
- `experiment/` 아래에는 하위 폴더를 두지 않고 한 단계로만 씁니다. 브랜치 이름에 계층을 넣는 대신 부모 관계로 표현해요.
- 브랜치 하나당 가설 하나만 검증해요. 검증할 가설이 두 개라면 브랜치도 두 개를 만듭니다.
- research에서 시작하는 실험은 기준이 될 research 버전 태그(`vN`)에서 새로 브랜치를 땁니다([research 버전 태그](/rules/versions)).
  ```bash
  git switch -c experiment/warmup-cosine research/v2
  ```
- 다른 실험을 이어받는 파생 실험은 부모 실험 브랜치에서 바로 땁니다.
  ```bash
  git switch experiment/baseline-moshi
  git switch -c experiment/depth-lr-half
  ```
- 커밋은 얼마든지 편하게 남겨도 돼요. 실험 기록은 PR 본문에서 관리합니다.

## 브랜치는 버전을 낼 때 정리해요

- 끝난 실험 브랜치는 손으로 지우지 말고, 새 버전을 낼 때 [`researchtree release`](/rules/versions#새-버전을-낼-때-브랜치-정리)로 한꺼번에 정리하세요. 머지되지 않은 브랜치는 커밋을 revert한 뒤 `research`에 머지해서 기록을 남기고 지워요.
- 레포 설정에서 **"Automatically delete head branches"** 옵션은 꺼두세요. 진행 중인 자식이 있는 부모 브랜치가 지워지면 자식 PR의 base 브랜치가 바뀌어 버리기 때문입니다.

## 브랜치 설정 규칙

브랜치 설정 값에는 몇 가지 규칙이 있어요.

- 영문, 숫자, `.`, `_`, `-`, `/`만 쓸 수 있어요. `/`로 시작하거나 `//`, `..`가 들어가면 안 됩니다.
- 루트 브랜치 이름은 `/`로 끝날 수 없어요.
- 접두사는 항상 `/`로 끝납니다. 끝에 슬래시를 빠뜨려도 알아서 붙여줘요.
- 루트 브랜치 이름이 실험 접두사로 시작할 수는 없습니다. 예를 들어 접두사가 `exp/`인데 루트가 `exp/main`인 경우는 쓸 수 없어요.
