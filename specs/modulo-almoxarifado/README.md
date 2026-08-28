# Módulo Almoxarifado — Planejamento Mestre

> **Spec original:** [2026-08-02-requisitos-modulo-almoxarifado.md](2026-08-02-requisitos-modulo-almoxarifado.md) (34 seções)
> **Última atualização:** 2026-08-28 (**Etapa 15 fechada — mobilidade, a fatia real,
> `7f74b6c..a82ad43`. Nasce a feature 24 (🟢 no escopo medido): scanner de QR pela câmera
> fechando o ciclo das etiquetas 6c (client-only, RN-01 com filtro de protocolo E de prefixo),
> assinatura digital + responsável pela retirada na entrega de requisição (tabela append-only
> auditada, rota multipart no padrão canônico, opcional por design — RN-02), e o balcão usável
> no celular (a regra CSS que escondia colunas ≥4 morreu; scroll na própria tabela; modais em
> tela cheia). 1D/coletores/app nativo ficaram FORA por medição (nada gera 1D; hardware não
> confirmado; sem demanda offline) — B25-B27 das novidades. Revisão adversarial (2 lentes):
> backend Aprovado com 1 Minor (500 opaco de multer nas 5 rotas de upload — pendência nomeada
> na spec 24); front Needs-fix-round com 1 Important reproduzido (prefixo `/almoxarifado` sem
> exigir barra navegava para tela branca) + 2 Minor — tudo corrigido em `a82ad43`.
> Retomado o desenvolvimento em modo contínuo por instrução do usuário (2026-08-28).**
> **Onde o desenvolvimento está: o roteiro de etapas 0-15 do planejamento mestre está
> completo. A próxima frente sai do mapa abaixo (maior lacuna: feature 20, alertas — central
> no front e ~16 alertas restantes; depois os restos declarados de 21/22/23 e as decisões B
> em aberto).** O handoff está na seção "Próxima tarefa detalhada" do plano
> `docs/superpowers/plans/2026-08-28-almoxarifado-etapa15-mobilidade.md`.
> **Números (medidos no fechamento, 2026-08-28):** `test:api` **125/125 arquivos OK**,
> `test:almoxarifado` **42/0**, `test:validation` **4/0**, `test:safealter` **3/0**,
> `test:sqlite` **3/0**; client **513 testes em 35 suítes**, build `CI=true` exit 0.
> Antes: 2026-08-25 (**Etapa 14 fechada — integrações, a fatia real,
> `b276dca..2de7944`. A feature 22 vira 🟡: Compras + custo por projeto entregues;
> BOM/OP/centro-de-custo bloqueados por dependência com a medição escrita na spec.**
> **O que a Etapa 14 entregou:** a medição da Fase 0 provou Compras maduro e BOM/MES sem chão —
> o escopo virou a fatia integrável real: **ciclo de vida da solicitação de compra** (RECEBIDA
> automática quando a nota do pedido vinculado é processada, gancho nos DOIS caminhos do
> recebimento; CANCELADA manual com justificativa obrigatória auditada — **fecha a pendência
> B14** aberta desde a 11; finalizada é terminal, não ressuscita nem re-vincula), **vincular
> validando as duas pontas** (pedido fantasma impossível), **D9** (vincular/verificar-mínimos
> abertos de ADMIN-only para `gerenciar_reposicao` — abertura de gate, letra B21 das
> novidades), verificar-mínimos **auditando o autor** por linha criada, **contexto do
> comprador** (`GET /compras/contexto-material/:id` + painel na tela de Reposição: saldos,
> consumo médio, último custo por NF pelo par movimentação×item, solicitações abertas),
> **relatório custo-por-projeto** (consumido/devolvido/líquido pelo livro, custo atual
> retroativo declarado, gate nasce fechado — D6/B24) com **herança de projeto/OS na devolução**
> nas duas pernas (sucata incluída), e o teste-jornada da integração com **compra parcial**.
> **Revisão final** (2 lentes): ambas Needs-fix-round leve, 0 ruído — convergiram no mesmo
> buraco de rede (CANCELADA não ressuscita não tinha teste) — tudo acatado em `2de7944`;
> matriz de 8 perfis limpa (D9 contido: as 7 rotas `configurar` seguem intactas).
> **Números (medidos no fechamento, 2026-08-25):** `test:api` **123/123 arquivos OK**,
> `test:almoxarifado` **42/0**, `test:validation` **4/0**, `test:safealter` **3/0**,
> `test:sqlite` **3/0**; client **487 testes em 33 suítes**, build `CI=true` exit 0.)
> Antes: 2026-08-24 (**Etapa 13 fechada — relatórios e indicadores,
> `4fdda54..8bb5e52`. A feature 21 fica 🟡-forte (grosso entregue; restos declarados).**
> **O que a Etapa 12 entregou:** fila de notificações com retry/backoff/dedupe/claim e
> histórico (a fila é o histórico), gancho pós-commit de movimentação por classes (default
> desligado — decisão B15), três dívidas antigas pagas (lembrete de ferramenta 9b/B7, resumo
> de solicitações 11, devolução parcial 7), alertas de estoque zerado/lote vencendo/remessa
> vencida, painel de notificações gateado e 10 configs novas nos dois lados.
> **O que a Etapa 11 entregou:** motor de **sugestão de reposição** no `purchaseService`
> (consumo médio pela fonte única `TIPOS_SAIDA` em janela configurável; ponto efetivo com **a
> mínima como chão de todas as réguas** — emenda Critical da revisão da Task 1; posição =
> `disponivelSql` + solicitações abertas dentro do **horizonte** configurável de 60 dias, com
> `a_caminho_vencido` exposto; alvo `max(máxima, ponto)` com lote econômico como piso);
> sugestão consolidada por **fornecedor** e valorada pela fonte única de custo; **gerar
> solicitações** com quantidades sempre do servidor (sem dedupe — a matemática da posição é o
> dedupe; pendência insuficiente gera o complemento; auditado; confirm no front); **estoque
> parado** (excesso/sem consumo/obsoleto, flags independentes, valor em reais, resumo do
> estoque inteiro); ação nova **`gerenciar_reposicao`** [ADMIN, GESTOR, COMPRAS — ALMOXARIFE
> fora de propósito, primeiro uso real do perfil COMPRAS]; relatório de solicitações com
> VINCULADO e **gateado** (mesmo remédio da 10b); o **mesmo horizonte** aplicado à máquina de
> estados de requisição; 3 configs semeadas e editáveis com validação ≥ 1 **nos dois lados**;
> índice novo no livro; e a **tela** `/almoxarifado/reposicao` (3 abas, com painel de
> erro/permissão por aba — o Critical da revisão final era um 403 renderizado como "não há
> nada a comprar"). Motor de estoque **não tocado**. **Revisão final** (2 revisores medindo
> com probes): 1 Critical + 7 Important + ~11 Minor, 0 ruído — todos os Critical/Important
> corrigidos em `95fb25b` (backend) e `1ea6ab2` (front).
> **Números (medidos no fechamento, 2026-08-24):** `test:api` **111/111 arquivos OK**,
> `test:almoxarifado` **42/0**, `test:validation` **4/0**, `test:safealter` **3/0**,
> `test:sqlite` **3/0**; client **408 testes em 30 suítes**, build `CI=true` exit 0.)
> Antes: 2026-08-23 (**Etapa 10b fechada — inventário avançado parte 2,
> `14f4458..7290481`. A feature 17 vira 🟢 no que as duas rodadas se propuseram.**
> **O que a Etapa 10b entregou:** escopos de contagem **combináveis** (família raiz, classe ABC,
> somente críticos, materiais de clientes, com saldo em terceiros — filtros sobre colunas que o
> material já tinha, gravados como `escopo_descricao`-snapshot); **dupla contagem por duas
> pessoas** (flag por conferência: recontagem exige outra pessoa, o GET esconde a contagem do
> colega de quem não é o último autor — com ou sem modo cego —, o primeiro contador pode corrigir
> o próprio número enquanto ninguém recontou, autoria por item sempre gravada); **RN-08**
> (contagem validada: número finito ≥ 0, zero vale); **relatório de acuracidade** (derivado dos
> itens imutáveis, ponderado, contados/total + recontados, impacto financeiro persistido na
> conclusão sem backfill, gate `inventario`); **epsilon de divergência como fonte única**
> (`divergencia.js` — alcança também o relatório antigo `inventario-divergencias`, que ganhou
> gate e filtro CONCLUIDO: antes vazava contagem em andamento para qualquer usuário do módulo).
> O **motor de estoque não foi tocado**. **Revisão final de branch** (2 revisores em paralelo,
> lentes backend e costura front↔back): **1 Critical + 8 Important + 11 Minor, 0 ruído** — o
> Critical era o strip da contagem do colega existindo só sob modo cego: em dupla contagem sem
> cego, o input do recontador vinha preenchido e um **Tab** certificava a recontagem sem digitar
> nada (medido: saldo reescrito pelo motor com trilha de duas pessoas). Corrigido nas duas pontas
> (strip por dupla_contagem no servidor; front só salva campo digitado na sessão).
> **Números (medidos no fechamento, 2026-08-23):** `test:api` **107/107 arquivos OK**,
> `test:almoxarifado` **42/0**, `test:validation` **4/0**, `test:safealter` **3/0**,
> `test:sqlite` **3/0**; client **382 testes em 29 suítes**, build `CI=true` exit 0.)
> Antes: 2026-08-22 (**Etapa 10 fechada — inventário avançado,
> `d644827..8db2671`. A feature 17 vira 🟡 (parcial, com corte declarado — ver abaixo).**
> **O que a Etapa 10 entregou:** fecha uma pendência registrada desde a Etapa 7 (itens B1/B2/B3
> do `docs/almoxarifado-novidades-por-etapa.md`) — a conclusão da conferência de inventário
> gravava saldo **por fora do motor de estoque**, sem validação nenhuma. Agora existe um tipo
> dedicado (`AJUSTE_INVENTARIO`) que passa por `stockService.registrarMovimentacao` como qualquer
> outra movimentação, com uma **guarda de retenção nova** — função pura, uma única fonte, chamada
> tanto pelo motor quanto pela pré-validação da rota — que **decide** (pela primeira vez, depois
> de três etapas sem resposta) recusar um ajuste que deixaria material bloqueado/reservado/em
> inspeção/em terceiro com número negativo. Contagem cega (opcional por conferência), tolerância
> configurável com recontagem obrigatória, aplicação **tudo ou nada** (pré-valida todo item antes
> de aplicar qualquer um) e impacto financeiro no aviso de sucesso. **Revisão final de branch**
> (depois de todas as tasks) achou 1 Critical + 4 Important que nenhum gate por-task pegou:
> `AJUSTE_INVENTARIO` com quantidade **zero** (uma contagem física legítima) era recusado pelo
> motor, mas a pré-validação da rota não sabia disso — aprovava o item e só quebrava na aplicação
> real, **com outros itens já gravados** (tudo-ou-nada furado de verdade, não hipoteticamente); o
> mesmo furo existia para material desativado no meio da contagem; `totalItens` ausente na
> resposta vazia; a config de tolerância nunca tinha sido semeada (nunca configurável de verdade);
> o badge de recontagem não atualizava sem reabrir a conferência; o tipo novo nunca entrou nas
> listas do livro de movimentações. Todos corrigidos, com testes que **forçam a ordem dos itens**
> processados (a primeira tentativa de prova por sabotagem passou por sorte de ordenação
> alfabética — só forçando a ordem vulnerável é que a sabotagem provou algo de verdade). **Corte
> declarado, para uma Etapa 10b:** tipos de contagem avançados, dupla contagem por duas pessoas,
> congelamento de movimentação, fluxo formal de dupla aprovação (existe dupla permissão, não duas
> assinaturas), relatório de acuracidade, e-mail do resultado.
> **Números (medidos no fechamento, 2026-08-22):** `test:api` **103/103 arquivos OK**,
> `test:almoxarifado` **42/0**, `test:validation` **4/0**, `test:safealter` **3/0**,
> `test:sqlite` **3/0**; client **373 testes em 29 suítes**, build `CI=true` concluído sem
> warning (exit 0).)
> Antes: 2026-08-22 (**Etapa 9b fechada — ferramentas e calibração,
> `d644827..b8e6f60` + commits de documentação. A feature 16 vira 🟢.**
> **O que a Etapa 9b entregou:** o subsistema de ferramentas (antes: 57 linhas sem teste, sem
> Zod, com corrida SELECT-depois-UPDATE, sem auditoria, gate emprestado do estoque) virou
> patrimônio emprestável completo. Máquina de estados explícita (`toolStateMachine.js`) com toda
> transição por **claim** no WHERE; calibração com vencimento **lida da última calibração** (sem
> coluna-cache) barrando o empréstimo; avaria/perda com foto encerrando o empréstimo aberto no
> mesmo ato; bloqueio/manutenção/reencontro com justificativa auditada; ação de perfil própria
> `gerenciar_ferramentas`; Zod e auditoria em toda escrita; tela `/almoxarifado/ferramentas` com
> três visões. **Revisão final de branch** (depois do merge de todas as tasks) achou 4 Important
> que nenhum gate por-task pegou — todos do mesmo padrão, "contrato congelado honrado por um lado
> só": filtro `busca`/`exige_calibracao` que o front mandava e o backend nunca lia; corrida
> `devolverFerramenta`↔`registrarOcorrencia` que podia corromper o status (UPDATE incondicional de
> um lado, restauração para o estado errado do outro); `PUT`/409 de ferramenta sem nenhum teste; e
> o badge "Vencido" do front comparando instante UTC contra a comparação por-data do servidor —
> todos corrigidos e um re-review escopado confirmou zero residual. **Pendências declaradas, para
> a letra B do fechamento:** job de lembrete de devolução sem canal de notificação (função pura
> pronta, aguarda feature 20/e-mail feature 19); UI de edição de ferramenta (backend testado, só
> falta o formulário — achado da revisão final, D9 do design corrigido).
> **Números (medidos no fechamento, 2026-08-22):** `test:api` **98/98 arquivos OK** (inclui o
> novo `toolFerramentaEdicao.api.test.js`), `test:almoxarifado` **42/0**,
> `test:validation` **4/0**, `test:safealter` **3/0**, `test:sqlite` **3/0**; client **357 testes
> em 28 suítes**, build `CI=true` concluído sem warning (exit 0).)
> **O que a etapa entregou:** o retalho virou **estoque de verdade** — material normal no motor,
> creditado pelo tipo novo `ENTRADA_RETALHO` (dedicado, sem custo, nascido nas fontes únicas
> `movementTypes`/`TIPOS_DEDICADOS`), com a tabela `sobras_material_almoxarifado` **reformada**
> como anexo dimensional (colunas novas por `safeAlter`; `POST /sobras` avulso **aposentado**; o
> único caminho de criação é o evento composto `gerarRetalho`, com guarda de dono própria e
> compensação no padrão 8b/8c). E o sucateamento virou **processo com dupla aprovação**: `SUCATA`
> saiu do formulário genérico de Movimentações (entrou em `TIPOS_DEDICADOS` — sem isso o teste
> exigido pela spec, "sucatear sem aprovação falha", seria impossível por construção), e a baixa
> só sai pelo motor na **segunda assinatura** de duas pernas segregadas
> (`aprovar_sucateamento` = ADMINISTRADOR/ALMOXARIFE; `aprovar_sucateamento_gestao` =
> ADMINISTRADOR/GESTOR; solicitante não assina; a mesma pessoa não assina as duas — a barreira
> repetida no WHERE do claim depois que o review provou o TOCTOU; a suíte tem teste de corrida
> determinístico, e a sonda de 500 execuções do fix round — não versionada — mediu 0 furos).
> Destino final VENDIDA (valor + comprovante multipart) ou DESCARTADA; relatório
> `sucata-financeiro` lendo o **livro** (inclui a devolução-destino-sucata da Etapa 7 — o
> consumidor declarado da spec 12), com valoração pelo custo atual e nota de limitação. Tela nova
> `/almoxarifado/sobras` com as visões Retalhos e Sucateamentos, etiqueta de retalho com QR
> (paga a pendência da 6c) e hint não bloqueante de retalho disponível na SAÍDA.
> **Decisão endossada em review (documentada na spec 15):** sem pré-checagem de disponível na
> aprovação final — o motor é o checador e a compensação da assinatura cobre a corrida; repetir a
> conta seria segunda fonte da regra que `availabilitySql.js` unificou.
> **Pendência nova nomeada (spec 15):** não existe guarda automática "todo tipo novo de
> `TIPOS_MOVIMENTO` precisa estar em `movementTypes.TIPOS_ENTRADA`/`TIPOS_SAIDA`" — a sabotagem
> da Task 2 provou que o teste da equação por cliente **não pega** esse esquecimento (ele itera a
> própria lista da fonte única); construir a guarda exige lista de exceções nomeadas, design em
> aberto. Outras pendências registradas na spec 15: coluna `foto` da sobra sem escritor,
> `ENTRADA_RETALHO` sem lote quando o material-retalho controla lote (mesma isenção declarada da
> spec 10), `valor_venda` aceito em DESCARTADA, e-mail → feature 19.
> **Números (medidos no fechamento, 2026-08-16):** `test:api` **90/90 arquivos OK**,
> `test:almoxarifado` **42 passou / 0 falhou**, `test:validation` **4/0**, `test:safealter`
> **3/0**, `test:sqlite` **3/0**; client **344 testes em 27 suítes**, build `CI=true` concluído
> sem warning (exit 0).)
> Antes: 2026-08-13 (**Etapa 8c fechada — transformação no terceiro,
> `753d23b..61c6f52`.** Com ela a **feature 14 fica completa (🟢)**: a 8b entregou a metade em que
> **o mesmo material volta** (galvanização, pintura, tratamento) e a 8c entrega a metade em que
> **volta outra coisa** — corte, dobra, usinagem: sai 1 chapa e voltam N peças mais uma sobra.
> **O que não existia até aqui:** toda movimentação do módulo é sobre **um** `material_id`, e o
> retorno da 8b recusava material diferente por regra explícita. A 8c abriu o caso pelo único
> caminho em que "creditar outro material" não é estoque do nada: a baixa da chapa e o crédito das
> peças acontecem no **mesmo evento** — `CONSUMO_TERCEIRO` tira a chapa do patrimônio **e** da
> retenção no mesmo UPDATE, e o tipo novo **`RETORNO_TRANSFORMACAO`** (`9c7ec75`) credita cada
> resultado. `retornos_remessa_item_almoxarifado` ganhou três colunas
> (`tipo_resultado` `PECA`/`SOBRA`, `custo_unitario_aplicado`, `movimentacao_consumo_id` — o
> agrupador do evento), todas por `safeAlter`, com **`NULL` significando "retorno simples, não é
> transformação"** (não é buraco de migração: é o valor certo, e é o que separa os dois mundos sem
> tabela nova e sem backfill). Custo rateado por função **pura** (`services/almoxarifado/transformCost.js`,
> `ratearCusto`/`calcularRendimento`): **peça recebe rateio, sobra entra a custo ZERO** (tratamento
> conservador de retalho — o patrimônio nunca infla). Rota dedicada
> `POST /remessas-terceiros/:id/transformacoes` (gate `remessar_terceiro`), tipo em
> `TIPOS_DEDICADOS` — **fora** da rota genérica de movimentação —, guarda própria de dono
> (`assertMesmoDonoNaTransformacao`: a peça tem de ter o **mesmo** dono da chapa, senão a
> transformação converteria material de cliente em patrimônio da GMP), e modal de transformação com
> N resultados, classificação e rendimento (`61c6f52`).
> **Três correções de defeito ANTIGO, achadas pela execução e feitas em commits próprios:**
> (1) o **recebimento por NF passou a alimentar o custo médio** (`8cd3fcf`) — até aqui o **único**
> caminho que movia `custo_medio` no sistema inteiro era a movimentação manual com custo digitado à
> mão, e com o custo médio quase nunca alimentado o rateio da 8c distribuiria R$ 0,00; (2) a leitura
> de custo virou **fonte única** (`services/almoxarifado/custoSql.js`, `a644ab7`) porque
> `COALESCE(custo_medio, custo_unitario, 0)` devolvia **0** (a coluna é `REAL DEFAULT 0`, não NULL)
> e **valorava a zero o acervo inteiro** nos relatórios; (3) as listas de tipos que somam/subtraem
> saldo viraram **fonte única** (`services/almoxarifado/movementTypes.js`, `3ef0144`) — eram quatro
> cópias, e o espelho do `clienteEstoqueService` ficou para trás **duas vezes seguidas** (8b e 8c),
> fazendo a posição por cliente mentir sem quebrar teste nenhum. **Números:** `test:api`
> **81/81 arquivos OK**, `test:almoxarifado` **42 passou / 0 falhou**, `test:validation` **4/0**,
> `test:safealter` **3/0**, `test:sqlite` **3/0**; client **283 testes em 25 suítes**, build
> `Compiled successfully.`
> **Pendências que continuam abertas:** "uma remessa não mistura donos" segue **deduzida e sem
> resposta do cliente**; o `AJUSTE` (e o `aplicar_ajustes` da conferência) continua sem reconciliar
> nenhuma das **quatro** retenções — a 8c **não piorou e não ajudou**; as categorias hardcoded do
> front continuam duplicadas (a 8c **encostou** nelas e não resolveu — a sobra usa categoria que já
> existe no seed); e o **rendimento é calculado, mostrado num toast e jogado fora** (não há coluna
> que o guarde — `movimentacao_consumo_id` é o agrupador que um relatório futuro usaria).
> **Próxima etapa da ordem — PRECISA SER DECIDIDA, e este arquivo sozinho não decide.** Pelo
> roteiro abaixo, a próxima da fila é a **Etapa 9 — retalhos e ferramentas** (features 15 e 16), e a
> 8c a aproximou (a sobra já nasce como material normal na categoria "Sucata e sobras
> reaproveitáveis"). Mas o briefing de fecho da 8c
> ([plano](../../docs/superpowers/plans/2026-08-13-almoxarifado-etapa8c-transformacao.md), seção
> final) lista candidatas **concorrentes por dívida acumulada** — a decisão do cliente sobre
> `AJUSTE` × retenção (pergunta de negócio, não código) e as categorias hardcoded. Seguir a ordem
> ou pagar a dívida é escolha de quem pegar; **não presuma a Etapa 9 sem confirmar.**)
> Antes: 2026-08-12 (**Etapa 8b fechada — remessas a terceiros,
> `0a01124..b176212`.** A feature **14 vira 🟡** (ciclo de remessa/retorno completo; a
> **transformação** é a Etapa 8c). O material que a GMP manda beneficiar fora deixou de sumir do
> controle: ganhou a **quarta coluna de retenção** `materiais_almoxarifado.quantidade_em_terceiros`,
> que o tira do **disponível** sem tirá-lo do **patrimônio**.
> **A armadilha central da etapa, e o que se fez com ela:** a conta `atual − reservada − bloqueada −
> em_inspecao` estava **replicada 14 vezes** — a função `getSaldoDisponivel` mais **13 queries
> escritas à mão**, em **8 arquivos**, incluindo `clienteEstoqueService.js` (que *nós* criamos na
> Etapa 8) e `routes/requisicoesMaterial.js` (que **nem pertence ao módulo**). Acrescentar a coluna
> em 13 e esquecer 1 não quebraria nada: o sistema passaria a **recusar pela função e aceitar pelo
> SQL**, com o número errado em silêncio. **O design dizia SETE** e foi corrigido para quatorze
> (`742b9ea`) — segundo erro do mesmo tipo em duas etapas seguidas. A resposta não foi contar
> melhor: a conta passou a existir **num lugar só** (`services/almoxarifado/availabilitySql.js`) e
> o teste **varre o código-fonte** provando que sobrou zero réplica.
> Entregue: conferência de inventário descontando **só** `quantidade_em_terceiros` (as outras três
> continuam somando, porque aquele material **está** na prateleira — "bloqueado" é estado
> administrativo, não ausência física) · três tabelas + `thirdPartyStateMachine.js`
> (`ABERTA → ENVIADA → RETORNO_PARCIAL → ENCERRADA/CANCELADA`) · **quatro tipos de movimento**
> (`REMESSA_TERCEIRO`/`RETORNO_TERCEIRO` retêm; `PERDA_TERCEIRO`/`CONSUMO_TERCEIRO` baixam físico e
> retenção no mesmo UPDATE) · envio **tudo-ou-nada** · retorno parcial com teto por item ·
> encerramento com **destino obrigatório** + justificativa · cancelamento estornando **só o que
> ainda está lá fora** · ação de perfil `remessar_terceiro` · sete rotas + `GET /vencidas` · tela
> `/almoxarifado/remessas-terceiros` + PDF no navegador.
> **Correção declarada de spec:** o checklist da feature 14 dizia *"envio = saída para localização
> virtual 'Em terceiros' (saldo visível mas não disponível)"* — **está errado**: `getSaldoDisponivel`
> calcula sobre o escalar `quantidade_atual`, então material numa localização virtual continuaria
> **disponível para saída**; a solução proposta não entregava o requisito que ela mesma enunciava.
> **Três defeitos que só a execução achou** (leitura e suíte verde não achavam): a pré-checagem do
> envio comparava **cada linha sozinha** e deixava a remessa sair pela metade (medido: 60 retidos,
> item 1 enviado, item 2 não, remessa parada em ABERTA); a mensagem do teto do retorno dizia o
> número **errado** quando o item aparecia em duas linhas; e o encerramento com **vários** itens
> pendentes baixava só o primeiro. **Números:** `test:api` **74/74 arquivos**, `test:almoxarifado`
> **42/0**, `test:validation` **4/0**, `test:safealter` **3/0**, `test:sqlite` **3/0**; client
> **268 testes em 24 suítes**, build `Compiled successfully.`
> **Pendências:** o `AJUSTE` não reconcilia retenção — agora em **três** caminhos (bloqueado da
> Etapa 7; `aplicar_ajustes` da conferência, que grava `quantidade_atual` fora do motor; e a coluna
> nova) — a decisão continua sendo **do cliente**; "uma remessa não mistura donos" foi **deduzida** e
> **não confirmada** com a GMP; o Step 11 da Task 9 (cor dos badges e PDF no navegador) **não foi
> executado**; e toda coluna nova de `materiais_almoxarifado` **vaza** para o requisitante até ser
> nomeada em `SENSITIVE_MATERIAL_FIELDS`.
> **Próxima etapa da ordem: Etapa 8c — transformação** (chapa → peças cortadas + sobra). *(Frase da
> época; a 8c foi entregue em 2026-08-13 — ver a entrada mais recente, acima.)*)
> Antes: 2026-08-12 (**Etapa 8 fechada — materiais de clientes,
> `f26b635..5b5eb55`.** A feature **13 vira 🟢**; a **14 é a Etapa 8b**, próxima da ordem. Material
> de cliente deixou de ser ilha (`materiais_cliente_almoxarifado`, texto livre, sem FK, sem motor)
> e virou **material normal com dono**: `materiais_almoxarifado.proprietario_cliente_id`
> (`NULL` = nosso), com lote, série, endereço, extrato, etiqueta e livro. Entregue: auditoria
> nomeada de **40 leituras** da tabela em três classes (A filtra, B leitura por id não filtra,
> C mistura de propósito e ganha selo) · invariante com **controle positivo obrigatório** ·
> guarda do dono na saída, com a **emergencial NÃO furando** (exceção deliberada ao padrão do
> módulo) · ação `ajustar_material_cliente` verificada **dentro do motor**, porque o AJUSTE chega
> por duas rotas · recebimento de material de cliente exige documento · tipo `DEVOLUCAO_CLIENTE`
> com rota dedicada · ilha aposentada (rotas e serviço saem, **tabela fica**) · tela
> `/almoxarifado/materiais-cliente` com posição por cliente e PDF · selo de propriedade **nomeando
> o cliente** em Materiais, Movimentações e Extrato. **Duas correções declaradas de spec:** a spec
> de design mandava auditar o lugar errado (`9d70d8c` — a contagem de 19 varria só o subdiretório
> `routes/almoxarifado/` e deixava de fora o dashboard e o `posicao-estoque`), e a spec 13 exigia
> **projeto na entrada**, o que está errado (o mesmo cliente manda a mesma chapa para dois
> projetos; o projeto é exigido na **saída**). Números: `test:api` **68/68 arquivos**,
> `test:almoxarifado` **42/0** (um a menos que os 43 da Etapa 7 — o teste do serviço da ilha saiu
> junto com o serviço, e isso é correto), `test:validation` **4/0**, `test:safealter` **3/0**,
> `test:sqlite` **3/0**; client **234 testes em 22 suítes**, build `Compiled successfully.`
> **Pendência que precisa ser lida antes do deploy:** a **conferência de inventário**
> (`routes/almoxarifado.js:941`, `aplicar_ajustes`) grava `quantidade_atual` **fora do motor**,
> logo **fora** da permissão `ajustar_material_cliente` — é um caminho real por onde o saldo de
> material de cliente muda sem a autorização especial. E a confirmação de que
> `materiais_cliente_almoxarifado` está vazia **em produção** continua em aberto (a medição de 0
> linhas cobriu só o banco de dev; nenhuma linha é apagada pela etapa).
> **Próxima etapa da ordem: Etapa 8b — materiais em terceiros** (spec 14).)
> Antes: 2026-08-12 (**Etapa 7 fechada — transferências e devoluções,
> `29524fc..0722bfd` + os consertos `eabd848`/`7fc1b7f` e `d117dc2`.** Features **11 e 12 viram
> 🟢**. Backend: `TRANSFERENCIA` em `REGRAS_VINCULO` e guarda de `exigeLote` alcançando o ramo
> próprio do motor; devolução com `movimentacao_saida_id`/`lote_id`, validação do vínculo, herança
> de lote, série nos destinos `ESTOQUE`/`QUARENTENA`, e a rota `GET /devolucoes/saidas-elegiveis`.
> Cliente: `TRANSFERENCIA` entra no formulário de Movimentações e `DEVOLUCAO` sai dele; tela nova
> `/almoxarifado/devolucoes` (code-split em `routes/lazyModules.js`). **Um bug de saldo corrigido em
> commit próprio antes das features:** devolver para sucata baixava o estoque duas vezes — a spec 12
> descrevia o comportamento errado como certo, e a correção da spec diz isso com todas as letras.
> **O "em trânsito" da spec 11 foi CORTADO por decisão do cliente** (site único), não esquecido.
> Números: `test:api` **59/59 arquivos**, `test:almoxarifado` **43/0**, `test:validation` **4/0**,
> `test:safealter` **3/0**, `test:sqlite` **3/0**; client **196 testes em 17 suítes**, build
> `Compiled successfully.` **Duas pendências novas registradas:** `AJUSTE` não reconcilia
> `quantidade_bloqueada` (spec 03) e o `ESTADO_PARCIAL` da devolução não notifica ninguém (spec 12).
> **Próxima etapa da ordem: Etapa 8 — materiais de clientes** (spec 13); a Etapa 8 original foi
> **dividida** em 8 (clientes) e 8b (terceiros).)
> Antes: 2026-08-11 (**Etapa 6c fechada — etiquetas com QR Code em PDF,
> `35967b9..0785119`.** Feature 10 fica **completa por inteiro** (lote + série + etiqueta física
> com QR) — as três partes entregues. Zero mudança de servidor: util client
> `utils/etiquetasPdf.js` (formatos A4/térmica, montadores, renderizador `jspdf`+`qrcode`) + modal
> compartilhado com formato lembrado em `localStorage` + botões em Materiais/Lotes e
> Séries/Recebimentos + deep-link com destaque. Testes client: 11+9+7 novos; suíte client 177/177
> (16 suítes), build CI limpo; suítes de servidor inalteradas (`test:api` 56/56,
> `test:almoxarifado` 43/43, `test:validation` 4/4, `test:safealter` 3/3, `test:sqlite` 3/3) — a
> etapa não tocou uma linha de `server/`. Critério de aceite "rastrear lote e número de série"
> passa a incluir a etiqueta física, atendido por completo. **Próxima etapa da ordem do plano
> mestre: Etapa 7 — transferências e devoluções** (specs 11 e 12, já auditadas em 2026-08-11).)
> Antes: 2026-08-11 (**review final do branch da Etapa 6b**: Critical de costura corrigido — estorno de saída não tinha guarda simétrica à de entrada e corrompia o invariante `COUNT(série)==quantidade_atual` quando a série reentrava manualmente antes do estorno da saída original; guarda adicionada em `cancelarMovimentacao`. Mais 3 afirmações erradas de doc corrigidas: "motor integrado a requisições/inspeção" — não é, os dois são isentos; filtro de texto no seletor de série da saída e coluna "última entrada/saída" na aba Séries — nenhum dos dois existe; hash do teste de recebimento de série corrigido de `597ec82` para `400bb15`)
> Antes: 2026-08-11 (**Etapa 6b fechada** — números de série: backend + UI + docs, `418d617..b46d820`; feature 10 vira 🟢, critério de aceite "rastrear lote e série" atendido, próxima é a Etapa 6c/etiquetas)
> Antes: 2026-08-11 (auditoria spec×código das 24 features — 4 agentes varreram cada README contra o código; specs corrigidas onde mentiam, e o bug de front que a auditoria achou — tela de requisições sem os status de reserva da Etapa 4 — foi corrigido em `92fe236`)
> **Regra de ouro:** toda regra essencial de funcionamento nasce com teste de API. Nenhuma feature é marcada como ✅ sem teste passando.

