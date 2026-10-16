# Almoxarifado — Etapa 122: a aprovação que falha não prende material, e o estado não mora na Auditoria (design)

> Origem: "Próxima tarefa detalhada — Etapa 122" do plano da 121 (**C254**, **C255** e o excedente da conferência, **D (121)**).
> Worktree `CRM-wt-e122`, branch `etapa-e122` (a partir da main `a0edfb70`). Numeração conferida com `grep -oE` em
> `docs/almoxarifado-novidades-por-etapa.md` (2026-10-16): última B **B787**, último C **C255**, última A **A69** → esta etapa
> **B788+**, **C256+**, **A70+**.

## Fase 0 — medido (sonda `server/tests/sonda/e122fase0.js`, não versionada)

Gancho em `db.run` que faz falhar **uma vez** o comando citado (molde `auditoriaDoAtoRequisicao.api.test.js`).

| # | Cenário | Hoje (medido) |
|---|---|---|
| 1 | `/aprovar` de requisição PENDENTE de 3 com saldo 10, o `UPDATE … SET status=?, aprovador_id…` falhando | **500** `{"error":"<msg do banco>"}`, status **PENDENTE**, **1 reserva ATIVA** |
| 2 | o mesmo, depois reaprovar | 200 TOTALMENTE_RESERVADA, 1 reserva ATIVA (não reserva em dobro — confirma a r2 da 121) |
| 3 | o mesmo, depois **rejeitar** (em vez de reaprovar) | 200 **REJEITADO com a reserva ATIVA** — () => 'o material fica preso para uma requisição morta (achado novo da Fase 0, **C256**) — *dizia "e nenhuma tela solta"; **estava errado**: a liberação manual em **Reservas** solta (Fase 5, r1)*' |
| 4 | `/aprovar-valor` de AGUARDANDO_APROVACAO_VALOR, o `UPDATE … WHERE status='APROVADO'` falhando | **500**, status **APROVADO** (gravado pelo serviço), 1 reserva ATIVA; repetir dá 400 (o status já não é AGUARDANDO_APROVACAO_VALOR) |
| 5 | aprovação automática com o `UPDATE` falhando | já tratada desde a 73: 201, PENDENTE, reservas desfeitas (`routes/almoxarifado.js` ~3768) |
| 6 | nota processada contra pedido `enviado` de 2 com a trilha `STATUS_AUTOMATICO_RECEBIDO` falhando → estorno da entrada | processar 200, pedido `recebido`; estorno 200, **pedido continua `recebido`** (deveria reabrir para `enviado`) |
| 7 | `finalizar_conferencia` com a trilha `FINALIZAR_CONFERENCIA` falhando → relatório *Qualidade por fornecedor* | 200 CONFERIDO_ALMOX; relatório **`itens_conferidos: 0`** |
| 8 | `/conferir` com dois itens acima do esperado (autorizado), a trilha do **2º** falhando | **500**, **nenhum item gravado** (2 e 2), e **a trilha do 1º gravada** — registro de um excedente que não aconteceu |

Varredura das leituras da Auditoria como estado (`grep auditoria_log_almoxarifado` em `services/` e `routes/`, fora de
`INSERT`/DDL): só as duas da C255 (`receiptService.destinoDaReabertura`, `reportService.relatorioQualidadeFornecedores`); o resto é
a tela de Auditoria (`extended.js`). Confere com a spec da 121.

## Decisões

- **D1 — C254, `/aprovar`: o `UPDATE` do status que lança desfaz as reservas desta chamada e relança.** Dentro da trava (o
  desfazer roda antes de soltar, CLAUDE.md). Resposta: a de hoje (500 com a mensagem do banco). Estado: PENDENTE sem reserva —
  repetir aprova. **Descartado:** responder 200 (o status não foi gravado); deixar como está (cenário 3: rejeitar prende o
  material para sempre).
- **D2 — C254, `/aprovar-valor`: qualquer falha depois do APROVADO gravado — o `UPDATE` e (Fase 2, I3) o pós-aprovação, a trava, a releitura — MANTÉM o que ficou reservado e responde 200 com o status gravado (`APROVADO`).** Aqui
  o ato — a liberação por valor — já está gravado pelo serviço antes da trava, e uma requisição APROVADO com reserva ATIVA é um
  estado legítimo (o recálculo da Etapa 76 parte de APROVADO e a separação/entrega usam a reserva). O que falhou é só o rótulo
  "reservada". Log (neutro — sem saldo não há reserva, Fase 2, M1): *"[almoxarifado-aprovar-valor] A requisição ⟨id⟩ foi liberada por valor e
  fica APROVADO; o status pós-aprovação não foi gravado: ⟨msg⟩"*. **Descartado:** desfazer e responder 500 (a requisição ficaria aprovada **sem** o hold — o defeito que a
  Task 6 da Etapa 4 fechou —, e repetir dá 400); desfazer e responder 200 (o mesmo sem hold). Mesma lógica da B784: o ato
  feito não responde erro.
- **D3 — C256 (legado do cenário 3):** a **A70** acha reservas ATIVA de requisições PENDENTE, REJEITADO ou CANCELADO, ou com `ativo = 0` (*dizia `CANCELADA`; estava errado — o status é `CANCELADO`, Fase 2, I2*). O
  rejeitar não passa a soltar reserva (a de uma PENDENTE só existe pelo defeito; mexer no rejeitar é outra porta) — declarado.
