@echo off
cd /d "%~dp0\.."
node scripts\google_agenda_worker.mjs --daemon
pause
