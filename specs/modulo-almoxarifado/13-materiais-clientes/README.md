# 13 — Materiais Pertencentes a Clientes

> **Status:** 🟡 — backend básico pronto, sem UI, sem segregação forte · **Spec original:** seção 17 (fundamental para industrialização GMP)
> **Última atualização:** 2026-08-02

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
| `GET /almoxarifado/relatorios/materiais-cliente` | **404 até a Task 8** recriar a chave sobre `clienteEstoqueService.posicaoPorCliente` |

Teste que prende a remoção: `server/tests/api/materialClienteIlhaAposentada.api.test.js`.

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

**Resposta recebida:** _(preencher — número e data)_ · Executor da Task 7 não tem acesso ao banco
de produção; a task foi entregue com a tabela preservada exatamente para que este cenário não
tenha custo.

## Checklist

### Backend
- [ ] Consumo só no projeto/cliente proprietário — **enforcement** (hoje verificar se `consumir` valida projeto)
- [ ] Entrada exige cliente + projeto + documento (nota de remessa)
- [ ] Saída exige aplicação (OS/equipamento)
- [ ] Ajuste exige autorização especial (feature 06)
- [ ] Sobras permanecem vinculadas ao proprietário (liga com feature 15)
- [ ] Devolução ao cliente documentada (documento de devolução + e-mail — features 12/19)
- [ ] Integração com o motor de estoque: decidir se material de cliente vira material normal com flag `proprietario_cliente_id` no saldo (permitiria lote/localização/movimentação completos) ou permanece em tabela separada — **decisão de arquitetura na Etapa 8**
- [ ] Custo não se mistura ao estoque próprio
- [ ] Relatórios (spec 17): recebidos por cliente, consumidos por projeto, saldo, reservados, sobras, perdas, não conformes, devolvidos
- [ ] E-mails específicos (spec 14.2: gestor do projeto, comercial, engenharia)

### Frontend
- [ ] Tela de materiais de cliente (hoje inexistente): posição por cliente, entradas, consumos, devoluções
- [x] Identificação visual de propriedade em todas as listagens que misturam materiais — selo
  `SeloProprietario` nas três listagens classificadas como "misturar é o correto" na auditoria da
  Etapa 8 (catálogo de Materiais, livro de Movimentações, Extrato do item): UI em `4eaba65`, razão
  social do dono vinda do servidor em `359a152` (entre os dois o selo dizia só "Material de
  cliente", sem nomear quem). **Não coberto:** os relatórios que também misturam por decisão
  (materiais bloqueados, materiais-sem-endereço) continuam sem selo — são leituras de relatório,
  não as telas operacionais que a Task 9 delimitou; fica para quem fechar a feature decidir.

## Regras essenciais + testes de API exigidos

| Regra | Teste |
|-------|-------|
| Material de cliente não pode ser consumido em outro cliente/projeto | `consumir material do cliente A em projeto do cliente B falha` |
| Consumo acima do saldo do cliente falha | `consumo acima do saldo falha` |
| Entrada sem cliente+projeto+documento falha | `entrada de material de cliente sem documento falha` |
| Saldo de cliente nunca entra no estoque disponível próprio | `posicao de estoque proprio exclui material de cliente` |
| Ajuste exige autorização especial | `ajuste de material de cliente sem aprovacao falha` |

## Dependências

- 03 (motor, se houver unificação) · 06 (autorização de ajuste) · 12 (devolução) · 15 (sobras vinculadas).
