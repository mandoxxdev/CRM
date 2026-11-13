# Etapa 231 — a entrega não pré-escolhe a origem da separação em lote impedido (C532) e a Não Conformidade avisa o lote (C535)

> Usando a skill `desenvolver-etapa`. Ponto de partida: a "Próxima tarefa detalhada" de
> `docs/superpowers/plans/2026-11-13-almoxarifado-etapa230-os-aberta-lote-impedido.md` (`:208-227`). Estimativa já commitada:
> `docs/estimativas/2026-11/estimativa_2026-11-13_almoxarifado-entrega-origem-lote-impedido.txt` (**3h45**, `27e4941b`). Números de linha
> medidos sobre `1b20f920`. O C535 entra junto por ser pequeno (pedido do André: emparelhar, total até 4 h).

## Objetivo (em linguagem simples)

Quando o lote de onde a peça foi separada fica bloqueado, reprovado ou vencido **depois** da separação, a janela de entrega abre nesse
lote (com a frase da 226 embaixo) e o botão **Confirmar Entrega e Baixar Estoque** (um clique) tenta tirar de lá — os dois só descobrem
na recusa. Depois desta etapa: a janela abre em *"Escolha de onde sai"* (nada pré-escolhido), a opção do lote impedido vem apagada e o
**Confirmar Entrega** espera a escolha; o botão de um clique vem apagado com uma frase dizendo qual item e qual lote, apontando para
**Entregar escolhendo de onde sai…**. E a tela **Não Conformidades**, ao aceitar peças de um lote impedido, avisa como a **Inspeções**.

## Fase 0 — medido em 2026-11-13 (sobre `1b20f920`)

1. **A pré-seleção da entrega** (`RequisicoesList.js:784-809`): com planejada pendente e quantidade ≤ parte, põe `valorPlanejada(item)`
   sempre que a opção está nas linhas — impedida ou não (B1494). Com quantidade > parte: `''` **sem** `automatico` (o servidor aplica a
   planejada à parte). Busca de saldos falhou: `VALOR_PLANEJADA_SEM_SALDOS`. Nos três a porta aplica/recebe a planejada impedida → recusa.
2. **A opção da planejada impedida** fica escolhível na entrega (`opcaoDesabilitada`, `:211`, B1493) — só porque era pré-selecionada.
3. **As frases da 226**: `fraseOpcaoImpedida` (escolhida impedida) e `frasePlanejadaImpedida` (`:215`, só com `''` sem `automatico`),
   ambas pelo `id` `entrega-dica-lote-impedido-<item>` (`:2735-2746`).
4. **O botão de um clique** (`:2166-2171` em `EM_SEPARACAO`/`SEPARADA`… e `:2196-2201` em `PRONTA_PARA_RETIRADA`): `handleConfirmarEntrega
   ({ direto: true })` (`:1198`) manda só `item_id` + `quantidade_atendida` (as de `quantidadesIniciaisEntrega`); o servidor aplica a planejada
   (`requisitionService.js` ~`:2660`) e recusa com `<material>: a origem da separação (Z-02) não serve mais (…) — entregue escolhendo de onde
   sai` (ou a recusa do lote de `checarOrigemItem`). **O detalhe não diz a situação do lote da separação**: só `lote_separacao_codigo`
   (`routes/almoxarifado.js:4041`, `LEFT JOIN lotes_almoxarifado ltsep`; `normalizarItem` espalha o resto).
5. **A entrega pode tirar de outro endereço** (a pergunta da B1493): escolher outro par, ou "Qualquer endereço" (`origem_automatica:
   true`), é a **troca** da Etapa 63 — grava `substituicoes_origem_requisicao` e aceita o "Motivo da troca". O automático pula lote impedido
   (Etapa 206). A Etapa 226 descartou a **tela** trocar sozinha (as peças da caixa saíram daquele lote: o livro diverge do físico se o
   almoxarife entregar as peças do lote impedido); esta etapa mantém isso — quem troca é o almoxarife.
