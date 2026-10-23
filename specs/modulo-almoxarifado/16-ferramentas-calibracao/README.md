# 16 — Ferramentas e Equipamentos de Medição

> **Status: 🟡** — completa no que a 9b prometeu, mais a edição pela tela (175), o retorno da manutenção (177) e o **termo de
> responsabilidade no empréstimo (180)**. **Falta para 🟢:** a integração com a inspeção (feature 09; **B1146** pergunta à empresa) — ver o
> checklist. **Correção (2026-10-22, Etapa 181, medida):** esta linha dizia que faltava também *"o lembrete de devolução com canal (feature
> 20)"* — **estava errado desde a Etapa 12**: o job diário `notificationQueueService.varrerLembretesFerramenta` (e-mail pela fila, um por
> empréstimo e dia) existe desde `837faec1` e a spec 20 já o marcava pago. Corrigido no checklist, dizendo. **Correção (2026-10-22, Etapa 180):** este arquivo tinha **dois status contraditórios** — o bloco
> "Status" mais abaixo dizia **🟢** (escrito na 9b, 2026-08-22) enquanto as notas das Etapas 175 e 177 logo acima e o mapa
> (`../README.md`) diziam **🟡**. **O 🟢 estava errado** desde a revisão final da 9b (que já registrava a edição pela tela e a inspeção como
> pendências); vale o 🟡. O bloco antigo ficou, riscado, como histórico.
>
> **+ Etapa 180 (2026-10-22, T1 `2092806d`, T2 `11ef2821`, T3 `04b9d2fb`, T4 `31fb475f`+`3d161c35`, Fase 5 `c40b1f56`, `bcd89a2f`, `003de01b`):
> termo de responsabilidade no empréstimo (RN-D do design de 16/09)** — colaborador do cadastro, texto versionado do termo, assinatura e
> **+ Etapa 181 (2026-10-22, T1 `3ce1d3a2`, Fase 5 `71418065`): com quem a ferramenta está passa a ser só de quem gerencia ferramentas** — o
> relatório *Ferramentas emprestadas* (`acao: gerenciar_ferramentas`) e o `emprestimo_aberto` de `GET /ferramentas` (lista branca `{id,
> data_prevista_devolucao}` para os outros perfis). Ver a seção "Etapa 181", no fim. O status não muda (🟡, pela integração com a inspeção).
>
> matrícula; a fotografia congelada na cadeia de evidências da 178. Ver a seção "Etapa 180", no fim. O status não muda (🟡, pelos dois itens acima).
>
> **Etapa 178 (2026-10-22): a entrega de EPI virou a feature nova [25](../25-entrega-epi/README.md)**, não esta — EPI é consumo entregue,
> não patrimônio emprestado. O que ela deixa para esta feature: o serviço genérico de evidência de assinatura (`evidenciaAssinaturaService`,
> HMAC com segredo fora do banco + cadeia) que o **termo de responsabilidade de ferramenta** (RN-D) vai usar — a **próxima, Etapa 180**,
> que depende dos formulários da empresa (ver a "próxima tarefa detalhada" no plano da 178). O status desta feature não muda.

> **+ Etapa 177 (2026-10-22, T1 `17ce8759`, T2 `c2bc2d37`): o retorno da manutenção com a condição do item e o destino (volta ao uso ou baixa)** — estado novo **BAIXADA**, reversível. Ver a seção "Etapa 177", no fim. O status da feature não muda (🟡 pelo lembrete de devolução e pela integração com a inspeção).

> **+ Etapa 175 (2026-10-22, T1 `2a54344f`, T2 `735f7c5d`): editar a ferramenta pela tela** — o item "Edição de ferramenta pela tela" do checklist, aberto desde a 9b, foi entregue. Ver a seção "Etapa 175", no fim. A feature continua 🟡 pelo lembrete de devolução (feature 20) e pela integração com a inspeção.

> **+ Etapa 170 (2026-10-20, `3fb6aa0e`): a *Retirada* dos empréstimos no dia de Brasília, no formato da tela (B1081, só exibição)** — ver a seção "Etapa 170", no fim. O status não muda.

