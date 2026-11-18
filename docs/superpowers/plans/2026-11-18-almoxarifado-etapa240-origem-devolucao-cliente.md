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
  (o servidor grava a saída nele, B1535), senão as linhas sem lote; sem lote nem série, as linhas sem lote. É a mesma conta da recusa
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

- [ ] **T1 (tronco, servidor)** — rota passa `origemEstrita: true`; `consultarSaldosPorLocalizacao` com `localizacao_bloqueada`. Teste
  `devolucaoClienteOrigem.api.test.js` (RN-240.01 a .05). TDD: RN-240.02 e .05 vermelhos antes; controle positivo da RN-240.01/.04
  (rota sem repassar a origem → 4 vermelhos).
- [ ] **T2 (galho, tela)** — `MateriaisClienteAlmoxarifado.js`: campo Sai de (RN-240.01, .02, .04, .06, .07). Testes em
  `MateriaisClienteDevolucaoOrigem.test.js`; o literal do aviso em `MateriaisClienteDevolucaoLocalBloqueado.test.js`.
- [ ] **T3** — suítes completas, Fase 5, fechamento.

**Fase 2 pulada (motivo):** nenhuma mudança no motor nem em trava — a rota passa uma opção que o motor já tem e testa desde a Etapa 58 (a
entrega), e o campo novo da leitura é aditivo. **Fase 5 mantida** (um revisor adversarial fresco), porque a rota muda de comportamento.

Pontos de atenção: com série, o motor não confere se as séries marcadas estão na origem escolhida (C545, declarado); a recusa estrita
conta o lote da saída, então a lista da janela tem de usar o mesmo lote (RN-240.06).
