@echo off
rem Arranca todo el entorno de desarrollo de VIDA, cada servicio en su ventana:
rem backend (puerto 3001), ngrok hacia el backend, panel web (Vite) y las dos
rem apps de Expo. La app del repartidor usa el puerto 8082 para no chocar con
rem la del cliente (8081). Cierra cada ventana para detener su servicio.
setlocal
set "RAIZ=%~dp0"

start "VIDA backend" /D "%RAIZ%backend" cmd /k npm run dev
rem Espera a que el backend levante antes de abrir el tunel
timeout /t 5 /nobreak >nul
start "VIDA ngrok" /D "%RAIZ%backend" cmd /k ngrok http 3001
start "VIDA panel web" /D "%RAIZ%frontend" cmd /k npm run dev
start "VIDA app cliente" /D "%RAIZ%app-cliente" cmd /k npx expo start --port 8081
rem --go: el repartidor trae expo-dev-client y sin esto el QR es para un
rem development build. En Expo Go funciona todo menos el rastreo en segundo plano.
start "VIDA app repartidor" /D "%RAIZ%app-repartidor" cmd /k npx expo start --port 8082 --go

echo Listo: se abrieron 5 ventanas (backend, ngrok, panel, app cliente, app repartidor).
endlocal
