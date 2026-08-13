# 21 — Relatórios, Dashboards e Indicadores

> **Status:** 🟡 — 16 relatórios no backend, só 2 consumidos no front; sem tela de relatórios · **Spec original:** seção 27
> **Última atualização:** 2026-08-13 — **a valoração dos relatórios estava errada e foi corrigida**
> (tarefa extra da Etapa 8c, ver "Valoração do estoque" abaixo). O resto da linha de 2026-08-11
> segue valendo: eram 15 tipos, a Etapa 2 acrescentou `materiais-sem-endereco` (16), e "só 2
> consumidos no front" continua verdade.

## Objetivo

Tela de relatórios completa (estoque, movimentações, gestão) + indicadores gerenciais, com exportação.

## O que já existe

- `reportService.js` + `GET /relatorios/:tipo` (`extended.js`, **15** tipos no mapa `reports` do dispatcher). Nem todos vêm do `reportService`: `materiais-sem-endereco` (acrescentado na Etapa 2) é servido por SQL inline no próprio dispatcher, e há tipo servido por `scrapService`. **Eram 16:** o tipo `materiais-cliente` era servido pelo `clientMaterialService`, removido com a ilha na Etapa 8, Task 7 — o tipo responde **404** até a Task 8 recriar a chave sobre `clienteEstoqueService.posicaoPorCliente`.
- Relatórios v1: posição de estoque, movimentações por período (rotas `/relatorio/*` em `routes/almoxarifado.js`).
- Dashboard com KPIs + consumo por OS + materiais mais consumidos (`AlmoxarifadoDashboard.js`).
- Referência de UI: telas `/frota/relatorios` e `/fabrica/relatorios` já existem em outros módulos (seguir o padrão).
- Infra de exportação: `xlsx` e `pdfkit`/`puppeteer` já no projeto.

### Valoração do estoque — fonte única (corrigido em 2026-08-13, tarefa extra da Etapa 8c)

**A afirmação anterior desta spec era que a valoração "existe"; ela existia e estava ERRADA.**
`materiais_almoxarifado.custo_medio` é `REAL DEFAULT 0` — **zero, não NULL** — e o cadastro de
material grava só `custo_unitario`. Como `COALESCE` devolve o primeiro **não-nulo**,
`COALESCE(custo_medio, custo_unitario, 0)` devolvia **0** e nunca chegava em `custo_unitario`:
**todo material cujo custo só foi digitado no cadastro (o acervo inteiro anterior à Etapa 8c, que é
quando o recebimento por NF passou a alimentar custo médio) era valorado a ZERO.** Sonda executada
no banco de teste, `custo_unitario = 10` e `custo_medio = 0`: a fórmula antiga lê `0`, a do motor lê
`10`.

A mesma pergunta ("quanto vale uma unidade?") estava respondida em **8 lugares com 3 fórmulas
diferentes** — a do motor, a que zerava, e `custo_unitario` puro (dashboard e
`GET /relatorio/posicao-estoque`, que não zeravam mas ignoravam a média ponderada e por isso
divergiam do relatório gêmeo `relatorios/estoque-atual`).

Hoje há **uma** fonte: `services/almoxarifado/custoSql.js` (`custoUnitarioSql` / `valorEstoqueSql`),
no mesmo desenho de `availabilitySql.js`. Regra: **nenhuma query nova escreve a leitura do custo à
mão** — `tests/api/custoUnitarioFonteUnica.api.test.js` varre o código-fonte e falha se alguém
replicar, com controle positivo do próprio padrão de busca.

> **Consequência visível:** o `valorTotalEstoque` do dashboard **mudou de número** para material que
> já recebeu NF com custo diferente do cadastro — ele passou a valorar pela média ponderada, igual
> ao relatório de posição. Para material sem custo médio (a maioria hoje) o número não muda.

## Checklist

### Levantamento (fazer primeiro)
- [ ] Listar os 16 tipos do mapa `reports` (`extended.js`) e casar com a spec 27 — o que falta vira item abaixo

### Relatórios de estoque (spec 27)
- [ ] Saldo por item / localização / almoxarifado — verificar cobertura atual
- [ ] Saldo por lote / número de série (depende da feature 10)
- [ ] Saldo por cliente (feature 13) / por projeto
- [ ] Saldo reservado / bloqueado / em quarentena / em terceiros (features 07/09/14)
- [ ] Estoque disponível (fórmula da feature 03)

### Relatórios de movimentação
- [ ] Entradas/saídas por período · transferências · devoluções · ajustes — parcial
- [ ] Por usuário / por projeto / por centro de custo
- [ ] Histórico completo do item (feature 03)

### Gestão e indicadores
- [ ] Acuracidade (feature 17) · giro · cobertura · rupturas
- [ ] Materiais parados / obsoletos (feature 18)
- [~] Valor total do estoque / por grupo — **a leitura do custo ficou consistente em 2026-08-13**
  (`custoSql.js`, ver acima); **falta** a quebra **por grupo** e a valorização **por cliente**
- [ ] Consumo por projeto, previsto × realizado (feature 22)
- [ ] Tempo médio de atendimento de requisição / de recebimento
- [ ] Indicadores da spec 27 restantes: % requisições no prazo/integrais, divergência e rejeição por fornecedor, valor de sucata, nº de ajustes

### Frontend
- [ ] Tela `/almoxarifado/relatorios` (padrão das telas de frota/fábrica)
- [ ] Exportação XLSX/PDF
- [ ] Dashboard: adicionar cartões dos indicadores principais

## Regras essenciais + testes de API exigidos

| Regra | Teste |
|-------|-------|
| Posição de estoque bate com o livro de movimentações | `posicao de estoque consistente com movimentacoes` |
| Relatórios respeitam permissões (CONSULTA vê, mas não muda) | `perfil CONSULTA acessa relatorios e nao movimenta` |
| Filtros de período/projeto retornam apenas o escopo | `relatorio filtrado por projeto exclui outros projetos` |

## Dependências

- Quase todas — os relatórios ficam completos conforme as features donas entregam os dados. Desenvolver a **tela** cedo com os relatórios já existentes e ir ampliando.
