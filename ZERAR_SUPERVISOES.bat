@echo off
chcp 65001 > nul
title CCO CEDAE - Zerar Supervisões e Relatórios
echo ============================================================
echo         CCO CEDAE - LIMPEZA OPERACIONAL DE HISTORICO
echo ============================================================
echo.
echo ATENCAO:
echo Esta operacao vai apagar todos os relatorios de plantao,
echo fiscalizacoes de postos e ocorrencias registradas.
echo.
echo SEUS CADASTROS CONTINUARAO 100% INTACTOS:
echo - Setores
echo - Supervisores
echo - Viaturas
echo - Postos
echo - Usuarios e Senhas
echo - Configuracoes de E-mail
echo.
echo O proximo relatorio comecara a partir do ID #1.
echo.
set /p CONFIRMAR="Deseja realmente zerar todo o historico de supervisoes? (S/N): "
if /i "%CONFIRMAR%" neq "S" (
    echo.
    echo Operacao cancelada pelo usuario.
    pause
    exit /b 0
)

echo.
echo Executando limpeza no banco de dados...
echo.
"C:\Users\laurindolemos\AppData\Local\Programs\node-portable\node.exe" "C:\Users\laurindolemos\.gemini\antigravity\scratch\cco-sistema\backend\scripts\zerar-dados.js"
echo.
pause