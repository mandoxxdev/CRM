# 09 — Inspeção e Qualidade

> **Status:** 🟡 — quarentena e decisão de inspeção reais desde a Etapa 5; faltam plano de
> inspeção com medidas, não conformidade formal numerada, desvio autorizado e perfil QUALIDADE ·
> **Spec original:** seção 9
> **Última atualização:** 2026-08-08 (Etapa 5 — quarentena e bloqueio efetivos no saldo)

## Objetivo

Inspeção de recebimento com plano, quarentena e bloqueio efetivos no saldo, não conformidade, desvio autorizado e devolução ao fornecedor.

## O que já existe

- `inspecoes_recebimento_almoxarifado` (`schema.js`): conforme, divergência de quantidade/dimensional, certificado ausente, dano físico, material incorreto, ação, responsável — e, desde a Etapa 5, `quantidade_aprovada`, `quantidade_reprovada` e `encaminhamento` (`DEVOLVER` | `ANALISE_ENGENHARIA` | `SUBSTITUICAO` | null).
- `recebimentos_material_itens_almoxarifado.quantidade_em_inspecao` (coluna nova, Etapa 5): quanto **este item específico** está retido — é a fonte de verdade que a fila e a decisão usam, não mais o pool compartilhado do material. Nasceu com `DEFAULT 0` e ganhou backfill para bancos onde já havia retenção antes da coluna existir (ver limitação registrada abaixo).
- `inspectionService.js` (**novo**, `server/services/almoxarifado/inspectionService.js`): `decidirInspecao`, `bloquearMaterial`, `desbloquearMaterial`, `listarInspecoesPendentes`. Substitui por inteiro `receiptService.inspecionarItem`, que foi **removida** — fazia `UPDATE` SQL direto somando a mesma quantidade em `quantidade_bloqueada` **e** `quantidade_em_inspecao` ao mesmo tempo (bloquear 10 tirava 20 do disponível), sem passar pelo motor e sem deixar rastro no livro.
- Motor (`stockService.js`) ganhou quatro tipos de movimento novos em `TIPOS_MOVIMENTO`: `QUARENTENA` (`em_inspecao += q`, entrada retida), `LIBERACAO_INSPECAO` (`em_inspecao −= q`) e `REPROVACAO_INSPECAO` (`em_inspecao −= q`, `bloqueada += q`) como blocos simétricos a `BLOQUEIO`/`DESBLOQUEIO`; e `DECISAO_INSPECAO`, que é o que `decidirInspecao` **realmente** usa — um único `UPDATE` condicional que baixa o retido inteiro de `em_inspecao` e soma só a parte reprovada em `bloqueada`, para não abrir uma janela entre "libera" e "reprova" onde uma decisão concorrente poderia consumir o mesmo retido pela metade. Todos os quatro têm guarda atômica no próprio `WHERE` (nunca saturam em silêncio) e nenhum toca `quantidade_atual`.
- `DESBLOQUEIO` deixou de saturar com `MAX(0, bloqueada − q)` (que devolvia ao disponível menos do que o pedido sem avisar) e passou a recusar com 400 quando a quantidade pedida é maior que o bloqueado. `BLOQUEIO`, `DESBLOQUEIO`, `REPROVACAO_INSPECAO` e `DECISAO_INSPECAO` exigem `justificativa` (`movementRules.js`).
- Rotas (`extended.js`):
  - `POST /api/almoxarifado/recebimentos/itens/:itemId/inspecionar` — permissão `inspecionar` (perfis `ADMINISTRADOR`, `ALMOXARIFE`); aponta para `inspectionService.decidirInspecao`.
  - `GET /api/almoxarifado/inspecoes/pendentes` — só `auth` (qualquer usuário autenticado do módulo, sem checagem de perfil por ação — é leitura).
  - `POST /api/almoxarifado/materiais/:id/bloquear` e `POST /api/almoxarifado/materiais/:id/desbloquear` — permissão `ajustar_estoque` (perfis `ADMINISTRADOR`, `GESTOR`; **não** inclui `ALMOXARIFE` — quem decide inspeção não necessariamente pode bloquear/desbloquear material avulso pela tela nova, é uma permissão diferente da de inspecionar).
