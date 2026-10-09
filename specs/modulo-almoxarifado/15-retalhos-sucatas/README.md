# 15 — Retalhos, Sobras e Sucatas

> **Última atualização:** 2026-10-09 (**Etapa 97** — o sucateamento **comum** não leva mais o material separado na caixa sem reserva de uma requisição: a recusa vem **na solicitação** (antes das duas assinaturas), pelo livre de caixa, com a frase do disponível acrescida de *"e o separado na caixa de requisições"* e o sufixo da caixa (M7, `9dbf11c0`); `disponivel_na_solicitacao` passa a gravar o livre de caixa (só auditoria); a compensação do retalho estorna com `compensacao: true` (régua de hoje, `65dc74b2`). O sucateamento ligado à NC (`doBloqueado`) não muda. Range `eb7cd9d8..3fc39310`. Continua 🟢. Ver a seção "Etapa 97" no fim.) Antes: 2026-10-01 (Etapa 69 — o status abaixo).
> **Status:** 🟢 — **+ Etapa 69 (2026-10-01): o material REPROVADO na inspeção vai para o sucateamento** — a não
> conformidade decidida Sucatear ganha *Solicitar sucateamento* (`POST /nao-conformidades/:id/solicitar-sucateamento`,
> gate `movimentar`), o sucateamento ligado à NC (`nao_conformidade_id`) passa pelas mesmas duas assinaturas e a segunda
> baixa a `SUCATA` **do bloqueado** (`doBloqueado` no motor, físico e bloqueado juntos), com o estorno pelo livro
> recusado — `99bbce4`, `db8fa69`, `419b5a7`, `ff4d8e9`, `b3c75e5`, `7c0676c` + fix-round `c517248`/`827d655`. O
> sucateamento **comum** (do disponível) **não mudou** — e a medição achou que, na reprovação parcial, ele baixa material
> bom no lugar do reprovado (furo **C96** das novidades, decisão **B307**). O item novo do checklist abaixo; a feature
> continua 🟢 (o único `[ ]` segue sendo o e-mail, da feature 19).
> **Antes — Etapa 9 entregue (2026-08-16, `b727c0a..4ba94e2` + commits de documentação).**
> Retalho é estoque de verdade (material normal no motor + anexo dimensional), sucateamento é
> processo com dupla aprovação segregada e baixa pelo motor, tela `/almoxarifado/sobras` com as
> duas visões, etiqueta de retalho com QR. O único item do checklist fora do escopo é o e-mail —
> declarado abaixo, vai para a feature 19.
> Plano: [`docs/superpowers/plans/2026-08-15-almoxarifado-etapa9-retalhos-sucatas.md`](../../docs/superpowers/plans/2026-08-15-almoxarifado-etapa9-retalhos-sucatas.md) ·
> design: [`docs/superpowers/specs/2026-08-15-almoxarifado-etapa9-retalhos-sucatas-design.md`](../../docs/superpowers/specs/2026-08-15-almoxarifado-etapa9-retalhos-sucatas-design.md)
> **Antes:** 2026-08-15 — correção declarada: a afirmação "Teste de serviço existe" sobre o
> `scrapService` estava errada (grep vazio em `server/tests/`); não apagada em silêncio, fica
> registrada como errada (`b727c0a`). · 2026-08-11 — auditoria de cauda: nomeada a pendência de
> auditoria do `scrapService` (paga na Etapa 9, Task 1) e registrado que `SUCATA` passou a exigir
> justificativa no motor.

## Objetivo

Consumo parcial de chapa/tubo/barra gera retalho rastreável com dimensões remanescentes e nova etiqueta; sucata com classificação, aprovação e destino financeiro.

## Como ficou (arquitetura da Etapa 9, resumo)