> **+ Etapa 163 (2026-10-20, `6502c690`, Fase 5 `407ddfcc`): a calibração vigente, o painel, os empréstimos vencidos e o lembrete pelo dia de Brasília (C406, B1041)** — ver a seção "Etapa 163", no fim. O status não muda.

> **+ Etapa 160 (2026-10-19, `eaf682e9`): a busca das ferramentas (`busca`) e dos empréstimos (`colaborador`) acha a letra acentuada em qualquer caixa e aparada (C393, B1019)** — ver a seção "Etapa 160", no fim.

> **Status (da 9b — ERRADO, ver a correção no topo):** ~~🟢~~ — cadastro, empréstimo com claim, calibração com vencimento que bloqueia,
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

> **Correção (2026-10-22, Etapa 180):** esta seção citava `schema.js:1465-1524`, `extended.js:863-1044` e `index.js:19130`, dizia que
> a leitura era "`auth` simples", que o serviço emprestava e que a máquina tinha seis estados. **Estava desatualizada** (as linhas tinham
> andado; a 177 criou BAIXADA; a 180 tirou o empréstimo do `toolService` e restringiu a leitura dos empréstimos). Linhas medidas de novo
> em 2026-10-22, abaixo — e, como linha anda, procure pelo nome, não pelo número.

- **Tabelas** (`server/services/almoxarifado/schema.js`, ~2426-2490): `ferramentas_almoxarifado`
  (com `numero_serie`, `localizacao_id`, `exige_calibracao` — colunas novas da Etapa 9b, por
  `safeAlter`), `emprestimos_ferramenta_almoxarifado`, `calibracoes_ferramenta_almoxarifado`,
  `manutencoes_ferramenta_almoxarifado` (com `condicao_retorno`/`destino`, 177), `ocorrencias_ferramenta_almoxarifado`.
  **Desde a 180** (`ensureTermoFerramenta`, ~454-507): `termos_responsabilidade_versao` (o texto do termo, uma linha por versão) e
  `termos_emprestimo_ferramenta` (a fotografia do termo assinado), as duas append-only por trigger.
- **Máquina de estados** (`server/services/almoxarifado/toolStateMachine.js`): `DISPONIVEL /
  EMPRESTADA / BLOQUEADA / EM_MANUTENCAO / AVARIADA / PERDIDA / BAIXADA` (a última desde a 177), toda transição por claim
  (`UPDATE ... WHERE id = ? AND status IN (...)`) — nenhuma janela de corrida.
- **Serviço** (`server/services/almoxarifado/toolService.js`): criar/atualizar ferramenta,
  devolver, bloquear/desbloquear, iniciar/concluir manutenção (com baixa e reversão, 177), registrar
  ocorrência (avaria/perda) com foto, registrar calibração com certificado, painel de
  calibrações a vencer, reencontrar ferramenta perdida, listar com filtros
  (`status`, `busca`, `exige_calibracao`). **O empréstimo saiu daqui na 180:** `toolService.emprestarFerramenta` ficou sem rota (legado);
  quem empresta é `termoFerramentaService.emprestarComTermo` (claim + empréstimo + fotografia + evidência numa transação, na fila da cadeia).
- **Termo** (`server/services/almoxarifado/termoFerramentaService.js`, 180): versões do texto, empréstimo com termo, termo do empréstimo,
  verificação; registra o contexto `TERMO_FERRAMENTA` na cadeia (`evidenciaAssinaturaService`).
- **Rotas** (`server/routes/almoxarifado/extended.js`, ~1623-2135): escritas sob `gerenciar_ferramentas` (`ADMINISTRADOR`, `ALMOXARIFE`);
  `GET /ferramentas` e as calibrações seguem `auth` simples; **`GET /emprestimos`, o termo e a verificação exigem `gerenciar_ferramentas`
  desde a 180**; `POST /termos/FERRAMENTA` exige `editar_termos` (só ADMINISTRADOR). Contrato da 9b na tabela do design da etapa; o da 180
  no plano dela ("Contrato real para o front").
- **Ações de perfil** `gerenciar_ferramentas` e `editar_termos` (`server/services/almoxarifado/permissions.js`).
- **Tela** `/almoxarifado/ferramentas` (`client/src/components/almoxarifado/FerramentasAlmoxarifado.js`):
  Ferramentas (lista + cadastro + edição + ações por status), Empréstimos (só `gerenciar_ferramentas`; coluna Termo), Calibrações (painel
  vencidas/a vencer) e Texto do termo (só `editar_termos`).