- Tela `InspecoesAlmoxarifado.js` (`client/src/components/almoxarifado/`): fila de pendentes com material/quantidade retida/recebimento/dias em espera, modal de decisão (aprovar total ou parcial, reprovar com observação obrigatória e encaminhamento), e bloqueio/desbloqueio avulso com justificativa obrigatória. Rota `/almoxarifado/inspecoes`, item "Inspeções" no menu (`Layout.js`).
- Tabela órfã `controle_qualidade` (`server/index.js`, `CREATE TABLE` perto da linha 19589): **verificado em 2026-08-08, continua órfã para escrita** — nenhum `INSERT`/`UPDATE` em todo o repositório grava nela. É lida (`SELECT`) só em cálculos de dashboard de produção/OEE (`server/index.js`, três consultas perto das linhas 22470/22557/22696), que referenciam `lote_id`/`os_id` — um domínio de qualidade de **produção**, não do almoxarifado — e por isso sempre retornam vazio (nada nunca insere ali). A Etapa 5 não tocou nessa tabela nem a reaproveitou: `inspecoes_recebimento_almoxarifado` é uma tabela diferente e é a que este README documenta. Ignorar continua sendo a recomendação — não há caminho de escrita para reaproveitar.

## Checklist

### Backend
- [ ] Planos de inspeção (por material/família: o que medir, critérios) — **fora do escopo da Etapa 5** (decisão do design 2026-08-07): liga com a feature 16 (calibração de instrumentos), que também não existe ainda.
- [ ] Registro de medidas + instrumento de medição utilizado (liga com feature 16) — **fora do escopo da Etapa 5**, mesmo motivo acima.
- [x] Resultado: aprovar / aprovar parcialmente / reprovar lote — com efeito no saldo (aprovado → disponível; reprovado → bloqueado) — **Etapa 5 (2026-08-08)**: `inspectionService.decidirInspecao` (`dc841f2`, corrigida para claim atômico em duas fases em `91184ca`, backfill e teste discriminante da fila em `436eed2`). Aprovação parcial testada: `quantidade_aprovada + quantidade_reprovada` tem de fechar exatamente com o retido, senão recusa antes de qualquer efeito no saldo.
- [x] Quarentena como estado real: entrada inspecionável nasce `em_inspecao`, aprovação move para disponível via movimentação — **Etapa 5**: motor (`c37b67e`) + entrada retida em vez de barrada (`4db5e11`) + decisão via `DECISAO_INSPECAO` (`91184ca`). **A spec estava descrevendo um objetivo que a implementação anterior não cumpria** — verificado em 2026-08-07 (design da etapa) que `darEntradaEstoque` na verdade **recusava** aprovar recebimento de item crítico sem inspeção prévia (o material nunca chegava a existir no sistema, mesmo já estando fisicamente no galpão); não era "quarentena que não funciona", era ausência total de quarentena na entrada. Está corrigido: item que exige inspeção agora entra sempre, retido.
- [x] Bloqueio de material fora de recebimento (achado em estoque) com motivo — **Etapa 5**: `inspectionService.bloquearMaterial`/`desbloquearMaterial` (`dc841f2`), rotas `POST /materiais/:id/bloquear|desbloquear` (`bbf7ed7`), botões na tela (`dcee909`). Motivo é `justificativa` obrigatória desde `c6a76a4`.
- [ ] Não conformidade formal (número, descrição, ação, responsável) vinculada à inspeção — **fora do escopo da Etapa 5** (decisão do design). O que existe é o **encaminhamento** (linha abaixo) registrado junto da reprovação — não é uma NC numerada com fluxo próprio.
- [ ] Liberação sob desvio autorizado (quem autorizou, justificativa, histórico imutável) — **fora do escopo da Etapa 5** (decisão do design).
- [x] Solicitar análise da Engenharia / devolução ao fornecedor / substituição (registrar o encaminhamento pretendido) — **Etapa 5** (`dc841f2`): o campo `encaminhamento` (`DEVOLVER` | `ANALISE_ENGENHARIA` | `SUBSTITUICAO`) é validado e gravado em `inspecoes_recebimento_almoxarifado` na reprovação.
- [ ] Encaminhamentos **com status** (acompanhar se a devolução/análise/substituição já foi executada) — **não implementado**. O `encaminhamento` de hoje é só a intenção registrada no momento da reprovação; não há campo de status nem nada que marque quando ela é cumprida. É **a pendência que esta etapa cria**, ver seção própria abaixo — a execução em si é a feature 12 (Devoluções), que ainda não existe.
- [ ] Anexos: certificado, relatório dimensional, fotos (`anexos_documento_almoxarifado`) — não implementado, fora do escopo da Etapa 5.
- [ ] Perfil QUALIDADE nas ações de inspeção (hoje só ADMIN/ALMOXARIFE — spec 28 prevê Qualidade) — **fora do escopo da Etapa 5** (decisão do design), confirmado inalterado em `permissions.js`: `inspecionar` continua `[ADMINISTRADOR, ALMOXARIFE]`. Detalhe novo: bloqueio/desbloqueio avulso usa a permissão `ajustar_estoque` (`[ADMINISTRADOR, GESTOR]`), não `inspecionar` — então mesmo sem o perfil QUALIDADE, hoje nem todo ALMOXARIFE consegue usar os botões de bloqueio avulso da tela nova (só decidir inspeção).

