#!/bin/bash
set -e

# When running inside a git worktree, Next.js looks for .env.local in the
# worktree's cwd and won't find it — the file only lives in the main
# checkout. Symlink it in so Sanity / other env-dependent code works in
# preview. Uses `--git-common-dir` to locate the main .git directory, whose
# parent is the main worktree.
if [ ! -e ".env.local" ]; then
  common_dir=$(git rev-parse --git-common-dir 2>/dev/null || true)
  if [ -n "$common_dir" ]; then
    main_root=$(cd "$common_dir/.." && pwd)
    if [ "$main_root" != "$(pwd)" ] && [ -f "$main_root/.env.local" ]; then
      ln -sf "$main_root/.env.local" .env.local
    fi
  fi
fi

exec "$(which npx)" next dev
