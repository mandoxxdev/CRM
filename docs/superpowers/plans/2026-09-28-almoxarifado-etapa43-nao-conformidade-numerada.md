# Plano — Etapa 43: a divergência vira documento numerado (features 08 + 09)

> Design: `docs/superpowers/specs/2026-09-28-almoxarifado-etapa43-nao-conformidade-numerada-design.md`
> Branch: `desenvolvimento-almoxarifado`. Base: `cac5863` (fim da Etapa 42).
> **Baseline MEDIDO em 2026-09-28, antes de escrever uma linha:** `test:api` **199/199 arquivos**;
> cliente **51 suítes / 786 testes**; `ALERT_REGISTRY` com **13** entradas (contadas).

## ⚠️ Este plano foi REESCRITO pela Fase 2

Um revisor fresco leu a primeira versão e devolveu **20 achados, 4 BLOQUEANTES**, todos com
arquivo:linha e cenário. Os quatro estão consertados abaixo e registrados no design, à vista:

1. **O gancho só na conferência** — `salvarDadosFiscal` é o outro escritor de `quantidade_recebida`
   e **é o que a UI usa**. A feature nasceria invisível em produção. → três ganchos (D4).
2. **A RN-07 derruba dois testes e APAGA uma medição** — `medidasInspecao.api.test.js:454` e
   `inspecaoHistorico.api.test.js:287`; e o padrão `1/0/0` que pega cruzamento de coluna só era
   produzível pelo payload. → T3 conserta os dois fabricando divergência real (D3).
3. **A exclusão do D6 na função compartilhada** derrubaria quatro testes e silenciaria o cenário
   **A1**, que existe para garantir que "errar de novo, pior, avisa de novo" (o bug que a Etapa 17
   pagou). → a exclusão entra só no `listar` da entrada do alerta (D6).
4. **T5 não tinha como preencher a caixa somente-leitura** — `listarInspecoesPendentes` não devolve
   as quantidades e calcular no client está vetado pela B60. → T3 devolve a flag já derivada (D3).

E mais oito decisões que estavam **em branco** e um agente de galho teria inventado sozinho:
prioridade do `tipo` (D9), guarda de reabertura (RN-10), guarda de status (RN-11/D10), três
rótulos de auditoria (RN-09), `permissaoErro.js` no mesmo commit (T2), as duas asserções de
`ALERT_REGISTRY.length === 13` (T4), `limite` em vez de `limit`, e validação de id não numérico.

## Contratos de API congelados

**Todas as rotas novas moram em `server/routes/almoxarifado/extended.js`** (medido: `/conferir`
`:983`, `/inspecionar` `:991`, `/inspecoes/pendentes` `:1001`, anexos `:1572`), dentro do closure
`registerExtendedRoutes`, usando o `handleError` de `:77`. **Nenhuma** vai em
`routes/almoxarifado.js`.

### `POST /api/almoxarifado/nao-conformidades` — abrir manualmente
Gate: `requirePermission('registrar_nao_conformidade')` → `[ADMINISTRADOR, ALMOXARIFE, QUALIDADE, COMPRAS]`

```json
{ "origem": "RECEBIMENTO", "referencia_tipo": "RECEBIMENTO_ITEM", "referencia_id": 12,
  "tipo": "CERTIFICADO_AUSENTE", "descricao": "texto livre opcional" }
```

| Situação | Código | Mensagem literal |
|---|---|---|
| ok | 201 | `{ id, numero: "NC-…", status: "ABERTA", ... }` |
| `origem` fora do enum | 400 | `Origem inválida` |
| `tipo` fora do enum | 400 | `Tipo de não conformidade inválido` |
| `referencia_tipo` fora do enum | 400 | `Tipo de referência inválido` |
| `referencia_id` não inteiro | 400 | `Referência inválida` |
| referência inexistente | 404 | `Item de recebimento não encontrado` / `Inspeção não encontrada` |
| já existe NC ABERTA do mesmo tipo | 409 | `Já existe uma não conformidade aberta para este item e tipo` |
| sem perfil | 403 | (mensagem padrão do `requirePermission`) |

`referencia_id` usa **`Number.isInteger`, não `isFinite`** — precedente escrito em
`anexoService.js`: `1.5` viraria `1` no SQLite e penduraria o documento no registro errado, em
silêncio.

### `GET /api/almoxarifado/nao-conformidades` — listar
Gate: só `auth` (leitura, molde de `GET /inspecoes/pendentes`).
Query: `status` · `origem` · `tipo` · `material_id` · **`limite`** (default 100, teto 500,
**clampado sem erro**, molde de `limiteHistorico`, `inspectionService.js:423-430`).

> **`limite`, não `limit`** — convenção medida do módulo (`inspectionService.js:455`,
> `reportRegistry.js`, `auditFiltros.js`). Com `limit`, um `?limite=500` da tela nova seria
> ignorado em silêncio e o usuário receberia 100 achando que recebeu tudo.

