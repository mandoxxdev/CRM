# Etapa 9b — Ferramentas e calibração (feature 16) — Design

> **Data:** 2026-08-19 · **Spec:** `specs/modulo-almoxarifado/16-ferramentas-calibracao/README.md`
> **Escopo aprovado pelo usuário em 2026-08-19** ("pode fazer tudo como você recomendar"): o corte
> recomendado COM fotos de avaria. As decisões D1–D12 abaixo foram tomadas pelo assistente sob essa
> delegação — cada uma registra o descartado e o porquê, para auditoria posterior.

## O problema

O backend de ferramentas existe desde antes do módulo ganhar disciplina: `toolService.js` (57
linhas) com criar/emprestar/devolver/listar, **zero testes**, **zero validação Zod**, empréstimo
com janela de corrida (SELECT-depois-UPDATE — o mesmo TOCTOU que a Etapa 9 matou no sucateamento),
devolução e empréstimo **sem auditoria**, gate genérico `movimentar` (que é permissão de **estoque**)
e **nenhuma UI**. Calibração, manutenção, avaria/perda e bloqueio não existem nem como coluna.

**Correção de spec desta etapa:** a spec 16 (corrigida em `b727c0a`) cita `extended.js:672-698` —
**as linhas envelheceram de novo** (a Etapa 9 empurrou o arquivo): as rotas estão em
`extended.js:863-887` e as tabelas em `schema.js:1465/1479`. A spec será atualizada dizendo isso.

## Princípio herdado (design da Etapa 9)

**Ferramenta é patrimônio emprestável, não estoque.** Nada aqui cria tipo de movimento, não toca o
motor de estoque, não mexe em `movementTypes`/`TIPOS_DEDICADOS` — a pendência da "guarda geral de
tipo novo" **não é acionada** por esta etapa. `material_id` na ferramenta segue como referência
opcional de catálogo.

## Regras de negócio numeradas

O ID `RN-xx` aparece no nome do teste que a prova e na frase do manual que a descreve.

| ID | Regra |
|---|---|
| **RN-01** | Ferramenta emprestada não pode ser emprestada de novo. A recusa é atômica (claim no WHERE), não checagem-antes-de-gravar. |
| **RN-02** | Ferramenta `BLOQUEADA`, `EM_MANUTENCAO`, `AVARIADA` ou `PERDIDA` não empresta. |
| **RN-03** | Ferramenta com `exige_calibracao = 1` sem calibração vigente (sem registro algum, ou com `data_validade` < hoje) não empresta. Mensagem literal: `"Ferramenta com calibração vencida ou sem calibração registrada"`. |
| **RN-04** | Devolução fecha o empréstimo (`DEVOLVIDA`, `data_devolucao_real`) e devolve a ferramenta a `DISPONIVEL` — novo empréstimo passa a ser aceito. |
| **RN-05** | Avaria ou perda registrada sobre ferramenta **emprestada** encerra o empréstimo aberto no mesmo ato e aplica o status da ocorrência (`AVARIADA`/`PERDIDA`). Perda não tem devolução — exigir devolver antes seria pedir o impossível. |
| **RN-06** | Bloquear e desbloquear exigem justificativa (mínimo 5 caracteres) e auditam. Mesmo padrão de série/lote. |
| **RN-07** | Iniciar manutenção tira a ferramenta de circulação (`EM_MANUTENCAO`); concluir devolve a `DISPONIVEL`. Ferramenta emprestada não entra em manutenção (devolva primeiro — a manutenção é feita com a ferramenta na mão). `AVARIADA` entra em manutenção (é o caminho de conserto). |
| **RN-08** | Registrar calibração com `data_validade` futura torna a ferramenta emprestável de novo (quando o impedimento era só RN-03). |
| **RN-09** | Toda escrita exige a ação nova `gerenciar_ferramentas` (`ADMINISTRADOR`, `ALMOXARIFE`). Leitura é `auth` simples, como todo GET do módulo. |
| **RN-10** | Ferramenta `PERDIDA` pode ser reencontrada (`PERDIDA → DISPONIVEL`) com justificativa obrigatória, auditada. |
| **RN-11** | Toda ação de escrita audita (`entidade: 'ferramenta'`) — inclusive emprestar e devolver, que hoje não auditam. |

## Decisões (escolhido · descartado · porquê)

