# Lovable Bridge Agent - Windows auto-start installer.
#
# Registers agent.mjs as a Scheduled Task that runs at logon and restarts
# itself if it crashes. No admin rights required (runs as the current user
# so Illustrator/InDesign COM calls work).
#
# Usage (PowerShell, in the agent\ directory):
#   $env:LOVABLE_AGENT_TOKEN       = "lvbl_xxx"
#   $env:LOVABLE_API_BASE          = "https://<your-project>.lovable.app"
#   $env:LOVABLE_AGENT_TEMPLATES   = "C:\LovableTemplates"
#   powershell -ExecutionPolicy Bypass -File .\install-windows.ps1
#
# Uninstall:
#   Unregister-ScheduledTask -TaskName "LovableBridgeAgent" -Confirm:$false

$ErrorActionPreference = "Stop"

function Bail([string]$msg, [string]$fix) {
  Write-Host ""
  Write-Host "X $msg" -ForegroundColor Red
  Write-Host "  -> $fix" -ForegroundColor Yellow
  Write-Host ""
  exit 1
}

# 1. Required env vars with friendly errors.
$token     = [Environment]::GetEnvironmentVariable("LOVABLE_AGENT_TOKEN",       "Process")
$apiBase   = [Environment]::GetEnvironmentVariable("LOVABLE_API_BASE",          "Process")
$tplDir    = [Environment]::GetEnvironmentVariable("LOVABLE_AGENT_TEMPLATES",   "Process")

if (-not $token)   { Bail "LOVABLE_AGENT_TOKEN is not set." "In the dashboard go to Settings -> Local Bridge Agent, click 'Create token', then run: `$env:LOVABLE_AGENT_TOKEN = 'lvbl_...'" }
if (-not $apiBase) { Bail "LOVABLE_API_BASE is not set."    "Set it to your published app URL, e.g. `$env:LOVABLE_API_BASE = 'https://your-project.lovable.app'" }
if (-not $tplDir)  { Bail "LOVABLE_AGENT_TEMPLATES is not set." "Pick a folder for your .ai/.indd templates, e.g. `$env:LOVABLE_AGENT_TEMPLATES = 'C:\LovableTemplates'" }

# 2. Token sanity-check.
if ($token.StartsWith("Bearer ")) {
  Bail "LOVABLE_AGENT_TOKEN starts with 'Bearer '." "Paste only the token itself, not the Authorization header."
}
if ($token.Length -lt 16) {
  Bail "LOVABLE_AGENT_TOKEN looks too short ($($token.Length) chars)." "Copy the full token shown once after clicking 'Create token' in the dashboard."
}

# 3. Node 20+ required.
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
  Bail "node not found in PATH." "Install Node 20 or newer from https://nodejs.org and reopen PowerShell."
}
$nodeVer  = (& $nodeCmd.Source -p "process.versions.node") 2>$null
$nodeMaj  = [int]($nodeVer.Split(".")[0])
if ($nodeMaj -lt 20) {
  Bail "Node v$nodeVer is too old - need v20 or newer." "Upgrade from https://nodejs.org, then reopen PowerShell."
}

# 4. Templates folder - auto-create.
if (-not (Test-Path $tplDir)) {
  Write-Host "-> Creating templates folder: $tplDir"
  try { New-Item -ItemType Directory -Force -Path $tplDir | Out-Null }
  catch { Bail "Could not create $tplDir." "Pick a path you can write to, or create the folder manually first." }
}
try {
  $probe = Join-Path $tplDir ".lovable-write-probe"
  Set-Content -Path $probe -Value "ok" -ErrorAction Stop
  Remove-Item $probe -ErrorAction SilentlyContinue
} catch {
  Bail "Templates folder is not writable: $tplDir" "Pick a folder under your user profile, e.g. `$env:LOVABLE_AGENT_TEMPLATES = `"`$env:USERPROFILE\LovableTemplates`""
}

$agentDir = (Resolve-Path "$PSScriptRoot").Path
$node     = $nodeCmd.Source
$logDir   = Join-Path $env:LOCALAPPDATA "LovableAgent"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

# Persist env vars for the current user so the scheduled task inherits them.
[Environment]::SetEnvironmentVariable("LOVABLE_AGENT_TOKEN",     $token,   "User")
[Environment]::SetEnvironmentVariable("LOVABLE_API_BASE",        $apiBase, "User")
[Environment]::SetEnvironmentVariable("LOVABLE_AGENT_TEMPLATES", $tplDir,  "User")

$action = New-ScheduledTaskAction `
  -Execute $node `
  -Argument "`"$agentDir\agent.mjs`"" `
  -WorkingDirectory $agentDir

$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit (New-TimeSpan -Hours 0)

$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive

Register-ScheduledTask `
  -TaskName "LovableBridgeAgent" `
  -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
  -Description "Lovable bridge agent - drives Illustrator/InDesign for the platform." `
  -Force | Out-Null

Start-ScheduledTask -TaskName "LovableBridgeAgent"

Write-Host ""
Write-Host "OK Installed Lovable agent as a logon task (LovableBridgeAgent)." -ForegroundColor Green
Write-Host "   Templates folder: $tplDir"
Write-Host "   Node:             v$nodeVer ($node)"
Write-Host "   Logs:             $logDir"
Write-Host ""
Write-Host "Next step: open Settings -> Local Bridge Agent in the dashboard."
Write-Host "  It should flip to 'online' within ~10 seconds."
Write-Host "  Status: Get-ScheduledTask -TaskName LovableBridgeAgent | Get-ScheduledTaskInfo"