Resposta: `{ itens: [...] }`, cada item com `id, numero, origem, referencia_tipo, referencia_id,
tipo, status, material_id, material_codigo, material_nome, recebimento_id, recebimento_numero,
nota_fiscal, quantidade_esperada, quantidade_recebida, divergencia, descricao, decisao,
justificativa, aberto_por_nome, aberto_automaticamente, decidido_por_nome, decidido_em,
motivo_cancelamento, cancelado_em, created_at, updated_at`.

> **O SQL NÃO é polimórfico** (achado 16 resolvido pelo desenho da tabela): `material_id` e
> `recebimento_id` são **congelados na própria NC** no ato da abertura, qualquer que seja a
> origem. A listagem é um `LEFT JOIN materiais_almoxarifado` + `LEFT JOIN
> recebimentos_material_almoxarifado` e pronto — nada de dois caminhos de JOIN e nada de coluna
> vindo `null` para metade das linhas.

### `GET /api/almoxarifado/nao-conformidades/:id`
Gate: só `auth`. `:id` passa por `paraNumeroFinito` (molde de `extended.js:1026-1030`, que existe
porque o SQLite coage texto em silêncio) → 404 `Não conformidade não encontrada`.

### `POST /api/almoxarifado/nao-conformidades/:id/decidir`
Gate: `requirePermission('decidir_nao_conformidade')` → `[ADMINISTRADOR, QUALIDADE]`

```json
{ "decisao": "ACEITAR_SOB_DESVIO", "justificativa": "texto obrigatório" }
```

| Situação | Código | Mensagem literal |
|---|---|---|
| ok | 200 | a NC atualizada |
| `:id` não numérico | 404 | `Não conformidade não encontrada` |
| `decisao` fora do enum | 400 | `Decisão inválida` |
| justificativa vazia | 400 | `Justificativa é obrigatória para decidir a não conformidade` |
| NC já decidida/cancelada | 409 | `Esta não conformidade já foi encerrada` |
| não existe | 404 | `Não conformidade não encontrada` |

### Aditivo em `POST /recebimentos/itens/:itemId/inspecionar` (RN-07)
A resposta ganha **`divergencia_quantidade`** (0/1, derivado), ao lado do `divergencia_dimensional`
e `medidas_registradas` que a Etapa 27 já devolve. **Nome congelado** — é o que o `toast` de
`InspecoesAlmoxarifado.js:237` lê.

### Aditivo em `GET /inspecoes/pendentes` (desbloqueia T5)
Cada linha ganha `quantidade_esperada`, `quantidade_recebida` e **`divergencia_quantidade`**
(0/1, **derivado no servidor** pela régua de `divergencia.js`). A tela **lê a flag**; não
recalcula — a B60 já vetou a segunda cópia da régua no client.

### Contrato interno — `services/almoxarifado/nonConformityService.js`

- `abrirNaoConformidade(db, user, dados)` → `{ id, numero, ... }` ou **`null`** quando já existe
  ABERTA idêntica. A porta manual transforma `null` em 409; o gancho ignora.
  > **O `catch` que traduz a colisão em `null` fica FORA do `fn` do `inserirComNumeroUnico`**
  > (achado 19 da Fase 2): a régua `RE_COLISAO_NUMERO` (`numeroDoc.js:78`) casa só
  > `<tabela>.numero`, então a violação do índice parcial composto **sobe intacta** — mas um
  > `catch` largo por dentro engoliria também a colisão de `numero` e mataria o retry.
- `sincronizarNaoConformidadeQuantidade(db, user, itemId)` → abre / atualiza / cancela conforme
  RN-03/04/05/10/11. **É a função que os DOIS ganchos de recebimento chamam**, e é idempotente.
- `abrirNaoConformidadeDeInspecao(db, user, inspecaoId)` → o gancho da inspeção (tipo por D9).
- `decidirNaoConformidade(db, user, id, dados)`
- `listarNaoConformidades(db, filtros)` / `obterNaoConformidade(db, id)`
- `NC_ORIGENS`, `NC_TIPOS`, `NC_DECISOES`, `NC_STATUS`, `NC_REFERENCIA_TIPOS` (exportados; o
  client NÃO recebe enum por rota — a tela repete a lista, como as demais telas do módulo).

### DDL congelada

```sql
CREATE TABLE IF NOT EXISTS nao_conformidades_almoxarifado (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero TEXT UNIQUE NOT NULL,
  origem TEXT NOT NULL,
  referencia_tipo TEXT NOT NULL,
  referencia_id INTEGER NOT NULL,
  tipo TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ABERTA',
  material_id INTEGER,
  recebimento_id INTEGER,
  quantidade_esperada REAL,
  quantidade_recebida REAL,
  divergencia REAL,
  descricao TEXT,
  decisao TEXT,
  justificativa TEXT,
  aberto_por_id INTEGER,
  aberto_por_nome TEXT,
  aberto_automaticamente INTEGER DEFAULT 0,
  decidido_por_id INTEGER,
  decidido_por_nome TEXT,
  decidido_em DATETIME,
  motivo_cancelamento TEXT,
  cancelado_em DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (material_id) REFERENCES materiais_almoxarifado(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_nc_almox_aberta
  ON nao_conformidades_almoxarifado(origem, referencia_tipo, referencia_id, tipo)
  WHERE status = 'ABERTA';
CREATE INDEX IF NOT EXISTS idx_nc_almox_status
  ON nao_conformidades_almoxarifado(status, created_at);
```