6. **C535**: `nonConformityService.decidirEExecutar` (`:1004-1016`) chama `aposLiberacaoSemFalhar` e **descarta** o retorno; o retorno traz
   `lote_impedido: { id, codigo }` quando nada foi distribuído por causa do lote (Etapa 229, `reservaChegadaService.js:636`). A rota
   (`routes/almoxarifado/extended.js:1245`) devolve `{ ...nc, liberacao }`. A tela (`NaoConformidadesAlmoxarifado.js:350-368`) mostra
   `liberacao.mensagem` num `toast.success`. Molde: `InspecoesAlmoxarifado.js:294-297` (`toast.warn`).
7. **Celular (Etapa 24)**: nenhuma outra tela chama `/entregar` (`grep` em `client/src` — só `RequisicoesList.js`). A Fila de separação só
   navega para o detalhe.

## Caminhos

- **(escolhido)** o detalhe ganha a situação do lote da separação (aditivo); a janela abre em *"Escolha de onde sai"* quando a planejada
  pendente está num lote impedido, a opção dela vem apagada e o **Confirmar Entrega** espera a escolha; o botão de um clique vem apagado
  com a frase.
- **(descartado)** a tela pré-escolher "Qualquer endereço (automático)" — troca silenciosa; a 226 já descartou (Fase 0, item 5).
- **(descartado)** pré-escolher `''` sem automático (o de hoje acima da parte): o select mostra "Qualquer endereço (automático)" e o servidor
  aplica a planejada — o rótulo mente.
- **(descartado)** buscar os saldos no clique do botão de um clique (sem mexer no servidor): o botão só avisaria depois do clique, que é o
  que o C532 pede para acabar.

## Decisões (letra B — reversíveis; livres B1517 a B1522 e C536, conferido por `grep` em `docs` e `specs`)

- **B1517 — o detalhe diz a situação do lote da separação.** `GET /api/almoxarifado/requisicoes/:id` ganha por item, aditivo:
  `lote_separacao_status` (texto|null), `lote_separacao_validade` (texto|null), `lote_separacao_esta_impedido` (booleano),
  `lote_separacao_vencido_sem_liberacao` (booleano) — a régua da 224 (`predicadoLoteImpedidoSql`/`predicadoLoteVencidoSql`, o "hoje" de
  Brasília), falsos sem lote da separação. Descartado: buscar no clique.
- **B1518 — a janela não pré-escolhe a planejada impedida.** Item com planejada pendente (`pendentePlanejado > 0`) cujo lote está impedido
  (pela linha de saldo; sem linhas — busca falhou ou o par sumiu — pelo campo da B1517) abre em `VALOR_ESCOLHER_ORIGEM` (`'__escolher__'`),
  a opção `Escolha de onde sai (o lote da separação não sai)`, que só existe nesse item. Vale também acima da parte (antes `''` sem
  automático). Revoga a pré-seleção da planejada impedida da **B1494** (na entrega) e a exceção da **B1493**: a opção da planejada impedida
  passa a vir **apagada** como as outras impedidas. A frase da B1497 aparece com o `__escolher__`.
- **B1519 — o Confirmar Entrega espera a escolha.** Desabilitado enquanto algum item com quantidade > 0 está em `__escolher__` ou numa opção
  impedida; `title`: `Escolha de onde sai cada item com o lote da separação impedido`. Quantidade 0 no item libera (entrega os outros).
- **B1520 — o botão de um clique vem apagado e diz por quê.** Quando algum item com quantidade inicial > 0 tem planejada pendente
  (`pendentePlanejado > 0`) e `lote_separacao_esta_impedido === true`: os dois botões **Confirmar Entrega e Baixar Estoque** ficam
  `disabled` e, embaixo, uma frase por item. **Entregar escolhendo de onde sai…** continua habilitado.
