# Script PowerShell para fazer upload da imagem de rodapé
# Uso: .\upload_rodape.ps1 <caminho_da_imagem>

param(
    [Parameter(Mandatory=$false)]
    [string]$ImagePath = "server\rodape.jpg"
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Upload de Imagem de Rodapé" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Verificar se a imagem existe
if (-not (Test-Path $ImagePath)) {
    Write-Host "❌ Erro: Imagem não encontrada em: $ImagePath" -ForegroundColor Red
    Write-Host ""
    Write-Host "📝 Uso: .\upload_rodape.ps1 <caminho_da_imagem>" -ForegroundColor Yellow
    Write-Host "   Exemplo: .\upload_rodape.ps1 .\server\rodape.jpg" -ForegroundColor Yellow
    Write-Host "   Ou coloque a imagem como 'rodape.jpg' na pasta server/" -ForegroundColor Yellow
    exit 1
}

Write-Host "📁 Arquivo encontrado: $ImagePath" -ForegroundColor Green
Write-Host "📤 Iniciando upload..." -ForegroundColor Yellow
Write-Host ""

try {
    # Criar FormData
    $boundary = [System.Guid]::NewGuid().ToString()
    $fileBytes = [System.IO.File]::ReadAllBytes((Resolve-Path $ImagePath))
    $fileName = [System.IO.Path]::GetFileName($ImagePath)
    
    # Construir o corpo da requisição multipart/form-data
    $bodyLines = @()
    $bodyLines += "--$boundary"
    $bodyLines += "Content-Disposition: form-data; name=`"footerImage`"; filename=`"$fileName`""
    $bodyLines += "Content-Type: image/jpeg"
    $bodyLines += ""
    
    $bodyText = $bodyLines -join "`r`n"
    $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($bodyText)
    $bodyBytes += [System.Text.Encoding]::UTF8.GetBytes("`r`n")
    $bodyBytes += $fileBytes
    $bodyBytes += [System.Text.Encoding]::UTF8.GetBytes("`r`n--$boundary--`r`n")
    
    # Fazer a requisição
    $uri = "http://localhost:5000/api/proposta-template/footer-image-direct"
    
    $response = Invoke-RestMethod -Uri $uri -Method Post -ContentType "multipart/form-data; boundary=$boundary" -Body $bodyBytes
    
    Write-Host "✅ Upload realizado com sucesso!" -ForegroundColor Green
    Write-Host "📋 Resposta: $($response | ConvertTo-Json)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "🎉 A imagem de rodapé foi configurada!" -ForegroundColor Green
    Write-Host "✨ Ela aparecerá em todas as propostas geradas." -ForegroundColor Green
    
} catch {
    Write-Host "❌ Erro ao fazer upload:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "📋 Detalhes: $responseBody" -ForegroundColor Yellow
    }
    
    Write-Host ""
    Write-Host "💡 Dica: Certifique-se de que o servidor está rodando na porta 5000" -ForegroundColor Yellow
    exit 1
}
