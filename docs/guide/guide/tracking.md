# 학습 스크립트 연동

학습 프로젝트에 Python 패키지를 설치하면, 학습 코드에서 현재 브랜치의 PR 본문을 바로 갱신할 수 있어요. 번거롭게 메트릭 수치를 복사해서 손으로 옮겨 적지 않아도 됩니다.

```bash
uv add researchtree        # 또는 pip install researchtree
```

```python
import researchtree as rt

rt.log(val_loss=2.31, wer=0.184)       # metrics에 병합
rt.set(wandb=run.url)                  # 임의의 YAML 필드 설정
rt.conclude("rejected", "수렴이 느림")  # status 설정 + '## 결론' 섹션 작성
```

## API

| 함수 | 동작 |
|---|---|
| `rt.log(**metrics)` | PR 본문 YAML의 `metrics`에 값을 병합해요. 특정 메트릭 값을 `None`으로 주면 해당 항목을 삭제합니다 |
| `rt.set(**fields)` | 원하는 YAML 필드를 설정합니다 (`wandb`, `tags`, `change` …). 값을 `None`으로 주면 필드를 지워요 |
| `rt.conclude(status, text, heading=None)` | `status`를 `running` / `adopted` / `rejected` 중 하나로 설정하고, 결론 섹션을 `text`로 작성해요. 본문에 이미 `## 결론`이나 `## Conclusion` 섹션이 있으면 그 제목 그대로 내용만 바꾸고, 없으면 `heading`(기본 `결론`, 영어로 쓰려면 `heading="Conclusion"`)으로 새로 만들어요 |

본문은 기존 내용을 잃지 않도록 무손실 방식으로 수정해요. 첫 번째 `yaml` 블록만 바뀌고, 주석과 필드 순서, 사람이 추가한 필드, YAML 블록 아래의 마크다운은 온전히 보존됩니다. 본문에 블록이 없으면 맨 위에 새로 넣어줘요. 만약 기존 YAML이 깨져 있다면 덮어쓰지 않고 안전하게 경고만 남깁니다.

## 동작 방식

1. 현재 브랜치를 `git rev-parse --abbrev-ref HEAD` 명령어로 확인합니다.
2. 브랜치 이름이 실험 접두사(`experiment/`)로 시작하지 않으면 기록을 건너뛰어요.
3. `origin` remote에서 레포를 파악합니다 (`RESEARCHTREE_REPO` 환경변수로 직접 지정할 수도 있어요).
4. 해당 브랜치를 `head`로 둔 PR을 찾습니다. 여러 개라면 열려 있는(open) PR을 우선해요.
5. 다른 사람의 수정을 덮어쓰지 않도록, 쓰기 직전에 PR 본문을 다시 읽어 병합한 뒤 `PATCH` 요청을 보냅니다. 실패하면 한 번 재시도해요.

## 학습을 멈추지 않는다

`rt.*` 함수는 어떤 경우에도 예외를 던지지 않도록 설계되었어요. 브랜치가 실험 브랜치가 아니거나, PR이 없거나, 토큰이 없거나, 네트워크가 끊겨도 `RuntimeWarning` 경고만 남기고 넘어갑니다. 몇 시간 동안 공들인 모델 학습이 로깅 실패 때문에 중단되는 일은 없으니 안심하고 쓰셔도 돼요.

## 분산 학습

환경변수 `RANK` 또는 `LOCAL_RANK`가 `0`이 아닌 프로세스에서는 아무런 작업도 하지 않아요. rank 0 메인 프로세스에서만 PR을 갱신하므로, 분산 학습 환경에서도 모든 rank에 그대로 호출 코드를 넣어두시면 됩니다.

## 환경변수

| 변수 | 설명 |
|---|---|
| `RESEARCHTREE_TOKEN` | GitHub 토큰. 설정 시 저장된 토큰보다 우선 적용돼요. GPU 서버나 CI에서 PAT를 넣을 때 유용합니다 |
| `RESEARCHTREE_REPO` | 레포(`owner/name`). `origin` remote로 알아낼 수 없을 때 직접 지정합니다 |
| `RESEARCHTREE_CLIENT_ID` | `researchtree login`(Device Flow)에 쓸 OAuth App client ID. 기본 앱 대신 직접 등록한 앱을 쓸 때 지정해요 |

## 토큰

토큰은 `researchtree login`이나 로컬 뷰어에서 로그인할 때 저장한 것을 함께 사용해요. 찾는 순서는 `RESEARCHTREE_TOKEN` → OS 키체인 → 설정 파일입니다. 자세한 저장 경로는 [로컬 실행 · 토큰 저장 위치](/guide/local#토큰-저장-위치)를 확인해 주세요.

::: tip 브라우저 없는 서버에서
- OAuth App 준비 후: 서버에서 `researchtree login`을 실행하고, 터미널에 출력된 코드를 다른 기기의 브라우저에서 `github.com/login/device`에 입력합니다.
- 지금: fine-grained PAT(대상 레포에 Pull requests 읽기/쓰기, Contents 읽기)를 만들어 `RESEARCHTREE_TOKEN`에 넣어주세요.
:::

## 예시: PyTorch 학습 루프

```python
import researchtree as rt

for epoch in range(epochs):
    train_one_epoch(model)
    val = evaluate(model)
    # Safe to call on every rank; only rank 0 writes.
    rt.log(val_loss=round(val.loss, 4), wer=round(val.wer, 4), steps=global_step)

rt.set(wandb=wandb.run.url)
rt.conclude("adopted", f"val_loss {val.loss:.3f}로 부모 대비 개선. 채택.")
```

`conclude`로 status를 적더라도 PR은 GitHub 웹에서 따로 머지하거나 close해야 합니다 ([PR 규칙](/rules/pull-requests#pr-규칙)).

