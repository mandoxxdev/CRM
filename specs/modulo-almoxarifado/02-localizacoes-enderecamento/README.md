# 02 — Localizações e Endereçamento

> **Status:** 🟡 — Etapa 2 entregue (2026-08-04): multi-almoxarifado (entidade `almoxarifados` como raiz + migração ledger), restrições de endereço (bloqueio + tipos de material permitidos) aplicadas no motor, exclusão de localização com saldo bloqueada, `endereco_completo` + consultas de vazias/sem-endereço, gestão de almoxarifados e restrições no front. Falta: código de endereço padrão gerado, capacidade/peso/dimensões como enforcement, confirmação por leitura.  **Etapa 54 (2026-09-30): o motor recusa o endereço informado inativo ou inexistente** (`c757276` + fix-round) — ver a seção no fim. **Etapa 55 (2026-09-30): o próximo código de localização é calculado no servidor (`PREFIXO-NN`, contando as inativas e sem colidir com código nenhum)** (`77e51a5` + fix-round 3ac650e) — o código **hierárquico** da spec continua fora (**B220**). **Etapa 56 (2026-09-30): etiqueta de localização e confirmação do endereço por leitura** (`75cbea1`, `298ffd9` + fix-round 22e00aa) — o item "confirmação por leitura" do checklist está entregue. **Continua 🟡**: falta **áreas especiais com semântica** (o único item aberto que não é corte por decisão; o formato hierárquico ficou fora pela B220 e capacidade/peso por decisão do design).
> **Spec original:** seções 3, 11
> **Última atualização:**  2026-09-30 (**Etapa 56** — etiqueta de localização (QR que abre o endereço no Mapa, com aviso de etiqueta desatualizada) e confirmação opcional do endereço lido na movimentação, com o código conferido gravado no livro; antes: **Etapa 55** — o próximo código de localização vem do servidor, conta as inativas e não colide; o assistente não reativa localização desativada; o PUT sem `ativo` preserva; antes: **Etapa 54** — o motor recusa o endereço informado inativo ou inexistente, não se desativa endereço que é padrão de material ativo e o cadastro não aceita padrão inativa; antes: **Etapa 53** — a sugestão de localização na entrada, e o aviso de padrão que não recebe o material; antes: **Etapa 52** — a tela de localizações vazias pela regra do mapa, e a recusa de apagar/desativar endereço ocupado; antes: **Etapa 51** — a saída passa a baixar o endereço de onde o material sai; três afirmações desta spec corrigidas à vista em "O que já existe"). Anterior: 2026-08-11 (auditoria spec×código: corrigido o alcance real da validação de tipo permitido e da preservação de campos no PUT; áreas especiais reclassificadas como parcial)
> **📋 Plano de implementação:** [docs/superpowers/plans/2026-08-04-almoxarifado-etapa2-cadastros.md](../../../docs/superpowers/plans/2026-08-04-almoxarifado-etapa2-cadastros.md) — Tasks 1, 2, 5, 7 · Design: [docs/superpowers/specs/2026-08-04-almoxarifado-etapa2-cadastros-design.md](../../../docs/superpowers/specs/2026-08-04-almoxarifado-etapa2-cadastros-design.md)

## Objetivo

Múltiplos almoxarifados, endereçamento padrão (ALM-CORREDOR-ESTRUTURA-NÍVEL-POSIÇÃO), restrições de armazenagem e operações de endereço.

## O que já existe

- `localizacoes_almoxarifado` hierárquica (`parent_id`) com posições 2D para o mapa (`schema.js:155,330-336`), 13 tipos em `TIPOS_LOCALIZACAO`.
- `setores_almoxarifado` (área/corredor/bancada, prefixo de código).
- CRUD localizações (rotas de `/localizacoes` em `routes/almoxarifado.js`, valida subgrupo duplicado) e setores (rotas de `/setores` no mesmo arquivo).
- Mapa 2D drag-and-drop: `MapaLocalizacoesAlmoxarifado.js` (786 L) + rotas do mapa em `extended.js` — mostra ocupação e reservas; ganhou filtro por almoxarifado e badge 🔒 de localização bloqueada na Etapa 2.
  - ⚠️ **Correção (Etapa 51): esta linha dizia que o mapa "mostra ocupação e reservas"; estava errado desde a Etapa 6** — as reservas saíram do SQL do mapa (`stockService.js`, comentário antes de `MAPA_LOCALIZACOES_SQL`). O mapa mostra **ocupação** (linhas de saldo com `quantidade > 0`, e o físico do material no endereço padrão quando ele não tem linha endereçada positiva).

- Saldo por localização já suportado no motor: `estoque_saldo_almoxarifado` (material+localização+lote).
  - ⚠️ **Correção (Etapa 51): "já suportado" era ENGANOSO.** A tabela existia, mas a saída sem lote e sem origem declarada — a **entrega de requisição**, o fluxo principal — não baixava o endereço de onde o material saía: debitava uma linha só (a padrão ou a sem endereço), sem guarda. Medido na Fase 0 da Etapa 51: entrada de 100 em A e entrega de 100 deixavam **A:100** com o físico em 0 — o endereço vazio aparecia **ocupado** no mapa. **A Etapa 51 (`606f1d0` + Fase 5 `5fdc68a`) corrigiu para o material SEM lote** — ver "Entregue na Etapa 51" abaixo. Material **com** lote continua com a limitação (a entrega não escolhe lote — B204).