- **Retalho é estoque; sucata é processo de saída.** O retalho vive como **material normal do
  catálogo** (o "material-retalho") movimentado pelo motor via tipo dedicado `ENTRADA_RETALHO`;
  a tabela `sobras_material_almoxarifado` foi **reformada** (não aposentada) e virou o **anexo
  dimensional**: dimensões, norma, peso, responsável e os vínculos `material_id` (origem),
  `lote_origem_id`, `material_retalho_id`, `movimentacao_baixa_id`/`movimentacao_entrada_id`.
- **`gerarRetalho` é evento composto** (`scrapService.js`): SAIDA do original (modo
  `baixar_original: true`) + `ENTRADA_RETALHO` sem custo + INSERT da sobra, com compensação
  explícita (o módulo não tem transação — forma da 8b/8c). Guarda própria de dono
  (`assertMesmoDonoNoRetalho`) e recusa de material serializado nas duas pontas.
- **`SUCATA` saiu da rota genérica** (entrou em `TIPOS_DEDICADOS`) e o sucateamento virou processo
  (`scrapDisposalService.js` + `scrapDisposalStateMachine.js`): SOLICITADO → duas assinaturas
  segregadas (`aprovar_sucateamento` = ADMINISTRADOR/ALMOXARIFE; `aprovar_sucateamento_gestao` =
  ADMINISTRADOR/GESTOR) → baixa `SUCATA` pelo motor na segunda assinatura → destino final
  VENDIDA (valor + comprovante) ou DESCARTADA. Claim anti-corrida no WHERE, compensação da
  assinatura se o motor recusar a baixa.
- **Relatório `sucata-financeiro`** lê o **livro** (`tipo='SUCATA'`), não só a tabela de
  sucateamentos — inclui as sucatas de devolução-destino-sucata da Etapa 7, que é o consumidor
  declarado da spec 12. Valoração pelo custo ATUAL (`custoUnitarioSql`, limitação declarada — a
  movimentação não guarda custo histórico) + `valor_venda` real dos VENDIDA.
- **Tela `/almoxarifado/sobras`** ("Sobras e Retalhos"): visão Retalhos (lista com filtros, gerar
  retalho nos dois modos, atalho criar material-retalho herdando família/dono/categoria, edição
  auditada, etiqueta) e visão Sucateamentos (solicitar, aprovar por perna, rejeitar, destino com
  upload, cancelar). Hint não bloqueante de retalho disponível na SAÍDA de Movimentações.

### Decisão registrada da execução (review da Task 6, endossada — não é furo)

**Não há pré-checagem de disponível na aprovação final do sucateamento.** O design (decisão 9)
falava em "pré-checagem de saldo na solicitação E na aprovação final"; na aprovação, quem faz essa
checagem é o **motor** — `registrarMovimentacao` valida o disponível antes de qualquer efeito e
recusa com o número na mensagem. Repetir a conta no serviço seria uma segunda fonte da mesma regra
(o defeito que `availabilitySql.js` existe para impedir) e inútil como proteção — a janela entre a
pré-checagem e o motor é justamente a corrida. O que protege é a **compensação da assinatura**
(exercitada por teste com injeção natural: consumir o saldo entre a solicitação e a segunda
assinatura). A pré-checagem de disponível existe, e fica, na **solicitação**. *(Etapa 97: a pré-checagem da
solicitação passa a ler o **livre de caixa** — o disponível menos a caixa sem reserva das requisições, `9dbf11c0` — e o
motor, na segunda assinatura, recusa pela mesma régua, `65dc74b2`. Continua sem pré-checagem própria na aprovação.)*

## O que já existia (histórico)

