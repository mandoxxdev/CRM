# 13 — Materiais Pertencentes a Clientes

> **Status:** 🟢 — **Etapa 8 entregue em 2026-08-12** (`f26b635..5b5eb55`) · **Spec original:** seção 17 (fundamental para industrialização GMP)
> **Última atualização:** 2026-08-12
>
> Material de cliente deixou de ser ilha e virou **material normal com dono**
> (`materiais_almoxarifado.proprietario_cliente_id`, `NULL` = material nosso): ganha lote, série,
> endereço, extrato, etiqueta e livro de movimentações. O saldo do cliente ficou **fora** de toda
> leitura de estoque próprio (auditoria nomeada de **40 leituras**), a saída só sai com OS/projeto
> do próprio dono (emergencial **não** fura), o ajuste exige a ação dedicada
> `ajustar_material_cliente`, existe o tipo de saída `DEVOLUCAO_CLIENTE` com rota própria, a tela
> `/almoxarifado/materiais-cliente` com PDF de posição, e o selo de propriedade nomeando o cliente
> nas três listagens que misturam.
>
> Design: [`docs/superpowers/specs/2026-08-12-almoxarifado-etapa8-materiais-clientes-design.md`](../../../docs/superpowers/specs/2026-08-12-almoxarifado-etapa8-materiais-clientes-design.md) ·
> plano: [`docs/superpowers/plans/2026-08-12-almoxarifado-etapa8-materiais-clientes.md`](../../../docs/superpowers/plans/2026-08-12-almoxarifado-etapa8-materiais-clientes.md).
> **Materiais em terceiros (feature 14) NÃO fazem parte desta etapa** — viraram **Etapa 8b**.

## Objetivo

Saldo de material de cliente totalmente segregado do próprio, com proprietário, projeto e documento em toda entrada, aplicação em toda saída e posição de estoque por cliente.

## O que já existe

- ~~`materiais_cliente_almoxarifado` (`schema.js:584`)~~ · ~~Rotas `GET/POST /materiais-cliente` +
  `POST /:id/consumir` (`extended.js:275-286`) via `clientMaterialService.js` (50 L). Teste de
  serviço existe.~~ — **a ilha foi aposentada na Etapa 8, Task 7** (decisão 4 do design). As três
  rotas, o `clientMaterialService.js` e o teste de serviço saíram; a **tabela continua no
  `schema.js`**, marcada como aposentada. Ver a seção "Aposentadoria da ilha" abaixo.
- Tipo de material `Material de cliente` no enum; área "Estoque de materiais de clientes" prevista nos tipos de localização.

## Aposentadoria da ilha (Etapa 8, Task 7)

Material de cliente agora é **material normal com dono**: `materiais_almoxarifado.proprietario_cliente_id`
(`NULL` = material nosso). O que existia em paralelo saiu, porque enquanto vivo era um caminho que
**escapava de todas as guardas** construídas nesta etapa — `consumirMaterialCliente` não validava
cliente nem projeto e não passava pelo motor.

| Antes (ilha) | Agora |
|---|---|
| `GET /almoxarifado/materiais-cliente` | `GET /almoxarifado/estoque?proprietario_cliente_id=N` |
| `POST /almoxarifado/materiais-cliente` | cadastro normal de material com `proprietario_cliente_id` + entrada pelo motor/recebimento |
| `POST /almoxarifado/materiais-cliente/:id/consumir` | saída pelo motor, com a guarda do dono (`ownerRules`) |
| `GET /almoxarifado/relatorios/materiais-cliente` | a chave **voltou** na Task 8 (`6e97715`), agora servida por `clienteEstoqueService.posicaoPorCliente` — **não serve mais dados da tabela aposentada** |

Teste que prende a remoção: `server/tests/api/materialClienteIlhaAposentada.api.test.js`. Depois da
Task 8 ele mudou o que defende: de "a chave sumiu" para **"a chave não serve mais dados da ilha"**
— grava uma linha na tabela aposentada e prova que ela não aparece na resposta. Sem esse par, "a
chave existe" não distinguiria o serviço novo do antigo ressuscitado.

### ⚠️ PENDENTE — confirmar produção antes do deploy desta etapa

A medição de "0 linhas" na tabela cobriu **só** `server/data/database.sqlite` (banco de
desenvolvimento). **Antes de subir a Etapa 8 para produção**, rode no banco de **produção**:

