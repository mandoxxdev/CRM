# Script para testar se o servidor está respondendo
Write-Host "🔍 Testando conexão com o servidor..." -ForegroundColor Cyan

$ip = "192.168.1.152"
$port = 5000
$url = "http://${ip}:${port}/api/health"

Write-Host "`n📡 Testando: $url" -ForegroundColor Yellow

try {
    $response = Invoke-WebRequest -Uri $url -Method GET -TimeoutSec 5 -UseBasicParsing
    Write-Host "✅ Servidor está respondendo!" -ForegroundColor Green
    Write-Host "Status: $($response.StatusCode)" -ForegroundColor Green
    Write-Host "Resposta:" -ForegroundColor Cyan
    $response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 10
} catch {
    Write-Host "❌ Servidor não está respondendo" -ForegroundColor Red
    Write-Host "Erro: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "`nPossíveis causas:" -ForegroundColor Yellow
    Write-Host "1. Servidor não está rodando (execute: cd server; npm run dev)" -ForegroundColor Yellow
    Write-Host "2. Firewall bloqueando a porta $port" -ForegroundColor Yellow
    Write-Host "3. Servidor crashou (verifique os logs)" -ForegroundColor Yellow
    Write-Host "4. IP incorreto (verifique com: ipconfig)" -ForegroundColor Yellow
}

Write-Host "`n🔍 Testando localhost..." -ForegroundColor Cyan
try {
    $localUrl = "http://localhost:${port}/api/health"
    $localResponse = Invoke-WebRequest -Uri $localUrl -Method GET -TimeoutSec 5 -UseBasicParsing
    Write-Host "✅ Servidor responde em localhost!" -ForegroundColor Green
    Write-Host "   Se localhost funciona mas IP não, o problema é firewall/rede" -ForegroundColor Yellow
} catch {
    Write-Host "❌ Servidor não responde nem em localhost" -ForegroundColor Red
    Write-Host "   O servidor provavelmente não está rodando" -ForegroundColor Red
}



