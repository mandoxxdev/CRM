# Etapa 64 — a fila de separação do almoxarife

> Status: **FECHADA (2026-10-01)** — T1 `fb06142`, T2 `88d943a`, fix-round da Fase 5 `42d7526`. Feature 05, item
> "Tela de listas de separação (fila de trabalho do almoxarife)". A próxima é a **Etapa 65** (fim deste arquivo).

## Fase 0 — medido (2026-10-01)

- `GET /api/almoxarifado/requisicoes` (`routes/almoxarifado.js` ~3080): filtros `status`, `urgencia`, `minha`
  (= **as minhas como solicitante**, não "minha fila"), `departamento`; ordem urgência (CRITICO, URGENTE, resto) e
  depois `created_at DESC` (**a mais nova primeiro**). Devolve só o cabeçalho da requisição — nada por item.
- O almoxarife trabalha nessa lista em `warehouseMode` (`RequisicoesList.js`) e abre requisição por requisição para
  saber o que separar.
- As Etapas 58–63 deixaram por item: separado/entregue, origem planejada (código/lote), divergência, troca; a Etapa 28
  deixou a conferência obrigatória (material crítico separado, conferente ≠ separador).
- `PODE_SEPARAR` / `PODE_ENTREGAR` em `requisitionStateMachine.js`.

## Regras de negócio

- **RN-01** — `GET /api/almoxarifado/fila-separacao` (gate `separar_emitir`): requisições com trabalho de almoxarife —
  status em `PODE_SEPARAR` com **algo a separar** (pendente de separação > 0 em algum item) **ou** em `PODE_ENTREGAR` com
  **algo a entregar** (separado − entregue > 0). Requisição sem trabalho não aparece (metade positiva no teste).
- **RN-02 (ordem)** — urgência (CRITICO, URGENTE, NORMAL), depois `data_necessidade` (mais cedo primeiro; sem data por
  último), depois `created_at` **mais antiga primeiro** (fila é FIFO — a lista geral é "mais nova primeiro", e não
  muda). Decisão reversível (letra B).
- **RN-03 (cada linha)** — `{ id, numero, status, urgencia, data_necessidade, solicitante_nome, setor, created_at,
  etapa: 'SEPARAR' | 'CONFERIR' | 'ENTREGAR', conferencia_pendente, itens: [{ item_id, material_codigo, material_nome,
  unidade, a_separar, a_entregar, disponivel, origem_separacao_codigo, lote_separacao_codigo, material_critico }] }`.
  `etapa`: SEPARAR se há algo a separar; senão CONFERIR se a conferência é obrigatória e não foi feita; senão ENTREGAR.
  `disponivel` é o mesmo da separação (com o hold da própria requisição).
- **RN-04 (tela)** — "Fila de separação" no módulo (menu do almoxarifado), com a ordem do servidor, um chip por etapa,
  os itens com o que falta, e o botão que abre a requisição na tela de sempre (sem nova regra de separar/entregar).
- Fila é **leitura**: nenhuma regra de separação/entrega muda.

## Tasks
- [x] **T1 (tronco)** — rota + serviço (`listarFilaSeparacao`). Testes `server/tests/api/filaSeparacao.api.test.js`:
  entra/não entra (status, nada a separar/entregar), ordem (urgência, data, FIFO), etapa (SEPARAR/CONFERIR/ENTREGAR),
  itens (a_separar, a_entregar, disponível, planejada), gate (perfil sem `separar_emitir` → 403). — `fb06142`
  (já no contrato revisto da Fase 2: `etapas[]`, `acionavel`, `separadores`, `posso_conferir`, `separavel`).
- [x] **T2 (galho, tela)** — RN-04: `FilaSeparacao.js` (rota `/almoxarifado/fila-separacao`, menu "Fila de separação"
  logo depois de "Requisições (almox.)"), `FilaSeparacao.test.js`. — `88d943a`
- [x] **T3** — verificação, Fase 5 (fix-round `42d7526`), fechamento (este commit de documentação).

## Fase 2 — revisão do plano: 2 críticos, 4 importantes, 5 menores → contrato revisto

- **CRÍTICO 1** — "algo a separar" pelo PENDENTE punha no topo, como SEPARAR, requisição em AGUARDANDO_COMPRA/ESTOQUE
  sem saldo — o separar recusa (`maxSeparar` = 0). → SEPARAR só com algum item **separável agora**; pendente sem saldo é
  **AGUARDANDO_SALDO** (não acionável, vai para o fim).
- **CRÍTICO 2** — uma etapa só escondia as outras (SEPARAR "para sempre" com item crítico na caixa). → **`etapas: []`**.
- **IMPORTANTE** — CONFERIR só em EM_SEPARACAO (o claim só confere ali); fora dela, **REABRIR_SEPARACAO** (C37).
  A linha diz **quem separou** e **`posso_conferir`** (quem separou não confere — antes clicava e tomava 403).
