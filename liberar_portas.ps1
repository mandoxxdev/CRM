# Script para liberar portas no Firewall do Windows
# Execute como Administrador

Write-Host "🔓 Liberando portas 3000 e 5000 no Firewall do Windows..." -ForegroundColor Cyan

# Liberar porta 5000 (Backend)
try {
    New-NetFirewallRule -DisplayName "CRM GMP - Backend Port 5000" -Direction Inbound -LocalPort 5000 -Protocol TCP -Action Allow -ErrorAction SilentlyContinue
    Write-Host "✅ Porta 5000 liberada" -ForegroundColor Green
} catch {
    Write-Host "⚠️ Porta 5000 já está liberada ou erro ao configurar" -ForegroundColor Yellow
}

# Liberar porta 3000 (Frontend)
try {
    New-NetFirewallRule -DisplayName "CRM GMP - Frontend Port 3000" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow -ErrorAction SilentlyContinue
    Write-Host "✅ Porta 3000 liberada" -ForegroundColor Green
} catch {
    Write-Host "⚠️ Porta 3000 já está liberada ou erro ao configurar" -ForegroundColor Yellow
}

Write-Host "`n✅ Configuração concluída!" -ForegroundColor Green
Write-Host "Agora você pode acessar o CRM de outros computadores na mesma rede." -ForegroundColor Cyan

# Mostrar IP atual
$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.IPAddress -like "192.168.*"}).IPAddress | Select-Object -First 1
if ($ip) {
    Write-Host "`n📡 Seu IP na rede: $ip" -ForegroundColor Yellow
    Write-Host "   Acesse de outros PCs usando: http://$ip:3000" -ForegroundColor Yellow
} else {
    Write-Host "`n⚠️ Não foi possível detectar o IP da rede" -ForegroundColor Yellow
    Write-Host "   Execute 'ipconfig' para ver seu IP" -ForegroundColor Yellow
}