> **Nomes de coluna seguem o que o schema JÁ usa** (achado 17): `motivo_cancelamento`,
> `cancelado_em` e o padrão `<particípio masculino>_por_id/_nome`, que aparece em 19 colunas
> (`criado_por_nome`, `conferido_por_nome`, `recontado_por_nome`, `recebido_por_nome`…). A
> primeira versão propunha `aberta_por_nome`/`decidida_em`, flexão que não existe em nenhuma
> delas — e DDL fica para sempre.

## Tasks

### T1 — tronco — tabela + serviço (`nonConformityService.js`)
- `schema.js`: a DDL acima. Tabela **nova**, então nasce com o índice — sem `try/catch`, como
  `planos_inspecao_almoxarifado` (`schema.js:1200-1201`).
- Serviço com as sete funções; numeração por `inserirComNumeroUnico(db, 'NC', fn)`; auditoria
  (`registrarAuditoria`, entidade `nao_conformidade`, verbos `NC_ABERTA`/`NC_DECIDIDA`/
  `NC_CANCELADA`); régua **importada** de `divergencia.js`, nunca reescrita.
- Testes: `naoConformidadeServico.api.test.js` — enum, numeração, idempotência (RN-08),
  atualização do fato (RN-04), cancelamento automático (RN-05), **não-reabertura sem mudança de
  fato (RN-10)**, **não-cancelamento com recebimento processado (RN-11)**, decisão e 409 (RN-06).
- **Controle positivo obrigatório:** sabotar a régua (`EPSILON_DIVERGENCIA` → `0`) e confirmar
  que o cenário "divergência de 7e-16 não abre NC" fica **vermelho**. Se não ficar, a asserção
  está no lugar errado.

### T2 — tronco — permissões + rotas + rótulos

> **O que a T1 já entregou, e que a T2 consome (medido, não prometido):**
> `services/almoxarifado/nonConformityService.js` exporta `abrirNaoConformidade(db, user, dados)`
> (→ documento, ou **`null`** quando já há ABERTA idêntica → a rota traduz em **409**),
> `sincronizarNaoConformidadeQuantidade`, `abrirNaoConformidadeDeInspecao`,
> `decidirNaoConformidade(db, user, id, { decisao, justificativa })`,
> `listarNaoConformidades(db, filtros)` → **array** (a rota embrulha em `{ itens }`),
> `obterNaoConformidade(db, id)` → linha ou **`null`** (a rota traduz em 404), os cinco enums e
> `LIMITE_PADRAO`/`LIMITE_TETO`. Todos os erros já saem com `.status` (400/404/409) e com a
> mensagem literal da tabela de contratos acima — o `handleError` de `extended.js:77` só
> repassa. **A rota não deve revalidar enum nem id**: duplicar a régua é como a mensagem literal
> se parte em duas.
- `permissions.js`: as duas ações (D8), com o comentário explicando a exclusão de COMPRAS da
  decisão.
- **`client/src/utils/permissaoErro.js` NO MESMO COMMIT** (achado 5 — é a **5ª** vez que este
  buraco aparece nesta base): `permissaoErro.test.js:44` importa `ACAO_PERFIS` do servidor e
  exige rótulo próprio para **toda** ação; sem isso a suíte do **client** fica vermelha por causa
  de uma task de **servidor**. O antídoto está escrito no próprio arquivo (`:45-50`).
- `extended.js`: as quatro rotas.
- `auditLabels.js`: entidade `nao_conformidade` → *"Não conformidade"*; **três** grupos de ação
  distintos, não um (RN-09).
- Testes: `naoConformidadeRotas.api.test.js` — os códigos de erro com **mensagem literal**, a
  matriz de perfis, e a asserção negativa provada por **sabotagem que CONCEDE** a permissão
  proibida (regra da `fechar-etapa`: asserção negativa de permissão não fica vermelha na rodada
  TDD, então o controle positivo é a única prova dela).

### T3 — galho — os TRÊS ganchos + a derivação da inspeção (RN-07)

> **O que a T2 já entregou, e que a T3/T5 consomem (medido, não prometido):**
> as quatro rotas existem em `extended.js`, logo depois de `GET /inspecoes/:id/medidas`:
> `POST /api/almoxarifado/nao-conformidades` (gate `registrar_nao_conformidade`, 201, e **409**
> com a mensagem literal quando o serviço devolve `null`), `GET /nao-conformidades` (só `auth`,
> resposta **`{ itens: [...] }`**, query passada inteira ao serviço — `status`, `origem`, `tipo`,
> `material_id`, `limite`), `GET /nao-conformidades/:id` (só `auth`, 404 também para id não
> numérico) e `POST /nao-conformidades/:id/decidir` (gate `decidir_nao_conformidade`, 200).
> `ACAO_PERFIS` tem as duas ações novas e `GET /almoxarifado/minhas-permissoes` já as publica —
> a T5 lê a flag de lá para esconder o botão de decidir, e ela **falha aberta** de propósito.
> `auditLabels.js` tem a entidade `nao_conformidade` e os três verbos: **nenhuma task nova precisa
> reabrir esse arquivo por causa da NC**.
> ⚠️ **A T3 não pode escrever `acao: 'ALGO_MAIUSCULO'` em `services/almoxarifado/` para nada que
> não seja verbo de trilha — nem dentro de comentário** (`auditLabels.api.test.js:61` é `grep`).

