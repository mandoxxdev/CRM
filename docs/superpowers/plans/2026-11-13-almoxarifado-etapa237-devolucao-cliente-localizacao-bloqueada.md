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

- [x] T1 — servidor: os dois campos na posição + o teste de contrato e integração (`materialClientePosicaoLocalizacaoBloqueada.api.test.js`).
- [x] T2 — tela: aviso e botão (`MateriaisClienteDevolucaoLocalBloqueado.test.js`).
- [x] Fechamento.

Fase 2 (revisão do plano por agente) e Fase 5 (revisão por agentes) **puladas**: fatia de um campo de leitura e um aviso, sem estoque,
trava ou permissão; pedido do André por tempo. Os controles positivos (sabotagem) ficam no lugar delas.
