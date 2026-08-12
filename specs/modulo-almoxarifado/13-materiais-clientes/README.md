# 13 — Materiais Pertencentes a Clientes

> **Status:** 🟡 — backend básico pronto, sem UI, sem segregação forte · **Spec original:** seção 17 (fundamental para industrialização GMP)
> **Última atualização:** 2026-08-02

## Objetivo

Saldo de material de cliente totalmente segregado do próprio, com proprietário, projeto e documento em toda entrada, aplicação em toda saída e posição de estoque por cliente.

## O que já existe

- `materiais_cliente_almoxarifado` (`schema.js:584`): cliente_id, projeto_id, os_id, descricao, nota_remessa, quantidade recebida/consumida/saldo.
- Rotas `GET/POST /materiais-cliente` + `POST /:id/consumir` (`extended.js:275-286`) via `clientMaterialService.js` (50 L). Teste de serviço existe.
- Tipo de material `Material de cliente` no enum; área "Estoque de materiais de clientes" prevista nos tipos de localização.

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
