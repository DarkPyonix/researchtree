# 에이전트 기억

ResearchTree의 기록은 사람만 읽는 게 아니에요. 같은 Python 패키지로 PR 트리 전체를 **타입이 있는 Python 객체**로 불러올 수 있어서, 코딩 에이전트가 지난 실험을 코드로 훑어보고, 모으고, 검사할 수 있어요.

마크다운 파일 몇 개에 적어 둔 메모와는 달라요. 실험마다 가설, 메트릭, 부모, 상태가 정해진 자리에 있고, 버전(섬) → 실험 → 본문과 커밋으로 이어지는 계층이 있어요. "지금까지 기각된 실험이 몇 개냐", "v5 섬에서 `val_loss`가 가장 낮은 실험은 뭐냐" 같은 질문이 검색이 아니라 한 줄짜리 계산이 돼요.

::: tip 아이디어의 출처
User as Code(Bojie Li, 2026, [arXiv:2606.16707](https://arxiv.org/abs/2606.16707))는 에이전트의 사용자 기억을 텍스트 대신 타입이 있는 Python 코드로 두자고 제안해요. 지우지 않고 쌓는 로그, 그 로그를 구조화한 타입 상태, 상태 위에서 돌아가는 규칙, 늘 문맥에 두는 짧은 요약(manifest)이 핵심이에요. ResearchTree에서는 커밋과 PR이 지우지 않는 로그이고, PR 본문의 YAML이 타입 상태예요. 따로 구조화 단계를 둘 필요 없이 기록하는 순간 이미 구조가 잡혀 있어요.
:::

## 불러오기

```bash
uv add researchtree        # PyPI 공개 후
uv add "researchtree @ git+https://github.com/DarkPyonix/researchtree"   # 지금
```

```python
import researchtree as rt

research = rt.load()                         # 현재 폴더의 origin 레포
research = rt.load("DarkPyonix/researchtree-test")
print(research.manifest())                   # 여기서 시작
```

- 토큰은 `researchtree login`으로 저장한 것이나 `RESEARCHTREE_TOKEN`을 써요. 공개 레포는 토큰 없이도 읽혀요.
- 루트 브랜치와 접두사가 기본값이 아니면 `rt.load(root="trunk", prefix="exp/")`처럼 넘기거나 `RESEARCHTREE_ROOT`, `RESEARCHTREE_PREFIX`를 지정하세요.
- 트리는 뷰어와 같은 규칙으로 만들어요([트리 결정 규칙](/rules/tree-rules)). 두 구현이 같은 테스트 픽스처로 결과를 맞춰요.

## 위에서 아래로 내려가기

에이전트 문맥은 한정돼 있으니, 짧은 요약에서 시작해 필요한 곳만 펼쳐 봐요.

| 단계 | 호출 | 보이는 것 |
|---|---|---|
| 요약 | `research.manifest()` | 섬(버전)별 실험 수와 최고 성적, 진행 중인 실험, 경고, 다음에 부를 함수 |
| 섬 | `research.version("v3").describe()` | 그 버전을 만든 실험, 섬의 실험 목록, 지표별 최고 |
| 실험 | `research["duet-mix"].describe()` | 가설, 변경, 메트릭과 부모 대비 Δ, 결론, 자식, W&B 링크 |
| 본문 | `.body`, `.sections`, `.conclusion` | PR 본문 마크다운(YAML 블록 제외)과 섹션별 텍스트 |
| 원본 | `.commits()`, `.comments()`, `.files()` | 브랜치 커밋, PR 코멘트, 바뀐 파일. 처음 부를 때 GitHub에서 읽어요 |

## 객체

```python
research.versions            # [Version(v1), Version(v2), ...]  뿌리가 첫 버전
research.root                # 뿌리 = 첫 버전의 섬
research.latest              # 가장 최근 버전
research.experiments         # 시작 순서대로 정렬된 Experiments
research["duet-mix"]         # 짧은 이름, 브랜치 이름, PR 번호로 찾기
research.version("v3")       # 버전 이름이나 research@v3
```

**Version**: `name`, `date`, `sha`, `merged`(이 버전을 만든 채택 실험), `experiments`(이 섬의 실험), `started_here`, `parent`, `children`, `next`, `previous`, `grown_from`(합쳐진 채택 줄기의 끝들, 마지막이 부모), `metrics`(버전이 이어진 줄기 끝 실험의 메트릭)

**Experiment**: `name`, `branch`, `number`, `url`, `title`, `author`, `status`, `draft`, `hypothesis`, `change`, `metrics`, `wandb`, `tags`, `started`, `ended`, `season`, `version`(사는 섬), `parent`, `children`, `siblings`, `ancestors()`, `descendants()`, `path`, `produces`(이 실험이 만든 버전), `baseline`, `delta(key)`, `improved(key)`, `warnings`, `meta`(YAML 전체)

**Experiments**는 평범한 리스트라 컴프리헨션이 그대로 되고, 몇 가지 도우미가 붙어 있어요.

```python
adopted = research.experiments.where(status="adopted")
adopted.best("val_loss")                         # 이름으로 방향을 짐작 (loss·ppl·wer는 낮을수록)
research.experiments.where(version="v5").sort_by("audio_loss")
research.search("lora").names                    # 이름·가설·변경·태그·본문 검색
print(research.experiments.with_metric("tts_wer").table("tts_wer", "asr_cer"))
```

## 한 줄 계산

```python
# 버전마다 기각된 실험 수
{v.name: len(v.experiments.where(status="rejected")) for v in research.versions}

# 부모보다 좋아진 채 기각된 실험: 다시 볼 만한 후보
[e.name for e in research.experiments.where(status="rejected") if e.improved("val_loss")]

# 가장 오래 걸린 실험
max(research.experiments, key=lambda e: e.ended - e.started)

# 어떤 실험에서 이어졌는지 따라 올라가기
[n.name for n in research["duet-mix"].path]
```

## 규칙 검사

`research.check()`는 트리 위에서 규칙 함수를 돌려 경고를 돌려줘요. LLM이 끼지 않는 결정적인 검사라 결과가 매번 같아요.

| 규칙 | 경고 |
|---|---|
| `stale-running` | 진행 중인데 2주 넘게 작업이 없는 실험 |
| `adopted-regression` | 채택됐는데 방향을 아는 지표가 하나도 부모보다 좋아지지 않은 실험. 일부만 나빠진 경우는 `adopted-tradeoff`(참고)로 따로 알려요 |
| `adopted-without-metrics` | 메트릭 없이 채택된 실험 |
| `no-conclusion` | 결론 섹션 없이 끝난 실험 |
| 본문 경고 | YAML 블록 없음, YAML 오류, 가설 없음, 고아, 순환, 없는 버전 |

규칙은 `(research) -> 경고 목록`인 평범한 함수예요. 에이전트가 직접 짜서 넘길 수 있어요.

```python
from researchtree.memory.rules import Alert

def no_wandb(research):
    for e in research.experiments.where(status="adopted"):
        if not e.wandb:
            yield Alert("info", "no-wandb", "채택됐는데 W&B 링크가 없어요", e.name)

research.check([no_wandb])
```

## 터미널에서

```bash
researchtree memory                 # 요약
researchtree memory v3              # 섬 하나
researchtree memory duet-mix        # 실험 카드
researchtree memory --check         # 경고만
researchtree memory --json > tree.json
```

에이전트에게 작업을 맡길 때 `researchtree memory` 출력을 첫 문맥으로 주고, 더 필요한 건 Python으로 직접 찾게 하면 돼요.

## 오프라인

이미 받아 둔 GitHub 응답으로도 만들 수 있어요. 테스트나 노트북에서 쓰기 좋아요.

```python
research = rt.from_data(prs, "owner/repo", tags=tags)   # GitHub PR 객체 목록, {name, sha, date} 태그
```

오프라인으로 만든 트리는 커밋·코멘트·파일을 읽을 수 없어요. 부르면 오류가 나요.