- `colaboradores` cadastrados no core (`server/index.js`, ~19255) — a fonte de colaborador, **obrigatória no empréstimo desde a 180**.

## Checklist

### Backend
- [x] Número de série da ferramenta + localização — `a62f71a` (Task 1, colunas), `a3d37dd`
      (Task 2, campos no create/update)
- [x] Lembrete de devolução vencida (job ligado a canal de notificação) + alerta (feature 20) — **pago na Etapa 12 (`837faec1`)**:
      `varrerLembretesFerramenta`, job diário (`routes/almoxarifado.js:~5116`), e-mail pela fila para `alertas_estoque_emails`, dedupe
      `ferramenta-lembrete-<id>-<dia>` (dia de Brasília desde a 163). **Este item ficou desmarcado por engano até a Etapa 181** — o texto
      abaixo, da 9b, dizia que não havia job nem canal; **estava errado desde a Etapa 12**. Mantido como histórico:
      **parcial**: a função pura `toolReminderService.listarEmprestimosVencidos(db)` e o filtro
      `GET /emprestimos?vencidos=1` existem e estão testados (`f5004df`), mas **não há job
      agendado nem canal de notificação** — ruling registrado na execução: um agendador sem
      e-mail (feature 19) ou alerta formal (feature 20) rodaria sem efeito útil. Fica para
      quando a feature 20 existir; ver letra B do `docs/almoxarifado-novidades-por-etapa.md`.
- [x] Avaria e perda: registro com foto, responsável e efeito no status — `0f89434`/`d2adfe6`
      (Task 5, RN-05)
- [x] Bloqueio de ferramenta (não pode ser emprestada) — `b383b37` (Task 4, RN-06)
- [x] **Termo de responsabilidade no empréstimo (RN-D)** — Etapa 180: cadeia multi-contexto `2092806d`; versões do texto, empréstimo com
      colaborador do cadastro + assinatura + matrícula, fotografia congelada, termo e verificação `11ef2821`; tela `04b9d2fb`; ponta a ponta
      `31fb475f`, matrícula confirmada `3d161c35`; revisão adversarial `c40b1f56` (reenvio no meio da gravação), `bcd89a2f` (empréstimo
      reapontado), `003de01b` (donos de contexto). Não estava no checklist original (nasceu do design de 16/09 e da pergunta da usuária de 21/10).
- [ ] **Retirada definitiva (RN-C)** e **assinatura na devolução** — **fora, declarado** (letra D (180)): a retirada definitiva contradiz
      "ferramenta é patrimônio, não estoque" e precisa de decisão da empresa; a devolução continua sem termo.
- [x] **Retorno da manutenção com condição e destino; baixa de ferramenta** — `17ce8759` (servidor), `c2bc2d37` (tela), Etapa 177.
      Não estava no checklist original; nasceu do pedido da usuária ("condição após a manutenção, volta ao responsável ou descarte").
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
- [x] **Edição de ferramenta pela tela** — **entregue na Etapa 175** (`735f7c5d`; contrato do PUT medido em `2a54344f`). O texto
      abaixo é o registro da 9b, mantido como histórico: **não entregue nesta etapa**: o design (D9) prometia
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
| RN-09 — Gate `gerenciar_ferramentas`, leitura livre — **desde a 180, a leitura dos EMPRÉSTIMOS e do termo também exige o gate** (RN-180.06; a "leitura livre" vale para `GET /ferramentas` e calibrações) | `RN-09: PRODUCAO recebe 403 nas escritas; leitura passa`; `[RN-180.06/I4] PRODUCAO -> 403 em /emprestimos, no termo…` | `toolEmprestimo.api.test.js`, `termoFerramentaVerificacao.api.test.js` |
| RN-180.01..06 — termo de responsabilidade (versões, empréstimo com termo, fotografia, verificação, cadeia multi-contexto, leituras) | ver o plano da 180 | `termoFerramentaVersao` (10), `termoFerramentaEmprestimo` (13), `termoFerramentaVerificacao` (16), `termoFerramentaPontaAPonta` (12), `evidenciaMultiContexto` (9) |
| RN-10 — Reencontrar exige justificativa, só vale para PERDIDA | testes de reencontro | `toolManutencao.api.test.js` |
| RN-11 — Toda escrita audita | `RN-11: emprestar e devolver auditam` | `toolEmprestimo.api.test.js` |
| Corrida devolver ↔ ocorrência não corrompe o status (achado F2 da revisão final) | `F2(a)`/`F2(b)` | `toolEmprestimo.api.test.js`, `toolOcorrencia.api.test.js` |
| PUT/409 de ferramenta | 3 testes de PUT/404/409 | `toolFerramentaEdicao.api.test.js` |
| Jornada completa (calibra → empresta → avaria → conserta → devolve) | teste-jornada | `toolIntegracao.api.test.js` |

