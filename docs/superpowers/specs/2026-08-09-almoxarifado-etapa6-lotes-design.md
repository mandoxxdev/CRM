# Etapa 6 — Lotes de verdade (feature 10, parte 1 de 3)

> **Design fechado em 2026-08-09.** Precede o plano de implementação.
> Spec da feature: `specs/modulo-almoxarifado/10-lotes-series-etiquetas/README.md`
> (corrigida no commit `49f011b` com o levantamento que embasa este desenho).

## O problema

Hoje `lote` é uma coluna `TEXT` que o motor **grava e nunca lê**. O levantamento de 2026-08-09
mediu as consequências:

- Saída por lote não valida o saldo daquele lote. Reproduzido: lote `A` com 100 e lote `B` com
  2, saída de 10 em `B` passa **sem erro** e deixa `B` em **−8**. `syncMaterialTotals` soma a
  linha negativa de volta, o total do material continua coerente, e nenhuma tela denuncia.
- As três colunas de retenção por lote em `estoque_saldo_almoxarifado` (`quantidade_reservada`,
  `quantidade_bloqueada`, `quantidade_em_inspecao`) não recebem escrita em lugar nenhum do
  servidor. Reter um lote específico é impossível: bloqueia-se o material inteiro.
- Cinco flags `controle_*` existem no cadastro e não são lidas por nenhuma regra. Uma delas,
  `controle_certificado`, tem um `SELECT` morto em `receiptService.js:309` que faz a auditoria
  por `grep` concluir que a entrada verifica certificado.
- O recebimento — único lugar onde um lote naturalmente nasce — não tem campo de lote na tela.

É o mesmo padrão que já mordeu três vezes neste módulo: coluna existe, fórmula subtrai, ciclo
nunca fecha (`reserva_id` e `expira_em` na Etapa 4, `quantidade_em_inspecao` na Etapa 5).

## A premissa que muda tudo: não há dado legado

Sonda somente-leitura sobre o dump de produção (`server/data/database.sqlite`, 161 MB, 08/08):

| tabela | linhas |
|---|---|
| `materiais_almoxarifado` | 3 |
| `movimentacoes_almoxarifado` | 29 (14 SAIDA, 13 ENTRADA, 1 DEVOLUCAO, 1 AJUSTE) |
| `estoque_saldo_almoxarifado` | 3 — todas com `lote IS NULL` |
| `recebimentos` / `reservas` | 0 / 0 |
| **lotes em texto livre** | **0** |
| materiais com qualquer flag `controle_*` ligada | 0 |

**A migração dos textos livres é um no-op.** Sem lote legado, sem duplicata para deduplicar,
sem código de lote a preservar. Isso permite nascer com FK real e reconstruir a tabela de saldo
sem camada de compatibilidade — o item mais arriscado do checklist da spec sai de cena.

## Escopo desta etapa

**Entra:** lotes. **Não entra:** números de série (Etapa 6b — confirmado que é rotina na GMP,
então não é descarte, é sequência) e etiquetas com QR (Etapa 6c, depende de lote e série
existirem). A feature 10 continua aberta no mapa até as três partes fecharem. Numeradas `6b`/`6c`
porque as etapas 7 e 8 do plano mestre já são transferências/devoluções e materiais de
clientes/terceiros.

### Decisões de negócio (respondidas em 2026-08-09)

| Decisão | Escolha |
|---|---|
| Onde o lote nasce | No **recebimento** — código digitado na conferência da NF; o lote herda fornecedor, NF, validade e corrida. Cadastro manual só para acerto |
| Saída de lote **vencido** | **Falha sempre.** Para usar, libera-se o lote antes, com justificativa e autor registrados — reaproveita o fluxo de bloqueio/desbloqueio da Etapa 5 |
| **FEFO** | **Sugestão**: a tela ordena por validade e pré-seleciona o que vence primeiro; o operador pode trocar. O motor não impõe ordem |
| Certificado ausente com `controle_certificado` ligado | **Entra bloqueado**: o material entra (está fisicamente no galpão) e o lote nasce `BLOQUEADO` até anexarem o certificado. Mesma lógica que a Etapa 5 adotou para inspeção — negar a entrada do que existe fisicamente foi justamente o erro corrigido lá |
| Retenção (bloqueio/quarentena/reserva) | **Status no lote**, não quantidade por lote. As três colunas mortas de `estoque_saldo_almoxarifado` são **apagadas** |

### Premissa assumida (não perguntada — baixo risco com zero dado legado)

