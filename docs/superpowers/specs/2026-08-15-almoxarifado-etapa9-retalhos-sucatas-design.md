# Etapa 9 — Retalhos, sobras e sucatas (feature 15)

> Data: 2026-08-15 · Branch: `desenvolvimento-almoxarifado` · Spec da feature:
> [`specs/modulo-almoxarifado/15-retalhos-sucatas/README.md`](../../../specs/modulo-almoxarifado/15-retalhos-sucatas/README.md) ·
> Requisito original: seção 19 (retalhos/sucatas), com menções nas seções 3.1, 6, 8.1, 10, 13.1,
> 15, 17, 25, 26, 27 e 33 de
> [`2026-08-02-requisitos-modulo-almoxarifado.md`](../../../specs/modulo-almoxarifado/2026-08-02-requisitos-modulo-almoxarifado.md)

## Por que esta etapa, e por que só a feature 15

O plano mestre dizia que a próxima etapa **precisava ser decidida** entre a Etapa 9 da ordem
(features 15+16) e duas candidatas por dívida acumulada. As duas candidatas — `AJUSTE` × retenção
e categorias hardcoded do front — estão travadas pelo próprio briefing da 8c: "**uma pergunta ao
cliente antes de qualquer código**", e a resposta da GMP não chegou. A Etapa 9 é a única frente
destravada, e é a próxima da ordem. As perguntas ao cliente continuam registradas (seção final).

**A Etapa 9 cobre só a feature 15 (retalhos/sobras/sucatas). A feature 16 (ferramentas e
calibração) vira Etapa 9b** — mesmo precedente das divisões 6/6b/6c e 8/8b/8c: são subsistemas
independentes (retalho é estoque; ferramenta é patrimônio emprestável), cada um fecha com testes
por conta própria, e tratá-los como uma etapa só faria parecer que ficariam prontos juntos.

## O problema

Três, encadeados:

1. **O retalho não existe no sistema.** Quando uma chapa/barra/tubo é parcialmente usada, o
   sistema só sabe "1 chapa saiu". O pedaço aproveitável que sobra fisicamente não tem saldo, não
   tem etiqueta, não aparece quando alguém procura material — e a GMP compra chapa nova com meia
   chapa na prateleira. O fluxo operacional da GMP termina literalmente com "Sobras retornam ao
   estoque" (requisito, seção 33) — hoje não retornam.
2. **Sucatear é uma baixa solta.** `SUCATA` é tipo selecionável no formulário genérico de
   Movimentações (Task 9 da Etapa 6): qualquer ALMOXARIFE baixa qualquer material como sucata com
   uma justificativa, sem classificação, sem aprovação de ninguém, sem registro de venda/descarte
   e sem número financeiro. O requisito (seções 6 e 19) exige aprovação **dupla** (Almoxarifado +
   gestão), classificação, comprovante e relatório.
3. **A ilha.** A tabela `sobras_material_almoxarifado` + `scrapService.js` + 3 rotas `/sobras` são
   um CRUD morto: SQL direto sem validação, sem auditoria (único serviço de cauda sem
   `registrarAuditoria` — pendência nomeada na spec 23), o parâmetro `user` recebido e ignorado,
   **zero testes** e **zero consumidores no front**. Registro ali não cria saldo, não movimenta
   nada, não aparece em lugar nenhum. É a mesma doença da ilha de materiais de clientes que a
   Etapa 8 aposentou.

## A diferença de natureza que organiza a etapa

**Retalho é estoque; sucata é processo de saída.** O retalho volta para a prateleira: precisa de
saldo, livro, etiqueta, disponibilidade — ou seja, precisa do **motor**. A sucata sai do
patrimônio: precisa de classificação, dupla aprovação, baixa auditada e destino financeiro — ou
seja, precisa de **máquina de estados**. A etapa entrega os dois com o motor no meio de ambos:
nenhum saldo muda fora do livro.

## Decisões

### 1. Retalho é material normal no motor; a tabela de sobras vira o **anexo dimensional** — reformada, não aposentada

Cada retalho gerado é: **saldo real** num material do catálogo (o "material-retalho") movimentado
pelo motor, **mais** uma linha em `sobras_material_almoxarifado` guardando o que o catálogo não
tem onde guardar — dimensões remanescentes, norma, espessura, diâmetro, largura, comprimento,
peso, foto, responsável, e os vínculos: `material_origem_id`, `lote_origem_id`,
`material_retalho_id` e as movimentações do evento (`movimentacao_baixa_id`,
`movimentacao_entrada_id` — o agrupador, mesmo papel do `movimentacao_consumo_id` da 8c).

