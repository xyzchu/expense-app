@echo off
setlocal
cd /d "%~dp0\.."

REM First-time setup:
REM   1. Add GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and MAIL_USER_EMAIL or MAIL_USER_ID to .env
REM   2. Run: node scripts\mail_ollama_worker.mjs --auth
REM   3. Make sure Ollama is running and the model is installed, e.g. ollama pull llama3.2:3b

node scripts\mail_ollama_worker.mjs --daemon
