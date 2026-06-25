# Como Acessar o CRM de Outro Computador na Rede

## Passo a Passo

### 1. No Computador Servidor (onde o servidor está rodando):

1. **Descubra o IP do servidor:**
   - Abra o CMD (Prompt de Comando)
   - Execute: `ipconfig`
   - Procure por "IPv4" (exemplo: `192.168.1.100`)

2. **Verifique se o servidor está rodando:**
   - O servidor deve estar rodando na porta 5000
   - Execute no diretório `server/`: `npm run dev`

3. **Configure o Firewall do Windows:**
   - Abra o Firewall do Windows
   - Clique em "Configurações Avançadas"
   - Crie uma regra de entrada para a porta 5000 (TCP)
   - Crie uma regra de entrada para a porta 3000 (TCP) - se o frontend também estiver rodando no servidor

### 2. No Computador Cliente (outro PC na mesma rede):

1. **Configure a URL da API:**
   - Crie um arquivo `.env` na pasta `client/`
   - Adicione a linha:
     ```
     REACT_APP_API_URL=http://[IP_DO_SERVIDOR]:5000/api
     ```
   - Exemplo: `REACT_APP_API_URL=http://192.168.1.100:5000/api`

2. **Reinicie o frontend:**
   - Pare o servidor frontend (Ctrl+C)
   - Execute novamente: `npm start`

3. **Acesse no navegador:**
   - Se o frontend estiver rodando no servidor: `http://[IP_DO_SERVIDOR]:3000`
   - Se o frontend estiver rodando localmente: `http://localhost:3000`

### 3. Verificações de Problemas:

**Erro: "Banco de dados não está disponível"**
- Verifique se o arquivo `database.sqlite` existe na pasta `server/`
- Verifique as permissões da pasta `server/`
- O servidor precisa ter permissão de leitura/escrita na pasta

**Erro: "Servidor não está acessível"**
- Verifique se ambos os PCs estão na mesma rede
- Verifique se o firewall está bloqueando as portas
- Teste acessar `http://[IP_DO_SERVIDOR]:5000/api/health` no navegador do cliente

**Erro de CORS:**
- O servidor já está configurado com CORS habilitado
- Se ainda houver problemas, verifique se o servidor está rodando com `0.0.0.0`

### 4. Teste Rápido:

No navegador do computador cliente, acesse:
```
http://[IP_DO_SERVIDOR]:5000/api/health
```

Deve retornar:
```json
{
  "status": "ok",
  "message": "Servidor e banco de dados funcionando corretamente",
  "timestamp": "..."
}
```

Se retornar erro, o problema está no servidor ou firewall.