A tabela ganha por `safeAlter` as colunas que faltam (norma, diâmetro, largura, comprimento,
foto, responsável/criador, vínculos acima). O `scrapService` é reescrito: validação Zod,
`registrarAuditoria` em tudo (paga a pendência da spec 23), usuário gravado.

- **Alternativa rejeitada A — construir sobre a ilha sozinha** (retalho vive só na tabela, fora
  do motor): sem saldo, sem livro, sem custo, sem disponibilidade — repete a doença que a Etapa 8
  precisou curar. Descartada.
- **Alternativa rejeitada B — retalho como número de série do material original**: meia chapa
  **não é** chapa (dimensões, uso e valor divergem); série exigiria `controle_serie` no material
  original e confundiria dois conceitos que o módulo já separa bem. Descartada.
- **Por que reformar em vez de aposentar (contraste com a Etapa 8):** a ilha de clientes
  *competia* com o catálogo (duplicava material). A tabela de sobras não compete — ela anota
  dimensões **por peça**, coisa que nem o catálogo nem o saldo têm onde guardar. O defeito dela
  era estar desconectada do motor, não existir.

### 2. Gerar retalho é **evento composto** no motor: baixa do original + entrada do retalho

Rota dedicada `POST /almoxarifado/sobras/gerar-retalho` (gate `movimentar`), dois modos:

- **`baixar_original: true`** — a peça original ainda está no estoque (corte feito no
  almoxarifado): o serviço emite `SAIDA` do material original (quantidade informada, com as
  regras de vínculo normais de `SAIDA` — projeto/OS — e a guarda de dono existente) **e**
  `ENTRADA_RETALHO` do material-retalho, mais a linha de sobra. Sem transação no módulo, a forma
  é a de sempre (8b/8c/returnService): pré-checagem, executa a perna 1, executa a perna 2,
  **compensa a perna 1 se a 2 falhar**.
- **`baixar_original: false`** — a peça original já saiu do estoque antes (requisição entregue; a
  sobra volta do chão de fábrica): só `ENTRADA_RETALHO` + linha de sobra. É o caso "sobras
  retornam ao estoque" da seção 33.

**Lote:** se o material original tem `controle_lote`, o `lote_origem_id` é **obrigatório** no
modo `baixar_original: true` (a saída exige lote de qualquer forma) e opcional-mas-validado no
modo `false` (o operador informa de qual lote a peça veio, se souber). O vínculo fica na linha da
sobra — é o "manter vínculo com o lote original" do requisito.

### 3. Tipo novo `ENTRADA_RETALHO` — e ele nasce na fonte única

Por que não reusar `ENTRADA`: (a) `ENTRADA` aceita custo digitado e alimenta custo médio —
retalho **não pode** (decisão 4); (b) o livro e os relatórios ("Sobras por projeto", seção 25)
precisam distinguir retalho de compra; (c) regras de vínculo próprias (projeto de origem
opcional). O tipo entra em `TIPOS_DEDICADOS` (a rota genérica de movimentação o recusa — só o
evento composto o emite) e em **`services/almoxarifado/movementTypes.js`**, a fonte única criada
na 8c — o que faz a posição por cliente derivá-lo automaticamente e o teste da equação
(recebido − consumido − devolvido = saldo) cobri-lo sem ninguém lembrar de escrever teste novo.
Nas regras de dono, segue o precedente exato do `RETORNO_TRANSFORMACAO`: entra na lista de
isenção da guarda genérica porque o evento composto tem guarda **própria** de dono (decisão 5).
O front ganha o badge do tipo no livro (a lição do `d117dc2`: tipo sem cor).

### 4. Custo do retalho: **zero, sempre** — reafirmação da 8c

O patrimônio nunca infla: o projeto pagou a chapa inteira na `SAIDA`; o retalho entra a custo
zero. `ENTRADA_RETALHO` **não aceita** custo no payload (diferença estrutural para `ENTRADA`), e
— comportamento que o motor já tem — entrada a custo zero **não apaga** o custo médio que o
material-retalho porventura já tenha (`stockService` só mexe em custo com `custoInformado > 0`).

### 5. Dono e categoria **herdados** do original

- **Dono:** retalho de material de cliente **permanece do cliente** (requisito seção 17; item da
  spec 13 empurrado para cá). Guarda no serviço, espelho da `assertMesmoDonoNaTransformacao` da
  8c: o material-retalho tem de ter o **mesmo** `proprietario_cliente_id` do material original —
  senão a geração de retalho converteria chapa do cliente em patrimônio da GMP.
