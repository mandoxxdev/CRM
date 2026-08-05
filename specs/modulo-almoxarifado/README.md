# Módulo Almoxarifado — Planejamento Mestre

> **Spec original:** [2026-08-02-requisitos-modulo-almoxarifado.md](2026-08-02-requisitos-modulo-almoxarifado.md) (34 seções)
> **Última atualização:** 2026-08-05
> **Regra de ouro:** toda regra essencial de funcionamento nasce com teste de API. Nenhuma feature é marcada como ✅ sem teste passando.

## Como usar esta pasta

- Cada subpasta = **uma feature**. Dentro dela: `README.md` com status, checklist do que existe/falta, regras essenciais + testes exigidos, e dependências.
- Ao trabalhar numa feature em qualquer sessão: **abrir o README dela, atualizar os checkboxes ao concluir cada item e a data de atualização**. O checklist é a fonte da verdade do progresso.
- Quando uma feature entrar em desenvolvimento, escrever o plano detalhado de implementação (tarefas TDD passo a passo) em `docs/superpowers/plans/` e linkar no README da feature.
- Status: ✅ completo (com testes) · 🟡 parcial · ❌ ausente

## Mapa de features e status atual (2026-08-05)

| # | Feature | Backend | Frontend | Testes | Status |
|---|---------|---------|----------|--------|--------|
| 00 | [Fundação técnica](00-fundacao-tecnica/README.md) | ✅ | ✅ | ✅ | 🟡 quase completa (2026-08-03: Tasks 1-6 entregues; restam decisão SMTP e padrão de validação) |
| 01 | [Cadastros de materiais](01-cadastros-materiais/README.md) | 🟡 | 🟡 | 🟡 | 🟡 Etapa 2 entregue (2026-08-04): campos técnicos/reposição/controles/ABC/unidades, subfamílias (`parent_id`), auditoria de criação/edição, form em 6 seções; falta tabela de conversões, categorias hardcoded do front, `almoxarifadoApi.js` |
| 02 | [Localizações e endereçamento](02-localizacoes-enderecamento/README.md) | 🟡 | 🟡 | 🟡 | 🟡 Etapa 2 entregue (2026-08-04): multi-almoxarifado (entidade raiz + migração ledger), bloqueio/restrição de tipo aplicados no motor, exclusão com saldo bloqueada, consultas de vazias/sem-endereço; falta capacidade/peso enforcement, sugestão de localização, leitura por confirmação. **Decisão de negócio (2026-08-05): almoxarifado é área física de alocação dentro do mesmo site, não filial — o cliente tem uma única filial. Saldo global por material (sem recorte por almoxarifado) é intencional e NÃO é lacuna; não propor segregação de saldo nem seletor de almoxarifado em movimentação/requisição** |
| 03 | [Motor de estoque](03-motor-estoque/README.md) | ✅ | ✅ | ✅ | 🟢 Etapa 1 entregue (2026-08-04); 🟡 resta validação de vencido/lote reprovado, que depende da feature 10 |
| 04 | [Requisições](04-requisicoes/README.md) | 🟢 | 🟢 | 🟢 | 🟢 Etapa 3 entregue (2026-08-05): ciclo ponta a ponta rascunho→envio→aprovação→separação→retirada→entrega→confirmação→encerramento; entrega/estorno via motor de estoque; máquina de estados explícita; falta reservas (Etapa 4), lote/série (10), anexos e importação de BOM/OP |
| 05 | [Separação e picking](05-separacao-picking/README.md) | 🟡 | 🟡 | 🟡 | 🟡 básico |
| 06 | [Motor de aprovações](06-aprovacoes/README.md) | 🟡 | 🟡 | 🟡 | 🟡 Etapa 3 entregue (2026-08-05): segregação (solicitante não aprova a própria), rejeição justificada, emergencial com justificativa, decisões auditadas; falta motor de regras configuráveis por tipo/valor/quantidade/projeto (tabela `regras_aprovacao` + UI — fica para demanda real) |
| 07 | [Reservas de estoque](07-reservas/README.md) | 🟡 | ❌ | 🟡 | 🟡 sem UI |
| 08 | [Recebimento](08-recebimento/README.md) | 🟡 | 🟡 | 🟡 | 🟡 workflow NF ok |
| 09 | [Inspeção e qualidade](09-inspecao-qualidade/README.md) | 🟡 | ❌ | 🟡 | 🟡 embrião |
| 10 | [Lotes, séries e etiquetas](10-lotes-series-etiquetas/README.md) | 🟡 | ❌ | ❌ | ❌ lote é texto livre |
| 11 | [Transferências](11-transferencias/README.md) | 🟡 | ❌ | 🟡 | 🟡 sem trânsito |
| 12 | [Devoluções](12-devolucoes/README.md) | 🟡 | ❌ | 🟡 | 🟡 sem vínculo à saída |
| 13 | [Materiais de clientes](13-materiais-clientes/README.md) | 🟡 | ❌ | 🟡 | 🟡 sem UI |
| 14 | [Materiais em terceiros](14-materiais-terceiros/README.md) | ❌ | ❌ | ❌ | ❌ |
| 15 | [Retalhos, sobras e sucatas](15-retalhos-sucatas/README.md) | 🟡 | ❌ | 🟡 | 🟡 sem UI |
| 16 | [Ferramentas e calibração](16-ferramentas-calibracao/README.md) | 🟡 | ❌ | 🟡 | 🟡 sem calibração |
| 17 | [Inventário e contagem cíclica](17-inventario-contagem/README.md) | 🟡 | 🟡 | ❌ | 🟡 só inventário simples |
| 18 | [Reposição e estoque mínimo](18-reposicao-estoque-minimo/README.md) | 🟡 | 🟡 | 🟡 | 🟡 alertas ok |
| 19 | [E-mails e notificações](19-emails-notificacoes/README.md) | 🟡 | 🟡 | 🟡 | 🟡 sem fila/cobertura total |
| 20 | [Alertas operacionais](20-alertas/README.md) | 🟡 | ❌ | 🟡 | 🟡 2 de ~20 |
| 21 | [Relatórios e dashboards](21-relatorios-dashboards/README.md) | 🟡 | 🟡 | ❌ | 🟡 15 no back, 2 no front |
| 22 | [Integrações](22-integracoes/README.md) | ❌ | ❌ | ❌ | ❌ módulos vizinhos vazios |
| 23 | [Perfis, segurança e auditoria](23-perfis-seguranca-auditoria/README.md) | 🟡 | 🟡 | 🟡 | 🟡 auditoria não usada em prod |

