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
      text: 데모 보기
      link: "https://darkpyonix.dev/researchtree/?user=DarkPyonix&repo=researchtree-demo"
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
  - icon: 📐
    title: 의도·스펙 기반 개발
    details: 스펙 기반 개발(SDD)을 연구에 맞게 바꿨습니다. 스펙 변경이 곧 가설이고, 실험의 채택·기각이 그 변경을 스펙에 넣을지 정합니다. 의도 문서의 주장까지 실험과 이어집니다.
    link: /rules/spec
    linkText: 의도·스펙 기반 개발
  - icon: 🗺️
    title: 연구 포트폴리오
    details: 연구 레포가 여러 개여도 계정 주소 하나로 전부 보여줍니다. 연구자 소개와 이력서까지 붙고, 비공개 연구는 잠긴 섬으로 남습니다.
    link: /guide/island
    linkText: 아일랜드 만들기
  - icon: 🔭
    title: 오픈 사이언스
    details: 실패한 실험과 버린 아이디어까지 레포 안에 남습니다. 레포를 공개하면 연구 과정 전체가 공개됩니다.
    link: /guide/introduction
    linkText: 소개 읽기
---

::: tip 바로 시작하기
[중앙 웹](https://darkpyonix.dev/researchtree/)은 지금 바로 GitHub 로그인으로 쓸 수 있어요. Python 패키지는 `pip install researchtree`로, VS Code 확장은 [Marketplace](https://marketplace.visualstudio.com/items?itemName=darkpyonix.researchtree)에서 설치해요. 자세한 내용은 [시작하기](/guide/introduction)를 참고해 주세요. 먼저 눈으로 보고 싶다면 [데모 연구](https://darkpyonix.dev/researchtree/?user=DarkPyonix&repo=researchtree-demo)를 열어보세요. 로그인 없이 바로 둘러볼 수 있어요.
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
<img src="/images/readme/ko/island.png" alt="3D 연구의 섬: 실험은 식물로, research 버전은 돌 기념탑으로 그려진 복셀 섬">
<figcaption>실제 뷰어 화면. 드래그로 옮기고 휠로 확대해요.</figcaption>
</figure>
</div>
