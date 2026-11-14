# Etapa 237 — a devolução ao cliente avisa que a localização padrão está bloqueada (fatia visível da C543)

> Usando a skill `desenvolver-etapa`, em forma curta (pedido do André: pouco tempo, teto de 1 h). Estimativa:
> `docs/estimativas/2026-11/estimativa_2026-11-13_almoxarifado-devolucao-cliente-localizacao-bloqueada.{txt,md}` (1h, commit `7434cd7e`).

## Fase 0 — o que foi medido e por que esta fatia

Candidatos (sobre `da1b8d19`):

- **Próxima tarefa detalhada da 236** (resto da **D (233) 3**, fluxos internos de saída de peça com série): quatro serviços do motor, as
  travas e o estorno de cada um — porte de motor (3 h ou mais). **Não cabe em 1 h; continua a próxima** (ver o fim deste plano).
- **C543 no motor:** a recusa *"Localização R5L-3 está bloqueada"* vem de `validarLocalizacaoParaMovimento(db,
  resolveLocalizacaoSaida(material, localizacao_origem_id), …)` (`stockService.js:1565`), que vale para **toda** saída sem origem explícita —
  Movimentações também. A saída com lote baixa a linha do lote onde ela estiver (`claimSaldoDoLote`), então a validação olha um endereço
  que nem é o de onde a peça sai. Corrigir é mudar a regra de saída do motor. Não cabe.
- **C542** (o saldo do seletor é o físico do lote, não o livre): régua do que a lista de lotes conta. Não cabe.
- **Escolhido:** a fatia visível da C543. A janela sabe de antemão que a devolução vai ser recusada e diz por quê, em vez de deixar o
  usuário preencher tudo e tomar o erro ao confirmar.

## Regras (RN)

- **RN-237.01** — `GET /api/almoxarifado/materiais-cliente/posicao` traz em cada item `localizacao_padrao_codigo` (texto; `null` sem
  localização padrão) e `localizacao_padrao_bloqueada` (`true`/`false`; `false` sem localização padrão). Campos novos, só leitura; nenhum
  campo antigo muda.
- **RN-237.02** — integração: `localizacao_padrao_bloqueada === true` exatamente quando a devolução sem origem é recusada com
  *"Localização {codigo} está bloqueada"*; desbloqueada, a mesma devolução sai (201).
- **RN-237.03** — a janela *Devolver ao cliente*, com `localizacao_padrao_bloqueada === true`, mostra `#dev-loc-bloqueada`:
  > A localização padrão deste material ({codigo}) está bloqueada: a devolução será recusada. Desbloqueie a localização antes de devolver.

  e o botão **Confirmar devolução** fica desabilitado (nenhum POST).
- **RN-237.04** — sem o bloqueio (`false` ou campo ausente, servidor antigo), a janela é a de antes: sem aviso, botão habilitado.

## Decisão (letra B)

- **B1542** — aviso + botão apagado na janela; o motor não muda. Descartados: (a) mudar a regra do motor (validar só o endereço de onde a
  peça sai) — mexe em toda saída sem origem, é a **D (236)** 1 + C543 no motor; (b) só avisar e deixar confirmar — o servidor recusaria
  sempre, o clique não teria efeito. Reversível (um `disabled`).

## Tasks

- [x] T1 — servidor: os dois campos na posição + o teste de contrato e integração (`materialClientePosicaoLocalizacaoBloqueada.api.test.js`) — `ac98e771`; a fixture da posição do client — `a44d7e1c`.
- [x] T2 — tela: aviso e botão (`MateriaisClienteDevolucaoLocalBloqueado.test.js`) — `e50a98ec`.
- [x] Fechamento.

Fase 2 (revisão do plano por agente) e Fase 5 (revisão por agentes) **puladas**: fatia de um campo de leitura e um aviso, sem estoque,
trava ou permissão; pedido do André por tempo. Os controles positivos (sabotagem) ficam no lugar delas.

## Divergência do plano

- A primeira rodada do `test:api` deu **630/631**: `pdfsRemessaPosicaoFixture` confere que a fixture versionada do client
  (`client/src/utils/__fixtures__/posicaoCliente.rota.json`) tem as mesmas chaves da resposta real, e a T1 acrescentou duas. Regravada com
  `CRM_GRAVAR_FIXTURE=1` (`a44d7e1c`); a `remessa.rota.json`, regravada junto, só mudava número e datas e foi descartada. O plano não
  previa a fixture.

## Verificação (medida, serial)

- Servidor (sobre `a44d7e1c`, o código final — o fechamento só muda documentos): `test:api` **631/631 arquivos OK** (630 da 236 + o
  `materialClientePosicaoLocalizacaoBloqueada`); `test:almoxarifado` **44/0**, `test:validation` **4/0**, `test:safealter` **3/0**,
  `test:sqlite` **16/0** (rodados sobre `e50a98ec`; a `a44d7e1c` só muda a fixture JSON do client).
- Tela (sobre `e50a98ec`): `react-scripts test --maxWorkers=2` **232/232 suítes, 3137/3137 testes** (3134 da 236 + 3); `react-scripts build`
  (CI=true) **Compiled successfully**.
- Controles positivos: servidor — o booleano sempre `false` derruba 1/4; tela — tirar o `disabled` derruba 1/3, tirar o aviso derruba 1/3.

## Próxima tarefa detalhada

Continua a da 236 (sem mudança): **os fluxos internos de saída de peça com série gravam o lote das séries (resto da D (233) 3)** — ver o fim de
`docs/superpowers/plans/2026-11-13-almoxarifado-etapa236-devolucao-cliente-seletor-de-lote.md` (contrato `registrarMovimentacao(...,
{ lotePelasSeries: true })`, sondas por serviço, travas e estorno). Porte de motor (3 h ou mais): não cabia na janela de 1 h desta etapa.
Também em aberto: a **C543** no motor (validar só o endereço de onde a peça sai, junto com a **D (236)** 1); a **C542**.