- **Categoria:** o material-retalho herda a **categoria do original** (retalho de chapa MECÂNICO
  continua MECÂNICO — ele *é* aquele material, só que parcial). Isso deliberadamente **não mexe**
  na dívida das categorias hardcoded (que tem pergunta ao cliente pendente) e não depende da
  categoria seedada "Sucata e sobras reaproveitáveis", hoje inalcançável pela UI.

### 6. O material-retalho tem de **existir**; a tela ajuda a criar; o motor não cria

Mesma decisão 6 da 8c, mesmo atalho: o modal de gerar retalho oferece "criar material do retalho"
(via `materialService.createMaterial` + `codigo_auto`), pré-preenchendo nome, unidade, família,
**dono e categoria herdados do original**. O serviço recusa `material_retalho_id` inexistente com
mensagem que ensina o caminho.

### 7. Disponibilidade **sugere** retalho antes do inteiro — sugere, não impõe

`GET /almoxarifado/materiais/:id/retalhos-disponiveis` (leitura, só auth — padrão das leituras do
módulo): sobras com status `DISPONIVEL` cujo material-retalho tem saldo disponível > 0, com as
dimensões na resposta. Consumo: (a) a tela de sobras filtra por material de origem; (b) o
formulário de Movimentações, ao selecionar um material para `SAIDA`, mostra um aviso não
bloqueante "existem N retalhos deste material — considere usá-los" com link para a tela. É o
"sugerir retalho antes de material inteiro" da spec — como sugestão mesmo, no ponto onde o
almoxarife decide.

### 8. `SUCATA` sai do formulário genérico e vira **tipo dedicado** — o precedente é a DEVOLUCAO da Etapa 7

O teste exigido pela spec — "sucatear sem aprovação falha" — é **impossível** enquanto `SUCATA`
for selecionável na rota genérica de movimentação: a regra estaria furada por construção. A
Etapa 7 já resolveu o mesmo dilema com `DEVOLUCAO` ("ali criava lançamento solto e nenhum
registro de devolução"). Igual aqui: `SUCATA` entra em `TIPOS_DEDICADOS` (rota genérica recusa,
com mensagem que ensina o caminho do processo), sai de `TIPOS_FORM` do front, e os caminhos
legítimos passam a ser dois: o **processo de sucateamento** (esta etapa) e a **devolução com
destino sucata** (Etapa 7, chamada interna de serviço — continua funcionando, os testes dela
guardam isso). `PERDA` **continua** no formulário: o requisito só exige aprovação dupla para
sucateamento. **Mudança de comportamento visível — entra no guia com "Antes → Agora".**

### 9. Sucateamento é processo com **dupla aprovação, segregação e baixa na aprovação final**

Tabela nova `sucateamentos_almoxarifado`: material, quantidade, lote (obrigatório se o material
exige), classificação do tipo de sucata, peso estimado, projeto de origem, justificativa,
solicitante, aprovações, destino final. Máquina de estados explícita
(`scrapDisposalStateMachine.js`, no molde das existentes):

```
SOLICITADO ──aprovar(almox)──┐
    │                        ├──(as duas pernas)──> APROVADO ──registrar destino──> VENDIDA | DESCARTADA
    │  └──aprovar(gestão)────┘
    ├──rejeitar(justificado)──> REJEITADO
    └──cancelar(solicitante)──> CANCELADO
```

- **Duas pernas de aprovação, qualquer ordem:** Almoxarifado (ação nova `aprovar_sucateamento`:
  ADMINISTRADOR, ALMOXARIFE) e gestão (ação nova `aprovar_sucateamento_gestao`: ADMINISTRADOR,
  GESTOR — é a "gestão responsável" do requisito, seção 6). Ações novas porque a operação muda a
  natureza do risco (critério documentado em `permissions.js`) — e entram de graça no
  `GET /minhas-permissoes`.
- **Segregação:** o solicitante não aprova nenhuma perna; as duas pernas exigem usuários
  **distintos** (senão "dupla aprovação" é uma assinatura com dois carimbos). ADMINISTRADOR pode
  aprovar qualquer perna, mas nunca as duas.
- **A baixa acontece na segunda aprovação:** o claim do estado é UPDATE único guardado no WHERE
  (o padrão anti-corrida da base), e em seguida o serviço emite a movimentação `SUCATA` pelo
  motor (com a justificativa da solicitação — o motor já a exige). Se o motor recusar (saldo
  insuficiente, lote inválido), a aprovação é **compensada** e o processo volta ao estado
  anterior com o erro reportado. Pré-checagem de saldo na solicitação E na aprovação final (o
  saldo pode ter mudado no meio).
