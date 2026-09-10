---
layout: home

hero:
  name: ResearchTree
  text: 연구가 자라는 섬
  tagline: 브랜치 하나에 실험 하나, PR 하나에 실험 일지 하나. 쌓인 기록은 작은 섬 위에서 나무로 자라요.
  image:
    src: /logo.svg
    alt: 작은 복셀 섬 위에서 웃고 있는 나무
  actions:
    - theme: brand
      text: 시작하기
      link: /guide/introduction
    - theme: alt
      text: 연구 기록 규칙
      link: /rules/branches
    - theme: alt
      text: GitHub
      link: https://github.com/DarkPyonix/researchtree

features:
  - icon: 🌱
    title: 브랜치 하나 = 실험 하나
    details: 실험마다 작고 명확한 코드 수정만 담은 브랜치를 만듭니다. 파생 관계가 그대로 트리가 됩니다.
    link: /rules/branches
    linkText: 브랜치 규칙
  - icon: 📓
    title: PR 하나 = 실험 일지 하나
    details: PR 본문 맨 위 YAML 블록에 가설, 변경점, 메트릭을 적습니다. 머지는 채택, close는 기각입니다.
    link: /rules/pull-requests
    linkText: PR 형식
  - icon: 🧭
    title: 세 가지로 열기
    details: 설치 없는 중앙 웹, VS Code 확장, 로컬 실행(uv tool). 어디서 열어도 같은 뷰어입니다.
    link: /guide/web
    linkText: 여는 방법
  - icon: 🔭
    title: 오픈 사이언스
    details: 실패한 실험과 버린 아이디어까지 레포 안에 남습니다. 레포를 공개하면 연구 과정 전체가 공개됩니다.
    link: /guide/introduction
    linkText: 소개 읽기
---

::: warning 출시 전 단계
ResearchTree는 아직 정식 배포 전이에요. PyPI 패키지, VS Code Marketplace 확장, GitHub Pages 뷰어는 아직 공개되지 않았고, 중앙 웹의 "GitHub로 로그인"은 OAuth App과 인증 프록시가 배포된 뒤 동작합니다. 지금은 개인 액세스 토큰(PAT) 로그인과 소스에서 직접 빌드하는 방식을 쓸 수 있어요. 자세한 내용은 [시작하기](/guide/introduction)를 참고해 주세요.
:::

<div class="rt-showcase">
<div>
<p class="rt-eyebrow">연구의 섬</p>
<h2>섬 하나에 연구 한 버전</h2>
<p>research 버전마다 섬이 하나씩 떠 있고, 실험은 흙길 끝 텃밭에서 자랍니다. 식물 모양만 봐도 실험이 어떻게 끝났는지 알 수 있어요.</p>
<ul class="rt-legend">
<li><b>🌳 나무</b><span>채택된 실험. 열매와 울타리가 있어요</span></li>
<li><b>🌿 묘목</b><span>진행 중인 실험</span></li>
<li><b>🪵 그루터기</b><span>기각된 실험</span></li>
<li><b>🗿 기념탑</b><span>research 버전. 섬 사이는 나룻배로 건너요</span></li>
</ul>
<p><a href="/researchtree/guide/viewer/island">섬 읽는 법 보기 →</a></p>
</div>
<figure class="rt-frame">
<div class="rt-dots"><i></i><i></i><i></i></div>
<img src="/images/readme/island.png" alt="3D 연구의 섬: 실험은 식물로, research 버전은 돌 기념탑으로 그려진 복셀 섬">
<figcaption>실제 뷰어 화면. 드래그로 옮기고 휠로 확대해요.</figcaption>
</figure>
</div>

<p class="rt-english">
<strong>English:</strong> This is the user &amp; developer guide for ResearchTree, written in Korean.
ResearchTree renders your experiment branches and pull requests as a tree that grows from your initial implementation.
See the <a href="https://github.com/DarkPyonix/researchtree">repository README</a> for an English overview.
</p>