- `localizacao_padrao_id` no material.
- Etapa 2 (2026-08-04): tabela `almoxarifados` (`schema.js:459`) + `localizacoes_almoxarifado.almoxarifado_id/bloqueada/tipos_material_permitidos` (via `safeAlter`); migração ledger cria "ALM-GERAL" e vincula todas as localizações pré-existentes exatamente uma vez; CRUD `/api/almoxarifado/almoxarifados` (`requirePermission('configurar')` + Zod); `GET /localizacoes` com filtro `?almoxarifado_id=` e campo computado `endereco_completo`; `GET /localizacoes/vazias` e `GET /relatorios/materiais-sem-endereco`; restrições aplicadas dentro de `stockService.registrarMovimentacao` via `validarLocalizacaoParaMovimento` (bloqueio nos quatro papéis; tipo permitido só no destino — ver correção no checklist); DELETE de localização com saldo (inclusive net-zero entre lotes) → 400. **Correção 2026-08-11:** esta spec afirmava que o PUT de localização preserva `almoxarifado_id`/`bloqueada`/`tipos_material_permitidos` quando omitidos do payload; o código preserva **só** `almoxarifado_id` (via `COALESCE`), de propósito — o comentário no próprio `routes/almoxarifado.js` explica que `bloqueada`/`tipos_material_permitidos` precisam poder ser limpos com valor explícito. Testes: `almoxarifados.api.test.js`, `restricoesEndereco.api.test.js`, `enderecamento.api.test.js`.

## Decisão tomada (2026-08-04)

**Multi-almoxarifado = entidade nova como raiz.** Tabela `almoxarifados` (`codigo` UNIQUE, `nome`, `descricao`, `ativo`). Localizações ganharam `almoxarifado_id`. Migração de dados via ledger `schema_migrations_almoxarifado` (primeiro uso real do padrão, fecha o item 0.4 da fundação): cria "ALM-GERAL / Almoxarifado Geral" e vincula todas as localizações existentes. Inativar um almoxarifado com localizações ativas vinculadas → 400.

## Checklist

### Backend
- [x] Decidir e implementar multi-almoxarifado (ver decisão acima)
- [ ] Áreas especiais (quarentena, expedição, sucata, devoluções, em-terceiros) como localizações tipadas — **parcial** (reclassificado na auditoria 2026-08-11): `TIPOS_LOCALIZACAO` no `schema.js` já inclui 'Área de expedição', 'Área de quarentena/inspeção' e 'Área de materiais do cliente' (tipos pré-existentes); faltam sucata/devoluções/em-terceiros e, principalmente, nenhuma semântica está atrelada aos tipos — hoje são só rótulos
- [ ] Código de endereço padrão gerado a partir da hierarquia (ex.: `ALM-GERAL-A03-E02-N04-P01`) — **não entregue**; o que existe é `endereco_completo`, um campo computado só para exibição no `GET /localizacoes` (caminho hierárquico "ALM-GERAL / Corredor A / A-01"), não um código compacto gerado/persistido. ⚠️ **Correção (fechamento da Etapa 54): "não entregue" estava parcialmente errado.** Existe um gerador **no cliente**: o assistente de nova localização (`ConfiguracoesAlmoxarifado.js`, `generateNextCodigo`) propõe `PREFIXO-NN` (prefixo do setor ou do código do pai + próximo número entre os irmãos), e esse código é gravado. O que **não** existe: o formato hierárquico da spec, e a regra no servidor (ele aceita qualquer `codigo` único). É a **Etapa 55** — ver o plano da Etapa 54. **Etapa 55 — entregue PARCIALMENTE, e por isso continua `[ ]`:** o gerador foi para o **servidor** (`GET /localizacoes/proximo-codigo`, `77e51a5`) no **mesmo** formato `PREFIXO-NN`, contando as inativas e sem colidir com código nenhum; o formato **hierárquico** (`ALM-GERAL-A03-...`) ficou fora **por decisão** (**B220** — trocaria código de etiqueta impressa e de integração). O servidor continua **aceitando** qualquer código único digitado (a regra é a proposta, não uma imposição)
- [x] Restrições da posição: tipo de material permitido (`tipos_material_permitidos`) → validação na movimentação. **Correção 2026-08-11:** este item afirmava validação em "origem/destino/transferência/ajuste"; em `stockService.validarLocalizacaoParaMovimento` o tipo permitido só é avaliado quando `papel === 'destino'` (restringir por tipo é "o que pode entrar aqui", não "o que pode sair") — na origem a única guarda é `bloqueada`. O bloqueio, esse sim, vale nos quatro papéis
- [ ] Capacidade, peso máximo, dimensões como enforcement na movimentação — **fora de escopo por decisão do design** (item 3: "informativo apenas — adiado")
- [x] Bloquear/liberar endereço (`bloqueada` + validação em movimentação — origem OU destino OU transferência OU ajuste de localização); estorno **não** valida restrições (decisão deliberada — reverte mesmo se a localização foi bloqueada depois do movimento original)
- [x] Consultas: posições vazias (`GET /localizacoes/vazias`), materiais sem endereço (`GET /relatorios/materiais-sem-endereco`) — ocupação continua só parcial no mapa (pré-existente)
- [x] Sugestão de localização na entrada (usa `localizacao_padrao_id` + restrições + espaço) — **Etapa 53** (`adce812` + fix-round): padrão, onde o material já está e vazias compatíveis, pela mesma regra do motor. **"Espaço" não entra** (capacidade é informativa por decisão do design). Esta linha dizia "hoje existe só o fallback `resolveLocalizacaoEntrada`" — era verdade até a 53; o fallback continua sendo o que a entrada SEM destino usa.
- [x] Confirmação de localização por leitura — **Etapa 56** (`75cbea1` motor, `298ffd9` tela, fix-round 22e00aa): `codigo_lido_origem`/`codigo_lido_destino` na movimentação, conferidos contra a localização efetiva antes de qualquer efeito e gravados no livro; etiqueta de localização com QR (não existia — a etiqueta era pré-requisito). **Escopo: OPCIONAL** (**B223**) — tornar obrigatória é decisão do P.O. A API recebe o **código**; o `codigo_lido` que esta linha previa virou dois campos, um por papel.

