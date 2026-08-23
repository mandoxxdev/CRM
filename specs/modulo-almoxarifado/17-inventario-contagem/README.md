# 17 — Inventário e Contagem Cíclica

> **Status:** 🟢 no que as duas rodadas se propuseram — Etapa 10 (motor: `AJUSTE_INVENTARIO`
> com guarda de retenção, contagem cega, tolerância+recontagem) + Etapa 10b (escopos de
> contagem combináveis, dupla contagem por duas pessoas, autoria por item, relatório de
> acuracidade, epsilon de divergência como fonte única). Fora, declarado com porquê: contagem
> por endereço, cíclica automática, congelamento, dupla aprovação formal (aguarda a decisão
> B11 do doc de novidades), e-mail · **Spec original:** seção 21 · **Designs:**
> [Etapa 10](../../../docs/superpowers/specs/2026-08-22-almoxarifado-etapa10-inventario-avancado-design.md) ·
> [Etapa 10b](../../../docs/superpowers/specs/2026-08-23-almoxarifado-etapa10b-inventario-avancado-2-design.md)
> **Última atualização:** 2026-08-23 (Etapa 10b fechada, `14f4458..7290481`)
> Antes: 2026-08-22 (Etapa 10, `d644827..8db2671`) · 2026-08-11

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

**Acréscimos da Etapa 10b (2026-08-23, `14f4458..7290481`):**

- **Escopo combinável** no `POST /conferencias` (RN-01/02 do design da 10b): `familia_id` (só
  raiz), `classe_abc`, `apenas_criticos`, `apenas_de_clientes`, `apenas_em_terceiros` — filtros
  E sobre colunas que o material já tinha; `escopo_descricao` gravada como snapshot da criação.
- **Dupla contagem** (RN-03/04): flag por conferência; recontagem exige outra pessoa; o GET
  esconde a contagem do colega de quem não é o último autor (com ou sem modo cego — Critical da
  revisão final); o primeiro contador corrige a própria contagem enquanto ninguém recontou
  (correção não marca recontagem); autoria por item (`contado_por_*`/`recontado_por_*`) sempre
  gravada.
- **RN-08**: `quantidade_contada` validada no `PUT /item` (número finito ≥ 0; zero vale) — fecha
  o contorno em que valor inválido resetava a sentinela da dupla contagem.
- **Relatório de acuracidade** (`GET /conferencias/relatorio-acuracidade`, gate `inventario`,
  RN-05/06/07): derivado dos itens imutáveis, ponderado, com `recontados` e `contados/total`;
  `impacto_financeiro` persistido na conclusão (sem backfill — nulo = não medido na época).
- **Epsilon de divergência** (`services/almoxarifado/divergencia.js`): fonte única de "é
  divergência de verdade" (1e-9), usada pelo relatório novo, pelo antigo
  (`inventario-divergencias` — que também ganhou gate `inventario` e filtro `CONCLUIDO`; antes
  vazava contagem em andamento para qualquer usuário do módulo), pelo filtro de ajustes e pelo
  gate de recontagem do concluir.
- **Motor de estoque não foi tocado** nesta rodada.

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
- [x] **Tipos de contagem** (spec 21) — **entregues na Etapa 10b** (`c1ee37b` + fix `7e66d02`):
      por família (raiz), curva ABC, item crítico, materiais de cliente, materiais em terceiros —
      combináveis entre si e com a categoria que já existia. **Continuam fora, declarados** (D2,
      D3, D4, D12 do design da 10b): por endereço (a conferência é por material; ajuste com
      localização é o corte D2), cíclica automática (sem infra de agendamento), surpresa (não é
      artefato de software), por divergência (a recontagem obrigatória da Etapa 10 já é isso) e
      subfamília (o material vincula a raiz; oferecer subfamília criava conferência vazia —
      achado da revisão final).
- [ ] Plano de contagem cíclica (frequência por criticidade/ABC) + geração automática — **fora
      do escopo** (D3 da 10b): sem infra de job; o filtro por classe entrega a prática manual.
- [x] **Dupla contagem: contadores diferentes** — **entregue na Etapa 10b** (`80a7fea` + fixes
      `b16561a`/`7290481`): flag por conferência, recontagem exige outra pessoa, o número do
      colega fica escondido para a segunda contagem ser independente (com ou sem modo cego),
      correção própria permitida pré-recontagem, autoria por item. A comparação lado a lado das
      duas contagens (tela de conciliação) não existe — o que há é o valor final + autoria dos
      dois contadores.
