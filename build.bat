@echo off
REM Build script: assembles the static site into dist\ for Cloudflare Pages.
REM The site is fully static; this just copies templates and assets.

echo.
echo ========================================
echo Building Personal Scheduler (static)
echo ========================================
echo.

if exist dist rmdir /s /q dist
mkdir dist

echo Copying index.html...
copy templates\index.html dist\index.html >nul

echo Copying static assets...
xcopy static dist\static /e /i /q >nul

echo Copying admin pages...
mkdir dist\admin
xcopy templates\admin dist\admin /e /i /q >nul

echo Copying cancel page...
copy templates\cancel.html dist\ >nul

echo Copying reschedule page...
copy templates\reschedule.html dist\ >nul

echo Copying Cloudflare configuration...
if exist _headers copy _headers dist\ >nul
if exist _redirects copy _redirects dist\ >nul
if exist _routes.json copy _routes.json dist\ >nul

echo.
echo ========================================
echo Build successful!
echo ========================================
echo.
echo Output directory: dist\
