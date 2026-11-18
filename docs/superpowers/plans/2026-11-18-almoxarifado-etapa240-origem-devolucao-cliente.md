# Etapa 240 — escolher de onde sai a devolução ao cliente (D (236) 1, B1541)

> Item 6 da estimativa `docs/estimativas/2026-11/estimativa_2026-11-18_cadastro-e-almoxarifado-semana.md` (1h, fatia de tela). Ponto de
> partida: a "Próxima tarefa detalhada" do plano da 239 (`2026-11-18-almoxarifado-etapa239-saida-lote-prateleira-do-lote.md`).

## Fase 0 — o que foi medido

- A rota `POST /api/almoxarifado/materiais-cliente/devolucoes` já aceita `localizacao_origem_id` (`DevolucaoClienteSchema`) e o passa ao
  motor. Com origem, o motor valida **a origem** (bloqueada → *"Localização X está bloqueada"*) — a padrão bloqueada não importa. Sonda
  (o teste novo, RN-240.01, verde antes de qualquer mudança): sem lote, padrão P bloqueada, saldo em A, devolução com origem A → 201.
  **A janela não tinha o campo**: era só isso que faltava para a D (236) 1.
- **Mas a origem só era preferida** (a rota não passava `origemEstrita`): origem A com 2 e devolução de 3 → 201, o motor drenava B e o
  livro gravava `localizacao_origem_id = A` (sonda: RN-240.02 vermelho, `saldo_posterior 4`). É o crítico 1 da Etapa 58 na entrega,
  fechado lá com `opcoes.origemEstrita` (já no motor, testado; esta rota não o passava). Com a padrão bloqueada, o que faltava saía **da
  padrão bloqueada** (o `claimSaldoSemLote` drena sem olhar bloqueio).
- `GET /api/almoxarifado/estoque/:materialId/saldos` (`consultarSaldosPorLocalizacao`) traz localização, lote e situação do lote, mas
  **não** o bloqueio do endereço: a janela não tinha como apagar a opção bloqueada.
- O "Sai de" da entrega (`RequisicoesList.js`, `rotuloOrigem`) é o molde do rótulo: `CODIGO — lote L1 (4)`.

## Regras (RN)

- **RN-240.01** — a janela *Devolver ao cliente* tem o campo **Sai de**, opcional: *"Qualquer endereço (automático)"* (o de antes, sem
  origem) ou um endereço com saldo do material. Com um endereço escolhido, o POST leva `localizacao_origem_id`.
- **RN-240.02** — a origem escolhida é **estrita** (servidor): o saldo dela, no lote da saída, tem de cobrir a quantidade; senão 400
  *"O saldo em {codigo} ({saldo}) não cobre a quantidade ({qtd}) — a saída tiraria de outros endereços"*, nada sai. A janela avisa antes
  (`#dev-origem-nao-cobre`: *"Em {codigo} há só {saldo}: devolva até {saldo} ou escolha outro endereço."*) e apaga o Confirmar.
- **RN-240.03** — sem origem, nada muda (o automático drena os endereços, como antes).
- **RN-240.04** — endereço bloqueado: a opção vem apagada, com *" — bloqueada"* no rótulo, e a frase *"Endereços bloqueados vêm apagados:
  desbloqueie o endereço para devolver de lá."*. O servidor recusa a origem bloqueada (*"Localização X está bloqueada"*, como sempre).
- **RN-240.05** — `GET /estoque/:materialId/saldos` ganha `localizacao_bloqueada` (booleano; `false` na linha sem endereço). Aditivo.
- **RN-240.06** — quais endereços aparecem: as linhas com endereço e saldo > 0 **do lote da saída** — com controle de lote, o lote escolhido
  (sem lote escolhido, o campo não aparece); material com série sem controle de lote, o lote das séries marcadas se forem de um lote só
  **e o saldo do lote cobrir** (o servidor grava a saída nele, B1535; *"e o saldo do lote cobrir" faltava nesta RN — Fase 5, achado 1*), senão as linhas sem lote; sem lote nem série, as linhas sem lote. É a mesma conta da recusa
  estrita (`lote_id IS ?` com o lote da saída). Trocar o lote (ou as séries) e o endereço escolhido sumir da lista → volta ao automático.
- **RN-240.07** — o aviso da padrão bloqueada (`#dev-loc-bloqueada`) muda de texto e some com um endereço escolhido: *"A localização
  padrão deste material ({codigo}) está bloqueada: sem escolher de onde sai, a devolução será recusada. Escolha em "Sai de" um endereço
  livre ou desbloqueie a localização."* O Confirmar apagado fica só enquanto não houver endereço escolhido (resolve a D (236) 1: material
  **sem** lote com a padrão bloqueada passa a ser devolvível pela janela).

## Contratos (congelados)

- `POST /api/almoxarifado/materiais-cliente/devolucoes` — mesmo corpo; com `localizacao_origem_id`, agora estrita (RN-240.02). Antes: 201
  drenando outros endereços. Sem origem: igual.
- `GET /api/almoxarifado/estoque/:materialId/saldos` — cada linha ganha `localizacao_bloqueada: boolean`.

## Tasks

- [x] **T1 (tronco, servidor)** — `81c9ed15`; — rota passa `origemEstrita: true`; `consultarSaldosPorLocalizacao` com `localizacao_bloqueada`. Teste
  `devolucaoClienteOrigem.api.test.js` (RN-240.01 a .05). TDD: RN-240.02 e .05 vermelhos antes; controle positivo da RN-240.01/.04
  (rota sem repassar a origem → 4 vermelhos).
