# Etapa 110 — o Saldo Inicial do cadastro passa pelo motor, e a corrida da família fecha dos dois lados (design)

> Origem: "Próxima tarefa detalhada — Etapa 110" do plano da 108 (**C215**) e a **B61** de Compras / **C218** do
> almoxarifado (plano da 109, "Próxima de Compras"). As duas mexem no cadastro de material (`createMaterial`, o `PUT` de
> material) e por isso vão juntas e em série.
> Plano: `docs/superpowers/plans/2026-10-15-almoxarifado-etapa110-saldo-inicial-e-corrida-da-familia.md`.

## Fase 0 — medido (2026-10-15, worktree `CRM-wt-e110`, HEAD `0686c3a8`)

Sondas `server/tests/sonda/e110f0.js` e `server/tests/sonda/e110f0b61.js` (não versionadas).

### C215 — o Saldo Inicial

| Caso | Hoje |
|---|---|
| `POST /materiais` com `quantidade_atual: 5` — Administrador, Almoxarife, **Engenharia** | 201 nos três, saldo 5 |
| Saldo inicial 4 em material de cliente / `controle_lote` / `controle_serie` / `requer_inspecao` / com localização padrão | 201 em todos; saldo 4 disponível, `em_inspecao` 0, **0 lotes**, nenhuma série; a linha do livro tem `localizacao_destino_id` NULL e `documento_vinculado` NULL |
| A linha do livro | `INSERT` direto em `createMaterial` (`'Saldo inicial de cadastro'`), sem `registrarMovimentacao`: sem trava, sem origem (ip/user_agent), sem destino |
| Outras portas que criam material | só o `POST` (o formulário de cadastro, Remessas e Sobras). Remessas (`RemessasTerceirosAlmoxarifado.js:312`) e Sobras (`SobrasAlmoxarifado.js:316`) **não** mandam `quantidade_atual` (reconfirmado). Nenhuma outra porta do servidor faz `INSERT INTO materiais_almoxarifado` |
| O que a **Entrada manual** (`POST /movimentacoes/v2`, tela Movimentações) cobra, sobre material com saldo 0 | **lote** obrigatório para `controle_lote` (400 *"O material S6 exige lote nesta movimentacao (controle por lote ligado)"*); **séries** para `controle_serie` (400 *"material com controle de serie: informe 3 serie(s) para 3 unidade(s) — recebidas 0"*); `movimentar` (gate da rota). **Não** cobra documento de material de cliente (201 sem documento) e **não** retém material com inspeção obrigatória (201, `em_inspecao` 0); 2,5 em `PC` aceito |

**A C215 estava parcialmente errada, e fica dito.** Ela dizia que o saldo inicial pulava "o documento do cliente (a
Entrada da tela exige documento para material de cliente — Etapa 8)" e "a inspeção". **A Entrada manual não exige nenhum
dos dois** — medido. Quem exige documento de material de cliente é o **Recebimento** (`receiptService`, Etapa 8, cenário 4),
e quem retém material com inspeção é o **Recebimento** (a nota). Por isso "passar pelas mesmas regras de uma Entrada" não
basta para esses dois casos: com o motor, o saldo inicial de material de cliente e de material com inspeção continuaria
entrando sem documento e disponível — exatamente como a Entrada manual faz hoje. Esse furo da Entrada manual é **anterior**
e vira **C219** (não é desta etapa corrigi-lo — muda a tela de Movimentações).

### B61 / C218 — a corrida da família

30 rodadas por caso, duas requisições HTTP disparadas juntas (`Promise.all`):

| Par | Família inativa com material ativo |
|---|---|
| `POST /materiais` × `DELETE /familias/:id` | **30/30** nas duas ordens |
| `PUT /materiais/:id` (troca de família) × `DELETE /familias/:id` (a nova) | **30/30** nas duas ordens |
| `POST /materiais` com subfamília × `DELETE /familias/:sub` | **30/30** nas duas ordens |
| `POST /materiais` × `PUT /familias/:id {ativo: 0}` | 0/30 (material primeiro) e **6/30** (PUT primeiro) — a leitura extra do PUT estreita a janela, não a fecha |