### Frontend
- [x] Cadastro/gestão de almoxarifados — aba "Setores e Áreas" em `ConfiguracoesAlmoxarifado.js` (`AlmoxarifadosSection`)
- [x] Tela de consulta de ocupação/vazias/sem endereço — **Etapa 52** (`8e1d46d`): **vazias** em Relatórios → Estoque → *Localizações vazias* (chave `localizacoes-vazias`), pela regra do mapa; **sem endereço** já tinha tela (Relatórios → Estoque → *Materiais sem endereço*); **ocupação** é o Mapa de Áreas. ⚠️ Esta linha dizia "sem consumidor no front" também para *sem endereço* — já tinha (chave do registro de relatórios, tela dirigida pela lista do servidor).
- [x] Bloqueio de endereço no mapa — badge 🔒 em `MapaLocalizacoesAlmoxarifado.js`; filtro por almoxarifado também adicionado
- [x] Campos de restrição (`bloqueada`, `tipos_material_permitidos`) na edição de localização em `ConfiguracoesAlmoxarifado.js`

## Regras essenciais + testes de API exigidos

| Regra | Teste |
|-------|-------|
| Material com restrição não entra em posição incompatível | `restricoesEndereco.api.test.js`: "destino com tipos_material_permitidos restringe por tipo_material do material" |
| Endereço bloqueado não recebe nem fornece material (origem, destino, transferência, ajuste) | `restricoesEndereco.api.test.js`: "ENTRADA para localização bloqueada retorna 400", "SAIDA com origem bloqueada retorna 400", "TRANSFERENCIA com destino bloqueado retorna 400", "AJUSTE com localizacao_destino_id bloqueada retorna 400" |
| Endereço com material não pode ser excluído (inclusive saldo net-zero entre lotes) | `restricoesEndereco.api.test.js`: "DELETE localizacao com saldo retorna 400", "DELETE localizacao bloqueia mesmo quando SUM(quantidade) das linhas dá zero" |
| Migração vincula localizações existentes ao ALM-GERAL exatamente uma vez | `almoxarifados.api.test.js`: "migracao criou o Almoxarifado Geral e vinculou localizacoes existentes" |
| Endereço **inativo** não recebe material informado como destino; endereço **inexistente** não é aceito em papel nenhum que o tipo use; origem inativa é aceita; ajuste em inativa só reduz ou zera; localização que é padrão de material ativo não é desativada; cadastro não aceita padrão inativa (**Etapa 54**) | `localizacaoInativaMotor.api.test.js` (15 cenários) |
| Próximo código de localização: mesmo formato `PREFIXO-NN`, conta as inativas, nunca colide; o assistente não reativa inativa (409); PUT com código de outra → 400; PUT sem `ativo` preserva | `localizacaoProximoCodigo.api.test.js` (12 cenários) e `client/.../LocalizacaoProximoCodigo.test.js` (8) |
| Endereço **lido** confere com a localização efetiva do papel (destino: informada ou padrão na entrada; transferência/ajuste: só a informada; origem: só a informada, com saldo nela que cubra — inclusive sob concorrência); recusa antes de qualquer efeito; o código conferido vai para o livro | `confirmacaoLeituraLocalizacao.api.test.js` (11 cenários) e, no cliente, `codigoLido.test.js`, `MovimentacoesConfirmacaoLeitura.test.js`, `MapaEtiquetaLocalizacao.test.js`, `LocalizacaoEtiqueta.test.js`, `etiquetasPdf.test.js` |