- **D4 — C255a: o "fechado automaticamente" vira coluna do pedido, `pedidos_compra.fechado_automaticamente_de TEXT`**, escrita
  **no mesmo `UPDATE`** que muda o status — o único jeito de não ter segunda escrita que possa falhar sem transação:
  - o fechamento automático (`fecharPedidosCompletos`) grava `LOWER(COALESCE(status,''))` (o status de antes, o SQLite avalia
    com os valores antigos);
  - a reabertura do estorno lê a coluna (`destinoDaReabertura`), grava o destino e **limpa** a coluna no mesmo `UPDATE`, com
    `AND fechado_automaticamente_de IS NOT NULL` no `WHERE` (atômico contra uma mudança manual no meio);
  - a mudança manual do Compras (`alterarStatusPedido`, **core**) limpa a coluna no mesmo `UPDATE` **quando o status muda**
    (`CASE WHEN LOWER(COALESCE(status,'')) = LOWER(?) THEN coluna ELSE NULL END` — o PATCH que reescreve o mesmo valor não é
    decisão nova, como a trilha de hoje);
  - destino: a coluna, se for um de `STATUS_REABERTURA`; senão `pendente` (o mesmo de hoje para a trilha ilegível).
  As trilhas (`STATUS_AUTOMATICO_RECEBIDO`, `STATUS_AUTOMATICO_REABERTO`, `STATUS_MANUAL_ALTERADO`) continuam gravadas, como
  rastro. **Core × módulo (letra B, B788):** a coluna é na tabela do Compras e o `alterarStatusPedido` do Compras ganha uma
  expressão no `UPDATE`. **Descartado:** tabela do módulo `pedido_fechamento_automatico` (segunda escrita, a mesma brecha da
  Auditoria — e o PATCH manual teria de apagá-la do mesmo jeito, mexendo no core); manter a trilha como estado (a C255).
  **Reversível:** coluna nula, aditiva; voltar o código deixa a coluna ignorada.
  - **Onde a coluna nasce:** em `ALTERS_PEDIDOS_COMPRA` (`index.js`, no callback do CREATE — o padrão do primeiro boot) **e** por
    `safeAlter` no `initSchema` do módulo quando a tabela existe (o harness e a ordem do boot); o stub do harness
    (`testApp.js`) ganha a coluna.
  - **Legado:** migração com ledger `backfill_pedido_fechado_automaticamente` (no `initSchema`, se a tabela existe): para cada
    pedido `recebido` com a coluna nula cuja **última** trilha de status é `STATUS_AUTOMATICO_RECEBIDO`, grava o
    `dados_anteriores.status` dela (ilegível → `pendente`). Re-executar (ledger perdido) é quase inofensivo: só pega o pedido
    cuja última trilha é a automática — depois do deploy todo fechamento grava a coluna. Ledger e não "só quando a coluna nasce"
    (`jaExistia`): em produção a coluna nasce pelo `index.js` antes do `initSchema`, e o backfill nunca rodaria.
- **D5 — C255b: `recebimentos_material_almoxarifado.conferencia_finalizada_em DATETIME`**, gravada no mesmo `UPDATE` do gesto
  *Finalizar Conferência* (`avancarWorkflow`, `finalizar_conferencia`, `COALESCE(coluna, CURRENT_TIMESTAMP)` — a primeira
  finalização fica). O relatório lê a coluna. Só o gesto grava: o `/conferir` com status CONFERIDO_ALMOX e o `encaminhar_compras`
  de RECEBIDO não contam (a régua de sempre do relatório). **Legado:** ledger `backfill_conferencia_finalizada_em`: preenche com
  o `MIN(created_at)` da trilha `FINALIZAR_CONFERENCIA` (re-executar é inofensivo). Tabela do módulo — sem questão de core.
  **Descartado:** contar por status ≥ CONFERIDO_ALMOX (o relatório já descartou na 67: o `/aprovar` e o `encaminhar_compras`
  pulam a conferência).
- **D6 — o excedente na conferência (D (121)):** `assertExcedentePermitido` passa a só **decidir** (recusa 400/403 antes de
  qualquer escrita, como hoje) e **devolver** os excedentes; as duas portas (`/conferir` e `/fiscal`) gravam a trilha de cada
  item **logo depois do `UPDATE` daquele item**, por `registrarAuditoriaDoAto` (não-fatal). Assim: a trilha nunca existe sem o ato
  (cenário 8), e a falha dela não derruba o ato (B784). **Isto inverte a RN-14 (conferência) da Etapa 121**, que afirmava "fica
  fatal de propósito" — a razão dela era "a trilha roda antes do UPDATE"; com a trilha depois, a razão cai. O teste da 121 é
  reescrito dizendo isso. **Descartado:** um `INSERT` multi-linha antes do ato (tudo ou nada, mas continua sendo registro de um
  ato que pode não acontecer — a razão da B784 para não gravar antes); acumular e gravar no fim do laço (um item que falha no meio
  deixaria os anteriores gravados sem trilha).

## Fora de escopo (depende do P.O. ou é outra porta)

B755, B761/C239, C224, o resto da C225, C228, C219, C230, o reparo da C246; o rejeitar soltando reserva (D3); a PUT do pedido
(`atualizarPedido`) não limpa a coluna — inalcançável: ela recusa pedido com recebimento, e todo pedido fechado automaticamente
tem (declarado em D).