- **IMPORTANTE** — a fila NÃO chama `verificarBloqueioLiberacao` (ela ESCREVE: muda status e notifica): usa o gravado
  (`requer_aprovacao_valor` sem `data_aprovacao_valor`) → **APROVACAO_VALOR** no lugar de SEPARAR/ENTREGAR. A avaliação
  ao vivo continua no separar/entregar (declarado: a fila pode não ver um limite que mudou).
- **IMPORTANTE** — sem N+1: uma consulta de itens com `IN (...)`, a mesma conta de `carregarItensRequisicao`.
- Menores: `UPPER(urgencia)` (legado em minúsculo); sem data por último; `ativo`; itens sem nada a fazer fora da
  linha; `prioridade` fica fora da ordem (letra B); a fila paga só a "tela de listas de separação" — agrupamento por
  projeto/setor/localização e rota de picking continuam `[ ]` (dependem da lista como entidade); o "abrir" vai para
  `/almoxarifado/requisicoes?id=X` (o modo almoxarife; abre o detalhe, não o modal de separar — declarado).

### Contrato congelado — `GET /api/almoxarifado/fila-separacao` (gate `separar_emitir`)
`[{ id, numero, status, urgencia, data_necessidade, solicitante_nome, setor, created_at,
    etapas: ['SEPARAR'|'APROVACAO_VALOR'|'AGUARDANDO_SALDO'|'CONFERIR'|'REABRIR_SEPARACAO'|'ENTREGAR'],
    acionavel, conferencia_pendente, separadores: [{ id, nome }], posso_conferir,
    itens: [{ item_id, material_id, material_codigo, material_nome, unidade, a_separar, separavel, a_entregar,
              disponivel, origem_separacao_codigo, lote_separacao_codigo, material_critico }] }]`
Ordem: acionável primeiro; urgência (CRITICO, URGENTE, resto); data de necessidade (sem data por último); a mais
antiga primeiro.

## Divergências do plano na execução

- **O contrato congelado da Fase 2 ganhou três coisas na Fase 5** (ver a tabela abaixo): o item tem **`entregavel`**
  (o separado limitado ao disponível), a etapa nova **`CONFERENCIA_SEM_SAIDA`** (conferência pendente fora de
  `PODE_SEPARAR`, não acionável), e `REABRIR_SEPARACAO` passou a sair **só** em `PODE_SEPARAR`.