- `receiptService.conferirRecebimento` **e** `receiptService.salvarDadosFiscal`: ao fim, por item
  tocado, `sincronizarNaoConformidadeQuantidade`, em `try/catch` com `console.warn` (molde do
  gancho de status da Etapa 42), **depois** de `avisarDivergenciasDoRecebimento` (`:799` e `:966`).
- `inspectionService.decidirInspecao`: `divergencia_quantidade` **derivada** do item (RN-07),
  devolvida na resposta; `listarInspecoesPendentes` ganha as duas quantidades + a flag derivada;
  gancho `abrirNaoConformidadeDeInspecao` não fatal.
- **Consertar os dois testes que a RN-07 derruba**, fabricando divergência real no fixture
  (`UPDATE ... SET quantidade_recebida`) para o padrão `1/0/0` continuar existindo:
  `medidasInspecao.api.test.js:450/454` e `inspecaoHistorico.api.test.js:272/287`. **O cenário
  `:244-292` não pode perder a força** — ele existe para pegar cruzamento de coluna no SELECT.
- **Atenção medida:** o `require` do serviço novo dentro de `inspectionService` **pode fechar
  ciclo**; `alertRegistry` já usa `require` preguiçoso por esse motivo (Etapa 42, F17). **Medir
  com sonda de carga fria nas DUAS ordens**, não presumir.
- Testes: `naoConformidadeGanchos.api.test.js` — conferência com divergência abre; **`/fiscal`
  também abre** (o caminho da UI real); reconferir não duplica; corrigir cancela; salvar sem mudar
  nada **não** reabre (RN-10); recebimento processado **não** cancela (RN-11); inspeção reprovada
  abre; gancho que explode **não** derruba a porta e deixa o `console.warn`; payload
  `divergencia_quantidade: true` em item sem divergência grava **0**.

### T4 — galho — alerta novo + rede de segurança + anexos
- 14ª entrada `NAO_CONFORMIDADE_ABERTA` no `ALERT_REGISTRY` (dedupe por `nc-<id>`), corpo de
  e-mail no molde das 13 existentes.
- **A exclusão do D6 vai no `listar` DA ENTRADA** `DIVERGENCIA_RECEBIMENTO` (`alertRegistry.js:412`),
  por `{ excluirComNC: true }`. **A função compartilhada `listarDivergenciasRecebimento` não muda
  de comportamento nos modos existentes** — ver o BLOQUEANTE 3.
- `anexoService.ENTIDADES_ANEXO`: entidade `nao_conformidade`.
- `client/.../AlertasAlmoxarifado.js`: colunas do cartão novo.
- **Consertar o que a 14ª entrada derruba** (achado 6, mecânico mas tem de estar escrito):
  `alertaPedidoParcial.api.test.js:456` e `:459` (`ALERT_REGISTRY.length === 13`, duas vezes) e a
  lista exaustiva e ordenada de cartões em `AlertasAlmoxarifado.test.js:255-268`.
- Testes: `alertaNaoConformidade.api.test.js` + o do client.

### T5 — galho — tela `NaoConformidadesAlmoxarifado.js`
- Rota `/almoxarifado/nao-conformidades`, item no menu (`Layout.js`), lista com filtro por status,
  modal de decisão (enum + justificativa obrigatória), bloco `AnexosDocumento`, gate da UI por
  `minhas-permissoes` (falha **aberto**, como o resto do módulo).
- `InspecoesAlmoxarifado.js`: caixa *Divergência de quantidade* **somente leitura**, lendo a flag
  `divergencia_quantidade` que a fila passa a devolver — **sem recalcular nada no client**.
- Testes: `NaoConformidadesAlmoxarifado.test.js`.

### T6 — integração cruzando galhos
`naoConformidadeIntegracao.api.test.js`: receber → **`/fiscal`** com falta → NC nasce por HTTP →
aparece na listagem **e no alerta** → decidir por HTTP com perfil QUALIDADE → sai do alerta →
COMPRAS toma **403** ao decidir e **201** ao abrir. E o caminho da inspeção: reprovar → NC de
origem INSPECAO com o `tipo` da prioridade do D9.

## Ordem de execução

`T1` → `T2` (tronco, sequenciais) → **[`T3` + `T5`]** em paralelo (o contrato dos dois aditivos
está congelado acima, o que desfaz o acoplamento que a Fase 2 achou) → **[`T4`]** → `T6`.
Lotes de no máximo **dois** galhos.

## Tasks feitas

