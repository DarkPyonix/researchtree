# Privacy Policy

**Effective date: September 11, 2026** · [한국어](#개인정보-처리방침)

ResearchTree is an open-source tool published by DarkPyonix. It shows the experiment branches and pull requests of a GitHub repository as a tree. This policy covers every way ResearchTree is offered: the hosted web viewer at `https://darkpyonix.github.io/researchtree/`, the VS Code extension, the Python package (`researchtree`, including the local server), and the authentication proxy at `https://researchtree.thisisthepy.workers.dev`.

## Summary

- ResearchTree has **no database and no server of its own that stores your data.** Your research records stay in your GitHub repository.
- Your GitHub token stays on your own device. It is sent only to `api.github.com`.
- We collect **no analytics, no telemetry, no tracking cookies, and no advertising data.** We do not sell or share personal data.

## What data ResearchTree handles

| Data | Where it goes | Why |
|---|---|---|
| GitHub access token | Stored on your device only: browser `localStorage` (web), VS Code's GitHub authentication session (extension), or your OS keychain or a `0600` config file (Python package) | To call the GitHub API on your behalf |
| Repository data (pull requests, branches, tags, commits, comments, changed files) | Read directly from `api.github.com` into the viewer on your device | To draw the tree and show experiment details |
| Your edits and comments | Written to GitHub (`api.github.com`) only when you save an edit, post a comment, or run a command such as `rt.log()` or `researchtree release` | To record your experiments where you asked |
| Viewer preferences: recent and last repository, view mode, label metric per version, language, branch settings per repository, panel width, card state | Your browser's `localStorage` or VS Code's extension storage, on your device | To remember your settings |
| OAuth authorization code (web sign-in only) | Sent once to the authentication proxy, which exchanges it with GitHub for a token and returns the token to your browser | GitHub's token endpoint cannot be called from a browser directly |

We do not receive, copy, or store any of this data on servers we operate. You can delete everything the viewer keeps on your device by signing out (which removes the token) and clearing the site data, or with `researchtree logout` for the Python package.

## Authentication proxy

The proxy is a Cloudflare Worker with one job: exchange an OAuth authorization code for a token (`POST /token`). It does not store or log codes, tokens, or request bodies, and it only accepts requests from the official site. The OAuth client secret is kept as a Worker secret. If you sign in with a personal access token instead, the proxy is never used.

## Third-party services

ResearchTree relies on these services, each under its own privacy terms:

- **GitHub** (API, OAuth, and GitHub Pages hosting of the web viewer and this guide). When you use the hosted site, GitHub receives your requests to `api.github.com` and serves the pages, and may log technical data such as IP addresses. See the [GitHub Privacy Statement](https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement).
- **Cloudflare** (runs the authentication proxy). Cloudflare processes the network traffic of the token exchange. See the [Cloudflare Privacy Policy](https://www.cloudflare.com/privacypolicy/).
- **Weights & Biases or other links** that you put in a PR body are only opened if you click them.

The viewer loads no scripts, fonts, or images from other domains, apart from GitHub avatars.

## Permissions

Signing in with GitHub requests the `repo` scope, which GitHub needs for reading and writing pull requests in private repositories. If you prefer narrower access, use a fine-grained personal access token limited to the repositories you choose, with **Pull requests (read/write)** and **Contents (read)**.

## Children

ResearchTree is a developer tool and is not directed at children under 13 (or the minimum age in your country).

## Changes

We may update this policy when ResearchTree changes. The effective date above shows the latest version, and the full history is public in the [repository](https://github.com/DarkPyonix/researchtree/commits/main/docs/guide/legal/privacy.md).

## Contact

Questions or requests: open an issue at [github.com/DarkPyonix/researchtree/issues](https://github.com/DarkPyonix/researchtree/issues). For security problems, please use a [private security advisory](https://github.com/DarkPyonix/researchtree/security/advisories/new).

---

## 개인정보 처리방침

**시행일: 2026년 9월 11일**

ResearchTree는 DarkPyonix가 공개하는 오픈소스 도구로, GitHub 레포의 실험 브랜치와 PR을 트리로 보여줘요. 이 방침은 ResearchTree를 제공하는 모든 형태에 적용돼요. 중앙 웹 뷰어(`https://darkpyonix.github.io/researchtree/`), VS Code 확장, Python 패키지(`researchtree`, 로컬 서버 포함), 인증 프록시(`https://researchtree.thisisthepy.workers.dev`)예요.

### 요약

- ResearchTree에는 여러분의 데이터를 저장하는 **데이터베이스나 자체 서버가 없어요.** 연구 기록은 여러분의 GitHub 레포에 그대로 있어요.
- GitHub 토큰은 여러분의 기기에만 있고, `api.github.com`으로만 전송돼요.
- **분석, 원격 측정, 추적 쿠키, 광고 데이터를 일절 수집하지 않아요.** 개인정보를 판매하거나 공유하지 않아요.

### 다루는 데이터

| 데이터 | 가는 곳 | 이유 |
|---|---|---|
| GitHub 액세스 토큰 | 여러분의 기기에만 저장: 브라우저 `localStorage`(웹), VS Code의 GitHub 인증 세션(확장), OS 키체인 또는 `0600` 설정 파일(Python 패키지) | 여러분 대신 GitHub API를 호출하기 위해 |
| 레포 데이터(PR, 브랜치, 태그, 커밋, 댓글, 바뀐 파일) | `api.github.com`에서 기기의 뷰어로 직접 읽어요 | 트리와 실험 내용을 보여주기 위해 |
| 여러분의 수정과 댓글 | 수정을 저장하거나, 댓글을 올리거나, `rt.log()`·`researchtree release` 같은 명령을 실행할 때만 GitHub에 써요 | 요청한 곳에 실험을 기록하기 위해 |
| 뷰어 설정: 최근·마지막 레포, 보기 모드, 버전별 라벨 메트릭, 언어, 레포별 브랜치 설정, 패널 너비, 카드 접힘 | 기기의 브라우저 `localStorage` 또는 VS Code 확장 저장소 | 설정을 기억하기 위해 |
| OAuth 인가 코드(웹 로그인 때만) | 인증 프록시로 한 번 보내고, 프록시가 GitHub에서 토큰으로 바꿔 브라우저에 돌려줘요 | GitHub 토큰 엔드포인트는 브라우저에서 직접 호출할 수 없어서 |

저희가 운영하는 서버로 이 데이터를 받거나 복사하거나 저장하지 않아요. 로그아웃(토큰 삭제)과 사이트 데이터 삭제로, Python 패키지는 `researchtree logout`으로 기기에 남은 것을 모두 지울 수 있어요.

### 인증 프록시

프록시는 OAuth 인가 코드를 토큰으로 바꾸는 일(`POST /token`) 하나만 하는 Cloudflare Worker예요. 코드, 토큰, 요청 본문을 저장하거나 로그로 남기지 않고, 공식 사이트에서 온 요청만 받아요. OAuth client secret은 Worker secret으로만 보관해요. 개인 액세스 토큰(PAT)으로 로그인하면 프록시를 전혀 거치지 않아요.

### 제3자 서비스

- **GitHub**(API, OAuth, 웹 뷰어와 이 가이드를 호스팅하는 GitHub Pages). 중앙 웹을 쓰면 GitHub가 `api.github.com` 요청을 받고 페이지를 제공하며, IP 주소 같은 기술 정보를 기록할 수 있어요. [GitHub 개인정보 처리방침](https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement)을 참고하세요.
- **Cloudflare**(인증 프록시 실행). 토큰 교환의 네트워크 트래픽을 처리해요. [Cloudflare 개인정보 처리방침](https://www.cloudflare.com/privacypolicy/)을 참고하세요.
- PR 본문에 넣은 **W&B 등 외부 링크**는 여러분이 누를 때만 열려요.

뷰어는 GitHub 아바타 말고는 다른 도메인에서 스크립트, 글꼴, 이미지를 불러오지 않아요.

### 권한

GitHub로 로그인하면 `repo` scope를 요청해요. 비공개 레포의 PR을 읽고 쓰는 데 필요해요. 더 좁은 권한을 원하면, 고른 레포에만 **Pull requests(읽기/쓰기)**와 **Contents(읽기)**를 준 fine-grained 개인 액세스 토큰을 쓰세요.

### 아동

ResearchTree는 개발자 도구이며 만 13세(또는 각 국가의 최소 연령) 미만 아동을 대상으로 하지 않아요.

### 변경

ResearchTree가 바뀌면 이 방침을 고칠 수 있어요. 위의 시행일이 최신 버전을 나타내고, 전체 변경 이력은 [레포](https://github.com/DarkPyonix/researchtree/commits/main/docs/guide/legal/privacy.md)에 공개돼 있어요.

### 문의

질문이나 요청은 [github.com/DarkPyonix/researchtree/issues](https://github.com/DarkPyonix/researchtree/issues)에 이슈로 남겨 주세요. 보안 문제는 [비공개 보안 권고](https://github.com/DarkPyonix/researchtree/security/advisories/new)로 알려 주세요.