## Como usar esta pasta

- Cada subpasta = **uma feature**. Dentro dela: `README.md` com status, checklist do que existe/falta, regras essenciais + testes exigidos, e dependências.
- Ao trabalhar numa feature em qualquer sessão: **abrir o README dela, atualizar os checkboxes ao concluir cada item e a data de atualização**. O checklist é a fonte da verdade do progresso.
- Quando uma feature entrar em desenvolvimento, escrever o plano detalhado de implementação (tarefas TDD passo a passo) em `docs/superpowers/plans/` e linkar no README da feature.
- Status: ✅ completo (com testes) · 🟡 parcial · ❌ ausente

## Mapa de features e status atual (2026-08-16)

| # | Feature | Backend | Frontend | Testes | Status |
|---|---------|---------|----------|--------|--------|
| 00 | [Fundação técnica](00-fundacao-tecnica/README.md) | ✅ | ✅ | ✅ | 🟡 quase completa (2026-08-03: Tasks 1-6 entregues). Decisões já tomadas: validação = **Zod** (2026-08-03, express-validator removido), SMTP hardcoded **mantido por decisão do dev**. Auditoria 2026-08-11: o ledger de migrações (item 0.4) estava desmarcado mas em uso desde a Etapa 2; restam **21 `ALTER TABLE` residuais com erro engolido** em `routes/almoxarifado.js` — pendência nomeada na spec |
| 01 | [Cadastros de materiais](01-cadastros-materiais/README.md) | 🟡 | 🟡 | 🟡 | 🟡 Etapa 2 entregue (2026-08-04): campos técnicos/reposição/controles/ABC/unidades, subfamílias (`parent_id`), auditoria de criação/edição, form em 6 seções; falta tabela de conversões, categorias hardcoded do front, `almoxarifadoApi.js`. Correção 2026-08-11: a spec dizia que `controle_lote`/`controle_certificado` não tinham verificação efetiva — têm desde a Etapa 6 (`controle_validade`/`controle_serie`/`controle_corrida` seguem mortas, Etapas 6b/6c). **Etapa 8c, Task 1 (2026-08-13, `028da1e`):** criar material **deixou de ser um `INSERT` inline no handler HTTP** e virou `services/almoxarifado/materialService.createMaterial` (o gate `criar_material` fica na rota, de propósito); e `GET /proximo-codigo` **deixou de usar `ORDER BY id DESC`** — que devolvia o código do registro de maior `id`, **não** o de maior número — passando ao **MAX do sufixo numérico**, com o campo novo `codigo_auto` + retry sob UNIQUE para cadastro em lote. A pendência das **categorias hardcoded no front continua aberta**: a 8c encostou nela e não resolveu |
| 02 | [Localizações e endereçamento](02-localizacoes-enderecamento/README.md) | 🟡 | 🟡 | 🟡 | 🟡 Etapa 2 entregue (2026-08-04): multi-almoxarifado (entidade raiz + migração ledger), bloqueio/restrição de tipo aplicados no motor, exclusão com saldo bloqueada, consultas de vazias/sem-endereço; falta capacidade/peso enforcement, sugestão de localização, leitura por confirmação. **Decisão de negócio (2026-08-05): almoxarifado é área física de alocação dentro do mesmo site, não filial — o cliente tem uma única filial. Saldo global por material (sem recorte por almoxarifado) é intencional e NÃO é lacuna; não propor segregação de saldo nem seletor de almoxarifado em movimentação/requisição** |
| 03 | [Motor de estoque](03-motor-estoque/README.md) | ✅ | ✅ | ✅ | 🟢 Etapa 1 entregue (2026-08-04); a validação de vencido/lote reprovado que faltava **foi entregue na Etapa 6, Task 3** (`65d78fd`+) e a liberação de vencimento na Task 3b (`556f86d`). **Etapa 8b (2026-08-12):** a fórmula do disponível ganhou a **quarta retenção** (`quantidade_em_terceiros`) e deixou de ser replicada — a conta agora mora só em `services/almoxarifado/availabilitySql.js` (`0a01124`), e quatro tipos de movimento novos entraram no motor (`e0be211`). **Etapa 8c (2026-08-13):** tipo de movimento novo **`RETORNO_TRANSFORMACAO`** (`9c7ec75`) — **entrada**, aceita custo (alimenta a média ponderada do material de destino), em `TIPOS_DEDICADOS` (fora da rota genérica) e em `TIPOS_ISENTOS_DONO`. Mais **duas fontes únicas** criadas por tarefas extras do mesmo dia, ambas nascidas da execução e não do plano: `services/almoxarifado/custoSql.js` (`a644ab7`) — a leitura de custo, que por `COALESCE(custo_medio, custo_unitario, 0)` valorava a **zero** o acervo inteiro (a coluna é `REAL DEFAULT 0`, não NULL) — e `services/almoxarifado/movementTypes.js` (`3ef0144`) — as listas de tipos que somam/subtraem saldo, que eram **quatro** cópias e faziam a posição por cliente mentir sem quebrar teste. Pendência nomeada e ainda aberta: `PUT /conferencias/:id/concluir` escreve `quantidade_atual` por fora do motor (anterior à Etapa 6) — e isso alcança também a retenção nova |
| 04 | [Requisições](04-requisicoes/README.md) | 🟢 | 🟢 | 🟢 | 🟢 Etapa 3 entregue (2026-08-05): ciclo ponta a ponta rascunho→envio→aprovação→separação→retirada→entrega→confirmação→encerramento; entrega/estorno via motor de estoque; máquina de estados explícita; falta lote/série na entrega, anexos e importação de BOM/OP. Correção 2026-08-11 (`92fe236`): a tela não conhecia os status de reserva da Etapa 4 — requisição aprovada com saldo ficava com badge cru, sem "Iniciar Separação" e sem "Cancelar"; corrigido com teste (`RequisicoesList.test.js`) |
| 05 | [Separação e picking](05-separacao-picking/README.md) | 🟡 | 🟡 | 🟡 | 🟡 básico (spec revisada 2026-08-11 — estava congelada em 2026-08-02: liberar-retirada já existia desde a Etapa 3, e desde a Etapa 4 o disponível baixa na **aprovação** via reserva, não na separação) |
| 06 | [Motor de aprovações](06-aprovacoes/README.md) | 🟡 | 🟡 | 🟡 | 🟡 Etapa 3 entregue (2026-08-05): segregação (solicitante não aprova a própria), rejeição justificada, emergencial com justificativa, decisões auditadas; falta motor de regras configuráveis por tipo/valor/quantidade/projeto (tabela `regras_aprovacao` + UI — fica para demanda real) |
| 07 | [Reservas de estoque](07-reservas/README.md) | 🟢 | 🟢 | 🟢 | 🟢 **Etapa 4 completa (backend 2026-08-05, tela 2026-08-06)** — consumo contra reserva (o buraco central: antes reservar tornava o saldo inutilizável até para quem reservou), reserva automática na aprovação com os status PARCIALMENTE/TOTALMENTE_RESERVADA, transferência entre projetos, expiração por endpoint (opt-in), liberação no cancelamento da requisição e tela em `/almoxarifado/reservas`. **Task 6 fechada (2026-08-06)**: `/aprovar-valor` passou a reservar e excluir requisição passou a liberar. Ressalva 2026-08-11: os status de reserva não apareciam na tela de **requisições** (feature 04) — corrigido em `92fe236`; a tela de reservas em si estava correta |
| 08 | [Recebimento](08-recebimento/README.md) | 🟡 | 🟡 | 🟡 | 🟡 **Etapa 5 entregue (2026-08-08)**: entrada de item que exige inspeção deixou de ser barrada — agora entra sempre, retida (`quantidade_em_inspecao`), via movimentação `QUARENTENA` vinculada ao recebimento; review final 2026-08-10 (`6bb455d`): entrada da nota **atômica e idempotente** (reprocessar não duplica estoque) — spec da feature atualizada em 2026-08-11, estava parada em 08-09; falta tipos de entrada (8.1) e conferência física estruturada (fora do escopo, decisão do design) |
| 09 | [Inspeção e qualidade](09-inspecao-qualidade/README.md) | 🟡 | 🟡 | 🟡 | 🟡 **Etapa 5 entregue (2026-08-08)**: decisão de inspeção real (aprovar/reprovar/parcial) com claim atômico em duas fases, bloqueio/desbloqueio avulso com justificativa obrigatória, tela `/almoxarifado/inspecoes`; falta plano de inspeção com medidas, não conformidade formal, desvio autorizado e perfil QUALIDADE (fora do escopo). Pendência criada: material reprovado fica bloqueado sem vínculo ao recebimento de origem até a feature 12 consumir o `encaminhamento` registrado |
| 10 | [Lotes, séries e etiquetas](10-lotes-series-etiquetas/README.md) | 🟢 | 🟢 | 🟢 | 🟢 **As três partes completas: Etapa 6 + Task 9 (2026-08-09, `b7035dd..9406bff` + `09c75d2`); Etapa 6b — série, backend + UI (2026-08-11, `418d617..b46d820`); Etapa 6c — etiquetas com QR, 100% client (2026-08-11, `35967b9..0785119`).** Lote deixou de ser texto livre: tabela `lotes_almoxarifado` + `lotService` dono do ciclo de vida, saldo referenciando o lote por FK (`lote_id`) e sem as 3 colunas de retenção que nunca tiveram escritor, saída validando status/validade/saldo **do próprio lote** (o bug do −8 em silêncio), `controle_lote` e `controle_certificado` acesas (Etapa 6), lote nascendo no recebimento, FEFO na API e na tela, e liberação de vencimento com justificativa auditada (Task 3b). **Série é entidade real, com UI completa** (Etapa 6b): tabela `series_almoxarifado`, `seriesService` completo (leitura/entrada/saída/reversões/bloqueio/mudança de status), motor integrado a movimentações manuais e recebimento — requisições e inspeção seguem isentos, ver pendências (a)/(b) da 6b na spec 10 —, duas rotas HTTP, e telas — Movimentações (textarea+gerador na entrada, seletor filtrado por lote na saída), Recebimentos (textarea de séries por item), aba "Séries" dentro de "Lotes e Séries" (bloquear/desbloquear com justificativa), hint da flag no formulário de material, KPI no extrato. **A ressalva que sobra:** o modal rápido de entrada/saída da tela de Materiais (rota v1) continua sem campo de série e sempre recusa material controlado — use Movimentações. **A Task 9 fechou a lacuna que a Etapa 6 deixou**: tela `/almoxarifado/lotes` (mudar status, liberar vencimento, anexar certificado — o caso que destravava material preso por `controle_certificado`) e Sucata/Perda selecionáveis na Movimentação. **A Etapa 6c fecha a feature**: PDF de etiqueta (A4 em grade ou térmica 100×50) gerado inteiro no client, com QR que abre a tela do item já filtrada e destacada — código GMP, nome truncado e a linha de lote/série vão para o papel; o resto fica atrás do QR de propósito (overload de informação era o erro a evitar). Zero mudança de servidor. **Faltam:** extrato agregado do lote, as flags `controle_validade`/`controle_corrida` continuam mortas, etiqueta de retalho (aguarda UI da feature 15), etiqueta de localização (cortada de propósito — o mapa já cobre). Pendências abertas: extrato agregado do lote, lote/série automáticos nos 4 fluxos internos + transferência, reprovação por lote/série não ligada à inspeção, reserva por lote/série inexistente, 4 colunas de lote com escritor e sem leitor, compensações do motor não failure-safe (débito arquitetural, resolve na migração Postgres), impressora física do galpão não confirmada, QR lido sem sessão perde o destino depois do login (melhoria global de auth, fora do escopo client da 6c), e 2 decisões de negócio aguardando o cliente — ver a spec 10 |
| 11 | [Transferências](11-transferencias/README.md) | ✅ | ✅ | ✅ | 🟢 **Etapa 7 entregue (2026-08-12, `29524fc..0722bfd`)** — a transferência exige lote em material controlado (exigiu estender a guarda do motor: `TRANSFERENCIA` é **ramo próprio**, fora de `tiposEntrada`/`tiposSaida`, então declarar `exigeLote` na rota não bastava), está declarada em `REGRAS_VINCULO` com `{ vinculo: 'nenhum' }`, e ganhou tela **dentro do formulário de Movimentações** (origem + destino + seletor de lote), não tela dedicada — a transferência *é* uma movimentação origem→destino e o formulário já tinha 90% dela. **O "em trânsito" foi CORTADO por decisão do cliente, não é pendência**: os almoxarifados são áreas físicas do mesmo site, o cliente tem uma filial só, alguém pega a caixa e leva na hora; com ele saíram aprovação, recebimento com conferência e o alerta "não recebida". Intencional e testado: transferência **não** checa status nem vencimento do lote (mover lote reprovado de prateleira é como ele vai parar na área de bloqueados). Fora de escopo declarado: **série na transferência** (o claim de série no motor só existe para entrada e saída; o `localizacao_id` da série é informativo e o saldo real, que a transferência move certo, vive em `estoque_saldo_almoxarifado`) |
| 12 | [Devoluções](12-devolucoes/README.md) | ✅ | ✅ | ✅ | 🟢 **Etapa 7 entregue (2026-08-12, `29524fc..0722bfd` + `eabd848`)** — devolução cita a saída original (vínculo **opcional mas validado**: mesmo material, não cancelada, tipo devolvível, e `quantidade + já devolvido ≤ entregue` com a mensagem **dizendo quanto resta**), herda o `lote_id` da entrega, reativa a série `ENTREGUE → EM_ESTOQUE`, e tem tela dedicada em `/almoxarifado/devolucoes` (começa pelo **material**, porque pela requisição não se alcança saída manual). Duas colunas por `safeAlter` e a rota de leitura `GET /devolucoes/saidas-elegiveis`. **Bug de saldo corrigido em commit próprio (`29524fc`): devolver para sucata baixava o estoque DUAS vezes** — 100 → saída 10 → 90 → devolução 3 para sucata dava **87**; a spec 12 descrevia esse comportamento como se estivesse certo e foi corrigida dizendo que estava errada. Conserto fora do plano (`eabd848`): devolução recusada não deixa mais linha gravada (compensação), porque a linha fantasma encolhia **permanentemente** o devolvível da entrega citada. Fora de escopo declarado: série no **descarte** de devolução (caminho de dois passos, com 400 que ensina o caminho), fotos/anexos, devolução ao fornecedor, estorno de custo de projeto (22), tipos de devolução por origem (13/16) |
| 13 | [Materiais de clientes](13-materiais-clientes/README.md) | ✅ | ✅ | ✅ | 🟢 **Etapa 8 entregue (2026-08-12, `f26b635..5b5eb55`)** — material de cliente virou **material normal com dono** (`proprietario_cliente_id`, `NULL` = nosso) e ganhou tudo que as Etapas 1 a 7 construíram: lote, série, endereço, extrato, etiqueta e livro. **A segregação não foi "lembrar de filtrar"**: 40 leituras da tabela auditadas uma a uma e classificadas em A (estoque próprio → filtra), B (leitura por id → não filtra, senão o motor pararia de funcionar para material de cliente) e C (misturar é o correto → não filtra, e o **selo** é a contrapartida). **Guarda do dono** na saída, com a **emergencial NÃO furando** — única exceção deliberada ao padrão do módulo, porque "regularizo depois" não é resposta para o dono da chapa. **Ajuste** sob a ação nova `ajustar_material_cliente` (só ADMINISTRADOR), verificada **dentro do motor** porque o AJUSTE chega por duas rotas ambas gateadas por `movimentar`. Tipo `DEVOLUCAO_CLIENTE` (saída, rota dedicada, documento obrigatório) — **não confundir com a devolução da Etapa 7**, onde o material volta. Ilha aposentada (rotas e serviço removidos; **tabela preservada**). Tela `/almoxarifado/materiais-cliente` com posição por cliente + PDF no navegador. **Duas correções declaradas de spec:** a spec de design mandava auditar o lugar errado (`9d70d8c`), e o item "entrada exige cliente + **projeto** + documento" estava **ERRADO** quanto ao projeto — a linha diz isso em vez de sumir. **Fora do escopo, declarado:** e-mails (19), sobras (15), perdas/não conformes/valorização por cliente (21), aprovação assíncrona de ajuste (06). **Pendência aberta e grave o bastante para o guia do usuário:** a conferência de inventário (`routes/almoxarifado.js:941`) ajusta `quantidade_atual` fora do motor, logo fora da permissão nova |
| 14 | [Materiais em terceiros](14-materiais-terceiros/README.md) | ✅ | ✅ | ✅ | 🟢 **COMPLETA — as duas metades entregues: Etapa 8b (2026-08-12, `0a01124..b176212`), o MESMO material volta; Etapa 8c (2026-08-13, `753d23b..61c6f52`), volta OUTRA coisa.** **8b** — remessa e retorno do **MESMO** material, ciclo completo. Quarta coluna de retenção `quantidade_em_terceiros` (sai do disponível, **não** do patrimônio) com a conta do disponível **centralizada** em `availabilitySql.js`; conferência de inventário descontando **só ela**; três tabelas + `thirdPartyStateMachine` (`ABERTA → ENVIADA → RETORNO_PARCIAL → ENCERRADA/CANCELADA`); quatro tipos de movimento no motor; envio **tudo-ou-nada** agregando por material; retorno parcial com teto acumulado **por item**; encerramento com **destino obrigatório** (`PERDA_NO_TERCEIRO`/`CONSUMIDO_NO_PROCESSO`) + justificativa; cancelamento com estorno **do que ainda está lá fora**; ação de perfil `remessar_terceiro`; sete rotas + `GET /vencidas`; tela `/almoxarifado/remessas-terceiros` + PDF no navegador. **Correção declarada de spec:** o checklist dizia "envio = saída para localização virtual", e isso **estava errado** — o disponível é calculado sobre o escalar `quantidade_atual`, então localização virtual não tira nada do disponível. **Correção declarada de status:** esta linha dizia *"**Falta a Etapa 8c — transformação**"* — **deixou de ser verdade em 2026-08-13**. **8c** (`753d23b..61c6f52`) — corte, dobra e usinagem: sai 1 chapa e voltam N peças mais uma sobra, no **mesmo evento** (a chapa baixa por `CONSUMO_TERCEIRO`, cada resultado entra pelo tipo novo `RETORNO_TRANSFORMACAO`, `9c7ec75`); três colunas em `retornos_remessa_item_almoxarifado` (`tipo_resultado` `PECA`/`SOBRA`, `custo_unitario_aplicado`, `movimentacao_consumo_id` como agrupador do evento), com `NULL` significando "retorno simples"; rateio de custo em função **pura** (`transformCost.js`) — **peça recebe rateio, sobra entra a custo ZERO**; rota dedicada `POST /remessas-terceiros/:id/transformacoes` (`remessar_terceiro`), tipo em `TIPOS_DEDICADOS` (fora da rota genérica); guarda própria `assertMesmoDonoNaTransformacao` (a peça tem de ter o **mesmo** dono da chapa); modal com N resultados, classificação e rendimento. E-mail (19) e alerta de atraso (20) seguem **fora do escopo**. **Pendência que continua aberta e precisa de resposta do cliente:** "uma remessa não mistura donos" foi **deduzida**, não pedida. Pendência menor da 8c: o **rendimento** é calculado, exibido e **jogado fora** — não há coluna que o guarde |
| 15 | [Retalhos, sobras e sucatas](15-retalhos-sucatas/README.md) | ✅ | ✅ | ✅ | 🟢 **Etapa 9 entregue (2026-08-16, `b727c0a..4ba94e2`)** — retalho é material normal no motor (`ENTRADA_RETALHO` dedicado, sem custo) + anexo dimensional na tabela de sobras reformada (auditada, Zod, `POST /sobras` avulso aposentado); `gerarRetalho` é evento composto com guarda de dono e compensação; `SUCATA` saiu do formulário genérico e virou processo com **dupla aprovação segregada** (duas ações novas de perfil, baixa pelo motor na segunda assinatura, claim anti-corrida), destino VENDIDA/DESCARTADA com comprovante e relatório `sucata-financeiro` lendo o livro; tela `/almoxarifado/sobras` (Retalhos + Sucateamentos), etiqueta de retalho com QR e hint de retalho na SAÍDA. Os 4 testes nomeados da spec existem e passam. **Fora do escopo declarado:** e-mail (→ 19). Pendências nomeadas na spec: guarda geral de tipo novo nas fontes únicas, coluna `foto` sem escritor, lote do material-retalho, `valor_venda` em DESCARTADA |
| 16 | [Ferramentas e calibração](16-ferramentas-calibracao/README.md) | 🟡 | 🟡 | ✅ | 🟢 **Etapa 9b entregue (2026-08-22, `d644827..b8e6f60`)** — ferramenta virou patrimônio emprestável completo: máquina de estados explícita (`toolStateMachine.js`) com toda transição por **claim** (`UPDATE ... WHERE status IN (...)`, sem a janela de corrida SELECT-depois-UPDATE que existia antes), calibração com vencimento **lida da última calibração** (sem coluna-cache) barrando o empréstimo, avaria/perda com foto encerrando o empréstimo aberto no mesmo ato (RN-05), bloqueio/manutenção/reencontro com justificativa auditada, ação de perfil própria `gerenciar_ferramentas` (parou de usar o gate genérico `movimentar`), Zod em todas as rotas (nenhuma tinha antes), auditoria em toda escrita (emprestar/devolver não auditavam antes), e tela `/almoxarifado/ferramentas` com três visões (Ferramentas, Empréstimos, Calibrações). Revisão final de branch achou 4 Important cross-task que os gates por-task não pegam (busca/filtro do contrato ignorados pelo backend; corrida devolver↔ocorrência podendo corromper o status; PUT/409 sem teste; badge de vencimento do front discordando do servidor) — todos corrigidos e re-revisados limpos. **Fora do escopo declarado, com pendência aberta:** job de lembrete de devolução sem canal de notificação (função pura pronta, aguarda feature 20), UI de edição de ferramenta (backend testado, só falta o formulário — achado da revisão final), integração com inspeção (feature 09) |
| 17 | [Inventário e contagem cíclica](17-inventario-contagem/README.md) | 🟢 | 🟢 | ✅ | 🟢 **Etapas 10 + 10b entregues (2026-08-22/23, `d644827..8db2671` e `14f4458..7290481`)** — a 10 resolveu o risco crítico (tipo dedicado `AJUSTE_INVENTARIO` pelo motor, guarda de retenção decidindo a pendência B1/B2/B3, contagem cega, tolerância+recontagem, tudo-ou-nada); a 10b entregou **escopos de contagem combináveis** (família raiz, ABC, críticos, de clientes, em terceiros), **dupla contagem por duas pessoas** (recontagem de outra pessoa, número do colega escondido com ou sem modo cego, correção própria pré-recontagem, autoria por item), **relatório de acuracidade** (ponderado, contados/total + recontados, impacto persistido sem backfill) e o **epsilon de divergência como fonte única** (alcançando o relatório antigo, que ganhou gate + só CONCLUIDO). **Fora, declarado com porquê na spec:** contagem por endereço (+ guarda de retenção com localização), cíclica automática, congelamento (ruling mantido), dupla aprovação formal (aguarda B11), e-mail, tela de conciliação lado a lado |
| 18 | [Reposição e estoque mínimo](18-reposicao-estoque-minimo/README.md) | 🟢 | 🟢 | ✅ | 🟢 **Etapa 11 entregue (2026-08-24, `54e1278..1ea6ab2`)** — motor de sugestão no `purchaseService` (consumo médio por `TIPOS_SAIDA` em janela configurável; ponto efetivo com **a mínima como chão** de todas as réguas; posição = `disponivelSql` + solicitações abertas dentro do **horizonte** configurável, com `a_caminho_vencido` exposto; alvo `max(máxima, ponto)` com lote econômico como piso), `GET /reposicao/sugestoes` consolidado por fornecedor e valorado, `POST /gerar-solicitacoes` (quantidades do servidor, sem dedupe — a posição É o dedupe, complemento em pendência insuficiente, auditado), `GET /estoque-parado` (excesso/sem consumo/obsoleto com valor parado), ação nova `gerenciar_reposicao` [ADMIN, GESTOR, COMPRAS — ALMOXARIFE fora de propósito], relatório de solicitações com VINCULADO e gateado, horizonte compartilhado com a máquina de estados de requisição, 3 configs semeadas+editáveis com validação nos dois lados, índice novo no livro, tela `/almoxarifado/reposicao` (3 abas, painel de erro/permissão por aba). **Fica de fora, declarado:** ~~fechar/cancelar solicitação no recebimento~~ (**entregue na Etapa 14** — RECEBIDA automática + CANCELADA com justificativa, ver feature 22), itens por material (feature 24), alerta ativo de máximo, e-mail (19) |
| 19 | [E-mails e notificações](19-emails-notificacoes/README.md) | 🟢 | 🟢 | ✅ | 🟢 **Etapa 12 entregue (2026-08-24, `c1613c2..d7fee6c`)** — fila `fila_notificacoes_almoxarifado` (dedupe UNIQUE por hash, retry/backoff em JS, claim de envio contra drenos concorrentes, FALHA + aviso ao admin máx. 1), gancho pós-commit no motor por CLASSES (default `'0'`; RESERVA/remessa/retorno/AJUSTE_INVENTARIO fora de propósito; cancelamento suprime a pendente e recusa reenvio), 3 dívidas pagas (lembrete ferramenta 9b/B7, resumo de solicitações 11, devolução parcial 7), painel `/almoxarifado/notificacoes` gateado (`gerenciar_notificacoes` ADMIN/GESTOR; reenvio de ENVIADO com confirm), jobs (worker + varreduras diárias), 10 configs nos dois lados. **Cortes declarados:** matriz evento×destino, templates, digest, PDF, grupos (letra D/B15) |
| 20 | [Alertas operacionais](20-alertas/README.md) | 🟡 | ❌ | 🟡 | 🟡 **6 de 22 (Etapa 12 somou 4)** — estoque zerado (máquina própria, claim atômico, só material sem mínimo — B17), lote vencendo (sem piso: vencido com saldo entra), remessa vencida, ferramenta não devolvida; pela fila da 19. Falta: central no front, motor único de regras, e os ~16 restantes com a feature dona de cada um |
| 21 | [Relatórios e dashboards](21-relatorios-dashboards/README.md) | 🟢 | 🟢 | ✅ | 🟡 **Etapa 13 entregue (2026-08-24, `4fdda54..8bb5e52`)** — `reportRegistry` com 18 chaves e gate DECLARADO por chave (mata a classe "relatório novo esquece o gate", 2 precedentes 10b/11; o processo nem sobe com chave órfã), lista fail-closed servindo exportavel/limite/nota/colunas, export XLSX genérico com projeção (paridade linha+cabeçalho medida; payload objeto → 400 literal), `consumoSql.js` fonte única (4 réguas divergentes DOCUMENTADAS — 10 vs 18 medido, unificar é letra B19), indicadores (giro aproximado declarado, cobertura mediana, rupturas físico+tipo, valor por grupo, atendimento sem janela), tela `/almoxarifado/relatorios` dirigida pelo registro, 3 cartões no dashboard. **Falta para 🟢 pleno:** PDF (corte D), previsto×realizado (depende da 22), % no prazo/fornecedor (features donas), valorização por cliente (letra B) |
| 22 | [Integrações](22-integracoes/README.md) | 🟡 | 🟡 | ✅ | 🟡 **Etapa 14 entregue (2026-08-25, `b276dca..2de7944`)** — a fatia integrável REAL, medida antes de prometida: **Compras** (ciclo de vida da solicitação: RECEBIDA automática no recebimento da nota do pedido vinculado, nos dois caminhos; CANCELADA manual com justificativa auditada — **fecha a B14 da feature 18**; vincular valida as duas pontas; D9 abre vincular/verificar-mínimos para `gerenciar_reposicao`; verificar-mínimos audita o autor; contexto do comprador com último custo por NF) e **custo por projeto** (relatório `custo-por-projeto` computado do livro, consumido/devolvido/líquido, custo atual retroativo declarado, gate nasce fechado; herança de projeto/OS na devolução nas duas pernas). **Falta para 🟢, tudo bloqueado por dependência com a medição escrita na spec:** BOM/Engenharia (inexistente no sistema), OP/Produção (MES sem uso), centro de custo (sem entidade), previsto×realizado, acompanhamento de prazo de pedido, aviso de rejeição da Qualidade ao comprador |
| 23 | [Perfis, segurança e auditoria](23-perfis-seguranca-auditoria/README.md) | 🟡 | 🟡 | 🟡 | 🟡 Correção 2026-08-11: a spec dizia "auditoria com 0 linhas em produção" — **superado desde as Etapas 3-6** (materiais, requisições, motor, reservas, lotes, recebimento e inspeção auditam, todos com tela). Buraco real restante: conferência de inventário não audita. **A pendência das sobras foi paga na Etapa 9, Task 1 (`bedce46`)** — `scrapService` audita atualizar e gerar retalho, e o sucateamento audita solicitar/aprovar/rejeitar/cancelar/destino/compensação |
| 24 | [Mobilidade](24-mobilidade/README.md) | ✅ | ✅ | ✅ | 🟢 **Etapa 15 entregue (2026-08-28, `7f74b6c..a82ad43`) — no escopo MEDIDO, que não é a Fase 4 inteira da spec original.** Scanner de QR pela câmera (`/almoxarifado/scanner`, client-only: os QRs da 6c carregam URLs do próprio sistema; `parseQrDestino` só navega para `/almoxarifado/...` com filtro explícito de protocolo E de prefixo-com-barra — o Important da revisão final); assinatura digital + recebedor na entrega de requisição (tabela append-only `assinaturas_entrega_almoxarifado` auditada, `POST /requisicoes/:id/assinatura-entrega` multipart gateado por `separar_emitir`, detalhe expõe `assinaturas_entrega`; **opcional por design** — a entrega nunca depende dela); balcão mobile (a regra CSS que escondia colunas ≥4 — inclusive Ações — morreu; scroll na própria `.almox-table`; modais fullscreen). **Fora por medição, declarado:** 1D (nada gera), coletor (hardware não confirmado), app nativo/PWA/offline, fotografia na saída, flags `requer_assinatura`/`requer_termo` seguem mortas (B26). Pendências nomeadas na spec: 500 opaco de multer nas 5 rotas de upload, teste em aparelho real, flags por tipo |

