# Estimativa 2026-10-30 — Compras: NCM/peso no pedido pré-carregado pela Reposição

Pendência declarada na Etapa 192 ("O que a etapa NÃO cobre"): `PedidoCompraForm.js` pré-carrega o item de `?material=` sem consulta,
porque o Compras não tem porta de material por id; NCM e peso nascem vazios na tela (o servidor completa ao salvar). Correção só de tela:
com `?codigo=`, consultar a busca que já existe (`GET /compras/materiais?search=<codigo>`) e copiar `ncm` (até 10, como RN-192.09/X4) e
`peso_unitario` do material de **mesmo id**. Sem `codigo`, ou sem achar, fica como hoje.

| # | Tarefa | Porte | Análise | Execução | Teste e conferência | Informado | Execução medida | Realizado | Commits |
|---|---|---|---|---|---|---|---|---|---|
| 1 | NCM/peso no pedido da Reposição | mudança pequena | 15 min | 30 min | 30 min | 1h15 | ~3 min (ver abaixo) | 1h15 | `44ac519b`, `355d43e8` |

Medição no fechamento:
```
node .claude/skills/relatorio-semanal/scripts/horas.js --desde 2026-10-30 --ate 2026-10-31 --grupos "NCM Reposicao=NCM.*Reposicao|Reposicao.*NCM"
```

## Fechamento (2026-10-30)

O `horas.js` mediu ~3 min (o intervalo entre commits não pega o teste vermelho, a correção, o controle positivo, a suíte da tela
inteira — 208 suítes, 2865/2865 — e o build). Usada a execução estimada (30 min) + a parte do André estimada (45 min, não informada).
Realizado = 1h15.
