# 아일랜드: 내 연구 전체를 한 지도로

연구 하나는 섬 하나로 자랍니다. 아일랜드는 그 섬들을 **한 지도 위에** 올려놓은 것이에요. 계정 주소 하나면
지금까지 해온 연구가 모두 보입니다.

```
https://darkpyonix.github.io/researchtree/?user=b-re-w
```

::: info 준비 중
지도와 포탈, 미니맵, 연구자 소개까지 동작합니다. 지금 지도는 평면이고, 각 연구를 실제 3D 섬으로 띄우는 것은
다음 단계예요.
:::

## 섬과 아일랜드는 다릅니다

| 말 | 무엇 | 어떻게 오가나 |
|---|---|---|
| **섬** | research 버전 하나 (`research/v1`, `v2` …) | 흙길과 나룻배로 **이어져 있어요** |
| **아일랜드** | 연구들을 묶은 지역. 프로젝트 단위 | **포탈**을 타고 건너가요 |

연구 하나 안에서 버전들은 이어진 섬이고, 프로젝트끼리는 따로 떨어진 아일랜드입니다. 아일랜드가 하나뿐이면
포탈 없이 그 아일랜드만 보여요.

## 설정 레포 만들기

계정에 `.researchisland` 레포가 있으면 그것이 지도입니다. CLI로 만드는 게 가장 빨라요.

```bash
researchtree island init                  # .researchisland 레포를 만들어요
researchtree island add DarkPyonix/moshi  # 연구를 지도에 올려요
researchtree island add DarkPyonix/tts --island Speech
researchtree island show                  # 지금 지도를 봐요
researchtree island check                 # 잘못 적힌 곳을 알려줘요
researchtree island remove DarkPyonix/tts
```

레포 안에서 `researchtree island add`를 실행하면 레포 이름을 생략할 수 있어요.

## 직접 적기

지도는 `.researchisland` 레포 README.md의 첫 ```` ```yaml ```` 블록이에요. 블록 밖의 글은 사람이 읽는
소개이고 뷰어는 건드리지 않습니다.

```yaml
islands:
  - name: Speech          # 아일랜드 이름 (포탈과 두루마리에 나와요)
    at: [0, 0]            # 지도에서의 자리
    intro: SPEECH.md      # (선택) 아일랜드 소개 문서
    repos:
      - repo: lab/moshi   # owner/name
        at: [0, 0]        # 아일랜드 안에서의 자리
      - repo: lab/tts
        at: [1, 0]
  - name: Vision
    at: [1, 0]
    repos:
      - repo: lab/depth
        at: [0, 0]
```

브랜치 이름은 각 레포의 `.researchtree.yml`에서 읽어요. 지도에는 적지 않아도 됩니다.

잘못 적힌 줄이 있어도 지도가 통째로 비지 않아요. 읽어낸 것만 보여주고 나머지는 `researchtree island check`가
알려줍니다.

## 연구자 소개와 이력서

지도 왼쪽 위 카드에서 열 수 있어요.

| 무엇 | 어디에 두나 |
|---|---|
| 연구자 소개 | `.researchisland`의 `PROFILE.md`. 없으면 GitHub 프로필 레포(`<계정>/<계정>`)의 README를 씁니다 |
| 이력서 | `.researchisland`에 `resume.pdf`, `CV.md` 같은 파일을 두면 **이력서 보기** 버튼이 생겨요 |

공개 레포만 올렸다면 로그인 없이도 그대로 보입니다. 계정 주소 하나가 연구 포트폴리오가 되는 셈이에요.
