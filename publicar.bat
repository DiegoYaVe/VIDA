@echo off
rem Publica VIDA a produccion por FTP (SmarterASP / IIS + iisnode).
rem Sube el backend y/o el contenido compilado del panel (frontend\dist).
rem
rem   publicar.bat                que subir se pregunta
rem   publicar.bat backend        solo el backend
rem   publicar.bat panel          solo el panel
rem   publicar.bat todo           backend y panel
rem
rem Modificadores:
rem   --build      compila el panel (npm run build) antes de subirlo
rem   --simular    muestra que archivos subiria, sin tocar el servidor
rem   --limpiar    borra del panel remoto lo que ya no exista en dist
rem   --modulos    incluye node_modules del backend (solo si cambiaron deps)
rem   --si         no pide confirmacion
rem
rem Credenciales y rutas: publicar.env (ignorado por git).
rem Copia publicar.env.example y completalo. Ver DESPLIEGUE-VIDA.md.
setlocal EnableDelayedExpansion
set "RAIZ=%~dp0"
set "CONFIG=%RAIZ%publicar.env"

set "QUE="
set "SIMULAR="
set "LIMPIAR="
set "MODULOS="
set "BUILD="
set "SINPREGUNTAR="

:args
if "%~1"=="" goto fin_args
if /i "%~1"=="backend"   set "QUE=backend"    & shift & goto args
if /i "%~1"=="panel"     set "QUE=panel"      & shift & goto args
if /i "%~1"=="todo"      set "QUE=todo"       & shift & goto args
if /i "%~1"=="--simular" set "SIMULAR=1"      & shift & goto args
if /i "%~1"=="--limpiar" set "LIMPIAR=1"      & shift & goto args
if /i "%~1"=="--modulos" set "MODULOS=1"      & shift & goto args
if /i "%~1"=="--build"   set "BUILD=1"        & shift & goto args
if /i "%~1"=="--si"      set "SINPREGUNTAR=1" & shift & goto args
echo [ERROR] Opcion desconocida: %~1
echo         Uso: publicar.bat [backend^|panel^|todo] [--build] [--simular] [--limpiar] [--modulos] [--si]
exit /b 2
:fin_args

rem -- WinSCP hace el FTP recursivo y sube solo lo que cambio --------------
set "WINSCP=C:\Program Files (x86)\WinSCP\WinSCP.com"
if not exist "%WINSCP%" set "WINSCP=C:\Program Files\WinSCP\WinSCP.com"
if not exist "%WINSCP%" for %%W in (winscp.com) do set "WINSCP=%%~$PATH:W"
if not exist "%WINSCP%" (
  echo [ERROR] No encuentro WinSCP.com. Instala WinSCP ^(https://winscp.net^)
  echo         o agrega su carpeta al PATH.
  exit /b 1
)

rem -- Configuracion -------------------------------------------------------
if not exist "%CONFIG%" (
  echo [ERROR] Falta %CONFIG%
  echo         Copia publicar.env.example como publicar.env y completalo.
  echo         Lleva la clave del FTP: NO lo commitees ^(ya esta en .gitignore^).
  exit /b 1
)
for /f "usebackq eol=# tokens=1* delims==" %%A in ("%CONFIG%") do (
  set "clave=%%A"
  set "valor=%%B"
  if not "!clave!"=="" set "!clave!=!valor!"
)

if not defined QUE (
  echo.
  echo   Que publicas a PRODUCCION?
  echo     1^) Backend ^(api^)
  echo     2^) Panel web
  echo     3^) Los dos
  echo.
  set /p "OPCION=  Opcion [1/2/3]: "
  if "!OPCION!"=="1" set "QUE=backend"
  if "!OPCION!"=="2" set "QUE=panel"
  if "!OPCION!"=="3" set "QUE=todo"
  if not defined QUE (
    echo [ERROR] Opcion invalida.
    exit /b 2
  )
)

rem -- Compilar el panel si se pidio ---------------------------------------
if defined BUILD if not "%QUE%"=="backend" (
  echo.
  echo === Compilando el panel ===
  pushd "%RAIZ%frontend" || exit /b 1
  call npm run build
  if errorlevel 1 (
    popd
    echo [ERROR] El build fallo: no se sube nada.
    exit /b 1
  )
  popd
)

if not "%QUE%"=="backend" if not exist "%RAIZ%frontend\dist\index.html" (
  echo [ERROR] No existe frontend\dist\index.html. Compila primero:
  echo         publicar.bat %QUE% --build
  exit /b 1
)
if not "%QUE%"=="backend" if not exist "%RAIZ%frontend\dist\web.config" (
  echo [ERROR] frontend\dist\web.config no existe. Sin el, IIS responde
  echo         index.html a las llamadas del API. Revisa frontend\public\web.config.
  exit /b 1
)

rem -- Confirmacion: esto toca produccion ----------------------------------
echo.
if defined SIMULAR (
  echo === SIMULACRO: no se sube nada, solo se lista que cambiaria ===
) else (
  echo === PUBLICAR A PRODUCCION ===
)
echo   Que:  %QUE%
if not "%QUE%"=="panel"   echo   Backend -^> !FTP_HOST_BACKEND!!FTP_HOST! : !REMOTO_BACKEND!
if not "%QUE%"=="backend" echo   Panel   -^> !FTP_HOST_PANEL!!FTP_HOST! : !REMOTO_PANEL!
if defined LIMPIAR echo   Ojo: --limpiar borra del panel remoto lo que no este en dist.
echo.
if not defined SIMULAR if not defined SINPREGUNTAR (
  set /p "OK=  Escribe SI para continuar: "
  if /i not "!OK!"=="SI" (
    echo   Cancelado.
    exit /b 0
  )
)

