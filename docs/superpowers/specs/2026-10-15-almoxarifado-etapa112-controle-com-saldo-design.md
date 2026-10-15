# Almoxarifado — Etapa 112: ligar lote ou série num material com saldo deixa de prender o saldo (design)

> Origem: "Próxima tarefa detalhada — Etapa 112" do plano da 110 (`docs/superpowers/plans/2026-10-15-almoxarifado-etapa110-saldo-inicial-e-corrida-da-familia.md`),
> aviso **C222**. Plano: `docs/superpowers/plans/2026-10-15-almoxarifado-etapa112-controle-com-saldo.md`.

## O problema

`PUT /api/almoxarifado/materiais/:id` (gate `editar_material`: Administrador, Almoxarife, Engenharia) grava
`controle_lote`, `controle_serie` e `requer_inspecao` como qualquer outro campo do cadastro. Num material que **já tem
saldo**, ligar lote ou série deixa esse saldo sem lote / sem série — e a partir daí a Saída manual (v1/v2), a
transferência e a devolução cobram lote; a Saída, a entrega de requisição e a exclusão cobram séries. O saldo antigo
fica preso. É o caminho de dois passos que contorna a RN-02 da Etapa 110 (o material com lote/série não **nasce** com
saldo; com o PUT, ele **passa a ter** controle com saldo).

## Fase 0 — medido (sonda `server/tests/sonda/e112c222.js`, não versionada, 2026-10-15)

| # | Cenário | Resultado medido |
|---|---|---|
| 1 | Material nosso, Entrada 5; Engenharia e Almoxarife `PUT { controle_lote: 1 }` | **200** os dois |
| 1 | Saída 1 sem lote (v2) | **400** *"O material Z1 exige lote nesta movimentacao (controle por lote ligado)"* |
| 1 | Ajuste (puro) para 0, Administrador | **400** *"Dados inválidos — quantidade: quantidade deve ser maior que zero"* (o schema só aceita 0 com endereço) |
| 1 | Entrada 5 com lote L1, depois Saída 1 com L1 | 201 / 201 — mas o físico vira **10** (a Entrada **soma**, não atribui lote ao saldo antigo); a linha sem lote continua **5** |
| 2 | Entrada 3; Engenharia `PUT { controle_serie: 1 }` | **200** |
| 2 | Saída 1 sem série | **400** *"material com controle de serie: informe 1 serie(s) para 1 unidade(s) — recebidas 0"* |
| 2 | `POST /materiais/:id/series/regularizar` (cadastrar 3) — Almoxarife / Administrador | **403** (`ajustar_estoque`) / **200**; depois a Saída com a série → 201 |
| 3 | Material com lote, Entrada 5 em L1; Almoxarife **desliga** o lote; Saída 1 sem lote | **200** / **201** — a linha sem lote fica **−1**, L1 fica 5 (o "Sem lote atribuído" negativo que a tela de Lotes já explica) |
| 4 | Material com série, Entrada 2 (A1, A2); **desliga** a série; Saída 1 sem série | **200** / **201** — físico 1, as **duas** séries continuam `EM_ESTOQUE` |
| 4 | **Religa** a série (físico 1, 2 presentes) | **200**; a Saída com A1 → 201; A2 fica `EM_ESTOQUE` com físico 0 |
| 5 | Entrada 5; Engenharia `PUT { requer_inspecao: 1 }`; Saída 1 | **200** / **201** — **nada** prende |
| 6 | Material só com `quantidade_reservada` 2 (físico 0); `PUT { controle_lote: 1 }` | **200** |

Mais o que a leitura mostrou:

- **`requer_inspecao` do material não é lido por fluxo nenhum** além da recusa do saldo inicial (Etapa 110,
  `materialService.motivosSaldoInicialRecusado`). A retenção do Recebimento vem de `material_critico` do item com a
  configuração `inspecao_material_critico`. **O "ou inspeção" da C222 estava errado**: ligar inspeção com saldo não prende
  nada.
