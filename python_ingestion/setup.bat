@echo off
REM News Pulse — Windows setup script
REM IMPORTANT: Run this from a regular CMD window (not PowerShell)

echo ============================================================
echo  News Pulse -- Python Setup
echo ============================================================

SET PYEXE=

REM Check by command name ONLY (Store Python only works by name, not full path)
py --version >nul 2>&1
IF %ERRORLEVEL% EQU 0 (SET PYEXE=py & GOTO found)

python3 --version >nul 2>&1
IF %ERRORLEVEL% EQU 0 (SET PYEXE=python3 & GOTO found)

python --version >nul 2>&1
IF %ERRORLEVEL% EQU 0 (SET PYEXE=python & GOTO found)

REM --- Not found ---
echo.
echo  ERROR: Python is not accessible on PATH.
echo.
echo  Your Python 3.13 is installed via Microsoft Store but its
echo  "App Execution Alias" is disabled.
echo.
echo  HOW TO FIX (takes 30 seconds):
echo  -------------------------------------------------------
echo   1. Press the Windows key and type: App execution aliases
echo   2. Open "App execution aliases" settings
echo   3. Find "Python" or "Python 3" and toggle it ON
echo   4. Close this window and run setup.bat again
echo  -------------------------------------------------------
echo.
echo  OR install Python from python.org (check "Add to PATH"):
echo    https://www.python.org/downloads/
echo.
pause
EXIT /B 1

:found
echo Found Python via: %PYEXE%
%PYEXE% --version
echo.

echo Creating virtual environment...
%PYEXE% -m venv .venv
IF %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to create virtual environment.
    pause & EXIT /B 1
)

echo Installing dependencies...
.venv\Scripts\pip.exe install --upgrade pip --quiet
.venv\Scripts\pip.exe install -r requirements.txt
IF %ERRORLEVEL% NEQ 0 (
    echo ERROR: pip install failed. Check your internet connection.
    pause & EXIT /B 1
)

echo.
echo ============================================================
echo  Setup complete! 
echo ============================================================
echo.
echo  To run the pipeline:
echo    .venv\Scripts\activate
echo    python main.py --no-scrape
echo.
echo  To start the REST API:
echo    python api_server.py --port 8000
echo.
echo  To check DB stats:
echo    python main.py --stats
echo ============================================================
pause
