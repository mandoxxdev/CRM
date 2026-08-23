# 16 — Ferramentas e Equipamentos de Medição

> **Status:** 🟢 — cadastro, empréstimo com claim, calibração com vencimento que bloqueia,
> manutenção, avaria/perda com foto, bloqueio e tela própria completos e testados · **Spec
> original:** seção 20 · **Design da etapa:**
> [`docs/superpowers/specs/2026-08-19-almoxarifado-etapa9b-ferramentas-calibracao-design.md`](../../../docs/superpowers/specs/2026-08-19-almoxarifado-etapa9b-ferramentas-calibracao-design.md)
> **Última atualização:** 2026-08-22 (Etapa 9b fechada, `d644827..b8e6f60`)
> Antes: 2026-08-15

## Correção declarada (2026-08-22)

Esta seção, até a Etapa 9b, dizia: "cadastro e empréstimo prontos no backend, sem UI; calibração
inexistente" e citava `extended.js:672-698`/`schema.js:555-569` como as linhas do backend
existente. **Isso já estava parcialmente errado antes mesmo da Etapa 9b** — eram referências
mortas (a Etapa 9 tinha empurrado o arquivo) que a correção de 2026-08-15 já tinha marcado como
tal. A Etapa 9b reescreveu o subsistema inteiro (não só completou o que faltava): o empréstimo
antigo tinha corrida (SELECT-depois-UPDATE), zero teste, zero validação Zod, zero auditoria e
gate errado (`movimentar`, que é permissão de estoque). Nada disso sobrou — ver "O que existe
hoje" abaixo para as linhas atuais.

## Objetivo

Patrimônio de ferramentas com empréstimo a colaborador, avaria/perda/bloqueio, manutenção e
calibração com vencimento que impede o uso. (Lembrete automático de devolução fica para a feature
20 — ver "O que ficou de fora" abaixo.)

## O que existe hoje

- **Tabelas** (`server/services/almoxarifado/schema.js:1465-1524`): `ferramentas_almoxarifado`
  (com `numero_serie`, `localizacao_id`, `exige_calibracao` — colunas novas da Etapa 9b, por
  `safeAlter`), `emprestimos_ferramenta_almoxarifado`, `calibracoes_ferramenta_almoxarifado`,
  `manutencoes_ferramenta_almoxarifado`, `ocorrencias_ferramenta_almoxarifado`.
- **Máquina de estados** (`server/services/almoxarifado/toolStateMachine.js`): `DISPONIVEL /
  EMPRESTADA / BLOQUEADA / EM_MANUTENCAO / AVARIADA / PERDIDA`, toda transição por claim
  (`UPDATE ... WHERE id = ? AND status IN (...)`) — nenhuma janela de corrida.
- **Serviço** (`server/services/almoxarifado/toolService.js`): criar/atualizar ferramenta,
  emprestar/devolver, bloquear/desbloquear, iniciar/concluir manutenção, registrar
  ocorrência (avaria/perda) com foto, registrar calibração com certificado, painel de
  calibrações a vencer, reencontrar ferramenta perdida, listar com filtros
  (`status`, `busca`, `exige_calibracao`).
- **Rotas** (`server/routes/almoxarifado/extended.js:863-1044`): todas sob a ação de perfil
  `gerenciar_ferramentas` (`ADMINISTRADOR`, `ALMOXARIFE`) nas escritas; leitura é `auth` simples.
  Contrato completo (payload, mensagens literais de recusa) na tabela do design da etapa.
- **Ação de perfil** `gerenciar_ferramentas` (`server/services/almoxarifado/permissions.js`).
- **Tela** `/almoxarifado/ferramentas` (`client/src/components/almoxarifado/FerramentasAlmoxarifado.js`):
  três visões — Ferramentas (lista + cadastro + ações por status), Empréstimos (ativos com
  vencidos destacados + histórico), Calibrações (painel vencidas/a vencer).
- `colaboradores` cadastrados no core (`index.js:19130`) — segue sendo a fonte de colaborador.

## Checklist

### Backend
- [x] Número de série da ferramenta + localização — `a62f71a` (Task 1, colunas), `a3d37dd`
      (Task 2, campos no create/update)
- [ ] Lembrete de devolução vencida (job ligado a canal de notificação) + alerta (feature 20) —
      **parcial**: a função pura `toolReminderService.listarEmprestimosVencidos(db)` e o filtro
      `GET /emprestimos?vencidos=1` existem e estão testados (`f5004df`), mas **não há job
      agendado nem canal de notificação** — ruling registrado na execução: um agendador sem
      e-mail (feature 19) ou alerta formal (feature 20) rodaria sem efeito útil. Fica para
      quando a feature 20 existir; ver letra B do `docs/almoxarifado-novidades-por-etapa.md`.
- [x] Avaria e perda: registro com foto, responsável e efeito no status — `0f89434`/`d2adfe6`
      (Task 5, RN-05)
- [x] Bloqueio de ferramenta (não pode ser emprestada) — `b383b37` (Task 4, RN-06)
- [x] Manutenção: histórico de manutenções, ferramenta em manutenção não empresta — `b383b37`,
      compensação e claim corrigidos em `99e5dc7` (Task 4, RN-07)