## Dependências

- Motor de estoque (03) — as validações rodam dentro da movimentação v2.

## Entregue na Etapa 2 (2026-08-04)

Plano completo em [docs/superpowers/plans/2026-08-04-almoxarifado-etapa2-cadastros.md](../../../docs/superpowers/plans/2026-08-04-almoxarifado-etapa2-cadastros.md) (Tasks 1, 2, 5, 7 desta feature; Tasks 3, 4, 6 em `01-cadastros-materiais`). Principais arquivos:

- Backend: `server/services/almoxarifado/schema.js` (tabela `almoxarifados`, colunas `almoxarifado_id`/`bloqueada`/`tipos_material_permitidos` em `localizacoes_almoxarifado`, migração ledger do ALM-GERAL), `server/services/almoxarifado/schemas.js` (`AlmoxarifadoSchema`), `server/services/almoxarifado/stockService.js` (`validarLocalizacaoParaMovimento` no motor), `server/routes/almoxarifado/extended.js` (CRUD `/almoxarifados`), `server/routes/almoxarifado.js` (`GET /localizacoes` com `endereco_completo` e filtro `?almoxarifado_id=`, `GET /localizacoes/vazias`, `GET /relatorios/materiais-sem-endereco`, DELETE de localização bloqueado por saldo). ⚠️ **Correção (Etapa 51): `GET /localizacoes/vazias` NÃO está em `routes/almoxarifado.js` — está em `routes/almoxarifado/extended.js` (medido: `:2115`); e `materiais-sem-endereco` hoje é uma chave do registro de relatórios (`/relatorios/:tipo`).** A mesma afirmação vale para o item da Etapa 2 em "O que já existe" (`GET /localizacoes/vazias` citado junto das rotas de `routes/almoxarifado.js`).
- Frontend: `client/src/components/almoxarifado/ConfiguracoesAlmoxarifado.js` (gestão de almoxarifados, campos de restrição na edição de localização), `client/src/components/almoxarifado/MapaLocalizacoesAlmoxarifado.js` (filtro por almoxarifado, badge 🔒).
- Testes: `server/tests/api/almoxarifados.api.test.js`, `server/tests/api/restricoesEndereco.api.test.js`, `server/tests/api/enderecamento.api.test.js`; regressão em `test:api`, `test:almoxarifado`, `test:validation`, `test:safealter`.
- Não entregue nesta etapa: código de endereço compacto gerado, capacidade/peso/dimensões como enforcement, áreas especiais como localizações tipadas, sugestão de localização na entrada, confirmação por leitura, tela de consulta de vazias/sem-endereço.

## Entregue na Etapa 51 (2026-09-30) — a saída baixa o endereço de onde o material sai

Commits: `ab6260e` (Fase 0-1), `9f92af8` (Fase 2), `606f1d0` (motor, T1–T4), (Fase 5 `5fdc68a`).
Desenho: [docs/superpowers/specs/2026-09-30-almoxarifado-etapa51-saida-por-localizacao-design.md](../../../docs/superpowers/specs/2026-09-30-almoxarifado-etapa51-saida-por-localizacao-design.md).

**Por que esta etapa existe:** a próxima tarefa da Etapa 50 era dar tela às "localizações vazias". A Fase 0
**mediu antes de prometer** e achou que a tela mentiria: a entrega de requisição não informa endereço, e a
saída sem lote debitava uma linha só (a padrão ou a sem endereço). O endereço de onde o material saiu
continuava com o saldo antigo — "ocupado" no mapa com o físico zerado. A tela de vazias ficou para a 52.

- [x] **RN-01/02 — saída sem lote drena os endereços com saldo** (`claimSaldoSemLote`): a localização resolvida
  (origem declarada ou padrão) primeiro, depois as de maior saldo; só o resto vai para a linha da localização
  resolvida (sem endereço, se não houver), que pode ficar negativa — o "sem localização atribuída". Relê a linha
  quando o débito condicional não casa (a cópia do claim de lote recriava o fantasma na concorrência) — `606f1d0`
- [x] **RN-03 — AJUSTE de saldo total sem endereço, para baixo, drena os endereços antes de negativar** — `606f1d0`
- [x] **RN-04 — AJUSTE com endereço que deixaria o físico negativo** (material que não permite) **absorve** primeiro
  as linhas sem lote negativas; só recusa se não bastar: *"Ajuste deixaria o saldo do material negativo (<valor>).
  O material não permite saldo negativo."* — `606f1d0`
- [x] **Estorno de ENTRADA** depois de saída que drenou o endereço dela: debita como saída (Fase 5) — (Fase 5 `5fdc68a`)
- [x] **Estorno de AJUSTE com endereço** que deixaria o físico negativo: **recusa**, *"Não é possível estornar: o
  saldo já foi consumido (o estorno deixaria o material negativo)"* (Fase 5) — (Fase 5 `5fdc68a`)
- [ ] **Material COM lote** — **não consertado**: a entrega não escolhe lote (B204), e a saída sem lote não toca linha
  de lote. Declarado nas novidades (letra C).
