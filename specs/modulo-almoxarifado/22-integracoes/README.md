# 22 — Integrações (Engenharia, Produção, Compras, Projetos e Custos)

> **Status:** 🟡 — a fatia de **Compras e custo por projeto foi entregue na Etapa 14** (range
> `b276dca..2de7944`, 2026-08-25); Engenharia/BOM e Produção/OP seguem **bloqueadas por
> dependência, com a medição escrita** (ver abaixo) · **Spec original:** seções 23, 24, 25
> **Última atualização:** 2026-08-25 — fechamento da Etapa 14

## Contexto importante

As integrações dependem de dados que hoje **não existem em produção**: `projetos` (0 registros),
`pedidos_compra` (0), `producao_ops` (0), `ordens_servico` (1). O almoxarifado já tem as colunas
de vínculo (`projeto_id`, `os_id`) — o gargalo é os outros módulos serem usados.

**Medição da Fase 0 da Etapa 14 (2026-08-24), que definiu o escopo real:** o módulo **Compras
está maduro** (pedidos, itens, `receiptService` com workflow até PROCESSADO integrado a contas a
pagar) e foi integrado de verdade; **BOM não existe em lugar nenhum do sistema** (nem tabela,
nem tela, nem spec de Engenharia implementada) e o **MES existe sem uso real** (schema próprio,
0 OPs). Integrar com isso seria stub fingindo feature — os blocos correspondentes ficaram
**bloqueados por dependência**, não prometidos.

## O que já existe

- Colunas de vínculo em movimentações, requisições, reservas, recebimentos (projeto/OS/cliente).
- Compras: fornecedores + rotas de pedidos/cotações (`index.js`), workflow de recebimento NF
  integrado a contas a pagar (feature 08), `itens_pedido_compra`, solicitações automáticas por
  mínimo (feature 18), aviso por e-mail a Compras de itens sem estoque.
- Produção (MES): módulo `services/producao/` com schema próprio (`producao_ops`) — sem ponte
  com almoxarifado.
- Relatório "consumo por OS" no dashboard: o dashboard usa `GET /relatorios/consumo-os`, que
  filtra por `m.os_id` (coluna real de vínculo, em `reportService.relatorioConsumoPorOS`).
  **Correção (2026-08-11):** a spec dizia "baseado no campo texto `os_referencia` — frágil", o
  que estava **impreciso**; o campo texto `os_referencia` sobrevive apenas no relatório de
  reservas (`relatorioReservadoPorOS`, como fallback ao lado de `os_id`).

## Checklist

### Engenharia (spec 23) — BLOQUEADO POR DEPENDÊNCIA (medido na Etapa 14)

Nenhum item abaixo foi iniciado, e a razão é a mesma para todos: **BOM não existe em lugar
nenhum do sistema** (medição da Fase 0, 2026-08-24). Quando Engenharia ganhar a entidade, isto
vira etapa própria.

- [ ] Lista técnica/BOM como entidade (hoje não existe em lugar nenhum do sistema)
- [ ] Importar itens de BOM na requisição (feature 04)
- [ ] Revisão de BOM: identificar adicionados/removidos, recalcular reservas, avisar interessados, manter histórico
- [ ] Materiais equivalentes/substituições com aprovação da Engenharia

### PCP e Produção (spec 23) — BLOQUEADO POR DEPENDÊNCIA (medido na Etapa 14)

Nenhum item iniciado: o **MES existe mas está sem uso** (`producao_ops` com 0 registros,
nenhuma tela consumindo — medição da Fase 0, 2026-08-24). Integrar reserva/kit/consumo com um
módulo que ninguém opera criaria contrato contra comportamento não exercitado.

- [ ] OP gera necessidade de materiais → reserva automática (feature 07)
- [ ] Kit de produção por OP (feature 05)
- [ ] Consumo planejado × real por OP
- [ ] Devolução e perdas apontadas na OP (feature 12)
- [ ] Entrada de subconjunto/item fabricado internamente (feature 08)
- [ ] Encerramento da OP reconcilia materiais

### Compras (spec 24) — o grosso ENTREGUE na Etapa 14

- [x] Solicitação de compra com ciclo de vida completo (`110d8ce` + fix `7afa90e`): a chegada
  da nota do pedido vinculado fecha a solicitação sozinha (RECEBIDA, gancho nos DOIS caminhos
  do recebimento — processamento da nota e aprovação direta), cancelar manual existe com
  justificativa obrigatória auditada, e vincular valida as duas pontas (pedido e solicitação).
  Aproximação declarada: fecha na PRIMEIRA nota do pedido, sem conferir quantidade (B22 das
  novidades). Solicitação finalizada é terminal — não ressuscita nem re-vincula (`2de7944`
  protege por teste).
