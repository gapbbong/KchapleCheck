@echo off
setlocal
cd /d %~dp0
title 경성전자고 예배 출석 데이터 백업 도구

echo ======================================================
echo   ✝ 경성전자고 예배 출석 데이터 자동 백업 (JSON to Git)
echo ======================================================
echo   시작 시간: %date% %time%
echo.

:: Node.js 실행
node backup_data.js

:: 에러 체크
if %errorlevel% neq 0 (
    echo.
    echo ❌ [에러] 백업 중 문제가 발생했습니다. (오기입된 설정이나 네트워크 확인)
    echo.
    pause
) else (
    echo.
    echo ✅ [성공] 백업이 성공적으로 완료되었습니다! 5초 후 창이 닫힙니다.
    echo.
    timeout /t 5
)

endlocal
