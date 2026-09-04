@echo off
title ASISTENTRUCK - Guardian Anti-Suspension Render (Segundo Plano)
color 0A
echo ===================================================================
echo        ASISTENTRUCK - GUARDIAN ANTI-SUSPENSION RENDER 24/7
echo ===================================================================
echo.
echo Este proceso se ejecuta en segundo plano y envia un pulso cada 8 min
echo a Render (https://asistenciasistentruck.onrender.com) para que:
echo.
echo   1. El servidor NUNCA se apague ni hiberne.
echo   2. Las marcaciones de asistencia sean INSTANTANEAS (0 segundos de espera).
echo   3. No se generen atrasos ni errores en la tablet o celulares.
echo.
echo ===================================================================
echo Iniciando monitoreo... (Puedes minimizar esta ventana)
echo ===================================================================
echo.

node server/keepalive.js
pause
