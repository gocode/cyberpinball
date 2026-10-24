@echo off
rem Lanceur Cyber Pinball : double-clic pour le menu, ou "lanceur.cmd sync" pour une action.
rem Passe par -ExecutionPolicy Bypass pour fonctionner même si les scripts PowerShell sont bloqués.
where pwsh >nul 2>&1
if %errorlevel%==0 (
  pwsh -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0lanceur.ps1" %*
) else (
  powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0lanceur.ps1" %*
)
if "%~1"=="" pause
