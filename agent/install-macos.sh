#!/usr/bin/env bash
# Lovable Bridge Agent — macOS auto-start installer.
#
# Registers agent.mjs as a launchd LaunchAgent so it:
#   • starts automatically when you log in
#   • restarts itself if it crashes
#   • logs to ~/Library/Logs/lovable-agent.{out,err}.log
#
# Usage:
#   cd agent
#   LOVABLE_AGENT_TOKEN=lvbl_xxx \
#   LOVABLE_API_BASE=https://id-preview--dd72d617-205d-4bf8-8c8a-ab811effecb5.lovable.app \
#   LOVABLE_AGENT_TEMPLATES=/Users/you/LovableTemplates \
#   ./install-macos.sh
#
# Re-run any time to update the config. Uninstall:
#   launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/app.lovable.agent.plist
#   rm ~/Library/LaunchAgents/app.lovable.agent.plist

set -euo pipefail

: "${LOVABLE_AGENT_TOKEN:?Set LOVABLE_AGENT_TOKEN (paste the token shown when you paired this Mac)}"
: "${LOVABLE_API_BASE:?Set LOVABLE_API_BASE (e.g. https://<your-project>.lovable.app)}"
: "${LOVABLE_AGENT_TEMPLATES:?Set LOVABLE_AGENT_TEMPLATES (absolute path to the folder with your .ai / .indd files)}"

LABEL="app.lovable.agent"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
AGENT_DIR="$(cd "$(dirname "$0")" && pwd)"
NODE_BIN="$(command -v node)"

if [[ -z "$NODE_BIN" ]]; then
  echo "node not found in PATH. Install Node 20+ (e.g. brew install node) and retry." >&2
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"

cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${NODE_BIN}</string>
    <string>${AGENT_DIR}/agent.mjs</string>
  </array>
  <key>WorkingDirectory</key><string>${AGENT_DIR}</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>${HOME}/Library/Logs/lovable-agent.out.log</string>
  <key>StandardErrorPath</key><string>${HOME}/Library/Logs/lovable-agent.err.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin</string>
    <key>LOVABLE_AGENT_TOKEN</key><string>${LOVABLE_AGENT_TOKEN}</string>
    <key>LOVABLE_API_BASE</key><string>${LOVABLE_API_BASE}</string>
    <key>LOVABLE_AGENT_TEMPLATES</key><string>${LOVABLE_AGENT_TEMPLATES}</string>
  </dict>
</dict>
</plist>
PLIST

# Reload cleanly (bootout is a no-op if not loaded).
launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl enable "gui/$(id -u)/${LABEL}"
launchctl kickstart -k "gui/$(id -u)/${LABEL}"

echo
echo "Installed Lovable agent as a login service (${LABEL})."
echo "Logs:  tail -f ~/Library/Logs/lovable-agent.{out,err}.log"
echo "Status: launchctl print gui/$(id -u)/${LABEL} | head"
echo
echo "It will start automatically every time you log in."
