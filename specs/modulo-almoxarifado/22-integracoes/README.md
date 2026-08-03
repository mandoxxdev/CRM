# 22 — Integrações (Engenharia, Produção, Compras, Projetos e Custos)

> **Status:** ❌ — os módulos vizinhos existem mas estão vazios ou desconectados · **Spec original:** seções 23, 24, 25
> **Última atualização:** 2026-08-02

## Contexto importante

As integrações dependem de dados que hoje **não existem em produção**: `projetos` (0 registros), `pedidos_compra` (0), `producao_ops` (0), `ordens_servico` (1). O almoxarifado já tem as colunas de vínculo (`projeto_id`, `os_id`) — o gargalo é os outros módulos serem usados. Planejar por último (Etapa 14) e validar com o negócio o que vem primeiro.

## O que já existe

- Colunas de vínculo em movimentações, requisições, reservas, recebimentos (projeto/OS/cliente).
- Compras: fornecedores + rotas de pedidos/cotações (`index.js:19657-19892`), workflow de recebimento NF integrado a contas a pagar (feature 08), `itens_pedido_compra`, solicitações automáticas por mínimo (feature 18), aviso por e-mail a Compras de itens sem estoque.
- Produção (MES): módulo `services/producao/` com schema próprio (`producao_ops`) — sem ponte com almoxarifado.
- Relatório "consumo por OS" no dashboard (baseado no campo texto `os_referencia` — frágil).

## Checklist

### Engenharia (spec 23)
- [ ] Lista técnica/BOM como entidade (hoje não existe em lugar nenhum do sistema)
- [ ] Importar itens de BOM na requisição (feature 04)
- [ ] Revisão de BOM: identificar adicionados/removidos, recalcular reservas, avisar interessados, manter histórico
- [ ] Materiais equivalentes/substituições com aprovação da Engenharia

### PCP e Produção (spec 23)
- [ ] OP gera necessidade de materiais → reserva automática (feature 07)
- [ ] Kit de produção por OP (feature 05)
- [ ] Consumo planejado × real por OP
- [ ] Devolução e perdas apontadas na OP (feature 12)
- [ ] Entrada de subconjunto/item fabricado internamente (feature 08)
- [ ] Encerramento da OP reconcilia materiais

### Compras (spec 24)
- [ ] Solicitação de compra a partir da falta (parcial — feature 18)
- [ ] Comprador vê disponível/reservas/consumo/último preço na tela de compra
- [ ] Acompanhamento de pedido e prazo com alerta de atraso
- [ ] Divergência e rejeição da Qualidade informadas ao comprador (features 08/09)

### Projetos e custos (spec 25)
- [ ] Centro de custo como entidade + vínculo obrigatório conforme tipo de movimento (feature 03)
- [ ] Custo do projeto atualizado a cada saída/devolução (custo médio × quantidade)
- [ ] Comparativos: previsto × consumido, comprado × utilizado, reservado × entregue, sobras/perdas por projeto
- [ ] Fase do projeto no vínculo

## Regras essenciais + testes de API exigidos

| Regra | Teste |
|-------|-------|
| Saída vinculada a projeto atualiza custo do projeto | `saida atualiza custo consumido do projeto` |
| Devolução estorna custo do projeto | `devolucao reduz custo consumido` |
| Revisão de BOM recalcula reservas | `nova revisao ajusta reservas dos itens alterados` |
| Encerramento de OP bloqueia novos consumos nela | `consumo em OP encerrada falha` |

## Dependências

- Praticamente todas as features anteriores; e maturidade dos módulos Compras/Produção/Projetos fora do almoxarifado.
