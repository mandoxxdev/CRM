# Etapa 239 — a saída com lote confere o bloqueio na prateleira do lote, não na padrão (C543 no motor)

> Usando a skill `desenvolver-etapa`. Estimativa: item 5 de `docs/estimativas/2026-11/estimativa_2026-11-18_cadastro-e-almoxarifado-semana.{txt,md}`
> (1h30, commit `5e58d69b`). Ponto de partida: a "Próxima tarefa detalhada" do plano da 238 e a do plano da 237.

## Fase 0 — o que foi medido

- `stockService.registrarMovimentacaoSemTrava` (dentro de `naTravaDoMaterial`, como o motor inteiro desde a 97): no bloco "Restrições de
  endereço", toda saída roda `validarLocalizacaoParaMovimento(db, resolveLocalizacaoSaida(material, localizacao_origem_id), material, 'origem')`.
  Sem origem, `resolveLocalizacaoSaida` devolve a **localização padrão** do material. Para a origem, a única recusa é `bloqueada = 1`
  (`motivoRecusaEndereco`: *"Localização {codigo} está bloqueada"*; o tipo permitido só vale no destino).
- Com lote, em material sem saldo negativo, quem baixa é `claimSaldoDoLote(db, material, lote, locPreferida = a padrão, qtd)`: drena as
  linhas do lote com saldo, a da padrão primeiro, depois as maiores — **sem olhar bloqueio**. O lote guardado em A (livre) com a padrão P
  bloqueada: recusa *"Localização P está bloqueada"* (a C543, sonda da Fase 5 da 236 pela devolução ao cliente); o lote guardado só em X
  bloqueada com a padrão livre: **sai**, e X cai.
- Efeito colateral declarado da Etapa 6 (spec 10, "O saldo do lote é agregado nas DUAS pontas"): com origem informada, só ela é
  validada; as outras linhas do lote que o claim drena para fechar o total não passam pela validação, inclusive a bloqueada. **Mantido**.
- Quem sai com lote sem origem: Movimentações (v2/v1), devolução ao cliente (rota dedicada), a parte automática da entrega por lote sem
  guarda (`lotesParaOAutomatico` → uma fatia pelo lote, sem endereço), e os serviços internos que passam lote. Todos passam pelo mesmo bloco.
- O aviso da Etapa 237 (B1542, `#dev-loc-bloqueada`) lê a padrão da posição do cliente e apaga o Confirmar: com lote ele deixa de ser verdade.

## Regras (RN)

- **RN-239.01** — saída **com lote**, **sem origem** informada, material **sem** saldo negativo: o motor **não** valida a localização padrão.
  Valida o endereço de onde o lote começa a sair: a primeira linha do lote com saldo na ordem do claim, **pondo as de endereço bloqueado por
  último** (ordem: não bloqueada primeiro; dentro de cada grupo, a padrão, depois a maior, depois o id). Se essa primeira linha está em
  endereço bloqueado (= o lote só tem saldo em endereço bloqueado), recusa **400** *"Localização {codigo} está bloqueada"* (a literal de
  sempre, com o código do endereço do lote), antes de qualquer efeito. Linha sem endereço conta como não bloqueada.
- **RN-239.02** — o claim dessa saída drena na mesma ordem (bloqueadas por último): lote com saldo em endereço livre sai dele, mesmo com a
  padrão bloqueada e com saldo do lote nela.
- **RN-239.03** — se as linhas livres do lote não cobrem a quantidade, o claim continua nas bloqueadas (o efeito colateral da Etapa 6,
  mantido: uma saída consome o saldo do lote, área física não é filial). Só recusa quando **nenhuma** linha livre tem saldo (RN-239.01).
- **RN-239.04** — fora do escopo, sem mudança: saída **com origem** (valida a origem, como antes); saída **sem lote** (valida a padrão, como
  antes — a devolução ao cliente de material sem lote continua recusada com a padrão bloqueada); material que **permite negativo** com lote
  (a linha é criada na padrão: continua validando a padrão); entrada, transferência, ajuste e estorno.
- **RN-239.05** — integração: material de cliente com controle de lote, padrão P bloqueada, lote L1 entrado em A: a devolução ao cliente
  (`POST /materiais-cliente/devolucoes`, `lote_id`) responde **201** e baixa A (antes: 400 *"Localização P está bloqueada"*); com o lote
  só em X bloqueada → 400 *"Localização X está bloqueada"*, nada sai; a posição continua dizendo `localizacao_padrao_bloqueada: true`.
