# Almoxarifado — Etapa 114: a requisição de material inativo não é aprovada (plano)

> Origem: "Próxima tarefa detalhada — Etapa 114" do plano da 113 (**C229**). Design com a Fase 0 medida:
> `docs/superpowers/specs/2026-10-15-almoxarifado-etapa114-requisicao-de-material-inativo-design.md`.
>
> **Numeração** (conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` em 2026-10-15): última B **B739**,
> último C **C229**, última A **A60**. Esta etapa: **B740+**, **C230+**, **A61+**. Worktree `CRM-wt-e114`, branch
> `etapa-e114` (a partir da main `22704e8c`); nenhuma outra etapa em paralelo.

> **Divergência registrada (Fase 2):** a revisão fresca do plano achou 7 pontos, nenhum que trava. **R1** — a E3 mandava
> quem separa (Almoxarife) "cancelar a requisição", gesto que só o solicitante faz (e com caixa ninguém), e o modal de
> separação pré-preenchia o item inativo com o máximo, então o Confirmar recusava a rodada inteira → a E3 manda "separar
> os outros itens com 0 neste" e o detalhe diz **0** de separável e de entregável para o item de material inativo
> (**RN-08**, nova). **R2** — a E1 mandava o Gestor (aprova, não edita material) reativar, e o aprovador de valor
> "rejeitar" (o gesto da fila de valor é o **Reprovar** — o `/rejeitar` só aceita PENDENTE) → a mensagem diz quem reativa
> (lido de `editar_material`) e a do `/aprovar-valor` termina em "reprove a liberação por valor" (**E1v**). **R3** — a
> ordem da releitura do RN-02 no plano estava ao contrário da implementação (status → gate → E1) → corrigida no texto e
> com cenário. **R4** — a posição da E3 entre as recusas da separação → congelada (RN-05). **R5/R6** — a janela do
> `recusarInativo: false` e o lembrete da pendente que não aprova mais → declarados em D (114). **R7** — o código ausente
> → fallback no contrato.

## Regras de negócio

"Item pendente" = `quantidade_solicitada − entregue` (arredondado a 6 casas) > 0 — a régua de `pendenteEntrega`.
"Inativo" = `ativo IS NULL OR ativo <> 1` (a leitura do motor: NULL é inativo).

- **RN-01 — o `/aprovar` recusa requisição com item pendente de material inativo.** `PUT /requisicoes/:id/aprovar` de
  requisição `PENDENTE` com ≥ 1 item pendente de material inativo → **400 E1**; nada reservado (nem dos itens ativos), status
  continua `PENDENTE`, sem auditoria `APROVACAO`. Vale com o material zerado (o caminho oficial) e com saldo (legado).
  A conferência roda **dentro** da seção da trava (`reservarItensAprovacao`, depois da conferência `TRAVA_INCOMPLETA` e
  antes de reservar qualquer item). *Cenários:* inativo com saldo 5 → E1, `PENDENTE`, `reservas` vazio no banco; inativo
  zerado → E1 (não `AGUARDANDO_ESTOQUE`); dois itens (ativo com 5 + inativo) → E1 e o ativo **sem** reserva; dois materiais
  inativos → E1 com os dois códigos na ordem dos itens, sem repetir; `ativo` NULL → E1; reativado → 200
  `TOTALMENTE_RESERVADA`.
- **RN-02 — o `/aprovar-valor` recusa igual.** `PUT /requisicoes/:id/aprovar-valor` de requisição
  `AGUARDANDO_APROVACAO_VALOR` com item pendente de material inativo → **400 E1v**; status continua
  `AGUARDANDO_APROVACAO_VALOR`, `aprovador_valor_id` não gravado, sem auditoria, nada reservado. A conferência vai na
  **condição do `UPDATE`** de `aprovarValor` (`SEM_MATERIAL_INATIVO_SQL`); não gravou → relê. **Ordem da releitura (R3):**
  status mudou → a recusa de status de hoje; gate de regras → a do gate; senão material inativo → E1v. Inativado **depois**
  do `UPDATE` (zerado, sob a trava do material): a aprovação segue (o pós-aprovação roda com `recusarInativo: false`) — é o
  mesmo estado de inativar depois de aprovar (B734/C228), não um 400 com o status já gravado. *Cenários:* E1v pela rota;
  pelo serviço (a condição do `UPDATE` é a única guarda); a ordem (segregação 403 e status 400 vêm antes); reprovada por
  outra aba na janela (gancho em `exigirSemPendenciaAberta`) → a recusa de status, não a E1v; inativado depois do
  `APROVADO` (gancho em `prepararPosAprovacao`) → 200 `AGUARDANDO_ESTOQUE`; a régua em SQL (NULL recusa, entregue não conta).
- **RN-03 — a aprovação automática não aprova.** Com `aprovacao_automatica = 1`, a requisição com item de material inativo
  (só alcançável por inativar na janela da criação — o envio recusa antes, RN-04) fica **`PENDENTE`**, sem reserva; a
  resposta não traz `aprovacao`. *Cenários:* pelo serviço, `prepararPosAprovacao` lança `MATERIAL_INATIVO` sem reservar o
  item ativo; pela rota de criação, com o material inativado na janela (gancho em `prepararPosAprovacao`) → 201 `PENDENTE`;
  controle: sem o inativo, a mesma porta aprova sozinha.
- **RN-04 — enviar rascunho com material inativo é recusado.** `POST /requisicoes/:id/enviar` com item de material
  inativo → **400 E2**, continua `RASCUNHO`, nada notificado, nenhuma avaliação. Mesma ordem das recusas de hoje do envio
  (404 → 403 dono → 400 status → urgência → OS → série → **E2**). *Cenários:* E2; reativado → envia (e aprova sozinho); a
  ordem (dono 403, status 400 antes).
- **RN-05 — a separação recusa o item de material inativo.** `PUT /requisicoes/:id/separar` (e `/separacao`) com uma
  entrada de quantidade > 0 de item de material inativo → **400 E3**, nada gravado (tudo ou nada), status não muda.
  Entrada com quantidade 0 desse item não recusa; separar os outros itens passa. Conferido na passada de forma
  (`validarFormaDaSeparacao`), sob as duas travas. **Ordem (R4):** item de outra requisição → quantidade inválida →
  **E3** → série com fração → (depois) alçada de valor e o máximo de saldo. *Cenários:* E3 sem rodada gravada; misto (o
  inativo com 1 recusa e nem o ativo grava; o inativo com 0 e o ativo com 2 → 200); E3 ganha do máximo (inativo zerado).
- **RN-06 — item já entregue não conta.** Item de material inativo com `entregue ≥ solicitada` não dispara E1/E1v.
  *Cenários:* item entregue ajustado no banco + outro item ativo → `/aprovar` 200; 1 de 2 entregue → E1.
- **RN-07 — a ordem das recusas do `/aprovar`.** 404 → 403 segregação → 400 transição → 400 do gate de regras → **E1**.
- **RN-08 — o detalhe diz 0 (Fase 2, R1).** `GET /requisicoes/:id`: item de material inativo sai com `saldo_separavel` 0,
  `quantidade_separavel` 0 e `quantidade_entregavel` 0, e o campo novo `material_ativo` (aditivo). O modal de separação
  pré-preenche 0 nele. *Cenários:* inativo com saldo 5 → 0/0; o ativo do lado segue com o separável; reativado → volta;
  separado com o material ativo e inativado depois → entregável 0.

## Contrato congelado

Corpos 200 inalterados (o detalhe ganha `material_ativo` por item). Recusas novas, todas `{ "error": <literal> }`.
*(Literais revistas na Fase 2 — R1/R2.)* ⟨reative⟩ = `Reative o material em Materiais → Inativos (⟨quem⟩)`, com ⟨quem⟩ os
perfis de `editar_material` por extenso, separados por `, ` e o último por ` ou ` — hoje *Administrador, Almoxarife ou
Engenharia*.

**E1 — 400** (`/aprovar`):
```
A requisição ⟨número⟩ tem material inativo: ⟨códigos⟩. ⟨reative⟩ ou rejeite a requisição.
```
**E1v — 400** (`/aprovar-valor`):
```
A requisição ⟨número⟩ tem material inativo: ⟨códigos⟩. ⟨reative⟩ ou reprove a liberação por valor.
```
**E2 — 400** (`/enviar`):
```
O rascunho ⟨número⟩ tem material inativo: ⟨códigos⟩. ⟨reative⟩ ou cancele o rascunho e faça outro sem ele.
```
**E3 — 400** (separação):
```
⟨nome do material⟩: material inativo não pode ser separado. ⟨reative⟩ ou separe os outros itens com 0 neste.
```
- ⟨número⟩: `numero` da requisição (fallback: o id). ⟨códigos⟩: `codigo` dos materiais inativos dos itens pendentes, na
  ordem dos itens (`ir.id`), sem repetir, separados por `, ` (fallback, R7: o id do material).

Módulo novo `services/almoxarifado/requisicaoMaterialInativo.js`: `codigosInativosPendentes(itens)` (itens com
`material_ativo`, `material_codigo`, `quantidade_solicitada`, entregue) → `string[]`; `mensagemAprovar(numero, codigos,
{ valor })` (E1/E1v); `mensagemEnviar(numero, codigos)`; `mensagemSeparar(nome)`; `SEM_MATERIAL_INATIVO_SQL` (condição
para o `UPDATE` de `requisicoes_almoxarifado`, tabela sem apelido); `lerCodigosInativosPendentes(db, requisicaoId)`;
`erroAprovar(reqRow, id, codigos, { valor })`. `carregarItensRequisicao` ganha `ma.ativo AS material_ativo` (aditivo).
`prepararPosAprovacao(db, id, user, reqRow, { recusarInativo = true })` → lança `{ status: 400, code: 'MATERIAL_INATIVO',
message: E1 }` sem reservar.

## Tasks (sort topológico)

- [ ] **T1 — tronco** — módulo novo + `carregarItensRequisicao` + RN-01/03 (`reservarItensAprovacao`) + RN-02
  (`aprovarValor` + rota) + RN-04 (rota do envio) + RN-05 (`validarFormaDaSeparacao`) + RN-06/07 + RN-08 (`normalizarItem`
  + a consulta do detalhe). `server/tests/api/requisicaoMaterialInativo.api.test.js`. Controle positivo: sabotagens (sem a
  conferência na aprovação; conferência depois de reservar; sem a condição do `UPDATE` do valor; releitura sem E1v;
  releitura fora de ordem; `recusarInativo` ignorado; sem a RN-04; sem a RN-05; contar item entregue (JS e SQL); `ativo = 0`
  em vez de `<> 1` (JS e SQL); códigos repetidos; o valor com a frase do `/aprovar`; o detalhe sem zerar).
- [ ] **T2 — integração (cruza aprovação, Materiais e separação/entrega)** —
  `server/tests/api/requisicaoMaterialInativoIntegracao.api.test.js`: (i) requisição pendente → inativar (zerado) →
  aprovar E1 → `PUT /materiais/:id { ativo: 1 }` (Reativar) → Entrada 5 → aprovar 200 `TOTALMENTE_RESERVADA` → separar →
  entregar 200; (ii) aprovar E1 → `/rejeitar` 200 (o caminho da mensagem); (iii) rascunho → inativar → enviar E2 →
  cancelar o rascunho 200; (iv) alçada: criar acima do limite → inativar → aprovar-valor E1v → reativar → aprovar-valor 200;
  (v) legado aprovado (material inativado com saldo no banco depois da aprovação sem reserva) → separar E3 → reativar →
  separar → entregar 200; (vi) *(R1)* legado misto: o detalhe dá 0 no inativo → separar o ativo com 0 no inativo 200 →
  entregar o ativo → `/encerrar` 200 (o pendente do inativo se encerra); (vii) *(R2)* o Gestor recebe a E1 e
  `/rejeitar` 200; o aprovador de valor recebe a E1v e `/rejeitar-valor` 200.
- [ ] **T3 — fechamento** (skill `fechar-etapa`): novidades (seção 114 + B740+, C229 resolvido, A61), spec 04 (e 05/06 se
  couber), mapa, guia, manual (§ aprovação, envio, separação), plano + retro.

Galhos: nenhum (não há tela — a Fase 2 confirmou que os toasts já mostram a mensagem do servidor). Uma etapa só, suíte
num SQLite.

## Execução — o que aconteceu

*(preencher)*