`controle_lote = 1` exige lote em **entrada e saída**, sem exceção. Se ligarem a flag num
material que já tem saldo sem lote, a tela avisa e oferece regularizar via `AJUSTE` (mover o
saldo sem lote para um lote nomeado). Com 3 linhas de saldo em produção e nenhuma flag ligada,
o custo dessa rigidez hoje é zero, e ela evita a categoria de bug que a spec acabou de
documentar: meio-caminho que parece implementado.

## Modelo de dados

### `lotes_almoxarifado` (nova)

```
id                  INTEGER PK
material_id         INTEGER NOT NULL  -> materiais_almoxarifado(id)
codigo              TEXT NOT NULL              -- código do lote do fornecedor
fornecedor_id       INTEGER
fornecedor_nome     TEXT
corrida             TEXT                       -- heat number (chapas/tubos)
data_fabricacao     DATE
data_validade       DATE
certificado_arquivo TEXT                       -- nome do arquivo em uploads/almoxarifado
certificado_em      DATETIME
certificado_por     INTEGER
status              TEXT NOT NULL DEFAULT 'ATIVO'   -- ATIVO | BLOQUEADO | REPROVADO
status_motivo       TEXT
recebimento_id      INTEGER                    -- origem
recebimento_item_id INTEGER
nota_fiscal         TEXT
observacoes         TEXT
created_at / created_por / updated_at
UNIQUE(material_id, codigo)                    -- o mesmo código pode existir em materiais diferentes
```

**`VENCIDO` não é status.** A spec pedia `ativo/bloqueado/reprovado/vencido`; **a spec estava
errada nesse ponto** e foi corrigida. Vencimento é derivado de `data_validade < date('now')`,
calculado na leitura. Guardar `VENCIDO` gravado exigiria um cron para virar o status à
meia-noite e criaria um estado que diverge da data sempre que o cron falhar ou o relógio
mudar — exatamente o tipo de coluna que fica mentindo. Derivar não pode divergir.

### `estoque_saldo_almoxarifado` — reconstrução

Com 3 linhas em produção, vale reconstruir em vez de remendar:

1. `lote TEXT` → `lote_id INTEGER REFERENCES lotes_almoxarifado(id)`.
2. **Apagar** `quantidade_reservada`, `quantidade_bloqueada`, `quantidade_em_inspecao` — a
   retenção é por status do lote e no total do material; deixá-las é manter o convite ao erro.
3. Trocar a `UNIQUE(material_id, localizacao_id, lote)` por um índice que funcione com NULL:

```sql
CREATE UNIQUE INDEX idx_saldo_almox_chave
  ON estoque_saldo_almoxarifado(material_id, COALESCE(localizacao_id,0), COALESCE(lote_id,0));
```

No SQLite dois `NULL` são distintos para efeito de `UNIQUE`, então a constraint atual **não**
impede duplicata nas linhas sem lote — que são a maioria. O `COALESCE` fecha o buraco.

A reconstrução entra no ledger de migrations, com `safeAlter` estrito, seguindo o padrão já
usado em `criar_almoxarifado_geral`.

### `movimentacoes_almoxarifado` — só acrescenta

Ganha `lote_id INTEGER`. A coluna `lote TEXT` **permanece e continua sendo escrita**, com o
código do lote desnormalizado. Não é a mesma armadilha das colunas mortas: o ledger é imutável
e precisa continuar legível se o lote for renomeado ou removido. A regra fica explícita no
código — `lote_id` para juntar, `lote` para ler o histórico.

## Motor de estoque

Todas as guardas seguem o padrão do módulo: **condição no `WHERE` com `RETURNING`**, nunca
read-then-write, e sem `MAX(0, …)` — saturar em silêncio foi bug corrigido duas vezes aqui.

Em `registrarMovimentacao`, depois de resolver o material e antes de qualquer efeito de saldo:

1. **Resolver o lote.** Aceita `lote_id` ou o par (`material_id`, código do lote). Código
   inexistente numa saída é erro; numa entrada, cria (ver "Origem" abaixo).
2. **`controle_lote`:** material com a flag exige lote em entrada e saída → 400 sem ele.
3. **Saída com lote — três guardas, nesta ordem:**
   - status do lote é `ATIVO` (senão: "Lote bloqueado/reprovado não pode ser utilizado",
     ecoando a mensagem que `BLOQUEIO` já usa para material);
   - `data_validade` nula ou `>= date('now')` (senão: lote vencido);
   - claim atômico do saldo daquele lote —
     `UPDATE … SET quantidade = quantidade - ? WHERE id = ? AND quantidade >= ? RETURNING id`.
     Não casou ⇒ 400 com o saldo real do lote. **É esta linha que fecha o buraco do −8.**
4. **Entrada com lote:** resolve ou cria e credita a linha `(material, localização, lote)`.

