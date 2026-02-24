#!/usr/bin/env bash
# install.sh — installs Claude Usage Monitor for Stream Deck
# Run from WSL2. The Stream Deck software must be installed on Windows.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_NAME="com.claude-code.usage-monitor.sdPlugin"
PLUGIN_SRC="$SCRIPT_DIR/$PLUGIN_NAME"
DATA_DIR="$HOME/.local/share/claude-usage"

# ── 1. Install the Python data script ────────────────────────────────────────
echo "Installing get-usage.py to $DATA_DIR …"
mkdir -p "$DATA_DIR"
cp "$SCRIPT_DIR/get-usage.py" "$DATA_DIR/get-usage.py"
echo "  ✓ get-usage.py installed"

# Quick sanity check
if ! python3 "$DATA_DIR/get-usage.py" > /dev/null 2>&1; then
  echo ""
  echo "  ⚠ Warning: get-usage.py returned an error."
  echo "    Run 'python3 $DATA_DIR/get-usage.py' to diagnose."
  echo "    Is Claude Code logged in? (run 'claude' to verify)"
  echo ""
fi

# ── 2. Find Windows %APPDATA% via PowerShell ─────────────────────────────────
echo "Finding Windows plugins folder…"
WIN_APPDATA=$(powershell.exe -NoProfile -Command 'Write-Output $env:APPDATA' 2>/dev/null | tr -d '\r\n')
if [[ -z "$WIN_APPDATA" ]]; then
  echo ""
  echo "  ✗ Could not read Windows %APPDATA% via PowerShell."
  echo "    Manual install: run this from Windows PowerShell instead:"
  echo "    Copy-Item -Recurse -Force '$PLUGIN_SRC' \"\$env:APPDATA\\Elgato\\StreamDeck\\Plugins\\$PLUGIN_NAME\""
  exit 1
fi

PLUGINS_WIN_PATH="$WIN_APPDATA\\Elgato\\StreamDeck\\Plugins"
PLUGINS_WSL_PATH="$(wslpath "$PLUGINS_WIN_PATH")"

if [[ ! -d "$PLUGINS_WSL_PATH" ]]; then
  echo ""
  echo "  ✗ Stream Deck plugins folder not found at:"
  echo "    $PLUGINS_WIN_PATH"
  echo "    Is the Elgato Stream Deck software installed?"
  exit 1
fi

# ── 3. Copy plugin to Windows plugins folder ─────────────────────────────────
DEST="$PLUGINS_WSL_PATH/$PLUGIN_NAME"
echo "Copying plugin to $PLUGINS_WIN_PATH …"

if [[ -d "$DEST" ]]; then
  # Try clean removal first; if the plugin is running, files may be locked.
  # Fall back to cp -rf (overwrite in place) which works even when the folder
  # itself is locked by Stream Deck, as long as individual files are not held open.
  if rm -rf "$DEST" 2>/dev/null; then
    cp -r "$PLUGIN_SRC" "$DEST"
  else
    echo "  (Plugin running — copying over existing install)"
    cp -rf "$PLUGIN_SRC/." "$DEST/"
  fi
else
  cp -r "$PLUGIN_SRC" "$DEST"
fi
echo "  ✓ Plugin installed"

# ── 4. Done ───────────────────────────────────────────────────────────────────
echo ""
echo "Installation complete."
echo ""
echo "Next: run this in Windows PowerShell to load the plugin:"
echo ""
echo "  streamdeck restart com.claude-code.usage-monitor"
echo ""
echo "Then drag 'Usage Display' from the action library onto a button."
echo "(Look under 'Claude Code' → 'Claude Usage Monitor')"
echo ""
echo "The button updates every 60 seconds. Press it to force an immediate refresh."