## Ordem de desenvolvimento sugerida (etapas pequenas)

Cada etapa é pequena, independente e termina com testes passando. **Não pular a Etapa 0** — ela remove os riscos que quebrariam features existentes.

### Etapa 0 — Fundação (obrigatória primeiro) → pasta `00-fundacao-tecnica`
1. Harness de testes de API (supertest + app de teste + SQLite em memória).
2. Eliminar DDL duplicado (schema só em `services/almoxarifado/schema.js`).
3. Unificar movimentações: frontend passa a usar a v2 (com auditoria); v1 vira alias ou é aposentada.
4. `safeAlter` estrito + uso consistente do ledger de migrations.
5. Corrigir inconsistências de permissão conhecidas e tirar SMTP hardcoded do código.

### Etapa 1 — Motor de estoque confiável → `03-motor-estoque`
Saldo físico/reservado/bloqueado/disponível consistente; bloqueio de saldo negativo; estorno com motivo; livro de movimentações completo; vínculo estruturado a projeto/OS/centro de custo (colunas já existem).

### Etapa 2 — Cadastros completos → `01-cadastros-materiais` + `02-localizacoes-enderecamento`
Campos faltantes do material; subfamílias formais; unidades de compra/consumo + fator de conversão; decisão multi-almoxarifado; restrições de endereço.

