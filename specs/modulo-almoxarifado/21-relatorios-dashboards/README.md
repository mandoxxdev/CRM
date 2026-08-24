# 21 — Relatórios, Dashboards e Indicadores

> **Status:** 🟡→quase-🟢 — **Etapa 13 entregue (2026-08-24, `4fdda54..8bb5e52`)**: tela de relatórios dirigida por registro único com gate declarado por chave, exportação XLSX, indicadores gerenciais e cartões no dashboard. Falta da spec 27: PDF, indicadores dependentes de outras features (previsto×realizado precisa da 22), quebras por lote/série/cliente valoradas · **Spec original:** seção 27
>
> **CORREÇÕES DE FATO (regra 5 — o texto abaixo afirmava e ESTAVA ERRADO):** este arquivo
> dizia "**15** tipos no mapa" e "eram 16" — no início da Etapa 13 eram **17** (medido), e com
> `indicadores` são **18**. E o cabeçalho dizia "só **2** consumidos no front" — eram **3**
> (o dashboard consome consumo-os e materiais-mais-consumidos; a tela de Reposição consome o
> gated solicitacoes-compra).
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
- [x] Listar os tipos do mapa `reports` e casar com a spec 27 — `781c784` (**são 18**, todos no
  `reportRegistry.js` com titulo/categoria/gate/params/colunas/limite/nota declarados por
  chave; a validação de subida derruba o processo se dispatcher e registro divergirem)

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

### Gestão e indicadores — ver a seção "entregue na Etapa 13" abaixo para o estado atual
- [x] Acuracidade — já era da 10b (rota própria, gate `inventario`) · giro/cobertura/rupturas — Etapa 13, ver abaixo
- [x] Materiais parados / obsoletos — já era da Etapa 11 (aba Estoque Parado)
- [x] Valor total do estoque / por grupo — quebra **por grupo** entregue na Etapa 13 (`4f8e3fc`); a valorização **por cliente** continua fora (letra B — valorar patrimônio alheio é decisão de negócio)
- [ ] Consumo por projeto, previsto × realizado (feature 22)
- [x] Tempo médio de atendimento de requisição — Etapa 13 (entrega completa, todo o histórico); **de recebimento** ficou de fora (nenhum timestamp de ciclo de recebimento confiável foi levantado — entra com a feature 08 se pedirem)
- [ ] Indicadores da spec 27 restantes: % requisições no prazo/integrais, divergência e rejeição por fornecedor, nº de ajustes — cada um com a feature dona; **valor de sucata já existe** (relatório sucata-financeiro, Etapa 9)

### Frontend
- [x] Tela `/almoxarifado/relatorios` — `59fb871..12dfd4d` via merge `8fd7977` (dirigida pela
  lista fail-closed do servidor: menu por categoria só com o que o perfil pode ver, params
  declarados, tabela projetada pelas colunas com rótulos, nota/régua no rodapé, aviso de teto)
- [x] Exportação **XLSX** — `781c784`+`cfdbbe5` (genérica pela MESMA função e gate do
  dispatcher; projeção pelas colunas declaradas — SELECT * nunca vaza); **PDF cortado**
  (impressão do navegador; letra D da Etapa 13)
- [x] Dashboard: 3 cartões (giro/rupturas/atendimento) — `1aa7c13`+`8bb5e52` (falha isolada
  com retry; legendas com a janela efetiva e a aproximação do giro)

### Gestão e indicadores — entregue na Etapa 13 (`4f8e3fc`+`bc1e2de`)
- [x] Giro (aproximado e DECLARADO: consumo na janela ÷ estoque ATUAL — sem snapshot
  histórico) · cobertura (MEDIANA, sem-consumo à parte) · rupturas (saldo físico ≤ 0 por
  saída/ajuste-inventário na janela; próprios ativos)
- [x] Valor total por grupo (categoria; fonte única `custoSql`) — a **valorização por
  cliente** continua fora (valorar patrimônio alheio é decisão de negócio, letra B)
- [x] Tempo médio de atendimento de requisição (entrega COMPLETA, todo o histórico — sem
  janela, declarado)
- [ ] Consumo por projeto previsto×realizado — depende de BOM/OP (feature 22)
- [ ] Indicadores restantes da spec 27 (% no prazo, divergência por fornecedor etc.) — cada um
  com a feature dona dos dados

## Regras essenciais + testes de API exigidos

| Regra | Teste |
|-------|-------|
| Posição de estoque bate com o livro de movimentações | `posicao de estoque consistente com movimentacoes` |
| Relatórios respeitam permissões (CONSULTA vê, mas não muda) | `perfil CONSULTA acessa relatorios e nao movimenta` |
| Filtros de período/projeto retornam apenas o escopo | `relatorio filtrado por projeto exclui outros projetos` |

## Dependências

- Quase todas — os relatórios ficam completos conforme as features donas entregam os dados. Desenvolver a **tela** cedo com os relatórios já existentes e ir ampliando.
