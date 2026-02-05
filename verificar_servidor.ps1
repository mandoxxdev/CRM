Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Verificando Status do Servidor" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Verificar se o Node.js está instalado
Write-Host "[1/4] Verificando Node.js..." -ForegroundColor Yellow
$nodeVersion = node --version 2>$null
if ($nodeVersion) {
    Write-Host "  ✓ Node.js instalado: $nodeVersion" -ForegroundColor Green
} else {
    Write-Host "  ✗ Node.js não encontrado!" -ForegroundColor Red
    exit 1
}

# Verificar se o servidor está rodando
Write-Host "[2/4] Verificando se o servidor está rodando..." -ForegroundColor Yellow
$serverProcess = Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*server*" -or $_.Path -like "*server*" }
if ($serverProcess) {
    Write-Host "  ✓ Servidor Node.js encontrado (PID: $($serverProcess.Id))" -ForegroundColor Green
} else {
    Write-Host "  ✗ Servidor não está rodando" -ForegroundColor Red
}

# Verificar se a porta 5000 está em uso
Write-Host "[3/4] Verificando porta 5000..." -ForegroundColor Yellow
$port5000 = Get-NetTCPConnection -LocalPort 5000 -ErrorAction SilentlyContinue
if ($port5000) {
    Write-Host "  ✓ Porta 5000 está em uso" -ForegroundColor Green
} else {
    Write-Host "  ✗ Porta 5000 não está em uso (servidor não está rodando)" -ForegroundColor Red
}

# Testar conexão com o servidor
Write-Host "[4/4] Testando conexão com o servidor..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:5000/health" -TimeoutSec 2 -ErrorAction Stop
    Write-Host "  ✓ Servidor respondendo: $($response.StatusCode)" -ForegroundColor Green
    Write-Host "  Resposta: $($response.Content)" -ForegroundColor Gray
} catch {
    Write-Host "  ✗ Não foi possível conectar ao servidor: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "SOLUÇÃO:" -ForegroundColor Yellow
    Write-Host "  Execute o script 'iniciar.ps1' ou 'iniciar.bat' para iniciar o servidor" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Pressione qualquer tecla para continuar..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
