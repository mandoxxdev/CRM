# 05 — Separação e Picking

> **Status:** 🟡 básico — a separação simples por item existe e foi endurecida pelas Etapas 3/4/6 (permissão `separar_emitir`, liberação para retirada, parcialidade acumulada); lista de separação como entidade, conferência dupla, rota de picking e kits continuam não existindo · **Spec original:** seção 12
> **Última atualização:** 2026-08-29 (**Fase 0 da Etapa 28, medida no código**: esta spec afirmava
> que `TIPOS_LOCALIZACAO` já contemplava "Reservado"/"Kit"/"Aguardando retirada" — **ESTAVA
> ERRADO**, ver a correção abaixo; e a medição achou o **bloqueio real** de três itens do
> checklist, que a spec não nomeava: **a separação não tem autor e não deixa rastro**. Nenhum item
> mudou de estado.) Antes: 2026-08-11 (auditoria spec×código — esta spec estava congelada em 2026-08-02, anterior às Etapas 3, 4 e 6, e não refletia nada do que elas mudaram aqui)

## Objetivo

Listas de separação agrupadas, rota de picking, conferência dupla, montagem e identificação de kits.

## O que já existe

- Separação simples por item dentro da requisição: `PUT /requisicoes/:id/separacao` + alias `PUT /requisicoes/:id/separar` (`routes/almoxarifado.js`), ambos hoje sob `requirePermission('separar_emitir')` (perfis ADMIN/ALMOXARIFE) — esta spec não mencionava permissão. Grava `quantidade_separada` (acumulando em múltiplas rodadas, com teto `maxSeparar`), bloqueia separar acima do teto e sem aprovação de valor (`requisitionService.js`).
- Front: ação "Separação" em `RequisicoesList.js` com quantidades por item.
- ~~Localização virtual: `TIPOS_LOCALIZACAO` já contempla tipos que servem para "Reservado"/"Kit"/"Aguardando retirada" (validar na implementação).~~
  > **ISTO ESTAVA ERRADO, e o erro é do tipo que faz alguém começar a implementar e travar no meio**
  > (medido na Fase 0 da Etapa 28, 2026-08-29). A lista completa de `TIPOS_LOCALIZACAO`
  > (`server/services/almoxarifado/schema.js:21-26`) é: *Almoxarifado, Rua, Prateleira, Gaveta,
  > Box, Área externa, Área de corte, Área de montagem, Área de elétrica, Área de pintura, Área de
  > expedição, Área de materiais do cliente, Área de quarentena/inspeção*. **Não existe
  > "Reservado", não existe "Kit", não existe "Aguardando retirada".** O que a spec chamava de
  > "validar na implementação" é, na verdade, **estender o enum** — que é exportado
  > (`schema.js:2046`) e servido ao front como `localizacoes_tipos` (`extended.js:151`), ou seja,
  > **mudança de contrato de API**, não conferência. O item de checklist que depende disto é o
  > "Transferir material separado para localização Aguardando retirada/Kit".
  > **A afirmação errada fica à vista, riscada**, em vez de apagada: é a quarta vez nesta base que
  > uma spec afirma algo sobre a existência de código sem medir, e a segunda no sentido inverso
  > (as três anteriores diziam que algo **não** existia quando existia; esta diz que existe e não
  > existe).
- **A separação NÃO TEM AUTOR e NÃO DEIXA RASTRO** (medido na Fase 0 da Etapa 28, 2026-08-29 —
  esta spec não nomeava o fato, e ele é o **bloqueio real** de três itens do checklist):
  `requisitionService.separarRequisicao(db, requisicaoId, itensSeparados)` (`:189`) **não recebe
  `user`**, e o handler da rota (`routes/almoxarifado.js:3301`, `handleSeparacao`) **não repassa
  `req.user`**; `requisitionService.js` tem **zero** ocorrências de `registrarAuditoria`/`auditar`
  (contado); `auditLabels.js` tem **zero** ocorrências de `SEPARA` — não existe verbo de
  separação no vocabulário da trilha. Consequência: **não há como saber quem separou uma
  requisição**, nem pela trilha nem pela tabela. O contraste é dentro do mesmo arquivo de rotas:
  `/confirmar-recebimento` e `/rejeitar-valor` auditam; `/separacao` e `/liberar-retirada` não.
