# Etapa 175 — Editar a ferramenta pela tela

> **Status:** 🟢 entregue (2026-10-22) · **Branch:** `etapa-e175` (worktree `CRM-wt-e175`, a partir da `main` `e424f8c2`, com a 173) · **Data:** 2026-10-22
> **Origem:** o pedido da usuária de Compras sobre ferramentas, maquinários, EPIs e ativos (entrega, empréstimo, manutenção, histórico).
> O primeiro passo que não depende dos formulários em papel da empresa é este, que a spec 16 deixou aberto desde a Etapa 9b: **editar a
> ferramenta pela tela**. Hoje um erro de digitação no cadastro (patrimônio, série, localização, "exige calibração") só se corrige pela
> integração.

## O que existe hoje (medido na Fase 0)

- `PUT /api/almoxarifado/ferramentas/:id` (`server/routes/almoxarifado/extended.js`, Etapa 9b): ação de perfil `gerenciar_ferramentas`,
  `FerramentaUpdateSchema` (= `FerramentaCreateSchema.partial()`), `toolService.atualizarFerramenta` grava só as chaves presentes entre as 9
  colunas editáveis (`codigo_patrimonio`, `nome`, `tipo`, `setor_responsavel`, `material_id`, `numero_serie`, `localizacao_id`,
  `exige_calibracao`, `observacoes`) e audita (`EDICAO`). **Não** mexe no `status` (só as ações da máquina de estados).
- Recusas: `404 "Ferramenta não encontrada"`; `409 "Código de patrimônio já cadastrado"` (UNIQUE de `codigo_patrimonio` na tabela, sem
  filtro de ativo); `400` do schema (código ou nome vazio).
- `server/tests/api/toolFerramentaEdicao.api.test.js` prova o PUT que grava e o 404; o 409 **só no POST**. O PUT que duplica patrimônio **não
  tinha teste** — medido na T1.
- A tela (`FerramentasAlmoxarifado.js`) tem o modal "Nova ferramenta"; **nenhum botão de editar** (spec 16, checklist, item desmarcado com
  a explicação "corte não declarado até a revisão final").

## Regras de negócio

| RN | Enunciado | Cenário |
|---|---|---|
| RN-175.01 | Toda linha da lista de ferramentas, **em qualquer status**, tem o botão **Editar** para quem pode gerenciar ferramentas; sem a permissão, não aparece (como os outros botões de escrita da linha). | Ferramenta *Emprestada* → **Editar** aparece. Usuário sem `gerenciar_ferramentas` → nenhum botão. |
| RN-175.02 | **Editar** abre **"Editar ferramenta"** com os 9 campos preenchidos da ferramenta. O **status** não é editável aqui — ele muda pelas ações (emprestar, bloquear, manutenção…). | Abrir FER-001 → código *FER-001*, nome, tipo, setor, série, localização, "Exige calibração" desmarcado. |
| RN-175.03 | **Salvar** manda o PUT com os 9 campos; campo opcional apagado vai como `null` e **limpa** o valor gravado. Sucesso: *"Ferramenta atualizada"*, a janela fecha e a lista recarrega. | Apagar o número de série e salvar → a coluna **Série** mostra *—*. |
| RN-175.04 | Código de patrimônio ou nome vazios (ou só espaços) são recusados na tela, sem PUT: *"Informe o código de patrimônio"* / *"Informe o nome da ferramenta"* (as mesmas do cadastro). | Apagar o nome e salvar → a frase, nada enviado. |
| RN-175.05 | Recusa do servidor aparece com a frase dele e a janela **fica aberta** com o digitado: *"Código de patrimônio já cadastrado"* (409), *"Ferramenta não encontrada"* (404). | Trocar o código de FER-001 para *FER-002* → *"Código de patrimônio já cadastrado"*. |
| RN-175.06 | Material ou localização gravados que **não estão** na lista carregada aparecem selecionados como *"Material #⟨id⟩"* / *"Localização #⟨id⟩"* e são **mantidos** ao salvar — a tela não pode mostrar *—* e gravar o id de volta (nem apagar o vínculo sem a pessoa pedir). | Ferramenta com material 77 que não veio na lista → o seletor mostra *Material #77*; salvar manda `material_id: 77`. |
| RN-175.07 | (servidor) O PUT que repete o patrimônio de **outra** ferramenta → `409 "Código de patrimônio já cadastrado"`, nada muda; o PUT com o **próprio** patrimônio passa; `null` nos opcionais limpa; o PUT não muda o status. | Medido em teste. |
| RN-175.08 | (efeito) Marcar **"Exige calibração"** numa ferramenta sem calibração faz o **próximo empréstimo** ser recusado: *"Ferramenta com calibração vencida ou sem calibração registrada"* (RN-03 da 9b); desmarcar o libera. A ferramenta emprestada no momento continua com quem está. | Integração: PUT `exige_calibracao: true` → emprestar → 400 com a frase; PUT `false` → emprestar → 201. |

## Contratos

Nenhuma rota nova. Consome `PUT /api/almoxarifado/ferramentas/:id`:

- Corpo enviado pela tela: `{ codigo_patrimonio, nome, tipo, setor_responsavel, material_id, numero_serie, localizacao_id, exige_calibracao,
  observacoes }` — textos aparados, vazio → `null`; `material_id`/`localizacao_id` número ou `null`; `exige_calibracao` booleano.
- `200 { id }`. Recusas: `404 "Ferramenta não encontrada"`, `409 "Código de patrimônio já cadastrado"`, `400` do schema (a tela barra
  antes), `403` de perfil (o interceptor troca pela frase *"Sem permissão para gerenciar ferramentas — seu perfil é …"*).

