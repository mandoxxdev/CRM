# Frota — Etapa 7 (pequena): o gestor remove uma foto pela lista (D14)

> **Status:** 🟡 em execução (2026-10-28). Plano escrito na Fase 1 da skill `desenvolver-etapa`.
> **Origem:** "Próxima tarefa detalhada" do [plano da Etapa 6](2026-10-23-frotas-etapa6-tratar-pendencia.md) — primeiro item do
> backlog pequeno, o único que não depende do André (B59, B60, D14).
> **Spec:** `specs/modulo-frotas/17-fotos/README.md` (a feature 17 ganha a seção desta etapa; D14 sai do "ficou de fora") e o mapa
> [`specs/modulo-frotas/README.md`](../../../specs/modulo-frotas/README.md) (feature 17).
> **Decisões tomadas sem consulta (reversíveis):** [`docs/frotas/novidades-por-etapa.md`](../../frotas/novidades-por-etapa.md), letra B
> (B73+).

## Objetivo

Desde a Etapa 5 o motorista fotografa a avaria e o cupom, e o gestor vê a miniatura nas listas **Checklist Diário** e
**Abastecimentos**. Mas se a foto está errada (o cupom de outro veículo, uma foto do chão), o gestor **não tem como tirá-la**: ou exclui
o lançamento inteiro (perde km, horário, itens) ou liga para o motorista pedir que remova em Meus registros. O servidor já aceita o
gestor apagar qualquer foto (RN-F5.07, testado) — falta o botão.

Esta etapa põe o botão: na coluna **Fotos** das duas listas, o gestor toca **Remover foto**, vê todas as fotos do lançamento numa
janela, remove a que quiser (com confirmação), e a lista se atualiza. Só isso. Não muda o servidor.

## Fase 0 — medido antes de prometer (2026-10-28)

- **Servidor pronto:** `DELETE /api/frotas/anexos/:id` (`routes/frotas.js:252`, `requirePermission('registrar_operacoes')` →
  `anexosService.apagar`): gestor apaga a de qualquer um, motorista só a dele (403 `MSG_SO_OS_SEUS`), Consulta 403 `"Sem permissão para
  esta operação"`, inexistente 404 `"Foto não encontrada"`. Teste `frotasAnexos.api.test.js` RN-F5.07 (inclusive a asserção literal
  *"o gestor apaga a de qualquer um"*) e RN-F5.08. **Nada a fazer no servidor.**
- **Tela:** `client/src/components/frotas/FotosFrota.js` — `ColunaFotos({ anexos })` mostra a 1ª miniatura e `+N` (link para a 2ª; B58:
  cada miniatura é um GET no limite de requisições); `MiniaturasFotos({ anexos, onRemovida })` (Meus registros) já faz o `confirm`
  `'Remover esta foto?'`, o `DELETE` (`removerFotoFrota`), o toast `'Foto removida'`, o erro `MSG_FALHA_REMOVER` e chama `onRemovida`.
- **Página genérica:** `FrotasEntityPage.renderCell` chama `col.render(row)` **sem** o `recarregar` da lista (linha 140). O gancho
  `config.AcoesDaLinha` (Etapa 6) recebe `recarregar`, mas é **por linha** e só na coluna Ações, que o Consulta não vê — não serve para
  um botão por foto (dito no plano da 6).
- **Perfil na tela:** `FrotasEntityPage.podeAlterar` barra só o CONSULTA (o MOTORISTA passa). `TratarPendencia.useEhGestorDaFrota()`
  (= ADMIN_FROTA) é a conferência que a Etapa 6 usou para os botões do gestor. O motorista remove a foto dele em Meus registros.
- **Modal:** padrão em `TratarPendencia.JanelaTratarPendencia` (`frotas-modal-*`, footer com `frotas-btn`). Lição da Fase 5 da Etapa 6:
  404/409 dizem que a tela está **velha** → além do toast, **recarregar**.
- **Testes de tela:** `FrotasFotos.test.js` (describe `RN-F5.11 — coluna Fotos do gestor`), fronteira HTTP mockada (`api`), `mockAuth`
  por perfil, `createRoot` + `act`. Molde de lista por perfil: `FrotasPendencia.test.js` (GESTOR / CONSULTA / MOTORISTA).
- **Banco local: 0 veículos** — os prints do relatório precisam de dado de exemplo (o André autorizou criar).

## Regras de negócio

