$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Exe = Join-Path $Root 'moraxterm-gui.exe'
if (-not (Test-Path $Exe)) { $Exe = Join-Path $Root 'dist\moraxterm-gui.exe' }
if (-not (Test-Path $Exe)) { throw "moraxterm-gui.exe was not found beside this installer or in dist." }
$Desktop = [Environment]::GetFolderPath('Desktop')
$ShortcutPath = Join-Path $Desktop 'Moraxterm.lnk'
$Shell = New-Object -ComObject WScript.Shell
$Shortcut = $Shell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $Exe
$Shortcut.WorkingDirectory = $Root
$Shortcut.IconLocation = "$Exe,0"
$Shortcut.Description = 'Moraxterm SSH client and terminal'
$Shortcut.Save()
Write-Host "Created desktop shortcut: $ShortcutPath"