```sql
SELECT COUNT(*) AS total,
       SUM(CASE WHEN ativo = 1 THEN 1 ELSE 0 END) AS ativos
  FROM materiais_cliente_almoxarifado;
```

- **`total = 0`** → nada a fazer. Registre aqui o número e a data e marque esta pendência como
  fechada. A tabela continua no schema mesmo assim (só um `DROP` deliberado a remove, e ele não
  faz parte da Etapa 8).
- **`total > 0`** → **não é motivo para reverter o código desta task**, mas é dado real sem
  migração, e a premissa da decisão 4 do design cai. O que muda:
  1. As rotas de **escrita** ficam removidas de qualquer forma — eram o caminho paralelo sem
     guarda, e é justamente com dado real em jogo que isso vira perigoso.
  2. A **leitura** do dado antigo não volta como rota: use SQL direto na tabela (que continua lá)
     enquanto a migração não acontece. Nada é perdido — nenhuma linha é apagada por esta task.
  3. Entra uma **migração assistida** antes de qualquer `DROP`: cada linha vira um
     `materiais_almoxarifado` com `proprietario_cliente_id` + uma movimentação de entrada
     correspondente. É assistida, não automática: `descricao` é texto livre sem FK, então não há
     como casar com material existente por chave.

**Resposta recebida:** _(ainda em aberto em 2026-08-12 — preencher com o número e a data)_ · O
executor da Task 7 não tem acesso ao banco de produção, e o usuário autorizou execução autônoma; a
task foi entregue com a **tabela preservada** exatamente para que este cenário não tenha custo.
**Nenhuma linha é apagada pela Etapa 8** — a pendência é de confirmação, não de risco de perda.

## Checklist

### Backend
- [x] Consumo só no projeto/cliente proprietário — **enforcement** — `da8ff21` (Task 3):
  `services/almoxarifado/ownerRules.js` (`assertSaidaPermitida`) chamado pelo motor em
  `registrarMovimentacao`, logo depois de `avaliarRegrasVinculo`. Cobre `SAIDA`,
  `SAIDA_PRODUCAO`, `SAIDA_MONTAGEM`, `SAIDA_ASSISTENCIA`, `SUCATA` e `PERDA`. **A saída
  emergencial NÃO fura a guarda** (decisão 6 do design) — é a única exceção deliberada ao padrão
  do módulo, onde `emergencial: true` normalmente bypassa a exigência de vínculo.
- [x] Entrada exige cliente + **documento** — `99c9f28` (Task 5).
  > ### ⚠️ Este item da spec estava ERRADO, e a correção faz parte da entrega
  > O texto original era **"entrada exige cliente + projeto + documento (nota de remessa)"**.
  > **Exigir projeto na entrada está errado:** um mesmo cliente manda a mesma chapa para dois
  > projetos, e prender o projeto na entrada obrigaria a criar **dois materiais idênticos** para o
  > mesmo item físico do mesmo dono. O projeto é exigido na **saída** (item acima), que é onde a
  > aplicação importa e onde a guarda do dono já atua. Decisão 8 do design da Etapa 8.
  > **Registrado aqui em vez de apagado em silêncio**, porque afirmação errada apagada faz o
  > próximo confiar nela de novo — já aconteceu duas vezes neste módulo (a feature 07 afirmava
  > "consumo baixa reserva" quando `reserva_id` era só uma coluna; a feature 12 descrevia como
  > correto o bug que baixava o estoque duas vezes na devolução para sucata).
  >
  > O que foi entregue: `proprietario_cliente_id` no `MaterialShape` (Zod) e nas colunas de
  > `POST`/`PUT /materiais`, e a guarda de `receiptService.darEntradaEstoque` que **recusa a nota
  > inteira** quando um item é de material de cliente e a nota está sem número. Material **nosso**
  > continua entrando sem nota — há controle positivo prendendo essa metade.
- [x] Saída exige aplicação (OS/projeto) — `da8ff21` (Task 3). Vínculo **inexistente** e projeto
  com `cliente_id NULL` (projeto interno) também são recusados: `NULL` não é coringa.
