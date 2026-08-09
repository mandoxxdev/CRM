# 08 — Entrada e Recebimento de Materiais

> **Status:** 🟡 — workflow fiscal NF maduro, quarentena na entrada fechada (Etapa 5), **lote nasce aqui desde a Etapa 6**; faltam tipos de entrada, conferência física estruturada e etiqueta · **Spec original:** seção 8
> **Última atualização:** 2026-08-09 (Etapa 6 — o lote nasce no recebimento e `controle_certificado` deixou de ser `SELECT` morto)

## Objetivo

Todos os tipos de entrada da spec, conferência documental e física estruturadas, divergências, etiqueta, endereçamento na entrada e e-mail automático.

## O que já existe

- Tabelas `recebimentos_material_almoxarifado` (+25 colunas fiscais: chave NFe, CFOP, ICMS/IPI, frete, contas_pagar_id, etapa_atual) + itens (quantidade esperada/recebida, conferência, lote, valores) — `schema.js:419-502`.
- Workflow em 4 etapas com 11 status: Almoxarifado → Compras → Faturamento → Contas a Pagar (`receiptService.js`, 511 L; rotas `extended.js:149-211`: criar, conferir, inspecionar item, aprovar, workflow, fiscal, processar).
- Inspeção por item: `inspecoes_recebimento_almoxarifado` (conforme, divergências, certificado ausente, dano, ação).
- Front: `RecebimentosAlmoxarifado.js` (732 L) com o workflow completo; cross-links nos menus de Compras e Financeiro.
- Vínculo a pedido de compra e fornecedor (`itens_pedido_compra`, rotas aux).
- Testes de serviço: recebimento + workflow NF → contas a pagar.
- **Etapa 5 (2026-08-08):** entrada de material que exige inspeção deixou de ser barrada. Antes,
  `darEntradaEstoque` recusava aprovar o recebimento de item crítico sem inspeção prévia
  ("Item crítico #N requer inspeção") — o material não existia no sistema mesmo já estando
  fisicamente no galpão. Agora a entrada acontece sempre e o item que exige inspeção
  (`material_critico = 1` na ficha do material + config `inspecao_material_critico = '1'`, que
  já nasce ligada por padrão) entra **retido**: sobe o físico (`quantidade_atual`) e
  `quantidade_em_inspecao` juntos, via movimentação `QUARENTENA` vinculada ao recebimento
  (`recebimento_id`) — fora do disponível, mas dentro do físico. Item comum continua entrando
  direto no disponível, sem mudança (`4db5e11`).
- **Etapa 6 (2026-08-09):** **é aqui que o lote nasce.** Antes, `RecebimentosAlmoxarifado.js` não
  mencionava lote em lugar nenhum, embora a coluna `lote TEXT` existisse no item e o backend a
  repassasse ao motor — ou seja, o ponto em que um lote naturalmente nasce (a NF do fornecedor) era
  justamente o que não conseguia registrá-lo. Agora:
  - o item de recebimento ganhou `lote_id`, `data_validade_lote` e `corrida_lote`
    (`schema.js:949-951`), preenchíveis na tela por três campos por item
    (`RecebimentosAlmoxarifado.js:518-525`, enviados em `171-173`) — `9406bff`;
  - `receiptService.darEntradaEstoque` (`receiptService.js:329-359`) chama
    `lotService.criarOuObterLote` **antes** do motor, herdando fornecedor, NF, corrida e validade,
    e passa `lote_id` para a movimentação `ENTRADA_COMPRA`. A criação fica dentro do `if (qtd > 0)`
    de propósito: item com quantidade zero não move estoque, então não cria lote — `64686b1`;
  - **`controle_certificado` deixou de ser flag morta.** `receiptService.js:314` fazia
    `SELECT … m.controle_certificado` e **nunca usava a coluna selecionada** — quem auditasse por
    `grep controle_certificado` achava aquela linha e concluía que a entrada verificava
    certificado. Não verificava. Agora, material com a flag ligada faz o lote **nascer
    `BLOQUEADO`** com motivo "Certificado do fornecedor nao anexado" (`receiptService.js:340`).
    A **entrada não é barrada** — barrar a entrada foi exatamente o erro corrigido na Etapa 5; o
    material entra fisicamente e é a **saída** que fica travada até o certificado chegar;
  - `POST /api/almoxarifado/lotes/:id/certificado` (`routes/almoxarifado.js:623`, perm.
    `receber_material`, `requirePermission` **antes** do multer, aceita PDF e imagem) anexa o
    arquivo e libera **só** o bloqueio que era de certificado — a pré-condição inteira mora dentro
    do `WHERE` de `lotService.liberarBloqueioPorCertificado`, porque decidir fora dele abria uma
    corrida que liberava lote `REPROVADO` por engano (`c11db85`).

  Duas ressalvas honestas: **não há tela que chame essa rota de certificado** depois do
  recebimento (ver pendência (a) da spec 10), e `recebimentos_material_itens_almoxarifado.lote_id`
  tem escritor mas ainda nenhum leitor.