### Frontend
- [x] Fila de inspeções pendentes — **Etapa 5** (`dcee909`, `InspecoesAlmoxarifado.js`): lista o que está retido, de qual recebimento, há quantos dias.
- [ ] Form de inspeção com plano/medidas/fotos — existe o form de **decisão** (aprovar total/parcial, reprovar com observação obrigatória, encaminhamento, flags de divergência/dano/certificado), mas sem plano de inspeção, medidas ou fotos — depende dos itens em aberto acima (planos/medidas ligam com feature 16; fotos com anexos).
- [x] Gestão de bloqueios e quarentena (o mapa já mostra áreas — falta operação) — **Etapa 5** (`dcee909`): bloqueio/desbloqueio avulso de material agora tem botão e formulário na tela de Inspeções.

## Pendência criada por esta etapa

**Material reprovado fica bloqueado até alguém desbloquear e dar baixa manual — sem vínculo
estruturado ao recebimento de origem.** `REPROVACAO_INSPECAO`/`DECISAO_INSPECAO` movem o material
para `quantidade_bloqueada` e ele fica lá; não existe hoje nenhuma saída automática ou fluxo que
consuma esse bloqueio rumo a uma devolução ao fornecedor. Alguém precisa, manualmente,
desbloquear (`POST /materiais/:id/desbloquear`) e então lançar uma saída separada — os dois passos
não estão amarrados um ao outro nem ao `recebimento_id` que originou a reprovação. O campo
`encaminhamento` (`DEVOLVER` | `ANALISE_ENGENHARIA` | `SUBSTITUICAO`), registrado em
`inspecoes_recebimento_almoxarifado` na decisão, é o que vai permitir à **feature 12
(Devoluções)** montar a fila do que precisa voltar ao fornecedor — mas a feature 12 ainda não
existe com esse consumo. Até lá, saber o que está bloqueado por reprovação de inspeção exige
cruzar `materiais_almoxarifado.quantidade_bloqueada` com o histórico de `inspecoes_recebimento_almoxarifado`.

## Limitações verificadas (não são bugs, são trade-offs documentados)

- **Backfill da coluna `quantidade_em_inspecao` do item é ambíguo quando dois itens do MESMO
  recebimento compartilham o MESMO material** (incomum, mas possível): a migração
  (`migrateBackfillItemQuantidadeEmInspecao`, `schema.js`) só aplica quando o par
  (`recebimento_id`, `material_id`) é inequívoco — exatamente um item. Quando é ambíguo, o(s)
  item(ns) ficam com a coluna em `0` e somem da fila de pendentes, **sem log de aviso**. É seguro
  (nunca produz um número errado, porque não adivinha) mas é silencioso para o operador — só afeta
  bancos que já tinham retenção **antes** da coluna existir (janela entre `4db5e11`/`dc841f2` e
  `91184ca`/`436eed2`).
- **O livro perdeu o split aprovado/reprovado.** A decisão de inspeção grava uma única linha
  `DECISAO_INSPECAO` em `movimentacoes_almoxarifado` com o retido inteiro em `quantidade`; a
  divisão entre aprovado e reprovado só existe em `inspecoes_recebimento_almoxarifado`
  (`quantidade_aprovada`/`quantidade_reprovada`), não como colunas na própria movimentação.
  Trade-off aceito para fechar o claim atômico do material num único `UPDATE` — ver `91184ca`.
