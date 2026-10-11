@echo off
title Agente Seguimiento VIRTUAL
cd /d "%~dp0.."
python -c "import playwright, cryptography" 2>nul || (
  echo Instalando dependencias por unica vez...
  python -m pip install playwright cryptography && python -m playwright install chromium
)
python tools\virtual_agente.py
pause
