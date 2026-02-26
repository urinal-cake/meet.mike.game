@echo off
REM Build script for Windows
REM Generates static files and prepares for Cloudflare Pages deployment

setlocal enabledelayedexpansion

echo.
echo ========================================
echo Building Personal Scheduler
echo ========================================
echo.

REM Check if Go is installed
where go >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: Go is not installed or not in PATH
    exit /b 1
)

REM Create dist directory
if exist dist rmdir /s /q dist
mkdir dist

echo [1/3] Building Go binary...
go build -o main.exe

if %errorlevel% neq 0 (
    echo Error: Go build failed
    exit /b 1
)

echo [2/3] Generating static files...

REM Start the server in background and give it time to start
start /b main.exe

REM Wait for server to start
timeout /t 2 /nobreak

REM Generate static HTML using curl
echo Generating index.html...
curl -s http://localhost:3001 > dist\index.html

REM Copy static assets
echo Copying static assets...
xcopy static dist\static\ /E /I /Y >nul 2>&1

REM Copy admin pages
echo Copying admin pages...
xcopy templates\admin dist\admin\ /E /I /Y >nul 2>&1

REM Copy Cloudflare config files
echo Copying Cloudflare configuration...
copy _headers dist\ >nul 2>&1
copy _redirects dist\ >nul 2>&1
copy _routes.json dist\ >nul 2>&1

REM Kill the server process
taskkill /f /im main.exe >nul 2>&1

REM Wait a moment for process to terminate
timeout /t 1 /nobreak

if %errorlevel% equ 0 (
    echo.
    echo ========================================
    echo Build successful!
    echo ========================================
    echo.
    echo Output directory: dist\
    echo.
    echo Next steps:
    echo 1. Push to GitHub: git add . ^&^& git commit -m "Update scheduler" ^&^& git push
    echo 2. Cloudflare will automatically build and deploy
    exit /b 0
) else (
    echo.
    echo Error: Build failed
    exit /b 1
)