- [x] **T2 (galho, tela)** — `077ca21f` (+ Fase 5 `fb01d574`; 6 sabotagens vermelhas no cenário certo, restauro por cópia com md5); — `MateriaisClienteAlmoxarifado.js`: campo Sai de (RN-240.01, .02, .04, .06, .07). Testes em
  `MateriaisClienteDevolucaoOrigem.test.js`; o literal do aviso em `MateriaisClienteDevolucaoLocalBloqueado.test.js`.
- [x] **T3** — suítes completas, Fase 5, fechamento (este commit).

**Fase 2 pulada (motivo):** nenhuma mudança no motor nem em trava — a rota passa uma opção que o motor já tem e testa desde a Etapa 58 (a
entrega), e o campo novo da leitura é aditivo. **Fase 5 mantida** (um revisor adversarial fresco), porque a rota muda de comportamento.

Pontos de atenção: com série, o motor não confere se as séries marcadas estão na origem escolhida (C545, declarado); a recusa estrita
conta o lote da saída, então a lista da janela tem de usar o mesmo lote (RN-240.06).

## Fase 5 (um revisor adversarial fresco) — achados e o que foi feito

- **Achado 1 (reproduzido por sonda, baixa a média)** — série com lote L1 vindo da regularização, peça no "sem lote", padrão bloqueada: o
  servidor só deriva o lote das séries quando o lote cobre (Fase 5 da 234), então sai "sem lote" e confere a padrão. A janela derivava L1
  só pela série: o "Sai de" listava L1 (vazio) e escondia a única origem aceita (A sem lote → 201 na sonda); e o aviso sumia com o
  Confirmar ligado para um 400 certo (este já vinha da 239, B1544). **Corrigido** (`fb01d574`): a janela deriva só quando o saldo do lote
  (dos saldos do "Sai de") cobre as séries marcadas; sem os saldos, não deriva. **Divergência do plano:** a RN-240.06 dizia "o das séries
  marcadas se forem de um lote só" — faltava "e o lote cobrir".
- **Não reproduzidas:** o teste do servidor não cobre a origem estrita com série nem com saldo negativo (a régua é a da entrega, testada
  desde a 58); com a série marcada depois de escolher o endereço, o mesmo endereço pode continuar escolhido mudando de linha ("A sem lote"
  vira "A do L1") — coerente com o servidor, só pode confundir.

## Próxima tarefa detalhada

Item 7 da estimativa de 18/11 (`docs/estimativas/2026-11/estimativa_2026-11-18_cadastro-e-almoxarifado-semana.md`, 1h): **o seletor de lote
mostra reservado e livre** (a **C542**), módulo Almoxarifado, fatia de tela + leitura.

- **O problema (C542):** o seletor de lote da devolução ao cliente (e o de Movimentações) mostra *"L1 — saldo 3"* com o saldo **físico** do
  lote (`lotService.listarLotesDoMaterial`, `saldo` = soma das linhas do lote); com 3 reservados para a OS, **Confirmar** responde
  *"Saldo insuficiente. Disponível: 0 UN"*. Também depois de um ajuste (o ajuste grava a diferença "sem lote").
- **Contrato que ela consome:** `GET /api/almoxarifado/materiais/:id/lotes?com_saldo=1` (lista FEFO, `elegivel`, `saldo`). A reserva
  **não sabe o lote** (C526 — grande, fora): "reservado" é do **material**, não do lote. Medir antes de prometer: o campo novo provável é o
  disponível do material ao lado (`quantidade_atual − reservada − retida`, a régua de `calcularDisponivel`), ou um aviso na janela quando o
  disponível do material é menor que o saldo do lote — não um "livre do lote" que o servidor não sabe calcular.
- **Telas que leem a lista:** `MateriaisClienteAlmoxarifado.js:105`, `MovimentacoesAlmoxarifado.js:275`, `DevolucoesAlmoxarifado.js:169`,
  `SobrasAlmoxarifado.js:233/260`. O item fala da devolução ao cliente e de Movimentações; as outras, decidir e declarar.
- **O que já está pronto e não reabre:** o "Sai de" desta etapa (o saldo por prateleira também é o físico — declarado na **D (240)** 3, o
  mesmo conserto pode valer para ele); a posição do cliente já traz `saldo_disponivel` por material (`GET /materiais-cliente/posicao`).
- **Pontos de atenção:** a reserva da OS do material de cliente (**C541**) é o caso real; o seletor de Movimentações tem testes de rótulo
  (`rotuloDoLote`) que mudam junto.

## Verificação (medida, serial, sobre o código final `fb01d574`)

Servidor: `test:api` **633/633 arquivos OK** (632 + `devolucaoClienteOrigem`; rodada sobre `077ca21f` — a Fase 5 `fb01d574` só mexeu na tela);
`test:almoxarifado` **44/0**; `test:validation` **4/0**; `test:safealter` **3/0**; `test:sqlite` **16/0**. Tela (sobre `fb01d574`): `react-scripts test
--maxWorkers=2` **234/234 suítes, 3154/3154 testes**; `react-scripts build` (CI=true) **Compiled successfully**.

## Retro (4 números)

- Rodadas de correção até verde: **1** (Fase 5, achado 1).
- Achados: Fase 2 pulada (motivo acima); Fase 5 — 1 reproduzido e corrigido, 0 ruído, 2 suspeitas não reproduzidas.
- Paralelismo: nenhum galho em paralelo (a tela depende do campo novo da leitura); o revisor rodou enquanto a suíte do servidor rodava.
- Defeito que escapou da 239: a janela tirava o aviso da série com lote sem saldo no lote (o achado 1, metade antiga) — corrigido aqui.