- [x] Comprador vê disponível/reservas/consumo/último preço na tela de compra (`e78bc09` + fix
  `14feaf8` no endpoint; tela `56a6bfe` + fix `fac3f11`, merge `8145265`): painel "Ver
  contexto" na tela de Reposição com disponível/reservado/em terceiros, consumo médio diário,
  último custo de entrada por NF (par movimentação×item, última linha da NF vence — limitação
  do caso degenerado declarada no código) e solicitações abertas do material.
- [ ] Acompanhamento de pedido e prazo com alerta de atraso — **fora da Etapa 14 por decisão**:
  exigiria ler prazo prometido do pedido (dado que Compras hoje não preenche com disciplina) e
  criar alerta novo na fila; ficou para quando houver dado confiável de prazo.
- [ ] Divergência e rejeição da Qualidade informadas ao comprador — **fora da Etapa 14 por
  decisão**: o fluxo de quarentena (feature 09) registra a rejeição, mas não há canal
  comprador-específico; entra junto com os e-mails de compra quando o negócio pedir (D7 do
  design: a etapa não criou e-mail novo).

### Projetos e custos (spec 25) — a metade que os dados permitem, ENTREGUE

- [ ] Centro de custo como entidade + vínculo obrigatório conforme tipo de movimento —
  **bloqueado por dependência**: centro de custo não existe como entidade em nenhum módulo
  (medição da Fase 0).
- [x] Custo consumido/devolvido por projeto (`8bc58ec` + fix `6e8c36c`): relatório
  **custo-por-projeto** no registro de relatórios (consumido/devolvido/líquido/movimentações
  por projeto, filtro por período, exportação XLSX, gate `gerenciar_reposicao` — nasce
  protegido, decisão D6/B24). **A spec dizia "custo do projeto atualizado a cada
  saída/devolução"** sugerindo um acumulador materializado; **foi entregue diferente, e
  melhor**: o valor é **computado do livro de movimentações na leitura** (nada a manter
  sincronizado, estorno reflete sozinho). A consequência declarada: o custo aplicado é o
  **atual** do material, retroativo — o livro não guarda custo por movimento (nota do próprio
  relatório). Junto veio a **herança de projeto/OS na devolução** (returnService, nas duas
  pernas incluindo sucata) — sem ela o "devolvido" nunca fechava.
- [ ] Comparativos previsto × consumido, comprado × utilizado, reservado × entregue —
  **bloqueados**: "previsto" exige BOM/OP (inexistentes); comprado × utilizado exige vínculo
  item-de-pedido → movimentação que o schema não tem.
- [ ] Fase do projeto no vínculo — **bloqueado**: `projetos` não tem entidade de fase.

## Regras essenciais + testes de API exigidos

| Regra | Teste | Estado |
|-------|-------|--------|
| Saída vinculada a projeto entra no custo do projeto | a spec pedia `saida atualiza custo consumido do projeto`; **entregue como** `relatorioCustoProjeto.api.test.js` (consumido soma as saídas com projeto, réguas TIPOS_SAIDA/TIPOS_DEVOLUCAO) | ✅ `8bc58ec` |
| Devolução estorna custo do projeto | **entregue como** os testes de devolvido/líquido do mesmo arquivo (devolução herda o projeto e abate; líquido = consumido − devolvido, provado com quebrados 20.01−10.01) | ✅ `8bc58ec`/`2de7944` |
| Nota do pedido vinculado fecha a solicitação | `solicitacaoCicloVida.api.test.js` (fecha nos dois caminhos do recebimento; CANCELADA não ressuscita) + jornada `integracaoComprasJornada.api.test.js` (compra parcial de ponta a ponta) | ✅ `110d8ce`/`806b7bd`/`2de7944` |
| Revisão de BOM recalcula reservas | `nova revisao ajusta reservas dos itens alterados` | ⛔ bloqueado (BOM inexistente) |
| Encerramento de OP bloqueia novos consumos nela | `consumo em OP encerrada falha` | ⛔ bloqueado (MES sem uso) |

## Dependências

- Praticamente todas as features anteriores; e maturidade dos módulos
  Compras/Produção/Projetos fora do almoxarifado. **Compras provou maturidade e foi integrado
  (Etapa 14); Produção e Engenharia continuam sendo o bloqueio dos itens abertos.**