- [x] **Tela de vazias** — **Etapa 52** (`8e1d46d`), ver a seção abaixo.

Testes: `saidaPorLocalizacao.api.test.js` **24/24** (os 8 cenários da sonda da Fase 0, os da Fase 2 e os 11 da
Fase 5, incluindo a corrida de duas saídas e o ledger falhando). Controle positivo: 5 sabotagens no motor + 12 no
fix-round, todas vermelhas (a do filtro de lote da absorção ficou verde na primeira versão do teste e exigiu o
cenário 19b).

## Entregue na Etapa 52 (2026-09-30) — a lista de localizações vazias, e o endereço ocupado que não pode ser apagado

**Por que:** a rota `GET /localizacoes/vazias` existia sem consumidor e decidia "vazia" com uma régua **mais pobre**
que a do mapa (sem o fallback do legado): o S8 da Fase 0 da Etapa 51 mediu o mapa com `LEG = 40` e a lista dando
LEG como vazia. A Fase 2 achou uma **terceira** régua: o `DELETE` de localização olhava só `quantidade != 0` e
apagava localização ocupada **só pelo legado** — o material sumia de todas as telas.

- [x] **Regra única de ocupação** — `stockService.OCUPACAO_SQL`, extraída literalmente do `MAPA_LOCALIZACOES_SQL`
  (o mapa não mudou: texto e resultado idênticos, medidos com 21, 508 e 3008 localizações) — `8e1d46d`
- [x] **`listarLocalizacoesVazias`** — ativas fora de `OCUPACAO_SQL`, com `endereco_completo` montado no SQL e
  `sub_ocupadas` (filhas ativas ocupadas); a rota `/localizacoes/vazias` usa o helper (continua só `auth`, como o
  mapa — **B210**) — `8e1d46d`
- [x] **Chave `localizacoes-vazias`** no registro de relatórios (Estoque, `acao: null`, exportável, nota com o C72) —
  `8e1d46d`
- [x] **DELETE e PUT-que-desativa** recusam localização **ocupada** pela mesma régua: *"Localização ocupada: há
  material nela (N item(ns)). Transfira o saldo antes de apagar ou desativar."* (a recusa antiga *"Não é possível
  remover: localização possui saldo"* continua antes dela) — `8e1d46d`; a guarda só vale para localização **ativa**
  (a já apagada responde `ja_inativo`) e o PUT grava `ativo` como 0/1 (`ativo: 2` gravava 2 e sumia com a
  localização do mapa) — (Fase 5 `44138a0`)
- [ ] **Hierarquia** — o pai sem saldo próprio aparece vazio (a coluna diz as filhas ocupadas) e pode ser apagado
  com filhas ocupadas. Declarado (**B211**, **D (52)**).
- [ ] **Material com lote** — continua podendo aparecer ocupado depois da entrega (**C72**, na nota do relatório).

Testes: `localizacoesVazias.api.test.js` **17/17** — em cada cenário, "na lista ⇔ `qtd_itens == 0` no mapa" para
todas as localizações ativas. Controle positivo: 6 sabotagens no código + 8 no fix-round, todas vermelhas (a do
"setor em branco" ficou verde enquanto o próprio teste gravava o setor em branco como NULL — teste vazio, corrigido).

## Entregue na Etapa 53 (2026-09-30) — a sugestão de localização na entrada

**Por que:** a próxima tarefa da 52. A entrada só resolvia o destino por `resolveLocalizacaoEntrada` (informado ||
padrão || null), e a tela listava todos os endereços sem indicação. Plano:
`docs/superpowers/plans/2026-09-30-almoxarifado-etapa53-sugestao-localizacao.md`.

- [x] **Regra de endereço numa função só** — `motivoRecusaEndereco(loc, material, papel)` (pura, `stockService`), com as
  **mesmas literais** de antes; o motor a chama nos dois papéis (origem e destino) e a sugestão também — `adce812`
- [x] **`GET /api/almoxarifado/materiais/:id/sugestao-localizacao`** (só `auth`, **B216**) →
  `{ padrao: { localizacao_id, codigo, recusa, inativa } | null, sugestoes: [{ localizacao_id, codigo,
  endereco_completo, motivo, quantidade_no_endereco }] }`, sem repetição, na ordem `PADRAO` →
  `JA_TEM_O_MATERIAL` (maiores primeiro, até 10) → `VAZIA_COMPATIVEL` (régua da 52, até 5, do almoxarifado da
  padrão primeiro). 404 *"Material não encontrado"*; 400 *"Material inativo não pode ser movimentado"* — `adce812`
- [x] **`padrao.recusa`** com a literal do motor quando a padrão está bloqueada ou não aceita o tipo (a entrada sem
  destino seria recusada com essa mesma frase) — `adce812`
- [x] **Só endereço sugerível nos três caminhos:** ativo, de almoxarifado ativo, sem filho ativo (contêiner não é
  vaga) e aceito pela regra — `adce812`; o filtro de "pai" valia só para as vazias e passou a valer para padrão e
  "já tem" — 3d8680c
