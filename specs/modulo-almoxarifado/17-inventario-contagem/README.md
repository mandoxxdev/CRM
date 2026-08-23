# 17 — Inventário e Contagem Cíclica

> **Status:** 🟡 — o risco crítico está resolvido (ajuste passa pelo motor, com guarda de
> retenção); contagem cega e recontagem entregues; tipos de contagem avançados, dupla contagem
> por duas pessoas, congelamento de movimentação, dupla aprovação formal e relatório de
> acuracidade ficam declarados fora do escopo (Etapa 10b) · **Spec original:** seção 21 ·
> **Design da etapa:**
> [`docs/superpowers/specs/2026-08-22-almoxarifado-etapa10-inventario-avancado-design.md`](../../../docs/superpowers/specs/2026-08-22-almoxarifado-etapa10-inventario-avancado-design.md)
> **Última atualização:** 2026-08-22 (Etapa 10 fechada, `d644827..8db2671`)
> Antes: 2026-08-11

## Correção declarada (2026-08-22)

Esta seção, até a Etapa 10, dizia que a conclusão da conferência gravava o saldo **por fora do
motor de estoque**, sem validação nenhuma — "a única exceção conhecida à invariante do motor".
**Isso deixou de ser verdade nesta etapa.** A conclusão agora chama
`stockService.registrarMovimentacao` com um tipo dedicado (`AJUSTE_INVENTARIO`), como qualquer
outra movimentação do módulo — ver "O que existe hoje" abaixo para o caminho atual.

## Objetivo

Inventário geral e contagens cíclicas com listas cegas, recontagem, tolerância, ajuste por
movimentação auditada e relatório de acuracidade. (Contagens por endereço/família/criticidade e
o relatório formal seguem fora do escopo — ver "O que ficou de fora" abaixo.)

## O que existe hoje

- **Tabelas** (`server/services/almoxarifado/schema.js`): `conferencias_almoxarifado` (com
  `modo_cego`, `tolerancia_percentual`, `justificativa_ajuste` — colunas novas da Etapa 10, por
  `safeAlter`), `itens_conferencia_almoxarifado` (com `recontado` — coluna nova).
- **Motor** (`server/services/almoxarifado/stockService.js`): tipo dedicado
  `AJUSTE_INVENTARIO` (`TIPOS_MOVIMENTO`, `TIPOS_DEDICADOS` — a rota genérica de Movimentações
  nunca aceita), reusa a semântica de `AJUSTE` (valor absoluto). Guarda de retenção nova,
  `motivoRecusaAjustePorRetencao(material, novoTotal)` — função pura, exportada, chamada tanto
  pelo motor quanto pela pré-validação da rota — recusa um ajuste que deixaria
  `quantidade_atual` abaixo da soma das quatro colunas de retenção
  (`availabilitySql.COLUNAS_RETENCAO`). `AJUSTE_INVENTARIO` não é estornável pela rota genérica
  de cancelamento (o caminho de correção é uma nova conferência).
- **Rota** (`server/routes/almoxarifado.js`, bloco `/conferencias`): `POST /conferencias` aceita
  `modo_cego`/`tolerancia_percentual`; `GET /conferencias/:id` omite `quantidade_sistema`/
  `divergencia` em modo cego para quem não pode ajustar estoque, sempre traz
  `recontagem_necessaria` calculado no servidor; `PUT /item` exige a conferência `ABERTO` e marca
  recontagem automaticamente na segunda contagem do mesmo item; `PUT /concluir` exige
  `justificativa_ajuste` quando aplica ajustes, bloqueia a conclusão se algum item divergente
  acima da tolerância não foi recontado, e aplica os ajustes **tudo ou nada** — pré-valida cada
  item (permissão de material de cliente, retenção) antes de aplicar qualquer um; se algum falhar,
  nada é aplicado.
- **Config** `tolerancia_inventario_percentual` (`configuracoes_almoxarifado`, semeada com `2`).
- **Front** `client/src/components/almoxarifado/ConferenciaEstoque.js`: checkbox de contagem
  cega e campo de tolerância na criação, coluna "Recontagem" lida do servidor, modal de concluir
  com campo de justificativa (só quando aplica ajustes) e impacto financeiro no aviso de sucesso.
  `client/src/components/almoxarifado/MovimentacoesAlmoxarifado.js`: `AJUSTE_INVENTARIO` com
  rótulo e cor no livro, sem botão de estornar.
- Dado real: conferências anteriores à etapa continuam válidas (`modo_cego`/`tolerancia_percentual`
  nulos caem no default).

## Checklist

### Backend
- [x] **Ajuste como movimentação específica (v2, tipo AJUSTE_INVENTARIO)** — `4e0fabb` (Task 1,
      tipo + guarda de retenção), `a30c87e` (Task 2, rota via motor). **Corte declarado:**
      "dupla aprovação" (feature 06, no sentido de duas pessoas assinando o mesmo processo, como
      o sucateamento) **não foi construída** — o que existe é dupla **permissão** (quem conta ≠
      quem homologa), mais barato e já existente antes desta etapa. Ver letra B do fechamento.
