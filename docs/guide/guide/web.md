# 중앙 웹

별도 설치 없이 웹 브라우저에서 바로 뷰어를 여는 가장 간단한 방법이에요.

```
https://darkpyonix.github.io/researchtree/
```

::: warning 아직 배포 전
GitHub Pages 배포는 현재 준비 중이에요. 정식 공개 전까지는 [개발 서버](/dev/contributing#개발-환경)(`npm run dev`, `http://localhost:5173`)를 실행해 같은 화면을 띄워볼 수 있습니다.
:::

## 로그인

![로그인 화면](/images/readme/ko/sign-in.png)

토큰 없이 처음 접속하면 트리 대신 로그인 화면이 나타나요. 로그인 방식은 두 가지가 있습니다.

### GitHub로 로그인 (OAuth)

"GitHub로 로그인"을 누르면 GitHub 인가 페이지로 이동해요. 권한을 승인하고 돌아오면 보려던 화면(레포, 노드)으로 바로 연결됩니다. 요청 권한(scope)은 `repo`로, 비공개 레포의 PR 데이터를 불러오기 위해 필요해요.

::: warning 준비 중
이 버튼은 DarkPyonix OAuth App과 인증 프록시(`https://researchtree.thisisthepy.workers.dev`)가 배포된 뒤에 동작해요. 현재 빌드에 OAuth App client ID가 없으면 버튼이 비활성화되고 "OAuth App client ID가 설정되지 않았습니다" 안내가 표시됩니다. 그전까지는 아래 PAT 로그인을 이용해 주세요.
:::

### 개인 액세스 토큰(PAT)으로 로그인

로그인 화면의 "개인 액세스 토큰(PAT)으로 로그인"을 펼치고 발급받은 토큰을 붙여 넣습니다. 지금 바로 동작하는 방법이에요.

1. GitHub **Settings → Developer settings → Personal access tokens**에서 토큰을 만듭니다.
2. fine-grained 토큰이라면 대상 레포에 다음 권한을 설정해 주세요.
   - **Pull requests**: 읽기/쓰기
   - **Contents**: 읽기
3. 토큰(`github_pat_…`)을 붙여 넣고 "토큰으로 로그인"을 누릅니다.

입력한 토큰은 브라우저의 `localStorage`에만 안전하게 저장되며, `api.github.com` 외의 곳으로는 보내지 않아요 ([보안과 개인정보](/guide/security)).

### 로그아웃과 만료

오른쪽 위 아바타에 마우스를 올려 계정 메뉴를 연 뒤 **로그아웃**을 누르면 브라우저에 저장된 토큰이 삭제됩니다. 같은 메뉴의 **다른 레포 열기**를 통해 레포 선택 화면으로 돌아갈 수도 있어요. 토큰이 만료되거나 권한이 취소되어 GitHub에서 401 오류를 반환하면 자동으로 로그인 화면으로 이동합니다.

## 레포 선택

로그인하면 "어떤 연구를 볼까요?" 화면이 나옵니다.

- `owner/name`을 직접 입력하거나 **내 레포** 목록에서 고릅니다. 입력 시 목록이 바로 필터링돼요.
- **최근에 본 레포**가 상단에 칩으로 표시됩니다 (최대 6개).
- 마지막으로 열었던 레포는 다음 접속 때 자동으로 열려요.
- 레포가 없거나 접근 권한이 부족하면 "레포를 찾을 수 없거나 접근 권한이 없습니다" 안내가 표시됩니다.

## 공유 링크

현재 보고 있는 레포와 선택한 노드가 주소창 URL에 그대로 반영돼요.

```
https://darkpyonix.github.io/researchtree/?repo=lab/moshi&node=experiment/depth-lr-half
```

| 파라미터 | 뜻 |
|---|---|
| `repo` | 열 레포 (`owner/name`) |
| `node` | 선택할 노드. 실험은 브랜치 이름(`experiment/...`), 버전은 `research@v2` 형식 |

링크를 공유받은 사람도 로그인한 뒤 같은 화면을 볼 수 있어요. 만약 비공개 레포라면 상대방에게도 해당 레포 접근 권한이 있어야 내용이 보입니다. 권한이 없다면 접근 안내 메시지가 나타나요.

::: tip 터미널에서 바로 열기
Python 패키지를 설치했다면 레포 디렉토리에서 `researchtree open`을 실행해 보세요. 현재 레포의 중앙 웹 주소(`?repo=…`)를 출력하고 브라우저로 바로 열어줍니다.
:::

