# 21 — Relatórios, Dashboards e Indicadores

> **Status:** 🟡 — 16 relatórios no backend, só 2 consumidos no front; sem tela de relatórios · **Spec original:** seção 27
> **Última atualização:** 2026-08-11 — auditoria de cauda: eram 15 tipos, a Etapa 2 acrescentou `materiais-sem-endereco` (16); "só 2 consumidos no front" segue verdade

## Objetivo

Tela de relatórios completa (estoque, movimentações, gestão) + indicadores gerenciais, com exportação.

## O que já existe

- `reportService.js` + `GET /relatorios/:tipo` (`extended.js`, 16 tipos no mapa `reports` do dispatcher). Nem todos vêm do `reportService`: `materiais-sem-endereco` (acrescentado na Etapa 2) é servido por SQL inline no próprio dispatcher, e há tipos servidos por `clientMaterialService` e `scrapService`.
- Relatórios v1: posição de estoque, movimentações por período (rotas `/relatorio/*` em `routes/almoxarifado.js`).
- Dashboard com KPIs + consumo por OS + materiais mais consumidos (`AlmoxarifadoDashboard.js`).
- Referência de UI: telas `/frota/relatorios` e `/fabrica/relatorios` já existem em outros módulos (seguir o padrão).
- Infra de exportação: `xlsx` e `pdfkit`/`puppeteer` já no projeto.

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
- [ ] Valor total do estoque / por grupo (exige custo médio consistente — feature 03)
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