- [x] **Contagem cega**: contador não vê a quantidade do sistema — `a30c87e` (Task 2, RN-02).
- [x] **Recontagem obrigatória acima da tolerância** (config de tolerância %) — `a30c87e`
      (Task 2, RN-04/RN-05).
- [x] **Impacto financeiro do ajuste** (quantidade × custo) — `a30c87e` (D8 do design).
- [ ] Tipos de contagem (spec 21): por endereço, por família, cíclica, item crítico, curva ABC,
      por divergência, surpresa, materiais de cliente, materiais em terceiros — **fora do
      escopo, declarado (D7 do design)**. Só "por categoria" (já existia) continua.
- [ ] Plano de contagem cíclica (frequência por criticidade/ABC) + geração automática — **fora
      do escopo**, mesma decisão acima.
- [ ] Dupla contagem: contadores diferentes, comparação — **fora do escopo, declarado**: a
      recontagem desta etapa aceita a mesma pessoa contando de novo, não rastreia se foi outra.
- [ ] Congelar movimentações do escopo durante a contagem — **fora do escopo, declarado**: mesmo
      raciocínio da Transferência sem "em trânsito" (Etapa 7) — site único, baixo valor, alto
      custo.
- [ ] Relatório de acuracidade (feature 21) — **fora do escopo**, fica para a feature de
      relatórios.
- [ ] E-mail do resultado (feature 19) — **fora do escopo**, mesmo corte de todas as etapas
      anteriores.

### Frontend
- [x] Modo contagem cega na tela — `4f7ed6f` (Task 3).
- [x] Fluxo de recontagem — `4f7ed6f` (Task 3, badge lido do servidor), `d3fc0ab` (fix: badge
      atualiza ao salvar uma contagem, sem precisar reabrir a conferência).
- [ ] Contagem por endereço (hoje só por categoria) — **fora do escopo, declarado** (mesmo item
      do backend acima).

## Regras essenciais + testes de API exigidos

O design da etapa numerou as regras RN-01..RN-10 (algumas com sufixo, RN-06b/RN-06c, acrescentadas
depois de uma revisão adversarial do plano). Lista completa no design; resumo com o teste que
prova cada uma:

| Regra | Teste | Arquivo |
|-------|-------|---------|
| Contagem cega não expõe `quantidade_sistema`/`divergencia` para quem não pode ajustar | `RN-02: modo_cego omite quantidade_sistema...` | `conferenciaContagemCega.api.test.js` |
| Divergência acima da tolerância exige recontagem, com ou sem aplicar ajustes | `RN-05: divergencia acima da tolerancia sem recontagem bloqueia concluir` | `conferenciaTolerancia.api.test.js` |
| Ajuste sem retenção suficiente é recusado (motor E pré-validação da rota) | `RN-06: AJUSTE que deixaria bloqueado > total e recusado` | `ajusteRetencao.api.test.js` |
| Ajuste gera movimentação auditável no motor, nunca UPDATE direto | `concluir com aplicar_ajustes grava movimentacao AJUSTE_INVENTARIO auditada` | `conferenciaMotorAjuste.api.test.js` |
| Aplicação é tudo ou nada — item recusado bloqueia toda a conclusão | `RN-07: um item recusado por retencao bloqueia TODA a conclusao` | `conferenciaMotorAjuste.api.test.js` |
| `quantidade_em_terceiros` soma de volta ao aplicar (fecha a pendência de 3 etapas) | `RN-06c: material com quantidade_em_terceiros soma de volta ao aplicar` | `conferenciaMotorAjuste.api.test.js` |
| Histórico de contagens é imutável (conferência concluída não edita, não conclui de novo) | `PUT /item em conferencia CONCLUIDA/CANCELADA recusa 400`; `concluir uma conferencia JA CONCLUIDA recusa 400` | `conferenciaTolerancia`/`conferenciaMotorAjuste.api.test.js` |
| Jornada completa (cega + tolerância + recontagem + bloqueio + tudo-ou-nada + estorno recusado) | teste-jornada, 14 passos | `inventarioIntegracao.api.test.js` |
| Contar zero e material inativo não quebram o tudo-ou-nada (achado da revisão final) | achados da revisão final | `ajusteRetencao.api.test.js`, `conferenciaMotorAjuste.api.test.js` |

## O que ficou de fora (declarado)

- **Tipos de contagem avançados** (endereço, família, cíclica automática, item crítico, ABC,
  surpresa) e **dupla contagem por duas pessoas** — ver checklist acima.
- **Congelamento de movimentação durante a contagem.**
- **Fluxo formal de dupla aprovação** (duas assinaturas, como o sucateamento) — existe dupla
  permissão, não o fluxo de duas pessoas assinando o mesmo processo.
- **Relatório de acuracidade formal e e-mail do resultado.**
- **Guarda de retenção para ajuste com localização específica** — só o ajuste do material inteiro
  (o caminho da conferência) tem a checagem nova.

Todos os cortes acima ficam para uma **Etapa 10b**, mesmo precedente de divisão usado em
6/6b/6c, 8/8b/8c e 9/9b.

## Dependências

- 03 (ajuste via movimentação — **atendido nesta etapa**) · 06 (dupla aprovação formal — ainda
  não construída) · 01 (classe ABC — para contagem cíclica automática, fora do escopo).
