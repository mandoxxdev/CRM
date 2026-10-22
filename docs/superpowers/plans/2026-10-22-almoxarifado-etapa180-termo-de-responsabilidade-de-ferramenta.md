# Etapa 180 — Termo de responsabilidade no empréstimo de ferramenta (RN-D)

> **Status:** 🟡 em execução (2026-10-22). Emendada da "próxima tarefa detalhada" da Etapa 178 (B1169). A 179 é da
> outra sessão (sem escopo ainda).
> **Origem:** pergunta 3 da usuária (21/10): *"solicitamos a assinatura do colaborador responsável pela utilização ou
> retirada… empréstimo de equipamentos e ferramentas, incluindo o registro da devolução"*; RN-D do design de 16/09: o
> empréstimo guarda **quem aceitou, quando e qual versão do texto**.
> **⚠️ O texto do termo NÃO foi fornecido pela empresa** (os formulários foram pedidos e não chegaram). A etapa entra com
> um **texto provisório marcado como tal** e o administrador troca pela tela — cada troca é uma **versão nova**; o
> empréstimo guarda a versão que o colaborador assinou. Letra B.
> **Fase 0 (medido):** empréstimo grava `colaborador_nome` **digitado** (o `colaborador_id` existe na tabela mas a tela
> nunca o envia); sem transação (claim → INSERT com compensação); `codigo_patrimonio` obrigatório e único, `numero_serie`
> opcional; a cadeia de evidências da 178 é **global** mas `verificarCadeia` só sabe montar o registro de EPI (`epiService.js:515`
> devolve `null` para outro contexto → "registro alterado"); `configuracoes_almoxarifado` sobrescreve (sem versão);
> `/aux/colaboradores` exige `entregar_epi`; a 177 não mexeu no empréstimo; o banco local tem 0 ferramentas.

## Regras

| ID | Regra | Cenário / mensagem literal |
|---|---|---|
| RN-180.01 | **Cadeia multi-contexto (tronco, vai primeiro):** `evidenciaAssinaturaService` ganha um registro de montadores por contexto (`registrarContexto(contexto, montador)`); `verificarCadeia` usa o montador do contexto da linha; contexto sem montador → `{ integro: false, motivo: 'contexto desconhecido' }`. O EPI registra o dele. A rota da cadeia passa a ser `GET /api/almoxarifado/evidencias/cadeia/verificar` (permissão `entregar_epi` **ou** `gerenciar_ferramentas`); `/epi/cadeia/verificar` continua como apelido. | um termo gravado não faz o EPI acusar "registro alterado" |
| RN-180.02 | **Texto do termo versionado:** tabela `termos_responsabilidade_versao` (`tipo`, `versao` int, `texto`, `texto_sha256`, `criado_por`, `criado_por_nome`, `criado_em` do Node; UNIQUE(tipo, versao); triggers append-only). Vigente = maior versão do tipo. Semente v1 (`FERRAMENTA`) com texto que começa por `TEXTO PROVISÓRIO — substituir pelo termo da empresa.` `POST /api/almoxarifado/termos/FERRAMENTA` (só ADMINISTRADOR, ação nova `editar_termos`) cria a próxima versão; texto vazio → 400 `O texto do termo é obrigatório`; igual ao vigente → 400 `O texto é igual ao da versão vigente`. `GET /api/almoxarifado/termos/FERRAMENTA` → `{ vigente: {versao, texto, criado_em, criado_por_nome, provisorio: bool}, historico: [...] }`. | — |
| RN-180.03 | **Empréstimo com colaborador do cadastro:** `colaborador_id` passa a ser **obrigatório** (ativo, régua da 178); `colaborador_nome` vira snapshot do cadastro (o digitado é ignorado). Recusas da 178 (`Colaborador #<id> não encontrado`, `Colaborador <nome> não está ativo`). `/aux/colaboradores` aceita `entregar_epi` **ou** `gerenciar_ferramentas`. | — |
| RN-180.04 | **Termo assinado no ato do empréstimo:** multipart com `assinatura` (PNG, régua da 178), `confirmacao_matricula` (régua da 178) e `termo_versao` (a versão que a tela mostrou; diferente da vigente → 409 `O texto do termo mudou (versão <n>) — releia e assine de novo`). Gravação **numa transação só** (`execEmTransacao`): claim DISPONIVEL→EMPRESTADA + INSERT do empréstimo + evidência `contexto='TERMO_FERRAMENTA'`, `contexto_id = emprestimo.id`. O HMAC cobre: ferramenta (id, `codigo_patrimonio`, `numero_serie`, nome), colaborador (snapshot + matrícula confirmada), `termo_versao` + `texto_sha256`, `data_prevista_devolucao`, quem registrou, `criado_em`, arquivo, ip, user_agent. Idempotência por `chave_idempotencia` (molde 178). | assinatura ausente → 400 `A assinatura do colaborador é obrigatória` |
| RN-180.05 | **Termo do empréstimo recuperável:** `GET /api/almoxarifado/ferramentas/emprestimos/:id/termo` (`gerenciar_ferramentas`) → empréstimo + texto **da versão assinada** + evidência (`arquivo_url`, `registro_sha256`, `confirmado_por_matricula`); `GET …/termo/verificar` → `{ integro }` (molde 178). PDF no navegador (jsPDF, montador puro testável) com o texto, os dados e a assinatura. Empréstimo antigo, sem termo → 404 `Este empréstimo não tem termo assinado (anterior à exigência)`. | — |
| RN-180.06 | Leitura de empréstimos (`GET /emprestimos`) passa a exigir `gerenciar_ferramentas` e devolve `tem_termo` por linha. | PRODUCAO → 403 |

## Tasks

| # | Task | Tipo |
|---|---|---|
| T1 | RN-180.01 (cadeia multi-contexto) + testes provando que EPI continua íntegro com um contexto alheio gravado. | tronco |
| T2 | RN-180.02..06 backend + testes (inclui corrida: dois empréstimos da mesma ferramenta → um 201, outro 409 do claim, nada órfão; versão trocada no meio → 409). | tronco |
| T3 | Front: modal de empréstimo com colaborador do cadastro, texto vigente exibido (com selo "provisório"), matrícula + assinatura; "Termo" por empréstimo (ver/PDF/verificar); tela do administrador para nova versão do texto com histórico. Mock só na fronteira HTTP. | galho (depois da T2, contrato acima) |
| T4 | Integração pela rota: versão nova → empréstimo assinado → termo PDF/verificar → cadeia íntegra com EPI e termo misturados → devolução. | integração |

## Fora do escopo (letra D)

- RN-C (retirada **definitiva** com baixa em estoque) — contradiz "ferramenta é patrimônio, não estoque"
  (`toolStateMachine.js:3`); precisa de decisão da empresa.
- Assinatura na **devolução** (a devolução continua sem termo).
- Texto jurídico do termo — responsabilidade da empresa.

## Próxima tarefa detalhada

*(preencher no fechamento)*
