# 06 — Motor de Aprovações

> **Status:** 🟡 — segregação/emergencial/rejeição justificada/auditoria entregues (Etapa 3, 2026-08-05); regras configuráveis por tipo/valor/quantidade/projeto ainda não existem · **Spec original:** seção 6
> **Última atualização:** 2026-08-29 (**Fase 0 da Etapa 28, medida no código — esta spec estava
> congelada em 2026-08-11 e TRÊS itens do checklist descrevem código que já mudou**; corrigidos
> abaixo, dizendo que estavam errados. A **cor não muda**: o motor de regras configuráveis
> continua não existindo, e continua adiado por decisão de escopo, não por esquecimento.)
> Antes: 2026-08-11 (auditoria spec×código)

## Objetivo

Motor de aprovação configurável por tipo de material, valor, quantidade, projeto, urgência, criticidade e propriedade (cliente), com regras de segregação.

## O que já existe

- Aprovar/rejeitar requisição: `PUT /requisicoes/:id/aprovar|rejeitar` (`routes/almoxarifado.js`) com perfis `aprovar_requisicao` (ADMIN, ALMOXARIFE, GESTOR); aprovação passou a ser um único `UPDATE` (Etapa 3, Task 2 — antes fazia leitura+update separados).
- Aprovação por valor: `requisitionValueApprovalService.js` (**414 L** — dizia 399, contado em 2026-08-29) — limite configurável em `configuracoes_almoxarifado`, fluxo aprovar-valor/rejeitar-valor, e-mails, testes.
- Configuração "Liberação por Valor" no front (`ConfiguracoesAlmoxarifado.js`).
- Aprovação de ajuste de inventário: aprovador registrado em `conferencias_almoxarifado` (`aprovador_*`, `justificativa_ajuste`).
- **Etapa 3 (2026-08-05):** segregação nas duas lanes (aprovar e aprovar-valor) — o solicitante não pode aprovar a própria requisição (403); rejeitar a própria continua permitido nas duas lanes (desistência legítima, não é uma decisão de aprovação); rejeição (normal e por valor) exige motivo (`rejeicao_motivo`), 400 sem ele; tipo `EMERGENCIAL` exige justificativa na criação (`RequisicaoSchema.superRefine`, Task 1); toda decisão (aprovação, rejeição, confirmação de recebimento, encerramento) é auditada em `auditoria_log_almoxarifado` com `acao` (`APROVACAO`/`REJEICAO`/`APROVACAO_VALOR`/`REJEICAO_VALOR`/`CONFIRMACAO_RECEBIMENTO`/`ENCERRAMENTO`), usuário e justificativa — as duas ações de valor são gravadas na lane `/aprovar-valor` (anotadas aqui na auditoria de 2026-08-11).
- **Etapa 4, Task 6 (2026-08-06) — anotado aqui na auditoria de 2026-08-11 (até então só a spec 07 documentava):** a lane `/aprovar-valor` também **reserva** depois de aprovar — a reserva acontece na rota, após `aprovarValor`, e sobrescreve o status para `PARCIALMENTE/TOTALMENTE_RESERVADA` (sem nada a reservar, o `APROVADO` permanece). Detalhes e testes na feature 07.
- Decisão de escopo confirmada (design da Etapa 3): regras de aprovação ficam **fixas e declarativas em código** (segregação + limite por valor); a tabela `regras_aprovacao` configurável por tipo/valor/quantidade/projeto/urgência, com UI própria, fica para demanda real — não entrou nesta etapa.

## Checklist

### Backend
- [ ] Tabela `regras_aprovacao` (critérios: tipo de requisição, tipo/criticidade do material, valor, quantidade, projeto/centro de custo, urgência, material de cliente, fora da lista técnica) → aprovadores/perfis exigidos — decisão de escopo: adiada para demanda real (Etapa 3 manteve regras fixas em código: segregação + limite por valor)
- [ ] Avaliador de regras no envio da requisição (gera lista de aprovações pendentes; requisição pode exigir N aprovações) — não existe; hoje há só as duas lanes fixas (aprovação simples e aprovação por valor), não um motor de N aprovações configuráveis
- [x] Segregação: solicitante não aprova a própria requisição (Etapa 3, Task 4 — nas duas lanes, aprovar e aprovar-valor; rejeitar a própria continua permitido, é desistência)
- [x] Requisição emergencial exige justificativa (Etapa 3, Task 1 — `RequisicaoSchema.superRefine`, validado na criação nas 2 rotas)
- [x] Material de cliente exige autorização específica (feature 13) — **ENTREGUE na Etapa 8 (2026-08-12), e este item ficou `[ ]` por 17 dias descrevendo um estado que já tinha mudado.** A ação dedicada existe: `ajustar_material_cliente: [ADMINISTRADOR]` (`permissions.js:34`), verificada **dentro do motor** (`stockService.js:692`), com guarda de dono na saída. **A frase "fora da Etapa 3" ESTAVA CERTA quando escrita e ficou ERRADA depois** — esta spec não foi reaberta quando a 13 entregou. Fica dito em vez de apenas marcado
- [ ] Material fora da lista técnica → aprovação da Engenharia (depende da feature 22) — fora da Etapa 3
- [ ] Ajuste de estoque exige **dupla aprovação** (feature 17) — fora da Etapa 3
- [x] Sucateamento exige aprovação Almoxarifado + gestão (feature 15) — **ENTREGUE na Etapa 9 (2026-08-16), e este item ficou `[ ]` descrevendo o passado.** E é mais do que um item pago: **é o motor de N aprovações que o item acima diz não existir, em forma concreta de dois níveis.** Duas pernas em colunas próprias (`schema.js:1565-1569`: `aprovador_almox_id/nome`, `aprovador_gestao_id/nome`), **duas ações de perfil distintas** (`permissions.js:64-65`: `aprovar_sucateamento` = [ADMINISTRADOR, ALMOXARIFE], `aprovar_sucateamento_gestao` = [ADMINISTRADOR, GESTOR]), **segregação por IDENTIDADE** — a mesma pessoa não assina as duas pernas, mesmo sendo Administrador (`scrapDisposalService.js:342`) —, e o status só vira `APROVADO` na **segunda** assinatura, por `CASE` num claim único (`scrapDisposalStateMachine.js:11-22`), com teste de API dedicado (`sucateamentoAprovacao.api.test.js`).
  > **Quem for construir o motor de regras desta feature 06 deve PARTIR DAQUI, não do zero.** O padrão de duas assinaturas segregadas por identidade, com fechamento atômico, já foi construído, testado e está em produção nesta base — generalizá-lo é trabalho diferente (e menor) de inventá-lo