`syncMaterialTotals` continua somando as linhas — mas agora nenhuma delas pode ficar negativa
por saída, então a soma para de esconder erro.

## Origem: o lote nasce no recebimento

- `recebimentos_material_itens_almoxarifado` ganha `lote_id`; o `lote TEXT` existente vira o
  código digitado (a tela passa a ter o campo, hoje inexistente).
- `darEntradaEstoque` (`receiptService.js:308`) resolve/cria o lote antes de chamar o motor,
  herdando fornecedor, NF, validade e corrida do recebimento.
- **`controle_certificado` deixa de ser `SELECT` morto:** sem `certificado_arquivo`, o lote
  nasce `BLOQUEADO` com `status_motivo = 'Certificado do fornecedor não anexado'`. Anexar o
  certificado libera — e essa liberação é auditada como qualquer mudança de status.
- Upload do certificado precisa de um multer próprio: o `uploadAlmox` existente aceita **só
  imagens** (`routes/almoxarifado.js:52-59`) e certificado é PDF. A ordem
  `requirePermission` → `multer` é obrigatória, pelo motivo já documentado em
  `routes/almoxarifado.js:576-578` (invertida, o arquivo é gravado antes do 403).

## Mudança de status do lote não é movimentação de estoque

Bloquear, reprovar ou liberar um lote **não** cria linha em `movimentacoes_almoxarifado`. Não há
quantidade mudando de lugar, e emitir um `BLOQUEIO` ali somaria em
`materiais_almoxarifado.quantidade_bloqueada`, contando duas vezes a mesma retenção.

O registro vai para `auditoria_log_almoxarifado` (via `services/almoxarifado/audit.js`, que já é
usado e testado) com `entidade = 'lote'`, status anterior e novo, e **justificativa
obrigatória** — mesma exigência do bloqueio avulso da Etapa 5.

## Permissões

Sem ação nova em `ACAO_PERFIS` — as existentes cobrem, e cada ação nova é mais uma linha para a
tela de perfis manter em dia:

| Operação | Ação existente |
|---|---|
| Ver lotes | `visualizar` |
| Criar lote / anexar certificado | `receber_material` |
| Bloquear, reprovar, liberar lote | `inspecionar` (precedente da Etapa 5) |
| Editar dados do lote (validade, corrida) | `editar_material` |

## Leitura e FEFO

`GET /api/almoxarifado/materiais/:id/lotes` — lotes com saldo, cada um com `saldo_disponivel`,
`status`, `vencido` (derivado) e `dias_para_vencer`. Ordenação FEFO: validade crescente, nulos
por último, e lotes não-`ATIVO` ou vencidos ao fim da lista (aparecem, desabilitados, para não
sumirem sem explicação). A tela pré-seleciona o primeiro elegível; o operador pode trocar.

## Consumo pelas features vizinhas

- **09 (inspeção):** reprovar item com lote passa a marcar o lote `REPROVADO` em vez de bloquear
  o material inteiro. É a razão de a Etapa 6 vir logo depois da 5.
- **03 (motor):** fecha "validação de vencido/lote reprovado", parado esperando esta etapa.
- **07 (reservas):** reserva por lote **não** entra aqui — continua aberta na feature 07.

## O que a Etapa 6 não cobre

Números de série · etiquetas e QR Code · reserva por lote · genealogia (ligar lote de compra a
lote de produção da tabela `lotes` de `index.js:19554`) · retenção parcial de um lote em
quantidade (decidido: status, não quantidade).

## Regras que nascem com teste de API

| Regra | Teste |
|---|---|
| Saída não deixa a linha do lote negativa | `saida acima do saldo do lote falha` |
| Material com `controle_lote` exige lote | `movimentar material controlado sem lote falha` |
| Saída de lote vencido falha | `saida de lote vencido falha` |
| Saída de lote bloqueado/reprovado falha | `saida de lote reprovado falha` |
| Soma dos lotes = saldo do material | `soma dos lotes igual saldo total` |
| Recebimento cria o lote com dados da NF | `recebimento gera lote com fornecedor e validade` |
| Sem certificado o lote nasce bloqueado | `entrada sem certificado nasce bloqueada` |
| Anexar certificado libera o lote | `anexar certificado libera o lote` |
| Mudança de status audita com justificativa | `bloquear lote sem justificativa falha` |
| FEFO ordena por validade, nulos por último | `lotes ordenados por validade` |

Cada uma nasce **vermelha** antes da implementação. Onde o teste passar de primeira, roda-se um
controle positivo mutando o código — a base já teve três testes vazios, e o `−8` acima é
exatamente o tipo de erro que um teste ingênuo não pega.