- [x] Ajuste exige autorização especial — `e171eaf` (Task 4): ação nova
  `ajustar_material_cliente` em `ACAO_PERFIS` (só `ADMINISTRADOR`), verificada **dentro do motor**
  porque o AJUSTE chega por **duas** rotas (`POST /movimentacoes` v1 e v2), ambas gateadas pelo
  `movimentar` — um `requirePermission` na v2 deixaria a v1 aberta. Auditoria nomeando o cliente.
  > **⚠️ RESSALVA — pendência real, declarada e não fechada:** a **conferência de inventário**
  > (`server/routes/almoxarifado.js:941`, caminho `aplicar_ajustes`) faz
  > `UPDATE materiais_almoxarifado SET quantidade_atual = ?` **direto, fora do motor** — logo,
  > fora desta permissão. O gate de lá é `ajustar_estoque` (ADMINISTRADOR/GESTOR). **Enquanto isso
  > não for fechado, a conferência de inventário é um caminho real por onde o saldo de material de
  > cliente muda sem `ajustar_material_cliente`.** Confirmado por dois executores independentes
  > (Tasks 1 e 4). Fechar exige reescrever a aplicação de ajustes da conferência para passar pelo
  > motor — é etapa própria, e é a mesma pendência já registrada na feature 03
  > (`PUT /conferencias/:id/concluir` escreve `quantidade_atual` por fora do motor).
- [ ] Sobras permanecem vinculadas ao proprietário — **fora do escopo da Etapa 8, declarado**
  (decisão 11 do design): depende da UI de retalhos/sobras, **feature 15**.
- [x] Devolução ao cliente documentada — `27eb9c9` (Task 6): tipo `DEVOLUCAO_CLIENTE` (saída, pelo
  motor — então lote, série e endereço funcionam), criável **só** pela rota dedicada
  `POST /api/almoxarifado/materiais-cliente/devolucoes`, com `documento_devolucao` obrigatório e
  guarda de "só material com dono". **Isento** da regra de OS/projeto: o destino é o próprio
  proprietário. **O e-mail continua fora** — feature 19.
  > Não confundir com a devolução da **Etapa 7** (feature 12): lá o material **volta** para o
  > estoque (entrada); aqui ele **sai** do prédio de volta para quem é dele.
- [x] Integração com o motor de estoque — **decisão de arquitetura tomada** — `582bc04` (Task 1) +
  invariante em `faf20e7` (Task 2). **Material de cliente vira material normal com dono**
  (decisão 2), e o dono mora na linha do **MATERIAL**, não na de saldo (decisão 3). Razão técnica:
  o disponível deriva de `materiais_almoxarifado.quantidade_atual`, um escalar **por material**
  (`stockService.getSaldoDisponivel`) — repartir propriedade dentro do saldo faria esse escalar
  misturar donos e toda guarda de "saldo insuficiente" viraria cirurgia no núcleo do motor. Razão
  semântica: a chapa do Cliente X tem certificado e corrida próprios e **não pode ser trocada**
  pela do Cliente Y. Custo aceito: o catálogo ganha uma linha por cliente do mesmo item físico.
- [~] Custo não se mistura ao estoque próprio — **parcialmente** — `582bc04` (Task 1). Já excluem
  material de cliente: `valorTotalEstoque` do dashboard
  (`SUM(quantidade_atual * custo_unitario)`), `relatorioEstoqueAtual` e
  `GET /relatorio/posicao-estoque`. **Falta:** custo médio e valorização **por cliente** (o PDF de
  posição por cliente traz quantidades, não valor) — feature 21.
- [~] Relatórios (spec 17) — **parcialmente** — `6e97715`+`5b5eb55` (Task 8). Entregues:
  **recebidos, consumidos, devolvidos e saldo por cliente**, e as **aplicações por OS/projeto**
  (`clienteEstoqueService.posicaoPorCliente`, `GET /materiais-cliente/posicao`, PDF no navegador).
  **Faltam:** reservados, sobras, perdas e não conformes por cliente — features 15 e 21.
- [ ] E-mails específicos (spec 14.2: gestor do projeto, comercial, engenharia) — **fora do escopo,
  declarado** (decisão 11): **feature 19**.

### Frontend
- [x] Tela de materiais de cliente — `5b5eb55` (Task 8): `/almoxarifado/materiais-cliente`
  ("Materiais de Clientes"), escolhe o cliente → posição consolidada (recebido, consumido,
  devolvido, saldo, saldo disponível) + aplicações por OS/projeto, botão **PDF de posição** (gerado
  no navegador com `jspdf`, zero mudança de servidor) e botão **"Devolver ao cliente"**.
  Code-split em `routes/lazyModules.js`, menu em `Layout.js`.
