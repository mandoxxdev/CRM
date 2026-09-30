# 02 — Localizações e Endereçamento

> **Status:** 🟡 — Etapa 2 entregue (2026-08-04): multi-almoxarifado (entidade `almoxarifados` como raiz + migração ledger), restrições de endereço (bloqueio + tipos de material permitidos) aplicadas no motor, exclusão de localização com saldo bloqueada, `endereco_completo` + consultas de vazias/sem-endereço, gestão de almoxarifados e restrições no front. Falta: código de endereço padrão gerado, capacidade/peso/dimensões como enforcement, sugestão de localização na entrada, confirmação por leitura.
> **Spec original:** seções 3, 11
> **Última atualização:**  2026-09-30 (**Etapa 51** — a saída passa a baixar o endereço de onde o material sai; três afirmações desta spec corrigidas à vista em "O que já existe"). Anterior: 2026-08-11 (auditoria spec×código: corrigido o alcance real da validação de tipo permitido e da preservação de campos no PUT; áreas especiais reclassificadas como parcial)
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
- [ ] Código de endereço padrão gerado a partir da hierarquia (ex.: `ALM-GERAL-A03-E02-N04-P01`) — **não entregue**; o que existe é `endereco_completo`, um campo computado só para exibição no `GET /localizacoes` (caminho hierárquico "ALM-GERAL / Corredor A / A-01"), não um código compacto gerado/persistido
- [x] Restrições da posição: tipo de material permitido (`tipos_material_permitidos`) → validação na movimentação. **Correção 2026-08-11:** este item afirmava validação em "origem/destino/transferência/ajuste"; em `stockService.validarLocalizacaoParaMovimento` o tipo permitido só é avaliado quando `papel === 'destino'` (restringir por tipo é "o que pode entrar aqui", não "o que pode sair") — na origem a única guarda é `bloqueada`. O bloqueio, esse sim, vale nos quatro papéis
- [ ] Capacidade, peso máximo, dimensões como enforcement na movimentação — **fora de escopo por decisão do design** (item 3: "informativo apenas — adiado")
- [x] Bloquear/liberar endereço (`bloqueada` + validação em movimentação — origem OU destino OU transferência OU ajuste de localização); estorno **não** valida restrições (decisão deliberada — reverte mesmo se a localização foi bloqueada depois do movimento original)
- [x] Consultas: posições vazias (`GET /localizacoes/vazias`), materiais sem endereço (`GET /relatorios/materiais-sem-endereco`) — ocupação continua só parcial no mapa (pré-existente)
- [ ] Sugestão de localização na entrada (usa `localizacao_padrao_id` + restrições + espaço) — hoje existe só o fallback `resolveLocalizacaoEntrada` no `stockService` (destino informado || `localizacao_padrao_id` do material || null), sem considerar restrições nem espaço; a sugestão de verdade continua pendente
- [ ] Confirmação de localização por leitura (depende de código de barras — Etapa 15; deixar API pronta para receber `codigo_lido`)

### Frontend
- [x] Cadastro/gestão de almoxarifados — aba "Setores e Áreas" em `ConfiguracoesAlmoxarifado.js` (`AlmoxarifadosSection`)
- [ ] Tela de consulta de ocupação/vazias/sem endereço (pode ser aba do mapa) — rotas de backend prontas (`/localizacoes/vazias`, `/relatorios/materiais-sem-endereco`), **sem consumidor no front** ainda
- [x] Bloqueio de endereço no mapa — badge 🔒 em `MapaLocalizacoesAlmoxarifado.js`; filtro por almoxarifado também adicionado
- [x] Campos de restrição (`bloqueada`, `tipos_material_permitidos`) na edição de localização em `ConfiguracoesAlmoxarifado.js`

## Regras essenciais + testes de API exigidos

| Regra | Teste |
|-------|-------|
| Material com restrição não entra em posição incompatível | `restricoesEndereco.api.test.js`: "destino com tipos_material_permitidos restringe por tipo_material do material" |
| Endereço bloqueado não recebe nem fornece material (origem, destino, transferência, ajuste) | `restricoesEndereco.api.test.js`: "ENTRADA para localização bloqueada retorna 400", "SAIDA com origem bloqueada retorna 400", "TRANSFERENCIA com destino bloqueado retorna 400", "AJUSTE com localizacao_destino_id bloqueada retorna 400" |
| Endereço com material não pode ser excluído (inclusive saldo net-zero entre lotes) | `restricoesEndereco.api.test.js`: "DELETE localizacao com saldo retorna 400", "DELETE localizacao bloqueia mesmo quando SUM(quantidade) das linhas dá zero" |
| Migração vincula localizações existentes ao ALM-GERAL exatamente uma vez | `almoxarifados.api.test.js`: "migracao criou o Almoxarifado Geral e vinculou localizacoes existentes" |
| Saldo por localização bate com saldo total do material | **Etapa 51:** `saidaPorLocalizacao.api.test.js` confere, em cada um dos 24 cenários, que a soma das linhas é igual a `quantidade_atual` — e, em material sem lote que não permite negativo, que nenhum ENDEREÇO fica com saldo que não existe (a soma já batia antes; o que não batia era o endereço) |

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
- [ ] **Tela de vazias** — Etapa 52.

Testes: `saidaPorLocalizacao.api.test.js` **24/24** (os 8 cenários da sonda da Fase 0, os da Fase 2 e os 11 da
Fase 5, incluindo a corrida de duas saídas e o ledger falhando). Controle positivo: 5 sabotagens no motor + 12 no
fix-round, todas vermelhas (a do filtro de lote da absorção ficou verde na primeira versão do teste e exigiu o
cenário 19b).
