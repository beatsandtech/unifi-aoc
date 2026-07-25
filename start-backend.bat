@echo off
cd /d "%~dp0"
echo.
echo ========================================================
echo UniFi Autonomous Operations Center - Backend
echo ========================================================
echo.
python run-backend.py
echo.
echo Press any key to close...
pause