- [x] Registro imutável de cada decisão (quem, quando, justificativa) — implementado via `auditoria_log_almoxarifado` (Etapa 3, Task 4/5), não via tabela `aprovacoes` dedicada: toda aprovação/rejeição/confirmação/encerramento grava `usuario_id`, `usuario_nome`, `justificativa` e `dados_novos`; não há rota de editar/excluir uma entrada de auditoria (sem teste de API dedicado provando a ausência da rota)
- [x] Rejeição exige justificativa (Etapa 3, Task 4 — nas duas lanes, normal e por valor; 400 sem motivo)

### Frontend
- [ ] Config de regras de aprovação (nova aba em Configurações) — fora da Etapa 3 (não há tabela de regras para configurar)
- [~] Fila "minhas aprovações pendentes" — **a parte entre parênteses ESTAVA ERRADA: NÃO é "só a lista geral filtrada".** Existe fila dedicada para a lane de **valor**: botão que só aparece para quem é aprovador (`RequisicoesList.js:731`, condicionado a `souAprovadorValor || isAdmin`, com `souAprovador` vindo da API), forçando `status = AGUARDANDO_APROVACAO_VALOR`, com aprovar/reprovar no detalhe e aviso para quem não é aprovador. O backend ainda tem `?minha=1`. **O que falta é a equivalente para a lane SIMPLES** (`aprovar_requisicao`), que não tem fila nem sabe resolver perfil → pessoa

## Dois achados da Fase 0 da Etapa 28 (2026-08-29) que esta spec não nomeava

**1. `limite_aprovacao_auto` é configuração MORTA — uma regra de aprovação que aparece na tela e
não faz nada.** `schema.js:1908` semeia `['limite_aprovacao_auto', '5', 'Quantidade máxima para
aprovação automática por item']`. Varredura do repositório inteiro (`server/` + `client/`,
`--include=*.js`, fora `node_modules`): **uma única ocorrência, o próprio seed**. Zero leitores.
Ela aparece na listagem de configurações do módulo prometendo aprovação automática por
quantidade — que **não existe**. É o oposto do padrão "escrito e sem leitor" que esta base já
nomeou: aqui não há nem escritor, só a promessa. **Ou ganha leitor, ou sai do seed.**

**2. O lembrete de requisição parada NUNCA alcança a requisição de alto valor.**
`requisitionReminderService.js:252` filtra `WHERE status = 'PENDENTE'` — e a requisição travada
por liberação de valor está em **`AGUARDANDO_APROVACAO_VALOR`**, que esse `WHERE` não pega.
Ironia medida: `requisitionValueApprovalService.js` **limpa `ultimo_lembrete_enviado`** exatamente
ao entrar nesse status, ou seja, prepara o campo para um lembrete que nunca é disparado. **A
requisição que mais precisa de cobrança — a que passou do limite em R$ — é a única que fica sem
ela.** Escrita sem leitor, na forma mais cara.

## Regras essenciais + testes de API exigidos

| Regra | Teste |
|-------|-------|
| Solicitante não aprova a própria requisição (aprovação simples) | `[aprovar] solicitante tenta aprovar a própria -> 403, status inalterado` (`requisicaoAprovacao.api.test.js`) |
| Solicitante não aprova a própria requisição (aprovação por valor) | `[aprovar-valor] solicitante (também aprovador de valor) tenta aprovar a própria -> 403` (`requisicaoAprovacao.api.test.js`) |
| Emergencial sem justificativa é rejeitada | `[…] EMERGENCIAL sem justificativa — 400` (`requisicaoCriacao.api.test.js`, nas 2 rotas) |
| Requisição só avança com TODAS as aprovações exigidas | não aplicável ainda — não existe motor de N aprovações configuráveis (só as 2 lanes fixas) |
| Rejeição exige justificativa (aprovação simples) | `[rejeitar] sem motivo -> 400` + `motivo vazio -> 400` (`requisicaoAprovacao.api.test.js`) |
| Rejeição exige justificativa (aprovação por valor) | `[rejeitar-valor] sem motivo -> 400` (`requisicaoAprovacao.api.test.js`) |
| Decisão de aprovação/rejeição é auditada | `[aprovar] decisão auditada (acao APROVACAO)` + `[rejeitar] decisão auditada (acao REJEICAO, justificativa=motivo)` (`requisicaoAprovacao.api.test.js`) |
| Decisão de aprovação é imutável (sem rota de editar/excluir) | não coberto por teste de API dedicado nesta etapa |

## Dependências

- 04 (máquina de estados da requisição — Etapa 3 entregue) · consumidores: 13, 15, 17.
