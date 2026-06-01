@echo off
setlocal
cd /d "%~dp0"

where py >nul 2>nul
if errorlevel 1 goto try_python
py -3 app.py
goto after_run

:try_python
where python >nul 2>nul
if errorlevel 1 goto no_python
python app.py
goto after_run

:no_python
echo Python 3 was not found.
echo Install Python 3, or make sure py/python is available in PATH.
pause
exit /b 1

:after_run
set "APP_EXIT=%errorlevel%"
if "%APP_EXIT%"=="0" exit /b 0

echo.
echo App failed to start. Exit code: %APP_EXIT%
if not exist crash.log goto wait_before_exit
echo.
echo crash.log:
type crash.log

:wait_before_exit
echo.
pause
exit /b %APP_EXIT%
