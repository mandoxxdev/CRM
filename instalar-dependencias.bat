@echo off
echo ========================================
echo Instalando dependencias do CRM GMP
echo ========================================
echo.

echo Instalando dependencias principais...
call npm install react react-dom react-router-dom
echo.

echo Instalando dependencias de graficos e animacoes...
call npm install recharts framer-motion
echo.

echo Instalando banco de dados...
call npm install dexie
echo.

echo Instalando outras dependencias...
call npm install lucide-react date-fns
echo.

echo Instalando dependencias de desenvolvimento...
call npm install --save-dev @types/react @types/react-dom typescript vite @vitejs/plugin-react tailwindcss postcss autoprefixer
echo.

echo ========================================
echo Verificando instalacao...
echo ========================================
call npm list dexie
call npm list recharts
call npm list framer-motion
echo.

echo ========================================
echo Instalacao concluida!
echo ========================================
pause