**A B61 de Compras dizia que "a importação usa o mesmo `createMaterial`" — não existe importação de material** (nenhuma
rota, tela ou script; o único `INSERT INTO materiais_almoxarifado` do servidor é o de `createMaterial`). O cuidado da
retentativa por `UNIQUE` vale; o da importação não tem onde valer.

Anteriores achados na medição (não são corrida, ficam fora — letra C):
- **C220** — reativar pelo `PUT` (`ativo: 1`) um material inativo cuja família está inativa: **200** (sem corrida). O
  estado proibido nasce sem pressa nenhuma.
- **C221** — as outras escritas de família que conferem e gravam em passos separados: o `PUT` de família que muda o nível
  (`nivelMuda`, conta material e depois grava) e o `POST` de subfamília sob raiz que está sendo inativada. Mesma forma de
  defeito; não medidas por corrida nesta etapa.

## Decisões

### C215 — o caminho escolhido (letra B, **B721**)

**Escolhido (a, com recorte):** o saldo inicial **continua** no cadastro, mas passa a ser uma Entrada **pelo motor**
(`stockService.registrarMovimentacao`, `ENTRADA`, `exigeLote` e `exigeSerie` ligados), e só onde a Entrada do motor cobra
tudo o que esse material exige:
1. exige a permissão **`movimentar`** (o cadastro continua sendo `criar_material`; o saldo é uma entrada);
2. **recusa** saldo inicial > 0 em material com **controle por lote**, **controle por série**, **inspeção obrigatória** ou
   **de cliente** — com a mensagem que manda cadastrar com 0 e lançar a entrada em Movimentações (lote, série) ou pelo
   Recebimento (inspeção, cliente). Montar lote/série no cadastro duplicaria a tela de Movimentações; para inspeção e
   cliente a Entrada manual não cobraria nada (C219);
3. o material sem esses controles, nosso, por quem movimenta, nasce com saldo como hoje — mas a linha do livro sai do
   motor: trava por material, origem (ip/navegador), destino (a localização padrão quando houver), saldo por localização,
   alerta de mínimo.

**Descartados:** (b) remover o Saldo Inicial do cadastro (muda a tela que existe desde a Etapa 2 e tira a implantação
rápida de material simples — o caso que não tem risco); (a) sem recorte (lote e série recusariam pelo próprio motor, mas
com a mensagem da Entrada, que fala em "nesta movimentação" para quem está num cadastro; e cliente/inspeção passariam).
**Reversível:** a recusa é uma função (`saldoInicialRecusado`) e a permissão uma linha na rota.

### B61 — fechar dos dois lados (B722)

Gravação **condicional**, um comando SQL só (o SQLite executa um comando inteiro antes ou depois do outro — a conexão é
uma):
- `createMaterial`: `INSERT … SELECT … WHERE EXISTS (família raiz ativa) AND (sub nula OR EXISTS (sub ativa filha))`, em
  **todas** as tentativas da retentativa de código. Não gravou → relê com `validateFamiliaAtiva`/`validateSubfamilia` e
  responde a literal de hoje. "Não gravou por família" nunca vira "Código já existe" (sem linha do `SELECT`, não há
  colisão de `UNIQUE`).
- `PUT /materiais/:id`: quando a família ou a subfamília **são validadas** (as mesmas condições de hoje), o `UPDATE` ganha
  as mesmas condições, ao lado da do dono (Etapa 108).
- `DELETE /familias/:id` e `PUT /familias/:id` na transição 1 → 0: o `UPDATE … SET ativo = 0` ganha `NOT EXISTS (material
  ativo pela família ou pela subfamília) AND NOT EXISTS (subfamília ativa)`. Não gravou → relê e responde a literal de
  hoje (itens, depois subfamílias — a ordem de hoje).

**Descartados:** só um lado (*write skew*: cada lado confere o que o outro está prestes a mudar); a trava por material
(é do disponível, e família não é material); `BEGIN IMMEDIATE` (a base não usa transação explícita nesta conexão; o motor
compensa — memória "Migração SQLite → Postgres"); fechar a C220/C221 junto (outras escritas, outro risco — ficam
nomeadas).