- **Destino final:** depois de APROVADO (e baixado), registra-se **venda** (valor + comprovante
  anexo) ou **descarte** (comprovante opcional). Upload no padrão do certificado de lote
  (PDF/imagem, apagamento do arquivo anterior órfão). Estados finais `VENDIDA`/`DESCARTADA`.
- **Rejeição justificada** (qualquer perna) e **cancelamento** pelo solicitante enquanto
  `SOLICITADO` — padrões da Etapa 3.
- **Classificação:** campo texto com sugestões fixas no front (ex.: aço carbono, inox, alumínio,
  cobre, cavaco, misto). A taxonomia real é **pergunta ao cliente** (seção final) — texto livre
  não trava a operação enquanto a resposta não vem.
- **"Transferir para área de sucata"** (requisito): já existe — é `TRANSFERENCIA` para uma
  localização de tipo área de sucata, entregue na Etapa 7. O guia documenta; o processo não
  duplica.

### 10. Relatório financeiro de sucata lê o **livro** — que é o consumidor declarado dos lançamentos da Etapa 7

`GET /almoxarifado/relatorios/sucata-financeiro` (dispatcher de relatórios existente): no
período, as movimentações `SUCATA` (quantidade, material, valor estimado pela valoração atual via
`custoSql` — as movimentações não têm coluna de custo histórico, decisão 10 da 8c, limitação
declarada no próprio relatório) cruzadas com os sucateamentos (classificação, peso, valor de
venda real dos `VENDIDA`). Isso inclui as sucatas vindas de **devolução com destino sucata** — o
par `ENTRADA_DEVOLUCAO`+`SUCATA` da Etapa 7 existe exatamente porque "a feature 15 vai precisar
dela lá" (spec 12). O indicador "Valor de sucata" (seção 27) sai daqui.

### 11. Etiqueta de retalho — paga a pendência da 6c, **zero servidor**

Montador novo `montarEtiquetaRetalho` em `client/src/utils/etiquetasPdf.js`: `linhaControle` com
dimensões/peso remanescente, QR com deep-link para a tela de sobras
(`/almoxarifado/sobras?sobra_id=`). Botão por linha na tela nova e impressão logo após gerar o
retalho. Testar truncagem no formato `TERMICA_100x50` (a `linhaControle` é uma linha só com
`maxWidth` — dimensões longas truncam).

### 12. Tela nova `/almoxarifado/sobras` — "Sobras e Retalhos"

Rota + lazy + item de menu (disciplina de rótulos vizinhos de `Layout.js`: não confundir com
"Devoluções" nem com o destino Sucata). Idioma das telas recentes (lista+modal,
`.almox-header`, `SkeletonTable`, `useAlmoxPermissoes().bloquearSeNaoPode`, `SeloProprietario`,
guard `let cancelado` nos fetchs dependentes). Duas visões na mesma tela:

- **Retalhos:** lista com filtros (material de origem, texto de dimensão/norma, status), gerar
  retalho (modal com os dois modos + atalho criar material-retalho), **foto opcional** (upload
  no padrão da foto de material, servida pelo static de `uploads/almoxarifado` já montado),
  etiqueta, extrato do material-retalho (`ExtratoMaterialModal`), edição de
  status/localização/observações (PUT auditado).
- **Sucateamentos:** solicitar (a partir de material/retalho), fila com estados e badges,
  aprovar/rejeitar por perna (botões escondidos conforme `minhas-permissoes` e o estado),
  registrar venda/descarte com upload, e o corte do processo: quem solicitou não vê botão de
  aprovar (o backend barra de qualquer forma).

### 13. O que muda nas rotas legadas de sobras

`POST /sobras` (criação avulsa na ilha, sem motor) é **aposentado** — criar sobra sem entrada de
estoque é recriar a ilha; o caminho é `POST /sobras/gerar-retalho` (modo `baixar_original: false`
cobre o caso "a peça apareceu/voltou"). Sem risco: zero consumidores no front, zero testes. `GET
/sobras` e `PUT /sobras/:id` continuam (agora com Zod + auditoria + usuário gravado). Sem DELETE
— sobra errada muda de status, histórico não some (padrão do módulo).

### 14. Correções de spec **declaradas** (regra 5 do CLAUDE.md)

- **Spec 15 mente:** "Teste de serviço existe" — **falso**, zero testes cobrem
  `scrapService`/rotas `/sobras` (verificado por grep em `server/tests`). Corrigir dizendo que
  estava errada.