- **B1521 — a NC avisa o lote (C535).** `liberacao.lote_impedido` (o código do lote) entra na resposta de `POST /nao-conformidades/:id/decidir`
  **só** quando a aceitação liberou e nada foi para quem espera por causa do lote (as chaves de hoje continuam as mesmas nos outros casos).
  A tela mostra, além do toast de sempre, `toast.warn` com a frase.
- **C536 (aviso) — a situação é a da hora da leitura.** O botão de um clique segue a situação do detalhe carregado; a janela, a das linhas
  de saldo da hora em que abriu. O lote liberado no meio só aparece ao reler (voltar à aba, reabrir).

## Regras de negócio (RN-231.xx)

Cenário-base da tela: item `id 1`, *Chapa 3mm*, separado 5 com 3 de Z-02/L2 (`origem_separacao_id 4`, `lote_separacao_id 12`,
`quantidade_origem_separacao 3`), entregue 2, entregável 3; linhas de saldo A-01 (sem lote, 10), XB-01/L1 (ATIVO, 4), Z-02/L2 (BLOQUEADO, 6).

| RN | Enunciado | Cenário |
|---|---|---|
| RN-231.01 | O detalhe diz a situação do lote da separação | servidor: separar 3 de Z-02/L2, bloquear L2 → `GET /requisicoes/:id` item com `lote_separacao_esta_impedido: true`, `lote_separacao_status: 'BLOQUEADO'`, `lote_separacao_vencido_sem_liberacao: false`; L2 de volta a ATIVO → `false`; vencido ontem → `true` e vencido `true`; item sem lote da separação → os dois `false`, status `null` |
| RN-231.02 | A janela abre em "Escolha de onde sai" e a opção da planejada impedida vem apagada | a janela de PARCIAL com L2 BLOQUEADO → o select em `__escolher__`, a opção `Z-02 — lote L2 (6) — Bloqueado: não sai` `disabled`, `#entrega-dica-lote-impedido-1` = `Já separado de Z-02 — lote L2: Bloqueado. Essa parte não sai até o lote ser liberado na tela Lotes e Séries — na entrega, escolha outro endereço.`; com L2 ATIVO → o select em `4:12` (controle) |
| RN-231.03 | O Confirmar Entrega espera a escolha | em `__escolher__` com quantidade 3 → `disabled`; escolhe XB-01/L1 → habilitado e o `PUT /requisicoes/55/entregar` vai com `localizacao_origem_id 2, lote_id 7`; escolhe "Qualquer endereço" → habilitado e vai com `origem_automatica: true`; quantidade 0 no item → habilitado |
| RN-231.04 | Acima da parte também | separado 5 com parte 1 de Z-02/L2, entregável 3 (quantidade > parte) e L2 BLOQUEADO → `__escolher__` (antes `''` sem automático); com L2 ATIVO → `''` (controle, o de hoje) |
| RN-231.05 | Saldos que falharam: o campo do detalhe decide | busca de saldos com erro, item com `lote_separacao_esta_impedido: true` → `__escolher__` e a frase com `Bloqueado`; com `false` → `Planejada da separação (Z-02)` (o de hoje) |
| RN-231.06 | O botão de um clique vem apagado e diz por quê | detalhe PARCIAL com `lote_separacao_esta_impedido: true, lote_separacao_status: 'BLOQUEADO'` → **Confirmar Entrega e Baixar Estoque** `disabled`; frase `#entrega-direta-lote-impedido` = `Chapa 3mm: separado de Z-02 — lote L2 (Bloqueado). A entrega direta sairia de lá e seria recusada — use "Entregar escolhendo de onde sai…".`; **Entregar escolhendo de onde sai…** habilitado; com `false` → habilitado e sem frase (controle); em `PRONTA_PARA_RETIRADA` o mesmo |
| RN-231.07 | Só a parte pendente da planejada conta | `quantidade_origem_separacao 0` (a parte já entregue) com `lote_separacao_esta_impedido: true` → botão habilitado, janela sem `__escolher__` |
| RN-231.08 | As palavras são as do extrato | `REPROVADO` → `(Reprovado)`; vencido `2026-11-10` → `(Vencido em 10/11/2026)` |
| RN-231.09 | Integração servidor: o caminho da troca funciona com a planejada impedida | separar 3 de Z-02/L2, bloquear L2, entregar com `origem_automatica: true` → 200, baixa de XB-01/L1, uma substituição gravada; entregar sem chave (o um clique) → 400 com a recusa de sempre (prova que a tela apaga o botão certo) |
| RN-231.10 | A NC diz o lote (C535) | servidor: a NC aceita 4 de L1 BLOQUEADO → `liberacao.lote_impedido === 'L1'`; com L1 ATIVO → a chave ausente e as chaves de `liberacao` as de hoje (controle) |
| RN-231.11 | A tela da NC avisa | resposta com `liberacao.lote_impedido: 'L1'` → `toast.warn('O lote L1 continua bloqueado, reprovado ou vencido: as peças aceitas vão para quem espera quando o lote for liberado.')` além do `toast.success` de sempre; sem a chave → nenhum `warn` |