- **`cancelarMovimentacao` (estorno) não sabe estornar os tipos novos.** Verificado em
  `stockService.js`: os ramos de reversão tratam `BLOQUEIO`/`DESBLOQUEIO` explicitamente, mas não
  têm nenhum `else if` para `QUARENTENA`, `LIBERACAO_INSPECAO`, `REPROVACAO_INSPECAO` nem
  `DECISAO_INSPECAO` — estornar uma dessas movimentações grava a linha `ESTORNO` no livro (marca a
  original como cancelada) **sem desfazer** `quantidade_em_inspecao`/`quantidade_bloqueada`. É um
  gap pré-existente do motor (o mesmo padrão faltava para os tipos de reserva antes da Etapa 4) que
  os quatro tipos novos herdaram. No front, `MovimentacoesAlmoxarifado.js` (`podeEstornar`) não
  exclui esses tipos — o botão de estornar aparece habilitado para eles como qualquer outra
  movimentação, sem aviso de que o efeito é parcial.

## Regras essenciais + testes de API exigidos

| Regra | Teste |
|-------|-------|
| Entrada de item que exige inspeção soma ao físico e ao `em_inspecao`; disponível não sobe | `item critico entra no fisico mas fora do disponivel` — `server/tests/api/recebimentoQuarentena.api.test.js` |
| Material em quarentena (`em_inspecao`) não pode sair | `material em quarentena nao pode sair` — `server/tests/api/quarentenaMotor.api.test.js` |
| Saída de material bloqueado (`quantidade_bloqueada`) falha | guarda pré-existente em `stockService.js` (`"Material bloqueado não pode ser utilizado"`), não é uma regra nova desta etapa — sem teste de API dedicado no módulo |
| Aprovar inspeção move o retido para o disponível exatamente uma vez | `aprovar tudo move o retido para o disponivel` + `aprovar duas vezes nao duplica saldo` — `server/tests/api/inspecaoDecisao.api.test.js` |
| Reprovar move de `em_inspecao` para `bloqueada` num único movimento, sem reabrir o disponível no meio | `reprovar move o retido para bloqueado, sem tirar do galpao` — mesmo arquivo, via `DECISAO_INSPECAO` (`stockService.js`) |
| Aprovação parcial: aprovado vai ao disponível, reprovado ao bloqueado, soma = retido | `aprovacao parcial divide entre disponivel e bloqueado` + `aprovado + reprovado tem de fechar com o retido` — mesmo arquivo |
| Reprovar registra o encaminhamento pretendido; encaminhamento inválido é recusado | `reprovar registra o encaminhamento pretendido` + `encaminhamento invalido e recusado` — mesmo arquivo |
| Bloquear/desbloquear avulso exige justificativa e gera movimentação no livro | `BLOQUEIO sem justificativa e recusado`, `bloqueio avulso tira do disponivel e deixa rastro` — `bloqueioGuardas.api.test.js` e `inspecaoDecisao.api.test.js` |
| Desbloquear devolve ao disponível e não passa do que estava bloqueado | `DESBLOQUEIO acima do bloqueado falha em vez de saturar` — `bloqueioGuardas.api.test.js` |
| Decisão concorrente para o mesmo item não duplica saldo nem libera material reprovado | `decisao parcial concorrente nao duplica saldo nem libera material reprovado` — `inspecaoDecisao.api.test.js` (`91184ca`) |
| Rotas exigem a permissão correta (`inspecionar` / `ajustar_estoque`) e 403 não altera saldo | `POST inspecionar sem permissao retorna 403...`, `POST bloquear sem permissao retorna 403...` — `server/tests/api/inspecaoRotas.api.test.js` |
| Lote reprovado não sai para consumo | não implementado — depende do controle de lote/série (feature 10), que ainda não existe |
| Desvio autorizado exige responsável + justificativa e fica registrado | não implementado — fora do escopo da Etapa 5 |

## Dependências

- 08 (recebimento dá entrada retida; este README decide o que a 08 apenas reteve) · 03 (efeitos no saldo via movimentação) · 10 (reprovação por lote/série, ainda não existe) · 12 (Devoluções — vai consumir o `encaminhamento` registrado aqui) · 16 (calibração de instrumentos — plano de inspeção com medidas depende disso).
