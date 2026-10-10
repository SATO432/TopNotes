@echo off
setlocal
set "APP=%~dp0dist\win-unpacked\TopNotes.exe"
set "ICON=%~dp0TopNotes.ico"
set "WORKDIR=%~dp0dist\win-unpacked"
set "LNK=%USERPROFILE%\Desktop\TopNotes.lnk"

if not exist "%APP%" (
  echo TopNotes.exe was not found:
  echo %APP%
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$shell = New-Object -ComObject WScript.Shell; $shortcut = $shell.CreateShortcut('%LNK%'); $shortcut.TargetPath = '%APP%'; $shortcut.WorkingDirectory = '%WORKDIR%'; $shortcut.IconLocation = '%ICON%'; $shortcut.Save()"

echo Desktop shortcut created:
echo %LNK%
pause
