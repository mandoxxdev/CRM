# Diagnóstico de Conexão - Acesso por IP

## Problema: Frontend detecta IP correto mas não consegue conectar

### Passo 1: Verificar se o servidor está rodando

No computador servidor, verifique se o servidor está rodando:
```bash
cd server
npm run dev
```

Você deve ver:
```
🚀 Servidor CRM GMP INDUSTRIAIS rodando na porta 5000
📊 API disponível em http://localhost:5000/api
🌐 Acesse de outros dispositivos usando o IP desta máquina na porta 5000
```

### Passo 2: Testar conexão localmente

No computador servidor, abra o navegador e acesse:
```
http://localhost:5000/api/health
```

Deve retornar:
```json
{
  "status": "ok",
  "message": "Servidor e banco de dados funcionando corretamente",
  "timestamp": "..."
}
```

### Passo 3: Testar conexão por IP (no servidor)

No computador servidor, abra o navegador e acesse:
```
http://192.168.1.152:5000/api/health
```

Se não funcionar, o problema é o firewall.

### Passo 4: Configurar Firewall do Windows

1. Abra o **Firewall do Windows com Segurança Avançada**
2. Clique em **Regras de Entrada** (Inbound Rules)
3. Clique em **Nova Regra...** (New Rule...)
4. Selecione **Porta** e clique em **Próximo**
5. Selecione **TCP** e **Portas específicas locais**: `5000`
6. Selecione **Permitir a conexão**
7. Marque todas as opções (Domínio, Privado, Público)
8. Dê um nome: "CRM GMP - Porta 5000"
9. Repita o processo para a porta **3000** (se o frontend também estiver no servidor)

### Passo 5: Testar do computador cliente

No computador cliente, abra o navegador e acesse:
```
http://192.168.1.152:5000/api/health
```

Se funcionar, o problema está resolvido. Se não funcionar:

1. Verifique se ambos os PCs estão na mesma rede
2. Verifique se o IP do servidor está correto (execute `ipconfig` no servidor)
3. Tente desabilitar temporariamente o firewall para testar

### Passo 6: Verificar logs do servidor

Se o servidor crashou, verifique os logs para ver o erro específico. Os erros mais comuns são:
- Banco de dados bloqueado
- Porta já em uso
- Erro de sintaxe no código

### Solução Rápida: Script PowerShell para liberar portas

Execute no PowerShell do servidor (como Administrador):
```powershell
.\liberar_portas.ps1
```

Ou execute os comandos manualmente:
```powershell
New-NetFirewallRule -DisplayName "CRM GMP Port 5000" -Direction Inbound -LocalPort 5000 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "CRM GMP Port 3000" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
```

### Verificar se o servidor está respondendo

No computador servidor, teste:
```bash
# Teste local
curl http://localhost:5000/api/health

# Teste por IP (substitua pelo seu IP)
curl http://192.168.1.152:5000/api/health
```

Se o primeiro funcionar mas o segundo não, o problema é o firewall.

