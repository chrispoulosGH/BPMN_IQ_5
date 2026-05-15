@echo off
REM Kill any processes listening on ports 3001, 5173, 5174
for /f "tokens=5" %%P in ('netstat -ano ^| findstr :3001 ^| findstr LISTENING 2^>nul') do taskkill /F /PID %%P >nul 2>&1
for /f "tokens=5" %%P in ('netstat -ano ^| findstr :5173 ^| findstr LISTENING 2^>nul') do taskkill /F /PID %%P >nul 2>&1
for /f "tokens=5" %%P in ('netstat -ano ^| findstr :5174 ^| findstr LISTENING 2^>nul') do taskkill /F /PID %%P >nul 2>&1

REM Ensure MongoDB is running
sc query MongoDB | findstr "RUNNING" >nul 2>&1
if %errorlevel% neq 0 (
    echo Starting MongoDB service...
    net start MongoDB >nul 2>&1
    if %errorlevel% neq 0 (
        echo WARNING: Could not start MongoDB service. Trying mongod directly...
        start /B mongod --dbpath "C:\data\db" >nul 2>&1
    )
)
exit /b 0
