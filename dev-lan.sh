#!/bin/bash
set -e

# Same env-symlink shim as dev.sh (see that file for context), but binds to
# 0.0.0.0 so other devices on the local network (e.g. a phone) can hit the
# dev server via the host's LAN IP.
if [ ! -e ".env.local" ]; then
  common_dir=$(git rev-parse --git-common-dir 2>/dev/null || true)
  if [ -n "$common_dir" ]; then
    main_root=$(cd "$common_dir/.." && pwd)
    if [ "$main_root" != "$(pwd)" ] && [ -f "$main_root/.env.local" ]; then
      ln -sf "$main_root/.env.local" .env.local
    fi
  fi
fi

exec "$(which npx)" next dev -H 0.0.0.0 -p "${PORT:-3100}"
