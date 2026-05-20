@echo off
title OpenCode Background Server
echo Starting OpenCode Server...
opencode serve --port 4096 --hostname 0.0.0.0
pause