- **A Fase 2 dizia "a fila NÃO chama a avaliação de valor (ela ESCREVE) — usa o gravado". Estava errado em dois
  pontos.** (1) Quem escreve é `atualizarValorRequisicao` / `verificarBloqueioLiberacao`; `avaliarRequisicaoValor`
  (`requisitionValueApprovalService.js`) é **só leitura** (config + soma do valor). (2) O gravado nunca coincide com um
  status separável — quem grava o flag muda o status junto —, então `APROVACAO_VALOR` pelo gravado **nunca aparecia**, e o
  risco real (o limite baixar ou o custo subir depois) ficava de fora. O commit `fb06142` repetiu o descarte ("a
  avaliação escreve"); corrigido à vista aqui e na **B255**. A fila agora avalia **ao vivo** e continua sem escrever.
- **Custo da avaliação ao vivo:** uma consulta de configuração + uma de soma **por requisição sem aprovação de valor**
  na fila — os itens continuam numa consulta só (`IN`), mas a avaliação de valor é por requisição. Declarado (**D (64)**);
  a fila é curta (só requisições com trabalho) e é leitura.
- **T2:** a tela não reordena — separa só o grupo **"Aguardando"** (não acionáveis), preservando a ordem do servidor em
  cada grupo; a data de necessidade é formatada **sem `Date`** (`new Date('2026-10-05')` é UTC e em Brasília vira o dia
  anterior).

## Fase 5 — revisão adversarial do código (um revisor, só leitura)

| Achado | Classe | Como ficou |
|---|---|---|
| **ENTREGAR com o saldo já ido**: a separação não reserva; 10 em estoque, A e B separam 10, A entrega → a fila dizia "Entregar" para B e a entrega recusava | **Crítico** | `entregavel = min(separado − entregue, disponível)` por item; sem nada entregável, `AGUARDANDO_SALDO` (não acionável) — teste + sabotagem vermelha — `42d7526` |
| **"Separar de novo para conferir" em `PRONTA_PARA_RETIRADA`**: lá não há transição de volta à separação — beco sem saída | **Crítico** | `CONFERENCIA_SEM_SAIDA`, não acionável, chip "Conferência pendente — peça ao administrador" — `42d7526` |
| `APROVACAO_VALOR` pelo gravado nunca acontecia; o limite que baixa / custo que sobe fazia a fila dizer "Separar" e o separar recusar | Importante | Avaliação **ao vivo** só leitura (`avaliarRequisicaoValor`); com `data_aprovacao_valor`, não avalia — `42d7526` |
| Faltava teste da reserva da própria requisição (contar como separável) e da de outra (tirar do separável) | Importante | Teste novo, com as duas metades — `42d7526` |
| A fixture da tela mandava `APROVACAO_VALOR` como acionável (o servidor manda não acionável) | Importante (teste mentia) | Fixture corrigida — `42d7526` |
| Docblock de `listarSeparacoes` órfão desde a Etapa 63 (ficou em cima da função da 63) | Menor (escapou da 63) | Voltou para o lugar — `42d7526` |
| `data_necessidade` legada em `DD/MM/AAAA` ordena errado (comparação de texto) | Menor | Declarado (**D (64)**) |
| O menu "Fila de separação" aparece para todos com acesso ao módulo | Menor | Declarado (**D (64)**) — quem não tem `separar_emitir` vê o painel de permissão, nunca "fila vazia" |
| Item com série sem séries em estoque aparece como entregável | Menor | Declarado (**D (64)**) — a entrega pede as séries e recusa ali |
| "Abrir" abre o detalhe, não o modal de separar; sem agrupamento nem rota | Menor | Declarado (**D (64)**) |

Sabotagens: servidor 10 (T1) + 4 (Fase 5), todas vermelhas; tela 8 (T2) + 3 (Fase 5), todas vermelhas.

**Verificação no fix-round (medida):** `test:api` 241/241 arquivos, `test:almoxarifado` 42/42, `test:validation` 4/4,
`test:safealter` 3/3, `test:sqlite` 5/5; cliente 1028/1028 (`FilaSeparacao.test.js` 10/10); `CI=true` build limpo.
`filaSeparacao.api.test.js` 11/11.

## Retro (4 números)

1. **Rodadas de correção até verde:** 1 fix-round.
2. **Achados:** Fase 2 — 11 (2 críticos), todos reais, mudaram o contrato (`etapas[]`, SEPARAR só com separável).
   Fase 5 — 2 críticos + 3 importantes corrigidos, 4 declarados, 0 ruído.
3. **Paralelismo:** a tela (galho) depois do tronco commitado; sem retrabalho.
4. **Defeito que escapou da Etapa 63:** o docblock órfão de `listarSeparacoes` (cosmético).

**Lição:** uma tela de **leitura** que diz "faça X" herda todas as recusas de X. Os dois críticos da Fase 5 e o
crítico 1 da Fase 2 são o mesmo erro — a fila prometia um gesto que o gesto recusa (sem saldo, sem transição, sem
aprovação). Para cada chip acionável, o teste tem de provar que **o gesto correspondente passa** no mesmo estado.

## Próxima tarefa detalhada — Etapa 65: a troca de origem NA SEPARAÇÃO fica registrada (feature 05)

**Por que esta.** No "falta para 🟢" da 05 sobram: lista de separação como entidade, agrupamento/rota de picking, a
**troca registrada também na separação**, localização de kit e kits. A troca na separação é a de maior valor por
esforço: a Etapa 63 deixou a tabela de trocas (`substituicoes_origem_requisicao`) e o bloco "Substituições" prontos, e
hoje uma rodada que nomeia **outra origem** sobre separado ainda não entregue apaga a origem planejada **calada**
(**B237**, **B248**, **D (59)**: a segunda rodada feita sem mexer no "Sai de", que começa em automático, apaga a da
primeira sem aviso). Lista como entidade e rota dependem de uma entidade nova (escopo grande); kit exige estender
`TIPOS_LOCALIZACAO`.

**Fase 0 da 65 — medir antes de prometer:**
1. Onde a rodada decide apagar a planejada (`separarRequisicao` em `requisitionService.js`, a regra da **B237**) e o que
   ela sabe naquele ponto: a planejada anterior (endereço/lote), o separado pendente dela, a origem desta rodada.
2. Se `substituicoes_origem_requisicao` comporta uma troca **sem movimentação** (as colunas de id de movimentação são
   anuláveis?) e como distinguir separação de entrega (coluna `momento`/`origem_evento`? migração por `safeAlter`).
3. O que o bloco "Substituições" e a `RequisicoesList` mostram, para a linha nova dizer "na separação".
4. Se a janela de separação já sabe a planejada do item (para pedir o motivo como a de entrega pede).

**Contratos que não se reabrem:** a separação (tudo-ou-nada, rodada, origem por item, divergência — **B238**), a
entrega (origem estrita, séries, divisão da baixa, registro de troca — **B248 a B251**), a fila (leitura; não muda).

**Pontos de atenção.**
- Decidir (letra B, reversível) se a troca na separação **apaga** a planejada (como hoje, **B237**) ou **substitui** pela
  nova — a mudança da B237 muda de onde a entrega de um clique sai; medir os testes da Etapa 59 antes.
- O motivo deve ser opcional, como na entrega (**B250**) e na divergência (**B238**).
- Rodada em automático sobre planejada: é troca (o operador não disse de onde tirou) ou não é? Hoje apaga a planejada.
- Metade positiva no teste: rodada com a **mesma** origem não registra nada.
