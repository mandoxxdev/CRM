# Instruções - Busca de CNPJ

## Problema: "Failed to fetch"

O erro "Failed to fetch" geralmente ocorre por:

1. **Problemas de CORS** - APIs bloqueando requisições do navegador
2. **API indisponível** - Servidor da API fora do ar
3. **Problemas de rede** - Conexão com internet instável

## Solução Implementada

O sistema agora tenta **3 APIs diferentes** em sequência:

1. **BrasilAPI** (https://brasilapi.com.br) - Principal, sem CORS
2. **ReceitaWS** (via proxy CORS) - Alternativa
3. **CNPJ.ws** - Fallback

## Como Funciona

1. Digite o CNPJ no campo
2. Clique em "Buscar"
3. O sistema tenta a primeira API
4. Se falhar, tenta a segunda
5. Se falhar, tenta a terceira
6. Se todas falharem, mostra mensagem de erro

## Teste com CNPJ Válido

Para testar, use um CNPJ válido:
- **11.222.333/0001-81** (CNPJ de exemplo)
- Ou qualquer CNPJ real de empresa brasileira

## Se Ainda Não Funcionar

### Opção 1: Verificar Console do Navegador
1. Abra o DevTools (F12)
2. Vá na aba "Console"
3. Veja qual erro específico aparece
4. Envie o erro para suporte

### Opção 2: Verificar Conexão
- Certifique-se de estar conectado à internet
- Tente acessar https://brasilapi.com.br no navegador
- Se não abrir, há problema de rede/firewall

### Opção 3: Usar Proxy CORS Manual
Se estiver em desenvolvimento local, pode configurar um proxy no `vite.config.ts`

### Opção 4: API Paga (Produção)
Para produção, considere usar uma API paga:
- **CNPJ.ws** (pago, mais confiável)
- **ReceitaWS Premium**
- **BrasilAPI Pro**

## Limitações das APIs Gratuitas

- **BrasilAPI**: Sem limite conhecido, mas pode ter rate limiting
- **ReceitaWS**: 3 consultas por minuto por IP
- **CNPJ.ws**: Pode ter limitações

## Solução Temporária

Se nenhuma API funcionar, você pode:
1. Preencher os dados manualmente
2. Usar um serviço de consulta CNPJ externo
3. Importar dados de uma planilha

---

**Nota**: O sistema está configurado para tentar automaticamente múltiplas APIs. Se todas falharem, verifique sua conexão com a internet.

