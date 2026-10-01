# Etapa 64 — a fila de separação do almoxarife

> Status: **Fase 0-1** (design + plano). Feature 05, item "tela de fila".

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
- **T1 (tronco)** — rota + serviço (`listarFilaSeparacao`). Testes `server/tests/api/filaSeparacao.api.test.js`:
  entra/não entra (status, nada a separar/entregar), ordem (urgência, data, FIFO), etapa (SEPARAR/CONFERIR/ENTREGAR),
  itens (a_separar, a_entregar, disponível, planejada), gate (perfil sem `separar_emitir` → 403).
- **T2 (galho, tela)** — RN-04.
- **T3** — verificação, Fase 5, fechamento.

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
