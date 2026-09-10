# 트리 결정 규칙

뷰어가 PR 목록과 버전 태그로 트리를 구성하는 방식이에요. 실험 노드가 생각했던 위치와 다르게 보인다면 아래 결정 순서를 살펴보세요. 실제 구현 코드는 [`apps/core/src/tree.ts`](https://github.com/DarkPyonix/researchtree/tree/main/apps/core/src/tree.ts)에 담겨 있습니다.

## 표시 대상

- head 브랜치가 `experiment/*`인 PR만 트리 노드로 만들어져요. 노드 ID는 head 브랜치 이름입니다.
- head가 `experiment/*`여도 base가 `main`, `develop` 같은 연구 외 브랜치라면 일반 작업으로 보고 숨겨요. 단, YAML에 `parent`가 적혀 있다면 트리에 표시합니다.
- 한 실험 브랜치에 PR이 여러 개라면 base가 `research`나 `experiment/*`이거나 `parent`가 적힌 PR 중 가장 최근에 열린 것을 써요.
- `main`, `develop`을 비롯한 그 밖의 브랜치는 트리 모델에 아예 들어가지 않아요.

## 상태 결정 순서

1. YAML에 `status`가 적혀 있다면 그 값을 가장 먼저 써요.
2. PR이 머지(merged)되었다면 `adopted`(채택)로 판단합니다.
3. 머지되지 않고 닫힌(closed) PR은 `rejected`(기각)로 봐요.
4. 그 외(open, draft)는 `running`(진행 중)으로 분류합니다.

Draft PR은 상태상 `running`이지만 화면에서는 "초안"으로 따로 구분해 보여줘요. 3D 섬에서는 새싹 둔덕 모양으로 나타납니다.

## 부모 결정 순서

1. YAML에 `parent`가 있으면 그 값을 따릅니다. `research@vN` 형식이면 해당 버전에 바로 붙고, 없는 버전이라면 경고를 띄운 뒤 research 첫 버전에 연결해요.
2. `parent`가 없다면 PR의 base 브랜치를 써요. base가 `research`이고 버전 태그가 있다면, 실험을 시작했을 때 가장 최신이었던 버전에 붙입니다.
3. 부모가 `research`도 아니고 트리에 있는 `experiment/*` 노드도 아니라면(부모 브랜치에 PR이 없거나 숨겨진 경우), 노드를 **고아**로 표시하고 루트 아래에 붙여요. 실험 노드 자체를 숨기지는 않습니다.
4. 부모 관계가 순환하면(A → B → A) **순환** 경고 배지와 함께 루트 아래에 붙입니다.

## 형제 순서와 세대

- 같은 부모를 둔 자식 노드들은 실험을 시작한 시각 순서로 정렬돼요.
- 루트 바로 아래가 1세대이고, 아래로 한 단계 뻗을 때마다 세대가 하나씩 늘어납니다. 버전 노드도 세대를 함께 가져요.

## 데이터 출처

- PR 목록: `GET /repos/{owner}/{repo}/pulls?state=all` (페이지네이션)
- 버전 태그: `GET /repos/{owner}/{repo}/tags`와 태그 커밋의 날짜
- 별도 데이터베이스나 서버 캐시 없이 GitHub를 단일 저장소로 씁니다. API 응답은 ETag 조건부 요청으로 캐시해서 rate limit을 아껴요.