## Contratos congelados

- `GET /api/almoxarifado/requisicoes/:id` — cada item ganha (aditivo) `lote_separacao_status`, `lote_separacao_validade`,
  `lote_separacao_esta_impedido` (booleano), `lote_separacao_vencido_sem_liberacao` (booleano). Nenhum campo existente muda. Só `=== true` conta.
- `POST /api/almoxarifado/nao-conformidades/:id/decidir` — `liberacao.lote_impedido` (texto) **só** no caso impedido. Recusas iguais.
- `PUT /requisicoes/:id/entregar` — **não muda** (recusa certa).

Literais da tela:

- opção: `<option value="__escolher__">Escolha de onde sai (o lote da separação não sai)</option>`;
- frase do item na janela: a da B1497 (`frasePlanejadaImpedida`), sem mudança de texto;
- `title` do Confirmar Entrega apagado pela escolha: `Escolha de onde sai cada item com o lote da separação impedido`;
- frase do um clique, por item, num `<div id="entrega-direta-lote-impedido">` (uma linha por item):
  `` `${material_nome}: separado de ${origem_separacao_codigo} — lote ${lote_separacao_codigo} (${situacao}). A entrega direta sairia de lá e seria recusada — use "Entregar escolhendo de onde sai…".` ``
  com `situacao = situacaoDoLote({ lote_esta_impedido, lote_status, lote_validade, lote_vencido_sem_liberacao })` dos campos da B1517;
- NC: `` `O lote ${lote} continua bloqueado, reprovado ou vencido: as peças aceitas vão para quem espera quando o lote for liberado.` ``

## Fase 2 — revisão do plano (1 revisor fresco)

