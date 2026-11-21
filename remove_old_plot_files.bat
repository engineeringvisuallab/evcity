@echo off
rem Removes the OLD plot files that were pasted in the wrong place (inside src\).
rem Put this file in the project ROOT (the folder that has package.json, tools, docs, src) and double click it.
cd /d "%~dp0"

if not exist "tools\plots-tile.py" (
  echo ERROR: tools\plots-tile.py not found. Put this bat file in the project root folder and run again.
  pause
  exit /b 1
)

echo Removing wrong-place files...
del /q "src\tools\plots-tile.py" 2>nul
del /q "src\tools\plots-tile-check.py" 2>nul
del /q "src\docs\city_plots_tiled.json" 2>nul
del /q "src\docs\city_plots_tiled.png" 2>nul
del /q "src\docs\city_plots_tiled_zoom.png" 2>nul
del /q "src\docs\city_plots_tiled_check.txt" 2>nul

rem rmdir without /s removes a folder ONLY if it is empty, so nothing else is ever deleted
rmdir "src\tools" 2>nul
rmdir "src\docs" 2>nul

echo.
echo Done. Left over (if any) in src\tools and src\docs:
if exist "src\tools" dir /b "src\tools"
if exist "src\docs" dir /b "src\docs"
echo.
pause
