# 06 — Motor de Aprovações

> **Status:** 🟡 — segregação/emergencial/rejeição justificada/auditoria entregues (Etapa 3, 2026-08-05); **regras configuráveis com N aprovações, avaliador no envio, gate nas duas lanes, lembrete por pendência e as duas telas entregues na Etapa 47 (2026-09-30)**. **Etapa 48 (2026-09-30): urgência e material de cliente como critério, urgência como lista fechada, e a fila da lane simples.** Falta para 🟢: **material fora da lista técnica** (depende da feature 22, que não existe) e **dupla aprovação de ajuste** (espera a decisão **B11**) — nenhum dos dois cabe numa etapa sem essas dependências · **Spec original:** seção 6
> **Última atualização:** 2026-09-30 (**fechamento da Etapa 48** — ver "Etapa 48" abaixo; e **duas frases da
> seção da Etapa 47 estavam erradas** depois da revisão do código dela — corrigidas ali, à vista).
> Antes: 2026-09-30 (**fechamento da Etapa 47** — as duas correções desta spec, ditas no formato
> "dizia X; estava errado; o certo é Y").
> Antes: 2026-08-29 (**Fase 0 da Etapa 28, medida no código — esta spec estava
> congelada em 2026-08-11 e TRÊS itens do checklist descrevem código que já mudou**; corrigidos
> abaixo, dizendo que estavam errados. A **cor não muda**: o motor de regras configuráveis
> continua não existindo, e continua adiado por decisão de escopo, não por esquecimento.)
> Antes: 2026-08-11 (auditoria spec×código)

## Objetivo

Motor de aprovação configurável por tipo de material, valor, quantidade, projeto, urgência, criticidade e propriedade (cliente), com regras de segregação.

## O que já existe

