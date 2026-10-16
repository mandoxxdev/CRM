# Almoxarifado — Etapa 116: o formulário diz o que leu, e o estorno não devolve saldo sem as séries (plano)

> Origem: "Próxima tarefa detalhada — Etapa 116" do plano da 115 (**C233**, **C232**). Design com a Fase 0 medida:
> `docs/superpowers/specs/2026-10-15-almoxarifado-etapa116-controles-lidos-e-estorno-sem-serie-design.md`.
>
> **Numeração** (conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` em 2026-10-15): última B **B751**,
> último C **C233**, última A **A62**. Esta etapa: **B752+**, **C234+**, **A63+**. Worktree `CRM-wt-e116`, branch
> `etapa-e116` (a partir da main `d13a111c`); nenhuma outra etapa em paralelo.

> **Divergência registrada (Fase 2):** a revisão fresca do plano achou 8 pontos, 2 Important. **R1** (Important) — o plano
> dizia "o estorno (Administrador ou Almoxarife)": **estava errado** — `POST /movimentacoes/:id/cancelar` exige
> `ajustar_estoque` (Administrador e Gestor); o Gestor estorna mas não edita material, então a E2 manda religar quem não
> religa → corrigido nas RN; o Gestor fica declarado (**D (116)**). **R2** (Important) — a devolução de uma Saída sem série
> (série desligada) seguida de religar + estornar contava o físico em dobro; **medido por sonda que é mais largo**: em
> **qualquer** material, Entrada 5 → Saída 2 → devolução 2 → estorno → físico **7** (o estorno não lia as devoluções) →
> **RN-10** nova (E3), **B756**. **R3** (Minor) — com parte das séries já reentrada, a E2 mandava religar e a recusa da 6b
> vinha depois → a E2 só quando todas as séries da saída continuam fora; senão a literal da 6b. **R4** (Minor) — a recusa sob a
> trava vinha depois do crédito (fora da trava) e uma Saída sem série podia consumir o crédito antes da compensação → o ramo de
> saída inteiro roda sob a trava, com o controle relido no começo (RN-08). **R5** — a guarda prévia usa o `material` já lido
> (não relê), senão o `[R2-F5]` deixaria de passar pela trava. **R6** — a compensação isenta nos dois pontos. **R7** — os lidos
> gravados dentro de `loadMaterial` (troca de id sem desmontar). **R8** — "mudado" com dois controles é intencional; o 400 do
> schema sai antes do 404; material inativo → a recusa de inativo antes da E2.

## Regras de negócio

"Controle" = `controle_lote` ou `controle_serie`, lido como 0/1. "Lido" = o valor de `controles_lidos[col]` do corpo (depois do
`bool01`). "Gravado" = a coluna em `current`. "Gravaria" = `merged[col]` (o corpo, ou o gravado com a chave omitida).
"Séries da saída" = `series_almoxarifado` com `movimentacao_saida_id = <id da saída>` e status `ENTREGUE` ou `SUCATEADA`.

- **RN-01 — o salvar que desfaria o controle mudado por outra pessoa é recusado (C233).** `PUT /materiais/:id` com
  `controles_lidos` em que, para algum controle, lido ≠ gravado **e** gravaria ≠ gravado → **409 E1**; nada gravado, sem
  auditoria. *Cenários:* lido série 0, o Administrador ligou (gravado 1), o Almoxarife renomeia mandando `controle_serie: false`
  → 409 E1 "foi ligado", série continua 1; o mesmo com 2 séries já entradas → 409 E1 (não a E1 da 115); lote ligado por outro →
  E1 "por lote … foi ligado"; lote desligado por outro e o salvar manda `controle_lote: true` → E1 "foi desligado"; os dois
  mudados → E1 "por lote e por número de série … foi mudado"; o Administrador também recebe (não é guarda de perfil).
- **RN-02 — sem desfazer, segue.** Lido ≠ gravado, mas gravaria = gravado (o usuário marcou igual ao que está gravado, ou a
  chave veio omitida) → o PUT segue como hoje (200, se nada mais recusar). Lido = gravado → hoje. *Cenários:* lido série 0,
  gravado 1, corpo `controle_serie: true` → 200; lido 0, gravado 1, corpo sem `controle_serie` → 200, série 1.
- **RN-03 — sem `controles_lidos`, hoje.** Corpo sem a chave → o comportamento da 115 (B750: a condição com o `current`).
  Só uma das chaves dentro de `controles_lidos` → só ela é comparada. Valor que não é booleano/0/1 → **400** do schema.
  *Cenários:* PUT sem a chave com série ligada por outro antes → 200 e desliga (o comportamento de antes, para integração);
  `controles_lidos: { controle_lote: 0 }` com a série mudada → não compara a série; `controles_lidos: { controle_serie: 'x' }`
  → 400.
- **RN-04 — a ordem.** 404 → **409 E1 (C233)** → 403 troca de dono → 400 inativar → 403 ligar (112) → 403 desligar (115) →
  família → localização. *Cenários:* E1 + troca de dono sem permissão → E1; E1 + desligar com séries (115) → E1.
- **RN-05 — `controles_lidos` não autoriza.** É proteção de concorrência: as guardas de perfil (112/115) continuam lendo o
  gravado. *Cenário:* o Almoxarife manda `controles_lidos` igual ao gravado (forjado ou não) e desliga a série com 2 séries →
  403 da 115, como hoje.
- **RN-06 — o formulário manda o que leu (C233).** Na edição, o PUT leva `controles_lidos` com os valores de quando o material
  foi carregado — não os do state atual; no cadastro novo (POST), não leva. A recusa (409) aparece como toast com a literal e o
  formulário continua aberto. *Cenários (jest):* abre com lote 0/série 0, marca o lote, salva → payload `controle_lote: true` e
  `controles_lidos: { controle_lote: false, controle_serie: false }`; abre com série 1 → `controles_lidos.controle_serie: true`;
  POST sem a chave; 409 → toast literal, sem navegar.
- **RN-07 — o estorno de Saída com séries de material com a série desligada é recusado (C232).** `POST
  /movimentacoes/:id/cancelar` (`ajustar_estoque`: Administrador e Gestor — *Fase 2, R1*) de Saída (`TIPOS_SAIDA`) com todas
  as séries da saída ainda fora (*Entregue*/*Sucateada*, n ≥ `round(quantidade)`) num material com `controle_serie` desligado →
  **400 E2**, antes do claim: nada tocado (nem o claim nem o crédito rodam). Com só parte das séries fora (0 < n < quantidade:
  as outras reentraram pela Entrada) → a literal da 6b (*R3*). A compensação interna não passa por nenhum dos dois pontos (*R6*).
  Ordem: material inativo → ajuste de cliente → Entrada de compra → **RN-10** → séries (6b com a série ligada, E2 desligada).
  *Cenários:* Saída de 2 séries → desligar → o Administrador (perfil) e o superadmin estornam → 400 E2 "baixou 2"; Saída de
  material que nunca teve série → livre; Saída sem série vinculada → livre; série *Sucateada* conta; 1 das 2 reentrou → a da 6b.
- **RN-08 — a mesma recusa sob a trava (corrida).** O ramo de saída do estorno roda **inteiro** sob a trava do material (*R4*),
  com o controle relido no começo: o desligar que cai entre a guarda prévia e o ramo → 400 E2 **antes do crédito** (o `catch`
  só desfaz o claim). *Cenário:* `[R2-F5]` (gancho na leitura do
  material pelo estorno, o desligar do Almoxarife no meio) → estorno 400 E2, desligar 200, `cancelado = 0`, físico de antes,
  séries *Entregue*; **muda** o cenário da 115, que prendia 200.
- **RN-10 — a Saída que já teve devolução não é estornável (*Fase 2, R2*, B756).** Estorno de Saída com
  `SUM(devolucoes.quantidade)` > 0 (a conta da devolução) → **400 E3**, qualquer material, antes das guardas de série. A
  compensação interna não passa. *Cenários:* Entrada 5, Saída 2, devolução 2 → E3 "devolvida inteira", físico 5 (era 7);
  devolução 1 de 3 → E3 com o resto (2) a devolver → devolver o resto → físico 5; série desligada + devolução das 2 → E3 (não a
  E2), e religar não destrava.
- **RN-09 — religar destrava.** Com a série religada (o Administrador; o Almoxarife se o físico bate com as séries — a régua
  da 112), o estorno passa e as séries voltam a *Em estoque*. *Cenário (integração):* Saída 2 séries → desligar → E2 → religar →
  estorno 200 → as 2 *Em estoque*, físico 2.

## Contrato congelado

Corpos 200 inalterados. Novas recusas, `{ "error": <literal> }`:

**E1 — 409** (`PUT /materiais/:id`, RN-01):
```
O controle por ⟨nomes⟩ do material ⟨código⟩ foi ⟨verbo⟩ por outra pessoa depois que você abriu o cadastro — salvar desfaria essa mudança, e nada foi gravado. Recarregue o material e salve de novo.
```
- ⟨nomes⟩: `lote` / `número de série` / `lote e por número de série` (os controles em que lido ≠ gravado e gravaria ≠ gravado,
  na ordem lote, série). ⟨verbo⟩: um controle → `ligado` (gravado 1) ou `desligado` (gravado 0); dois → `mudado`.

**E2 — 400** (`POST /movimentacoes/:id/cancelar`, RN-07/RN-08):
```
Não é possível estornar: esta saída baixou ⟨n⟩ série(s) do material ⟨código⟩ e o controle por número de série foi desligado depois — o estorno devolveria o saldo sem devolver as séries. Religue o controle por número de série no cadastro do material e estorne de novo.
```

**E3 — 400** (`POST /movimentacoes/:id/cancelar`, RN-10), ⟨d⟩ devolvido, ⟨r⟩ = quantidade − ⟨d⟩, ⟨un⟩ a unidade:
```
Não é possível estornar: ⟨d⟩ ⟨un⟩ desta saída já ⟨voltou|voltaram⟩ pela devolução — o estorno devolveria de novo o que já voltou. Para desfazer o resto, registre a devolução dos ⟨r⟩ ⟨un⟩ que faltam.
Não é possível estornar: esta saída já foi devolvida inteira (⟨d⟩ ⟨un⟩) — o estorno devolveria de novo o que já voltou.
```
(a segunda quando ⟨r⟩ = 0; "voltou" quando ⟨d⟩ ≤ 1.)

Schema: `MaterialUpdateSchema` ganha `controles_lidos: z.object({ controle_lote: FlagSchema, controle_serie: FlagSchema })
.optional()` (só o PUT). `materialService`: `controlesDesfeitos(lidos, gravado, merged)` → `['lote'|'serie']`;
`mensagemControleMudadoPorOutro(codigo, desfeitos, gravado)`. `stockService`: `mensagemEstornoSemSerie(codigo, n)` (interna).

## Tasks (sort topológico)

- [ ] **T1 — tronco (C233, servidor)** — RN-01..RN-05 em `routes/almoxarifado.js` + `materialService.js` + `schemas.js`;
  `server/tests/api/controlesLidos.api.test.js`. Controle positivo: sem a guarda; guarda sem a condição "gravaria ≠ gravado";
  guarda depois do dono; schema sem a chave (descarte silencioso).
- [ ] **T2 — tronco (C232, motor)** — RN-07/RN-08 em `stockService.js`; `server/tests/api/estornoSemSerie.api.test.js`;
  `[R2-F5]` de `controleSobATravaFase5` passa a esperar a E2. Controle positivo: sem a guarda prévia; guarda contando só
  `ENTREGUE`; sem a recusa sob a trava (o `[R2-F5]` volta a 200); recusa também na compensação.
- [ ] **T3 — galho (C233, tela)** — RN-06 em `MaterialAlmoxarifadoForm.js` + teste jest. Contra o contrato acima (mock só na
  fronteira HTTP). Controle positivo: `controles_lidos` do state atual (não do carregado); sem a chave.
- [ ] **T4 — integração (cruza Materiais, Movimentações, Séries)** — `server/tests/api/controlesLidosIntegracao.api.test.js`:
  (i) o Almoxarife abre (GET) → o Administrador liga a série e entra 2 séries → o Almoxarife salva o GET antigo como o
  formulário mandaria → 409 E1 → recarrega (GET) → salva → 200, série ligada; (ii) RN-09 inteira pelas rotas (Entrada 2 séries
  → Saída com as 2 → o Administrador desliga → estorno E2 → religa → estorno 200 → 2 *Em estoque*, físico 2); (iii) a Saída
  avulsa sem série depois do desligar continua estornável.
- [ ] **T5 — fechamento** (skill `fechar-etapa`).

Galhos: T3 (tela) é independente do servidor pelo contrato; roda depois de T1 nesta mesma árvore (é jest, não bate no SQLite —
mas não rodar jest junto do `test:api`).

## Execução — o que aconteceu

*(preenchido ao executar)*