Rodou junto com a escrita dos testes. **Confirmado:** a rota do detalhe é `GET /api/almoxarifado/requisicoes/:id` e o `normalizarItem` espalha
o resto; `decidir` devolve `{ ...nc, liberacao }`; o `aposLiberacaoSemFalhar` sob trava devolve o resultado com `lote_impedido`; o um clique
com a parte pendente aplica a planejada e recusa; `origem_automatica` pula a planejada, grava a troca e o automático só tira de lote
elegível; `pendentePlanejado` é a régua do servidor (`parteDaOrigem`); `__escolher__` não manda chave nem motivo; T1 e T2 independentes.
**2 importantes:** (I1) busca de saldos falha: a opção *"Planejada da separação"* continuava escolhível e levava à recusa → ela some quando o
detalhe diz que o lote está impedido (RN-231.05); (I2) material com **série**: em `__escolher__` ou automático a lista de séries mistura os
lotes e o almoxarife pode marcar as séries do lote impedido (as da caixa) → a porta recusa *"Lote L2 esta bloqueado"* — **fica de fora**,
registrado em **D (231)** 1 (a lista de séries é de outra régua, 61; mexer nela é outra etapa). **4 menores:** (M3) o Confirmar ficava
habilitado antes de as linhas de saldo chegarem → o detalhe segura (RN-231.03, cenário M3); (M4) com a parte da planejada já entregue a frase
"essa parte não sai" aparecia → a frase exige a parte pendente (RN-231.07); (M5) a frase com a busca falha não tinha de onde vir → montada
pelos campos do detalhe (mesmo texto); (M6) a NC com OS aberta: o liberado vai para a reserva da OS e a frase "vão para quem espera quando o
lote for liberado" continua verdadeira para a requisição da OS (a 230 passa a reserva no liberar) — igual à Inspeções; a NC só conhece o lote
pela inspeção (`insp.lote_id`) — NC sem inspeção não avisa (nem libera). A RN-231.09 "baixa de XB-01/L1" ficou medida pelo saldo (o livro do
automático não tem `localizacao_origem_id`).

**Desvio do plano nos arquivos:** o RN-231.10 entrou em `liberacaoLoteImpedido.api.test.js` (reusa o `cenarioNc` da 229) e o RN-231.11 em
`NaoConformidadesAlmoxarifado.test.js` (reusa o `decidirCom`), em vez de arquivos novos.

## Limitações (D (231))

1. **Série (Fase 2 I2).** Com a janela em *"Escolha de onde sai"* ou em automático, a lista de séries mostra as do lote impedido; marcadas,
   a porta recusa ao confirmar (a recusa de sempre).
2. **A situação é a da leitura (C536).** O botão de um clique segue o detalhe carregado; a janela, as linhas da hora em que abriu.
3. **O lote liberado depois de abrir a janela** não volta a pré-escolher a planejada (a escolha feita fica); fechar e abrir de novo pré-escolhe.

## Tasks (sort topológico)

- [ ] **T1 (tronco, servidor)** — `server/tests/api/entregaOrigemLoteImpedido.api.test.js` (RN-231.01, .09, .10) vermelho → as quatro colunas no
  detalhe (`routes/almoxarifado.js`, os booleanos em `normalizarItem` só se a coluna veio) e `liberacao.lote_impedido` em
  `decidirEExecutar` → verde.
- [ ] **T2 (galho, tela, contra o contrato acima)** — `client/src/components/almoxarifado/RequisicoesEntregaOrigemImpedida.test.js`
  (RN-231.02 a .08) e `NaoConformidadesLoteImpedido.test.js` (RN-231.11) vermelhos → `RequisicoesList.js`, `NaoConformidadesAlmoxarifado.js`
  → verdes. Os testes da 226 que fixavam a B1493/B1494 na entrega (RN-226.06 entrega, .09, .12 entrega) mudam junto, citando a B1518.
- Integração: a RN-231.09 (servidor, rota real) prova que o botão apagado corresponde à recusa e que o caminho que a tela oferece passa; a
  RN-231.03 (tela) prova o payload do caminho escolhido.

## Sabotagens previstas (controle positivo)

1. servidor: `lote_separacao_esta_impedido` sempre 0 → .01 cai; sem a conversão a booleano → .01 cai (`=== true`);
2. servidor: não guardar o retorno do `aposLiberacaoSemFalhar` → .10 cai; a chave sempre presente → .10 controle cai;
3. tela: a pré-seleção sem a guarda nova → .02, .04 caem; sem o fallback do detalhe → .05 cai;
4. tela: a opção da planejada impedida habilitada (B1493 de volta) → .02 cai;
5. tela: o Confirmar sem a guarda → .03 cai; o botão de um clique sem a guarda → .06 cai; sem `pendentePlanejado > 0` → .07 cai;
6. tela NC: sem o `warn` → .11 cai.