## O que ficou de fora (declarado)

- ~~**Job de lembrete de devolução vencida** não está ligado a nenhum canal~~ — **estava errado desde a Etapa 12** (`837faec1`); ver o checklist.
- **UI de edição de ferramenta** — ver checklist acima.
- **Integração com inspeção** (instrumento calibrado referenciado na medição) — feature 09.
- **Motor de alertas formal** (notificação de vencimento) — feature 20.
- **Requisição de ferramenta** pelo fluxo de requisições — feature 04.

## Dependências

- 20 (alertas de devolução/calibração) · 09 (instrumento na inspeção) · 19 (e-mails, para o
  lembrete de devolução ganhar canal).

## Etapa 160 — os filtros e as buscas que não casavam (2026-10-19)

Plano: `docs/superpowers/plans/2026-10-19-almoxarifado-etapa160-filtros-da-fabrica-e-do-almoxarifado.md`. Consertos técnicos, sem regra de acesso nova e sem mexer em saldo: a medição chave por chave das telas do
Almoxarifado (nenhuma rota ignora uma chave que a tela manda; o defeito estava na comparação).

- [x] **RN-160.04 (C393, B1019)** — `listarFerramentas` (patrimônio, nome) e `listarEmprestimos` (colaborador) pela `condicaoDeBusca` — `eaf682e9`.

## Etapa 163 — a calibração e o empréstimo no dia de Brasília (2026-10-20)

Plano: `docs/superpowers/plans/2026-10-20-almoxarifado-etapa163-a-atividade-editada-e-as-validades-no-dia-de-brasilia.md`. Consertos técnicos, sem regra de acesso nova e sem mexer em saldo; o status da feature não muda.

- [x] **RN-163.03 (C406, B1041)** — calibração vigente = `data_validade >= hoje de Brasília` (era `date('now')`, o dia UTC): o empréstimo
  (*"Ferramenta com calibração vencida ou sem calibração registrada"*), a medição na inspeção (a mesma frase com o nome do instrumento entre
  parênteses) e o selo `calibracao_vigente` da lista. A calibração que vale até hoje empresta e mede até a meia-noite — `6502c690` (Fase 5: `407ddfcc`).
- [x] **RN-163.04 (C406, B1041)** — `dias_restantes` do painel (`GET /calibracoes/painel`) e do alerta *Calibração vencendo* contra o hoje de
  Brasília (a de hoje = 0, *a vencer*) — `6502c690`.
- [x] **RN-163.05 (C406, B1041)** — empréstimo vencido = `EMPRESTADA` com devolução prevista **anterior** ao hoje de Brasília (`vencidos=1`, o
  `dias_vencido` e o lembrete por e-mail); a chave diária do lembrete leva o mesmo dia, passado ao filtro — `6502c690`.

Continua 🟢.

## Etapa 170 — as datas no dia de Brasília (2026-10-20)

Só exibição — nenhuma rota, consulta, valor gravado ou porta de saldo mudou. Plano:
`docs/superpowers/plans/2026-10-20-almoxarifado-etapa170-as-datas-do-chat-de-compras-e-do-almoxarifado-no-dia-de-brasilia-e-o-limite-dos-logs.md`.

- [x] A *Retirada* dos empréstimos (`data_retirada`, o `CURRENT_TIMESTAMP`) no dia de Brasília, ainda *AAAA-MM-DD* — antes os 10 primeiros
  caracteres (o dia UTC). A *Previsão de devolução* e o *Vencido* são só data e já estavam certos. `3fb6aa0e`; o cenário em `9353c1d5`.