## Ordem de desenvolvimento sugerida (etapas pequenas)

Cada etapa é pequena, independente e termina com testes passando. **Não pular a Etapa 0** — ela remove os riscos que quebrariam features existentes.

### Etapa 0 — Fundação (obrigatória primeiro) → pasta `00-fundacao-tecnica`
1. Harness de testes de API (supertest + app de teste + SQLite em memória).
2. Eliminar DDL duplicado (schema só em `services/almoxarifado/schema.js`).
3. Unificar movimentações: frontend passa a usar a v2 (com auditoria); v1 vira alias ou é aposentada.
4. `safeAlter` estrito + uso consistente do ledger de migrations.
5. Corrigir inconsistências de permissão conhecidas e tirar SMTP hardcoded do código.

### Etapa 1 — Motor de estoque confiável → `03-motor-estoque`
Saldo físico/reservado/bloqueado/disponível consistente; bloqueio de saldo negativo; estorno com motivo; livro de movimentações completo; vínculo estruturado a projeto/OS/centro de custo (colunas já existem).

### Etapa 2 — Cadastros completos → `01-cadastros-materiais` + `02-localizacoes-enderecamento`
Campos faltantes do material; subfamílias formais; unidades de compra/consumo + fator de conversão; decisão multi-almoxarifado; restrições de endereço.

### Etapa 3 — Requisições ponta a ponta → `04-requisicoes` + `06-aprovacoes`
Status faltantes; validações (quantidade > 0); confirmação de recebimento; encerramento; regras do motor de aprovação (dupla aprovação, solicitante não aprova a própria).

### Etapa 4 — Reservas com UI → `07-reservas`
Reserva automática pós-aprovação, liberação, expiração; integração com requisições.

### Etapa 5 — Recebimento + Inspeção → `08-recebimento` + `09-inspecao-qualidade`
Tipos de entrada; conferência física; quarentena e bloqueio efetivos no saldo.