| RN | Enunciado | Cenário |
|---|---|---|
| RN-F7.01 | Na coluna **Fotos** das listas **Checklist Diário** e **Abastecimentos**, toda linha **com foto** mostra ao **gestor** (ADMIN_FROTA) o botão **Remover foto**, ao lado da miniatura e do `+N`. Linha sem foto continua `-`, sem botão | gestor abre Checklist: linha com 2 fotos → miniatura, `+1`, **Remover foto**; linha sem foto → `-` |
| RN-F7.02 | **Consulta** e **Motorista** não veem o botão (a coluna fica como hoje). Quem decide é o servidor; a tela só não oferece | Consulta abre Checklist: miniatura e `+1`, sem botão. Motorista idem (ele remove em Meus registros) |
| RN-F7.03 | **Remover foto** abre a janela **Fotos do lançamento** com **todas** as fotos (miniatura + **Remover foto** em cada), o título `Fotos de <placa>` e o botão **Fechar**. As miniaturas só carregam ao abrir a janela (B58 continua valendo na lista) | 3 fotos → janela com 3 miniaturas e 3 botões |
| RN-F7.04 | Remover uma foto pede confirmação `Remover esta foto?`; **Cancelar** não chama o servidor | cancela → nenhum `DELETE` |
| RN-F7.05 | Confirmou → `DELETE /api/frotas/anexos/:id` → toast `Foto removida` → a **lista recarrega** (o `GET` da lista roda de novo) e a janela passa a mostrar as fotos que sobraram | 3 fotos, remove a 2ª → janela com 2, coluna com miniatura e `+1` |
| RN-F7.06 | Removida a **última** foto, a janela **fecha sozinha** e a coluna volta a `-` | 1 foto, remove → sem janela, célula `-` |
| RN-F7.07 | Falha ao remover: toast com a mensagem do servidor (ou `Não foi possível remover a foto. Confira a internet e tente de novo.`). **404** (foto já removida por outra tela) **também recarrega a lista** — a tela estava velha | `DELETE` → 404 `Foto não encontrada` → toast + `GET` da lista de novo |
| RN-F7.08 | Nada muda para o portal (Meus registros), para o servidor, relatórios, painel e planilha | `frotasAnexos.api.test.js` continua 100%; nenhum arquivo em `server/` muda |

## Contrato (tela — congelado)

Não há rota nova. O que se congela é a **tela** e o **gancho**:

- `FrotasEntityPage.renderCell`: `col.render(row, { recarregar: loadRows })` — segundo argumento **novo e opcional**; todo `render`
  existente (só `COLUNA_FOTOS`) continua funcionando.
- `frotasEntityConfigs.COLUNA_FOTOS.render = (r, ctx) => <ColunaFotos anexos={r.anexos} titulo={\`Fotos de ${r.placa || '-'}\`}
  onRemovida={ctx?.recarregar} />`.
- `FotosFrota.ColunaFotos({ anexos, titulo, onRemovida })`: sem `onRemovida` **ou** sem gestor → exatamente o que é hoje. Com os dois e
  pelo menos uma foto → acrescenta o botão **Remover foto** (`className="frota-fotos-remover-gestor"`, `type="button"`) e, aberta, a
  janela `JanelaFotosDoLancamento` (`.frotas-modal-overlay` > `.frotas-modal`, `data-testid="janela-fotos"`), que reaproveita
  `MiniaturasFotos` com `onRemovida` e `onFalha`.
- `FotosFrota.MiniaturasFotos({ anexos, onRemovida, onFalha })`: `onFalha(err)` **novo e opcional**, chamado no `catch` depois do toast.
  Sem ele, comportamento de hoje (Meus registros não muda).
- Textos literais: botão da célula e de cada foto **`Remover foto`**; título **`Fotos de <placa>`**; botão **`Fechar`**; confirmação
  **`Remover esta foto?`**; toasts **`Foto removida`** / `MSG_FALHA_REMOVER` (os três últimos já existem).

## Tasks (sort topológico)

| # | Task | Tipo | Depende |
|---|---|---|---|
| T1 | Tela: `renderCell` com `{ recarregar }`; `ColunaFotos` com `titulo`/`onRemovida` + `JanelaFotosDoLancamento`; `MiniaturasFotos.onFalha`; `COLUNA_FOTOS` passando o contexto; CSS mínimo (`.frota-fotos-remover-gestor`). Teste `FrotasRemoverFotoGestor.test.js` (RN-F7.01–07, Checklist **e** Abastecimentos, três perfis), fronteira HTTP mockada; **controle positivo** por sabotagem (cada RN cai pela asserção que a nomeia). Rodar `FrotasFotos` e `FrotasPendencia` junto (RN-F7.08 na tela) | tronco | — |
| T2 | Integração: rodar `cd server && npm run test:api` inteiro (RN-F7.08: nada muda no servidor) e, na tela, as 13 suítes de Frota + `CI=true npx react-scripts build` | integração | T1 |