- Aprovar/rejeitar requisição: `PUT /requisicoes/:id/aprovar|rejeitar` (`routes/almoxarifado.js`) com perfis `aprovar_requisicao` (ADMIN, ALMOXARIFE, GESTOR); aprovação passou a ser um único `UPDATE` (Etapa 3, Task 2 — antes fazia leitura+update separados).
- Aprovação por valor: `requisitionValueApprovalService.js` (**414 L** — dizia 399, contado em 2026-08-29) — limite configurável em `configuracoes_almoxarifado`, fluxo aprovar-valor/rejeitar-valor, e-mails, testes.
- Configuração "Liberação por Valor" no front (`ConfiguracoesAlmoxarifado.js`).
- Aprovação de ajuste de inventário: aprovador registrado em `conferencias_almoxarifado` (`aprovador_*`, `justificativa_ajuste`).
- **Etapa 3 (2026-08-05):** segregação nas duas lanes (aprovar e aprovar-valor) — o solicitante não pode aprovar a própria requisição (403); rejeitar a própria continua permitido nas duas lanes (desistência legítima, não é uma decisão de aprovação); rejeição (normal e por valor) exige motivo (`rejeicao_motivo`), 400 sem ele; tipo `EMERGENCIAL` exige justificativa na criação (`RequisicaoSchema.superRefine`, Task 1); toda decisão (aprovação, rejeição, confirmação de recebimento, encerramento) é auditada em `auditoria_log_almoxarifado` com `acao` (`APROVACAO`/`REJEICAO`/`APROVACAO_VALOR`/`REJEICAO_VALOR`/`CONFIRMACAO_RECEBIMENTO`/`ENCERRAMENTO`), usuário e justificativa — as duas ações de valor são gravadas na lane `/aprovar-valor` (anotadas aqui na auditoria de 2026-08-11).
- **Etapa 4, Task 6 (2026-08-06) — anotado aqui na auditoria de 2026-08-11 (até então só a spec 07 documentava):** a lane `/aprovar-valor` também **reserva** depois de aprovar — a reserva acontece na rota, após `aprovarValor`, e sobrescreve o status para `PARCIALMENTE/TOTALMENTE_RESERVADA` (sem nada a reservar, o `APROVADO` permanece). Detalhes e testes na feature 07.
- Decisão de escopo confirmada (design da Etapa 3): regras de aprovação ficam **fixas e declarativas em código** (segregação + limite por valor); a tabela `regras_aprovacao` configurável por tipo/valor/quantidade/projeto/urgência, com UI própria, fica para demanda real — não entrou nesta etapa. **Revertida pela Etapa 47 (2026-09-30):** a tabela existe, com avaliador e telas — ver abaixo.
- **Etapa 47 (2026-09-30) — regras configuráveis e N aprovações.** Desenho: `docs/superpowers/specs/2026-09-30-almoxarifado-etapa47-aprovacoes-com-regras-design.md` (seções 8, 9 e 9.7). Plano: `docs/superpowers/plans/2026-09-30-almoxarifado-etapa47-aprovacoes-com-regras.md`.
  - `regras_aprovacao` (critérios combinados por **E**: `tipo_requisicao`, `material_critico`, `valor_minimo` `>=`, `quantidade_minima` em algum item (**⚠️ estava impreciso: é algum MATERIAL, somando as linhas dele** — a revisão do código da 47 mostrou que "item = linha" deixava o solicitante contornar a regra dividindo o pedido; corrigido em `e4ee27c`), `centro_custo_id`, `projeto_id`; `aprovadores` = lista de ids de usuário) e a tabela filha `requisicao_aprovacoes_regra` (uma pendência por regra casada, `ABERTA`/`APROVADA`/`OBSOLETA`, snapshot de nome e aprovadores no envio). Serviço: `approvalRulesService.js`.
  - **O avaliador roda no envio** (`requisitionCreateService.dispararNotificacoesCriacao`), nas duas rotas de criação e no `/enviar` do rascunho, antes da avaliação de valor, e calcula o valor total na hora (a coluna ainda é 0 nesse ponto). `regras_avaliadas_em` é gravada **por último**: se o avaliador falhar, o gate **fecha**, e `/aprovar` reavalia.
  - **Assinar pendência NÃO muda o status da requisição** (desenho 9.1). O gate mora no `WHERE` do `UPDATE` que aprova — `/aprovar`, `/aprovar-valor` e as duas auto-aprovações —, com pré-checagem **antes** de reservar e rollback só das reservas da própria chamada. As regras **somam** à aprovação normal e à liberação por valor.
  - **Segregação por perna (RN-07):** o solicitante não assina; quem assina tem de estar no snapshot da pendência **ou** ser `role = 'admin'` (**⚠️ estava errado depois da revisão: o certo é `role = 'admin'` OU quem pode configurar o módulo — superadmin, admin do módulo, perfil ADMINISTRADOR —, `e4ee27c`; letra B196**); usuário **desativado** não assina; a mesma pessoa não assina duas pendências da mesma requisição — garantido no `WHERE` do claim (a corrida tem teste).
  - **Desativar regra** torna `OBSOLETA` a pendência aberta de requisição **ainda aguardando**; reativar não reabre.
  - **Lembrete:** a requisição em `AGUARDANDO_APROVACAO_VALOR` (só a de nascimento, `data_aprovacao IS NULL`) passou a ser cobrada, dos **aprovadores de valor**; e cada pendência de regra tem lembrete **próprio**, da sua plateia (snapshot − solicitante − quem já assinou outra perna; sem ninguém, a lista geral). Com pendência aberta, a lane de status **não** cobra.
  - Telas: aba **Regras de Aprovação** em Configurações; na lista de requisições, o painel *"Aprovações de regra aguardando você"*, o bloco de pendências com **Assinar** no detalhe, e os botões de aprovar desabilitados com o motivo.
  - `limite_aprovacao_auto` **aposentada**: sai do seed, some do `GET /configuracoes`, e o `PUT` a trata como desconhecida. A linha de bancos antigos **não** é apagada.
- **Etapa 48 (2026-09-30) — urgência e material de cliente como critério, urgência fechada, fila da lane simples.** Desenho: `docs/superpowers/specs/2026-09-30-almoxarifado-etapa48-regras-urgencia-cliente-fila-simples-design.md`. Plano: `docs/superpowers/plans/2026-09-30-almoxarifado-etapa48-regras-urgencia-cliente-fila-simples.md`.
  - **Urgência é lista fechada** (`TIPOS_URGENCIA = NORMAL/URGENTE/CRITICO`, `schema.js`): `createRequisicao` recusa o resto com `400 — Urgência inválida: <valor>` antes de gravar (as duas rotas de criação); o `/enviar` do rascunho **normaliza a caixa** e recusa o que continuar fora, com a mesma literal. O passado **não** é reescrito (letra B197). A trava "Crítico nunca é auto-aprovada", a ordenação e o contador do dashboard comparam sem caixa.
  - **Critérios novos em `regras_aprovacao`:** `urgencia` (igualdade, mesma literal para valor fora da lista) e `material_cliente` (algum material com `proprietario_cliente_id`, somado por material; `0`/`false` não conta como critério).
  - **PUT da regra:** campo **ausente** mantém o valor atual; `null` explícito limpa (B199).
  - **Fila da lane simples:** painel *"Requisições aguardando sua aprovação"* — recorte de `GET /requisicoes?status=PENDENTE` (sem rota nova): de outra pessoa, sem pendência de regra aberta, só no modo almoxarifado e só com `pode('aprovar_requisicao')`. A requisição com `regras_avaliadas_em` nulo **fica**, marcada *"regras ainda não avaliadas — a aprovação vai conferir"* (B198).

