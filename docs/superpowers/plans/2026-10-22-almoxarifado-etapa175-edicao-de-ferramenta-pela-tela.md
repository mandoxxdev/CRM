# Etapa 175 — Editar a ferramenta pela tela

> **Status:** em execução · **Branch:** `etapa-e175` (worktree `CRM-wt-e175`, a partir da `main` `e424f8c2`, com a 173) · **Data:** 2026-10-22
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

- [ ] T1
- [ ] T2
- [ ] Revisão do plano (Fase 2) e revisão adversarial (Fase 5)
- [ ] Fechamento