- [x] T1 — tabela + `nonConformityService.js` + `naoConformidadeServico.api.test.js` (13 cenários).
      Suíte: **200/200 arquivos** em `test:api` (baseline era 199/199).
      **Três pontos em que a T1 divergiu do plano, todos registráveis na letra B:**
      1. `sincronizarNaoConformidadeQuantidade` devolve `{ efeito, nc }`, e o campo **NÃO** pode
         chamar-se `acao`: `auditLabels.api.test.js:61` varre `services/` com
         `grep -rhoP "acao: '[A-Z_]+"` e trata todo casamento como verbo de auditoria sem rótulo.
         Medido — com `acao` o teste cai. Vale inclusive dentro de comentário.
      2. **RN-10 vale só no gancho**, não na porta manual `abrirNaoConformidade`. Uma pessoa que
         abre documento à mão está afirmando que reobservou o fato; a guarda existe contra o
         reenvio automático do modal de NF, não contra a pessoa.
      3. `listarNaoConformidades` devolve **array** (molde de `listarHistorico`/`listarAnexos`);
         quem embrulha em `{ itens }` é a rota da T2.
- [x] T2 — permissões (D8) + `permissaoErro.js` no mesmo commit + rótulos de auditoria (RN-09) +
      as quatro rotas + `naoConformidadeRotas.api.test.js` (8 cenários).
      Suíte: **201/201 arquivos** em `test:api` (baseline era 200/200); client
      `permissaoErro.test.js` **9/9**.
      **Controle positivo, rodado:** com `decidir_nao_conformidade: [ADMINISTRADOR, QUALIDADE,
      COMPRAS]` em `permissions.js`, o cenário (7) caiu com *"perfil COMPRAS PASSOU indevidamente
      em decidir_nao_conformidade (status 200)"* — a asserção certa, nomeando ação e perfil, e
      nenhuma outra. Restaurado por `perl` inverso com `md5sum` conferido (`a6a20f5f…`).
      **Segundo controle (client):** removendo os dois rótulos de `permissaoErro.js`,
      `permissaoErro.test.js:44` fica vermelho listando as duas ações — a guarda da Etapa 30
      está viva, e esta seria a 6ª ocorrência do buraco se o commit fosse só de servidor.
      **Onde a T2 divergiu do plano (letra B):**
      1. A entidade `nao_conformidade` entrou com **três rótulos de ação** (`Não conformidade
         aberta` / `decidida` / `cancelada`), como a RN-09 mandava — e a nota no arquivo explica
         que agrupar impediria a pergunta "o que foi DECIDIDO neste mês", que é a razão de o
         documento existir.
      2. As listas de perfil do teste da matriz são **literais**, e não derivadas de
         `ACAO_PERFIS`: derivadas, a sabotagem do controle positivo mudaria a expectativa junto
         com o código e o cenário seria tautologia. Custo declarado: mudar D8 exige mudar o teste.
      3. O clamp de 500 é medido **na rota** envelopando `db.all` durante três requisições
         (`?limite=9999` → 500, `?limite=7` → 7, ausente → 100), em vez de criar 501 documentos.
- [x] T3 — os **três** ganchos (`conferirRecebimento`, `salvarDadosFiscal`, `decidirInspecao`),
      a derivação da RN-07 e o aditivo da fila de pendentes (`21ef822`, worktree `CRM-e43-t3`,
      integrada em `929dd5e`). Suíte **201/201** na base da worktree.
      **Sonda de ciclo de `require`, rodada em quatro cargas frias** (`receipt→inspection→nc`,
      `nc→inspection→receipt`, e cada serviço sozinho): **não há ciclo** — `nonConformityService`
      só requer `db`/`divergencia`/`numeroDoc`/`audit`. Por isso o `require` é de **topo**, e não
      preguiçoso: copiar o preguiçoso do `alertRegistry` sem o ciclo que o justifica seria cargo
      cult. As chamadas vão pelo **objeto do módulo** (não desestruturadas) porque o teste de
      não-fatalidade monkeypatcha.
      **Controles positivos, os três com a asserção certa:** (a) gancho removido do `/fiscal` →
      caiu *"registrar 7 de 10 PELA ROTA FISCAL tinha de abrir a NC … abriu 0"*; (b)
      `divergencia_quantidade` voltando ao payload → caiu *"o payload mandou `true` num item sem
      divergencia: a resposta tinha de trazer o DERIVADO 0"*; (c) `console.warn` → `throw` →
      caiu `conf.resultado.status === 200` (veio 500), e a variante só da inspeção caiu em
      `insp.resultado.status === 201`. A falha injetada substitui a função **inteira**, então
      acontece depois de qualquer guarda — a armadilha do teste vazio da Etapa 42 não se repetiu.
      **Divergência do plano:** `try/catch` **por item**, não um em volta do laço, para que um
      item que explode não faça os outros do mesmo documento perderem a NC.
