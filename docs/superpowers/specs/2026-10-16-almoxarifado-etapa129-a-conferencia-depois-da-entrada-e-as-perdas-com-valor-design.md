# Almoxarifado — Etapa 129: a conferência depois da entrada e as perdas com valor (design)

> Origem: "Próxima tarefa detalhada — Etapa 129" do plano da 128
> (`docs/superpowers/plans/2026-10-16-almoxarifado-etapa128-o-tempo-do-recebimento-e-o-aviso-da-retencao.md`). Worktree
> `CRM-wt-e129`, branch `etapa-e129` (a partir da main `b1a48f11`). Plano:
> `docs/superpowers/plans/2026-10-16-almoxarifado-etapa129-a-conferencia-depois-da-entrada-e-as-perdas-com-valor.md`.

## Fase 0 — o que foi medido (sonda `server/tests/sonda/e129fase0.js`, não versionada, rodada sozinha sob a trava de máquina)

Pela rota real (`PUT /api/almoxarifado/recebimentos/:id/conferir`, `POST /:id/aprovar`), no código da main `b1a48f11`:

| Caso | Resultado medido |
|---|---|
| (a) *Aprovado* com item de 0 → conferir o item para 5 | **200**; o `/aprovar` seguinte recusa *"Recebimento já aprovado/processado"*; físico do item **0** para sempre |
| (b) *Aprovado* → conferir `REPROVADO` (+ item 0 → 5) | **200**; o `/aprovar` volta a dar **200** e o físico vai a **5** — uma segunda aprovação |
| (c) nota parcial (`EM_ENTRADA_NF`, um item entrou) → conferir `APROVADO` | **200**; o `/aprovar` recusa *"já aprovado/processado"*: o item que faltava nunca entra |
| (d) **NOVO** — *Recebido* (nada entrou) → conferir `APROVADO` | **200**; o `/aprovar` recusa; físico **0**: o recebimento fica *Aprovado* sem ter dado entrada nenhuma |
| (e) **NOVO** — conferir num id que não existe | **200** `{ success: true }` (nada gravado, mas o "sucesso" mente) |
| (f) conferir `BLOQUEADO` / `REPROVADO` / `PARCIALMENTE_APROVADO` → `/aprovar` | **200** e entrada normal (o `/aprovar` direto aceita qualquer status fora de *Processado*/*Aprovado*) |
| (g) **NOVO** — conferir com a marca de processamento viva (`processando_em` < 10 min) | **200** — a conferência grava no meio do processamento |

Quem chama o `/conferir` (medido): **a tela** só no painel de conferência, visível em `RECEBIDO`/`EM_CONFERENCIA`
(`RecebimentosAlmoxarifado.js` ~970/1182), **sem `status`** no payload; nenhum serviço de produção chama `conferirRecebimento`; os
testes — medidos por instrumentação (um `console.log` temporário com o status de origem, o de destino, quantos itens já entraram e a
marca, a suíte inteira rodada uma vez): ver o plano, "Fase 0".

A `conferencia_finalizada_em` (Etapa 122) só é gravada pelo gesto *Finalizar Conferência* (`/workflow`); o `/conferir` com `status:
CONFERIDO_ALMOX` não a grava (RN-11 da 122, prende isso) — não muda. O `assertExcedentePermitido` é hoje a primeira porta depois da
validação do payload; a guarda nova vem **antes** dele (a recusa de situação não depende de quem autoriza excedente).

## Decisões

1. **A conferência recusa depois da entrada** — *Processado*/*Aprovado*, ou qualquer item com `entrada_estoque_em`: **409** antes de
   qualquer gravação (status, itens, trilha de excedente, não conformidade, aviso). Molde: a RN-18 da 36 (recusar antes de gravar).
2. **A conferência nunca marca *Aprovado*** — o *Aprovado* é o status que a aprovação grava **depois** de dar entrada; marcado pela
   conferência, o recebimento fica aprovado sem estoque (d). `status: APROVADO` → **400**. Os outros resultados da conferência
   (`REPROVADO`, `PARCIALMENTE_APROVADO`, `BLOQUEADO`) continuam (nenhum mede dano: o `/aprovar` dá entrada a partir deles, (f)).
3. **A situação só muda a partir de um status de conferência** — `RECEBIDO`, `EM_CONFERENCIA`, `CONFERIDO_ALMOX`, `REPROVADO`,
   `PARCIALMENTE_APROVADO`, `BLOQUEADO`. De `EM_COMPRAS`, `ENCAMINHADO_FATURAMENTO` ou `EM_ENTRADA_NF` (o recebimento já seguiu o
   fluxo), `status` → **409**. A **quantidade** sem `status` nesses três continua aceita — o `/fiscal` aceita a mesma coisa nos mesmos
   status (é a porta que a tela usa no Faturamento), e nada entrou ainda.
4. **Recebimento inexistente → 404** *"Recebimento não encontrado"* (a literal das outras portas).
5. **Durante o processamento → 409** *"Esta nota já está sendo processada"* (a `LITERAL_EM_PROCESSAMENTO`, a mesma que o segundo
   *Processar* recebe).
6. **A corrida fica fechada no comando, não na leitura** — o `UPDATE` do status leva `AND status = <o lido>` e as condições das
   decisões 1 e 5; o `UPDATE` de cada item leva `AND entrada_estoque_em IS NULL` e um `EXISTS` do cabeçalho fora de
   *Processado*/*Aprovado* e sem marca viva. O processamento lê os itens **depois** de reivindicar a marca (`darEntradaEstoque`, sob a
   trava), então nada que a conferência grave entra depois da leitura dele. Um `UPDATE` que não casa por causa da corrida → 409 com a
   literal do estado novo. Descartado: segurar a trava por material na conferência (porta nova na trava, CLAUDE.md, e ela não põe saldo
   no disponível nem reserva) e reivindicar a marca de processamento (a segunda conferência simultânea levaria *"já está sendo
   processada"*, falso).
7. **A77** — a consulta dos recebimentos que a conferência mudou depois da entrada: item de recebimento *Processado*/*Aprovado* com
   quantidade e sem entrada, ou com a quantidade diferente da movimentação de entrada dele (`movimentacao_entrada_id`, desde a 71), e
   o *Aprovado* sem entrada nenhuma.
8. **Perdas com valor (feature 21)** — chave nova `perdas-por-motivo`: `PERDA` e `PERDA_TERCEIRO` não estornadas, por tipo e motivo
   (a mesma origem/motivo da `ajustes-por-motivo`), com lançamentos, materiais (quantidade não é somada: unidades diferentes), e o
   **valor pelo custo atual** (`custoUnitarioSql`, retroativo como o `custo-por-projeto` e a `sucata-financeiro` declaram); material de
   cliente fora (patrimônio alheio); gate `gerenciar_reposicao` (dado de custo, nasce fechado como o `custo-por-projeto`).
9. **`GET /api/usuarios/:id/grupos` — não muda nesta etapa** (medido: o `GET /api/usuarios/:id` e o `GET /api/usuarios` também só
   exigem token e já devolvem `role`, `is_superadmin` e `admin_modulos` de qualquer usuário; fechar só uma das três não fecha a
   leitura). Registrado na letra B para uma etapa do núcleo que feche as três juntas.
