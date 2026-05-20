@echo off
setlocal

set "BRIDGE_NAME=futu_bridge.py"
set "LISTENER_NAME=futu_remote_listener.mjs"
set "WORKDIR=C:\Users\xyzch\splitease"
set "PYTHON_EXE=C:\Users\xyzch\AppData\Local\Microsoft\WindowsApps\python3.13.exe"
set "NODE_EXE=node"
set "BRIDGE_RUNNING=0"

for /f "tokens=2 delims=," %%I in ('tasklist /v /fo csv ^| findstr /i "%BRIDGE_NAME%"') do (
  echo Futu bridge is already running.
  set "BRIDGE_RUNNING=1"
  goto :check_listener
)

cd /d "%WORKDIR%"
echo Starting Futu bridge...
echo Working directory: %WORKDIR%
echo Press Ctrl+C to stop the bridge.
echo.

:check_listener
for /f "tokens=2 delims=," %%I in ('tasklist /v /fo csv ^| findstr /i "%LISTENER_NAME%"') do (
  echo Futu remote listener is already running.
  goto :start_bridge
)

echo Starting Futu remote listener in a separate window...
start "Futu Remote Listener" cmd /k "cd /d %WORKDIR% && %NODE_EXE% scripts\futu_remote_listener.mjs"
echo.

:start_bridge
if "%BRIDGE_RUNNING%"=="1" (
  echo Bridge already running. This window can be closed.
  pause
  goto :eof
)
"%PYTHON_EXE%" scripts\futu_bridge.py 2>&1
echo.
echo Bridge exited (see error above if any).
pause
