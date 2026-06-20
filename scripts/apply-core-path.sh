#!/usr/bin/env bash
# scripts/apply-core-path.sh — point `echobird_core` at a local
# checkout so `cargo tauri build` works on a fork without push
# access to the private `EchoBird-secret-` repo.
#
# Usage:
#   export ECHOBIRD_CORE_PATH=/abs/path/to/echobird_core-local
#   scripts/apply-core-path.sh          # rewrite Cargo.toml
#   cargo tauri build                   # uses the local checkout
#   scripts/apply-core-path.sh unset    # revert to git dep
#
# What it does to src-tauri/Cargo.toml:
#   Replaces the `echobird_core = { git = "...", branch = "main" }`
#   line with `echobird_core = { path = "$ECHOBIRD_CORE_PATH" }`.
#   This is a direct path override; no [patch] or [source] blocks
#   are needed.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CARGO_TOML="$REPO_ROOT/src-tauri/Cargo.toml"
GIT_LINE='echobird_core = { git = "https://github.com/edison7009/EchoBird-secret-.git", branch = "main" }'
PATH_LINE_PREFIX='echobird_core = { path = "'
PATH_LINE_SUFFIX='" }'
MARKER='# >>> ECHOBIRD_CORE_PATH OVERRIDE — managed by scripts/apply-core-path.sh'

case "${1:-}" in
  unset)
    if ! grep -qF "$MARKER" "$CARGO_TOML"; then
      echo "No ECHOBIRD_CORE_PATH override in $CARGO_TOML — nothing to unset." >&2
      exit 0
    fi
    # Strip the marker comment + the path-dep line, restore the
    # git-dep line. Easiest: replace the path line with the
    # canonical git line, then drop the marker.
    python3 - "$CARGO_TOML" <<'PY'
import sys
path = sys.argv[1]
with open(path) as f: src = f.read()
marker = "# >>> ECHOBIRD_CORE_PATH OVERRIDE — managed by scripts/apply-core-path.sh"
git_line = 'echobird_core = { git = "https://github.com/edison7009/EchoBird-secret-.git", branch = "main" }'
# Drop the marker and everything from it to the end of file.
idx = src.find(marker)
if idx < 0:
    sys.exit(0)
head = src[:idx].rstrip()
# Replace the path-dep line (just before the marker) with the git line.
import re
new = re.sub(
    r'echobird_core = \{ path = "[^"]*" \}',
    git_line,
    head,
    count=1,
)
with open(path, "w") as f: f.write(new + "\n")
PY
    echo "Reverted $CARGO_TOML to use the upstream git dep."
    exit 0
    ;;

  "")
    if [[ -z "${ECHOBIRD_CORE_PATH:-}" ]]; then
      cat >&2 <<USAGE
Usage:
  export ECHOBIRD_CORE_PATH=/abs/path/to/echobird_core-local
  scripts/apply-core-path.sh          # rewrite Cargo.toml to use that path
  scripts/apply-core-path.sh unset    # revert to the upstream git dep

ECHOBIRD_CORE_PATH is currently empty.
USAGE
      exit 1
    fi
    ;;
  *)
    echo "Unknown argument: $1" >&2
    exit 1
    ;;
esac

if [[ ! -d "$ECHOBIRD_CORE_PATH" ]]; then
  echo "ECHOBIRD_CORE_PATH=$ECHOBIRD_CORE_PATH does not exist or is not a directory." >&2
  exit 1
fi

if [[ ! -f "$ECHOBIRD_CORE_PATH/Cargo.toml" ]]; then
  echo "ECHOBIRD_CORE_PATH=$ECHOBIRD_CORE_PATH does not contain a Cargo.toml —" >&2
  echo "is this really the echobird_core checkout?" >&2
  exit 1
fi

# Always start clean: strip any prior override first.
if grep -qF "$MARKER" "$CARGO_TOML"; then
  scripts/apply-core-path.sh unset
fi

# Append the marker + replace the git line with a path line.
python3 - "$CARGO_TOML" "$ECHOBIRD_CORE_PATH" <<'PY'
import sys
path, core_path = sys.argv[1], sys.argv[2]
with open(path) as f: src = f.read()
marker = "# >>> ECHOBIRD_CORE_PATH OVERRIDE — managed by scripts/apply-core-path.sh"
git_line = 'echobird_core = { git = "https://github.com/edison7009/EchoBird-secret-.git", branch = "main" }'
path_line = f'echobird_core = {{ path = "{core_path}" }}'
# Replace the git-dep line with the path-dep line, then append
# the marker as a comment so `unset` can find it again.
new = src.replace(git_line, path_line, 1)
new = new.rstrip() + "\n\n" + marker + "\n"
with open(path, "w") as f: f.write(new)
PY

echo "Patched $CARGO_TOML to use echobird_core from $ECHOBIRD_CORE_PATH"
echo "Run \`cargo tauri build\` to verify, or \`scripts/apply-core-path.sh unset\` to revert."
