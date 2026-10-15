# Etapa 106 — o estorno do ajuste de material de cliente exige a permissão do ajuste (C211)

> Status: **EM EXECUÇÃO — 2026-10-15.** Worktree `CRM-wt-e106`, branch `etapa-e106` (de `main` `e963449f`).
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
   segue o dono **de agora**; isso contorna a decisão 7 inteira (o ajuste também, não só o estorno) e exige dois perfis.
   Fora da etapa; registrado como candidato.
6. **(notas)** Porta única confirmada; as quatro chamadas internas (`scrapService` :145/:151, `thirdPartyService` :777/:785)
   não estornam ajuste; o Gestor não tem `movimentar` (R1: ENTRADA → 403) e não remonta o saldo por outra porta; a ordem da
   RN-05 conferida (R3c: ajuste com série → 403 E1 antes do 400); T3 é galho de verdade; a conferência de inventário e a
   devolução à prateleira não ficam erradas.

## Tasks (sort topológico)

- [ ] **T1 (tronco) — a guarda e a auditoria no motor.** RN-01..RN-07. `ownerRules.js` (lista, função, export),
  `stockService.js` (chamada e auditoria). Teste novo `server/tests/api/estornoAjusteCliente.api.test.js`: Gestor 403 E1
  inteira nos 3 tipos e nos 2 sabores do AJUSTE (sem efeito: `cancelado`, linha ESTORNO, total, linha de saldo, contagem
  de auditoria); Administrador perfil / superadmin / role admin 200; material nosso Gestor 200 (e sem `ESTORNO_AJUSTE`);
  RN-03 (ENTRADA e SAIDA de cliente, Gestor 200); RN-04 (Gestor e Admin 400 da literal de inventário, pelo serviço); RN-05
  (já cancelada 400 antes; série → 403 para o Gestor e 400 de série para o Admin); RN-06 (a linha inteira; recusa pela
  caixa sem a linha); RN-07 (serviço com `compensacao: true` pelo Gestor passa); pelo serviço direto (`cancelarMovimentacao`
  com o Gestor → 403). Controle positivo: conceder `ajustar_material_cliente` ao GESTOR (cai nomeando a ação); tirar um tipo
  da lista; guarda depois do claim; auditoria antes do efeito / sem `try`.
- [ ] **T2 (tronco, depois da T1) — o aviso da caixa.** RN-08. `caixaSql.js`. Teste em
  `server/tests/api/ajusteEnderecoCaixa.api.test.js`: função pura com material de cliente (parêntese só Administrador) e
  com material nosso (byte a byte); pela rota (Admin ajusta com endereço material de cliente com caixa → A1 de cliente).
  Controle: inverter a condição.
- [ ] **T3 (galho, contra o contrato) — a tela.** RN-09. Teste em `MovimentacoesAlmoxarifado.test.js` (bloco do estorno):
  `api.post` rejeita com 403 `{ error: E1 }` → `toast.error(E1)`, sem `toast.success`, modal aberto. Controle: trocar a
  mensagem do `toast.error` pelo fallback.
- [ ] **T4 (integração, depois de T1–T3) — o documento até o fim, pela rota E pelo serviço.**
  `server/tests/api/estornoAjusteClienteIntegracao.api.test.js`: (K1) pela rota — material de cliente com caixa sem reserva
  de uma requisição (separada); o Administrador conta A→0 → 201 com A1 de cliente; a entrega → "Máximo: 0"; o Gestor estorna
  → 403 E1; o Almoxarife → 403 do gate; o Administrador estorna → 200, auditoria `ESTORNO_AJUSTE` nomeando o cliente; a
  entrega → 200. (K2) pelo serviço — `cancelarMovimentacao(db, GESTOR, …)` → 403, o mesmo com o Administrador → 200. (K3) o
  material nosso no mesmo fluxo: A1 com "Administrador ou Gestor", o Gestor estorna 200 e a entrega passa.
- [ ] **T5 — Fase 5 e fechamento.**

## O que fica de fora (declarado)

- Os estornos de ENTRADA/SAIDA/DEVOLUCAO_CLIENTE/TRANSFERENCIA/PERDA/SUCATA de material de cliente (B708).
- Esconder o botão de estorno por perfil/dono (decisão antiga: a tela mostra a recusa do servidor).
- A C209 (aviso da contagem abaixo do reservado) — outra família (aviso do ajuste, não autorização); fica como candidata
  (B711).
