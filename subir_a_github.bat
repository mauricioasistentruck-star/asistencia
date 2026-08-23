@echo off
title Subir Asistencia a GitHub
color 0b
echo ================================================================
echo        SUBIENDO PROYECTO ASISTENTRUCK A GITHUB
echo ================================================================
echo.
echo Repositorio destino: https://github.com/mauricioasistentruck-star/asistencia.git
echo.
echo 1. Comprobando cambios y confirmando...
"C:\Users\User\AppData\Local\Programs\MinGit\cmd\git.exe" remote remove origin 2>nul
"C:\Users\User\AppData\Local\Programs\MinGit\cmd\git.exe" remote add origin https://github.com/mauricioasistentruck-star/asistencia.git
"C:\Users\User\AppData\Local\Programs\MinGit\cmd\git.exe" branch -M main
"C:\Users\User\AppData\Local\Programs\MinGit\cmd\git.exe" add .
"C:\Users\User\AppData\Local\Programs\MinGit\cmd\git.exe" commit -m "Update Asistentruck Cloud" 2>nul

echo.
echo 2. Subiendo a GitHub...
echo (Si le solicita credenciales: ingrese su usuario de GitHub y su Token/Contrasena)
echo.
"C:\Users\User\AppData\Local\Programs\MinGit\cmd\git.exe" push -u origin main

echo.
echo ================================================================
if %ERRORLEVEL% EQU 0 (
    echo   EXITO: Proyecto subido correctamente a GitHub.
) else (
    echo   AVISO: Si fallo por autenticacion, cree un Token en GitHub:
    echo   https://github.com/settings/tokens
)
echo ================================================================
pause