- `sobras_material_almoxarifado` (`schema.js`): material, tipo, dimensões originais/restantes, espessura, peso, localização, projeto/OS de origem, reutilizável, status. **Reformada na Etapa 9** (colunas novas por `safeAlter`, `material_id` relido como material de ORIGEM).
- `GET/POST/PUT /sobras` (`extended.js`) via `scrapService.js`. **Correção (2026-08-15):** esta
  linha dizia "Teste de serviço existe" — estava **errada**, e não é apagada em silêncio: não
  existia teste nenhum de `scrapService` nem das rotas `/sobras`
  (`grep -rn "scrapService\|criarSobra\|listarSobras" server/tests/` sem nenhuma ocorrência,
  verificado em 2026-08-15). A Etapa 9 criou os primeiros testes deste serviço
  (`sobras.api.test.js` e os demais listados abaixo). **`POST /sobras` foi aposentado** na Task 1
  (criação avulsa recriaria a ilha; o caminho é `POST /sobras/gerar-retalho`).
- Tipos de localização preveem área de sucata e de retalhos ("transferir para área de sucata" é
  `TRANSFERENCIA` para uma localização desse tipo — já existia desde a Etapa 7, não foi duplicado
  no processo).
  ⚠️ **Correção (Etapa 68): esta linha ESTAVA ERRADA.** `TIPOS_LOCALIZACAO` não tinha nenhum dos dois
  tipos (medido na Fase 0 da Etapa 68: 13 rótulos, nenhum de sucata nem de retalho). O que existia
  desde a Etapa 7 era só a `TRANSFERENCIA` para qualquer endereço. **A Etapa 68 criou `Área de
  sucata`** (`14cc17a`) e fez o sucateamento aprovado baixar dela quando o saldo ali cobre a
  quantidade inteira (`e79d8b5`). **`Área de retalhos` continua não existindo, por decisão (B286):**
  retalho é estoque aproveitável comum, guardado em endereço normal — o tipo seria só rótulo.

## Checklist

### Backend — retalhos
- [x] Auditar o CRUD de sobras: `scrapService` com `registrarAuditoria` em atualizar/gerar (paga a pendência nomeada em 2026-08-11; PUT com preserve-when-omitted) — `bedce46` + fix `2623b0b`
- [x] Fluxo de consumo parcial: baixa do original + saldo do retalho **no mesmo evento** — `15dd000` + fix `c3424e4`. **Precisão de termo:** a spec pedia "na mesma transação"; o módulo **não tem transação de banco** (débito arquitetural declarado desde a 6b, resolve na migração Postgres) — o atômico aqui é o padrão pré-checagem → pernas → **compensação** (falha na perna 2 desfaz a 1; falha na 3 desfaz 2 e 1), provado pelos testes `consumo parcial gera retalho na mesma transacao` e o de compensação com injeção natural
- [x] Vínculo com lote/corrida original: `lote_origem_id` obrigatório no modo com baixa quando a origem tem `controle_lote`, opcional-mas-validado no modo sem baixa (corrida vive no lote — feature 10) — `15dd000`
- [x] Campos completos: norma, diâmetro, largura, comprimento, responsável (`criado_por_id/nome`), data — `bedce46`. **Exceção declarada: `foto`** — a coluna existe (`safeAlter` em `schema.js:1382`) mas **não tem escritor**: nem `GerarRetalhoSchema` nem a tela oferecem upload. Ficou de fora da Task 8 e está registrada como pendência abaixo, não como entregue
- [x] Nova etiqueta com dimensões/peso remanescente: `montarEtiquetaRetalho` (dimensões+espessura `·` peso, QR `?sobra_id=` com deep-link e destaque) — `b8e8f1a` + fix `4ba94e2` (paga a pendência da 6c)
- [x] Retalho consultável na disponibilidade: `GET /materiais/:id/retalhos-disponiveis` (DISPONIVEL + reutilizável + disponível do material-retalho > 0 via `availabilitySql`) — `8727ff3`; hint não bloqueante na SAÍDA de Movimentações — `e27abe8`
- [x] Retalho de material de cliente permanece do cliente: `assertMesmoDonoNoRetalho` (recusa nomeando os dois donos) + herança de dono/categoria no atalho de criação — `15dd000` / `e27abe8`
- [x] Tipo `ENTRADA_RETALHO` nas fontes únicas (`TIPOS_MOVIMENTO`, `TIPOS_DEDICADOS`, `movementTypes.TIPOS_ENTRADA`, `REGRAS_VINCULO`, `TIPOS_ISENTOS_DONO`), sem custo no payload — `03b8113` + fix `81c1622`