## Checklist

### Backend
- [x] Tabela `regras_aprovacao` — `d212fb7` (Etapa 47, T3). Critérios entregues: tipo de requisição, criticidade do material, valor, quantidade, centro de custo, projeto. **Urgência** e **material de cliente**, que esta linha dava como "fora, declarados", **entraram na Etapa 48** — ver o item abaixo. Continua fora **só** a lista técnica (depende da feature 22). O lado do aprovador é **lista de pessoas**, não perfil: perfil não resolve *quem*, e a segregação por perna só existe se resolver (desenho 8.4)
- [x] Avaliador de regras no envio da requisição, N aprovações — `d212fb7` (Etapa 47, T4). Com o gate nas duas lanes, a auto-aprovação barrada por pendência, e a falha do avaliador **fechando** a porta
- [x] Lembrete da requisição travada por valor — `4f53292` (Etapa 47, T1). Plateia = aprovadores de valor; só a procedência de nascimento
- [x] Lembrete por pendência de regra — `dbde640` (Etapa 47, T5)
- [x] `limite_aprovacao_auto` resolvida (sai, sem apagar a linha de produção) — `dc1c3f8` (Etapa 47, T2)
- [x] Integração cruzando regras + valor + lembretes, pela segunda rota de criação e pelo serviço — `integracaoAprovacoesRegra.api.test.js` (T8 `7fe7d6b`; Fase 5 `e4ee27c`)
- [x] Urgência como lista fechada (`TIPOS_URGENCIA`), recusada na criação e no envio do rascunho — `d8631bd` (Etapa 48, T1) + (Fase 5 `731a13a`: o envio normalizando e recusando)
- [x] Critérios de **urgência** e **material de cliente** nas regras — `68563a5` (Etapa 48, T2); PUT com campo ausente preservando — (Fase 5 `731a13a`)
- [x] Integração dos critérios novos pela segunda rota, com auto-aprovação, fila de regras e a requisição não avaliada — `integracaoRegrasUrgenciaCliente.api.test.js` (`410fece`, Etapa 48, T5)
- [x] Segregação: solicitante não aprova a própria requisição (Etapa 3, Task 4 — nas duas lanes, aprovar e aprovar-valor; rejeitar a própria continua permitido, é desistência)
- [x] Requisição emergencial exige justificativa (Etapa 3, Task 1 — `RequisicaoSchema.superRefine`, validado na criação nas 2 rotas)
- [x] Material de cliente exige autorização específica (feature 13) — **ENTREGUE na Etapa 8 (2026-08-12), e este item ficou `[ ]` por 17 dias descrevendo um estado que já tinha mudado.** A ação dedicada existe: `ajustar_material_cliente: [ADMINISTRADOR]` (`permissions.js:34`), verificada **dentro do motor** (`stockService.js:692`), com guarda de dono na saída. **A frase "fora da Etapa 3" ESTAVA CERTA quando escrita e ficou ERRADA depois** — esta spec não foi reaberta quando a 13 entregou. Fica dito em vez de apenas marcado
- [ ] Material fora da lista técnica → aprovação da Engenharia (depende da feature 22) — fora da Etapa 3
- [ ] Ajuste de estoque exige **dupla aprovação** (feature 17) — fora da Etapa 3
- [x] Sucateamento exige aprovação Almoxarifado + gestão (feature 15) — **ENTREGUE na Etapa 9 (2026-08-16), e este item ficou `[ ]` descrevendo o passado.** E é mais do que um item pago: **é o motor de N aprovações que o item acima diz não existir, em forma concreta de dois níveis.** Duas pernas em colunas próprias (`schema.js:1565-1569`: `aprovador_almox_id/nome`, `aprovador_gestao_id/nome`), **duas ações de perfil distintas** (`permissions.js:64-65`: `aprovar_sucateamento` = [ADMINISTRADOR, ALMOXARIFE], `aprovar_sucateamento_gestao` = [ADMINISTRADOR, GESTOR]), **segregação por IDENTIDADE** — a mesma pessoa não assina as duas pernas, mesmo sendo Administrador (`scrapDisposalService.js:342`) —, e o status só vira `APROVADO` na **segunda** assinatura, por `CASE` num claim único (`scrapDisposalStateMachine.js:11-22`), com teste de API dedicado (`sucateamentoAprovacao.api.test.js`).
  > **Quem for construir o motor de regras desta feature 06 deve PARTIR DAQUI, não do zero.** O padrão de duas assinaturas segregadas por identidade, com fechamento atômico, já foi construído, testado e está em produção nesta base — generalizá-lo é trabalho diferente (e menor) de inventá-lo
