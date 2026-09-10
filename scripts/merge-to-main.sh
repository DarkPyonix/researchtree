#!/usr/bin/env bash
# Merge develop into main (see CLAUDE.md "Documentation layout").
#
# main keeps only the public documents: README.md at the root, and docs/guide/ and docs/locale/.
# Every other markdown file at the repository root (CLAUDE.md, PROJECT.md, ...) and everything
# else under docs/ stays on develop only. Files that main already removed but develop changed
# show up as modify/delete conflicts; removing them again resolves those.
#
# Usage: scripts/merge-to-main.sh [--push]
#   --push   push main to origin after the merge commit
set -euo pipefail

push=false
for arg in "$@"; do
  case "$arg" in
    --push) push=true ;;
    -h | --help)
      sed -n '2,11p' "$0"
      exit 0
      ;;
    *)
      echo "unknown option: $arg" >&2
      exit 2
      ;;
  esac
done

cd "$(git rev-parse --show-toplevel)"

if [ -n "$(git status --porcelain)" ]; then
  echo "The working tree is not clean. Commit or stash first." >&2
  exit 1
fi

start=$(git branch --show-current)
git fetch origin
git switch main
git merge --ff-only origin/main

if ! git merge --no-ff --no-commit develop; then
  echo "Merge stopped with conflicts; removing develop-only documents may resolve them."
fi

# Paths main must not contain: root markdown other than README.md, and docs/ outside guide/ and locale/.
remove=$(
  {
    git ls-files -- ':(glob)*.md' | grep -vx 'README.md' || true
    git ls-files -- docs | grep -vE '^docs/(guide|locale)/' || true
  } | sort -u
)
if [ -n "$remove" ]; then
  echo "$remove" | while IFS= read -r path; do
    git rm -r -q --cached --ignore-unmatch -- "$path"
    rm -f -- "$path"
  done
fi

if [ -n "$(git diff --name-only --diff-filter=U)" ]; then
  echo "Unresolved conflicts remain:" >&2
  git diff --name-only --diff-filter=U >&2
  echo "Resolve them, then run: git commit" >&2
  exit 1
fi

if ! git rev-parse -q --verify MERGE_HEAD >/dev/null; then
  echo "main is already up to date with develop."
  exit 0
fi
git commit -q -m "Chore: Merge develop into main"
echo "Merged develop into main."

if $push; then
  git push origin main
else
  echo "Review it, then push with: git push origin main"
fi

if [ "$start" != "main" ]; then
  echo "(You are on main now; switch back with: git switch $start)"
fi
