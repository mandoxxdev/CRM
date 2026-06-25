# Solução para Erro de Proxy (ECONNREFUSED)

## Problema Identificado

O servidor backend não estava iniciando devido a um erro no código: a função `rateLimit` estava sendo usada antes de ser definida.

## Correções Aplicadas

### 1. Correção do Erro de Inicialização do Servidor
- **Problema**: A função `rateLimit` era chamada na linha 21, mas só era definida na linha 1400
- **Solução**: Movida a definição da função `rateLimit` para antes de seu uso (logo após as constantes do app)
- **Arquivo**: `server/index.js`

### 2. Aviso de Depreciação `util._extend`
- **Problema**: Aviso de depreciação do Node.js sobre `util._extend`
- **Causa**: Dependência antiga (provavelmente `react-scripts` ou outra)
- **Status**: Aviso inofensivo, não afeta a funcionalidade
- **Nota**: Pode ser ignorado ou corrigido atualizando as dependências

## Como Iniciar o Sistema

### Opção 1: Usando o script PowerShell
```powershell
.\iniciar.ps1
```

### Opção 2: Usando o script Batch
```cmd
iniciar.bat
```

### Opção 3: Manualmente
1. Abra um terminal e execute:
   ```powershell
   cd server
   npm run dev
   ```

2. Em outro terminal, execute:
   ```powershell
   cd client
   npm start
   ```

## Verificar se o Servidor Está Rodando

Execute o script de verificação:
```powershell
.\verificar_servidor.ps1
```

Ou teste manualmente:
```powershell
Invoke-WebRequest -Uri "http://localhost:5000/health"
```

## Portas Utilizadas

- **Backend**: `http://localhost:5000`
- **Frontend**: `http://localhost:3000`

## Próximos Passos

1. Inicie o servidor backend primeiro
2. Aguarde alguns segundos para o servidor inicializar completamente
3. Inicie o frontend
4. O frontend se conectará automaticamente ao backend através do proxy configurado

## Notas

- O servidor precisa estar rodando antes do frontend
- Se ainda houver erros de conexão, verifique se a porta 5000 não está sendo usada por outro processo
- O aviso de depreciação `util._extend` não impede o funcionamento do sistema