- **~~Para lote não existe regularização.~~ (estava errado — ver "Medido depois", abaixo)** A spec 10 diz que o `AJUSTE` puro *"é o caminho de regularização de quem ligou a
  flag com estoque antigo sem lote em casa"* — medido: o ajuste é de valor **absoluto** do total (não atribui lote a
  saldo nenhum) e não zera sem endereço. O que tira o saldo antigo sem lote é a **entrega de requisição** (isenta de lote,
  spec 10, pendência (g)) — a Saída manual, a transferência e a devolução não.
- **Para série a regularização existe** (Etapa 61, `ajustar_estoque`: Administrador e Gestor).
- Só o `PUT` de material escreve as três colunas (o cadastro nasce com elas; nenhuma outra rota as grava).

## Medido depois (Fase 1 e Fase 2) — a premissa "para lote não existe regularização" estava errada

- **Sonda `e112aj.js`:** saldo antigo de 5 sem lote, controle ligado; **Entrada de 5 com o lote L1** (físico 10) e
  **Ajuste (puro) para 5** → a linha sem lote vai a **0**, L1 fica com 5, a Saída de 5 por L1 passa. A regularização do
  lote **existe**: Entrada com lote + Ajuste do total, que exige `ajustar_estoque` (Administrador; Gestor). O que a
  primeira versão deste design dizia ("para lote não existe regularização") **estava errado** — o Ajuste sozinho não
  atribui lote, mas o par Entrada + Ajuste sim.
- **Revisão do plano (Fase 2, sonda própria):** (1) com a regra "físico ≠ 0", religar a série com físico 0 e séries ainda
  `EM_ESTOQUE` passava, e a Entrada seguinte das mesmas séries recusava (*"serie A1 ja esta em estoque"*); (2) "zere o saldo
  com uma Saída" é **consumo fictício** no material nosso e **impossível** no de cliente (a Saída exige a OS do dono); (3) a
  recusa valia mesmo com o saldo todo em lote (a mensagem mentia); (4) a regularização de séries exige o controle **já
  ligado** (`regularizarSeries`: *"material sem controle de serie"*) — recusar para todos tranca essa porta.

## Decisão (letra B — caminho reversível)

**Escolhida: ligar lote ou série num material cujo saldo não está identificado exige a permissão `ajustar_estoque`
(403 para o Almoxarife e a Engenharia; o Administrador liga e regulariza).** "Não identificado" é a régua que as telas já
mostram: para lote, a sobra **sem lote atribuído** (físico − soma dos lotes, a conta da tela de Lotes) ≠ 0; para série, o
físico ≠ as séries presentes (`EM_ESTOQUE` + `BLOQUEADA`, a régua da tela de Séries). Com o saldo identificado (todo em
lote, séries = físico, ou nada), qualquer perfil com `editar_material` liga. A condição também vai no `UPDATE` de quem não
pode regularizar.

**Descartada: (a) recusar para todos e mandar zerar o saldo** (o plano original) — pelos achados (2) e (4) acima.
**Descartada: recusar só pelo físico ≠ 0** — achados (1) e (3). Reverter para "recusa para todos" é trocar o
`can(user, 'ajustar_estoque')` por `false` no mesmo ponto.

**Também descartado:** recusar **desligar** (desligar não prende — a saída volta a andar; o resíduo é a linha "sem lote"
negativa, que a tela de Lotes já mostra, e as séries que ficam `EM_ESTOQUE`, que agora tornam o **religar** do
Almoxarife recusado e o do Administrador regularizável) e recusar `requer_inspecao` (não prende nada).

## O que fica de fora (declarado)

- O Administrador que liga com saldo não identificado **não recebe aviso** no salvar (200 como sempre): o saldo fica preso
  até ele regularizar; as telas de Lotes ("Sem lote atribuído") e de Séries (divergência) mostram (aviso **C224**).
- Desligar a série com séries presentes deixa as séries `EM_ESTOQUE` (**C225**).
- A corrida inversa: uma Entrada sem lote que leu o material **antes** de o controle ser ligado e grava **depois**. O
  `UPDATE` de quem não pode regularizar confere o saldo no mesmo comando, mas o motor lê o controle no começo da
  movimentação; fechar o outro lado é mexer no motor (**C226**).
- O formulário não avisa antes de salvar: a recusa aparece no aviso de erro de sempre, com a literal do servidor.
