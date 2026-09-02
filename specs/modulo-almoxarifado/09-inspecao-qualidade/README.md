# 09 — Inspeção e Qualidade

> **Status:** 🟡 — quarentena e decisão de inspeção reais desde a Etapa 5; **o perfil QUALIDADE
> existe desde a Etapa 24** (`a81e51a`) e alcança as quatro rotas de `inspecionar`, com a ressalva
> de que bloqueio/desbloqueio **avulso** usa `ajustar_estoque` e ficou fora de propósito (**B56**);
> **o plano de inspeção com medidas existe desde a Etapa 27** (`063f3ce..cdb64a6`) — plano por
> material, régua da tolerância, medidas gravadas com instrumento e `divergencia_dimensional`
> **derivada** — e **desde a Etapa 29 tem TELA** (`d0a9f7c..75f183f`): o formulário de decisão
> ganhou os campos de medida com a faixa e o instrumento, a caixa *Divergência dimensional* virou
> somente leitura quando há medidas, e nasceu a aba **Histórico** com as inspeções decididas e suas
> medidas congeladas.
> **A frase "mas SEM TELA: o formulário de decisão continua com a caixa manual, e as medidas
> nascem sem leitor", que este cabeçalho trouxe entre 2026-08-29 e 2026-08-30, DEIXOU DE VALER** —
> ficava certa quando escrita e está corrigida aqui em vez de apagada em silêncio.
> **E desde a Etapa 32 (`e708125..fd71958`) a inspeção tem ANEXOS** — certificado, relatório
> dimensional e fotos ficam presos à inspeção, na linha expandida da aba Histórico, com **download
> autenticado** (o arquivo não é público, ao contrário de tudo que o módulo guardava até aqui) e
> **cada download registrado na trilha**. A tabela `anexos_documento_almoxarifado` existia órfã
> desde a Etapa 0 e era esperada por seis features ao mesmo tempo; esta etapa lhe deu dono.
> **Faltam para 🟢 (agora TRÊS, todos fluxo de negócio):** não conformidade formal numerada,
> liberação sob desvio autorizado e encaminhamento com status. *Este cabeçalho listava também
> "cadastro do plano pela tela" (pago na Etapa 30) e "anexos" (pago na 32) — os dois saíram.* ·
> **Spec original:** seção 9
> **Última atualização:** 2026-09-02 (**Etapa 32 — anexos**; antes: 2026-08-31 (**Etapa 30, `af7adea..7982f18`: o cadastro do plano ganha
> tela** — o item 5 de "O que falta para 🟢", criado no fechamento da 29, está **pago**. Com ele
> **não falta mais tela nenhuma** no ciclo dimensional: cadastrar plano, medir na inspeção e reler
> as medidas são todos cliques. A feature **continua 🟡**, e os quatro itens restantes são **fluxo
> de negócio**, não UI. Nenhuma linha de backend mudou nesta etapa.)
> Antes: 2026-08-30 (**Etapa 29, `d0a9f7c..75f183f`: os DOIS itens desmarcados do
> checklist de frontend saem** — form de inspeção com plano/medidas e a tela de leitura das
> medidas. A feature **continua 🟡** porque os cinco itens de "O que falta para 🟢" viraram
> **quatro**, não zero. Os furos **C34** e **C35** das novidades estão **fechados**; a **B60** foi
> cumprida em 2 de 3 partes, com a terceira **descartada** e justificada.)
> Antes: 2026-08-29 (**Etapa 27, `063f3ce..cdb64a6`: os DOIS PRIMEIROS itens do
> checklist de backend saem** — planos de inspeção e registro de medidas + instrumento. A feature
> **continua 🟡**, e o que falta para 🟢 está nomeado abaixo em "O que falta para 🟢". A correção
> da Fase 0 sobre a feature 16 — que esta spec dizia não existir — **fica onde está, à vista**.)
> Antes: 2026-08-29 (**Etapa 24, `a81e51a`: o perfil QUALIDADE — pendência que
> esta spec nomeava desde a Etapa 5 — foi criado**, com `visualizar` e `inspecionar` e mais nada;
> as quatro rotas de `inspecionar` medidas com um usuário QUALIDADE real no harness. A ressalva de
> bloqueio avulso, que esta spec já nomeava em 2026-08-11, **continua valendo e agora tem
> consequência visível na tela** — está escrita no item do checklist). Antes: 2026-08-11
> (**auditoria spec×código: nenhuma divergência encontrada**;
> adicionada à tabela de testes a regressão de devolução para quarentena, que existia e não estava
> listada. Antes: 2026-08-09, Etapa 6 — registra a pendência nova "reprovar por lote não
> está ligado à inspeção" e corrige a linha da tabela que dizia que a feature 10 não existia)

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
- **Etapa 27 — `planos_inspecao_almoxarifado`** (`schema.js`): `material_id` (FK), `caracteristica`, `unidade`, `valor_nominal`, `desvio_inferior`/`desvio_superior` (**REAL COM SINAL**, default 0), `ativo`, `created_at`, mais `CREATE UNIQUE INDEX ... ON (material_id, caracteristica) WHERE ativo = 1` (**parcial**, porque o delete é soft). Nasce com o índice, então não houve `try/catch` na criação — ao contrário da Etapa 26, aqui não existe base legada com plano duplicado.
- **Etapa 27 — `medidas_inspecao_almoxarifado`** (`schema.js`): `inspecao_id` (FK), `plano_id` **NOT NULL** (o plano nunca é apagado — o delete é soft), `caracteristica`, `unidade`, `valor_nominal`, `desvio_inferior`, `desvio_superior` (**os cinco CONGELADOS no ato**, RN-05), `valor_medido` NOT NULL, `conforme` NOT NULL, `ferramenta_id` **nullable**, `ferramenta_nome` (também congelado), `created_at`.
- **Etapa 27 — `services/almoxarifado/toleranciaInspecao.js`** (**novo**): função **pura**, sem banco. `avaliarMedida({ nominal, desvioInf, desvioSup, medido }) -> { conforme, desvio, motivo }` com `inf = nominal + desvioInf`, `sup = nominal + desvioSup`, comparação **inclusiva com epsilon `1e-6`**, `desvio = medido - nominal` (**com sinal**), e os motivos `NAO_NUMERICO` (que o chamador transforma em 400, nunca em reprovação) e `FAIXA_INVALIDA`. Exporta também `paraNumeroFinito`, reusada pelo CRUD e pelo serviço de inspeção. 18 asserções em `toleranciaInspecao.api.test.js`.
- **Etapa 27 — `decidirInspecao` aceita `medidas`** (`inspectionService.js`): `resolverMedidas` resolve o plano, avalia por `avaliarMedida`, checa `calibracaoVigente` e devolve as linhas prontas — **tudo isso ANTES da Fase 1 do claim de saldo**, de propósito (o comentário da guarda de fechamento promete que "o saldo não pode mudar quando isto recusa"). A gravação é um **único `INSERT` multi-linha**. O retorno ganhou `divergencia_dimensional` e `medidas_registradas` (aditivos), para que quem chamou saiba que a marcação manual foi ignorada.
- **Etapa 27 — ação de perfil `gerenciar_plano_inspecao`** (`permissions.js:113`): `[ADMINISTRADOR, QUALIDADE, ENGENHARIA]`. Aparece de graça em `GET /almoxarifado/minhas-permissoes` (que itera `Object.keys(ACAO_PERFIS)`).
- Tabela órfã `controle_qualidade` (`server/index.js`, `CREATE TABLE` perto da linha 19589): **verificado em 2026-08-08, continua órfã para escrita** — nenhum `INSERT`/`UPDATE` em todo o repositório grava nela. É lida (`SELECT`) só em cálculos de dashboard de produção/OEE (`server/index.js`, três consultas perto das linhas 22470/22557/22696), que referenciam `lote_id`/`os_id` — um domínio de qualidade de **produção**, não do almoxarifado — e por isso sempre retornam vazio (nada nunca insere ali). A Etapa 5 não tocou nessa tabela nem a reaproveitou: `inspecoes_recebimento_almoxarifado` é uma tabela diferente e é a que este README documenta. Ignorar continua sendo a recomendação — não há caminho de escrita para reaproveitar.

## Checklist

### Backend
- [x] Planos de inspeção (por material: o que medir, critérios) — **Etapa 27, Task 2 (`a15ac3b`)**: tabela `planos_inspecao_almoxarifado` (`schema.js`) e CRUD completo em `extended.js` (`GET|POST /planos-inspecao`, `PUT|DELETE /planos-inspecao/:id`), com **índice único parcial** `(material_id, caracteristica) WHERE ativo = 1` — a colisão é detectada **pelo banco**, como no molde de categorias, porque `SELECT`-antes-do-`INSERT` teria janela de corrida —, soft delete, `material_id` validado por existência (a FK **não** segura: o harness roda com `PRAGMA foreign_keys = 0` e produção com `1`) e rastro na auditoria com a entidade nova `plano_inspecao` (rótulo *"Plano de inspeção"* em `auditLabels.js`). Gate: a **ação própria** `gerenciar_plano_inspecao: [ADMINISTRADOR, QUALIDADE, ENGENHARIA]` — **não** `configurar`, que é `[ADMINISTRADOR]` sozinho e deixaria a QUALIDADE sem poder cadastrar o que ela mesma vai medir. 22 cenários em `planoInspecao.api.test.js`.
  > **A PARTE "FAMÍLIA" DO ITEM NÃO FOI ENTREGUE, e o `[x]` é do resto.** A spec original diz "por material/**família**"; o plano é **por material** apenas. Foi corte deliberado, pelo caminho reversível: herdar da família é fácil de acrescentar depois, e nascer só na família seria difícil de desfazer. Está na letra **B59** das novidades, com três opções e recomendação. **Se você lê este `[x]` esperando herança de família, ela não existe.**
- [x] Registro de medidas + instrumento de medição utilizado — **Etapa 27, Tasks 1 e 3 (`bae9350`, `964cf57`)**: tabela `medidas_inspecao_almoxarifado`, régua pura `toleranciaInspecao.avaliarMedida` (arquivo próprio, sem banco) e a gravação dentro de `inspectionService.decidirInspecao`, que passou a aceitar `medidas: [{ plano_id, valor_medido, ferramenta_id }]` — **opcional**: sem elas tudo segue exatamente como antes desta etapa. 21 cenários em `medidasInspecao.api.test.js` + 8 de integração ponta a ponta por HTTP em `inspecaoIntegracao.api.test.js` (`cdb64a6`). O instrumento entra por `calibracaoVigente` (`toolService.js:57`) — **é aqui que a integração com a feature 16 vira valor**, e é a integração que o `16-ferramentas-calibracao/README.md` já pedia dos dois lados.
  > **Cinco decisões deste item, todas declaradas:** **(1)** os desvios são **COM SINAL** (`desvio_inferior <= desvio_superior`), não magnitudes — só assim a **tolerância unilateral deslocada** (ISO 286, eixo `+0,005 / +0,021`) é representável, e trocar depois seria migração de dado congelado; **(2)** a régua é **inclusiva nos extremos com epsilon `1e-6`** (o mesmo de `inspectionService.js:78` e `InspecoesAlmoxarifado.js:126`) — sem ele, **12,3% das peças no limite exato reprovariam** por ponto flutuante (6.132 falsos em 50.000 pares varridos), e com a RN-03 cada um ligaria `divergencia_dimensional` sozinho; **(3)** `valor_medido` não numérico é **400**, nunca reprovação — **e a razão medida contradiz o design**: na forma de guardas de rejeição, `Number('12,4')` **APROVA** a característica, com `valor_medido` nulo e a divergência apagada, em vez de reprovar como o design afirmava; **(4)** o plano é **congelado no ato** (RN-05): a medida copia caracteristica/unidade/nominal/desvios/nome do instrumento, e editar o plano depois não reescreve inspeção antiga; **(5)** **`ferramenta_id` é OPCIONAL** — ver a correção da RN-04 abaixo.
  > **CORREÇÃO (Task 3): a regra "medida exige instrumento" ESTAVA IMPRECISA.** O que o código garante é *"instrumento **declarado** e vencido não mede"*, não *"toda medida tem instrumento"*: a coluna `medidas_inspecao_almoxarifado.ferramenta_id` é **nullable**, e exigir o campo em código contradiria o schema. Decidido seguir o schema porque é o caminho reversível (obrigar depois é uma linha; afrouxar depois exigiria migração de dado congelado). Letra **B61**. **Quem ler "exige instrumento" e escrever a tela contando com o campo sempre preenchido vai se enganar** — daí a correção estar aqui, e não só no plano da etapa.
  > **A suíte NÃO protege a forma da gravação, e isso é achado, não omissão.** As medidas entram num **único `INSERT` multi-linha** de propósito (defesa contra o ato parcial que a Etapa 23 consertou no `PUT /configuracoes`). Trocá-lo por um laço **não derruba nenhum teste** — medido: com a validação completa rodando **antes** do claim de saldo, nenhuma linha do payload consegue mais falhar no `INSERT` (todo `valor_medido` já é número finito, todo `conforme` já é 0/1, e não há `UNIQUE` na tabela), então o ato parcial ficou **inalcançável pela porta da frente**. A diferença foi provada com um `UNIQUE (inspecao_id, plano_id)` artificial: o laço deixa **1 medida órfã**, o multi-linha deixa **0**. **A forma segura ficou** — é barata e vale para o dia em que alguém acrescentar uma constraint ou uma coluna `NOT NULL` —, mas **quem mexer ali precisa saber que nenhum teste vai avisar**.
  > **CORREÇÃO (Fase 0 da Etapa 27, medida em 2026-08-29) — mantida à vista mesmo agora que os
  > dois itens estão `[x]`, porque foi ela que destravou a etapa: enquanto estavam `[ ]`, estas
  > duas linhas diziam que a feature 16 (calibração de instrumentos) "também não existe ainda", e
  > isso ESTAVA ERRADO desde 2026-08-22.** A feature 16 está **🟢** no mapa (`specs/modulo-almoxarifado/README.md:603`),
  > entregue pela Etapa 9b (`d644827..b8e6f60`): `ferramentas_almoxarifado.exige_calibracao`
  > (`schema.js:1572`, rotulada na tela como *"Exige calibração (instrumento de medição)"*),
  > `calibracoes_ferramenta_almoxarifado` (`schema.js:1537`), `toolService.calibracaoVigente` e
  > `painelCalibracoes`, `GET /ferramentas` (`extended.js:1083`) e
  > `GET /ferramentas/:id/calibracoes` (`:1166`), mais a tela `FerramentasAlmoxarifado.js`.
  > **O único bloqueio declarado desta feature caiu há uma semana e a spec continuou lendo como
  > bloqueada** — é a terceira vez seguida nesta base que uma spec afirma a ausência de algo que
  > existe (a 23 dizia que a tela de perfis não existia; a 01 teve a varredura de categorias
  > errada; agora esta). **A afirmação errada fica à vista, não apagada**, porque apagar em
  > silêncio faz o próximo confiar nela de novo.
  >
  > **O outro lado da ponte já estava certo:** `16-ferramentas-calibracao/README.md` lista
  > *"Integração com inspeção (instrumento calibrado referenciado na medição) — feature 09"* em
  > "O que ficou de fora" **e** em Dependências. As duas specs querem a mesma integração; só esta
  > aqui achava que a outra ponta não existia.
  >
  > **Armadilha de segunda porta, medida e descartada:** além de `controle_qualidade` (que esta
  > spec já manda ignorar, e continua certo), o núcleo do CRM tem `padroes_qualidade`
  > (`server/index.js`, com `codigo/nome/especificacoes/limites`) — que **tem a forma** de um plano
  > de inspeção. Medido pelo nome do contrato: **uma única ocorrência no repositório inteiro, o
  > próprio `CREATE`**; zero escritor, zero leitor, zero linhas. Não há reuso possível, e isto está
  > escrito aqui para ninguém "descobrir" a tabela no meio da etapa e achar que ela é aproveitável.
- [x] Resultado: aprovar / aprovar parcialmente / reprovar lote — com efeito no saldo (aprovado → disponível; reprovado → bloqueado) — **Etapa 5 (2026-08-08)**: `inspectionService.decidirInspecao` (`dc841f2`, corrigida para claim atômico em duas fases em `91184ca`, backfill e teste discriminante da fila em `436eed2`). Aprovação parcial testada: `quantidade_aprovada + quantidade_reprovada` tem de fechar exatamente com o retido, senão recusa antes de qualquer efeito no saldo.
- [x] Quarentena como estado real: entrada inspecionável nasce `em_inspecao`, aprovação move para disponível via movimentação — **Etapa 5**: motor (`c37b67e`) + entrada retida em vez de barrada (`4db5e11`) + decisão via `DECISAO_INSPECAO` (`91184ca`). **A spec estava descrevendo um objetivo que a implementação anterior não cumpria** — verificado em 2026-08-07 (design da etapa) que `darEntradaEstoque` na verdade **recusava** aprovar recebimento de item crítico sem inspeção prévia (o material nunca chegava a existir no sistema, mesmo já estando fisicamente no galpão); não era "quarentena que não funciona", era ausência total de quarentena na entrada. Está corrigido: item que exige inspeção agora entra sempre, retido.
- [x] Bloqueio de material fora de recebimento (achado em estoque) com motivo — **Etapa 5**: `inspectionService.bloquearMaterial`/`desbloquearMaterial` (`dc841f2`), rotas `POST /materiais/:id/bloquear|desbloquear` (`bbf7ed7`), botões na tela (`dcee909`). Motivo é `justificativa` obrigatória desde `c6a76a4`.
- [ ] Não conformidade formal (número, descrição, ação, responsável) vinculada à inspeção — **fora do escopo da Etapa 5** (decisão do design). O que existe é o **encaminhamento** (linha abaixo) registrado junto da reprovação — não é uma NC numerada com fluxo próprio.
- [ ] Liberação sob desvio autorizado (quem autorizou, justificativa, histórico imutável) — **fora do escopo da Etapa 5** (decisão do design).
- [x] Solicitar análise da Engenharia / devolução ao fornecedor / substituição (registrar o encaminhamento pretendido) — **Etapa 5** (`dc841f2`): o campo `encaminhamento` (`DEVOLVER` | `ANALISE_ENGENHARIA` | `SUBSTITUICAO`) é validado e gravado em `inspecoes_recebimento_almoxarifado` na reprovação.
- [ ] Encaminhamentos **com status** (acompanhar se a devolução/análise/substituição já foi executada) — **não implementado**. O `encaminhamento` de hoje é só a intenção registrada no momento da reprovação; não há campo de status nem nada que marque quando ela é cumprida. É **a pendência que esta etapa cria**, ver seção própria abaixo — a execução em si é a feature 12 (Devoluções), que ainda não existe.
- [x] Anexos: certificado, relatório dimensional, fotos (`anexos_documento_almoxarifado`) — **PAGO na Etapa 32** (`0bb9ab4` serviço e schema · `8a496e9` as quatro rotas · `59902a9` componente · `8847c7e` plug na aba Histórico · `dad6a84` integração · `2bad01b` e `fd71958` fix-rounds da revisão adversarial).
      **⚠️ E esta linha da spec induzia ao erro, o que custou 31 etapas:** ela citava
      `anexos_documento_almoxarifado` como se a tabela fosse a funcionalidade. A tabela **existia
      como DDL desde a Etapa 0 e era órfã total** — medido na Fase 0 da Etapa 32: a varredura do
      repositório inteiro achava **uma** ocorrência do nome em `server/`, o próprio `CREATE TABLE`,
      e mais dez em documentação. Zero `INSERT`, zero `SELECT`, zero rota, zero componente, sem
      índice e sem coluna de soft delete. **Seis specs (01, 04, 08, 09, 12, 14) a nomeavam como
      pendência, e cada uma supunha que outra a pagaria** — é literalmente por isso que o item
      nunca andou. "A tabela existe" não é o mesmo que "existe o módulo de anexos", e a redação
      antiga não deixava isso claro para ninguém.
      **O que a Etapa 32 entregou:** `services/almoxarifado/anexoService.js` com mapa **fechado**
      de seis entidades (`material`, `requisicao`, `recebimento`, `inspecao`, `devolucao`,
      `item_remessa`), existência do registro-pai verificada, soft delete e auditoria; as rotas
      `POST/GET/DELETE /almoxarifado/anexos` e **`GET /almoxarifado/anexos/:id/arquivo` com
      download autenticado**; duas ações de perfil novas (`anexar_documento`, `remover_anexo`); e o
      componente `AnexosDocumento.js`, plugado na **linha expandida da aba Histórico**.
      **O que NÃO entrou, e é corte declarado:** as outras cinco telas consumidoras — o componente
      é genérico e o backend já as aceita, mas só a inspeção tem botão.
      **E o arquivo do anexo NÃO é servido estaticamente** (RN-03): mora em diretório **irmão** de
      `uploads/almoxarifado`, porque `express.static(root)` serve subpastas — guardar em
      `uploads/almoxarifado/anexos/` os deixaria públicos, que é o furo **C42** herdado.
- [x] Perfil QUALIDADE nas ações de inspeção — **PAGO na Etapa 24 (`a81e51a`)**, com **uma ressalva
      declarada que vale ler antes de acreditar no `[x]`**.
      ~~Fora do escopo da Etapa 5 (decisão do design), confirmado inalterado em `permissions.js`:
      `inspecionar` continua `[ADMINISTRADOR, ALMOXARIFE]`.~~ **Isto valeu da Etapa 5 até a 24.**
      Hoje `inspecionar` é `[ADMINISTRADOR, ALMOXARIFE, QUALIDADE]`, e o perfil recebeu **só**
      `visualizar` e `inspecionar` — nada mais. As **quatro** rotas gateadas por `inspecionar`
      (decidir o item recebido, liberar vencimento de lote, mudar status de lote e mudar status
      de série) foram exercitadas com um usuário QUALIDADE real no harness, que roda o
      `requirePermission` de produção: as quatro passam o gate.
      **A RESSALVA — e é a mesma que esta linha já nomeava desde 2026-08-11.** O *detalhe novo*
      que estava escrito aqui continua verdadeiro e agora tem consequência: **bloqueio/desbloqueio
      avulso usa `ajustar_estoque` (`[ADMINISTRADOR, GESTOR]`), não `inspecionar`.** Portanto o
      perfil QUALIDADE **não** usa os botões *Bloquear Material* e *Desbloquear Material* da tela
      de Inspeções (`InspecoesAlmoxarifado.js:197` e `:202`), e `POST /materiais/:id/bloquear`
      responde **403** para ele. **Foi decisão declarada**, não esquecimento: mexer em saldo
      disponível não é ofício de qualidade, e abrir `ajustar_estoque` abriria junto o ajuste de
      inventário. Letra **B56** das novidades. **Por isso o item 131 da spec 23 — que pede
      "inspecionar, aprovar/reprovar, bloquear/liberar sob desvio" — continua desmarcado lá**,
      enquanto este aqui fica marcado: o que esta spec pedia era o perfil **nas ações de
      inspeção**, e isso está entregue. **Se um dia bloquear por desvio tiver de caber no perfil,
      o caminho limpo é uma ação PRÓPRIA** (`bloquear_qualidade`), não abrir `ajustar_estoque` —
      mesmo critério que o módulo já usou em `remessar_terceiro`, `ajustar_material_cliente` e
      `gerenciar_ferramentas`.

### Frontend
- [x] Fila de inspeções pendentes — **Etapa 5** (`dcee909`, `InspecoesAlmoxarifado.js`): lista o que está retido, de qual recebimento, há quantos dias.
- [x] Form de inspeção com plano/medidas/~~fotos~~ — **Etapa 29** (`75f1e24`, `InspecoesAlmoxarifado.js`): o formulário de decisão ganhou o bloco **Medidas do plano** — um campo por característica **ativa** do plano do material, com `caracteristica (unidade) — nominal N · faixa [inf ; sup]`, `input` de texto (nunca `number`: o valor vai ao servidor como **string crua**, porque converter faria `12,4` virar `12` em silêncio) e seletor de instrumento com o vencido **rotulado e desabilitado**. **Sem plano cadastrado, o formulário é idêntico ao de antes** e não faz chamada nenhuma a mais.
  > **A frase antiga — "depende dos itens em aberto acima (planos/medidas ligam com feature 16)" — DEIXOU DE VALER** já em 2026-08-29 (Etapa 27), e **a frase que a substituiu — "o que falta agora é só a tela" — deixou de valer em 2026-08-30**: a tela existe. **As FOTOS ficaram de fora e por isso o item não está inteiro** — dependem de `anexos_documento_almoxarifado`, que é item de outra spec; estão nomeadas em "O que falta para 🟢" abaixo. O furo **C34** das novidades está **fechado**.
  > **A B60 foi cumprida em 2 de 3 partes** (`75f1e24`): a caixa *Divergência dimensional* fica **desabilitada e desmarcada** com ≥1 medida preenchida, a flag manual **nem entra no envio**, e ao lado dela fica o texto *"Derivada das medidas ao salvar — fora da tolerância liga sozinha"*. **A terceira parte — "mostra o resultado derivado, atualizado enquanto se digita" — foi DESCARTADA de propósito**, e isto está aqui para ninguém a reabrir como esquecimento: pré-visualizar na tela exigiria uma **segunda cópia** da régua de tolerância, e a Etapa 27 mediu que a versão ingênua reprova **12,3%** das peças que caem no limite exato. Duas cópias divergem, e no dia em que divergirem a tela mente — que é o defeito que a B60 existe para evitar. O resultado vem do servidor, no aviso de sucesso (*"Inspeção registrada! Divergência dimensional: sim (2 medidas)"*), e a tela mostra a **faixa** ao lado do campo. Se um dia a pré-visualização for exigida, o caminho é um endpoint de avaliação sem gravação, usando a **mesma** função do servidor — nunca cálculo no client.
- [x] **Tela para LER as medidas de uma inspeção já decidida** — item criado pela Etapa 27 e pago pela **Etapa 29** (`96525d5` backend, `38e74f4` componente, `cf49729` abas): `GET /almoxarifado/inspecoes/historico` (decididas, ordem `data_inspecao DESC, id DESC`, filtro por material, com `medidas_total`/`medidas_nao_conformes`) e `GET /almoxarifado/inspecoes/:id/medidas` (as medidas com a tolerância **congelada no ato** — editar o plano depois **não** muda a resposta, provado por teste), consumidos pela aba **Histórico** da tela de Inspeções. A **terceira** ocorrência do padrão *calculado, gravado e sem quem leia* está fechada — furo **C35**.
  > **O que continua sem leitor não é a medida:** decidir inspeção ainda **não deixa linha na Auditoria** (furo **C36**, anterior a estas duas etapas e ainda aberto), e inspeção decidida **não pode ser reaberta nem corrigida** — a leitura é só leitura, e isso é limitação declarada, não pendência.
- [x] **Cadastro do plano de inspeção pela tela** — item **novo**, criado no fechamento da Etapa 29 e pago pela **Etapa 30** (`dedb208` o modal, `6b84107` a ação na lista, `41b576c` o cenário da colisão): `PlanoInspecaoModal.js` aberto pelo botão **Plano de inspeção** de cada linha de Materiais, com criar/editar/desativar/**reativar** característica, a faixa `[nominal+inf ; nominal+sup]` calculada ao lado enquanto se digita (via `faixaTolerancia.js`, **uma cópia só**), e a colisão de reativação barrada com mensagem própria. **Nenhuma linha de backend mudou** — o CRUD existia e estava testado desde a Etapa 27.
  > **Por que este item existe:** enquanto o plano só nascia por API, o bloco *Medidas do plano* que a Etapa 29 entregou **não aparecia para ninguém**. As duas etapas anteriores só se tornaram alcançáveis com esta.
  > **Uma dívida antiga que só ficou VISÍVEL aqui:** `gerenciar_plano_inspecao` nasceu na Etapa 27 sem rótulo em `client/src/utils/permissaoErro.js` e era inalcançável até esta etapa criar o único botão que a dispara — quem não podia lia *"Sem permissão para gerenciar plano inspecao"*, a chave crua. Mais três ações (`conferir_separacao`, `remessar_terceiro`, `ajustar_material_cliente`) tinham o mesmo buraco, e é a **quarta** ocorrência dele nesta base. Corrigido em `7982f18`, junto com a guarda que devia tê-lo pego: ela comparava texto (`not.toContain('_')`), e o **fallback também troca `_` por espaço**. Agora a lista vem de `ACAO_PERFIS` do servidor e a régua é a **presença** no mapa.
- [x] Gestão de bloqueios e quarentena (o mapa já mostra áreas — falta operação) — **Etapa 5** (`dcee909`): bloqueio/desbloqueio avulso de material agora tem botão e formulário na tela de Inspeções.

## O que falta para 🟢 (atualizado em 2026-08-31, no fechamento da Etapa 30)

> **A feature continua 🟡, e agora por um motivo qualitativamente diferente:** até a Etapa 29 o que
> faltava incluía **tela**; depois da Etapa 30, **não falta mais tela nenhuma** no ciclo
> dimensional — cadastrar plano, medir e reler as medidas são todos cliques. Os quatro itens
> abaixo são **fluxo de negócio próprio** (não conformidade formal, desvio autorizado, anexos,
> encaminhamento com status), cada um com máquina de estados ou dependência de outra spec.

**A feature NÃO muda de cor.** Ela continua **🟡**. A Etapa 27 pagou os dois primeiros itens do
checklist de backend e a Etapa 29 pagou os **dois de frontend** — o item 5 da lista anterior (*"a
TELA de medidas e a tela de leitura"*) **saiu**. Dos cinco, sobram **quatro**, e três deles são
fluxo inteiro. Sem esta lista escrita, a próxima leitura teria de refazer a conta — e nesta base
isso já produziu "o que falta para 🟢" errado quatro vezes seguidas na feature 23.

1. **Não conformidade formal** (número, descrição, ação, responsável) vinculada à inspeção — é uma
   máquina de estados própria; o que existe hoje é o `encaminhamento` registrado na reprovação.
2. **Liberação sob desvio autorizado** (quem autorizou, justificativa, histórico imutável) — idem.
3. ~~**Anexos** (certificado, relatório dimensional, fotos) — depende de
   `anexos_documento_almoxarifado`, que é item próprio de outra spec.~~ **PAGO na Etapa 32**
   (`e708125..fd71958`). Riscado em vez de apagado, para quem tiver lido a lista anterior
   confirmar o que saiu. **E a justificativa desta linha estava errada de duas formas:** a tabela
   não era "item próprio de outra spec" — era **órfã, sem dono em spec nenhuma**, esperada por
   seis features ao mesmo tempo; e ela dizia que os anexos impediam o item
   "form de inspeção com plano/medidas/fotos" de estar inteiro, o que era verdade, mas o item foi
   pago **na aba Histórico**, não no formulário de decisão — porque a linha de inspeção só passa a
   existir **depois** da decisão (`inspectionService.js:268`), e antes dela não há a que prender o
   anexo.
4. **Encaminhamento com status** (saber se a devolução/análise/substituição foi executada) — a
   execução em si é a feature 12.

~~**E um item NOVO, criado pela Etapa 29:** 5. **Cadastro do plano de inspeção PELA TELA.**~~
**PAGO na Etapa 30** (`af7adea..7982f18`) — ver o item marcado no checklist de frontend. Riscado
em vez de apagado, para quem tiver lido a lista anterior confirmar o que saiu. **Com ele, os
quatro itens que restam são fluxo de negócio, não tela.**

~~5. **A TELA de medidas** — e junto dela a **tela de leitura** das medidas já gravadas.~~
**PAGO na Etapa 29** (`d0a9f7c..75f183f`). Riscado em vez de apagado, para quem tiver lido a lista
anterior confirmar o que saiu.

**O que NÃO conta para a cor, porque é decisão de negócio declarada e não funcionalidade
faltante:** o plano por **família** (**B59**), a obrigatoriedade do instrumento (**B61**) e a
ressalva do bloqueio avulso fora do perfil QUALIDADE (**B56**).

**E dois itens antigos desta spec continuam abertos e não entraram na conta acima porque são
pendências, não checklist:** reprovar por **lote** não está ligado à inspeção (seção abaixo) e
material reprovado fica bloqueado sem vínculo ao recebimento de origem (seção abaixo).

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

## Pendência criada pela Etapa 6 (2026-08-09) — reprovar por LOTE não está ligado à inspeção

**A Etapa 6 entregou metade do caminho, e a metade que falta é justamente esta feature.** O lote
agora tem status `REPROVADO` (`lotService.mudarStatusLote`, `b7035dd`), a rota que o muda existe
(`PUT /api/almoxarifado/lotes/:id/status`, perm. `inspecionar`, justificativa obrigatória,
auditada — `8dfeb0c`) e o motor **recusa a saída de lote reprovado** (`65d78fd`).

Mas `inspectionService.decidirInspecao` **não sabe que lotes existem**: reprovar continua movendo
quantidade do material inteiro de `quantidade_em_inspecao` para `quantidade_bloqueada`, sem tocar
em `lotes_almoxarifado`. Consequência prática: reprovar 10 de um lote de 100 bloqueia 10 unidades
**do material**, não daquele lote — o lote específico continua `ATIVO` e sai normalmente, e é a
guarda genérica de material bloqueado que segura a conta. Um operador que reprovou o lote `X` e vê
o lote `X` ainda saindo pela tela de movimentação está vendo o comportamento correto do código e
errado do negócio.

**Não é regressão nem esquecimento:** o plano da Etapa 6 declarou isso explicitamente na
auto-revisão ("uma decisão do design não virou task de código de propósito"), porque ligar os dois
é mudança **nesta** feature (09) e não na 10 — mexe em `decidirInspecao`, no gate de permissão e no
registro de inspeção, e precisa decidir o que acontece quando a decisão é **parcial** (aprovar 90 e
reprovar 10 de um mesmo lote não tem representação hoje: status é do lote inteiro, e a Etapa 6
decidiu de propósito que retenção por lote é **status, não quantidade**).

O caminho natural: quando o item de recebimento tiver `lote_id`
(`recebimentos_material_itens_almoxarifado.lote_id`, escrito desde `64686b1` e **ainda sem
leitor**), a reprovação total daquele item chama `mudarStatusLote(..., 'REPROVADO', motivo)` junto
do efeito de saldo. A reprovação parcial fica em aberto até alguém decidir se vira split de lote.

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
- **Movimento de inspeção não é estornável pelo livro** (decidido no review final da etapa). Antes,
  `cancelarMovimentacao` não tinha ramo de reversão para `QUARENTENA`, `LIBERACAO_INSPECAO`,
  `REPROVACAO_INSPECAO` nem `DECISAO_INSPECAO`: estornar gravava a linha `ESTORNO` e marcava a
  original cancelada **sem desfazer** `quantidade_em_inspecao`/`quantidade_bloqueada` — o livro
  afirmava uma reversão que não acontecera. A correção **recusa com 400** em vez de implementar a
  reversão, porque o retido pertence ao ITEM do recebimento
  (`recebimentos_material_itens_almoxarifado.quantidade_em_inspecao`), que `stockService` não
  conhece: devolver só o pool do material recriaria o descasamento item × material que a Task 4
  fechou. `podeEstornar` (`MovimentacoesAlmoxarifado.js`) espelha a lista, para a tela não oferecer
  um botão que só devolveria 400.
- **Rever uma inspeção já concluída não tem caminho no produto** (achado do re-review final,
  2026-08-08). A tela de Inspeções carrega apenas `GET /inspecoes/pendentes`, então o item decidido
  some dela — e o livro recusa o estorno (item acima). O **saldo** continua recuperável por
  `BLOQUEIO`/`DESBLOQUEIO` avulso, ambos com gate `ajustar_estoque` e rastro no livro; o que fica
  imutável é o **registro** da inspeção em `inspecoes_recebimento_almoxarifado`. É feature
  faltante, não inconsistência de saldo: uma correção de erro de inspeção hoje aparece como ajuste
  avulso, sem vínculo com a decisão que a originou.
  **ADENDO (Etapa 27, 2026-08-29):** esta limitação ganhou peso. A partir de agora a inspeção pode
  guardar **medidas dimensionais completas** (valor medido, tolerância do ato, veredito,
  instrumento) — e, como não há caminho para reabrir uma inspeção concluída, **não há caminho para
  ler as medidas** também. Elas nascem sem leitor. Foi **declarado antes de construir**, não
  descoberto depois: está no design da etapa, na letra **C35** das novidades e como item próprio no
  checklist de frontend acima.
- **Retenção não pode nascer da rota genérica de movimentação.** `POST /movimentacoes/v2` tem gate
  `movimentar` (o mais amplo do módulo) e aceitava qualquer tipo do motor, o que tornava decorativo
  o gate das rotas específicas — um `ALMOXARIFE` que toma 403 em `POST /materiais/:id/bloquear`
  (`ajustar_estoque`) conseguia o mesmo efeito com `{tipo:'BLOQUEIO'}` na v2, e `{tipo:'LIBERACAO_INSPECAO'}`
  soltava quarentena sem `inspecionar`, sem registro de inspeção e sem baixar o retido do item (que
  ficava indecidível). A rota agora valida contra `TIPOS_MOVIMENTO_ROTA` (`schemas.js`) =
  `TIPOS_MOVIMENTO` − `ESTORNO` − `TIPOS_RETENCAO` (`schema.js`). É whitelist **da rota**: os
  serviços internos continuam criando os tipos de retenção pelo motor, que é onde mora o gate certo.
- **`LIBERACAO_INSPECAO` e `REPROVACAO_INSPECAO` ficaram sem chamador de produção.** A decisão é um
  único `DECISAO_INSPECAO` atômico, e a rota v2 não os aceita mais. Os ramos e seus testes
  (`quarentenaMotor.api.test.js`) foram mantidos de propósito: são o contrato do motor (guarda no
  `WHERE` em vez de `MAX(0,...)`, retenção nunca toca o físico) que o `DECISAO_INSPECAO` herda.

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
| Devolução para quarentena continua bloqueando (a retenção vale também para a entrada vinda de devolução) | `devolucao para quarentena continua bloqueando (regressao returnService)` — `bloqueioGuardas.api.test.js` |
| Decisão concorrente para o mesmo item não duplica saldo nem libera material reprovado | `decisao parcial concorrente nao duplica saldo nem libera material reprovado` — `inspecaoDecisao.api.test.js` (`91184ca`) |
| Rotas exigem a permissão correta (`inspecionar` / `ajustar_estoque`) e 403 não altera saldo | `POST inspecionar sem permissao retorna 403...`, `POST bloquear sem permissao retorna 403...`, `POST desbloquear sem permissao retorna 403...` — `server/tests/api/inspecaoRotas.api.test.js` |
| A rota genérica de movimentação não pode criar retenção (o gate das rotas específicas não é decorativo) | `v2 recusa os tipos de retencao (so nascem dos servicos com o gate certo)` + `v2 continua aceitando os tipos operacionais do formulario` — `server/tests/api/movimentacoes.api.test.js` |
| Movimento de inspeção não é estornável pelo livro, e a recusa não deixa o movimento preso como cancelado | `estorno de QUARENTENA e recusado...`, `estorno de DECISAO_INSPECAO e recusado...` — `server/tests/api/estorno.api.test.js`; na tela, `MovimentacoesAlmoxarifado.test.js` |
| Estorno de `BLOQUEIO` já desfeito recusa em vez de saturar (não cria bloqueado sem lastro) | `estorno de BLOQUEIO ja desfeito recusa em vez de saturar (bloqueio fantasma)` — `server/tests/api/estorno.api.test.js` |
| `AJUSTE` por localização (e seu estorno) não zera a retenção do material | `AJUSTE por localizacao nao evapora a quarentena do material` + `estorno de AJUSTE por localizacao nao evapora a reserva do material` — `server/tests/api/ajusteLocalizacao.api.test.js` |
| Quantidade não numérica é recusada com 400 (NaN não pode contornar a guarda de fechamento) | `POST inspecionar com quantidade nao numerica retorna 400...` + `POST bloquear/desbloquear com quantidade nao numerica retorna 400` — `server/tests/api/inspecaoRotas.api.test.js` |
| Lote reprovado não sai para consumo | ✅ **no motor**: `saida de lote reprovado falha` + `saida de lote bloqueado falha, e liberar o lote destrava` — `server/tests/api/loteGuardasSaida.api.test.js` (Etapa 6, `65d78fd`). **Correção de 2026-08-09:** esta linha dizia *"não implementado — depende do controle de lote/série (feature 10), que ainda não existe"*. A feature 10 (lotes) **existe** desde a Etapa 6 e o motor recusa a saída. O que continua faltando é a **inspeção marcar o lote** — ver a pendência abaixo |
| Medida fora da tolerância liga `divergencia_dimensional` **sozinha**, sem o payload marcar; todas dentro **zeram** a flag mesmo com o payload mandando 1 | `(1) RN-03 medida FORA da tolerancia liga divergencia_dimensional SEM o payload marcar` + `(2) RN-03 todas DENTRO zeram a flag mesmo com o payload mandando 1` — `server/tests/api/medidasInspecao.api.test.js` (Etapa 27, `964cf57`) |
| Peça no limite **exato** da tolerância é conforme (epsilon `1e-6`; sem ele 12,3% reprovariam) | `limite inferior exato e conforme` / `limite superior exato e conforme` — `toleranciaInspecao.api.test.js` (`bae9350`), e `(4) RN-02 a medida no limite EXATO da tolerancia e conforme` — `medidasInspecao.api.test.js` |
| Instrumento que exige calibração e não tem vigente **não mede** (400 com a literal do vizinho); vigente aceita; inexistente/inativo é **404**, não 500 | `(5)`, `(6)`, `(7)`, `(8)` — `medidasInspecao.api.test.js` |
| Editar o plano depois **não** reescreve inspeção antiga (valores congelados no ato) | `(11) RN-05 ...` — `medidasInspecao.api.test.js`; e `(4)`/`(5)` de `inspecaoIntegracao.api.test.js` (`cdb64a6`), pela rota |
| `valor_medido` não numérico (`'12,4'`) é **400** e **nada** é gravado — nunca reprovação com `NULL` | `(16)` — `medidasInspecao.api.test.js`; e `valor nao numerico ...` — `toleranciaInspecao.api.test.js` |
| `medidas: []` **preserva** a marcação manual do payload (array vazio não ativa a derivação) | `(17)` — `medidasInspecao.api.test.js` |
| Toda recusa nova acontece **antes** do claim de saldo (o item mantém `quantidade_em_inspecao`) | asserção presente em **todos** os cenários de recusa de `medidasInspecao.api.test.js` — é o que a sabotagem (d) da Task 3 derrubou em 6 cenários |
| CRUD do plano: criar/listar/editar/desativar, duplicada recusada pelo índice, faixa invertida recusada, gate por perfil | 22 cenários em `server/tests/api/planoInspecao.api.test.js` (Etapa 27, `a15ac3b`) |
| O plano deixa rastro na **tela-contrato** da auditoria (`entidade=plano_inspecao`, rótulo "Plano de inspeção", de/para do nominal) | `(7)` — `server/tests/api/inspecaoIntegracao.api.test.js` (`cdb64a6`) |
| A decisão de inspeção **não** deixa rastro na auditoria (ausência declarada, com a metade positiva ao lado) | `(8)` — `server/tests/api/inspecaoIntegracao.api.test.js` |
| Desvio autorizado exige responsável + justificativa e fica registrado | não implementado — fora do escopo da Etapa 5 |

## Dependências

- 08 (recebimento dá entrada retida; este README decide o que a 08 apenas reteve) · 03 (efeitos no saldo via movimentação) · **10 (lotes existem desde a Etapa 6 e o motor recusa lote reprovado; ligar `decidirInspecao` ao lote é pendência DESTA feature — ver seção acima. Séries continuam ausentes, Etapa 6b)** · 12 (Devoluções — vai consumir o `encaminhamento` registrado aqui) · **16 (calibração de instrumentos — a ligação FOI FEITA na Etapa 27: `decidirInspecao` chama `toolService.calibracaoVigente` por require direto, sem ciclo, e instrumento vencido recusa a medida. A linha anterior desta spec dizia que "plano de inspeção com medidas depende disso" como se fosse bloqueio pendente; a dependência está SATISFEITA)**.
