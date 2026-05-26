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
#   LOVABLE_API_BASE=https://<your-project>.lovable.app \
#   LOVABLE_AGENT_TEMPLATES=/Users/you/LovableTemplates \
#   ./install-macos.sh
#
# Re-run any time to update the config. Uninstall:
#   launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/app.lovable.agent.plist
#   rm ~/Library/LaunchAgents/app.lovable.agent.plist

set -euo pipefail

bail() { echo; echo "✗ $1" >&2; echo "  → $2" >&2; echo; exit 1; }

# 1. Required env vars — friendly explanation, not bash stack-traces.
[[ -n "${LOVABLE_AGENT_TOKEN:-}" ]] || bail \
  "LOVABLE_AGENT_TOKEN is not set." \
  "In the dashboard go to Settings → Local Bridge Agent, click 'Create token', and paste it before re-running: export LOVABLE_AGENT_TOKEN=lvbl_..."
[[ -n "${LOVABLE_API_BASE:-}"    ]] || bail \
  "LOVABLE_API_BASE is not set." \
  "Set it to your published app URL, e.g. export LOVABLE_API_BASE=https://your-project.lovable.app"
[[ -n "${LOVABLE_AGENT_TEMPLATES:-}" ]] || bail \
  "LOVABLE_AGENT_TEMPLATES is not set." \
  "Pick a folder to keep your .ai/.indd templates, e.g. export LOVABLE_AGENT_TEMPLATES=\"\$HOME/LovableTemplates\""

# 2. Sanity-check token format. Real tokens are long opaque strings; people
#    often paste an extra quote or a "Bearer " prefix by accident.
if [[ "${LOVABLE_AGENT_TOKEN}" == Bearer* ]]; then
  bail "LOVABLE_AGENT_TOKEN starts with 'Bearer '." \
       "Paste only the token itself, not the Authorization header."
fi
if [[ ${#LOVABLE_AGENT_TOKEN} -lt 16 ]]; then
  bail "LOVABLE_AGENT_TOKEN looks too short (${#LOVABLE_AGENT_TOKEN} chars)." \
       "Copy the full token shown once after clicking 'Create token' in the dashboard."
fi

# 3. Node 20+ required (top-level await, native fetch, structuredClone).
NODE_BIN="$(command -v node || true)"
if [[ -z "$NODE_BIN" ]]; then
  bail "node not found in PATH." \
       "Install Node 20 or newer (brew install node), then re-run this script."
fi
NODE_MAJOR="$("$NODE_BIN" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [[ "$NODE_MAJOR" -lt 20 ]]; then
  bail "Node $($NODE_BIN -v) is too old — need v20 or newer." \
       "Upgrade: brew upgrade node (or download from nodejs.org)."
fi

# 4. Templates folder — auto-create so first-time users don't have to.
if [[ ! -d "$LOVABLE_AGENT_TEMPLATES" ]]; then
  echo "→ Creating templates folder: $LOVABLE_AGENT_TEMPLATES"
  mkdir -p "$LOVABLE_AGENT_TEMPLATES" 2>/dev/null \
    || bail "Could not create $LOVABLE_AGENT_TEMPLATES." \
            "Pick a path you can write to, or create the folder manually first."
fi
if [[ ! -w "$LOVABLE_AGENT_TEMPLATES" ]]; then
  bail "Templates folder is not writable: $LOVABLE_AGENT_TEMPLATES" \
       "Fix permissions: chmod u+w \"$LOVABLE_AGENT_TEMPLATES\" — or pick a folder under your home dir."
fi

LABEL="app.lovable.agent"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
AGENT_DIR="$(cd "$(dirname "$0")" && pwd)"

[[ -w "$HOME/Library/LaunchAgents" ]] || mkdir -p "$HOME/Library/LaunchAgents"
mkdir -p "$HOME/Library/Logs"

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
echo "✓ Installed Lovable agent as a login service (${LABEL})."
echo "  Templates folder: $LOVABLE_AGENT_TEMPLATES"
echo "  Node:             $($NODE_BIN -v) ($NODE_BIN)"
echo "  Logs:             tail -f ~/Library/Logs/lovable-agent.{out,err}.log"
echo
echo "Next step: open Settings → Local Bridge Agent in the dashboard."
echo "  It should flip to 'online' within ~10 seconds."
echo "  If it doesn't, run: tail -n 50 ~/Library/Logs/lovable-agent.err.log"