- **Armadilha de segunda porta, medida e nomeada:** existe `conferencias_almoxarifado` com
  `dupla_contagem`, `contado_por_id`/`recontado_por_id` e `modo_cego` (`schema.js:1876-1891`).
  **Não serve para o item "Segunda conferência" desta spec:** é conferência de **inventário**
  (feature 10, `tipo DEFAULT 'GERAL'`, tela `ConferenciaEstoque.js`), sem nenhuma ligação com
  requisição ou separação. Está escrito aqui para ninguém "descobrir" a tabela no meio da etapa e
  achar que o item já está meio pronto — mesmo cuidado que a spec 09 tomou com `padroes_qualidade`.

## Checklist

### Backend
- [ ] Lista de separação como entidade própria (agrupa itens de 1+ requisições)
- [ ] Agrupamento por projeto / setor / localização
- [ ] Prioridade e responsável pela separação — **o "responsável" é o bloqueio de fato, e ele é
  anterior a tudo neste checklist:** hoje o separador **não é gravado em lugar nenhum** (ver "O que
  já existe"). Não é um campo a somar a um fluxo pronto: é o campo sem o qual os itens
  "Segunda conferência (conferente ≠ separador)" e a regra "conferência pelo mesmo usuário da
  separação falha" **não têm como existir**
- [ ] Sugestão de rota (ordenar itens pela hierarquia de localizações)
- [ ] Registro por item: localização lida, lote/série retirado, quantidade, divergência
- [ ] Substituição de lote com registro
- [ ] Separação parcial com saldo pendente — nota (auditoria 2026-08-11): a **parcialidade em si já funciona** (acúmulo de `quantidade_separada` em múltiplas rodadas + teto `maxSeparar`, entregue nas Etapas 3/4); o que falta deste item é a entidade lista-de-separação e o registro de divergência
- [ ] Transferir material separado para localização "Aguardando retirada"/"Kit" (movimentação v2 de transferência) — **exige estender `TIPOS_LOCALIZACAO` primeiro** (ver a correção em "O que já existe"): os três tipos que este item pressupõe **não existem** no enum
- [ ] Segunda conferência (conferente ≠ separador) — **depende do item "responsável" acima**. O
  molde já existe na base e é o mais maduro dela: a dupla assinatura **por identidade** do
  sucateamento (`scrapDisposalService.js:342`, duas ações de perfil próprias, segunda assinatura
  fechando o status num claim único). Aqui falta a primeira metade — saber quem foi o primeiro
- [ ] Kit: identificação e conteúdo
- [x] Liberar para retirada → status da requisição `PRONTA_PARA_RETIRADA` — **entregue na Etapa 3 (2026-08-05)**: rota `PUT /requisicoes/:id/liberar-retirada` (permissão `separar_emitir`), valida a transição na máquina de estados e exige ≥1 item separado, com teste de API. Estava marcado na spec 04 desde a Etapa 3 e **aqui ficou esquecido como pendente** — corrigido na auditoria de 2026-08-11

### Frontend
- [ ] Tela de listas de separação (fila de trabalho do almoxarife)
- [ ] Fluxo de conferência

## Regras essenciais + testes de API exigidos

| Regra | Teste |
|-------|-------|
| Separar mais que o solicitado/estoque falha | `separacao acima do estoque falha` (existe em serviço — cobrir na API) |
| ~~Material separado sai do disponível (vai para localização reservada)~~ **Superada — esta regra estava errada como mecanismo (corrigido 2026-08-11):** desde a Etapa 4 o material sai do disponível **na aprovação**, via reserva (`requisitionService.reservarItensAprovacao`); a separação não move saldo nenhum | coberto pelos testes de reserva da feature 07 (`requisicaoReservaAutomatica.api.test.js`); mover fisicamente para localização de kit fica com a lista de separação, se vier |
| Segunda conferência exige usuário diferente | `conferencia pelo mesmo usuario da separacao falha` |
| Divergência na separação exige registro | `separacao com quantidade menor exige motivo` |

## Dependências

- 03 (movimentação v2 para transferências internas) · 04 (status novos) · 02 (localizações virtuais) · leitura de código de barras fica para Etapa 15 (API deve aceitar campos de leitura desde já).
