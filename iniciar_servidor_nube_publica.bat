@echo off
title Servidor Nube Publica (Tunel Instantaneo)
echo ================================================================
echo   INICIANDO SERVIDOR Y TUNEL PUBLICO EN LA NUBE
echo ================================================================
echo.
echo 1. Iniciando Servidor Local en segundo plano...
start /B node server/server.js
timeout /t 2 /nobreak >nul
echo.
echo 2. Generando enlace publico HTTPS en la nube...
echo    Copie la URL HTTPS que aparecera abajo y peguela en la App movil o PC:
echo ================================================================
echo.
npx -y localtunnel --port 3001
pause