Uma task só de código, porque o galho **é** o tronco aqui: tudo mora em `FotosFrota.js` + um gancho na página genérica. Não há o que
paralelizar sem inventar fronteira.

## Estado das tasks

| Task | Estado | Commit |
|---|---|---|
| Plano + Fase 2 | — | — |
| T1 | — | — |
| T2 | — | — |

## Ajustes da Fase 2 (revisor fresco: 2 travas + 5 menores — **valem sobre o texto acima**)

| # | Achado | Ajuste |
|---|---|---|
| T-1 | **TRAVA.** `loadRows` começa com `setLoading(true)` e a página troca a `<table>` inteira por "Carregando..." (`FrotasEntityPage.js:49,196`): recarregar **desmonta** a célula e a janela some em toda remoção — RN-F7.05 ("3 → 2") era impossível como escrito | **Opção B:** a janela guarda **cópia local** das fotos; no 200 (e no 404) tira a foto da cópia; **só chama `recarregar` ao Fechar** (e no fechamento automático da última). Um `GET` por sessão da janela. RN-F7.05/06/07 reescritas abaixo |
| T-2 | **TRAVA.** Importar `useEhGestorDaFrota` de `TratarPendencia` em `FotosFrota` fecha o ciclo FotosFrota → TratarPendencia → FrotasPortalMotorista → FotosFrota (hoje só funcionaria por içamento; o ESLint do CRA não tem `import/no-cycle`) | A página genérica, que já calcula o perfil (`FrotasEntityPage.js:19`), passa `ehGestor` no contexto: `col.render(row, { recarregar: loadRows, ehGestor })`. `ColunaFotos` só lê a prop; **nada de `TratarPendencia` entra em `FotosFrota`** (nem `estadoMudouNoServidor` — a checagem de 403/404 é local) |
| 3 | Regra dos hooks: `ColunaFotos` retorna `'-'` antes de qualquer hook | O `useState` da janela vem **antes** do `return '-'`, como em `MiniaturasFotos` |
| 4 | "só `COLUNA_FOTOS`" tem `render`: errado — `status_geral` (Situação, `frotasEntityConfigs.js:415`) também | Os **dois** `render` existentes ignoram o 2º argumento; nada quebra. A coluna Fotos está em exatamente duas entidades (abastecimentos `:237`, checklists `:421`) |
| 5 | Textos: `Remover foto` **já existe** (`FotosFrota.js:98,163`); `Fotos de <placa>` e `Fechar` são **novos** (a janela da Etapa 6 usa `Cancelar`) | Classificação corrigida; o resto (`Remover esta foto?`, `Foto removida`, `MSG_FALHA_REMOVER`, `Foto não encontrada`) existe |
| 6 | A janela nova não seguia o molde de acessibilidade/teste da Etapa 6 (`role="dialog"` + `aria-label`; o teste acha por `[role="dialog"]`) | `JanelaFotosDoLancamento` leva `role="dialog"` e `aria-label={titulo}` |
| 7 | Para o gestor o `DELETE` só dá **403** se o perfil mudou no meio — também é "tela velha", e a RN só nomeava o 404 | RN-F7.07: **404** tira a foto da cópia local (já não existe) e avisa; **403** fecha a janela e recarrega |

**RN-F7.05 (vale esta):** confirmou → `DELETE /api/frotas/anexos/:id` → toast `Foto removida` → a janela **tira a foto da lista dela** (3 → 2)
**sem** recarregar a página. A lista recarrega (o `GET` roda de novo) **ao Fechar** a janela — a célula então mostra o que sobrou.
**RN-F7.06 (vale esta):** removida a **última** foto, a janela fecha sozinha **e** a lista recarrega; a célula volta a `-`.
**RN-F7.07 (vale esta):** falha → toast com a mensagem do servidor (ou `MSG_FALHA_REMOVER`). **404** (`Foto não encontrada`): a foto sai
da lista da janela do mesmo jeito (se era a última, fecha e recarrega). **403**: a janela fecha e a lista recarrega. Outros erros: só o toast.
**Contrato (vale este):** `MiniaturasFotos({ anexos, onRemovida, onFalha })` chama `onRemovida(id)` e `onFalha(err, id)` (o id é novo; Meus
registros ignora). `ColunaFotos({ anexos, titulo, ehGestor, onRemovida })`: botão só com `ehGestor && onRemovida && lista.length`.

## Fechamento

*(preencher: divergências, verificação medida, retro de 4 números, próxima tarefa detalhada)*