set "FALLO=0"
if "%QUE%"=="backend" call :backend
if "%QUE%"=="panel"   call :panel
if "%QUE%"=="todo" (
  call :backend
  if "!FALLO!"=="0" call :panel
)

echo.
if "!FALLO!"=="0" (
  echo === Listo ===
  if not "%QUE%"=="backend" if not defined SIMULAR (
    echo   El panel es PWA: si el navegador muestra la version vieja,
    echo   DevTools - Application - Clear site data, o Ctrl+F5.
    if defined URL_PANEL echo   !URL_PANEL!
  )
) else (
  echo === Termino con errores: revisa el detalle de arriba ===
)
exit /b !FALLO!

rem ========================================================================
:backend
echo.
echo === Backend ===
if not defined REMOTO_BACKEND (
  echo [ERROR] Falta REMOTO_BACKEND en publicar.env
  set "FALLO=1"
  exit /b 1
)
call :credenciales BACKEND
rem node_modules, .env y uploads NO viajan: el .env es el de produccion y
rem uploads guarda las imagenes subidas, que no estan en git. Tampoco los
rem .rar/.zip que se usan para subir node_modules a mano, ni credenciales
rem sueltas como firebase-service-account.json.
set "COMUN=.env;.env.*;uploads/;.git/;.expo/;tests/;*.log;logs/;iisnode/;*.rar;*.zip;*.7z;firebase-service-account.json"
set "MASCARA=|node_modules/;!COMUN!"
if defined MODULOS set "MASCARA=|!COMUN!"
call :sincronizar "%RAIZ%backend" "!REMOTO_BACKEND!" "!MASCARA!" ""
if errorlevel 1 (
  set "FALLO=1"
  exit /b 1
)
if defined SIMULAR exit /b 0
echo.
echo   Reinicia el sitio/pool de IIS desde el panel de SmarterASP:
echo   iisnode tiene el codigo viejo en memoria hasta que recicle.
if defined URL_HEALTH (
  echo   Comprueba despues: !URL_HEALTH!
  where curl.exe >nul 2>&1 && (
    echo.
    curl.exe -s -m 20 "!URL_HEALTH!"
    echo.
  )
)
exit /b 0

rem ========================================================================
:panel
echo.
echo === Panel web ===
if not defined REMOTO_PANEL (
  echo [ERROR] Falta REMOTO_PANEL en publicar.env
  set "FALLO=1"
  exit /b 1
)
call :credenciales PANEL
set "EXTRA="
if defined LIMPIAR set "EXTRA=-delete"
call :sincronizar "%RAIZ%frontend\dist" "!REMOTO_PANEL!" "" "!EXTRA!"
if errorlevel 1 (
  set "FALLO=1"
  exit /b 1
)
exit /b 0

rem ========================================================================
rem Toma las credenciales del destino (%1 = BACKEND o PANEL). Si no hay
rem valores propios de ese destino, usa los generales.
:credenciales
set "H=!FTP_HOST_%1!"
set "U=!FTP_USUARIO_%1!"
set "P=!FTP_PASSWORD_%1!"
set "PA=!FTP_PASSWORD_ARCHIVO_%1!"
set "E=!FTP_ESQUEMA_%1!"
set "PT=!FTP_PUERTO_%1!"
if not defined H  set "H=!FTP_HOST!"
if not defined U  set "U=!FTP_USUARIO!"
if not defined P  set "P=!FTP_PASSWORD!"
if not defined PA set "PA=!FTP_PASSWORD_ARCHIVO!"
if not defined E  set "E=!FTP_ESQUEMA!"
if not defined PT set "PT=!FTP_PUERTO!"
if not defined E  set "E=ftpes"
if not defined PT set "PT=21"
exit /b 0

rem ========================================================================
rem Sincroniza una carpeta local contra el FTP.
rem   %1 carpeta local   %2 carpeta remota   %3 mascara   %4 switches extra
:sincronizar
if not defined H (
  echo [ERROR] Falta FTP_HOST en publicar.env
  exit /b 1
)
if not defined U (
  echo [ERROR] Falta FTP_USUARIO en publicar.env
  exit /b 1
)
if not defined P if not defined PA (
  echo [ERROR] Falta FTP_PASSWORD ^(o FTP_PASSWORD_ARCHIVO^) en publicar.env
  exit /b 1
)
set "OPCIONES=-criteria=either"
if defined SIMULAR set "OPCIONES=!OPCIONES! -preview"
if not "%~4"=="" set "OPCIONES=!OPCIONES! %~4"
rem set sin comillas externas: asi el ^| de la mascara queda protegido por
rem las comillas internas y no lo interpreta cmd como tuberia.
if not "%~3"=="" set OPCIONES=!OPCIONES! -filemask="%~3"

rem El guion lleva la clave en claro: se escribe en %TEMP% y se borra al salir.
set "GUION=%TEMP%\vida-publicar-%RANDOM%.txt"
> "%GUION%" echo option batch abort
>>"%GUION%" echo option confirm off
if defined PA (
  >>"%GUION%" echo open !E!://!H!:!PT!/ -username="!U!" -password="!PA!" -passwordsfromfiles -passive=on
) else (
  >>"%GUION%" echo open !E!://!H!:!PT!/ -username="!U!" -password="!P!" -passive=on
)
>>"%GUION%" echo synchronize remote !OPCIONES! "%~1" "%~2"
>>"%GUION%" echo exit

"%WINSCP%" /ini=nul /script="%GUION%"
set "RES=!ERRORLEVEL!"
del "%GUION%" >nul 2>&1
if not "!RES!"=="0" echo [ERROR] WinSCP termino con codigo !RES!: no se publico esta parte.
exit /b !RES!
