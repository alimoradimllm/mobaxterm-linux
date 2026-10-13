@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if errorlevel 1 (
  echo Python 3 is required. Install it from https://www.python.org/downloads/windows/
  exit /b 1
)
py -3 -c "from moraxterm_gui import main; main()"
