# Etapa 48 — Regras por urgência e por material de cliente, e a fila da aprovação simples (desenho)

> **Feature:** 06 (Motor de aprovações). **Fase 0:** a "próxima tarefa detalhada" do plano da Etapa 47,
> remedida em 2026-09-30 antes deste desenho.
> **Plano:** `docs/superpowers/plans/2026-09-30-almoxarifado-etapa48-regras-urgencia-cliente-fila-simples.md`

## 1. O que está medido

- **A urgência é texto livre no servidor.** `schemas.js:325` tem `urgencia: z.string().nullable().optional()`,
  e `requisitionCreateService.js:145` grava `urgencia || 'NORMAL'`. **Quem escreve urgência:** um
  lugar só, o `<select>` de `RequisicaoForm.js:345-349`, com **três** valores: `NORMAL`, `URGENTE` e
  `CRITICO`. Quem lê: o `URGENCIA_INFO` da lista (`RequisicoesList.js:69-72`), a ordenação das duas
  listagens (`routes:2982`, `:3819`), o dashboard (`:3809`) e a auto-aprovação (`routes:3080`).
  Todos usam os mesmos três.
- **"Material de cliente"** é `materiais_almoxarifado.proprietario_cliente_id IS NOT NULL`
  (`schema.js:994`). A feature 13 está 🟢, e `NULL` significa "nosso".
- **A fila da aprovação simples não precisa de rota.** `GET /almoxarifado/requisicoes` devolve
  `status`, `solicitante_id` e, desde a Etapa 47, `pendencias_regra_abertas`. A permissão
  `aprovar_requisicao` chega ao client por `useAlmoxPermissoes().pode`, que falha **aberto** de
  propósito.
- **O texto de ajuda do lembrete**, que a próxima tarefa listava, **já saiu** no fix-round da 47
  (`e4ee27c`). **Não entra aqui.**

## 2. As regras de negócio

**RN-01 — A urgência vira lista fechada.** `TIPOS_URGENCIA = ['NORMAL','URGENTE','CRITICO']` em
`schema.js`, no molde de `TIPOS_REQUISICAO`. Com isso não se cria critério sobre enum aberto: uma regra
"urgência = URGENTE" nunca casaria com `'urgente'` ou `'ALTA'` gravados por fora. A recusa fica em
`createRequisicao`, que é a porta das duas rotas de criação: `400 — Urgência inválida: <valor>`.
Vazio e ausente continuam virando `NORMAL`.
*Cenário:* `POST /requisicoes` com `urgencia: 'ALTA'` recebe 400 com a literal. Com `urgencia: ''`,
nasce `NORMAL`.

**RN-02 — Critério `urgencia` na regra.** Coluna nova em `regras_aprovacao`. A regra casa quando a
urgência da requisição é **igual** à escolhida. A recusa no cadastro usa a mesma literal:
`Urgência inválida: <valor>`.
*Cenário:* a regra "Urgente" casa com a requisição `URGENTE` e não casa com a `NORMAL`.

**RN-03 — Critério `material_cliente` na regra.** Coluna nova. Só `1`/`true` filtra, e `0`/`false`/`null`
**não contam** como critério (a mesma leitura de `material_critico` da 9.7/I3). A regra casa quando
**algum material** da requisição tem dono (`proprietario_cliente_id IS NOT NULL`).
*Cenário:* a requisição com um item de material de cliente casa; a só com material nosso, não.

**RN-04 — A fila da aprovação simples.** No topo da tela de requisições, um painel
**"Requisições aguardando sua aprovação (N)"**, só no **modo almoxarifado** e só para quem tem
`pode('aprovar_requisicao')`. Recorte:
- `status = 'PENDENTE'`;
- `solicitante_id ≠ eu`;
- `pendencias_regra_abertas = 0`, porque as barradas por regra estão no painel de regras (Etapa 47), e mostrá-las aqui ofereceria um gesto que o servidor recusa.

Clicar abre a requisição.
*Cenário:* aparecem a PENDENTE de outro sem regra; **não** aparecem a própria, a com regra pendente e a de outro status.

## 3. Contratos congelados

| Onde | Mudança | Literal |
|---|---|---|
| `POST /almoxarifado/requisicoes` e `POST /requisicoes-material` | urgência fora da lista → 400 | `Urgência inválida: <valor>` |
| `POST`/`PUT /almoxarifado/regras-aprovacao` | aceitam `urgencia` (um de `TIPOS_URGENCIA` ou vazio) e `material_cliente` (booleano) | `Urgência inválida: <valor>` |
| `GET /almoxarifado/regras-aprovacao` | devolve `urgencia` e `material_cliente` (`1`/`null`) | — |
| fila simples | **sem rota nova**: recorte de `GET /almoxarifado/requisicoes?status=PENDENTE` | — |

A recusa "Regra precisa de pelo menos um critério" passa a contar os dois critérios novos.

## 4. O que NÃO é, declarado

- **Não migra valores antigos.** Uma requisição gravada com urgência fora da lista (possível só por
  API) continua lá: não casa com regra de urgência e aparece como está. A consulta para medir isso
  em produção vai para a **letra A**. **Letra B:** a lista fica fechada daqui para frente, sem
  reescrever o passado. **Descartado:** um `UPDATE` que normalize, porque é irreversível e não há
  leitor que dependa disso.
- **O C68** (o `UPDATE` cru de `verificarBloqueioLiberacao`) fica fora, como a Etapa 47 já registrou.
- **Dupla aprovação de ajuste (B11) e lista técnica (22)** continuam bloqueadas por dependência.

## 5. Sort topológico

| Task | O que é | Classificação |
|---|---|---|
| **T1** | `TIPOS_URGENCIA` e a recusa em `createRequisicao` (RN-01) | **tronco**, regra compartilhada |
| **T2** | colunas `urgencia`/`material_cliente` e o avaliador (RN-02/03) | **tronco**, migração e avaliador |
| **T3** | a aba de regras ganha os dois campos | **galho**, contra o contrato; mas é arquivo irmão da T4 |
| **T4** | o painel da fila simples (RN-04) | **galho**, contra `GET /requisicoes` |
| **T5** | integração | **tronco** |

T3 e T4 são independentes de regra (critério da skill): nenhuma interpretação de uma exige retrabalho
na outra. Mas são **pequenas**, e rodar em worktree custa mais que rodá-las em série. **Escolha:** série.