## Tasks

| Task | O que | Tipo |
|---|---|---|
| T1 | Servidor: testes do PUT (409 de patrimônio de outra, próprio passa, `null` limpa, status intacto) e da integração com o empréstimo (RN-175.07, RN-175.08). Sem mudança de código esperada — se algum falhar, o conserto entra aqui. | tronco |
| T2 | Tela: botão **Editar**, modal "Editar ferramenta" (reaproveita o corpo do "Nova ferramenta"), PUT, opções *#id* (RN-175.01 a 06), com testes. | galho |

## Decisões (letra B, faixa B1130–B1139)

- **B1130 — sem trava de edição simultânea.** Duas pessoas editando a mesma ferramenta: vale o último a salvar (a tela manda os 9 campos).
  **Descartado:** o `campos_lidos` da família (Etapa 126) — cadastro de ferramenta é raro e de uma pessoa; reversível.
- **B1131 — Editar em qualquer status.** Corrigir o patrimônio de uma ferramenta emprestada ou perdida é tão legítimo quanto de uma
  disponível; o PUT não toca o status. **Descartado:** só em *Disponível*.

## Andamento

- [x] T1 — `2a54344f`: 4 cenários novos em `toolFerramentaEdicao.api.test.js` (7/7). O PUT que repete o patrimônio de outra já respondia
  409 — **medido**, nenhuma mudança de código. Controle: tirar o 409 do PUT (vira 500), ignorar `null` no update, tirar
  `exige_calibracao` das colunas editáveis — cada um derrubou o cenário dele (a âncora multilinha do 409 foi contada com `perl`: a mesma
  linha existe no POST).
- [x] T2 — `735f7c5d`: botão, modal, PUT, opções `#id`; 6 cenários novos em `FerramentasAlmoxarifado.test.js` (19/19). Controle: 6
  sabotagens, cada uma derrubou o cenário dela.
- [ ] **Revisão do plano (Fase 2) e revisão adversarial (Fase 5) por agente fresco — NÃO EXECUTADAS.** Esta etapa foi executada por um
  agente que não pode abrir outros agentes. Feita só a autorrevisão (abaixo). **Pendente:** rodar as duas revisões antes ou depois do
  merge; o risco está concentrado na tela (o servidor não mudou).
- [x] Fechamento — novidades (seção, **B1130**, **B1131**, cabeçalho, "Onde estamos"), spec 16 (item marcado, seção "Etapa 175"), mapa
  (linha 16), guia (seção e cabeçalho), manual (21.6).

**Autorrevisão (no lugar da Fase 2/5, declarada como tal).** Traçado cada RN até o último gesto: editar → salvar → a lista recarrega com o
valor novo; marcar "exige calibração" → o empréstimo seguinte recusa (provado no servidor pela rota); a ferramenta emprestada editada continua
emprestada (o PUT não toca `status`, provado). Pontos olhados e mantidos: o modal de cadastro fecha no clique no fundo e o de edição herda
isso (perde o digitado num clique fora — mesmo comportamento do cadastro desde a 9b, não mudado aqui); o PUT aceita código só com espaços
pela integração (`z.string().min(1)` sem `trim`) — a tela apara e recusa; **não** corrigido no servidor nesta etapa (mudaria o POST junto).

**Divergências do plano.** Nenhuma de contrato. A Fase 0 previa que o 409 do PUT talvez não existisse; existia.

**Verificação final (medida, sobre a `main` `e424f8c2` + 175):** `test:api` **499/499** arquivos; `test:almoxarifado` 44/44; `test:validation`
4/4; `test:safealter` 3/3; `test:sqlite` 16/16; client **175 suítes / 2250 testes**; `CI=true react-scripts build` **Compiled successfully**.

## Retro (4 números)

- Rodadas de correção até verde: **0** (nenhum teste ficou vermelho fora das sabotagens).
- Achados de revisão: **não houve revisão por agente fresco** (ver acima); autorrevisão: 2 pontos, ambos mantidos e declarados.
- Paralelismo: **0** (duas tasks em sequência).
- Defeito que escapou: a preencher na próxima etapa que tocar ferramentas.

## Próxima tarefa detalhada

Desta frente (pedido de ferramentas/EPI/ativos da usuária de Compras), em ordem:

1. **Rodar as revisões que faltaram** (Fase 2/5 desta etapa) por agente fresco, com o diff `e424f8c2..735f7c5d` em
   `FerramentasAlmoxarifado.js`.
2. **Entrega/empréstimo de ferramenta e EPI com assinatura (NR-6)** — **espera os formulários em papel da empresa.** Molde de gravação:
   `server/services/almoxarifado/deliverySignatureService.js` (append-only, sem UPDATE/DELETE, arquivo pelo multer). O que a NR-6 exige e
   a assinatura de requisição **não** tem: identificação forte do colaborador (o empréstimo hoje guarda `colaborador_nome` livre e
   `colaborador_id` opcional), número do CA e validade do EPI, carimbo do servidor e hash do registro, ficha de EPI por colaborador em PDF.
3. **Retorno da manutenção com condição e destino** (volta ao responsável ou descarte/baixa): hoje `concluirManutencao`
   (`toolService.js`) só devolve a ferramenta a *DISPONIVEL*; falta a condição, a baixa patrimonial (status novo na máquina de estados —
   `toolStateMachine.js`, claim por `UPDATE … WHERE status IN`) e quem autorizou.
