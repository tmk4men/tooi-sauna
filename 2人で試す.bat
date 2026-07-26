@echo off
rem 同じPCで2窓を開いて「他人がいると成立するか」を試す。サーバーもDBも要らない
rem 別々のウィンドウで開くので、撃った側と食らった側を同時に見られる
cd /d "%~dp0"
setlocal

set PORT=8731
set URL=http://localhost:%PORT%/index.html?open=1^&fast=1^&room=duo

where python >nul 2>nul
if errorlevel 1 (
  echo python が見つかりません。
  echo   index.html を2つのウィンドウで直接開いても試せますが、
  echo   file:// では窓どうしが繋がらないことがあります。
  pause
  exit /b 1
)

echo ローカルサーバーを起動します（ポート %PORT%）...
start "とおいサウナ ローカルサーバー" /min cmd /c "python -m http.server %PORT%"
timeout /t 2 /nobreak >nul

set CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe
if not exist "%CHROME%" set CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe

if exist "%CHROME%" (
  start "" "%CHROME%" --new-window "%URL%"
  timeout /t 1 /nobreak >nul
  start "" "%CHROME%" --new-window "%URL%"
) else (
  start "" "%URL%"
  timeout /t 1 /nobreak >nul
  start "" "%URL%"
)

echo.
echo 2つの窓が開きます。両方で「ふれて入る」を押してください。
echo   片方でロウリュを押す → もう片方の呼吸が乱れて熱が上がる
echo   これが起きないなら、この製品には存在理由がありません。
echo.
echo 終わったら、最小化されている「とおいサウナ ローカルサーバー」の窓を閉じてください。
pause
