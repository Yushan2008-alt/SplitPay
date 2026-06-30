@echo off
REM Start Memurai Windows Service for SplitPay development
net start Memurai 2>nul
if %ERRORLEVEL% EQU 2 (
  echo Memurai service not found. Starting background process instead...
  start "" "C:\Program Files\Memurai\memurai.exe" "C:\Program Files\Memurai\memurai.conf"
)
echo Memurai is running on port 6379