- [x] T4 — 14ª entrada `NAO_CONFORMIDADE_ABERTA`, a exclusão do D6 **na entrada do alerta**, a 7ª
      entidade de anexo e o cartão no client (`9b6f205`, worktree `CRM-e43-t4`, integrada em
      `c4234c3`). Suíte **203/203**; client **51 suítes / 791 testes** na base da worktree.
      **A sabotagem do D6 nos dois jeitos é o resultado mais valioso desta task, e ela corrige em
      parte a previsão da Fase 2:** na *forma errada* (exclusão dentro de
      `listarDivergenciasRecebimento`) caem **três** arquivos — `recebimentoExcedente (4)`,
      `recebimentoPortasIntegracao (B)` e o cenário próprio —, mas `alertaEventoGanchos` fica
      **VERDE**, inclusive o A1. Motivo medido: o gancho de NC roda **depois** do aviso de
      divergência, então no ato a NC ainda não existe; e no A1 a NC está `CANCELADA` quando o
      operador erra de novo. **O A1 só cai quando a exclusão também ignora o status** — ou seja, a
      cláusula `status <> 'CANCELADA'` é parte do desenho, e isso agora está provado por execução,
      não por dedução.
      **SQL próprio** (`listarNaoConformidadesParadas`) em vez de reusar `listarNaoConformidades`:
      aquela clampa em 100 e a varredura **diária** ignoraria a 101ª NC parada em silêncio.
      **Quatro contadores que o plano não listava** foram encontrados e corrigidos
      (`alertaPedidoParcial` tinha uma **terceira** conta, `alertaPedidoAtrasado` tinha **duas**, e
      `anexoService.api.test.js` afirma o mapa inteiro); e `alertaEventoGanchos (7)` foi
      **adaptado, não corrigido mecanicamente** — ele apagava a linha da fila e pedia à varredura
      que a regenerasse, o que com o D6 corretamente não acontece se o item já tem NC; o cenário
      passou a apagar **também a NC**, que é o estado em que a varredura é rede de segurança.
- [x] T5 — a tela `NaoConformidadesAlmoxarifado.js` + rota + menu + a caixa somente leitura da
      inspeção (`1bab308` e `9e4fb3d`, worktree `CRM-e43-t5`, integrada em `67d7715`).
      Client **52 suítes / 804 testes**, build `Compiled successfully`.
      **Achado da sabotagem, escrito no código:** `setItens(null)` no `catch` **sozinho não
      derruba teste nenhum** — quem carrega a garantia de "não mostra lista velha" é a precedência
      do estado de erro no render. A linha ficou como segunda trava **com a nota dizendo isso**,
      para o próximo não confundir redundância com garantia.
      **Três estados, não dois**, para a flag da inspeção (1 / 0 / **ausente**): enquanto a fila do
      servidor não trouxer o campo, a caixa fica travada e **diz** *"Ainda não informada pelo
      servidor nesta fila"* — desmarcada e calada seria o BLOQUEANTE 4 da Fase 2 entrando pela
      porta do tempo.
      **Divergência do plano:** a tela **não abre NC à mão**. O payload exige `referencia_tipo` +
      `referencia_id` e nenhuma tela do módulo mostra esses ids; um campo numérico cru convidaria a
      pendurar o documento no registro errado — que é o que a guarda `Number.isInteger` existe para
      evitar. **Consequência declarada:** `registrar_nao_conformidade` fica sem call site de UI
      (letra **B171**).
- [x] T6 — `naoConformidadeIntegracao.api.test.js` (`1725779`), 6 cenários, **tudo por HTTP**.
      Suíte **204/204 arquivos**.
      **As duas sabotagens acertaram o alvo:** (a) `excluirComNC: false` derrubou o cenário (2)
      em *"o item 2 virou NC-… e NAO podia continuar no cartao DIVERGENCIA_RECEBIMENTO"* e o
      irmão no (3); (b) prioridade do D9 invertida derrubou **só** o (5), nomeando o tipo errado.
      **O cenário (2) vale mais que o da T4 e é por isso que a task existe:** o teste da T4 chama
      `montarCentral` direto; este entra **pela rota**, com gate, e mede os **dois cartões na
      mesma resposta** — é a única prova de que a exclusão do D6 chega ao usuário.
      **DEFEITO DE COMPOSIÇÃO ENCONTRADO — e é o achado da etapa** (ver a letra **C59**):
      `decidir_nao_conformidade` é `[ADMINISTRADOR, QUALIDADE]`, mas `ver_alertas` é
      `[ADMINISTRADOR, ALMOXARIFE, GESTOR, COMPRAS]` (`permissions.js:149`). Medido pela rota:
      QUALIDADE + `GET /alertas/central` → **403**. O único perfil não-admin que pode **agir**
      sobre a NC é o único que **não vê** o cartão que a cobra; e quem vê (COMPRAS) é quem foi
      excluído da decisão de propósito. A exclusão de QUALIDADE de `ver_alertas` já estava
      declarada desde a Etapa 24, mas ali a consequência era só de **visibilidade** — esta é a
      primeira entrada cuja **ação** pertence a quem não vê o cartão. O 403 ficou **congelado no
      teste**, com o porquê no cabeçalho: no dia em que a central filtrar por perfil, o arquivo
      fica vermelho com a explicação ao lado.

### Fechamento (fora das seis tasks, feito na integração)

