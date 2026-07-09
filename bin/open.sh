#!/usr/bin/env bash
# Bound to a key via the `open` plugin action. When the action fires, herdr sets
# HERDR_PANE_ID to the focused pane (the source). Open the palette as an OVERLAY
# — a popup over the active pane that receives client keyboard input (a split or
# type="pane" pane renders but stays dead to typing in herdr 0.7.3). Pass the
# source pane through so relative commands (split/focus/zoom) act on it.
set -euo pipefail
HERDR="${HERDR_BIN_PATH:-herdr}"
# herdr injects the focused pane/tab/workspace as env on the action. Forward
# them so relative commands (split/focus, close pane/tab/workspace) target the
# pane you launched from, not the overlay.
SRC="${HERDR_PANE_ID:-}"
SRC_TAB="${HERDR_TAB_ID:-}"
SRC_WS="${HERDR_WORKSPACE_ID:-}"

ARGS=(plugin pane open
  --plugin azwan.herdr-palette
  --entrypoint palette
  --placement overlay)

[ -n "$SRC" ]    && ARGS+=(--env "HERDR_PALETTE_SOURCE=$SRC")
[ -n "$SRC_TAB" ] && ARGS+=(--env "HERDR_PALETTE_TAB=$SRC_TAB")
[ -n "$SRC_WS" ]  && ARGS+=(--env "HERDR_PALETTE_WORKSPACE=$SRC_WS")

exec "$HERDR" "${ARGS[@]}"