## Etapa 175 — editar a ferramenta pela tela (2026-10-22)

- Botão **Editar** em toda linha, em qualquer status, para `gerenciar_ferramentas`; o modal é o do cadastro ("Editar ferramenta"), com os
  9 campos preenchidos (RN-175.01/02).
- Salvar manda os 9 campos sempre; opcional vazio vai `null` e limpa o gravado; sucesso *"Ferramenta atualizada"*, recarrega a lista e o
  painel de calibrações (RN-175.03). Código ou nome em branco recusam na tela (RN-175.04). O 409 *"Código de patrimônio já cadastrado"* e o
  404 *"Ferramenta não encontrada"* aparecem com a frase do servidor, janela aberta (RN-175.05). Material/localização gravados fora da lista
  carregada aparecem como *#id* e são mantidos (RN-175.06).
- Servidor sem mudança de código. **Medido** (`2a54344f`, `toolFerramentaEdicao.api.test.js`): o PUT que repete o patrimônio de outra →
  409; o próprio patrimônio passa; `null` limpa; o PUT não muda o status; marcar "exige calibração" pelo PUT faz o próximo empréstimo
  recusar (RN-03) e desmarcar libera (RN-175.07/08). Antes desta etapa o 409 só era provado no POST.
- Decisões **B1130** (sem trava de edição simultânea — vale o último) e **B1131** (editar em qualquer status).
- Plano: `docs/superpowers/plans/2026-10-22-almoxarifado-etapa175-edicao-de-ferramenta-pela-tela.md`.

## Etapa 177 — o retorno da manutenção com a condição e o destino (2026-10-22)

- `PUT /api/almoxarifado/manutencoes/:id/concluir` aceita `condicao` (`OK`, `COM_RESTRICAO`, `INSERVIVEL`; opcional — **B1140**) e
  `destino` (`USO` padrão, `BAIXA`). Recusas antes de qualquer escrita, nesta ordem: *"Condição inválida (use OK, COM_RESTRICAO ou
  INSERVIVEL)"*, *"Destino inválido (use USO ou BAIXA)"*, *"Ferramenta inservível não volta ao uso — escolha a baixa"*, *"Descreva a
  restrição nas observações"*, *"Informe o motivo da baixa nas observações"*; depois as de antes (404 *"Manutenção não encontrada"*, a
  anomalia). Resposta `{ success, status }` (RN-177.01..05).
- Estado novo **BAIXADA** (`toolStateMachine.js`: `EM_MANUTENCAO → BAIXADA`, `BAIXADA → DISPONIVEL`). Não empresta, não entra em
  manutenção, não registra ocorrência, não bloqueia — as recusas de sempre com o status (RN-177.07). `POST /ferramentas/:id/reverter-baixa`
  (justificativa ≥ 5) → DISPONIVEL; fora de BAIXADA *"Ferramenta não está baixada (status atual: ⟨S⟩)"* (RN-177.08, **B1142**).
- Colunas `manutencoes_ferramenta_almoxarifado.condicao_retorno` e `.destino` (safeAlter aditivo; primeiro boot provado). Auditoria:
  `MANUTENCAO_FIM` com condição/destino, `BAIXA` (motivo), `REVERSAO_BAIXA` — com rótulo (RN-177.06).
- O painel de calibrações ignora BAIXADA (RN-177.09).
- Tela: o modal *Concluir manutenção* com **Condição do item** e **Destino**; selo e filtro *Baixada*; **Reverter baixa**; sem *Ocorrência* e
  *Calibração* na baixada (RN-177.10).
- **A seção da Etapa 175 (e o plano dela) dizia que "o destino depois da manutenção (volta ao responsável ou descarte)" esperava os
  formulários em papel da empresa. Estava errado:** a regra está no pedido da usuária e foi feita aqui; só a assinatura (NR-6) espera os
  formulários.
