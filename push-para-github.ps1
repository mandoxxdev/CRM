# Push para GitHub A PARTIR DESTA PASTA (CRM GMP - FINAL)
# Use este script para garantir que o server/index.js com rotas de familias vai pro repo.

$ErrorActionPreference = "Stop"
$projectPath = $PSScriptRoot
Set-Location $projectPath

Write-Host "Pasta do projeto: $projectPath" -ForegroundColor Cyan
if (-not (Test-Path "server\index.js")) {
    Write-Host "ERRO: server\index.js nao encontrado. Execute este script na raiz do projeto CRM." -ForegroundColor Red
    exit 1
}

$hasRoute = Select-String -Path "server\index.js" -Pattern "api/familias" -Quiet
if (-not $hasRoute) {
    Write-Host "ERRO: server\index.js nao contem rotas de familias. Codigo desatualizado." -ForegroundColor Red
    exit 1
}

Write-Host "Adicionando arquivos (incluindo server/index.js)..." -ForegroundColor Yellow
git add server/index.js
git add .
$status = git status --short
Write-Host $status
if (-not $status) {
    Write-Host "Nada para commitar. Tudo ja esta atualizado." -ForegroundColor Green
    exit 0
}

$msg = "Backend: rotas familias e deploy-version - " + (Get-Date -Format "dd/MM/yyyy HH:mm:ss")
git commit -m $msg
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Enviando para origin main..." -ForegroundColor Yellow
git push origin main
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "SUCESSO. Agora faca o Deploy no Coolify." -ForegroundColor Green
Write-Host "Depois teste: https://systemgmp.online/api/deploy-version" -ForegroundColor Cyan