- **RN-239.06** — tela: o aviso `#dev-loc-bloqueada` (texto da 237, sem mudança) e o Confirmar apagado ficam só para a devolução que sai
  **sem lote**: material **sem** controle de lote e, se tiver série, sem as séries marcadas de **um** lote só (a frase *"As séries marcadas
  saem do lote X."*). Material com controle de lote, ou série com as marcadas de um lote: sem aviso, Confirmar habilitado.
- **RN-239.07** (Fase 2, achados B e C; **reescrita na Fase 5**) — a parte automática da entrega (`lotesParaOAutomatico`) põe o lote **sem**
  parte guardada que só tem saldo em endereço bloqueado no **fim** da fila (saldo inteiro; FEFO entre os outros). *A versão da Fase 2 dizia
  "conta só o que está fora de endereço bloqueado" — **estava errada**: o que faltava saía "sem lote" (Fase 5, achado 1).* Sem isto o FEFO escolhia um lote guardado só em endereço bloqueado e o motor recusava a entrega inteira (ou o 2º item
  depois do 1º baixado), e a tela oferecia o que a entrega recusa.
- **Estorno (Fase 2, achado A) — sem mudança, declarado:** o estorno da saída sem origem devolve na linha da **padrão**
  (`mov.localizacao_origem_id || padrão`; pendência antiga da spec 10, "o endereçamento pode consolidar"). Com a padrão bloqueada, o lote
  volta para dentro dela: a próxima saída desse lote sem origem é recusada até desbloquear (ou transferir). Vira aviso **C** da 239.

## Contratos (congelados)

- Nenhuma rota nova, nenhum campo novo. Muda só o resultado: `POST /api/almoxarifado/movimentacoes/v2` (e v1), `POST
  /api/almoxarifado/materiais-cliente/devolucoes` e todo chamador do motor que sai com lote sem origem.
  - antes 400 *"Localização {padrão} está bloqueada"* → agora 201/200 quando o lote tem saldo em endereço livre;
  - antes 201 → agora 400 *"Localização {codigo} está bloqueada"* quando o lote só tem saldo em endereço bloqueado (o código é o do endereço
    do lote: a padrão se o lote tem saldo nela, senão a maior linha).
  - Lote sem saldo nenhum: a recusa de sempre do saldo (*"Saldo insuficiente…"*), não mais a do bloqueio da padrão.
- `claimSaldoDoLote(db, materialId, loteId, locPreferida, quantidade, { aplicados, bloqueadasPorUltimo })` — opção nova, `false` por padrão
  (com origem a ordem é a de antes).

## Tasks (tronco → galho)

- [x] **T1 (tronco, motor)** — `e21132d1` (com a RN-239.07 reescrita na Fase 5 e o campo da posição); — `stockService`: validação nova + ordem do claim; teste `saidaLotePrateleiraDoLote.api.test.js` (RN-239.01 a
  .05, inclusive o cenário de integração pela rota da devolução ao cliente e pela v2, e o estorno da saída que voltou ao endereço do lote).
  TDD com controle positivo (sabotar a ordem; sabotar a validação de volta para a padrão).
- [x] **T2 (galho, tela; depende só do contrato)** — `9e33f948` (com o caso do saldo negativo, Fase 5); — `MateriaisClienteAlmoxarifado.js`: condição do aviso (RN-239.06); testes em
  `MateriaisClienteDevolucaoLocalBloqueado.test.js` (lote: sem aviso e POST com `lote_id`; série com as marcadas de um lote: sem aviso).
- [x] **T3** — suítes completas, Fase 5 (revisor adversarial fresco), fechamento (este commit).

Pontos de atenção: a validação nova roda dentro da trava do material (o motor inteiro roda); o `bloqueada` da localização não é protegido
pela trava (como hoje: bloquear entre a validação e o claim deixa sair — RN-239.03 tolera). Outros chamadores internos que saem com lote sem
origem passam a ser recusados quando o lote só está em endereço bloqueado (cada um compensa no próprio try/catch): sucata sem NC
(`scrapDisposalService`), retalho (`scrapService`), remessa e consumo em terceiros (`thirdPartyService`) — cobertos pela regra do motor, sem
teste próprio (a v2, a devolução ao cliente e a entrega provam a regra).

## Fase 2 (revisão do plano por agente fresco) — achados e o que foi feito

- **A (travava)** — o T1 prometia "o estorno volta ao endereço do lote"; o código devolve na padrão. Corrigido o plano (o estorno não muda,
  declarado acima) e o teste afirma o que acontece (A 3, P 2).
- **B e C (travavam)** — a entrega por lote sem guarda contava a parte bloqueada: RN-239.07 nova (`requisitionService.lotesParaOAutomatico`).
- **Docstring do claim e spec 10** dizem que só a declarada (ou a padrão) é validada — passam a estar erradas para a saída com lote sem
  origem: corrigidas no fechamento, dizendo que estavam erradas.
- **Resíduo** — a validação lê `quantidade > EPS` (uma linha de pó em A não libera a saída que drenaria X).
- **T2 depende de T1 no comportamento** (sem o motor, a tela habilitaria o Confirmar e o servidor recusaria): os dois entram juntos (mesmo push);
  o teste da tela cobre a série nas duas direções.

## Fase 5 (revisão adversarial por agente fresco) — achados e o que foi feito

Quatro achados reproduzidos por sonda executada (`scratchpad/sonda239-a.js`, `-b.js`):

1. **Real, corrigido — a RN-239.07 da Fase 2 estava errada.** Descontar a parte bloqueada do lote sem guarda fazia o que o lote não cobria
   sair **sem lote** (lote só em X bloqueada, entrega de 3 → `SAIDA` sem lote, linha *P/sem lote* −3, *X/L1* 3 com o físico em 0). Trocado
   por: o lote guardado **só** em endereço bloqueado vai para o **fim** da fila, com o saldo inteiro (os outros lotes saem antes; se só ele
   cobre, o motor recusa com o código do endereço e nada vai para "sem lote"). Teste novo `[RN-239.07] so o lote em endereco bloqueado`.
2. **Real, corrigido — regressão de tela:** material de cliente com lote **e** saldo negativo permitido (no material ou global): o motor
   continua conferindo a padrão, e a janela tinha passado a habilitar o Confirmar. A posição ganha `permite_saldo_negativo` (o efetivo) e a
   janela mantém o aviso nesse caso. Fixture `posicaoCliente.rota.json` regravada (`CRM_GRAVAR_FIXTURE=1`; a `remessa.rota.json` regravada
   junto só mudava número e datas e foi descartada, como na 237).
3. **Real, declarado (C545):** a baixa da peça com série não segue a prateleira da série (série em X bloqueada sai e baixa a linha de A).
   Já não seguia antes (a ordem antiga também não olhava a série); a 239 só troca qual linha erra. Corrigir é fazer o claim do lote seguir
   as séries — fora do porte.
4. **Esperado, declarado (D (239) 1):** um resto mínimo numa prateleira livre deixa o lote sair quase todo da bloqueada — é a RN-239.03 (a
   regra da Etapa 6). Mantido (B1543).

Suspeitas não reproduzidas (sucata ligada a NC com a peça reprovada em endereço bloqueado; inspeção/retido no lote sem guarda) ficam
registradas aqui; nenhuma muda a regra.

## Próxima tarefa detalhada

Item 6 da estimativa de 18/11 (`docs/estimativas/2026-11/estimativa_2026-11-18_cadastro-e-almoxarifado-semana.md`, 1h): **escolher de onde
sai a devolução ao cliente** (a **D (236)** 1, B1541), módulo Almoxarifado, fatia de tela.

- **Contrato que ela consome (já existe, não reabrir):** `POST /api/almoxarifado/materiais-cliente/devolucoes` aceita `localizacao_origem_id`
  (`DevolucaoClienteSchema`, `z.number().int().optional()`) e passa ao motor; com origem, o motor valida **a origem** (bloqueada → *"Localização
  X está bloqueada"*) e drena as outras linhas do lote se ela não cobrir (a regra da Etapa 6; a 239 não mexeu na saída com origem). A lista de
  endereços com saldo: `GET /api/almoxarifado/estoque/:materialId/saldos` (linhas com localização, lote e `lote_esta_impedido` — Etapa 224);
  o seletor **Sai de** da entrega é o molde de rótulo.
- **Tela:** `client/src/components/almoxarifado/MateriaisClienteAlmoxarifado.js` (janela *Devolver ao cliente*). Campo **Sai de** opcional
  ("Qualquer endereço (automático)" = sem origem, como hoje); com lote escolhido, só os endereços daquele lote; endereço bloqueado apagado.
- **O aviso da 237/239** (`#dev-loc-bloqueada`, `padraoBloqueada`): com uma origem escolhida (livre), a padrão não importa — o aviso some
  e o Confirmar habilita também na devolução **sem lote** (é o que resolve a D (236) 1 de vez). Teste: `MateriaisClienteDevolucaoLocalBloqueado`.
- **Pontos de atenção:** com origem e série, as séries têm de estar na origem? (o motor não confere a prateleira da série — C545); a
  origem escolhida que não cobre a quantidade deixa o motor drenar outras linhas do lote (decidir se a janela limita ao saldo do endereço,
  como a entrega faz com a "origem estrita" — `opcoes.origemEstrita` existe no motor, a rota da devolução não o passa).

## Verificação (medida, serial, sobre o código final `9e33f948`)

- Servidor: `test:api` **632/632 arquivos OK** (631 + `saidaLotePrateleiraDoLote`); `test:almoxarifado` **44/0**; `test:validation` **4/0**;
  `test:safealter` **3/0**; `test:sqlite` **16/0**.
- Tela: `react-scripts test --maxWorkers=2` **233/233 suítes, 3147/3147 testes**; `react-scripts build` (CI=true) **Compiled successfully**.
- Uma primeira rodada do `test:api` (antes das correções da Fase 5) foi interrompida em 176 arquivos, sem falha, para não misturar código.

## Retro (4 números)

- Rodadas de correção até verde: **2** (Fase 2: estorno, entrega, resíduo; Fase 5: a fila da entrega e o saldo negativo na tela).
- Achados: Fase 2 — 3 que travavam, todos reais (A virou aviso declarado, B/C corrigidos); Fase 5 — 4 reproduzidos (2 corrigidos, 2
  declarados), 0 ruído; 3 suspeitas não reproduzidas.
- Paralelismo: nenhum galho em paralelo (T2 depende de T1 no comportamento); revisores em segundo plano enquanto se escrevia.
- Defeito que escapou: a preencher na próxima etapa.