- **O campo do alerta novo era INEDITÁVEL pela tela.** A T4 semeou `alerta_nc_parada_dias` em
  `schema.js`, mas `ConfiguracoesAlmoxarifado.js` renderiza uma **lista fixa** (`CAMPOS`) — chave
  fora dela existe no banco e não tem onde ser editada. É o **mesmo buraco** que as Etapas 16 e 17
  pagaram, e o cabeçalho de `ConfiguracoesGerais.test.js` já o registrava. Corrigido no
  fechamento, com cenário próprio e **controle positivo**: removendo a linha de `CAMPOS`, o teste
  cai em `expect(container.textContent).toContain('Alerta de Não Conformidade Parada (dias)')` —
  a asserção certa. Restaurado por cópia com `md5sum -c` OK.
  Efeito colateral medido: sem a chave na **fixture** do teste, o guard client-side vê `undefined`
  como `NaN` e derruba **seis** testes de Salvar que nem tocam nela — exatamente o que o
  comentário da Etapa 16 previa.

## Próxima tarefa detalhada — Etapa 44: a QUALIDADE executa a própria decisão (feature 09) — medir antes

**Por que esta, e não outra** (pela ordem do `CLAUDE.md`, sem consultar ninguém):

1. **É o que o fechamento desta etapa nomeou como "falta para 🟢"** da feature que acabei de
   tocar: a 09 saiu de três itens para **dois**, e um deles — *liberação sob desvio autorizado* —
   está **pago pela metade**. O documento existe, a decisão é imutável, e **quem decide não
   consegue executar**.