- **Fase 5 — revisão adversarial independente (depois do fechamento).** (1) Instrumento **BAIXADA** não mede na inspeção:
  `inspectionService.resolverMedidas` recusa *"Ferramenta baixada não pode ser usada em medição (⟨nome⟩)"* e a tela de inspeção o mostra
  *"(baixada — não mede)"*, desabilitado (**B1146** — só BAIXADA; os outros status medem como antes). (2) A coluna **Calibração** da lista
  mostra *"—"* na baixada (mostrava *Vigente*). (3) Na anomalia (ferramenta fora de EM_MANUTENCAO ao concluir), a manutenção fecha com
  `destino = NULL` — antes gravava `BAIXA` com a ferramenta em outro status e sem a trilha `BAIXA`; o pedido vai em `MANUTENCAO_FIM` como
  `destino_pedido`. (4) Testes novos: baixa sem condição aceita (**B1140**), 403 do PRODUCAO em `concluir` e `reverter-baixa`, baixada com
  calibração válida fora do painel. **O plano afirmava, na releitura própria, que "ninguém" além do painel lia o status da ferramenta —
  estava errado:** a inspeção usa a ferramenta como instrumento (sem olhar o status) e a coluna de calibração da tela também; os dois foram
  corrigidos. Limitação declarada (**D (177)**): *Em uso com restrição* + *Volta ao uso* fica DISPONIVEL igual a *OK* — a restrição não
  aparece na lista nem no empréstimo.
- Testes: `toolManutencaoRetorno.api.test.js` (13 + 4 da Fase 5), `FerramentasAlmoxarifado.test.js` (+6 + 1), `medidasInspecao.api.test.js`
  (+2), `InspecoesAlmoxarifado.test.js` (+1). Plano:
  `docs/superpowers/plans/2026-10-22-almoxarifado-etapa177-retorno-da-manutencao-com-condicao-e-destino.md`.

## Etapa 180 — o termo de responsabilidade no empréstimo (2026-10-22)

- **Empréstimo** (`POST /ferramentas/:id/emprestar`, agora **multipart**): `colaborador_id` do cadastro (ativo, com matrícula — o
  `colaborador_nome` digitado é ignorado, o snapshot vem do cadastro), `confirmacao_matricula` (digitada pelo colaborador), `termo_versao` (a
  versão que a tela mostrou; diferente da vigente → 409 *"O texto do termo mudou (versão ⟨n⟩) — releia e assine de novo"*), `assinatura`
  (PNG ≤ 2 MB), `chave_idempotencia`. Claim DISPONIVEL→EMPRESTADA + empréstimo + fotografia + evidência numa transação só, na fila da cadeia.
  Recusas e ordem no plano ("Contrato real para o front").
- **Texto do termo** (`GET`/`POST /termos/FERRAMENTA`): versões append-only, semente v1 *"TEXTO PROVISÓRIO — substituir pelo termo da
  empresa."* (**A108** — a empresa não mandou o texto), só ADMINISTRADOR cria versão (`editar_termos`), 409 para dois administradores juntos.
- **Fotografia** (`termos_emprestimo_ferramenta`): ferramenta, colaborador, versão e hash do texto, data prevista, autor, `criado_em` —
  append-only; o HMAC (segredo fora do banco, **A107**) cobre só ela + a evidência. PUT da ferramenta, devolução e ocorrência não mudam o
  "íntegro"; o empréstimo **reapontado** (outro colaborador/ferramenta no empréstimo vivo) é acusado — *"empréstimo reapontado"* (Fase 5).
- **Termo e verificação** (`GET /ferramentas/emprestimos/:id/termo` e `/verificar`, `gerenciar_ferramentas`); empréstimo antigo → 404
  *"Este empréstimo não tem termo assinado (anterior à exigência)"*; `GET /emprestimos` com `tem_termo`, só `gerenciar_ferramentas`.
- **Cadeia multi-contexto** (feature 25): `GET /evidencias/cadeia/verificar` (`entregar_epi` OU `gerenciar_ferramentas`), entregas de EPI e
  termos na mesma `sequencia`; a verificação carrega os donos de contexto (Fase 5).
- **Tela:** modal *Emprestar ferramenta* com o texto vigente e o selo *"Texto provisório"*, assinatura e matrícula; coluna **Termo** (ver,
  verificar, PDF); aba **Texto do termo** (só Administrador); aba **Empréstimos** só com `gerenciar_ferramentas`.
