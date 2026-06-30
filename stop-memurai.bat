@echo off
REM Stop Memurai Windows Service
net stop Memurai 2>nul
if %ERRORLEVEL% EQU 2 (
  taskkill /f /im memurai.exe 2>nul
)
echo Memurai stopped
