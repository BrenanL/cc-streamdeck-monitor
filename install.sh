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
  echo "    Make sure PowerShell is accessible from WSL2."
  echo ""
  echo "  Manual install: copy the folder below to your Stream Deck plugins directory."
  echo "  Folder: $PLUGIN_SRC"
  echo "  Destination: C:\\Users\\<you>\\AppData\\Roaming\\Elgato\\StreamDeck\\Plugins\\"
  exit 1
fi

PLUGINS_WIN_PATH="$WIN_APPDATA\\Elgato\\StreamDeck\\Plugins"
PLUGINS_WSL_PATH="$(wslpath "$PLUGINS_WIN_PATH")"

if [[ ! -d "$PLUGINS_WSL_PATH" ]]; then
  echo ""
  echo "  ✗ Stream Deck plugins folder not found: $PLUGINS_WSL_PATH"
  echo "    Is the Elgato Stream Deck software installed on Windows?"
  echo "    Expected path: $PLUGINS_WIN_PATH"
  exit 1
fi

# ── 3. Copy plugin to Windows plugins folder ─────────────────────────────────
DEST="$PLUGINS_WSL_PATH/$PLUGIN_NAME"
echo "Installing plugin to $PLUGINS_WIN_PATH …"

if [[ -d "$DEST" ]]; then
  echo "  Removing existing installation…"
  rm -rf "$DEST"
fi

cp -r "$PLUGIN_SRC" "$DEST"
echo "  ✓ Plugin installed"

# ── 4. Done ───────────────────────────────────────────────────────────────────
echo ""
echo "Installation complete."
echo ""
echo "Next steps:"
echo "  1. Enable developer mode in Stream Deck:"
echo "     Settings → Advanced → Enable Plugin Development Mode"
echo "  2. Quit and restart the Stream Deck software."
echo "  3. Drag 'Usage Display' from the action library onto a button."
echo "     (Look under 'Developer Tools' → 'Claude Usage Monitor')"
echo ""
echo "The button updates every 60 seconds automatically."
echo "Press the button at any time to force an immediate refresh."
