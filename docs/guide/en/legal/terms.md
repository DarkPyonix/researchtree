# Terms of Service

**Effective date: September 11, 2026**

These terms apply to ResearchTree, the open-source tool published by DarkPyonix. They cover the central web viewer (`https://darkpyonix.dev/researchtree/`), the VS Code extension, the Python package `researchtree`, and the authentication proxy (`https://researchtree.thisisthepy.workers.dev`). By using ResearchTree, you are considered to have agreed to these terms.

## License

ResearchTree is free software under the [Apache License 2.0](https://github.com/DarkPyonix/researchtree/blob/main/LICENSE). Your rights to use, copy, modify, and distribute the code follow that license, and these terms add only what the hosted services need.

## What ResearchTree does

It reads the branches, PRs, tags, and commits of GitHub repos you can access and shows them as a tree. It writes to GitHub only when you ask: editing a PR body, posting a comment, recording metrics from a training script, or cutting a research version. When cutting a version, it shows you the plan first and then reverts, merges, tags, and deletes branches in your repo. It always acts with your GitHub credentials and only within the permissions you granted.

## Content and accounts

- Everything you create with ResearchTree (PRs, comments, branches, tags) lives in your GitHub repo and is yours. It follows the [GitHub Terms of Service](https://docs.github.com/site-policy/github-terms/github-terms-of-service) and your repo's own rules.
- ResearchTree does not host, review, or moderate content. Content moderation for PRs and comments is handled by GitHub and by each repo's owner.
- You are responsible for your GitHub account, for the tokens you give ResearchTree, and for the changes you make with ResearchTree.

## Use and limitations

- ResearchTree is a tool for recording and browsing research experiments kept in Git. Do not use it to access repos you are not authorized to access, to overload the GitHub API, or to break GitHub's terms.
- Commands that change your repo (for example `researchtree release --yes`) do exactly what the plan shows. Check the plan before you run them.
- ResearchTree is under active development. Features may change, and the hosted services may sometimes be unavailable.

## No warranty and limitation of liability

ResearchTree is provided **"as is", without warranties of any kind**, as stated in the Apache License 2.0. To the extent permitted by law, DarkPyonix is not liable for damages arising from its use, including data loss or changes to your repos.

## Privacy

How we handle data is described in the [Privacy Policy](/legal/privacy).

## Changes and contact

We may revise these terms; the effective date above is the latest version, and the history is public in the [repo](https://github.com/DarkPyonix/researchtree/commits/main/docs/guide/legal/terms.md). For questions, please open an [issue](https://github.com/DarkPyonix/researchtree/issues).
