# Módulo Almoxarifado — Planejamento Mestre

> **Spec original:** [2026-08-02-requisitos-modulo-almoxarifado.md](2026-08-02-requisitos-modulo-almoxarifado.md) (34 seções)
> **Última atualização:** 2026-08-13 (**Etapa 8c fechada — transformação no terceiro,
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

## Mapa de features e status atual (2026-08-13)

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
| 15 | [Retalhos, sobras e sucatas](15-retalhos-sucatas/README.md) | 🟡 | ❌ | 🟡 | 🟡 sem UI |
| 16 | [Ferramentas e calibração](16-ferramentas-calibracao/README.md) | 🟡 | ❌ | 🟡 | 🟡 sem calibração |
| 17 | [Inventário e contagem cíclica](17-inventario-contagem/README.md) | 🟡 | 🟡 | ❌ | 🟡 só inventário simples |
| 18 | [Reposição e estoque mínimo](18-reposicao-estoque-minimo/README.md) | 🟡 | 🟡 | 🟡 | 🟡 alertas ok |
| 19 | [E-mails e notificações](19-emails-notificacoes/README.md) | 🟡 | 🟡 | 🟡 | 🟡 sem fila/cobertura total |
| 20 | [Alertas operacionais](20-alertas/README.md) | 🟡 | ❌ | 🟡 | 🟡 2 de ~20 |
| 21 | [Relatórios e dashboards](21-relatorios-dashboards/README.md) | 🟡 | 🟡 | ❌ | 🟡 16 no back (entrou `materiais-sem-endereco` na Etapa 2), 2 no front |
| 22 | [Integrações](22-integracoes/README.md) | ❌ | ❌ | ❌ | ❌ módulos vizinhos vazios |
| 23 | [Perfis, segurança e auditoria](23-perfis-seguranca-auditoria/README.md) | 🟡 | 🟡 | 🟡 | 🟡 Correção 2026-08-11: a spec dizia "auditoria com 0 linhas em produção" — **superado desde as Etapas 3-6** (materiais, requisições, motor, reservas, lotes, recebimento e inspeção auditam, todos com tela). Buracos reais restantes: conferência de inventário e sobras (`scrapService`) não auditam |

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

### Etapa 9 — Retalhos e ferramentas → `15-retalhos-sucatas` + `16-ferramentas-calibracao`
UI de sobras; baixa dimensional; calibração com vencimento.

### Etapa 10 — Inventário avançado → `17-inventario-contagem`
Contagem cega, recontagem, tolerância, aprovação de ajuste, acuracidade.

### Etapa 11 — Reposição e compras → `18-reposicao-estoque-minimo`
Ponto de reposição calculado; sugestão de compra consolidada.

### Etapa 12 — Notificações completas → `19-emails-notificacoes` + `20-alertas`
E-mail em toda entrada/saída confirmada; fila com retry/dedupe/histórico; alertas restantes.

### Etapa 13 — Relatórios e indicadores → `21-relatorios-dashboards`
Tela de relatórios; indicadores gerenciais.

### Etapa 14 — Integrações → `22-integracoes`
Engenharia (BOM), Produção (OP), Compras, Projetos/custos — depende da maturidade dos outros módulos.

### Etapa 15 — Mobilidade (spec Fase 4)
Código de barras, coletores, app móvel, assinatura digital — planejar quando as etapas 1–7 estiverem estáveis.

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
- [ ] Custo e consumo por projeto (22)
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