- [x] Registro imutável de cada decisão (quem, quando, justificativa) — implementado via `auditoria_log_almoxarifado` (Etapa 3, Task 4/5), não via tabela `aprovacoes` dedicada: toda aprovação/rejeição/confirmação/encerramento grava `usuario_id`, `usuario_nome`, `justificativa` e `dados_novos`; não há rota de editar/excluir uma entrada de auditoria (sem teste de API dedicado provando a ausência da rota)
- [x] Rejeição exige justificativa (Etapa 3, Task 4 — nas duas lanes, normal e por valor; 400 sem motivo)

### Frontend
- [x] Config de regras de aprovação (nova aba em Configurações) — `2b1d0f6` (Etapa 47, T6). `projeto_id` fica **fora da tela** e dentro da API: o formulário de requisição não grava projeto, então a regra por projeto não casaria com requisição criada pela tela
- [x] Fila das pendências **de regra** do usuário, com *Assinar* no detalhe e aprovar desabilitado com o motivo — `2b1d0f6` (Etapa 47, T7)
- [x] Aba de regras com os campos **Urgência** e **Algum item é material de cliente** — `29809af` (Etapa 48, T3); edição e desativação preservando os dois — (Fase 5 `731a13a`, só teste)
- [x] Fila "minhas aprovações pendentes" — **a lane SIMPLES entrou na Etapa 48** (`29809af`, T4): painel *"Requisições aguardando sua aprovação"*, recorte de `GET /requisicoes` sem rota nova, com a marca da requisição não avaliada. A parte "não sabe resolver perfil → pessoa" continua verdadeira e **não precisou** ser resolvida: a fila mostra ao usuário logado o que ele pode aprovar pelo perfil dele. O registro anterior: **a parte entre parênteses ESTAVA ERRADA: NÃO é "só a lista geral filtrada".** Existe fila dedicada para a lane de **valor**: botão que só aparece para quem é aprovador (`RequisicoesList.js:731`, condicionado a `souAprovadorValor || isAdmin`, com `souAprovador` vindo da API), forçando `status = AGUARDANDO_APROVACAO_VALOR`, com aprovar/reprovar no detalhe e aviso para quem não é aprovador. O backend ainda tem `?minha=1`. **O que falta é a equivalente para a lane SIMPLES** (`aprovar_requisicao`), que não tem fila nem sabe resolver perfil → pessoa

## Dois achados da Fase 0 da Etapa 28 (2026-08-29) que esta spec não nomeava

**1. `limite_aprovacao_auto` é configuração MORTA — uma regra de aprovação que aparece na tela e
não faz nada.** `schema.js:1908` semeia `['limite_aprovacao_auto', '5', 'Quantidade máxima para
aprovação automática por item']`. Varredura do repositório inteiro (`server/` + `client/`,
`--include=*.js`, fora `node_modules`): **uma única ocorrência, o próprio seed**. Zero leitores.
Ela aparece na listagem de configurações do módulo prometendo aprovação automática por
quantidade — que **não existe**. É o oposto do padrão "escrito e sem leitor" que esta base já
nomeou: aqui não há nem escritor, só a promessa. **Ou ganha leitor, ou sai do seed.**

**2. O lembrete de requisição parada NUNCA alcança a requisição de alto valor.**
`requisitionReminderService.js:252` filtra `WHERE status = 'PENDENTE'` — e a requisição travada
por liberação de valor está em **`AGUARDANDO_APROVACAO_VALOR`**, que esse `WHERE` não pega.
Ironia medida: `requisitionValueApprovalService.js` **limpa `ultimo_lembrete_enviado`** exatamente
ao entrar nesse status, ou seja, prepara o campo para um lembrete que nunca é disparado. **A
requisição que mais precisa de cobrança — a que passou do limite em R$ — é a única que fica sem
ela.** Escrita sem leitor, na forma mais cara.

