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

- [ ] T1
- [ ] T2
- [ ] T3
- [ ] T4
- [ ] T5
- [ ] T6

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