- [x] **`padrao.inativa`** (padrão inativa ou de almoxarifado inativo) e o aviso da tela — 3d8680c
- [x] **Endereço com saldo negativo do material não é "vazia"**; ordenação por almoxarifado só quando há padrão;
  quantidade do JOIN (sem N+1) — 3d8680c
- [x] **Tela** (`MovimentacoesAlmoxarifado.js`): na ENTRADA com material, até 3 botões (*"· padrão do material"*,
  *"· já tem este material (N)"*, *"· vazia"*); nada preenche sozinho (**B213**, **B214**); os avisos
  `aviso-padrao-recusada` e `aviso-padrao-inativa` só com o destino vazio; trocar de material zera a sugestão na hora
  e limpa **só** o destino que veio de sugestão; guarda `cancelado` contra resposta atrasada — `adce812` + 3d8680c
- [ ] **Recebimento** — a tela não tem campo de endereço; fora (**D (53)**).
- [ ] **Capacidade/peso** — fora por decisão do design da 02 (o item do checklist acima).
- [ ] **Recusar entrada em localização inativa/inexistente no MOTOR** — não é desta etapa: mudaria o que a gravação
  aceita (**B215**). É a **Etapa 54** (**C73**). → **Feito na Etapa 54** (`c757276`) — ver a seção abaixo; o
  endereço **informado**, não a padrão (**B217**).

**O desenho estava errado em dois pontos, e fica dito:** (1) a RN-04 dizia que *"a entrada sem destino continua indo
para a padrão, como hoje"* — a Fase 2 provou pelo motor que a padrão bloqueada ou que não aceita o tipo **recusa** a
entrada sem destino; (2) a literal de material inativo foi escrita como *"Material inativo não recebe entrada"* — a
real, medida, é *"Material inativo não pode ser movimentado"*.

Testes: `sugestaoLocalizacao.api.test.js` **15/15** — inclusive a invariante "toda sugestão (lista **não** vazia) é
aceita numa ENTRADA real" e os negativos explícitos (bloqueada, tipo, inativa, pai, almoxarifado inativo, saldo
negativo). Client: bloco "Etapa 53" de `MovimentacoesAlmoxarifado.test.js`, **8** cenários. Controle positivo: 8 + 5
sabotagens na implementação, 7 + 4 no fix-round — todas vermelhas no cenário certo. **O limite de 10 do "já tem" não
tem teste** (declarado em **D (53)**).

## Entregue na Etapa 54 (2026-09-30) — o motor recusa o endereço informado inativo ou inexistente

Fecha o **C73**. Plano: [docs/superpowers/plans/2026-09-30-almoxarifado-etapa54-motor-recusa-localizacao-inativa.md](../../../docs/superpowers/plans/2026-09-30-almoxarifado-etapa54-motor-recusa-localizacao-inativa.md).

- [x] **RN-01** — destino **informado** inativo recusado em toda a família de ENTRADA (inclusive `AJUSTE_POSITIVO`) e
  no destino da TRANSFERENCIA: *"Localização ⟨código⟩ está inativa"* (`validarEnderecoExplicito`, antes de qualquer
  efeito) — `c757276`
- [x] **RN-02** — localização **informada** inexistente recusada: *"Localização de destino não encontrada"* /
  *"Localização de origem não encontrada"* — `c757276`; id **0** é "não informado" — 30707de
- [x] **RN-03** — AJUSTE / AJUSTE_INVENTARIO numa inativa só reduz ou zera: *"Localização ⟨código⟩ está inativa — o
  ajuste só pode reduzir ou zerar o saldo dela"* — `c757276`; teto `max(atual, 0)` para a linha negativa não ficar
  presa — 30707de
- [x] **RN-04** — origem inativa aceita (esvaziar o endereço desativado); `PUT` que desativa e `DELETE` de
  localização ativa que é padrão de material ativo: *"Localização é a padrão de ⟨N⟩ material(is) ativo(s) (⟨até 5
  códigos⟩[, …]). Troque a localização padrão deles antes de apagar ou desativar."* — `c757276`
- [x] **RN-05** — cadastro de material (POST sempre; PUT só quando a padrão muda): *"Localização padrão não
  encontrada"* / *"Localização padrão ⟨código⟩ está inativa"* — `c757276`
- [x] **RN-06** — estorno continua sem checar endereço (decisão da Etapa 2) — `c757276` (cenário de teste)
- [x] Recebimento pré-valida o destino informado **uma vez** (*"Nao foi possivel dar entrada no estoque: ⟨motivo⟩"*)
  — `c757276`, movido para fora do laço de itens — 30707de; retalho pré-valida antes
  da perna 1 (a baixa) — `c757276`
