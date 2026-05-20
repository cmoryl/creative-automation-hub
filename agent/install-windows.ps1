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

foreach ($name in @("LOVABLE_AGENT_TOKEN","LOVABLE_API_BASE","LOVABLE_AGENT_TEMPLATES")) {
  if (-not [Environment]::GetEnvironmentVariable($name, "Process")) {
    throw "Environment variable $name is not set. See header of this script."
  }
}

$agentDir = (Resolve-Path "$PSScriptRoot").Path
$node     = (Get-Command node).Source
$logDir   = Join-Path $env:LOCALAPPDATA "LovableAgent"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

# Persist env vars for the current user so the scheduled task inherits them.
[Environment]::SetEnvironmentVariable("LOVABLE_AGENT_TOKEN",     $env:LOVABLE_AGENT_TOKEN,     "User")
[Environment]::SetEnvironmentVariable("LOVABLE_API_BASE",        $env:LOVABLE_API_BASE,        "User")
[Environment]::SetEnvironmentVariable("LOVABLE_AGENT_TEMPLATES", $env:LOVABLE_AGENT_TEMPLATES, "User")

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
Write-Host "Installed Lovable agent as a logon task (LovableBridgeAgent)."
Write-Host "Status: Get-ScheduledTask -TaskName LovableBridgeAgent | Get-ScheduledTaskInfo"
Write-Host "It will start automatically every time you log in."