**D1 — Ação de perfil única `gerenciar_ferramentas` [ADMINISTRADOR, ALMOXARIFE].**
Descartado (a): continuar sob `movimentar` — mesmos perfis hoje, mas acopla patrimônio a permissão
de estoque e impede restringir um sem o outro; mesmo argumento do `remessar_terceiro` ("o ganho é
PODER restringir sem reescrever"). Descartado (b): ações finas (`emprestar_ferramenta`,
`calibrar_ferramenta`…) — YAGNI; o cliente nunca pediu granularidade e a ação entra de graça em
`GET /minhas-permissoes` (a rota itera `Object.keys(ACAO_PERFIS)`).

**D2 — Máquina de estados explícita** (`toolStateMachine.js`, padrão `thirdPartyStateMachine`):
`DISPONIVEL / EMPRESTADA / BLOQUEADA / EM_MANUTENCAO / AVARIADA / PERDIDA`. Toda transição por
UPDATE com **claim no WHERE** (`... WHERE id = ? AND status IN (...)`; `changes === 0` → recusa
lendo o status atual para a mensagem). Descartado: manter o if-depois-UPDATE atual — é o TOCTOU
que a Etapa 9 provou explorável (a sonda de 500 execuções nasceu disso).

**D3 — Calibração como histórico + flag.** Coluna nova `exige_calibracao INTEGER DEFAULT 0`
(nem toda ferramenta é instrumento de medição) e tabela nova `calibracoes_ferramenta_almoxarifado`
(`ferramenta_id`, `data_calibracao`, `data_validade`, `certificado_path`, `observacoes`,
`usuario_id`, `created_at`). A vigência é **lida da última calibração** (MAX por ferramenta) no ato
de emprestar — sem coluna-cache na ferramenta. Descartado: cache `data_proxima_calibracao` na
ferramenta — segunda fonte da mesma verdade, exatamente a doença que `availabilitySql`/`custoSql`/
`movementTypes` curaram nas etapas 8b/8c. Corrida aceita de propósito: vencimento é função do
tempo, não de escritor concorrente — pré-checagem basta, não precisa estar no claim.
Certificado: multipart via multer em disco, configuração clonada do comprovante de sucata
(`extended.js:74`), gravação **flat** em `uploadsAlmoxDir` com prefixo no filename (subpasta não —
ninguém a cria e o multer não cria destino). **Ordem de middlewares: gate ANTES do multer**
(`auth → requirePermission → multer → safeParse`) — a rota de destino da sucata NÃO serve de
precedente aqui: ela não tem `requirePermission` de propósito (o gate dela vive no serviço); o
precedente certo é a rota de foto, provada por `permissoesRotas.api.test.js:515-534`. Da sucata
aproveita-se só o `limparUploadOrfao` para o 400 pós-upload. (Correção da revisão do plano,
achado 3 — a versão anterior deste parágrafo mandava copiar o precedente errado.)

**D4 — Manutenção como histórico:** tabela `manutencoes_ferramenta_almoxarifado`
(`ferramenta_id`, `descricao`, `data_inicio`, `data_fim NULL`, `usuario_id`, `observacoes`).
Iniciar = claim `DISPONIVEL|AVARIADA → EM_MANUTENCAO` + linha aberta; concluir = fecha `data_fim`
+ claim `EM_MANUTENCAO → DISPONIVEL`. Uma manutenção aberta por ferramenta (garantido pelo claim
de status, não por UNIQUE).

**D5 — Avaria e perda como ocorrências:** tabela `ocorrencias_ferramenta_almoxarifado`
(`ferramenta_id`, `tipo` `AVARIA|PERDA`, `descricao`, `responsavel_colaborador_id NULL`,
`responsavel_nome`, `foto_path NULL`, `usuario_id`, `created_at`). Foto multipart opcional (multer,
D3). **A spec diz "fotos" (plural); esta etapa entrega UMA foto por ocorrência** — corte declarado
(achado 8 da revisão do plano), não esquecimento: galeria de N fotos exige tabela filha e UI de
galeria; se o galpão precisar de mais de uma, registram-se ocorrências adicionais ou o item volta
como melhoria. Efeito no status: `AVARIA → AVARIADA`; `PERDA → PERDIDA`. Sobre ferramenta
emprestada, RN-05. Descartado: bloquear ocorrência em ferramenta emprestada — perda não tem como
ser devolvida antes.