### Etapa 3 — Requisições ponta a ponta → `04-requisicoes` + `06-aprovacoes`
Status faltantes; validações (quantidade > 0); confirmação de recebimento; encerramento; regras do motor de aprovação (dupla aprovação, solicitante não aprova a própria).

### Etapa 4 — Reservas com UI → `07-reservas`
Reserva automática pós-aprovação, liberação, expiração; integração com requisições.

### Etapa 5 — Recebimento + Inspeção → `08-recebimento` + `09-inspecao-qualidade`
Tipos de entrada; conferência física; quarentena e bloqueio efetivos no saldo.

### Etapa 6 — Lotes → `10-lotes-series-etiquetas`
**Dividida em três em 2026-08-09** — a feature 10 é grande demais para uma etapa, e descrevê-la como item único fazia parecer que ficaria pronta de uma vez:
- **Etapa 6 ✅ ENTREGUE (2026-08-09, `b7035dd..9406bff`)** — tabela `lotes_almoxarifado` com validade/corrida/certificado; regras de saída (vencido, bloqueado, reprovado); FEFO como sugestão; guarda contra saldo negativo por lote; campo de lote no recebimento. Mais uma task que não estava no plano: **3b, liberação de vencimento com justificativa** (`556f86d`) — a guarda tinha sido escrita sem o caminho de liberação que o cliente pedira no design, e mandava o operador "liberar pela tela de lotes", que não existia. [Plano](../../docs/superpowers/plans/2026-08-09-almoxarifado-etapa6-lotes.md) · [design](../../docs/superpowers/specs/2026-08-09-almoxarifado-etapa6-lotes-design.md).
- **Etapa 6b — ✅ ENTREGUE em 2026-08-11** — números de série, backend (Tasks 1-7, `418d617..fc33d59`) + UI (Tasks 8-11, `4836d24..f11a3f0`) + documentação (Task 12). Tabela `series_almoxarifado`, `seriesService` (leitura/entrada/saída/reversões/bloqueio), motor de série integrado a movimentações manuais e recebimento — requisições e inspeção seguem isentos, pendências declaradas —, duas rotas HTTP, e telas: Movimentações (textarea+gerador na entrada, seletor na saída), Recebimentos (textarea por item), aba "Séries" em "Lotes e Séries" (bloqueio justificado), hint da flag, KPI no extrato. O aviso anterior ("ligar `controle_serie` trava o recebimento pela tela") está **superado** desde as Tasks 8-10 — a única ressalva que sobra é o modal rápido v1 da tela de Materiais, que continua sem campo de série (mesmo padrão já existente para lote). Plano completo: [`docs/superpowers/plans/2026-08-11-almoxarifado-etapa6b-series.md`](../../docs/superpowers/plans/2026-08-11-almoxarifado-etapa6b-series.md). **Pendências da 6b** (não bloqueiam a etapa, ver spec 10): extrato agregado do lote, reserva por série, reprovação por série via inspeção não ligada, isenção dos 4 fluxos internos + transferência, compensações do motor não failure-safe (resolve na migração Postgres).
- **Etapa 6c — ✅ ENTREGUE em 2026-08-11** (`35967b9..0785119`) — etiquetas com QR Code em PDF. Util
  client `utils/etiquetasPdf.js` (formatos `A4_GRADE`/`TERMICA_100x50`, montadores puros por
  material/lote/série/recebimento, renderizador `jsPDF`+`qrcode`), `EtiquetasPdfModal`
  compartilhado (formato lembrado em `localStorage`), botões em Materiais, "Lotes e Séries"
  (por linha + bulk das séries em estoque) e Recebimentos (nota processada), e deep-link
  `?material_id=&aba=&lote=/&serie=` com destaque em "Lotes e Séries". **Zero mudança de
  servidor** — decisão de design (jspdf/qrcode no client, `window.location.origin` resolve a
  URL do QR sem base configurada no servidor). Pendências (não bloqueiam a feature, ver spec 10):
  impressora física do galpão a confirmar com o cliente, etiqueta de retalho aguardando UI da
  feature 15, etiqueta de localização cortada de propósito (o mapa já cobre), etiquetas do
  recebimento usam o texto digitado (rota "séries por recebimento_item" fica como robustez
  futura), sem registro de impressão (YAGNI declarado). Plano completo:
  [`docs/superpowers/plans/2026-08-11-almoxarifado-etapa6c-etiquetas.md`](../../docs/superpowers/plans/2026-08-11-almoxarifado-etapa6c-etiquetas.md).