### Etapa 6 — Lotes e séries → `10-lotes-series-etiquetas`
Tabela de lotes com validade/corrida; números de série; regras de saída (FEFO/vencido/reprovado); etiquetas com QR.

### Etapa 7 — Transferências e devoluções → `11-transferencias` + `12-devolucoes`
Estado "em trânsito"; devolução vinculada à saída original.

### Etapa 8 — Materiais de clientes e terceiros → `13-materiais-clientes` + `14-materiais-terceiros`
UI de materiais de cliente; remessas a terceiros com prazos e retornos.

### Etapa 9 — Retalhos e ferramentas → `15-retalhos-sucatas` + `16-ferramentas-calibracao`
UI de sobras; baixa dimensional; calibração com vencimento.

### Etapa 10 — Inventário avançado → `17-inventario-contagem`
Contagem cega, recontagem, tolerância, aprovação de ajuste, acuracidade.

### Etapa 11 — Reposição e compras → `18-reposicao-estoque-minimo`
Ponto de reposição calculado; sugestão de compra consolidada.

### Etapa 12 — Notificações completas → `19-emails-notificacoes` + `20-alertas`
E-mail em toda entrada/saída confirmada; fila com retry/dedupe/histórico; alertas restantes.

### Etapa 13 — Relatórios e indicadores → `21-relatorios-dashboards`
Tela de relatórios; indicadores gerenciais.

### Etapa 14 — Integrações → `22-integracoes`
Engenharia (BOM), Produção (OP), Compras, Projetos/custos — depende da maturidade dos outros módulos.

### Etapa 15 — Mobilidade (spec Fase 4)
Código de barras, coletores, app móvel, assinatura digital — planejar quando as etapas 1–7 estiverem estáveis.

## Critérios de aceite do módulo (spec seção 34)

O módulo só é considerado operacional quando TODOS estes itens forem verdade (feature responsável entre parênteses):

- [ ] Identificar onde está cada material (02, 03)
- [ ] Identificar quantidade física, reservada, bloqueada e disponível (03, 07, 09)
- [ ] Identificar quem movimentou, quando e para qual projeto/OS (03, 23) — nota Etapa 3 (2026-08-05): entrega/estorno de requisição via motor já grava `projeto_id`, `centro_custo_id` e `requisicao_id` na movimentação (verificado em `requisicaoEntregaMotor.api.test.js`); OS continua só como texto livre (`os_referencia` na requisição, sem `os_id` estruturado) — critério ainda não 100% atendido
- [ ] Rastrear lote e número de série (10)
- [ ] Separar materiais próprios dos de clientes (13)
- [ ] Controlar materiais enviados a terceiros (14)
- [ ] Registrar entradas/saídas sem permitir exclusão do histórico (03, 23)
- [ ] E-mail automático de todas as entradas e saídas (19)
- [ ] Inventários e ajustes aprovados (17, 06)
- [ ] Histórico completo de qualquer material (03, 21)
- [ ] Custo e consumo por projeto (22)
- [ ] Bloquear materiais reprovados ou indisponíveis (09, 10)
- [ ] Relatórios gerenciais e de auditoria (21, 23)

## Débitos técnicos críticos (resumo — detalhes em `00-fundacao-tecnica`)

1. **Duas rotas de movimentação**: produção usa a v1 (sem auditoria, sem lote/localização). 24 movimentações reais e 0 linhas de auditoria comprovam.
2. **DDL duplicado** em `server/routes/almoxarifado.js:55-1068` e `server/services/almoxarifado/schema.js:68-193`.
3. **Sem testes de API reais**: `server/index.js` não exporta o app; testes chamam serviços direto.
4. **`safeAlter` engole qualquer erro** de ALTER (`schema.js:62`).
5. **SMTP hardcoded** em `server/index.js:2929-2934`.
6. **Permissão inconsistente** em `extended.js:357/367` (usa `role !== 'admin'` cru).
7. **`express-validator` instalado e não usado** — validação manual inconsistente (ex.: requisição aceita quantidade ≤ 0).

## Convenções de atualização

- Marcou um item feito → confirme que existe **teste passando** antes de marcar `[x]` em "Regras essenciais".
- Mudou o status geral de uma feature → atualizar também a tabela deste README.
- Descobriu requisito novo → adicionar no README da feature (nunca só na cabeça ou no chat).
- Toda sessão de trabalho começa lendo este README + o README da feature alvo.