- [x] **Calibração**: data da última, validade, certificado anexo, alerta de vencimento —
      `5e01413`/`bdd9848`/`40490bc` (Task 3, RN-08). Alerta é o painel (`GET
      /calibracoes/painel`) na tela; alerta formal (notificação) é feature 20, fora de escopo
      declarado (design D11).
- [x] Impedir empréstimo/uso de equipamento com calibração vencida — `a3d37dd` (Task 2, RN-03)
- [ ] Integração com inspeção: instrumento usado na medição referenciando equipamento calibrado
      (feature 09) — **fora de escopo declarado** (design D11): feature 09 não tem plano de
      inspeção com medidas ainda.

### Frontend
- [x] Tela de ferramentas: cadastro, empréstimos ativos, histórico por colaborador — `96d0879`
      (Task 7, worktree `etapa9b-task7-front`), merge `daffb81`; filtros `busca`/`status`/
      `exige_calibracao` fechados em `60a452e`/`b8e6f60` (revisão final)
- [ ] **Edição de ferramenta pela tela** — **não entregue nesta etapa**: o design (D9) prometia
      "cadastro/edição", só o cadastro foi construído (corte não declarado até a revisão final
      de branch, achado F3). `PUT /ferramentas/:id` e o 409 de patrimônio duplicado **existem no
      backend e estão testados** (`server/tests/api/toolFerramentaEdicao.api.test.js`,
      `86090f0`) — só falta o formulário na tela. Registrado como melhoria pendente, letra B do
      `docs/almoxarifado-novidades-por-etapa.md`.
- [x] Painel de calibrações a vencer — `96d0879`, guard de `dias_restantes: null` (ferramenta
      nunca calibrada) fechado em `0d26c9a`

## Regras essenciais + testes de API exigidos

As 4 regras originais desta seção viraram RN-01/02/03/04 no design da etapa; a etapa acrescentou
RN-05..RN-11. Lista completa, com a mensagem literal de recusa, no design
(`2026-08-19-almoxarifado-etapa9b-ferramentas-calibracao-design.md`, seção "Regras de negócio
numeradas" e tabela "Contratos de API").

| Regra | Teste | Arquivo |
|-------|-------|---------|
| RN-01 — Ferramenta emprestada não pode ser emprestada de novo (claim atômico) | `emprestar ferramenta ja emprestada falha`, `corrida — dois emprestar simultaneos, exatamente um vence` | `toolEmprestimo.api.test.js` |
| RN-02 — Ferramenta bloqueada/em manutenção/avariada/perdida não empresta | `emprestar ferramenta bloqueada falha` | `toolEmprestimo.api.test.js` |
| RN-03 — Calibração vencida ou ausente barra o empréstimo | `emprestar equipamento com calibracao vencida falha` | `toolEmprestimo.api.test.js` |
| RN-04 — Devolução libera a ferramenta | `devolver ferramenta permite novo emprestimo` | `toolEmprestimo.api.test.js` |
| RN-05 — Avaria/perda sobre emprestada encerra o empréstimo | `RN-05: perda sobre emprestada encerra o emprestimo e aplica PERDIDA` | `toolOcorrencia.api.test.js` |
| RN-06 — Bloqueio/desbloqueio exigem justificativa e auditam | testes de bloqueio/desbloqueio | `toolManutencao.api.test.js` |
| RN-07 — Manutenção: emprestada não entra, avariada entra, conclusão libera | testes de manutenção | `toolManutencao.api.test.js` |
| RN-08 — Calibração vigente reabre o empréstimo | jornada completa | `toolIntegracao.api.test.js` |
| RN-09 — Gate `gerenciar_ferramentas`, leitura livre | `RN-09: PRODUCAO recebe 403 nas escritas; leitura passa` | `toolEmprestimo.api.test.js` |
| RN-10 — Reencontrar exige justificativa, só vale para PERDIDA | testes de reencontro | `toolManutencao.api.test.js` |
| RN-11 — Toda escrita audita | `RN-11: emprestar e devolver auditam` | `toolEmprestimo.api.test.js` |
| Corrida devolver ↔ ocorrência não corrompe o status (achado F2 da revisão final) | `F2(a)`/`F2(b)` | `toolEmprestimo.api.test.js`, `toolOcorrencia.api.test.js` |
| PUT/409 de ferramenta | 3 testes de PUT/404/409 | `toolFerramentaEdicao.api.test.js` |
| Jornada completa (calibra → empresta → avaria → conserta → devolve) | teste-jornada | `toolIntegracao.api.test.js` |

## O que ficou de fora (declarado)

- **Job de lembrete de devolução vencida** não está ligado a nenhum canal — ver checklist acima.
- **UI de edição de ferramenta** — ver checklist acima.
- **Integração com inspeção** (instrumento calibrado referenciado na medição) — feature 09.
- **Motor de alertas formal** (notificação de vencimento) — feature 20.
- **Requisição de ferramenta** pelo fluxo de requisições — feature 04.

## Dependências

- 20 (alertas de devolução/calibração) · 09 (instrumento na inspeção) · 19 (e-mails, para o
  lembrete de devolução ganhar canal).