`6b`/`6c` e não `7`/`8` porque as etapas 7 e 8 abaixo já estão ocupadas. **Com a 6c fechada, a
feature 10 ficou completa por inteiro; a Etapa 7 (transferências e devoluções) e a Etapa 8
(materiais de clientes) fecharam em 2026-08-12.** *(Este parágrafo terminava dizendo "e a próxima
da ordem é a Etapa 8b — materiais em terceiros" — **envelheceu**: a 8b fechou em 2026-08-12 e a 8c
em 2026-08-13. A próxima da ordem está discutida no cabeçalho deste arquivo, e **precisa ser
decidida**.)*

### Etapa 7 — ✅ ENTREGUE em 2026-08-12 → `11-transferencias` + `12-devolucoes`
`29524fc..0722bfd`, mais os consertos `eabd848`/`7fc1b7f` (compensação da devolução recusada) e
`d117dc2` (badge de `TRANSFERENCIA` sem cor no livro).

- **Transferência**: exige lote em material controlado, declarada em `REGRAS_VINCULO`
  (`{ vinculo: 'nenhum' }`), e virou tipo do formulário de **Movimentações** com origem, destino e
  seletor de lote. Não checa status nem vencimento do lote — **de propósito, com teste**.
- **Devolução**: cita a saída original com validação de quantidade (a recusa diz **quanto resta**),
  herda o lote, reativa a série, e tem tela dedicada `/almoxarifado/devolucoes`. `DEVOLUCAO` saiu do
  formulário genérico de Movimentações — ali criava lançamento solto e nenhum registro de devolução.
