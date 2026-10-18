@echo off
set JAVA_HOME=C:\Users\Admin\.jdks\jdk-21.0.12.1+1
set LOG=%TEMP%\gradle-build.log
echo === build start %DATE% %TIME% === > "%LOG%"
cd /d C:\Users\Admin\Downloads\registar\SmartRegistrar\android
call gradlew.bat assembleDebug --console=plain >> "%LOG%" 2>&1
echo === EXIT=%ERRORLEVEL% === >> "%LOG%"