- [x] Identificação visual de propriedade em todas as listagens que misturam materiais — selo
  `SeloProprietario` nas três listagens classificadas como "misturar é o correto" na auditoria da
  Etapa 8 (catálogo de Materiais, livro de Movimentações, Extrato do item): UI em `4eaba65`, razão
  social do dono vinda do servidor em `359a152` (entre os dois o selo dizia só "Material de
  cliente", sem nomear quem). **Não coberto:** os relatórios que também misturam por decisão
  (materiais bloqueados, materiais-sem-endereço) continuam sem selo — são leituras de relatório,
  não as telas operacionais que a Task 9 delimitou; fica para quem fechar a feature decidir.

## Regras essenciais + testes de API exigidos

Todos entregues na Etapa 8. O arquivo real que cobre cada regra está na última coluna.

| Regra | Teste | Arquivo |
|-------|-------|---------|
| Material de cliente não pode ser consumido em outro cliente/projeto | `consumir material do cliente A em projeto do cliente B falha` | `tests/api/materialClienteGuardaSaida.api.test.js` (17 casos) |
| **Saída emergencial não fura a guarda do dono** (decisão 6) | `saida emergencial nao fura a guarda do dono` | idem |
| Consumo acima do saldo do cliente falha | `consumo acima do saldo falha` — agora pelo motor, é a guarda genérica de saldo | idem |
| Entrada sem cliente+documento falha (**sem projeto**, ver a correção acima) | `entrada de material de cliente sem documento falha` | `tests/api/materialClienteEntrada.api.test.js` (10 casos) |
| Saldo de cliente nunca entra no estoque disponível próprio | `posicao de estoque proprio exclui material de cliente` | `tests/api/materialClienteSegregacao.api.test.js` (14 casos) + helper `tests/helpers/clienteInvariante.js` |
| Ajuste exige autorização especial | ~~`ajuste de material de cliente sem aprovacao falha`~~ → **renomeado** para `ajuste de material de cliente sem permissao falha` | `tests/api/materialClienteAjuste.api.test.js` (10 casos) |
| Devolução ao cliente baixa o saldo e exige documento | `devolucao ao cliente baixa o saldo e exige documento` | `tests/api/materialClienteDevolucao.api.test.js` (8 casos) |
| As rotas da ilha não existem mais | `rotas da ilha nao existem mais` | `tests/api/materialClienteIlhaAposentada.api.test.js` |
| Material de cliente aceita lote e série como qualquer outro | o ganho da unificação, medido | `tests/api/materialClienteSegregacao.api.test.js` |
| A coluna existe, aceita NULL e tem índice | teste de fundação | `tests/api/materialClienteColuna.api.test.js` (4 casos) |
| Posição por cliente (recebido/consumido/devolvido/saldo + aplicações) | controle bilateral: Alfa mostra o de Alfa e esconde o de Beta, e vice-versa | `tests/api/materialClientePosicao.api.test.js` (8 casos) |
| O selo diz **de qual** cliente, nas quatro respostas | controle positivo bilateral em cada uma (material nosso traz `null`) | `tests/api/materialClienteSeloProprietario.api.test.js` (4 casos) |

> **O nome do teste do ajuste mudou de propósito.** `sem aprovacao` descrevia o fluxo de aprovação
> assíncrono (solicita → pendente → alguém aprova → efetiva), que foi **descartado na decisão 7**
> do design: é máquina de estados nova com tela de pendências e notificação, do tamanho de uma
> etapa inteira. O que entrou é **permissão dedicada**, não aprovação — o nome antigo prometeria
> um fluxo que não existe. Fluxo de aprovação continua na **feature 06**.

## A auditoria das leituras (Task 1) — o que ficou decidido

O risco desta etapa não era quebrar: era **não quebrar e o número ficar errado**. Uma leitura
esquecida faz a chapa do cliente contar como nossa em reposição de mínimo, sugestão de compra,
valor total do estoque e posição — falha silenciosa que nenhum teste existente pegaria. Por isso
**40 leituras** de `materiais_almoxarifado` foram nomeadas e classificadas uma a uma (21 em
`services/almoxarifado/*.js` + `routes/almoxarifado/*.js`, 19 em `routes/almoxarifado.js`). A lista
completa está na Task 1 do plano; o que interessa aqui:

**Classe A — filtra `proprietario_cliente_id IS NULL`** (leitura de estoque próprio):
`alertService` × 3, `purchaseService.verificarEstoqueMinimo`, `reportService.relatorioEstoqueAtual`
e `relatorioAbaixoMinimo`, o contador de reposição do `MAPA_LOCALIZACOES_SQL`,
`stockService.consultarEstoque` (com opt-in: `proprietario_cliente_id=N` ou `incluir_clientes=1`),
e as **6 de `routes/almoxarifado.js`** logo abaixo.

**Classe B — leitura de UM material por id, NÃO filtra**: quem pediu aquele material quer aquele
material, seja de quem for. Filtrar em `stockService.getMaterial` inutilizaria o motor inteiro para
material de cliente, que é justamente o ponto da etapa. **Exceção declarada:**
`alertService.verificarAlertaPorMaterialId` é leitura por id (classe B pela forma) mas alerta de
reposição (classe A pela semântica) — **filtra**, e o comentário no código diz por quê, senão um
`IS NULL` numa busca por id parece bug.

**Classe C — misturar É o comportamento correto, NÃO filtra, e o selo é a contrapartida.** Esta
classe **não existia na spec de design** (que previa só A e B) e foi achada ao escrever o plano:
sem ela, três leituras teriam de ser forçadas para A ou B e ficariam erradas nos dois casos. São
conjuntos **físicos** — a chapa do cliente ocupa a prateleira de verdade e é bloqueada de verdade:

| Leitura | Por que não filtra |
|---|---|
| `reportService.relatorioMateriaisBloqueados` | relatório de **qualidade**: material de cliente bloqueado é exatamente o que o almoxarife precisa ver |
| 1º subselect do `MAPA_LOCALIZACOES_SQL` (soma física por localização) | escondê-lo faria o mapa **mentir sobre ocupação** de prateleira |
| `GET /relatorios/materiais-sem-endereco` | endereçar material do cliente é tão necessário quanto endereçar o nosso |
| `GET /materiais`, `GET /movimentacoes`, `GET /materiais/:id/extrato` | são as **telas operacionais**, e o selo (`4eaba65`+`359a152`) é o que evita a confusão |

> O par do `MAPA_LOCALIZACOES_SQL` **discorda de propósito dentro do mesmo SQL**: o subselect de
> ocupação física inclui a chapa do cliente, o de reposição a exclui. Medem coisas diferentes —
> **não "uniformizar"**. Um teste prende os dois lados.

**As 6 leituras que a contagem de 19 da spec de design NÃO cobria.** A spec mandava varrer
`services/almoxarifado/*.js` + `routes/almoxarifado/*.js` — o **subdiretório** —, deixando de fora
`server/routes/almoxarifado.js`, o arquivo de rotas v1. Corrigido em `9d70d8c` (a spec de design
diz que estava errada). As seis, todas classe A, todas filtradas em `582bc04`:
`routes/almoxarifado.js:217` (`totalMateriais`), `:221` (`materiaisCriticos`), `:225`
(`materiaisZerados`), `:229` (**`valorTotalEstoque` — sem o filtro, patrimônio de terceiro
contabilizado como nosso**), `:239` (top 10 de críticos) e `:993`
(`GET /relatorio/posicao-estoque`, **literalmente a rota que o teste exigido nesta spec nomeia**).

**Não coberto pelo selo, decisão declarada:** os relatórios que também misturam (materiais
bloqueados, `materiais-sem-endereco`) continuam **sem selo** — são leituras de relatório, não as
telas operacionais que a Task 9 delimitou. Fica para quem fechar a feature decidir.

## O que a Etapa 8 NÃO cobre

- **Materiais em terceiros** — feature 14, virou **Etapa 8b**.
- **E-mails específicos** — feature 19.
- **Sobras vinculadas ao proprietário** — feature 15.
- **Relatórios de perdas/não conformes/reservados por cliente** e valorização por cliente — feature 21.
- **Aprovação assíncrona de ajuste** — feature 06 (descartado na decisão 7, ver acima).
- **Comprovante de devolução ao cliente em PDF** — o único PDF da etapa é o de **posição por
  cliente**. A decisão 10 do design fala em "os dois PDFs", mas o escopo acordado nomeia só um; a
  devolução em si (tipo `DEVOLUCAO_CLIENTE`) entra, só o documento impresso não.
- **A pendência do `aplicar_ajustes` da conferência de inventário** (ver a ressalva do checklist).

## Dependências

- 03 (motor — unificação feita) · 06 (aprovação assíncrona de ajuste, descartada nesta etapa) ·
  12 (devolução para o estoque, não confundir com `DEVOLUCAO_CLIENTE`) · 15 (sobras vinculadas) ·
  19 (e-mails) · 21 (relatórios e valorização por cliente).
