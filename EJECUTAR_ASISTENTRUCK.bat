@echo off
title ASISTENTRUCK - Inversiones BOTAM SpA
color 06
echo ===================================================================
echo             ASISTENTRUCK - INVERSIONES BOTAM SpA
echo        Iniciando Servidor y Aplicacion de Asistencia...
echo ===================================================================
echo.
echo 1. Iniciando Servidor Central (Puerto 3001)...
start "Servidor Backend - ASISTENTRUCK" /min cmd /c "cd /d "%~dp0server" && node server.js"

echo 2. Iniciando Servidor Web (Puerto 5173)...
start "Cliente Web - ASISTENTRUCK" /min cmd /c "cd /d "%~dp0client" && npm run dev"

echo.
echo Esperando 3 segundos a que inicien los servicios...
timeout /t 3 /nobreak >nul

echo 3. Abriendo la aplicacion en el navegador...
start http://localhost:5173/

echo.
echo ===================================================================
echo   TODO LISTO: Si la pagina no carga de inmediato, presione F5.
echo   Puede cerrar esta ventana, el servidor continuara en ejecucion.
echo ===================================================================
timeout /t 5