- **Testes migrados (I1 da Fase 2):** 10 arquivos `tool*`/`auditoriaDoAtoCadastros`/`validadesNoDiaLocal` mandavam JSON com `colaborador_nome`
  — passaram pelo helper `tests/helpers/termoFerramenta.js`; duas asserções mudaram (ver o plano, T2).
- **Fora (D (180)):** RN-C (retirada definitiva), assinatura na devolução, o relatório "EPI por colaborador" que lê a fonte errada (a **181**),
  o número do empréstimo fora do HMAC, o relatório *Ferramentas emprestadas* ainda aberto a todos.
- Plano: `docs/superpowers/plans/2026-10-22-almoxarifado-etapa180-termo-de-responsabilidade-de-ferramenta.md`. Novidades: seção "Etapa 180",
  **A108**, **B1170** a **B1179**, **C436** a **C439**, **D (180)**, **F (180)**.

## Etapa 181 — com quem a ferramenta está, só para quem gerencia ferramentas (2026-10-22)

- **Relatório *Ferramentas emprestadas*** (`reportRegistry.js`): `acao` de `null` para `gerenciar_ferramentas` — a mesma de `GET /emprestimos`
  desde a 180 (**B1177**). Fora do Administrador e do Almoxarife, some da lista e responde 403 *"Sem permissão para este relatório"* na consulta
  e na exportação (**B1182**). `3ce1d3a2`. Os empréstimos de ferramenta cadastrada como EPI saíram do relatório *EPI por colaborador* e ficam
  só aqui (**B1181**).
- **`GET /ferramentas`** (só `auth`): sem `gerenciar_ferramentas`, o `emprestimo_aberto` sai por lista branca `{ id, data_prevista_devolucao }`
  — sem `colaborador_nome` (**B1186**, revisão da Fase 5). A tela já só mostrava *"com ⟨nome⟩"* quando o nome vinha. `71418065`; testes
  `ferramentasListaSemColaborador.api.test.js` (4) e um Jest em `FerramentasAlmoxarifado.test.js`.
- **Correção declarada desta spec** (no topo e no checklist): o lembrete de devolução vencida **existe desde a Etapa 12** (`837faec1`); a
  spec dizia que faltava — **estava errado**. O que falta para 🟢 é só a integração com a inspeção.
- Fora: **D (180)** itens (3) e (7) resolvidos; ver **D (181)**. Plano:
  `docs/superpowers/plans/2026-10-22-almoxarifado-etapa181-relatorio-epi-por-colaborador.md`. Novidades: seção "Etapa 181", **B1180** a
  **B1188**, **C440** a **C442**.

## Etapa 185 — o PDF do termo de responsabilidade cabe na folha (2026-10-22)

- **Desenho** (`client/src/utils/termoFerramentaPdf.js`): o texto da versão quebra pela **largura medida** na fonte 10 (182 mm), não mais a
  cada 95 letras — `quebrarTexto(texto, largura, medir)`, com a contagem como régua padrão; título, versão, aviso de provisório e as linhas de
  identificação (ferramenta, colaborador, devolução prevista / registrado por, matrícula confirmada, assinatura) quebram por largura
  (**B1219**). Medido: texto em caixa alta 210,6 → 190,2 mm; *Registrado por* com nome de 44 letras 199,9 → 186,8. `b76f7146`.
- **Descritor** (`montarTermoFerramenta`): `linhasTexto` saiu e entrou `texto` (o texto da versão, literal) — mudança interna do client,
  intencional (RN-185.09). API, HMAC e a tela do termo: sem mudança.
- **Fase 5** (`9a5f46a0`): `quebrarTexto` termina com qualquer largura (≤ 0, `NaN`, `Infinity`) e qualquer régua — a guarda da emenda M6 não
  cobria a palavra vazia (laço infinito com largura negativa). Registrado sem corrigir: o termo junta espaços repetidos, recuo, tab e NBSP do
  texto ao imprimir (anterior, desde a 180) — **C447**.
- Plano: `docs/superpowers/plans/2026-10-22-almoxarifado-etapa185-tabela-da-ficha-epi-dentro-da-folha.md`. Novidades: seção "Etapa 185",
  **B1219**, **C447**. O status da feature não muda.
