@echo off
setlocal
cd /d "%~dp0"

where node.exe >nul 2>nul
if errorlevel 1 (
  echo.
  echo [Flip PDF] 找不到 Node.js。
  echo 請先安裝 Node.js，再雙擊這個檔案。
  echo https://nodejs.org/
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo [Flip PDF] 第一次啟動，正在準備所需內容...
  call npm.cmd install --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo [Flip PDF] 準備失敗，請檢查網路後再試一次。
    pause
    exit /b 1
  )
)

echo [Flip PDF] 正在啟動閱讀器...
start "Flip PDF Server" cmd.exe /k "cd /d "%~dp0" && npm.cmd run dev"
timeout /t 4 /nobreak >nul
start "" "http://localhost:3000"

endlocal