- **Bug de saldo corrigido em commit próprio (`29524fc`)**: devolver para sucata baixava o estoque
  **duas vezes**. A spec 12 descrevia o comportamento errado como se fosse correto — corrigida
  dizendo que estava errada.
- **O estado "em trânsito" da spec 15/11 foi CORTADO por decisão do cliente** (site único; a
  transferência é imediata). **Não é pendência esquecida** — se um dia houver obra externa ou
  segundo prédio, o item volta com justificativa nova.

Plano: [`docs/superpowers/plans/2026-08-12-almoxarifado-etapa7-transferencias-devolucoes.md`](../../docs/superpowers/plans/2026-08-12-almoxarifado-etapa7-transferencias-devolucoes.md) ·
design: [`docs/superpowers/specs/2026-08-12-almoxarifado-etapa7-transferencias-devolucoes-design.md`](../../docs/superpowers/specs/2026-08-12-almoxarifado-etapa7-transferencias-devolucoes-design.md).

### Etapa 8 — ✅ ENTREGUE em 2026-08-12 → `13-materiais-clientes`

**A Etapa 8 foi DIVIDIDA em 2026-08-12**, mesmo precedente da Etapa 6 (que virou 6/6b/6c): clientes
e terceiros são subsistemas independentes, e terceiros é construção do zero (remessa com máquina de
estados, documento, retorno parcial, transformação chapa→peças). Cada um fecha com testes passando
por conta própria. **Clientes = Etapa 8 (entregue); terceiros = Etapa 8b (próxima).**

**Etapa 8 = clientes (feature 13)** — `f26b635..5b5eb55`. Material de cliente deixou de ser ilha
(`materiais_cliente_almoxarifado`: texto livre, sem FK, sem motor, tabela vazia) e virou material
normal com dono: `materiais_almoxarifado.proprietario_cliente_id` (`NULL` = nosso). Ganhou lote,
série, endereço, extrato, etiqueta e livro.

| Task | O quê | Hash |
|---|---|---|
| — | design (spec) · plano · **correção da spec, que mandava auditar o lugar errado** | `f26b635` · `323a5da` · `9d70d8c` |
| 1 | coluna `proprietario_cliente_id` + auditoria nomeada de **40 leituras** (classes A/B/C) | `582bc04` |
| 2 | helper de invariante + teste de segregação com **controle positivo obrigatório** | `faf20e7` |
| 3 | guarda do dono na saída — a **emergencial não fura** | `da8ff21` |
| 4 | ação `ajustar_material_cliente`, verificada dentro do motor | `e171eaf` |
| 5 | seção "Propriedade" no cadastro + documento obrigatório no recebimento | `99c9f28` |
| 6 | tipo `DEVOLUCAO_CLIENTE` com rota dedicada | `27eb9c9` |
| 7 | aposentadoria da ilha (rotas e serviço saem, **tabela fica**) | `4a17921` |
| 8 | posição por cliente + tela `/almoxarifado/materiais-cliente` + PDF | `6e97715` · `5b5eb55` |
| 9 | selo de propriedade (client) + servidor dizendo **de qual** cliente | `4eaba65` · `359a152` |
| 10 | documentação e verificação final | este commit |

- **A segregação não foi "lembrar de filtrar".** O risco da etapa não era quebrar: era **não
  quebrar e o número ficar errado** — uma leitura esquecida faz a chapa do cliente contar como
  nossa em reposição de mínimo, sugestão de compra, valor total do estoque e posição, sem nenhum
  erro visível. Por isso a auditoria nomeada, com a classe **C** (misturar é o correto: ocupação de
  prateleira, materiais bloqueados, materiais sem endereço) que **não existia na spec de design**.