2. **O furo é concreto, medido e pequeno**, o que é raro: `ACEITAR_SOB_DESVIO` fecha o documento e
   o material continua em `quantidade_bloqueada`. Quem desbloqueia é
   `POST /api/almoxarifado/materiais/:id/desbloquear` (`extended.js:1103`), gateado por
   **`ajustar_estoque`** — `[ADMINISTRADOR, GESTOR]`, sem QUALIDADE (`permissions.js:99-101`), e a
   exclusão é **deliberada e escrita** desde a Etapa 24 (*"mexer em saldo não é ofício de
   qualidade"*). Na prática a Qualidade decide e **pede a outra pessoa** que execute.
3. **A saída já está nomeada por escrito desde a Etapa 24**, na própria spec 09: *"o caminho limpo
   é uma ação PRÓPRIA (`bloquear_qualidade`)"*. Não é desenho novo — é cobrar uma promessa.
4. **Descartado como Etapa 44, com o motivo:** (a) **conferência física estruturada** (item (1) da
   08) — cadastro de checklist por tipo de material, escopo de etapa inteira, e ela **consome** a
   NC; (b) **encaminhamento com status** (o outro item da 09) — depende de a devolução ao
   fornecedor existir como fluxo (feature 12), maior e com dono em outra spec; (c) **botão "abrir
   NC deste item"** na tela de Recebimento (**B171**) — é meia-task, cabe como galho de outra
   etapa, não como etapa.

**Contrato que a 44 consome (medido em 2026-09-28; a Fase 0 tem de RECONTAR e cruzar com a spec
09 ANTES de medir do zero):**

- **`inspectionService.bloquearMaterial` / `desbloquearMaterial`** (`:401` e `:414`) — as duas
  são finas: validam `quantidade > 0` e `justificativa` não vazia e chamam `registrarMovimentacao`
  com os tipos `BLOQUEIO` / `DESBLOQUEIO` e o motivo literal *"Bloqueio avulso"* / *"Desbloqueio
  avulso"*. **Não têm vínculo com documento nenhum** — é exatamente o que a 44 acrescenta.
- **`DESBLOQUEIO` recusa com 400 quando a quantidade pedida é maior que a bloqueada** (Etapa 5, já
  escrito na spec 09) — a 44 **não** precisa inventar essa guarda.
- **`nonConformityService.decidirNaoConformidade`** — hoje só grava. O gancho de execução entra
  **depois** da gravação, e a pergunta de desenho é se ele é **fatal** (a decisão falha se o
  desbloqueio falhar) ou **não fatal** como os três ganchos da 43. **Recomendação medida:** aqui
  deve ser **FATAL**, ao contrário da 43 — decidir "aceito" e o material continuar bloqueado em
  silêncio é pior que a decisão não ter sido gravada, porque o documento diria uma coisa e o saldo
  outra. É a inversão do critério da 43, e por isso precisa estar escrita.
- **A NC de origem `INSPECAO` guarda `referencia_id` = id da inspeção**, e a inspeção guarda
  `quantidade_reprovada` e `recebimento_item_id` — então o material e a quantidade a desbloquear
  são alcançáveis sem coluna nova. **Medir**: a NC de origem `RECEBIMENTO` **não** tem material
  bloqueado (falta de quantidade não bloqueia nada), então a execução só faz sentido na origem
  `INSPECAO` — e isso tem de ser **recusa explícita**, não silêncio.

**Pontos de atenção (medir na Fase 0 antes de prometer):**

- **A ação nova é `bloquear_qualidade` ou duas?** A spec 09 nomeia uma. Mas bloquear e desbloquear
  têm **riscos diferentes** (desbloquear devolve material ao disponível). O precedente desta base
  é ação própria quando **a natureza do risco muda** — medir se o cliente quer separar.
- **O que fazer com `SUCATEAR` e `DEVOLVER`.** Se a 44 executa `ACEITAR`/`ACEITAR_SOB_DESVIO`,
  fica estranho não executar os outros dois — mas sucatear passa pelas **duas pernas de
  aprovação** (`aprovar_sucateamento` + `aprovar_sucateamento_gestao`) e devolver é a feature 12.
  **Caminho reversível:** executar só as duas decisões de aceitação, e declarar as outras duas
  como "marcam intenção" — registrando na letra B, porque é corte de escopo visível na tela.
- **A tela.** O botão de decidir já existe; o que muda é o **efeito**. A tela precisa dizer o que
  aconteceu com o saldo (*"material liberado"*), senão o usuário decide e não vê diferença — foi
  o que aconteceu na Etapa 43 com o `ACEITAR_SOB_DESVIO` e virou o furo **C57**.
- **Não repetir o erro da 43 nos testes de permissão:** asserção negativa de permissão não fica
  vermelha na rodada TDD; o controle positivo **concedendo** a ação proibida é a única prova.
- **Despachar em lotes de no máximo dois galhos** — regra que continua valendo (nenhum agente foi
  perdido nesta etapa com esse limite).

## Retro nº 4 da Etapa 42 — o defeito que escapou (preenchido por esta Fase 0)

A Fase 0 **não achou defeito de código** escapado da 42: a suíte partiu verde em 199/199 e as duas
consultas que a 43 consome estão como o handoff descreveu. O que escapou foi de **handoff**: ele
nomeou `gerarNumeroDocumento(prefixo)` como contrato do numerador, quando o que os quatro
consumidores usam — e o único com **retry de colisão** — é `inserirComNumeroUnico(db, prefixo,
fn)`. Quem seguisse o handoff ao pé da letra geraria o número por fora e perderia o retry, que é
exatamente o defeito que a Etapa 31 consertou. Corrigido no design e aqui.

**E um segundo, achado pela Fase 2 desta etapa:** o handoff da 42 dizia que a divergência de
recebimento já tinha gancho "nos dois escritores" — e tinha, para o **alerta**. Ao transportar a
frase para o plano da 43 eu a li como se um gancho na conferência bastasse, e o revisor mediu que
**a UI nunca chama `/conferir`**. A lição não é sobre a 42: é que "já existe gancho nos dois
escritores" é uma frase sobre o alerta, não uma licença para enganchar num lugar só.

## Retro de 4 números — Etapa 43

1. **Rodadas de correção até verde:** **zero** no sentido clássico — nenhuma task precisou de uma
   segunda rodada depois de integrada, e a suíte nunca ficou vermelha na branch principal. O que
   substituiu as rodadas foi a **Fase 2**: 20 achados, 4 bloqueantes, **antes** da primeira linha
   de código. Dois deles (o gancho na porta errada e a exclusão na função compartilhada) teriam
   virado, no mínimo, uma rodada de correção cada — e o terceiro (a medição apagada do padrão
   `1/0/0`) não viraria rodada nenhuma, porque **ninguém teria notado**.
2. **Achados da revisão: 20 reais, 0 ruído.** Todos com arquivo:linha e cenário. A taxa de zero
   ruído se repete pela terceira etapa seguida, e o que a explica é a instrução de exigir cenário
   concreto de falha em vez de opinião.
3. **Paralelismo:** 4 galhos em worktrees isoladas, em **dois** lotes de dois (T3+T5, depois T4
   sozinho com T6 na sequência). **Nenhum retrabalho por conflito**, e nenhum agente perdido. O
   que evitou o retrabalho foi congelar **por escrito** os dois aditivos de contrato que a T5
   consumia da T3 — sem isso os dois estavam no mesmo lote e acoplados, como a Fase 2 mediu.
4. **Defeito que escapou:** a preencher pela Fase 0 da Etapa 44. **Dois candidatos já conhecidos
   e declarados**, que valem verificação lá: (a) `registrar_nao_conformidade` ficou **sem call
   site de UI** (B171) — ação que existe e ninguém alcança pela tela é o padrão que esta base já
   pagou três vezes; (b) a abertura automática **não alcança** divergência anterior ao deploy
   (A21), e ninguém vai reconferir recebimento antigo só para gerar documento.

### O que esta etapa aprendeu sobre o próprio fluxo

**A Fase 2 achou um erro que a Fase 0 tinha acabado de cometer**, e vale nomear o mecanismo: o
handoff da Etapa 42 dizia que a divergência de recebimento *"já é chamada por gancho no ato, nos
dois escritores"*. Aquilo era uma frase sobre **o alerta**. Ao transportá-la para o plano da 43,
eu a li como licença para enganchar a NC **num lugar só** — e o revisor mediu que a UI nunca chama
`/conferir`. **A lição não é "leia melhor":** é que uma frase de handoff sobre um mecanismo (o
alerta) não autoriza conclusão sobre outro (o documento), mesmo quando os dois moram na mesma
função. Medir de novo custa minutos; a feature teria nascido invisível em produção.
