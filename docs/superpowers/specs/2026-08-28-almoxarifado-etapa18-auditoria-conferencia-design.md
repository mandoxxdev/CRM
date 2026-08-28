# Almoxarifado — Etapa 18: a conferência de inventário passa a deixar rastro (design)

Data: 2026-08-28 · Branch: `desenvolvimento-almoxarifado`
Origem: handoff do plano da Etapa 17 (candidata 1) + `specs/modulo-almoxarifado/23-perfis-seguranca-auditoria/README.md`.

## Decisão de escopo (Fase 0 — medida em 2026-08-28)

A medição achou um buraco **diferente e maior** do que a spec descrevia:

- **A spec 23 e a spec 03 documentam um bug que JÁ MORREU.** Ambas dizem que a conclusão da
  conferência escreve `quantidade_atual` "por fora do motor" — isso acabou na Etapa 10
  (`grep "SET quantidade_atual"` nas rotas do módulo devolve **zero**; o ajuste vira
  `AJUSTE_INVENTARIO` pelo motor, com teste). A spec 17 registrou a correção; a 03 e a 23
  ficaram para trás. **Corrigir as duas, dizendo que estavam erradas, faz parte desta etapa**
  (regra 5 do CLAUDE.md — apagar em silêncio faz o próximo confiar de novo).
- **O risco real não é de saldo, é de rastro:** abrir, contar, recontar, concluir e cancelar
  uma conferência **não geram uma única linha de auditoria**. O bloco `/conferencias` é o
  único fluxo grande do módulo sem serviço próprio (tudo inline na rota) e `registrarAuditoria`
  nunca é chamado ali.
- **O cancelamento é o pior:** `PUT /conferencias/:id/cancelar` só faz
  `UPDATE ... SET status='CANCELADO'`. Sem autor, sem data, sem motivo. Uma conferência com
  300 contagens some do fluxo e ninguém sabe quem mandou nem por quê.
- **A conclusão SEM ajustes não deixa vestígio nenhum** — nenhuma movimentação é criada, e
  `data_fim` não tem autor. "Quem fechou este inventário?" não tem resposta.
- **Duas colunas mortas:** `conferencias_almoxarifado.aprovador_id`/`aprovador_nome` existem
  no schema desde a Etapa 10 e **nunca foram escritas por ninguém**.
- **Correção sobrescreve o passado:** o primeiro contador pode corrigir a própria contagem, e
  o valor anterior evapora (não há histórico). O log seria a única memória do "de/para".
- **A spec 23 afirma que "excluir requisição" audita — é FALSO:** `requisitionService.js` tem
  zero chamadas de `registrarAuditoria`; só os estornos aparecem, como `movimentacao`.
- **Assimetria gritante:** `PUT /materiais/:id` audita; `DELETE /materiais/:id` (soft-delete)
  não.
- **Zero testes de auditoria de inventário:** os 8 arquivos de teste de conferência não
  mencionam auditoria. O único teste é do motor (`AJUSTE_INVENTARIO`), não da conferência.

**Escopo escolhido:** a trilha do inventário ponta a ponta + as três assimetrias baratas e
graves ao lado + a correção das specs erradas.

1. **`entidade: 'conferencia'` com 5 ações** — `CRIACAO`, `CONTAGEM`, `RECONTAGEM`,
   `CONCLUSAO`, `CANCELAMENTO`. Todas **pós-escrita** e **best-effort** (`.catch`), no molde
   de `scrapDisposalService` — auditoria nunca derruba operação já efetivada.
2. **Cancelar passa a exigir motivo** e a gravar autor/data (colunas novas por `safeAlter`),
   como já fazem os outros cancelamentos do módulo.
3. **As colunas mortas `aprovador_*` passam a ser escritas na conclusão** — quem conclui
   aplicando ajuste É quem homologa; a coluna existe para isso.
4. **Três atos vizinhos ganham auditoria:** `DELETE /materiais/:id`,
   `PUT /requisicoes/:id/cancelar`, `DELETE /requisicoes/:id`.
5. **Specs 03 e 23 corrigidas em voz alta.**

**Fica FORA, declarado:**

- **Os ~20 endpoints de cadastro e configuração** (tipos, localizações, setores, famílias,
  configurações, centros de custo, almoxarifados, permissões de setor) — bloco coerente e
  grande, item `:44` da spec 23; é a etapa seguinte natural. **Nomeado, não esquecido:** a
  mudança de configuração é a mais sensível deles (altera regra de negócio sem trilha).
- **Tela de auditoria no front** — a rota `GET /almoxarifado/auditoria` existe e **nenhuma
  tela a consome**; construir a tela é outra fatia (e ela precisa de gate: hoje a rota tem só
  `auth`, sem `requirePermission` — **decisão B: fechar esse gate entra nesta etapa**, porque
  é exposição atual, não feature nova).
- **Histórico de valores de contagem como entidade** — o log guarda o de/para; tabela de
  versões de contagem é outra coisa.
- **User-agent/IP na movimentação** e **lançamento retroativo** — itens abertos da spec 23,
  sem demanda.

## Arquitetura

### 1. Onde cada auditoria entra (todas pós-escrita, best-effort)