## Checklist

### Backend
- [ ] Tipos de entrada (spec 8.1): materiais de cliente, consignado, retorno de industrialização/fornecedor/assistência, devolução da produção, transferência, fabricado internamente, sobra/retalho, ajuste, ferramenta, produto acabado — hoje o recebimento é só de NF de compra (os demais entram pelas features 11/12/13/14/15; aqui: campo `tipo_entrada` + validações por tipo). **Fora do escopo da Etapa 5** (design 2026-08-07): decisão explícita de deixar para quando houver demanda real de um tipo específico.
- [ ] Recebimento parcial de pedido (validar suporte real + saldo pendente do pedido)
- [ ] Recebimento excedente só com autorização
- [ ] Conferência física estruturada (spec 8.3): contagem, pesagem, medição, checklist configurável por tipo de material. **Fora do escopo da Etapa 5**, mesma decisão acima.
- [ ] Fotos do recebimento (`anexos_documento_almoxarifado` entidade `recebimento`)
- [ ] Divergências: registro formal (tipo, quantidade, ação) — parcial na inspeção
- [ ] Ao aprovar: definir localização (sugestão da feature 02) + gerar etiqueta (feature 10) + **atualizar saldo via movimentação v2** — a entrada já passa pelo motor (`registrarMovimentacao`) desde antes da Etapa 5, e desde a Etapa 6 a movimentação vai com `lote_id` (`64686b1`). Continuam faltando a **etiqueta** (Etapa 6c, não a 6) e a sugestão de localização
- [x] Quarentena: material aguardando inspeção não entra no disponível (`quantidade_em_inspecao`) — **Etapa 5 (2026-08-08)**. Três movimentos novos no motor (`QUARENTENA`, `LIBERACAO_INSPECAO`, `REPROVACAO_INSPECAO`) com guarda atômica (`c37b67e`); entrada retida em vez de barrada (`4db5e11`). A decisão de inspeção em si (aprovar/reprovar/parcial) é da feature 09 — ver aquele README para o motor real usado na decisão (`DECISAO_INSPECAO`, não os dois tipos separados acima).
- [ ] E-mail automático na entrada confirmada (feature 19)
- [ ] Duplicidade: mesma NF+fornecedor não entra duas vezes

### Frontend
- [ ] Campos de conferência física + fotos
- [ ] Definição de localização na entrada
- [ ] Tipos de entrada no form

## Regras essenciais + testes de API exigidos

| Regra | Teste |
|-------|-------|
| NF duplicada (fornecedor+número) falha | `recebimento com NF duplicada falha` |
| Quantidade recebida > pedida sem autorização falha | `recebimento excedente sem autorizacao falha` |
| Material com necessidade de inspeção entra em quarentena (físico sobe, disponível não) | `item critico entra no fisico mas fora do disponivel` — `server/tests/api/recebimentoQuarentena.api.test.js` (`4db5e11`) |
| Aprovar recebimento de item crítico **não exige mais inspeção prévia** (mudança da Etapa 5 — antes lançava erro) | `aprovar recebimento de item critico NAO exige inspecao previa (mudanca da Etapa 5)` — mesmo arquivo |
| Item não crítico entra direto no disponível (regressão) | `item NAO critico entra direto no disponivel (regressao)` — mesmo arquivo |
| Retenção fica registrada no livro, vinculada ao recebimento | `a retencao aparece no livro como QUARENTENA vinculada ao recebimento` — mesmo arquivo |
| Processar recebimento gera movimentação de entrada com saldo anterior/posterior | `processar recebimento cria movimentacao v2 vinculada` |
| Processar recebimento cria o lote com os dados da NF, e a entrada fica vinculada a ele | `processar recebimento cria o lote com dados da NF` + `a entrada de estoque fica vinculada ao lote criado` — `server/tests/api/loteRecebimento.api.test.js` (`64686b1`) |
| Material com `controle_certificado` e sem anexo: lote nasce BLOQUEADO, mas o material **entra** | `sem certificado, o lote nasce BLOQUEADO: entra fisicamente mas a saida e recusada` — mesmo arquivo |
| Anexar certificado libera o lote — mas nunca um lote REPROVADO | `anexar o certificado libera o lote` + `lote REPROVADO continua bloqueado depois de anexar o certificado` — mesmo arquivo (`c11db85`) |
| Upload de certificado sem permissão não grava arquivo (permissão antes do multer) | `upload de certificado sem permissao nao grava arquivo` — mesmo arquivo |
| Workflow não pula etapas | `avancar etapa fora de ordem falha` |
| Recebimento parcial mantém pendência do pedido | `recebimento parcial atualiza saldo pendente do pedido` |

## Dependências

- 03 (movimentação v2) · 02 (localização na entrada) · 09 (inspeção — decide o que este README apenas retém) · 10 (**lote ligado na Etapa 6**; etiqueta continua ausente — Etapa 6c) · 19 (e-mail).
