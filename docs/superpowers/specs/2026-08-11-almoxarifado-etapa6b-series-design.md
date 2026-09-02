# Almoxarifado — Etapa 6b: Números de Série (design)

> **Data:** 2026-08-11 · **Status:** aprovado (decisões tomadas pela recomendação do assistente,
> com autorização prévia do usuário nesta sessão: "todas as perguntas que for me fazer pode
> seguir sua resposta recomendada") · **Briefing de origem:** seção final de
> `docs/superpowers/plans/2026-08-09-almoxarifado-etapa6-lotes.md`
> **Feature:** `specs/modulo-almoxarifado/10-lotes-series-etiquetas` (parte 6b)

## O problema

A GMP rastreia número de série individualmente hoje, no papel/planilha (confirmado com o cliente
em 2026-08-09 — é rotina, não exceção). No sistema, `controle_serie` existe no cadastro do
material, é gravada pelo CRUD e pelo formulário, e **nunca é lida por regra nenhuma** — é uma das
três flags mortas que a Etapa 6 deixou documentadas na spec 10. Esta etapa acende a flag: ligar
`controle_serie` passa a exigir um número de série por unidade na entrada e na saída, com
rastreabilidade de onde cada unidade está e por onde passou.

**Critério de "a etapa terminou":** a flag `controle_serie` tem efeito real, com testes de API
provando cada regra essencial.

## Decisões tomadas (perguntas + resposta recomendada adotada)

1. **Como digitar N séries na tela?** O briefing listou três caminhos (colar lista, sequência
   prefixo+contador, código de barras) e mandou decidir antes de escrever a tela. **Adotado:
   textarea "uma série por linha" + botão "Gerar sequência" (prefixo + número inicial), com
   contador `N/quantidade` ao vivo.** Código de barras fica para a 6c (QR/etiquetas), que é onde
   o hardware de leitura entra.
2. **Status da série — mínimos, um escritor por status:** `EM_ESTOQUE`, `BLOQUEADA` (presente no
   estoque, saída recusada — espelho do lote bloqueado), `ENTREGUE` (saiu por consumo/entrega),
   `SUCATEADA` (saiu por SUCATA/PERDA), `ESTORNADA` (a entrada que a criou foi estornada).
   "Em terceiro" **não existe** — é a feature 14, que não tem backend; criar o status agora seria
   coluna morta.
3. **Alcance do enforcement = o mesmo do `controle_lote`:** exige série só onde há como
   informá-la — movimentação manual (v1/v2) e recebimento. Os **4 fluxos internos** (entrega de
   requisição, estorno de exclusão administrativa, devolução, sucata de devolução) ficam
   **isentos e declarados**, exatamente como a decisão do review final de 2026-08-10 fez com o
   lote. Transferência também não exige série — mesma lacuna já declarada para lote na spec 11;
   corrigir os dois juntos é tarefa futura da 11.
4. **Invariante com teste obrigatório:** para material com `controle_serie`,
   `COUNT(séries com status EM_ESTOQUE ou BLOQUEADA) == materiais_almoxarifado.quantidade_atual`.
   Todo teste de API da etapa fecha verificando o invariante (helper compartilhado) — é a defesa
   contra o padrão "coluna divergindo em silêncio" que este módulo já viu quatro vezes.
5. **Quantidade inteira:** material com `controle_serie` recusa quantidade fracionária em
   entrada/saída (série é unitária; 2.5 unidades com série não existe).
6. **Permissões — nenhuma ação nova** (regra da Etapa 6): `visualizar` lê, `movimentar` move (já
   é a permissão das rotas de movimentação), `inspecionar` bloqueia/desbloqueia série,
   `receber_material` cria série via recebimento.
7. **UI de rastreabilidade: aba "Séries" dentro de `LotesAlmoxarifado.js`** (decisão barata do
   briefing) — a tela já tem o padrão "escolher material → listar"; uma tela nova duplicaria isso
   e exigiria rota + menu + lazy import. A tela vira "Lotes e Séries" no título/menu.
8. **No recebimento, o campo de séries acompanha os campos de lote** (mesma etapa do workflow,
   mesmo gate de exibição). Reposicionar os campos para a conferência é redesenho do workflow de
   recebimento — fora do escopo da 6b.

## Abordagens consideradas

**A (adotada) — tabela `series_almoxarifado` como registro de posse + enforcement no motor.**
1 linha = 1 unidade física; o serviço `seriesService` é dono único da tabela (molde:
`lotService`); o motor (`stockService.registrarMovimentacao`) valida e transiciona status nos
mesmos pontos onde o lote é validado e claimado. Prós: segue o padrão que a Etapa 6 provou
(dono único, guarda no WHERE, auditoria, compensação); o saldo agregado continua sendo
`quantidade_atual` + `estoque_saldo_almoxarifado`, sem mudar nada do que existe. Contras: dois
registros paralelos (saldo numérico + linhas de série) — mitigado pelo invariante com teste.

**B (rejeitada) — `serie_id` em `estoque_saldo_almoxarifado`.** Transformaria a tabela de saldo
num inventário unitário com `quantidade` sempre 0/1. É a armadilha que o briefing veta
explicitamente ("não crie serie_id na tabela de saldo") — recriaria a classe de coluna
mal-escrita que a Etapa 6 removeu.

**C (rejeitada) — série como "lote de quantidade 1"** reutilizando `lotes_almoxarifado`.
Tentadora (reusa tudo), mas errada: cardinalidade e ciclo de vida diferem (lote é 1↔N com saldo
REAL; série é 1↔1 com estado), poluiria o FEFO e o seletor de lotes da saída, e `UNIQUE
(material_id, codigo)` passaria a misturar dois conceitos no mesmo namespace.

## Modelo de dados

```sql
CREATE TABLE IF NOT EXISTS series_almoxarifado (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  material_id INTEGER NOT NULL,
  numero TEXT NOT NULL,                       -- trim; único por material
  status TEXT NOT NULL DEFAULT 'EM_ESTOQUE',  -- EM_ESTOQUE | BLOQUEADA | ENTREGUE | SUCATEADA | ESTORNADA
  status_motivo TEXT,
  lote_id INTEGER,                            -- opcional: motor com série E corrida existe
  localizacao_id INTEGER,                     -- onde a unidade está (informativo, atualizado na entrada)
  recebimento_id INTEGER,                     -- origem, quando nasceu de nota
  recebimento_item_id INTEGER,
  movimentacao_entrada_id INTEGER,            -- última entrada que a colocou em estoque
  movimentacao_saida_id INTEGER,              -- última saída que a tirou
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_por INTEGER,
  updated_at DATETIME,
  UNIQUE (material_id, numero),
  FOREIGN KEY (material_id) REFERENCES materiais_almoxarifado(id),
  FOREIGN KEY (lote_id) REFERENCES lotes_almoxarifado(id),
  FOREIGN KEY (localizacao_id) REFERENCES localizacoes_almoxarifado(id)
);
```

- Nasce no `initSchema` pelo padrão existente (`CREATE TABLE IF NOT EXISTS` + índice); **não
  precisa de migração com ledger** — tabela nova, sem backfill (não há série legada no sistema).
- Índices: o UNIQUE acima + `idx_series_almox_material_status (material_id, status)` para a
  consulta de disponíveis e o invariante.
- "Presente no estoque" ≡ `status IN ('EM_ESTOQUE','BLOQUEADA')`. Elegível para saída ≡
  `status = 'EM_ESTOQUE'` (espelho exato do lote: bloqueio segura a saída, não o saldo).

## `seriesService.js` (dono único da tabela — molde: `lotService`)

| função | contrato |
|---|---|
| `getSerie(db, id)` / `getSeriePorNumero(db, materialId, numero)` | leitura simples; `trim` no número |
| `listarSeriesDoMaterial(db, materialId, { status } = {})` | linhas + `lote_codigo` (LEFT JOIN), ordenadas por `numero` |
| `entradaSeries(db, user, { material_id, numeros[], lote_id, localizacao_id, movimentacao_id })` | para cada número: não existe → INSERT `EM_ESTOQUE`; existe com status de fora (`ENTREGUE`/`SUCATEADA`/`ESTORNADA`) → reativa via `UPDATE ... WHERE id=? AND status=?` (guarda no WHERE); existe presente (`EM_ESTOQUE`/`BLOQUEADA`) → **erro 400 "série já está em estoque"**. Devolve os ids afetados para compensação |
| `claimSaidaSeries(db, user, { material_id, serie_ids[], lote_id, tipo, movimentacao_id })` | claim atômico por série: `UPDATE ... SET status=?, movimentacao_saida_id=? WHERE id=? AND material_id=? AND status='EM_ESTOQUE' [AND lote_id=?] RETURNING id`; status destino `SUCATEADA` para SUCATA/PERDA, senão `ENTREGUE`. Qualquer série que não case → desfaz os claims já feitos e erro 400 nomeando a série |
| `reverterSaida(db, user, movimentacaoId)` | estorno de saída: séries com `movimentacao_saida_id = ?` e status `ENTREGUE`/`SUCATEADA` voltam a `EM_ESTOQUE` |
| `reverterEntrada(db, user, movimentacaoId)` | estorno de entrada: séries com `movimentacao_entrada_id = ?` ainda `EM_ESTOQUE` viram `ESTORNADA` (as que já saíram ficam — o piso do estorno no saldo já barra o excesso) |
| `mudarStatusSerie(db, user, serieId, novoStatus, justificativa)` | só `EM_ESTOQUE ↔ BLOQUEADA`, justificativa obrigatória, guarda no WHERE, 409 em corrida |

Toda mutação grava `registrarAuditoria` com `entidade: 'serie'` (ações `CRIACAO`,
`REATIVACAO`, `SAIDA`, `ESTORNO_SAIDA`, `ESTORNO_ENTRADA`, `MUDANCA_STATUS`), no padrão exato do
`lotService` (`dados_anteriores`/`dados_novos`, `usuario_nome: user?.nome || user?.email`).

## Integração com o motor (`stockService.registrarMovimentacao`)

Espelha o lote, nos três pontos já mapeados:

1. **Resolução + exigência** (junto da guarda `exigeLote`, hoje logo após a resolução do lote):
   novos params `series` (array de strings, entrada) e `serie_ids` (array de números, saída).
   Guarda: `opcoes.exigeSerie && material.controle_serie && (tiposEntrada || tiposSaida)` →
   exige o array com **cardinalidade === quantidade** e quantidade inteira. Falha aqui acontece
   **antes de qualquer efeito**.
2. **Validação de estado (saída)**: pertence ao mesmo bloco da guarda de status/validade do lote —
   mas para série a validação e o efeito são a mesma operação (claim no WHERE), então o claim das
   séries roda **antes** da aplicação física do saldo: se qualquer série não estiver
   `EM_ESTOQUE` (ou não pertencer ao material/lote), nada foi movido ainda. Compensação: se o
   saldo falhar depois, os claims de série são desfeitos (mesmo padrão de compensação explícita
   do `claimSaldoDoLote` — não há transação, decisão conhecida até a migração Postgres).
3. **Entrada**: `entradaSeries` roda antes do crédito de saldo (é a validação mais estrita — série
   duplicada aborta sem efeito); se o crédito falhar, compensa revertendo as séries criadas.
   Estorno (`cancelarMovimentacao`): reversão de saída chama `reverterSaida`, reversão de entrada
   chama `reverterEntrada`, nos mesmos pontos onde o saldo é devolvido/retirado.

**Quem declara `exigeSerie: true`:** as mesmas três chamadas que declaram `exigeLote` — rota v1,
rota v2 e `receiptService.darEntradaEstoque`. Os 4 fluxos internos seguem sem a opção
(isenção declarada em comentário, como o lote).

**Interação lote×série:** material com as duas flags — as séries da saída devem pertencer ao
lote informado (`AND lote_id = ?` no claim); na entrada, as séries nascem já vinculadas ao
`loteIdFinal` resolvido.

## Recebimento (`receiptService`)

- Item de recebimento ganha coluna `series TEXT` (lista "uma por linha", como digitada) via
  `safeAlter`, salva pelos mesmos caminhos dos campos de lote (`conferirRecebimento` /
  rota fiscal, whitelist do payload).
- **Pré-checagem da nota inteira** (bloco existente): item de material com `controle_serie` sem
  N séries válidas para N unidades → a nota é recusada **inteira**, antes de mover qualquer
  coisa (mesma régua do lote).
- `darEntradaEstoque`: o `SELECT` dos itens passa a trazer `m.controle_serie`; as séries do item
  são parseadas e repassadas ao motor via `params.series` + `opcoes.exigeSerie` — a criação
  passa pelo motor → `seriesService` (**escritor único da tabela**); o `receiptService` não
  insere série por fora. Depois do motor, o
  `receiptService` griffa a origem: `UPDATE series_almoxarifado SET recebimento_id=?,
  recebimento_item_id=? WHERE material_id=? AND numero IN (...)`.
- Idempotência preservada: o claim `entrada_estoque_em IS NULL` já garante que item processado
  não reprocessa — as séries não nascem duas vezes.
- Item retido em QUARENTENA: as séries entram `EM_ESTOQUE` normalmente (a retenção é do
  material, por quantidade). Bloquear série individual pela inspeção fica **fora do escopo**,
  espelhando a pendência já declarada "reprovação por lote não ligada à inspeção" (feature 09).

## Rotas (padrão das rotas de lote em `extended.js`)

| rota | permissão | corpo |
|---|---|---|
| `GET /api/almoxarifado/materiais/:id/series?status=` | `visualizar` | — (lista com `lote_codigo`) |
| `PUT /api/almoxarifado/series/:id/status` | `inspecionar` | `{ status: 'BLOQUEADA'\|'EM_ESTOQUE', justificativa }` (Zod) |

`MovimentacaoSchema` (Zod) ganha `series: z.array(z.string().trim().min(1)).optional()` e
`serie_ids: z.array(z.number().int().positive()).optional()` — **obrigatório declarar**, porque
o `validate` descarta chave não declarada em silêncio (aviso já existente no próprio arquivo).
A rota fiscal do recebimento adiciona `series` à whitelist de campos do item.

## Front

1. **`MovimentacoesAlmoxarifado.js`** — quando `selectedMaterial?.controle_serie`:
   - Entrada: textarea "Números de série (um por linha)" (`almox-form-full`, molde do campo
     Observações) + contador `N/quantidade` + botão "Gerar sequência" (prefixo + nº inicial →
     preenche a textarea). Payload: `series` (strings).
   - Saída/Sucata/Perda: lista de séries `EM_ESTOQUE` (fetch `GET .../series?status=EM_ESTOQUE`,
     mesmo padrão de efeito com guarda `cancelado` do fetch de lotes) com checkboxes e filtro de
     texto; contador `N/quantidade`. Payload: `serie_ids`. Se houver lote selecionado, filtra as
     séries do lote.
   - Campo novo entra no reset do `openModal`, na limpeza do `onChange` de tipo e na regra "só
     envia campo que o tipo exibe".
2. **`RecebimentosAlmoxarifado.js`** — textarea "Séries (uma por linha)" por item, ao lado dos 4
   campos de lote (mesmo gate de etapa), com contador contra `quantidade_recebida`; entra na
   whitelist do payload fiscal.
3. **`LotesAlmoxarifado.js`** — vira "Lotes e Séries": estado `aba` (`'LOTES' | 'SERIES'`) com
   botões entre o filtro de material e a tabela, reaproveitando `materialId`/`materiais`/
   `reloadToken`. Aba Séries: tabela (número, status com badge, lote, localização, última
   entrada/saída) + ação Bloquear/Desbloquear com justificativa (gate `inspecionar`), filtro por
   status. Menu/rota não mudam (label do menu vira "Lotes e Séries").
4. **`MaterialAlmoxarifadoForm.js`** — `CONTROLE_CHECKS` ganha `hint` e o checkbox de
   `controle_serie` explica: "exigirá um número de série por unidade na entrada e na saída".
5. **`ExtratoMaterialModal.js`** *(barato, incluído)* — KPI "Séries em estoque" quando o material
   tem `controle_serie` (a partir da listagem de séries, sem endpoint novo).

## Erros (mensagens nomeando a série)

- Cardinalidade: `"material com controle de série: informe N série(s) para N unidade(s) — recebidas M"`.
- Entrada duplicada: `"série X já está em estoque"` (o teste que a spec 10 já exige).
- Saída inelegível: `"série X não está disponível (status BLOQUEADA)"` / `"série X não pertence ao lote Y"`.
- Quantidade fracionária: `"material com controle de série exige quantidade inteira"`.

## Testes

**API (`server/tests/api/`, harness existente):**
- `serieControleObrigatorio.api.test.js` — entrada sem séries falha; cardinalidade errada falha
  (N−1 e N+1); entrada de série já em estoque falha; os 4 fluxos internos continuam passando sem
  série (isenção declarada); rota v2 não consegue ligar `exigeSerie` pelo body; quantidade
  fracionária falha.
- `serieGuardasSaida.api.test.js` — saída exige `serie_ids` com cardinalidade; série de outro
  material/lote falha; série BLOQUEADA falha e desfaz claims parciais; SUCATA/PERDA marca
  `SUCATEADA`; saída ok marca `ENTREGUE`.
- `serieEstornoDevolucao.api.test.js` — estorno de saída devolve as séries a `EM_ESTOQUE`;
  estorno de entrada marca `ESTORNADA`; reentrada manual de série `ENTREGUE` reativa.
- `serieRecebimento.api.test.js` — nota com item sem séries em material controlado é recusada
  inteira; nota ok cria séries vinculadas a lote/recebimento; reprocessar não duplica séries.
- `serieRotas.api.test.js` — listagem por status; bloquear/desbloquear exige justificativa e
  `inspecionar`; corrida (status mudou) → 409.
- **Todos** fecham com o helper de invariante (`COUNT(presentes) === quantidade_atual`).
- Controle positivo: cada arquivo novo roda ao menos um caso que falha sem a feature (a regra da
  casa contra teste vazio).

**Client (padrão `createRoot` + mocks):** teste da textarea/contador/limpeza por tipo em
Movimentações; teste da aba Séries em `LotesAlmoxarifado.test.js` (renderiza, troca de aba,
bloqueio com justificativa, corrida de resposta atrasada).

## Fora do escopo (declarado, não implícito)

- Etiquetas e QR Code (**6c**).
- Série nos 4 fluxos internos (entrega/exclusão de requisição, devolução, sucata de devolução) e
  na transferência — mesmas isenções do lote, mesma pendência declarada (specs 04/11/12).
- Bloqueio de série pela inspeção do recebimento (espelho da pendência lote×inspeção, feature 09).
- Reserva por série (feature 07) e genealogia lote↔lote.
- "Em terceiro" como status (feature 14, sem backend).
- Leitura por código de barras (6c).

## Documentação a atualizar no fim da etapa

Spec 10 (checklist 6b), README mestre (linha 10 + Etapa 6b), guia do usuário (seção Etapa 6b com
Antes→Agora e roteiro de teste com 2 usuários não é necessário aqui — 1 basta), plano da etapa em
`docs/superpowers/plans/` com a próxima tarefa (6c) detalhada.
