@echo off
echo ============================================
echo  SplitPay - Setup Environment
echo ============================================
echo.
echo Script ini akan menginstall WSL2 dan
echo mempersiapkan Docker untuk proyek SplitPay.
echo.
echo JALANKAN SEBAGAI ADMINISTRATOR!
echo (Klik kanan - Run as Administrator)
echo.
echo ============================================
pause
echo.

:: Step 1: Enable WSL
echo [1/4] Menginstall Windows Subsystem for Linux (WSL2)...
wsl --install -d Ubuntu
echo.
echo Jika diminta, buat username dan password Ubuntu.
echo Setelah selesai, tutup terminal Ubuntu dan kembali ke sini.
echo.
echo NOTE: Proses ini mungkin butuh restart Windows.
echo Setelah restart, jalankan script ini LAGI untuk lanjut ke step 2.
echo.
pause

:: Step 2: Set WSL2 as default
echo [2/4] Setting WSL2 sebagai default...
wsl --set-default-version 2

:: Step 3: Start Docker Desktop
echo [3/4] Memulai Docker Desktop...
start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
echo.
echo Tunggu Docker Desktop sampai status "Running" (di system tray).
echo Bisa dicek dengan membuka Docker Desktop.
echo.
pause

:: Step 4: Start containers
echo [4/4] Menjalankan PostgreSQL + Redis...
cd /d "%~dp0"
docker compose up -d
echo.
echo Container berhasil dijalankan!
echo.
echo ============================================
echo  Langkah selanjutnya:
echo ============================================
echo.
echo 1. Buka terminal baru, lalu jalankan:
echo    cd "%CD%"
echo    pnpm install
echo    pnpm build
echo    pnpm migration:run
echo    pnpm start:dev
echo.
echo 2. Akses:
echo    API: http://localhost:3001/api/v1
echo    Swagger: http://localhost:3001/api/docs
echo.
pause
