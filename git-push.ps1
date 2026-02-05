# Script PowerShell para push automático no GitHub
# Execute: .\git-push.ps1

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Enviando alterações para o GitHub" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Verificar se estamos em um repositório Git
try {
    $null = git rev-parse --git-dir 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERRO] Não é um repositório Git!" -ForegroundColor Red
        Write-Host "Execute: git init" -ForegroundColor Yellow
        Read-Host "Pressione Enter para sair"
        exit 1
    }
} catch {
    Write-Host "[ERRO] Git não está instalado ou não está no PATH" -ForegroundColor Red
    Read-Host "Pressione Enter para sair"
    exit 1
}

# Verificar se há alterações
$hasChanges = $false
$status = git status --porcelain
if ($status) {
    $hasChanges = $true
}

if (-not $hasChanges) {
    Write-Host "[INFO] Nenhuma alteração para enviar." -ForegroundColor Yellow
    Read-Host "Pressione Enter para sair"
    exit 0
}

# Mostrar status
Write-Host "[INFO] Alterações detectadas:" -ForegroundColor Green
git status --short
Write-Host ""

# Adicionar alterações
Write-Host "[1/3] Adicionando alterações..." -ForegroundColor Cyan
git add .
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERRO] Falha ao adicionar arquivos!" -ForegroundColor Red
    Read-Host "Pressione Enter para sair"
    exit 1
}

# Criar commit
Write-Host "[2/3] Criando commit..." -ForegroundColor Cyan
$mensagem = Read-Host "Digite a mensagem do commit (ou Enter para usar data/hora)"
if ([string]::IsNullOrWhiteSpace($mensagem)) {
    $mensagem = "Atualização: $(Get-Date -Format 'dd/MM/yyyy HH:mm')"
}

git commit -m $mensagem
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERRO] Falha ao criar commit!" -ForegroundColor Red
    Read-Host "Pressione Enter para sair"
    exit 1
}

# Enviar para GitHub
Write-Host "[3/3] Enviando para o GitHub..." -ForegroundColor Cyan
git push origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "[AVISO] Tentando com branch 'master'..." -ForegroundColor Yellow
    git push origin master
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "[ERRO] Falha ao enviar para o GitHub!" -ForegroundColor Red
        Write-Host ""
        Write-Host "Possíveis soluções:" -ForegroundColor Yellow
        Write-Host "1. Verifique sua conexão com a internet"
        Write-Host "2. Configure autenticação (veja CONFIGURAR_GIT.md)"
        Write-Host "3. Execute: git pull origin main (para sincronizar)"
        Read-Host "Pressione Enter para sair"
        exit 1
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Alterações enviadas com sucesso!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Read-Host "Pressione Enter para sair"
