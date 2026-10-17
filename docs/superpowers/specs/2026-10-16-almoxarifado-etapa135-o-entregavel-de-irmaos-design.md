# Etapa 135 (spec 05 + núcleo): o entregável de irmãos e três pequenas do cadastro de usuários — design

> Origem: "Próxima tarefa detalhada — Etapa 135" do plano da 134
> (`docs/superpowers/plans/2026-10-16-almoxarifado-etapa134-o-super-do-boot-e-a-trilha.md`). Plano:
> `docs/superpowers/plans/2026-10-16-almoxarifado-etapa135-o-entregavel-de-irmaos.md`.

## Fase 0 — o que foi medido (sonda `scratchpad/e135/sonda-f0.js`, `testApp` real, rota)

**Irmãos** = dois itens do mesmo material na mesma requisição. Quatro estados:

| Caso | Estado | Fila (`entregavel`) | Detalhe (`quantidade_entregavel`) | Porta (`PUT /entregar`) |
|---|---|---|---|---|
| S1 (o da spec) | físico 8, reservados 4 + 4, separados 4 e 3; entrega parcial de 2 do primeiro | 2 e 3 | 2 e 3 | 2 + 3 → 200; 2 + 4 → 400 *"Máximo: 3"* antes de baixar |
| S1′ | idem, entrega parcial de 2 do **segundo** | 4 e 1 | 4 e 2 | 4 + 2 → 200 (o 2 do segundo: 1 da caixa + 1 da reserva própria) |
| **S2** | sem reserva; 4 entram, separados 2 e 2, entregues 2 e 2; **+2 livres** | 0 e 0 (só *Separar* 2/0, *Aguardando saldo*) | **2 e 2** | **2 + 2 → 400 *"E135-3: não é possível entregar 2 PC. Máximo: 0 (pendente: 2, disponível: 0)"* DEPOIS de baixar o primeiro** (físico 2 → 0, o primeiro *entregue 4*) |
| S3 | primeiro na segunda rodada, o segundo com 2 na caixa sem reserva, 2 livres | 0 e 2 | 0 e 2 | 2 + 2 → 400 *"Máximo: 0"* antes de baixar (nada move) |

**Conclusão:** no cenário da spec (reservados) **não diverge** — a reserva de cada irmão é dele, e a caixa sem reserva já está fora do
pote (`tetoSeparacao`). **Diverge** na **segunda rodada** (item já entregue em parte, a caixa abaixo do pendente: `maxEntregar` deixa
passar da caixa até o teto) de **dois irmãos que tiram do mesmo livre**: o detalhe promete o livre inteiro a cada um, a prévia da entrega
(Etapa 94, B464 — "as mesmas contas do laço") lê cada irmão **sozinho**, passa, e o laço — que relê o saldo depois de cada baixa — recusa
o segundo **depois de ter baixado o primeiro**. A resposta é 400 (*"não é possível entregar"*) com metade da entrega feita, o status não
recalculado e a tela convidando a tentar de novo. É a C265 da entrega, pior: a C265 era um número na tela; aqui o 400 mente sobre o
estoque.

A **fila** não diverge: o entregável dela é só a caixa (`min(separado − entregue, o que o motor deixa)`), nunca passa dela, e a caixa de
cada irmão é dele (a reserva cobre, e a caixa sem reserva já está fora do pote) — a sonda mostra 0 e 0 em S2 com *Separar* e *Aguardando
saldo*. O que a fila oferece é **separar**, não entregar.

## A conta

Para um item: `c` = caixa (separado − entregue), `r` = reserva ativa do item, `D` = disponível do material (sem a reserva do item),
`L` = o livre do material **depois de toda a caixa sem reserva** (`D − caixa sem reserva dos outros itens − max(0, c − r)`, o segundo termo
de `tetoSeparacao`). O que a entrega de `q` tira:

- da **reserva própria** primeiro (`min(q, r)` — não mexe em `D`), o excedente do `D` (`max(0, q − r)`);
- a caixa do item cai (`max(0, c − q)`, ou 0 na segunda rodada, que sobe o separado até o entregue).

Medido algebricamente e conferido na sonda: o que a entrega de um irmão **tira do pote `L`** é `max(0, q − max(c, r))` — a caixa e a
reserva própria do item são **dele**; só o que passa delas sai do pote dos irmãos. É a conta da 127 (`dividirSeparavel`) com
`própria = max(c, r)` e `teto = max(c, r) + max(0, L)` (= `c + tetoSeparacao(D, r, c, csrOutros)`).

## Decisões (letra B)

1. **A prévia simula as baixas dos irmãos anteriores** (o que cada um tira do disponível e da caixa sem reserva), na ordem do laço, em
   memória — e lê com isso o mesmo `maxEntregar`/`tetoDaLeitura`/`entregavelPeloMotor` de hoje. É a leitura que o laço fará depois de cada
   baixa, sob a mesma trava — então a recusa sai **antes** de qualquer baixa. *Descartado:* (a) dividir a prévia pela conta do pote (a
   fórmula fechada): igual sob a invariante (`caixa sem reserva ≤ disponível`), mas a contagem por endereço que leva a caixa sem reserva
   (C186, só avisa) quebra a invariante e a fórmula prometeria o que o laço recusa; a simulação não depende dela. (b) transação SQLite na
   entrega: o motor não roda numa transação só (a migração para Postgres resolve isso no todo — memória do projeto).
2. **O detalhe ganha dois campos aditivos**, como a 127: `saldo_entregavel` (o teto do item sozinho, sem o corte do pendente) e
   `saldo_entregavel_proprio` (a parte que não é dividida: `max(c, r)`); `quantidade_entregavel` **não muda** (o item sozinho).
   Na primeira rodada (e no inativo, e com o entregável 0) os dois são o próprio `quantidade_entregavel` — nada a dividir.
3. **A janela de entrega divide pela conta da 127** — pré-preenchimento (as três portas: o detalhe carregado, "Entregar escolhendo de onde
   sai…" e o "Confirmar Entrega e Baixar Estoque" de um clique) e o máximo do campo. Servidor sem os campos: nada dividido (a conta de
   antes — a de hoje não divide).
4. **A recusa da prévia é a literal de hoje** (*"⟨material⟩: não é possível entregar q ⟨un⟩. Máximo: m (pendente: p, disponível: d)"*)
   com os números simulados — a mesma que o laço dava depois de baixar. *Descartado:* um sufixo nomeando o irmão — a janela já não deixa
   chegar lá; a recusa só aparece pela API, e a separação (127) também recusa sem sufixo.
5. **A fila não muda** (medida: não passa da caixa). Declarado.
6. Núcleo — **C284**: `POST /api/usuarios` com `ativo` ausente, nulo ou `""` grava **1** (a coluna nasce `DEFAULT 1`; a tela sempre manda);
   `0` continua 0. **C283**: `email` presente que não é texto (número, lista, objeto, booleano, nulo no `PUT`) → **400** *"E-mail inválido:
   envie o e-mail como texto"*, nada gravado; o `PUT` **sem** o campo continua o 500 do `NOT NULL` de hoje (preso na 134; declarado em D).
   **C282**: a limpeza do boot que apaga quem tem *administrator* no nome **sai**, e com ela o filtro da tela de Usuários que escondia quem
   se chama *administrator* — os dois serviam a um usuário antigo que nenhum código cria desde o primeiro commit (medido: `git log -S`, só o
   commit inicial; os bancos locais não têm nenhum). *Descartado:* restringir a limpeza ao nome exato — apagar usuário no boot, sem aviso, é
   o gesto irreversível; o reversível é não apagar.
