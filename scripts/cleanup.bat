@echo off
REM Kill any processes listening on ports 3001, 5173, 5174
for /f "tokens=5" %%P in ('netstat -ano ^| findstr :3001 ^| findstr LISTENING 2^>nul') do taskkill /F /PID %%P >nul 2>&1
for /f "tokens=5" %%P in ('netstat -ano ^| findstr :5173 ^| findstr LISTENING 2^>nul') do taskkill /F /PID %%P >nul 2>&1
for /f "tokens=5" %%P in ('netstat -ano ^| findstr :5174 ^| findstr LISTENING 2^>nul') do taskkill /F /PID %%P >nul 2>&1

REM Do not auto-start mongod from here. A hardcoded dbPath can point to a different
REM data store than the Windows service and make collections appear to disappear.
echo INFO: Skipping MongoDB auto-start in cleanup.bat. Use start.ps1 to validate MongoDB connectivity.
exit /b 0