> **Correção (Etapa 47, 2026-09-30) — esta frase EXAGERAVA.** Ela dizia que a requisição de alto
> valor **"é a única que fica sem"** cobrança. **Estava errado:** `notificarAprovadoresValor` já
> avisava os aprovadores de valor **no instante** em que a requisição entrava em
> `AGUARDANDO_APROVACAO_VALOR`. **O certo é:** o aviso **inicial** existia; o que faltava era a
> **cobrança de permanência** — o aviso saía uma vez e nunca repetia. É isso que a Etapa 47 (T1,
> `4f53292`) entregou. O achado 2 continua valendo no que diz sobre o `WHERE`; só a frase final
> estava maior que o fato.
>
> **E o achado 1 estava CERTO onde o desenho da Etapa 47 escalou.** Ele diz *"aparece na listagem de
> configurações do módulo"* — e é isso: a **listagem da API** (`GET /configuracoes`, que é
> `SELECT *`). O desenho da Etapa 47 transformou isso em *"aparece na tela prometendo…"*; **estava
> errado** — a chave tinha **zero** ocorrências na tela, cuja lista de campos é fixa. O certo é o
> que esta spec já dizia. A correção está registrada no desenho (7.4).
>
> **Os dois achados estão resolvidos:** 1 por `dc1c3f8` (T2), 2 por `4f53292` (T1).

## Regras essenciais + testes de API exigidos

| Regra | Teste |
|-------|-------|
| Solicitante não aprova a própria requisição (aprovação simples) | `[aprovar] solicitante tenta aprovar a própria -> 403, status inalterado` (`requisicaoAprovacao.api.test.js`) |
| Solicitante não aprova a própria requisição (aprovação por valor) | `[aprovar-valor] solicitante (também aprovador de valor) tenta aprovar a própria -> 403` (`requisicaoAprovacao.api.test.js`) |
| Emergencial sem justificativa é rejeitada | `[…] EMERGENCIAL sem justificativa — 400` (`requisicaoCriacao.api.test.js`, nas 2 rotas) |
| Requisição só avança com TODAS as aprovações exigidas | `(5) /aprovar com pendencia aberta -> 400 com a literal, e NENHUMA reserva criada` + `(11) /aprovar-valor com pendencia aberta -> 400…` + `(10) auto-aprovacao…` (`regrasAprovacao.api.test.js`) |
| Cada regra casada exige uma pessoa diferente | `(7) assinatura: solicitante, fora da lista, e a MESMA pessoa em duas regras sao recusados` + `(14) o mesmo usuario assinando as DUAS pendencias ao mesmo tempo: so uma passa` (`regrasAprovacao.api.test.js`) |
| Falha do avaliador não abre a porta | `(9) avaliador falhou no envio: auto-aprovacao NAO passa, e o /aprovar reavalia e barra` (`regrasAprovacao.api.test.js`) |
| Regra desativada não bloqueia mais, e não reescreve histórico | `(12) desativar a regra obsoleta a pendencia viva e NAO a de requisicao rejeitada` (`regrasAprovacao.api.test.js`) |
| A requisição travada por valor é cobrada, da plateia certa | `requisicaoLembreteValor.api.test.js` (9 cenários) |
| Cada pendência é cobrada da sua plateia; a lane de status cala | `lembreteRegra.api.test.js` (7) + `integracaoAprovacoesRegra.api.test.js` (7) |
| Rejeição exige justificativa (aprovação simples) | `[rejeitar] sem motivo -> 400` + `motivo vazio -> 400` (`requisicaoAprovacao.api.test.js`) |
| Rejeição exige justificativa (aprovação por valor) | `[rejeitar-valor] sem motivo -> 400` (`requisicaoAprovacao.api.test.js`) |
| Decisão de aprovação/rejeição é auditada | `[aprovar] decisão auditada (acao APROVACAO)` + `[rejeitar] decisão auditada (acao REJEICAO, justificativa=motivo)` (`requisicaoAprovacao.api.test.js`) |
| Decisão de aprovação é imutável (sem rota de editar/excluir) | não coberto por teste de API dedicado nesta etapa |

## Dependências

- 04 (máquina de estados da requisição — Etapa 3 entregue) · consumidores: 13, 15, 17.