- **Spec 16 mente igual e cita linhas mortas:** "Teste de serviço existe" — **falso**; e as
  referências `schema.js:555/569`, `extended.js:247-269` apontam para lugares que hoje são
  `schema.js:1303/1317`, `extended.js:672-698`. Corrigir **já, nesta etapa**, mesmo sendo assunto
  da 9b — deixar mentira documentada para a próxima sessão é o erro que este projeto já cometeu.

### 15. Sem transação: pré-checagem, claim, compensação

Nada de novo: é a forma da 8b/8c/`returnService`. Os dois pontos com duas pernas (gerar retalho
com baixa; aprovação final que baixa) compensam a perna 1 se a perna 2 falhar, e os testes
provam a compensação com sabotagem (perna 2 forçada a falhar → perna 1 desfeita).

### 16. Fora do escopo, declarado

- **E-mail no sucateamento** — feature 19 (padrão das etapas 8/8b/8c).
- **Alertas** — feature 20.
- **Ferramentas e calibração** — Etapa 9b.
- **Reserva de retalho** — a reserva por lote/série já é pendência da spec 10; retalho segue o
  mesmo destino.
- **Aritmética dimensional:** o sistema **não calcula** dimensões (não faz 3000−1200=1800 mm);
  as dimensões remanescentes são **registro descritivo** digitado pelo operador. A "baixa na
  dimensão original" do requisito é a baixa da **quantidade** do material original; o rastro
  dimensional vive na linha da sobra. Automatizar isso exigiria modelagem dimensional por
  material (área/comprimento/peso por unidade) que o catálogo não tem — se a GMP quiser, é etapa
  própria.
- **Integração financeira da venda de sucata:** registro com valor + comprovante; não emite
  título, não integra faturamento.

## Testes exigidos

Os quatro da spec 15, com os nomes dela, mais os que as decisões acima criam:

| Regra | Teste |
|---|---|
| Consumo parcial baixa o original e cria retalho atomicamente | `gerar retalho com baixa: saida + entrada + sobra no mesmo evento`; sabotagem: perna 2 falha → perna 1 compensada |
| Retalho herda lote/corrida do original | `retalho referencia lote original` (obrigatório com `controle_lote` + `baixar_original`) |
| Sucateamento sem dupla aprovação falha | rota genérica recusa `SUCATA`; executar baixa com 0 ou 1 aprovação falha; aprovar a própria solicitação falha; mesmo usuário nas duas pernas falha |
| Sucata sai do estoque disponível | após 2ª aprovação, `quantidade_atual` e disponível caem |
| Retalho de cliente permanece do cliente | material-retalho com dono diferente → recusa (controle positivo: mesmo dono → passa) |
| Retalho nunca infla o patrimônio | `ENTRADA_RETALHO` recusa custo no payload; custo médio do material-retalho não muda |
| Posição por cliente fecha a conta | `ENTRADA_RETALHO` entra na equação via `movementTypes.js` (o teste da equação da 8c cobre tipo novo automaticamente — verificar que falha sem a linha na fonte única) |
| Permissões reais | 403 para perfil fora de `aprovar_sucateamento`/`aprovar_sucateamento_gestao`/`movimentar` (harness com `requirePermission` real) |
| Auditoria | gerar retalho, editar sobra, solicitar/aprovar/rejeitar/vender auditam (paga a pendência da spec 23) |
| Etiqueta (client) | montador de retalho: conteúdo e truncagem na térmica |

Controle positivo obrigatório em todos (o projeto já teve três testes vazios).

## O que esta etapa **não** entrega, em linguagem de usuário

- O sistema não calcula quanto sobrou — você digita as dimensões do pedaço.
- Ninguém recebe e-mail de sucateamento; o acompanhamento é pela tela.
- Vender sucata registra valor e comprovante — não vira fatura nem título financeiro.
- Ferramentas e calibração ficam para a Etapa 9b.

## Perguntas ao cliente (registradas, não bloqueiam)

1. **`AJUSTE` × retenção** (pendente desde a 8b): quando o inventário ajusta material com saldo
   em terceiros/reservado/bloqueado/em inspeção, o ajuste baixa a retenção, recusa ou avisa?
2. **Categorias de material**: qual taxonomia vale — a lista fixa das telas ou a tabela
   configurável do servidor? (dívida da spec 01; a Etapa 9 herda categoria do original de
   propósito para não depender da resposta)
3. **Classificações de sucata**: quais tipos a GMP usa de verdade? (a etapa entrega texto livre
   com sugestões)
4. **Remessa não mistura donos** (pendente desde a 8b): regra deduzida, segue sem confirmação.
