# Script para verificar e configurar Node.js
Write-Host "=== Verificação do Node.js ===" -ForegroundColor Cyan
Write-Host ""

# Verificar se node está no PATH
$nodeInPath = Get-Command node -ErrorAction SilentlyContinue
if ($nodeInPath) {
    Write-Host "✅ Node.js encontrado no PATH!" -ForegroundColor Green
    Write-Host "Localização: $($nodeInPath.Source)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Versão do Node.js:" -ForegroundColor Cyan
    node --version
    Write-Host ""
    Write-Host "Versão do NPM:" -ForegroundColor Cyan
    npm --version
} else {
    Write-Host "❌ Node.js NÃO encontrado no PATH" -ForegroundColor Red
    Write-Host ""
    
    # Verificar locais comuns
    $commonPaths = @(
        "C:\Program Files\nodejs\node.exe",
        "C:\Program Files (x86)\nodejs\node.exe",
        "$env:ProgramFiles\nodejs\node.exe",
        "$env:LOCALAPPDATA\Programs\nodejs\node.exe"
    )
    
    Write-Host "Procurando Node.js em locais comuns..." -ForegroundColor Yellow
    $found = $false
    
    foreach ($path in $commonPaths) {
        if (Test-Path $path) {
            Write-Host "✅ Encontrado em: $path" -ForegroundColor Green
            $found = $true
            
            # Tentar executar
            Write-Host ""
            Write-Host "Tentando executar Node.js..." -ForegroundColor Cyan
            & $path --version
            
            Write-Host ""
            Write-Host "Para usar o Node.js, você pode:" -ForegroundColor Yellow
            Write-Host "1. Adicionar ao PATH manualmente" -ForegroundColor White
            Write-Host "2. Usar o caminho completo: & `"$path`"" -ForegroundColor White
            Write-Host ""
            Write-Host "Ou execute este comando como Administrador para adicionar ao PATH:" -ForegroundColor Cyan
            $nodeDir = Split-Path $path -Parent
            Write-Host "[Environment]::SetEnvironmentVariable(`"Path`", `$env:Path + `";$nodeDir`", [EnvironmentVariableTarget]::User)" -ForegroundColor Yellow
            break
        }
    }
    
    if (-not $found) {
        Write-Host "❌ Node.js não encontrado em nenhum local comum" -ForegroundColor Red
        Write-Host ""
        Write-Host "Por favor, instale o Node.js de: https://nodejs.org/" -ForegroundColor Yellow
        Write-Host "Certifique-se de marcar 'Add to PATH' durante a instalação" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "=== Fim da Verificação ===" -ForegroundColor Cyan
