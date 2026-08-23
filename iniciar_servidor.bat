@echo off
title Servidor de Asistencia y GPS
echo ====================================================
echo   INICIANDO SERVIDOR CENTRAL DE ASISTENCIA Y GPS
echo ====================================================
cd /d "%~dp0server"
node server.js
pause
