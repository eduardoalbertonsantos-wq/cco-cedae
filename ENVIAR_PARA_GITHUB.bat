@echo off
chcp 65001 >nul
title Enviar CCO CEDAE para o GitHub
cd /d "C:\Users\laurindolemos\.gemini\antigravity\scratch\cco-sistema"
echo ========================================================
echo   ENVIANDO CCO CEDAE PARA O GITHUB...
echo ========================================================
echo.
echo Se uma janela do navegador abrir, clique em "Sign in with your browser".
echo.
git push -u origin main
echo.
if %ERRORLEVEL% EQU 0 (
    echo ========================================================
    echo   [SUCESSO] PROJETO ENVIADO COM SUCESSO PARA O GITHUB!
    echo ========================================================
) else (
    echo [ERRO] Falha no envio. Verifique a conexao e credenciais.
)
echo.
pause