### Backend — sucatas
- [x] Classificação de tipo de sucata + peso + material + projeto de origem (texto livre com sugestões no front; taxonomia real é pergunta ao cliente) — `a30ce6f` / `b8e8f1a`
- [x] Aprovação de sucateamento (Almoxarifado + gestão): duas ações novas de perfil, segregação em três barreiras (perfil, solicitante, mesma pessoa nas duas pernas — a terceira repetida no WHERE do claim contra corrida, provada por teste determinístico na suíte; a sonda de 500 execuções do fix round, não versionada, mediu 0 furos) — `a30ce6f` + fix `ba545e7`
- [x] `SUCATA` fora do formulário genérico (em `TIPOS_DEDICADOS`; sem isso o teste "sucatear sem aprovação falha" seria impossível por construção) — `d5821ac`
- [x] Transferência para área de sucata: **já existia** (Etapa 7, `TRANSFERENCIA` + tipo de localização) — documentada no guia, nada a construir
- [x] Registro de venda ou descarte com comprovante anexo (multipart no molde do certificado de lote, VENDIDA exige valor) — `bc34819`
- [x] Relatório financeiro de sucata lendo o **livro** (inclui devolução-destino-sucata; valoração pelo custo atual com nota de limitação; vendas reais somadas; total por classificação) — `bc34819`
- [ ] E-mail no sucateamento — **fora do escopo da Etapa 9, declarado no design (decisão 16)**: vai para a **feature 19** junto com os demais e-mails do módulo (mesmo padrão das etapas 8/8b/8c). Não é esquecimento; está desmarcado porque não foi entregue aqui
- [x] **Sucatear o material REPROVADO na inspeção** (item novo, Etapa 69 — a cadeia "quarentena → inspeção → reprovar →
      sucatear" da especificação original, seção 19) — motor `99bbce4` (`SUCATA` com `doBloqueado`: baixa físico e
      `quantidade_bloqueada` no mesmo UPDATE; recusa *"Sucateamento acima do que está bloqueado: há ⟨b⟩ ⟨un⟩
      bloqueado(s) (físico: ⟨a⟩)"*; estorno recusado por `referencia = 'SUC-'||id` + `nao_conformidade_id`), lado da NC
      `db8fa69` (viabilidade pura `sucateamentoDoReprovadoPrevisto`, `/executar` de SUCATEAR que recusa ensinando, as
      três portas sobre o bloqueado olhando os três carimbos da inspeção), sucateamento e rota `419b5a7` (solicitação
      derivada da inspeção, segunda assinatura baixando do bloqueado com compensação, origem pela área de sucata — com
      lote — ou pelo endereço de entrada), telas `ff4d8e9` (NC) e `b3c75e5` (selo *Origem: NC-…* na fila), integração
      `7c0676c`, fix-round `c517248` (o lote do reprovado é conferido antes) e `827d655` (material de cliente recusa
      ensinando). **Escopo:** a quantidade reprovada inteira, do lote da inspeção; série recusada; material de cliente
      só pela API (a janela não tem OS/projeto). **O sucateamento comum NÃO mudou** (decisão **B307**): na reprovação
      parcial ele continua aceitando e baixando do disponível — fixado por teste e avisado (**C96**, consulta **A33**).

### Frontend
- [x] Tela de sobras/retalhos: consulta por material/dimensão/status, gerar retalho (dois modos + atalho criar material), editar, etiqueta, extrato, selo de proprietário — `e27abe8`
- [x] Fluxo de sucateamento com aprovação na tela: solicitar, aprovar por perna (5 condições de visibilidade, incluindo esconder de quem já assinou a outra perna), rejeitar com motivo, destino com upload, cancelar — `b8e8f1a` + fix `4ba94e2`

## Regras essenciais + testes de API exigidos

| Regra | Teste | Estado |
|-------|-------|--------|
| Consumo parcial baixa o original e cria retalho atomicamente | `consumo parcial gera retalho na mesma transacao` (`retalhoGeracao.api.test.js`) | ✅ `15dd000` |
| Retalho herda lote/corrida do original | `retalho referencia lote original` (`retalhoGeracao.api.test.js`) | ✅ `15dd000` |
| Sucateamento sem dupla aprovação falha | `sucatear sem aprovacao falha` (`sucateamentoAprovacao.api.test.js` + recusa da v2 em `sucataDedicada.api.test.js`) | ✅ `d5821ac`/`a30ce6f` |
| Sucata sai do estoque disponível | `material sucateado fora do disponivel` (`sucateamentoAprovacao.api.test.js`) | ✅ `a30ce6f` |
| A sucata do reprovado baixa do **bloqueado** (físico e bloqueado juntos), recusa acima do bloqueado e não se estorna pelo livro | `sucataBloqueadoMotor.api.test.js` (10 cenários) | ✅ `99bbce4` |
| Solicitar pela NC deriva material/quantidade/lote, as duas assinaturas baixam do bloqueado, compensação na falha | `sucateamentoReprovado.api.test.js` (16) e, ponta a ponta pelas rotas com sete usuários, `sucateamentoReprovadoIntegracao.api.test.js` (12) | ✅ `419b5a7`, `7c0676c`, `c517248`, `827d655` |
| O sucateamento **comum** na reprovação parcial continua baixando do disponível (comportamento declarado, **B307**) | cenário (10) de `sucateamentoReprovadoIntegracao.api.test.js` | ✅ `7c0676c` (fixado) |
| **Etapa 97** — a solicitação do sucateamento comum recusa o que está separado na caixa sem reserva de uma requisição (M7 com a frase da caixa e o S); sem caixa, a recusa é byte a byte a de antes | `[97 RN-01] sucateamento: a recusa vem NA SOLICITACAO (400 M7 com a frase da caixa e o S), nenhuma solicitacao criada; A entrega 4` + `[97 RN-04] sucateamento sem caixa: a recusa e byte a byte a de hoje (sem a frase da caixa, sem S); fisico 6 caixa 4: 3 recusa com S, 2 passa` (`portasAvulsasCaixa.api.test.js`) | ✅ `9dbf11c0` |
| **Etapa 97** — a compensação do retalho estorna a `ENTRADA_RETALHO` na régua de hoje (`compensacao: true`) | `[97 I-4] (Fase 2) estorno de entrada como compensacao (opcoes.compensacao) fica na regua de hoje; sem a opcao recusa` (`portasAvulsasCaixa.api.test.js`) | ✅ `65dc74b2` |

Arquivos de teste criados pela etapa: `sobras.api.test.js`, `retalhoTipo.api.test.js`,
`retalhoGeracao.api.test.js`, `retalhoRotas.api.test.js`, `sucataDedicada.api.test.js`,
`sucateamento.api.test.js`, `sucateamentoAprovacao.api.test.js`, `sucateamentoRotas.api.test.js`;
client: `SobrasAlmoxarifado.test.js` + casos novos em `etiquetasPdf.test.js`.

## Pendências (registradas na entrega da Etapa 9)

- **Sem guarda geral de fonte única para tipo novo de movimento.** A sabotagem da Task 2 provou
  que `clientePosicaoTipos.api.test.js` **não pega** um tipo declarado em `schema.js`
  `TIPOS_MOVIMENTO` mas esquecido de `movementTypes.TIPOS_ENTRADA`/`TIPOS_SAIDA` — desde a 8c o
  teste da equação itera a própria lista de `movementTypes`, então um tipo ausente dali fica
  invisível para ele; só o teste de DECLARAÇÃO do tipo novo pega o esquecimento. Uma guarda
  automática ("todo tipo de `TIPOS_MOVIMENTO` está em `TIPOS_ENTRADA` ou `TIPOS_SAIDA`, salvo
  exceção nomeada") exige uma **lista de exceções mantida** (AJUSTE, ESTORNO, TRANSFERENCIA,
  RETRABALHO, tipos de retenção...) — é design em aberto, não foi construída na Etapa 9. Quem
  criar o próximo tipo de movimento precisa lembrar das fontes únicas **sem rede além do teste de
  declaração**.
- **`foto` da sobra: coluna sem escritor.** Existe por `safeAlter`, nenhum caminho grava
  (schema não aceita, tela não oferece upload). Ou ganha upload no padrão da foto de material, ou
  a coluna deveria ser declarada morta.
- **Retalho de material-retalho com `controle_lote` entra sem lote.** A perna `ENTRADA_RETALHO`
  não declara `exigeLote` porque o payload não tem campo "lote do retalho" (decisão do cliente de
  2026-08-10: a exigência vale só onde existe COMO informar). Mesma família dos quatro fluxos
  internos isentos da spec 10.
- **Estorno da baixa SUCATA não reconcilia o processo** — *(desde a Etapa 69 vale só para o sucateamento
  **comum**: a sucata do reprovado, ligada a uma não conformidade, tem o estorno pelo livro **recusado** — `99bbce4`,
  decisão B298)* — (decisão de deferir, review final): estornar
  a movimentação pelo livro deixa o sucateamento em APROVADO/VENDIDA apontando para uma movimentação
  cancelada, e o relatório continua somando o `valor_venda` de uma sucata cuja baixa foi desfeita —
  divergência silenciosa entre processo e livro; reconciliar é design da 9b.
- **`confirmarEditar` da tela Sobras deixa `localizacao_codigo` obsoleto na linha** (decisão de
  deferir, review final): o merge `{ ...s, ...res.data }` atualiza `localizacao_id` mas a resposta
  não traz o código novo — a coluna Localização mostra o endereço antigo até o próximo reload.
- **Reserva de retalho** não existe — mesma pendência da reserva por lote/série (spec 10).
- **Sem aritmética dimensional**: o sistema não calcula 3000−1200=1800; dimensões remanescentes
  são registro descritivo digitado (decisão 16 do design — exigiria modelagem dimensional por
  material que o catálogo não tem).
- Minors deferidos com registro no ledger da etapa (baixo risco, nomeados para não sumirem):
  auditoria de sobra grava linha inteira em vez de diff de campos; `origem.ativo` não checado no
  modo `baixar_original: false`;
  claim de `registrarDestino` sem `AND movimentacao_sucata_id IS NOT NULL`; `PODE_*` exportados
  da máquina de estados sem consumidor; filtros da lista de sobras e ramo `lote_origem_id`
  obrigatório sem teste RTL dedicado; sem guarda de duplo clique em aprovar/cancelar na tela (o
  backend rejeita a repetição com 409).
- *(Fix wave final da review de conjunto, 2026-08-17)* dois minors saíram desta lista porque foram
  **pagos**: `valor_venda` fora de VENDIDA agora é forçado a NULL no serviço, e o `.catch` vazio do
  estorno da perna 2 de `compensarRetalho` ganhou `console.warn` com rastro.

## Dependências

- 03 (motor/compensação) · 10 (lote/etiqueta) · 06 (aprovação segregada) · 13 (propriedade do cliente) · 12 (devolução destino sucata — o relatório desta feature é o consumidor declarado dela).

## Etapa 97 — o sucateamento não leva o material separado na caixa de uma requisição (2026-10-09)

Plano: `docs/superpowers/plans/2026-10-09-almoxarifado-etapa97-portas-avulsas-respeitam-a-caixa.md` (`eb7cd9d8`, Fase 2
`4a9cf5c1`). Range `eb7cd9d8..3fc39310`. A régua (livre de caixa = disponível do motor − caixa sem reserva das
requisições) está na feature 03.

**O que estava errado (Fase 0, s2b):** com 4 separados na caixa sem reserva de uma requisição A (físico 4, reservado
0), o sucateamento comum de 4 passava inteiro — solicitação 201, primeira assinatura 200, segunda (a baixa) 200 — e A
ficava presa: entregar → 400 *"Máximo: 0"*.

**Entregue:**
- [x] **A recusa na solicitação (M7)** — `9dbf11c0`: a pré-checagem lê `livreDeCaixaSql()` como disponível; a recusa
  vem **na solicitação**, antes das duas assinaturas, e nenhuma solicitação é criada: *"Saldo disponivel insuficiente
  para sucatear ⟨cod⟩: disponivel ⟨n⟩ ⟨un⟩, solicitado ⟨q⟩. O disponivel ja desconta reservado, bloqueado, em inspecao e
  em poder de terceiros e o separado na caixa de requisições — sucatear alem dele apagaria material que esta
  comprometido com outra OS."* + o sufixo S (sem acento no código, é assim). A frase *"e o separado na caixa de
  requisições"* e o S **só quando há caixa**; sem caixa, a literal de antes byte a byte (Fase 2, menor 2). Com caixa,
  ⟨n⟩ = `max(0, livre)`.
- [x] **`disponivel_na_solicitacao` grava o livre de caixa** — `9dbf11c0`: o valor gravado em `dados_novos` da
  auditoria da solicitação passa a ser o mesmo número que a pré-checagem comparou. **Só auditoria** — nenhuma regra o
  lê.
- [x] **A baixa (segunda assinatura) recusa pela mesma régua** — `65dc74b2`: a `SUCATA` sem `doBloqueado` é saída comum
  do motor (M1 + S). O sucateamento do reprovado (`doBloqueado`, Etapa 69) baixa do bloqueado e **não** muda.
- [x] **A compensação do retalho na régua de hoje** — `65dc74b2` (Fase 2, I-4): `compensarRetalho` estorna a
  `ENTRADA_RETALHO` recém-creditada com `cancelarMovimentacao(…, { compensacao: true })` — sem isso, no legado (caixa >
  físico) o estorno recusaria e o `.catch` deixaria o retalho fantasma que o aviso já descreve. O estorno da baixa do
  original (crédito) não muda.

**Fica de fora (declarado):** a compensação com `compensacao: true` só levaria a caixa depois de uma falha no meio da
geração do retalho **e** uma separação concorrente; o C96/B307 (o sucateamento comum na reprovação parcial) não muda.

**Testes:** `portasAvulsasCaixa.api.test.js` — *"[97 RN-01] sucateamento: a recusa vem NA SOLICITACAO (400 M7 com a frase
da caixa e o S), nenhuma solicitacao criada; A entrega 4"*, *"[97 RN-04] sucateamento sem caixa: a recusa e byte a byte a
de hoje (sem a frase da caixa, sem S); fisico 6 caixa 4: 3 recusa com S, 2 passa"*, *"[97 RN-01] saida comum pelo
servico, em laco de tipos (…, SUCATA): cada um 400 M1+S, nada muda, e A entrega 4"*, *"[97 I-4] (Fase 2) estorno de
entrada como compensacao (opcoes.compensacao) fica na regua de hoje; sem a opcao recusa"*;
`portasAvulsasCaixaIntegracao.api.test.js` — *"[97 T3 C1]"* (o sucateamento pela rota). `test:api` 338/338 (4163 ✓).
Continua 🟢.