- **A saída emergencial NÃO fura a guarda do dono** — exceção deliberada ao padrão do módulo, onde
  `emergencial: true` bypassa a exigência de vínculo. Está comentada no código para não parecer bug.
- **Duas correções declaradas de spec:** a spec de design contava 19 leituras varrendo só o
  subdiretório `routes/almoxarifado/` e deixava de fora o **dashboard** e o
  **`GET /relatorio/posicao-estoque`** — justamente a rota nomeada pelo teste que ela mesma exigia
  (`9d70d8c`); e a spec 13 exigia **projeto na entrada**, o que está errado (o mesmo cliente manda
  a mesma chapa para dois projetos — o projeto é exigido na **saída**).
- **Pendência declarada, fora do escopo:** `routes/almoxarifado.js:941` (`aplicar_ajustes` da
  conferência de inventário) grava `quantidade_atual` **fora do motor**, logo fora da permissão
  `ajustar_material_cliente`. É a mesma família da pendência já registrada na feature 03. **Está no
  guia do usuário**, porque é um caminho real por onde o saldo de material de cliente muda sem a
  autorização especial.
- **Confirmar produção antes do deploy:** a ilha foi aposentada com base em medição do banco de
  **desenvolvimento** (0 linhas). A tabela **fica** exatamente por isso — nenhuma linha é apagada.
  A consulta e o que fazer com cada resultado estão na spec 13 e no guia.

Design: [`…etapa8-materiais-clientes-design.md`](../../docs/superpowers/specs/2026-08-12-almoxarifado-etapa8-materiais-clientes-design.md) ·
plano: [`…etapa8-materiais-clientes.md`](../../docs/superpowers/plans/2026-08-12-almoxarifado-etapa8-materiais-clientes.md).

### Etapa 8b — ✅ ENTREGUE em 2026-08-12 · Etapa 8c — ✅ ENTREGUE em 2026-08-13 → `14-materiais-terceiros`

> **Correção declarada — esta seção estava DUPLAMENTE ERRADA e ficou assim por um dia.** Ela dizia
> `### Etapa 8b — Materiais em terceiros **(próxima da ordem)**` e, no corpo, *"**Sem design
> aprovado nem tasks quebradas** … Primeira ação de quem pegar: `superpowers:brainstorming` com o
> briefing"*. As duas afirmações estão erradas: a **8b fechou em 2026-08-12** (`0a01124..b176212`),
> e a **8c tem design e plano, ambos escritos e executados** — plano
> [`2026-08-13-almoxarifado-etapa8c-transformacao.md`](../../docs/superpowers/plans/2026-08-13-almoxarifado-etapa8c-transformacao.md)
> (o design foi corrigido em `601436d`, porque se contradizia sobre o invariante de custo). Quem
> lesse esta seção sozinha começaria um brainstorming sobre trabalho já entregue. A frase errada
> fica registrada aqui em vez de sumir.

**8b (`0a01124..b176212`)** — remessas para beneficiamento externo com máquina de estados
(`ABERTA → ENVIADA → RETORNO_PARCIAL → ENCERRADA / CANCELADA`), documento de remessa, retorno
parcial e a quarta coluna de retenção `quantidade_em_terceiros`. É a metade em que **o mesmo
material volta** (galvanizar, pintar, tratar).

**8c (`753d23b..61c6f52`)** — a metade em que **volta outra coisa**: corte, dobra, usinagem. Era o
item sem precedente no módulo — toda movimentação é sobre **um** `material_id`, e aqui sai 1 chapa e
voltam N peças mais uma sobra. Resolvido pelo único caminho em que creditar outro material não é
estoque do nada: baixa e crédito no **mesmo evento** (`CONSUMO_TERCEIRO` + `RETORNO_TRANSFORMACAO`),
por **rota dedicada** (`POST /remessas-terceiros/:id/transformacoes`, gate `remessar_terceiro`), com
o tipo novo em `TIPOS_DEDICADOS` para não cair na rota genérica de movimentação.

| Task / tarefa | O quê | Hash |
|---|---|---|
| — | plano · correção do design que se contradizia sobre o invariante de custo | `d741846` · `601436d` |
| 1 | criar material vira serviço (`materialService.createMaterial`) + `proximo-codigo` pelo **MAX** + `codigo_auto` | `028da1e` |
| 2 | recebimento por NF passa a **alimentar o custo médio** | `8cd3fcf` |
| 3 | `tipo_resultado` na linha de resultado (`TIPOS_RESULTADO` antecipado em `03c7ce5`) | `3e1a8dd` |
| 4 | `RETORNO_TRANSFORMACAO` dentro do motor | `9c7ec75` |
| 5 | a peça cortada tem de ter o **mesmo dono** da chapa | `d791fe2` |
| 6 | rateio de custo — função **pura**, com invariante (`transformCost.js`) | `f6dbe39` |
| 7 | `thirdPartyService.registrarTransformacao` | `a9fe371` |
| 8 | rota, schema Zod e rendimento informativo | `31cf440` |
| 9 | modal de transformação com N resultados, classificação e rendimento | `61c6f52` |
| extra | leitura de custo vira fonte única (`custoSql.js`) — relatório valorava a **ZERO** | `a644ab7` |
| extra | listas de tipos viram fonte única (`movementTypes.js`) — posição por cliente **mentia** | `3ef0144` |

- **As duas tarefas "extra" não estavam no plano** — nasceram da execução das Tasks 4 e 7 e são
  correções de defeito **antigo**, cada uma em commit próprio. Detalhe do mecanismo (e por que a
  suíte verde não achava nenhuma das duas) na spec [03-motor-estoque](03-motor-estoque/README.md).
- **Mudança de comportamento declarada, sem backfill:** material recebido por NF passa a ter custo
  médio real, e **só daqui para frente** — `movimentacoes_almoxarifado` não tem coluna de custo
  nenhuma, então recalcular o passado é impossível; o dado não existe.
- **Pendências abertas que a 8c NÃO resolveu, de propósito:** "uma remessa não mistura donos"
  (deduzida, sem resposta do cliente); `AJUSTE` × retenção, agora com **quatro** colunas; categorias
  hardcoded do front; e o **rendimento** que é calculado, mostrado e jogado fora.

### Etapa 9 — ✅ ENTREGUE em 2026-08-16 → `15-retalhos-sucatas` · Etapa 9b — ✅ ENTREGUE em 2026-08-22 → `16-ferramentas-calibracao`

**A Etapa 9 foi DIVIDIDA no design (2026-08-15)**, mesmo precedente de 6/6b/6c e 8/8b/8c: retalho
é **estoque** (precisa do motor), ferramenta é **patrimônio emprestável** (precisa de cadastro,
empréstimo e calibração com vencimento) — cada subsistema fecha com testes por conta própria.

**Etapa 9 = feature 15 (`b727c0a..4ba94e2`)** — retalho no motor via `ENTRADA_RETALHO` + anexo
dimensional; `gerarRetalho` composto com compensação; sucateamento com dupla aprovação segregada e
baixa na segunda assinatura; destino final com comprovante; relatório `sucata-financeiro` pelo
livro; tela `/almoxarifado/sobras`; etiqueta de retalho com QR. Detalhes, decisões endossadas e
pendências: [spec 15](15-retalhos-sucatas/README.md) e o
[plano da etapa](../../docs/superpowers/plans/2026-08-15-almoxarifado-etapa9-retalhos-sucatas.md).

| Task | O quê | Hash |
|---|---|---|
| 0 | correções declaradas das specs 15 e 16 (afirmavam teste que nunca existiu) | `b727c0a` |
| 1 | sobra reformada — auditoria, Zod, usuário gravado, `POST /sobras` aposentado | `bedce46` · fix `2623b0b` |
| 2 | `ENTRADA_RETALHO` nas fontes únicas | `03b8113` · fix `81c1622` |
| 3 | `gerarRetalho` — evento composto, guarda de dono, compensação | `15dd000` · fix `c3424e4` |
| 4 | rota do evento + retalhos disponíveis por material | `8727ff3` |
| 5 | `SUCATA` sai do formulário genérico (tipo dedicado) | `d5821ac` |
| 6 | sucateamento: tabela, máquina de estados, dupla aprovação, baixa pelo motor | `a30ce6f` · fix `ba545e7` |
| 7 | rotas, comprovante multipart, relatório financeiro pelo livro | `bc34819` |
| 8 | tela Sobras e Retalhos + hint na saída | `e27abe8` |
| 9 | sucateamento na tela + etiqueta de retalho com QR | `b8e8f1a` · fix `4ba94e2` |
| 10 | documentação e verificação final | commits de fechamento |

**Etapa 9b = feature 16 (`d644827..b8e6f60`)** — ferramenta virou patrimônio emprestável completo:
máquina de estados explícita com claim atômico em toda transição, calibração com vencimento lida
da última calibração (sem coluna-cache), avaria/perda com foto fechando o empréstimo aberto no
mesmo ato (RN-05), bloqueio/manutenção/reencontro auditados, ação de perfil própria
`gerenciar_ferramentas`, Zod e auditoria em toda escrita, tela `/almoxarifado/ferramentas` com
três visões. Detalhes, decisões (D1–D12) e correções declaradas:
[spec 16](16-ferramentas-calibracao/README.md), o
[design da etapa](../../docs/superpowers/specs/2026-08-19-almoxarifado-etapa9b-ferramentas-calibracao-design.md)
e o [plano](../../docs/superpowers/plans/2026-08-19-almoxarifado-etapa9b-ferramentas-calibracao.md)
(com a retro de fechamento no final).

| Task | O quê | Hash |
|---|---|---|
| Fase 2 | revisão adversarial do plano — 10 achados acatados, 0 ruído | `d644827` |
| 1 | fundação — tabelas, máquina de estados, ação de perfil | `a62f71a` |
| 2 | empréstimo com claim atômico, calibração barrando, auditoria, gate próprio | `a3d37dd` · fix `718adc3` |
| 3 | calibração com certificado e painel de vencimento | `5e01413` · fix `bdd9848` · fix `40490bc` |
| 7 | tela de ferramentas (galho paralelo, worktree própria) | `96d0879` · fix `0d26c9a` |
| 4 | bloqueio, manutenção e reencontro com claim por transição | `b383b37` · fix `99e5dc7` |
| 5 | avaria e perda com foto — ocorrência fecha empréstimo aberto | `0f89434` · fix `d2adfe6` |
| 6 | empréstimos vencidos — filtro e função pura de lembrete | `f5004df` |
| — | correções declaradas no design durante a execução | `555779d` |
| — | merge do galho paralelo do front | `daffb81` |
| 8 | teste-jornada — calibra, empresta, avaria, conserta, devolve | `d5d949d` |
| — | revisão final de branch: 4 Important (F1–F4, ver spec 16) | fix `60a452e`/`4278d27`/`86090f0`/`b8e6f60` |
| 9 | documentação e verificação final | commits de fechamento |

### Etapa 10 — ✅ ENTREGUE em 2026-08-22 → `17-inventario-contagem`

**Etapa 10 = feature 17, parcial (`d644827..8db2671`)** — o risco crítico registrado desde a
Etapa 7 (ajuste de inventário gravando saldo por fora do motor, sem validação) está resolvido:
tipo dedicado `AJUSTE_INVENTARIO` passa por `stockService.registrarMovimentacao`, com guarda de
retenção nova (função pura, uma fonte, chamada pelo motor e pela pré-validação da rota) que
decide recusar um ajuste que deixaria material bloqueado/reservado/em inspeção/em terceiro com
número negativo — a pendência dos itens B1/B2/B3 do doc de novidades. Contagem cega opcional por
conferência, tolerância configurável com recontagem obrigatória, aplicação tudo-ou-nada. Detalhes,
decisões (D1–D11) e correções declaradas: [spec 17](17-inventario-contagem/README.md), o
[design da etapa](../../docs/superpowers/specs/2026-08-22-almoxarifado-etapa10-inventario-avancado-design.md)
e o [plano](../../docs/superpowers/plans/2026-08-22-almoxarifado-etapa10-inventario-avancado.md)
(com a retro de fechamento no final).

| Task | O quê | Hash |
|---|---|---|
| 1 | motor — tipo AJUSTE_INVENTARIO e guarda de retenção (RN-06) | `4e0fabb` |
| 2 | rota da conferência — contagem cega, tolerância, ajuste tudo-ou-nada via motor | `a30c87e` · fix `d6ea764` |
| — | design e plano (Fase 2: 10 achados acatados, 0 ruído) | `0eced13` |
| 3 | tela de conferência (galho paralelo, worktree própria) | `4f7ed6f` · fix `58f8eb4` |
| — | merge do galho paralelo do front | `314666b` |
| 4 | teste-jornada de integração (14 passos) | `2a8b529` |
| — | revisão final de branch: 1 Critical + 4 Important | fix `38a7afb`/`d3fc0ab`/`8db2671` |
| 5 | documentação e verificação final | commits de fechamento |

