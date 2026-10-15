# Etapa 106 — o estorno do ajuste de material de cliente exige a permissão do ajuste (C211)

> Status: **FECHADA — 2026-10-15.** Plano `251c9192`, T1 `d6493a7e`, T2 `6ca3f9a0`, T3 `fbce0cb0`, T4 `0c8ec372`, Fase 5
> `77c3d525`, fechamento (docs) no commit seguinte. Sem merge e sem push (integração pelo André). Worktree `CRM-wt-e106`, branch `etapa-e106` (de `main` `e963449f`).
> Origem: "Próxima tarefa detalhada — Etapa 106" no fim de
> `docs/superpowers/plans/2026-10-15-almoxarifado-etapa104-ajuste-endereco-avisa-caixa.md`; C211.
> Design: `docs/superpowers/specs/2026-10-15-almoxarifado-etapa106-estorno-ajuste-cliente-design.md`.
>
> **Numeração** (conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` em 2026-10-15): última B **B706**,
> último C **211**, última A **A54**, último G **G87**. A Etapa 107 (Compras) roda em paralelo e escreve só em `docs/compras-*`.
> Esta etapa: **B707+**, **C212+**, A55 se houver consulta, G88 se houver.

## Fase 0 — medido (2026-10-15)

Sonda `server/tests/sonda/e106fase0.js` (não versionada); tabela completa no design. Resumo:

- C211 reproduzida pela rota: o Gestor estorna (200) o AJUSTE de material de cliente — sem localização, com localização
  (descendo e subindo) — e também o **AJUSTE_POSITIVO** e o **AJUSTE_NEGATIVO** (a próxima tarefa da 104 só nomeava o
  AJUSTE). O Almoxarife já recebe 403 do gate; Administrador (perfil) e superadmin estornam.
- As outras portas de estorno de material de cliente (ENTRADA, SAIDA, DEVOLUCAO_CLIENTE, TRANSFERENCIA, PERDA, SUCATA
  comum) passam com o Gestor — desfazem lançamento que não exigiu a permissão especial (B708).
- Porta única (`cancelarMovimentacao`); as compensações internas (`scrapService`, `thirdPartyService`) não estornam ajuste.
- `assertAjustePermitido` audita antes do efeito com a quantidade digitada — não serve para o estorno.
- **Achado do traçado até o último gesto:** o aviso A1 da Etapa 104 ensina *"estorne o ajuste que baixou o estoque (perfil
  Administrador ou Gestor do almoxarifado)"* — com a correção, falso para material de cliente.

## Regras de negócio

- **RN-01 — estornar ajuste de material de cliente exige `ajustar_material_cliente`.** `cancelarMovimentacao` de movimento
  `AJUSTE` (com ou sem localização, subindo ou descendo), `AJUSTE_POSITIVO` ou `AJUSTE_NEGATIVO` de material com
  `proprietario_cliente_id`: sem a permissão → **403** literal **E1**, **antes de qualquer efeito** (a original continua
  `cancelado = 0`, nenhuma linha `ESTORNO`, total e linhas de saldo intactos, nenhuma auditoria nova). *Cenários:* Gestor
  → 403 nos três tipos e nos dois sabores do AJUSTE; Administrador por perfil, superadmin e `role: 'admin'` → 200 e o
  total volta.
- **RN-02 — material nosso não muda.** O Gestor continua estornando ajuste de material sem dono (200).
- **RN-03 — os outros estornos de material de cliente não mudam.** ENTRADA, SAIDA, DEVOLUCAO_CLIENTE, TRANSFERENCIA,
  PERDA e SUCATA comum seguem só com `ajustar_estoque` (Gestor → 200). *(B708.)*
- **RN-04 — `AJUSTE_INVENTARIO` continua com a recusa de sempre**, para todos os perfis (Gestor → 400 *"Ajuste de
  inventário não pode ser estornado por aqui — …"*, não 403).
- **RN-05 — a ordem das recusas.** "já cancelada" (400) vem antes do 403 (é lida antes do material); o 403 vem antes da
  recusa de ajuste com série (400) e de qualquer guarda de saldo.
- **RN-06 — o estorno autorizado deixa auditoria nomeando o cliente.** Depois de concluir (ao lado da `CANCELAMENTO`):
  `entidade 'material_cliente'`, `acao 'ESTORNO_AJUSTE'`, `entidade_id` = material, `dados_anteriores
  {quantidade_atual}` (antes do estorno), `dados_novos {tipo, movimentacao_id, estorno_id, quantidade_atual,
  proprietario_cliente_id, proprietario_cliente_nome}`, `justificativa` = motivo. Estorno recusado (403, ou 400 pela
  caixa/saldo) não grava esta linha. Falha ao gravar esta linha não derruba o estorno já concluído (`try/catch`, aviso
  no log). Material nosso: sem esta linha.
- **RN-07 — compensação interna isenta.** `opcoesEstorno.compensacao === true` não passa pela guarda (inalcançável hoje —
  nenhuma compensação estorna ajuste; declarado).
- **RN-08 — o aviso da caixa diz quem estorna.** `avisoCaixaDoAjuste` com material de cliente
  (`material.proprietario_cliente_id`) troca *"(perfil Administrador ou Gestor do almoxarifado)"* por *"(perfil
  Administrador do almoxarifado)"*; material nosso: a A1 byte a byte a de hoje.
- **RN-09 — a tela mostra a recusa.** O estorno recusado com 403 mostra a literal E1 no `toast.error`, sem
  *"Movimentação estornada!"*, e o modal continua aberto (comportamento de hoje; teste novo prende).

## Contrato congelado

`server/services/almoxarifado/ownerRules.js` exporta, além do que já exporta:

```js
// tipos da familia do ajuste que o estorno REVERTE (AJUSTE_INVENTARIO fica de fora: ninguem o estorna)
const TIPOS_AJUSTE_ESTORNAVEIS_DONO = ['AJUSTE', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO'];
// null se nao se aplica (material nosso ou tipo fora da lista); { donoNome } se passou; lanca 403 E1 sem permissao.
// Sem auditoria (quem audita e o motor, depois de concluir).
async function assertEstornoDeAjustePermitido(db, material, tipo, user) { ... }
// a linha da RN-06; o motor a chama pelo objeto do modulo (ownerRules.auditarEstornoDeAjuste), DEPOIS da CANCELAMENTO
async function auditarEstornoDeAjuste(db, { material, mov, estornoId, quantidadeDepois, donoNome, user, motivo }) { ... }
```

**E1** (literal; `${perfil}` = `getPerfilFromUser(user)`; sem acento, no molde da recusa do ajuste):

```
Estornar o ajuste do material ${material.codigo}, que pertence ao cliente ${donoNome}, exige a permissao "ajustar_material_cliente" (seu perfil: ${perfil}). Estornar ajuste de estoque de terceiro mexe no numero que o cliente vai cobrar.
```

`donoNome` = `razao_social` do cliente, ou `cliente #<id>` (o `nomeDoCliente` de sempre).

Motor (`stockService.cancelarMovimentacao`): logo depois de `const material = await getMaterial(...)`, se
`opcoesEstorno.compensacao !== true`, `const donoEstornoAjuste = await ownerRules.assertEstornoDeAjustePermitido(db,
material, mov.tipo, user)`. Depois da auditoria `CANCELAMENTO`, se `donoEstornoAjuste`,
`ownerRules.auditarEstornoDeAjuste` em `try/catch`, com `quantidadeDepois` = `quantidade_atual` **relida** do material
depois do estorno (Fase 2, correção 2). O verbo novo `ESTORNO_AJUSTE` ganha rótulo em `auditLabels.js` (*"Estorno de
ajuste"*; Fase 2, correção 1).

Rota: `POST /api/almoxarifado/movimentacoes/:id/cancelar` inalterada (gate `ajustar_estoque`); o 403 E1 sai do motor pelo
`handleError` (`{ error: E1 }`, status 403). Resposta de sucesso inalterada.

`caixaSql.avisoCaixaDoAjuste(caixaInfo, disponivel, material)`: assinatura igual; o parêntese conforme a RN-08.

Cliente: nenhuma mudança de código.

## Fase 2 — revisão do plano (agente fresco, 2026-10-15) — 0 trava, 3 correções, notas

O revisor leu o código (a T1 estava parcial no disco) e rodou a sonda `server/tests/sonda/e106rv-1.js` (R1–R3) e o
`auditLabels`.

1. **(correção, reproduzida) O verbo novo sem rótulo.** `auditLabels.api.test.js` → 13/14, *"verbos gravaveis sem rotulo:
   [ESTORNO_AJUSTE]"* — a tela de auditoria mostraria o verbo cru. **Corrigido:** `{ rotulo: 'Estorno de ajuste', verbos:
   ['ESTORNO_AJUSTE'] }` na T1 (o vermelho do revisor é o controle positivo; 14/14 depois).
2. **(correção) De onde vem o `quantidade_atual` da RN-06.** Fixado: relido do material depois do estorno.
3. **(correção, documento) O manual e o guia mandam o Gestor estornar** (6.10 *"Exige o perfil que pode ajustar estoque"*,
   a A1 citada, *"pede ao Administrador ou ao Gestor"*, a tabela da 16.8; o guia da 104) — entram no fechamento.
4. **(nota) A auditoria mora em `ownerRules`**, chamada pelo motor — contrato acima atualizado.
5. **(nota, anterior à etapa — C213, B712)** R2: o Almoxarife (`editar_material`) tira o dono do material com saldo
   (`PUT /materiais/:id` com `proprietario_cliente_id: null` → 200) e depois o Gestor estorna o ajuste (200, 4 → 10). A regra
   segue o dono **de agora**; isso contorna a decisão 7 inteira (o ajuste também, não só o estorno). O revisor disse "exige
   dois perfis" — **estava errado**: medido depois (`e106c213.js`), o Almoxarife sozinho tira o dono, ajusta e devolve o dono.
   Fora da etapa; registrado como candidato.
6. **(notas)** Porta única confirmada; as quatro chamadas internas (`scrapService` :145/:151, `thirdPartyService` :777/:785)
   não estornam ajuste; o Gestor não tem `movimentar` (R1: ENTRADA → 403) e não remonta o saldo por outra porta; a ordem da
   RN-05 conferida (R3c: ajuste com série → 403 E1 antes do 400); T3 é galho de verdade; a conferência de inventário e a
   devolução à prateleira não ficam erradas.

## Tasks (sort topológico)

- [x] **T1 (tronco) — a guarda e a auditoria no motor.** RN-01..RN-07. `ownerRules.js` (lista, função, export),
  `stockService.js` (chamada e auditoria). Teste novo `server/tests/api/estornoAjusteCliente.api.test.js`: Gestor 403 E1
  inteira nos 3 tipos e nos 2 sabores do AJUSTE (sem efeito: `cancelado`, linha ESTORNO, total, linha de saldo, contagem
  de auditoria); Administrador perfil / superadmin / role admin 200; material nosso Gestor 200 (e sem `ESTORNO_AJUSTE`);
  RN-03 (ENTRADA e SAIDA de cliente, Gestor 200); RN-04 (Gestor e Admin 400 da literal de inventário, pelo serviço); RN-05
  (já cancelada 400 antes; série → 403 para o Gestor e 400 de série para o Admin); RN-06 (a linha inteira; recusa pela
  caixa sem a linha); RN-07 (serviço com `compensacao: true` pelo Gestor passa); pelo serviço direto (`cancelarMovimentacao`
  com o Gestor → 403). Controle positivo: conceder `ajustar_material_cliente` ao GESTOR (cai nomeando a ação); tirar um tipo
  da lista; guarda depois do claim; auditoria antes do efeito / sem `try`.
- [x] **T2 (tronco, depois da T1) — o aviso da caixa.** RN-08. `caixaSql.js`. Teste em
  `server/tests/api/ajusteEnderecoCaixa.api.test.js`: função pura com material de cliente (parêntese só Administrador) e
  com material nosso (byte a byte); pela rota (Admin ajusta com endereço material de cliente com caixa → A1 de cliente).
  Controle: inverter a condição.
- [x] **T3 (galho, contra o contrato) — a tela.** RN-09. Teste em `MovimentacoesAlmoxarifado.test.js` (bloco do estorno):
  `api.post` rejeita com 403 `{ error: E1 }` → `toast.error(E1)`, sem `toast.success`, modal aberto. Controle: trocar a
  mensagem do `toast.error` pelo fallback.
- [x] **T4 (integração, depois de T1–T3) — o documento até o fim, pela rota E pelo serviço.**
  `server/tests/api/estornoAjusteClienteIntegracao.api.test.js`: (K1) pela rota — material de cliente com caixa sem reserva
  de uma requisição (separada); o Administrador conta A→0 → 201 com A1 de cliente; a entrega → "Máximo: 0"; o Gestor estorna
  → 403 E1; o Almoxarife → 403 do gate; o Administrador estorna → 200, auditoria `ESTORNO_AJUSTE` nomeando o cliente; a
  entrega → 200. (K2) pelo serviço — `cancelarMovimentacao(db, GESTOR, …)` → 403, o mesmo com o Administrador → 200. (K3) o
  material nosso no mesmo fluxo: A1 com "Administrador ou Gestor", o Gestor estorna 200 e a entrega passa.
- [x] **T5 — Fase 5 e fechamento.** — ver abaixo.

## Execução (2026-10-15)

- **Plano** `251c9192` (design, plano, Fase 2).
- **T1** `d6493a7e` — `ownerRules.TIPOS_AJUSTE_ESTORNAVEIS_DONO`, `assertEstornoDeAjustePermitido`,
  `auditarEstornoDeAjuste`; a chamada em `cancelarMovimentacao` logo depois do `getMaterial` e a auditoria depois da
  `CANCELAMENTO`; rótulo *"Estorno de ajuste"* em `auditLabels.js` (Fase 2). Teste novo `estornoAjusteCliente` (17; 9
  vermelhos antes da implementação). **Controle:** 8 sabotagens, todas vermelhas na asserção certa — conceder
  `ajustar_material_cliente` ao GESTOR (os 5 sabores, RN-05, serviço direto), tirar AJUSTE_POSITIVO, tirar AJUSTE_NEGATIVO,
  pôr AJUSTE_INVENTARIO (RN-04), sem a isenção da compensação (RN-07), sem o `try` da auditoria, sem a chamada da
  auditoria, sem a guarda. Restauro por cópia, md5 conferido.
  **Divergência:** o stub da RN-06 não podia trocar `audit.registrarAuditoria` (o motor a desestrutura no `require`); a
  auditoria foi para `ownerRules.auditarEstornoDeAjuste`, que o motor chama pelo objeto do módulo (contrato atualizado na
  Fase 2).
- **T2** `6ca3f9a0` — o parêntese da A1 conforme o dono. 2 casos novos em `ajusteEnderecoCaixa` (15). **Controle:** a
  condição invertida derruba 10.
- **T3** `fbce0cb0` — 1 caso novo no bloco de estorno de `MovimentacoesAlmoxarifado.test.js`; sem código de tela.
  **Controle:** a mensagem trocada pelo fallback derruba este e o caso da inspeção.
- **T4** `0c8ec372` — `estornoAjusteClienteIntegracao` (K1–K3). **Divergência:** a entrega de material de cliente exige o
  projeto do dono (Etapa 8) — a montagem grava o `projeto_id` do cliente na requisição. **Controle:** sem a guarda caem K1 e
  K2; a A1 invertida derruba os três.

## Fase 4 — integração serial (2026-10-15)

Sem worktree de galho (T3 é só teste, executado na mesma árvore). Suíte na árvore com T1–T4 (antes dos commits):
`test:api` **358/358** arquivos (EXIT 0); `test:almoxarifado` **44/44**; `test:validation` **4/4**; `test:safealter`
**3/3**; `test:sqlite` **10/10**; cliente jest **102 suítes / 1553 testes**; `CI=true react-scripts build` EXIT 0.

## Fase 5 — revisão adversarial do código (2026-10-15) — 0 defeito de regra, 1 asserção faltando, 1 frase antiga do manual

Dois revisores frescos em worktrees próprias (`CRM-wt-e106rv1`, `CRM-wt-e106rv2`, HEAD `0c8ec372`, junção; removidas).

- **Revisor 1 (RN, perfil, último gesto)** — sondas `e106rv1-a/b`. Passou: admin do módulo (`admin_modulos`) e
  `role: 'admin'` com perfil GESTOR gravado estornam (200); nada muda antes do 403 nos dois sabores; cliente apagado →
  *"cliente #⟨n⟩"* na E1 e na auditoria; três estornos concorrentes pelo serviço → um estorno, uma `ESTORNO_AJUSTE`; ordem
  RN-04/RN-05; porta única. **Achados:** (1) o manual ainda mandava o Gestor estornar (6.10, a A1, "pede ao Administrador ou
  ao Gestor") — corrigido no fechamento (era a correção 3 da Fase 2); (2, anterior) a frase da §5.5 *"O Gestor ajusta o
  saldo da GMP"* — imprecisa: o Gestor não tem `movimentar` (v2 → 403); acerta pela conferência e pelo estorno —
  **reescrita**. **Notas:** a regra e a auditoria seguem o dono de agora (com o dono trocado entre ajuste e estorno, os dois
  registros citam clientes diferentes — declarado na B709, C213); a auditoria nova não leva `camposDeOrigem` (o contrato não
  pedia); o Gestor só vê a recusa depois de digitar o motivo (RN-09, declarado).
- **Revisor 2 ("o teste passaria com a feature quebrada?") — 36 sabotagens: 32 vermelhas, 4 verdes.** Equivalentes ou
  inalcançáveis: S08 (perfil lido de `perfil_almoxarifado` — quem passa do gate e é recusado é sempre GESTOR), S15
  (auditoria com dono nulo — TypeError engolido, nada gravado), S31 (`compensacao` truthy — todos os chamadores passam o
  literal `true`; a rota não repassa opções do corpo). **Falta de asserção:** S21 (`tipo: 'AJUSTE'` fixo na auditoria) —
  **teste novo** (`77c3d525`): estornar AJUSTE_POSITIVO e AJUSTE_NEGATIVO e conferir o tipo. **Controle:** o tipo fixo derruba
  o RN-06. `test:api` na árvore do revisor: 358/358.

**Verificação depois da Fase 5** (árvore em `77c3d525` + docs): `test:api` **358/358** (EXIT 0); `test:almoxarifado`
**44/44**; `test:validation` 4/4; `test:safealter` 3/3; `test:sqlite` 10/10; cliente jest **102 / 1553**; build EXIT 0.

---

## Retro de 4 números

- **Rodadas de correção até verde:** 1 — a da Fase 2 (o rótulo do verbo, antes da suíte; o vermelho do `auditLabels` veio
  do revisor). A suíte inteira passou de primeira (358/358). Nenhum teste vermelho em duas rodadas seguidas.
- **Achados de revisão:** Fase 2 — 3 correções **reais** (rótulo, origem do saldo, documentos) + 1 furo anterior real (C213,
  que a medição seguinte mostrou ser pior: um perfil só basta). Fase 5 — rv1: **2 reais** de documento (1 já previsto, 1
  anterior), 0 de código; rv2: 36 sabotagens, **1 real** (S21), **3 ruído** (equivalentes/inalcançáveis).
- **Paralelismo:** 0 galho de código em paralelo. Em paralelo: a revisão do plano × a escrita da T1; os dois revisores da
  Fase 5 × a documentação. Nenhum EADDRINUSE.
- **Defeito que escapou:** nenhum medido na Etapa 108 no código da 106 (a sonda da 108 reestornou a entrada de cliente pelo
  Gestor — B708, comportamento declarado; a C213 era anterior e conhecida, e foi paga na 108, `cd7d5118`).

## O que fica de fora (declarado)

- A troca do dono no cadastro (C213) — a próxima.
- Os estornos de ENTRADA/SAIDA/DEVOLUCAO_CLIENTE/TRANSFERENCIA/PERDA/SUCATA de material de cliente (B708).
- Esconder o botão de estorno por perfil/dono (decisão antiga: a tela mostra a recusa do servidor).
- A C209 (aviso da contagem abaixo do reservado) — outra família (aviso do ajuste, não autorização); fica como candidata
  (B711).

## Próxima tarefa detalhada — Etapa 108

*(A 107 é da frente de Compras, em paralelo. A série desta etapa foi B707–B712, C212–C213, A55 — a 108 começa em
**B713**, **C214**, **A56**, **G88**; confira com `grep -oE` antes, porque a 107 pode ter escrito no documento do
almoxarifado se mexeu na barra de abas dele.)*

**Como foi escolhida (mapa `specs/modulo-almoxarifado/README.md`, medido em 2026-10-15):** as features 🟡 são 00, 01, 05,
06, 21, 22 e 23; a 13 é 🟢 com furo declarado. Dois candidatos medidos:

1. **C213 — trocar o dono do material no cadastro contorna a permissão de ajustar material de cliente** (features 13, 01 e
   23). **Medido** (sonda `server/tests/sonda/e106c213.js`, não versionada): material de cliente com 10; o **Almoxarife**,
   sozinho, `AJUSTE` 50 → 403 (a guarda da Etapa 8); `PUT /api/almoxarifado/materiais/:id` `{ proprietario_cliente_id: null }`
   → **200**; `AJUSTE` 50 → **201**; `PUT` devolvendo o dono → **200**. Final: total 50, dono de volta, **0** auditorias
   `material_cliente` (a edição audita `material`/`ATUALIZACAO` com o de → para). A revisão do plano desta etapa achou o
   mesmo pelo estorno (o Gestor estorna depois de o dono sumir).
2. **C209 — a contagem abaixo do reservado não avisa** (feature 05; desenho no fim do plano da 104). Aviso de um estado que
   a entrega já nomeia.

**Escolhida: a C213.** É autorização (o número que o cliente cobra muda por quem não tem a permissão, e um perfil só
basta); a C209 é aviso (B711).

**Tema: trocar (ou tirar) o dono de um material com saldo passa a exigir `ajustar_material_cliente`.**

**Fase 0 (medir antes de prometer):**
1. Reproduzir a sonda pela rota com os perfis que têm `editar_material` (Administrador, Almoxarife, Engenharia) nos três
   sentidos: cliente → nosso, nosso → cliente, cliente A → cliente B; com saldo 0 e com saldo; com reserva, caixa,
   bloqueado, em inspeção, em terceiros (o saldo "de alguém" pode estar só retido).
2. **O formulário sempre manda a chave** (`MaterialAlmoxarifadoForm.js:481`, `proprietario_cliente_id: form… || null`) — a
   guarda tem de comparar com o gravado (`String(merged) !== String(current)`, o padrão do `subfamiliaChanged` na mesma
   rota, ~`routes/almoxarifado.js:653`), senão toda edição de material de cliente pelo Almoxarife quebra.
3. Outras portas que gravam o dono: `materialService.createMaterial` (`:230` — criar já com dono não muda saldo de ninguém;
   medir se há saldo inicial na criação), importação/cópia de material (procurar pelo nome da coluna nas rotas e serviços),
   e o que mais escrever `proprietario_cliente_id` (`grep -rn "proprietario_cliente_id" server/`).
4. Lotes, séries e movimentações antigas: o livro guarda `cliente_id` por linha? (A posição por cliente,
   `clienteEstoqueService`, soma o livro pelo dono **de hoje**? — trocar o dono reescreve a posição do cliente antigo.)

**Contrato candidato (decisão — letra B, caminho reversível):** em `PUT /materiais/:id`, quando o dono **muda** e o
material tem **físico ou retenção > 0** (ou movimentação no livro — decidir medindo), exigir `can(user,
'ajustar_material_cliente')` → 403 com literal própria no molde da E1 desta etapa (*"Trocar o dono do material ⟨código⟩
… exige a permissao "ajustar_material_cliente" (seu perfil: ⟨perfil⟩). …"*), antes de gravar; com saldo zero e livro vazio,
livre (cadastro errado logo depois de criar). Auditoria `material_cliente`/`TROCA_DONO` nomeando os dois clientes
(rótulo em `auditLabels.js`). **Descartado de saída:** proibir a troca para todos (o Administrador precisa corrigir
cadastro errado); mudar o gate da rota (o Almoxarife perderia a edição do resto do cadastro).

**Pontos de atenção:** a tela de cadastro mostra `err.response.data.error`? (conferir o `catch` do salvar em
`MaterialAlmoxarifadoForm.js`); a mensagem do Gestor não se aplica (ele não tem `editar_material`); teste pela rota **e**
o controle positivo concedendo a permissão ao Almoxarife; o manual §16.2 ("Como o dono é marcado") e §5.5; a posição por
cliente depois da troca (item 4 da Fase 0).

**O que já está pronto e não precisa reabrir:** a guarda do ajuste (Etapa 8) e a do estorno (esta etapa), o gate
`editar_material`, a auditoria `ATUALIZACAO` do material.
