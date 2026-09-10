# 레포 준비

ResearchTree는 레포 하나를 연구 프로젝트 하나로 다뤄요. 뷰어를 열기 전에 연구 레포에서 세 가지를 먼저 준비해 주세요.

## 1. `research` 브랜치 만들기

`research`는 연구 트리의 뿌리(루트) 역할을 해요. 모든 실험의 출발점이 되는 초기 구현 코드이자, 채택된 실험이 최종적으로 모이는 브랜치입니다. 초기 구현을 마친 커밋에서 브랜치를 만들어 주세요.

```bash
git switch -c research
git push -u origin research
```

`main`이나 `develop` 같은 브랜치는 일반 개발이나 배포 용도로 그대로 사용하시면 돼요. 이 브랜치들과 관련 PR은 연구 트리에 표시되지 않습니다.

::: tip 다른 이름을 쓰고 싶다면
루트 브랜치 이름(`research`)과 실험 브랜치 접두사(`experiment/`)는 기본값일 뿐이에요. 레포 설정에 맞게 바꾸고 싶다면 뷰어의 [브랜치 설정](/viewer/navigation#브랜치-설정)에서 자유롭게 변경할 수 있습니다. 가이드에 나오는 `research`와 `experiment/` 표기는 직접 설정한 이름으로 생각하고 읽어주세요.
:::

레포에 루트 브랜치가 아직 없다면, 뷰어에 트리 대신 "research 브랜치가 없습니다"라는 안내 메시지와 함께 생성 명령어가 표시돼요. 해당 화면에서 곧바로 브랜치 설정을 열 수도 있습니다.

## 2. 머지 후 브랜치 자동 삭제 끄기

GitHub 레포의 **Settings → General → Pull Requests**에서 **"Automatically delete head branches"** 설정을 꺼주세요.

머지된 부모 실험 브랜치가 삭제되면, 이를 바탕으로 파생된 자식 PR의 base 브랜치가 바뀌면서 트리 관계가 꼬일 수 있어요. 기각된 실험 브랜치 역시 소중한 연구 기록이므로 지우지 마세요.

## 3. 첫 버전 태그 `research/v1` 붙이기

`research` 브랜치의 초기 구현 커밋에 버전 태그 `research/v1`을 달아줍니다. 이후 채택된 실험이 `research`로 머지될 때마다 `research/v2`, `research/v3`처럼 태그를 붙여가며 연구의 큰 줄기를 기록해요 ([research 버전 태그](/rules/versions)).

```bash
git switch research
git tag -a research/v1 -m "v1: 초기 구현"
git push origin research/v1
```

태그가 없어도 트리는 정상적으로 표시돼요. 다만 이 경우 `research` 브랜치 하나만 루트로 잡히고, 뷰어에 버전 기념탑은 나타나지 않습니다.

## 4. 첫 실험 열기

```bash
git switch -c experiment/baseline research/v1     # research/v1 태그에서 실험 브랜치 따기
# ... 코드 수정, 커밋 ...
git push -u origin experiment/baseline
```

GitHub에서 base를 `research`로 지정해 **Draft PR**을 열고, 본문 맨 위에 아래와 같이 YAML 블록을 작성합니다.

````markdown
```yaml
parent: research@v1
hypothesis: 기준 설정 그대로 학습하면 val_loss 2.9 안쪽으로 수렴한다
change: 기준 학습 설정
tags: [baseline]
```

## 메모
첫 실험.
````

자세한 형식은 [PR과 본문 YAML](/rules/pull-requests) 문서를 참고해 주세요. 준비를 마쳤다면 이제 [중앙 웹](/guide/web), [VS Code 확장](/guide/vscode), [로컬 실행](/guide/local) 중 편한 방법으로 트리를 열어보세요!