**Fora do escopo, declarado — fica para a Etapa 10b:** tipos de contagem avançados (por endereço,
família, cíclica automática por ABC/criticidade, item crítico, surpresa), dupla contagem por duas
pessoas diferentes, congelamento de movimentação durante a contagem, fluxo formal de dupla
aprovação (existe dupla permissão, não duas assinaturas), relatório de acuracidade formal,
e-mail do resultado.

### Etapa 10b — ✅ ENTREGUE em 2026-08-23 → `17-inventario-contagem`

**Etapa 10b = feature 17, segunda rodada (`14f4458..7290481`)** — escopos de contagem
combináveis, dupla contagem por duas pessoas, relatório de acuracidade, RN-08 e o epsilon de
divergência como fonte única. Motor de estoque não tocado. Detalhes, decisões (D1–D12 +
emendas das revisões) e correções declaradas:
[spec 17](17-inventario-contagem/README.md), o
[design da etapa](../../docs/superpowers/specs/2026-08-23-almoxarifado-etapa10b-inventario-avancado-2-design.md)
e o [plano](../../docs/superpowers/plans/2026-08-23-almoxarifado-etapa10b-inventario-avancado-2.md)
(com o registro da revisão final na seção Task 5.5 e a retro no final).

| Task | O quê | Hash |
|---|---|---|
| — | design e plano (Fase 2: 12 achados acatados, 0 ruído) | `14f4458` · `7f78876` · `9f13ad8` |
| 1 | escopo combinável no POST /conferencias (RN-01/02) | `c1ee37b` · fix `7e66d02` |
| 2 | dupla contagem + autoria por item (RN-03/04, RN-08) | `80a7fea` · fix `b16561a` |
| 3 | impacto persistido + relatório de acuracidade (RN-05/06/07) | `78cdbcd` · fix `957d148` |
| 4 | tela (galho paralelo, worktree própria) | `b8490cc` · fix `cfe44bf` · merge `a95db02` |
| 5 | teste-jornada de composição | `f4f2301` |
| — | revisão final de branch: 1 Critical + 8 Important + 11 Minor, 0 ruído | fix `7290481` |
| 6 | documentação e verificação final | commits de fechamento |

**Fora, declarado (sem etapa marcada):** contagem por endereço, cíclica automática,
congelamento, dupla aprovação formal (aguarda B11), e-mail, conciliação lado a lado.

### Etapa 11 — ✅ ENTREGUE em 2026-08-24 → `18-reposicao-estoque-minimo`

**Etapa 11 = feature 18 (`54e1278..1ea6ab2`)** — sugestão de reposição calculada e
consolidada, geração de solicitações, estoque parado e a tela para quem decide compra.
Detalhes, decisões e correções declaradas: [spec 18](18-reposicao-estoque-minimo/README.md),
o [design](../../docs/superpowers/specs/2026-08-23-almoxarifado-etapa11-reposicao-compras-design.md)
e o [plano](../../docs/superpowers/plans/2026-08-23-almoxarifado-etapa11-reposicao-compras.md).

| Task | O quê | Hash |
|---|---|---|
| — | design e plano (Fase 2: 15 achados acatados, 1 ruído) | `54e1278` · `5564d4d` · `b2a5a46` |
| 1 | motor de sugestão + GET /sugestoes (RN-01..06, 08) | `7f04e42` · fix `cd83b1e` |
| 2 | gerar solicitações + estoque parado (RN-07, 09) | `21dde5e` · fix `eec45b8` |
| 3 | tela 3 abas + configs (galho paralelo, worktree) | `a65e501` · fix `8a7208c` · merge `5b861ec` |
| 4 | teste-jornada de composição (10 passos) | `4574963` |
| — | revisão final de branch (2 revisores): 1 Critical + 7 Important, 0 ruído | fixes `95fb25b` (backend) · `1ea6ab2` (front) |
| 5 | documentação e verificação final | commits de fechamento |

### Etapa 12 — Notificações completas → `19-emails-notificacoes` + `20-alertas` — ✅ ENTREGUE (2026-08-24, `c1613c2..d7fee6c`)
Fila com retry/dedupe/histórico; e-mail de movimentação por classes (default OFF); 3 dívidas pagas; 3 alertas novos; painel gateado. Restos da 20 (motor único, central no front, ~16 alertas) ficam com as features donas.

### Etapa 13 — Relatórios e indicadores → `21-relatorios-dashboards` — ✅ ENTREGUE (2026-08-24, `4fdda54..8bb5e52`)
Registro único com gate por chave; tela dirigida pelo registro; export XLSX; indicadores; cartões no dashboard. Restos declarados (PDF, previsto×realizado) com as features donas.

### Etapa 14 — Integrações → `22-integracoes` — ✅ ENTREGUE (2026-08-25, `b276dca..2de7944`)
A Fase 0 mediu a maturidade antes de prometer: Compras maduro (integrado de verdade — ciclo da solicitação fecha no recebimento, cancelar com justificativa, contexto do comprador) + custo por projeto pelo livro com herança de projeto na devolução. BOM/OP/centro-de-custo BLOQUEADOS por dependência, com a medição escrita na spec 22 — não são promessa.

### Etapa 15 — ✅ ENTREGUE em 2026-08-28 → `24-mobilidade` (`7f74b6c..a82ad43`)
A Fase 4 da spec original dizia "código de barras, coletores, app móvel, assinatura digital" — a Fase 0 da etapa **mediu** e entregou a fatia real: scanner de QR pela câmera (fecha o ciclo das etiquetas 6c), assinatura do recebedor na entrega de requisição e o balcão usável no celular. O que ficou fora está declarado com o porquê na spec 24 e nas letras B25-B27/D das novidades. Próxima frente: pelo mapa de status (não há mais roteiro de etapas — ver o cabeçalho).

## Critérios de aceite do módulo (spec seção 34)

O módulo só é considerado operacional quando TODOS estes itens forem verdade (feature responsável entre parênteses):

- [ ] Identificar onde está cada material (02, 03)
- [ ] Identificar quantidade física, reservada, bloqueada e disponível (03, 07, 09)
- [ ] Identificar quem movimentou, quando e para qual projeto/OS (03, 23) — nota Etapa 3 (2026-08-05): entrega/estorno de requisição via motor já grava `projeto_id`, `centro_custo_id` e `requisicao_id` na movimentação (verificado em `requisicaoEntregaMotor.api.test.js`); OS continua só como texto livre (`os_referencia` na requisição, sem `os_id` estruturado) — critério ainda não 100% atendido
- [x] **Rastrear lote e número de série (10) — atendido por completo (2026-08-11).** **Lote:** a Etapa 6 entregou a entidade real, o vínculo do saldo e do ledger por `lote_id`, validade/corrida/certificado/status, guardas de saída e FEFO. **Série:** a Etapa 6b entregou `series_almoxarifado` + `seriesService`, motor integrado, rotas HTTP e UI completa (Movimentações, Recebimentos, aba Séries) — `controle_serie` deixou de ser flag morta. **Etiqueta física com QR:** a Etapa 6c fechou o ciclo — cada lote/série pode ser impresso em PDF (A4 ou térmica) com um QR que abre a tela do item já filtrada, ligando o objeto físico no galpão de volta ao registro do sistema. As três pernas do critério — lote, série e a etiqueta que os torna rastreáveis fora da tela — estão entregues. Falta ainda a consulta agregada "tudo que aconteceu com este lote/série" (os dados existem em três tabelas, sem um extrato que os junte) — pendência registrada na spec 10, não bloqueia este critério
- [x] **Separar materiais próprios dos de clientes (13) — atendido (Etapa 8, 2026-08-12).** O
  material de cliente tem dono na própria linha do catálogo (`proprietario_cliente_id`), fica
  **fora** de toda leitura de estoque próprio (dashboard, valor total, reposição de mínimo,
  sugestão de compra, relatório de posição — 40 leituras auditadas e classificadas), **aparece de
  propósito** onde misturar é o correto (ocupação de prateleira, materiais bloqueados, materiais
  sem endereço, e as telas operacionais, sempre com o **selo nomeando o cliente**), só sai com
  OS/projeto do próprio dono, e tem posição consolidada por cliente com PDF. **Ressalva
  registrada:** a conferência de inventário ainda ajusta `quantidade_atual` fora do motor, logo
  fora da permissão dedicada — ver a spec 13
- [x] **Controlar materiais enviados a terceiros (14) — atendido (Etapas 8b + 8c, 2026-08-12/13).**
  O material que sai para beneficiamento externo sai do **disponível** sem sair do **patrimônio**
  (`quantidade_em_terceiros`), tem remessa com máquina de estados, documento, prazo, retorno parcial
  com teto por item e encerramento com destino obrigatório (8b); e quando o que volta **não é o
  mesmo material** — corte, dobra, usinagem — a chapa é baixada e as peças entram no mesmo evento,
  com o custo rateado (8c). **Ressalvas registradas, nenhuma bloqueia o critério:** "uma remessa não
  mistura donos" foi **deduzida** e ainda espera resposta do cliente; e-mail (19) e alerta de atraso
  (20) estão declarados fora do escopo — ver a spec 14
- [ ] Registrar entradas/saídas sem permitir exclusão do histórico (03, 23)
- [ ] E-mail automático de todas as entradas e saídas (19)
- [ ] Inventários e ajustes aprovados (17, 06)
- [ ] Histórico completo de qualquer material (03, 21)
- [~] **Custo e consumo por projeto (22) — parcialmente atendido (Etapa 14, 2026-08-25).**
  O relatório `custo-por-projeto` entrega consumido/devolvido/líquido por projeto computado do
  livro, com a devolução herdando o projeto da saída. **Ressalva que impede o [x] pleno:** o
  custo aplicado é o **atual** do material, retroativo (o livro não guarda custo por
  movimento) — custo histórico exato por movimento exigiria coluna nova no livro, decisão
  registrada na spec 22
- [~] **Bloquear materiais reprovados ou indisponíveis (09, 10) — parcialmente atendido.** Por **material**: sim, desde a Etapa 5 (bloqueio/quarentena/decisão de inspeção). Por **lote**: o status `REPROVADO`/`BLOQUEADO` existe e o motor recusa a saída (Etapa 6), mas `inspectionService.decidirInspecao` ainda bloqueia o material inteiro e não marca o lote — ligar os dois é mudança na feature 09
- [ ] Relatórios gerenciais e de auditoria (21, 23)

## Débitos técnicos críticos (levantados em 2026-08-02 — estado revisado em 2026-08-11)

Esta lista era o retrato de 2026-08-02. A auditoria de 2026-08-11 confirmou que a maioria foi
resolvida pela Etapa 0 e seguintes — manter a lista sem estado fazia parecer que tudo seguia aberto.

1. ✅ **Duas rotas de movimentação** — resolvido (Etapa 0/1): a v1 delega ao motor
   (`stockService.registrarMovimentacao`) com auditoria; o front usa a v2 nas movimentações.
2. 🟡 **DDL duplicado** — `CREATE TABLE` vive só em `schema.js` (com teste guardião), mas restam
   **21 `ALTER TABLE` com erro engolido** em `routes/almoxarifado.js` (achado 2026-08-11, pendência
   nomeada na spec 00).
3. ✅ **Sem testes de API reais** — resolvido (Etapa 0): harness `tests/helpers/testApp.js` +
   supertest; 48 arquivos em `tests/api/` em 2026-08-11.
4. ✅ **`safeAlter` engole qualquer erro** — resolvido (Etapa 0): só engole `duplicate column name`,
   o resto propaga.
5. ✅ **SMTP hardcoded** — decisão do dev dono do projeto (2026-08-05): fica como está. Não mexer
   sem confirmação.
6. ✅ **Permissão inconsistente** (`role !== 'admin'` cru) — resolvido: `canConfigureAlmox`.
7. ✅ **`express-validator` não usado** — resolvido (2026-08-03): removido; padrão é **Zod** via
   `validate(schema)`; rotas novas nascem validadas, antigas migram quando tocadas.

## Convenções de atualização

- Marcou um item feito → confirme que existe **teste passando** antes de marcar `[x]` em "Regras essenciais".
- Mudou o status geral de uma feature → atualizar também a tabela deste README.
- Descobriu requisito novo → adicionar no README da feature (nunca só na cabeça ou no chat).
- Toda sessão de trabalho começa lendo este README + o README da feature alvo.