**D6 — Lembrete de devolução vencida:** seguir o padrão do `requisitionReminderService` (job
existente) + **filtro `GET /emprestimos?vencidos=1`** (não rota própria — a tabela de contratos é
a fonte; a versão anterior deste parágrafo dizia `GET /emprestimos/vencidos` e contradizia a
tabela, achado 5 da revisão do plano). O painel/alerta formal fica na feature 20 — declarado, não
esquecido.

**D7 — Colunas novas em `ferramentas_almoxarifado`** (todas por `safeAlter`): `numero_serie TEXT`,
`localizacao_id INTEGER` (FK lógica para localizações), `exige_calibracao INTEGER DEFAULT 0`.

**D8 — Zod em tudo:** schemas novos em `schemas.js` + `validate(schema)` nas rotas de escrita.
As 5 rotas existentes **ganham** validação (hoje não têm nenhuma).

**D9 — Front:** tela nova `/almoxarifado/ferramentas` (code-split em `lazyModules.js`) com três
visões: **Ferramentas** (lista com status/filtros, cadastro/edição, ações por status: emprestar,
devolver, bloquear/desbloquear, iniciar/concluir manutenção, registrar ocorrência, registrar
calibração, reencontrar), **Empréstimos** (ativos com vencidos destacados + histórico) e
**Calibrações** (painel a vencer: vencidas primeiro, depois por proximidade — o "painel de
calibrações a vencer" da spec). Gate de UI com `useAlmoxPermissoes().bloquearSeNaoPode('gerenciar_ferramentas')`;
quem decide é o backend, como sempre.

**D10 — Compatibilidade das rotas existentes:** as 5 rotas atuais **mantêm caminho e método**
(o front não as usa — não há tela —, mas o contrato não quebra); mudam o gate (`movimentar` →
`gerenciar_ferramentas`), ganham Zod e as regras novas. Isso é mudança de comportamento declarada,
não acidente: o gate antigo era o errado.

**D11 — Fora do escopo, declarado:** integração com inspeção (instrumento na medição — feature 09
não tem plano de inspeção com medidas); motor de alertas (feature 20); requisição de ferramenta
(feature 04); e-mails além do lembrete-padrão (feature 19).

**D12 — Sem mudança no motor de estoque.** Nenhum tipo de movimento novo. (Ver "Princípio
herdado".)

## Contratos de API (congelados — o front trabalha contra isto)

Erros seguem o padrão do módulo: `{ error: "<mensagem>" }`, status 400 para regra recusada,
403 para perfil sem a ação, 404 para id inexistente, 409 para conflito de UNIQUE.

**Tipos (revisão do plano, achado 9):** `exige_calibracao` é aceito como `true/false` **ou** `0/1`
no POST/PUT (o Zod normaliza para 0/1) e o GET devolve **0/1** (linha do SQLite) — o front deve
tratar 0/1. Em rotas **multipart**, todo campo chega **string**: numéricos são coagidos no schema
(precedente `numFromForm`, `schemas.js:641`). **Mensagens de regra de negócio saem do SERVIÇO**
(throw 400 com a mensagem literal da tabela) — não do Zod, cujo erro sai embrulhado em
`"Dados inválidos — <path>: ..."` (`validation.js`); o Zod valida só a forma.

| Método e caminho | Gate | Payload (Zod) | Sucesso | Recusas (mensagem literal) |
|---|---|---|---|---|
| `GET /api/almoxarifado/ferramentas` | auth | query: `status?`, `busca?`, `exige_calibracao?` | 200 lista (cada item com `calibracao_vigente: bool\|null`, `emprestimo_aberto` resumido) | — |
| `POST /api/almoxarifado/ferramentas` | gerenciar_ferramentas | `codigo_patrimonio!`, `nome!`, `tipo?`, `setor_responsavel?`, `material_id?`, `numero_serie?`, `localizacao_id?`, `exige_calibracao?`, `observacoes?` | 201 `{id}` | **409** `"Código de patrimônio já cadastrado"` (UNIQUE — 409 e não 400 pelo precedente do módulo, centro de custo em `extended.js:121`) |
| `PUT /api/almoxarifado/ferramentas/:id` | gerenciar_ferramentas | mesmos campos, todos opcionais | 200 `{success:true}` | 404 `"Ferramenta não encontrada"` |
| `POST /api/almoxarifado/ferramentas/:id/emprestar` | gerenciar_ferramentas | `colaborador_nome!`, `colaborador_id?`, `setor?`, `data_prevista_devolucao?`, `observacoes?` | 201 `{id}` | 400 RN-01/02: `"Ferramenta não está disponível (status atual: <STATUS>)"` · 400 RN-03: `"Ferramenta com calibração vencida ou sem calibração registrada"` |
| `POST /api/almoxarifado/emprestimos/:id/devolver` | gerenciar_ferramentas | `observacoes?` | 200 `{success:true}` | 404 `"Empréstimo não encontrado"` (inclui já devolvido) |
| `GET /api/almoxarifado/emprestimos` | auth | query: `status?`, `ferramenta_id?`, `colaborador?`, `vencidos?` | 200 lista | — |
| `POST /api/almoxarifado/ferramentas/:id/bloquear` | gerenciar_ferramentas | `justificativa!` (min 5) | 200 | 400 `"Ferramenta não pode ser bloqueada (status atual: <STATUS>)"` (só DISPONIVEL bloqueia) |
| `POST /api/almoxarifado/ferramentas/:id/desbloquear` | gerenciar_ferramentas | `justificativa!` (min 5) | 200 | 400 `"Ferramenta não está bloqueada (status atual: <STATUS>)"` |
| `POST /api/almoxarifado/ferramentas/:id/manutencoes` | gerenciar_ferramentas | `descricao!` | 201 `{id}` | 400 `"Ferramenta não pode entrar em manutenção (status atual: <STATUS>)"` (DISPONIVEL/AVARIADA entram; EMPRESTADA não — RN-07) |
| `PUT /api/almoxarifado/manutencoes/:id/concluir` | gerenciar_ferramentas | `observacoes?` | 200 | 404 `"Manutenção não encontrada"` (inclui já concluída) |
| `GET /api/almoxarifado/ferramentas/:id/manutencoes` | auth | — | 200 lista | — |
| `POST /api/almoxarifado/ferramentas/:id/ocorrencias` | gerenciar_ferramentas | multipart: `tipo!` (`AVARIA\|PERDA`), `descricao!`, `responsavel_nome?`, `responsavel_colaborador_id?`, campo de arquivo `foto?` | 201 `{id}` | 400 `"Tipo de ocorrência inválido"` · RN-05 aplica sem recusa extra |
| `GET /api/almoxarifado/ferramentas/:id/ocorrencias` | auth | — | 200 lista (`{id, tipo, descricao, responsavel_nome, foto_path, created_at}`) | — |
| `POST /api/almoxarifado/ferramentas/:id/reencontrar` | gerenciar_ferramentas | `justificativa!` (min 5) | 200 | 400 `"Ferramenta não está perdida (status atual: <STATUS>)"` |
| `POST /api/almoxarifado/ferramentas/:id/calibracoes` | gerenciar_ferramentas | multipart: `data_calibracao!`, `data_validade!`, `observacoes?`, campo de arquivo `certificado?` | 201 `{id}` | 400 `"Data de validade deve ser posterior à data de calibração"` |
| `GET /api/almoxarifado/ferramentas/:id/calibracoes` | auth | — | 200 lista | — |
| `GET /api/almoxarifado/calibracoes/painel` | auth | query: `dias?` (default 30) | 200 `{vencidas:[], a_vencer:[]}` | — |

## Testes exigidos (os 4 da spec + os das RN novas)

Os 4 nomeados na spec 16, com os nomes dela: `emprestar ferramenta ja emprestada falha` (RN-01),
`emprestar ferramenta bloqueada falha` (RN-02), `emprestar equipamento com calibracao vencida
falha` (RN-03), `devolver ferramenta permite novo emprestimo` (RN-04). Mais: corrida determinística
do claim (dois emprestar simultâneos, 1 vence — padrão do teste de corrida do sucateamento),
RN-05 (ocorrência sobre emprestada fecha o empréstimo), RN-07, RN-08, RN-09 (403 do perfil errado,
com o `requirePermission` real do harness), RN-10, RN-11 (auditoria de emprestar/devolver existe).
Todo teste novo com **controle positivo** (sabotagem nomeada por task no plano).

## O que muda para quem opera (resumo para o manual)

Ferramentas ganham tela própria. Emprestar recusa ferramenta ocupada, bloqueada, em manutenção,
avariada, perdida ou com calibração vencida — com mensagem dizendo o motivo. Avaria e perda viram
registro com responsável e foto. Calibração tem histórico com certificado e painel de vencimento.
