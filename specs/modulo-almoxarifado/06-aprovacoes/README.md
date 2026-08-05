# 06 — Motor de Aprovações

> **Status:** 🟡 — segregação/emergencial/rejeição justificada/auditoria entregues (Etapa 3, 2026-08-05); regras configuráveis por tipo/valor/quantidade/projeto ainda não existem · **Spec original:** seção 6
> **Última atualização:** 2026-08-05

## Objetivo

Motor de aprovação configurável por tipo de material, valor, quantidade, projeto, urgência, criticidade e propriedade (cliente), com regras de segregação.

## O que já existe

- Aprovar/rejeitar requisição: `PUT /requisicoes/:id/aprovar|rejeitar` (`routes/almoxarifado.js`) com perfis `aprovar_requisicao` (ADMIN, ALMOXARIFE, GESTOR); aprovação passou a ser um único `UPDATE` (Etapa 3, Task 2 — antes fazia leitura+update separados).
- Aprovação por valor: `requisitionValueApprovalService.js` (399 L) — limite configurável em `configuracoes_almoxarifado`, fluxo aprovar-valor/rejeitar-valor, e-mails, testes.
- Configuração "Liberação por Valor" no front (`ConfiguracoesAlmoxarifado.js`).
- Aprovação de ajuste de inventário: aprovador registrado em `conferencias_almoxarifado` (`aprovador_*`, `justificativa_ajuste`).
- **Etapa 3 (2026-08-05):** segregação nas duas lanes (aprovar e aprovar-valor) — o solicitante não pode aprovar a própria requisição (403); rejeitar a própria continua permitido nas duas lanes (desistência legítima, não é uma decisão de aprovação); rejeição (normal e por valor) exige motivo (`rejeicao_motivo`), 400 sem ele; tipo `EMERGENCIAL` exige justificativa na criação (`RequisicaoSchema.superRefine`, Task 1); toda decisão (aprovação, rejeição, confirmação de recebimento, encerramento) é auditada em `auditoria_log_almoxarifado` com `acao` (`APROVACAO`/`REJEICAO`/`CONFIRMACAO_RECEBIMENTO`/`ENCERRAMENTO`), usuário e justificativa.
- Decisão de escopo confirmada (design da Etapa 3): regras de aprovação ficam **fixas e declarativas em código** (segregação + limite por valor); a tabela `regras_aprovacao` configurável por tipo/valor/quantidade/projeto/urgência, com UI própria, fica para demanda real — não entrou nesta etapa.

## Checklist

### Backend
- [ ] Tabela `regras_aprovacao` (critérios: tipo de requisição, tipo/criticidade do material, valor, quantidade, projeto/centro de custo, urgência, material de cliente, fora da lista técnica) → aprovadores/perfis exigidos — decisão de escopo: adiada para demanda real (Etapa 3 manteve regras fixas em código: segregação + limite por valor)
- [ ] Avaliador de regras no envio da requisição (gera lista de aprovações pendentes; requisição pode exigir N aprovações) — não existe; hoje há só as duas lanes fixas (aprovação simples e aprovação por valor), não um motor de N aprovações configuráveis
- [x] Segregação: solicitante não aprova a própria requisição (Etapa 3, Task 4 — nas duas lanes, aprovar e aprovar-valor; rejeitar a própria continua permitido, é desistência)
- [x] Requisição emergencial exige justificativa (Etapa 3, Task 1 — `RequisicaoSchema.superRefine`, validado na criação nas 2 rotas)
- [ ] Material de cliente exige autorização específica (feature 13) — fora da Etapa 3
- [ ] Material fora da lista técnica → aprovação da Engenharia (depende da feature 22) — fora da Etapa 3
- [ ] Ajuste de estoque exige **dupla aprovação** (feature 17) — fora da Etapa 3
- [ ] Sucateamento exige aprovação Almoxarifado + gestão (feature 15) — fora da Etapa 3
- [x] Registro imutável de cada decisão (quem, quando, justificativa) — implementado via `auditoria_log_almoxarifado` (Etapa 3, Task 4/5), não via tabela `aprovacoes` dedicada: toda aprovação/rejeição/confirmação/encerramento grava `usuario_id`, `usuario_nome`, `justificativa` e `dados_novos`; não há rota de editar/excluir uma entrada de auditoria (sem teste de API dedicado provando a ausência da rota)
- [x] Rejeição exige justificativa (Etapa 3, Task 4 — nas duas lanes, normal e por valor; 400 sem motivo)

### Frontend
- [ ] Config de regras de aprovação (nova aba em Configurações) — fora da Etapa 3 (não há tabela de regras para configurar)
- [ ] Fila "minhas aprovações pendentes" (hoje só a lista geral filtrada) — fora da Etapa 3

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