- [ ] Congelar movimentações do escopo durante a contagem — **fora do escopo, declarado**: mesmo
      raciocínio da Transferência sem "em trânsito" (Etapa 7) — site único, baixo valor, alto
      custo.
- [x] **Relatório de acuracidade** — **entregue na Etapa 10b** (`78cdbcd` + fix `957d148` +
      revisão final `7290481`): `GET /conferencias/relatorio-acuracidade` (gate `inventario`),
      derivado dos itens, ponderado, com contados/total, recontados e impacto financeiro
      persistido. **Correção declarada:** este item dizia "fica para a feature de relatórios" —
      a 10b o trouxe para cá porque os dados já eram do inventário; a feature 21 continua dona
      da tela geral de relatórios.
- [ ] E-mail do resultado (feature 19) — **fora do escopo**, mesmo corte de todas as etapas
      anteriores.

### Frontend
- [x] Modo contagem cega na tela — `4f7ed6f` (Task 3).
- [x] Fluxo de recontagem — `4f7ed6f` (Task 3, badge lido do servidor), `d3fc0ab` (fix: badge
      atualiza ao salvar uma contagem, sem precisar reabrir a conferência).
- [x] **Escopo, dupla contagem, autoria e visão Acuracidade na tela** — Etapa 10b, `b8490cc` +
      fix `cfe44bf` (merge `a95db02`) + revisão final `7290481` (só campo digitado na sessão
      salva — tabular por input preenchido não conta; valor recusado sai da tela; contador do
      cabeçalho por autoria; família só raiz; contados/total e recontados na tabela).
- [ ] Contagem por endereço (hoje categoria + os escopos da 10b) — **fora do escopo, declarado**
      (mesmo item do backend acima).

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
| **(10b)** Escopo combinável filtra e grava a descrição literal | `RN-01/RN-02: ...` (8 testes) | `conferenciaEscopo.api.test.js` |
| **(10b)** Dupla contagem: outra pessoa reconta, colega não vê o número, correção própria pré-recontagem | `RN-03/RN-04/RN-08: ...` (11 testes) | `conferenciaDuplaContagem.api.test.js` |
| **(10b)** Acuracidade: métricas derivadas, agregado ponderado, impacto persistido, gate positivo+negativo, epsilon | `RN-05/RN-06/RN-07: ...` (13 testes) | `conferenciaAcuracidade.api.test.js` |
| **(10b)** Jornada de composição (escopo + dupla + cego + concluir + relatório + vazamentos fechados) | teste-jornada, 12+ passos | `inventarioEscopoJornada.api.test.js` |

## O que ficou de fora (declarado — estado pós-10b)

A lista anterior desta seção mandava tudo "para uma Etapa 10b"; **a 10b aconteceu** (2026-08-23)
e entregou tipos de contagem, dupla contagem e o relatório de acuracidade. O que **continua**
fora, agora sem etapa marcada:

- **Contagem por endereço** (e a guarda de retenção para ajuste com localização específica —
  são o mesmo corte, D2 da 10b: abrir endereço reabriria a decisão da 8b sobre o esperado).
- **Contagem cíclica automática** (plano por ABC/criticidade com geração agendada) — sem infra
  de job; o escopo por classe entrega a prática manual.
- **Congelamento de movimentação durante a contagem** — ruling do cliente-proxy mantido (site
  único, baixo valor, alto custo). Consequência operacional documentada no doc de novidades
  (item C7: não contar o escopo em-terceiros com remessa em andamento).
- **Fluxo formal de dupla aprovação** (duas assinaturas, como o sucateamento) — aguarda a
  decisão **B11** do doc de novidades; existe dupla permissão + dupla contagem, não duas
  assinaturas no mesmo processo.
- **E-mail do resultado** (feature 19).
- **Tela de conciliação lado a lado das duas contagens** — a dupla contagem guarda o valor
  final e a autoria dos dois contadores, não as duas quantidades separadas.

## Dependências

- 03 (ajuste via movimentação — **atendido nesta etapa**) · 06 (dupla aprovação formal — ainda
  não construída) · 01 (classe ABC — para contagem cíclica automática, fora do escopo).