- [ ] **Padrão inativa na entrada SEM destino** — **não recusada, por decisão** (**B217**/**B218**): recusar travaria
  o processamento de nota, a exclusão de requisição e o retorno de terceiros, que não têm campo de destino. É impedida
  na origem (RN-04/RN-05); o legado se mede na **A29**.
- [ ] **Almoxarifado inativo** — não recusado pelo motor (**D (54)**).
- [ ] **Endereço em campo que o tipo não usa** (ex.: origem numa ENTRADA pela integração) — não validado, vai ao
  livro como veio (**C74**).

**O plano estava errado em dois pontos, e fica dito:** (1) a 1ª versão recusava a padrão inativa no motor — a Fase 2
mostrou que travaria três fluxos sem campo de destino (**B217**); (2) a Fase 0 dizia que a padrão podia apontar para
localização **apagada** — o DELETE de localização é *soft* (`ativo = 0`), não há DELETE físico; id inexistente só vem
de integração ou legado. E a RN-02 dizia *"em qualquer papel e tipo"* — **exagerado**: é validado o campo de
localização que o tipo **usa** (**C74**).

Testes: `localizacaoInativaMotor.api.test.js` **15/15** (13 da implementação + 2 do fix-round: linha negativa e id 0),
toda recusa com a metade positiva no mesmo cenário; `sugestaoLocalizacao.api.test.js` 15/15 (a fixture que dava
entrada em localização já inativa passou a semear ativa e desativar depois). Controle positivo: 19 sabotagens na
implementação + 4 no fix-round, todas vermelhas no cenário certo.

## Entregue na Etapa 55 (2026-09-30) — o próximo código de localização vem do servidor, e conta as inativas

Plano: [docs/superpowers/plans/2026-09-30-almoxarifado-etapa55-codigo-localizacao-servidor.md](../../../docs/superpowers/plans/2026-09-30-almoxarifado-etapa55-codigo-localizacao-servidor.md).

**Medido por sonda antes de desenhar:** o gerador era só da tela e recebia só as ativas. Criar com o código proposto,
quando ele era de uma localização **desativada**, fazia o `POST` **reativá-la** (Etapa 19) — a "nova" herdava histórico
e saldo; no **Mover**, o mesmo código estourava o `UNIQUE` com **500** cru (*"SQLITE_CONSTRAINT: UNIQUE constraint
failed: localizacoes_almoxarifado.codigo"*). **O plano da Etapa 54 dizia que "o UNIQUE recusa a criação" — estava
errado quanto ao caminho**: a criação reativa; quem estoura é o Mover.

- [x] **RN-01** — `GET /api/almoxarifado/localizacoes/proximo-codigo?setor=&parent_id=&excluir_id=` → `{ codigo }`
  (`services/almoxarifado/localizacaoCodigo.js`): mesmo prefixo e formato da tela; o maior número conta as irmãs
  **inativas**; a proposta sobe até um código livre na tabela **inteira**; `excluir_id` sai da conta e da colisão;
  pai inexistente → *"Localização pai não encontrada"*, pai inativo → *"Localização pai ⟨código⟩ está inativa"* —
  `77e51a5`; parâmetro repetido (`?setor=a&setor=b`) vale o primeiro, em vez de 500 — 3ac650e
- [x] **RN-02** — `PUT` com código de outra localização → 400 *"Código já existe"* / *"Código já existe (localização
  desativada)"*; sem código → *"Código obrigatório"* — `77e51a5`
- [x] **RN-03** — `PUT` sem `ativo` **preserva** o valor gravado (fecha o **C74 (3)**) — `77e51a5`. Completa a nota da
  Etapa 2 em "O que já existe": além de `almoxarifado_id`, agora `ativo` também é preservado quando omitido.
- [x] **RN-04** — a tela (assistente e Mover) usa a rota; cai no gerador local se a rota falhar — `77e51a5`; os códigos
  que o servidor recusou na sessão entram no gerador local, para ele não repropor o mesmo — 3ac650e
- [x] **RN-05** — o assistente manda `somente_novo: true`: código de inativa → 409 *"O código ⟨código⟩ pertence a uma
  localização desativada — gere outro código"*, e a tela busca outro — `77e51a5`
- [ ] **Formato hierárquico** (`ALM-GERAL-A03-E02-N04-P01`) — **fora por decisão** (**B220**).
- [ ] **Código digitado à mão de uma inativa** continua reativando (Etapa 19) — **por decisão** (**B221**).
- [ ] **Mover sempre renumera** a localização movida — pré-existente, declarado (**C75**).
- [ ] Detalhes de tela/integração declarados na Fase 5 (mensagem do 409 que fica na tela, código em branco em dois
  pontos durante a carga, 400 não relacionado refaz a busca, `ativo` legado NULL/2 preservado, PUT sem código em id
  inexistente → 400, `parent_id` não numérico cai na raiz) — **D (55)**.

Testes: `localizacaoProximoCodigo.api.test.js` **12/12** (10 da implementação + 2 do fix-round), 11 + 2 sabotagens
vermelhas — **3 ficaram verdes de início** (contar só ativas, filhas só ativas, setor só `''`): o laço de colisão
global compensava a base errada quando o próximo número era exatamente o ocupado; os cenários ganharam **buraco na
numeração** (inativa `SON-05` → `SON-06`; `FP-09` → `FP-10`; `LOC-07` com setor NULL → `LOC-08`).
`LocalizacaoProximoCodigo.test.js` (cliente) **8/8**, 8 + 1 sabotagens vermelhas.

## Entregue na Etapa 56 (2026-09-30) — etiqueta de localização e confirmação do endereço por leitura

Plano: [docs/superpowers/plans/2026-09-30-almoxarifado-etapa56-confirmacao-leitura-localizacao.md](../../../docs/superpowers/plans/2026-09-30-almoxarifado-etapa56-confirmacao-leitura-localizacao.md).

**Medido antes de desenhar:** não existia etiqueta de localização (só de material, lote, série, sobra e recebimento);
o scanner da Etapa 15 é 100% cliente (ler = navegar, `parseQrDestino`); o Mapa já selecionava por `?loc=<id>`;
`codigo_lido` não existia em lugar nenhum. **Esta linha do checklist dizia "depende de código de barras — Etapa 15";
estava incompleta**: dependia também de uma etiqueta **de endereço**, que ninguém tinha feito.

- [x] **RN-01 (etiqueta)** — `montarEtiquetaLocalizacao` (`client/src/utils/etiquetasPdf.js`): QR
  `<origin>/almoxarifado/mapa?loc=<id>&codigo=<encodeURIComponent(codigo)>`; botões **Etiqueta** (por linha) e
  **Etiquetas (N)** em Configurações → Localizações — `298ffd9`
- [x] **Mapa** — *"Etiqueta desatualizada: ⟨impresso⟩ → ⟨atual⟩. Reimprima."* quando o código da etiqueta não é o
  atual; *"Localização não encontrada ou inativa"* quando o `loc` não está no mapa (não afirma isso se a carga falhou)
  — `298ffd9`; o aviso é da localização **da etiqueta** (fechar a seleção o tira) — 22e00aa
- [x] **RN-02 (motor)** — `codigo_lido_origem`/`codigo_lido_destino`: texto até 100 caracteres (senão *"Endereço lido
  inválido"*, validado no motor porque `/transferencias` passa o body cru); confere sem diferenciar maiúsculas contra
  a localização efetiva; *"Endereço lido (⟨lido⟩) não confere com a localização de ⟨papel⟩ (⟨código⟩) — se a etiqueta é
  antiga, reimprima"*; *"Endereço lido (⟨lido⟩), mas o movimento não tem localização de ⟨papel⟩"*; origem exige
  `localizacao_origem_id` (*"Para confirmar a origem pela leitura, informe a localização de origem"*) e saldo nela
  (do lote, quando houver) que cubra (*"O saldo em ⟨código⟩ (⟨saldo⟩) não cobre a quantidade (⟨q⟩) — a saída tiraria de
  outros endereços"*); colunas `codigo_lido_origem`/`codigo_lido_destino` no livro — `75cbea1`
- [x] **Concorrência** (Fase 5, reproduzida por sonda: duas saídas de 10 conferidas em A com A:10 e B:50 davam as duas
  201 e a segunda drenava B gravando A) — confere **depois** do claim que todas as linhas debitadas são da origem;
  senão *"O saldo em ⟨código⟩ mudou durante a saída e não cobre mais a quantidade — confira e tente de novo"* e o catch
  amplo compensa — 22e00aa
- [x] **Transferência** com origem lida e saldo curto fica com a mensagem dela (*"Saldo insuficiente na localização de
  origem"*), não a de "outros endereços" — 22e00aa
- [x] **RN-03/04 (tela)** — campo **Confirmar endereço lido** em Movimentações, na mesma regra dos selects (destino:
  entradas e transferência; origem: saídas e transferência); `extrairCodigoLido` aceita o código puro ou a URL
  http(s) da etiqueta (extrai `codigo`), e texto estragado vai cru; o Enter do leitor não envia o formulário — `298ffd9`
- [ ] **Obrigatória** — não: **opcional por decisão** (**B223**).
- [ ] **Ajuste na tela** — o modal não mostra localização no ajuste, então não ganhou o campo; o motor aceita (**D (56)**).
- [ ] **Série** não é presa ao endereço conferido — pré-existente, declarado (**C76**).
- [ ] **A etiqueta confere pelo código, não pelo id** — declarado (**C77**); o Mapa pega pelo id, a movimentação não.

Testes: `confirmacaoLeituraLocalizacao.api.test.js` **11/11** (8 da implementação + 3 do fix-round; o cenário
concorrente estável em 3 rodadas), 10 + 3 sabotagens vermelhas. Cliente: `etiquetasPdf.test.js` +2 (código
`A&B#1+2`), `codigoLido.test.js` 6, `MapaEtiquetaLocalizacao.test.js` 7, `MovimentacoesConfirmacaoLeitura.test.js`
13, `LocalizacaoEtiqueta.test.js` 3 — 17 sabotagens na tela, 16 vermelhas; a 17ª (o filtro por tipo na montagem do
POST) é inalcançável pela tela, que já limpa o campo na troca de tipo — fica como segunda barreira, declarada.
