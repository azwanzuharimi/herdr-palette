#!/usr/bin/env bash
# herdr-palette installer — links the plugin, adds a keybinding, reloads config.
#
#   ./install.sh [KEY]        KEY defaults to "prefix+space"
#
# One thing it CAN'T do: herdr caches keybindings at client-attach, so after
# this runs you must detach + reattach (prefix+q, then `herdr`) for the key to
# take effect. Re-runnable: skips steps already done.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KEY="${1:-prefix+space}"
PLUGIN_ID="azwan.herdr-palette"
CONFIG="${HERDR_CONFIG:-$HOME/.config/herdr/config.toml}"

HERDR="${HERDR_BIN_PATH:-$(command -v herdr 2>/dev/null || true)}"
[ -n "$HERDR" ] || { echo "error: herdr not found on PATH (or set HERDR_BIN_PATH)"; exit 1; }
command -v bun >/dev/null 2>&1 || { echo "error: bun not found — install from https://bun.sh"; exit 1; }

# Reject anything but herdr key tokens, so KEY can't inject into config.toml.
if ! printf '%s' "$KEY" | grep -Eq '^[A-Za-z0-9?+._-]+$'; then
  echo "error: key '$KEY' has unexpected characters; expected e.g. prefix+space"; exit 1
fi

if [ "$KEY" = "prefix+?" ]; then
  echo "note: prefix+? is herdr's native keybinds window; either pick another key"
  echo "      or add '[keys]' with 'help = \"\"' to your config to free it."
fi

# 1. deps
( cd "$ROOT" && bun install --silent ) >/dev/null 2>&1 || true

# 2. link the plugin (skip if any copy is already linked under this id)
if "$HERDR" plugin list 2>/dev/null | grep -Fq "$PLUGIN_ID"; then
  echo "• plugin already linked ($PLUGIN_ID) — leaving as-is"
else
  "$HERDR" plugin link "$ROOT" >/dev/null && echo "• linked plugin: $PLUGIN_ID"
fi

# 3. add the keybind (skip if this action is already bound)
mkdir -p "$(dirname "$CONFIG")"; touch "$CONFIG"
if grep -Fq "$PLUGIN_ID.open" "$CONFIG"; then
  echo "• keybind already in $CONFIG — leaving as-is"
else
  cat >> "$CONFIG" <<EOF

[[keys.command]]
key = "$KEY"
type = "plugin_action"
command = "$PLUGIN_ID.open"
description = "Command palette"
EOF
  echo "• added keybind: $KEY → $PLUGIN_ID.open"
fi

# 4. reload (and surface an invalid-key rejection)
OUT="$("$HERDR" server reload-config 2>&1 || true)"
if echo "$OUT" | grep -q "invalid keybinding"; then
  echo "! herdr rejected key '$KEY' as invalid — edit $CONFIG, pick a valid key, then: $HERDR server reload-config"
else
  echo "• reloaded config"
fi

echo
echo "Done. Detach + reattach for the keybind to take effect:"
echo "    prefix+q   then   herdr"
echo "Then press your prefix + ${KEY#prefix+} to open the palette."