| Ato | Ponto | `acao` | `dados_novos` |
|---|---|---|---|
| Criar conferência | após o INSERT dos itens (`routes/almoxarifado.js` ~936) | `CRIACAO` | `{ numero, tipo, escopo_descricao, modo_cego, dupla_contagem, tolerancia_percentual, total_itens }` |
| Contar item | após o UPDATE do item (~1022), ramo normal | `CONTAGEM` | `{ conferencia_numero, item_id, material_codigo, quantidade_sistema, quantidade_contada, divergencia }` + `dados_anteriores` com a contagem anterior quando for **correção do próprio contador** (é o caso em que o passado evapora) |
| Recontar | mesmo ponto, ramo `marcaRecontagem` | `RECONTAGEM` | idem + `{ recontado_por_nome }`, com `dados_anteriores` = contagem do colega |
| Concluir | após o UPDATE final (~1209), **antes** dos ganchos existentes | `CONCLUSAO` | `{ numero, aplicar_ajustes, ajustesAplicados, impactoFinanceiro, itens_contados, itens_divergentes, tolerancia_percentual, modo_cego, dupla_contagem }`, `justificativa: justificativa_ajuste` |
| Cancelar | após o UPDATE (~1235) | `CANCELAMENTO` | `{ numero, status_anterior, itens_contados }`, `justificativa: motivo` |

`entidade_id` = id da conferência em todas (o log fica consultável por conferência num
`GET /auditoria?entidade=conferencia&entidade_id=N`).

### 2. Cancelar exige motivo e grava autor

- Colunas novas por `safeAlter` em `conferencias_almoxarifado`: `cancelado_por_id INTEGER`,
  `cancelado_por_nome TEXT`, `cancelado_em DATETIME`, `motivo_cancelamento TEXT`.
- `PUT /conferencias/:id/cancelar` passa a exigir `motivo` (≥ 5 caracteres, mesma régua da
  `justificativa_ajuste` da conclusão) → 400 com mensagem literal; grava as 4 colunas + audita.
- **Só cancela conferência ABERTA** (hoje a rota não checa status — conferência CONCLUIDA
  pode ser "cancelada", apagando o fato de que ela concluiu). 409 com mensagem literal.

### 3. `aprovador_*` deixam de ser colunas mortas

Na conclusão **com** `aplicar_ajustes`, gravar `aprovador_id`/`aprovador_nome` do usuário do
ato (é quem exerceu `ajustar_estoque`). Sem ajustes, ficam nulas — concluir sem mexer no saldo
não é homologação. (Alternativa descartada: gravar sempre, o que confundiria "fechou" com
"homologou ajuste".)

### 4. Gate da rota de auditoria

`GET /api/almoxarifado/auditoria` hoje tem só `auth` — qualquer usuário do módulo lê o log
inteiro (inclusive `dados_anteriores/novos` de material, custo, requisição). Passa a exigir
`requirePermission('configurar')` (ADMINISTRADOR) — o mesmo gate das telas de administração.
Decisão registrada na letra B: se o Gestor precisar ler auditoria, é abrir o gate para ele,
não deixar aberto para todos.

## Regras de negócio (RN)

- **RN-01 — Todo ato da conferência deixa rastro.** Criar, contar, recontar, concluir e
  cancelar geram uma linha em `auditoria_log_almoxarifado` com `entidade='conferencia'`,
  autor e `entidade_id` da conferência.
- **RN-02 — Auditoria nunca derruba o ato.** Falha ao registrar → o ato responde normal e o
  erro fica no log do servidor (padrão `compensarAssinatura`).
- **RN-03 — Cancelar exige motivo e só vale em ABERTO.** Sem motivo (ou < 5 chars) → 400
  literal; status ≠ ABERTO → 409 literal. Cancelamento grava autor, data e motivo.
- **RN-04 — A correção que sobrescreve guarda o de/para.** Quando o contador corrige a
  própria contagem, `dados_anteriores` carrega a quantidade anterior — a única memória.
- **RN-05 — `aprovador_*` só na conclusão COM ajuste.** Concluir sem aplicar não preenche.
- **RN-06 — Ler auditoria exige `configurar`.** Perfis sem a ação recebem 403.
- **RN-07 — Os três atos vizinhos auditam:** desativar material, cancelar requisição e
  excluir requisição geram linha (`material`/`requisicao`) com o de/para relevante.

## Testes

- **API** (`conferenciaAuditoria.api.test.js`): uma linha por ato (5 cenários), com autor e
  `entidade_id` certos; RN-04 (correção guarda o de/para); RN-02 (auditoria quebrada não
  derruba o ato — stub que lança); RN-03 (400 sem motivo, 409 em conferência concluída, e as
  4 colunas gravadas); RN-05 (aprovador só com ajuste).
- **API** (`auditoriaGate.api.test.js`): matriz de 8 perfis no `GET /auditoria` (RN-06).
- **API** (`auditoriaAtosVizinhos.api.test.js` ou dentro dos testes existentes): RN-07.
- **Jornada**: abrir → contar 2 itens → recontar 1 → concluir com ajuste → o log conta a
  história inteira em ordem, e o `GET /auditoria?entidade=conferencia&entidade_id=N` a
  devolve.
- Controle positivo obrigatório em cada teste que passar de primeira.

## O que muda em cada camada

| Camada | Mudança |
|---|---|
| `schema.js` | 4 colunas por `safeAlter` em `conferencias_almoxarifado` |
| `routes/almoxarifado.js` | 5 pontos de auditoria no bloco `/conferencias`; motivo+status no cancelar; `aprovador_*` na conclusão; auditoria no `DELETE /materiais/:id`, `PUT /requisicoes/:id/cancelar`, `DELETE /requisicoes/:id` |
| `routes/almoxarifado/extended.js` | gate `configurar` no `GET /auditoria` |
| `client` | cancelar conferência passa a pedir motivo (a tela precisa mandar) |
| `specs/03` e `specs/23` | correções declaradas |
