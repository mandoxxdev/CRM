# Etapa 201 — O "Sai de" mostra o que sobra depois do separado para outras requisições

> **Tronco (rota de leitura + régua do serviço) e um galho de tela.** Estimativa enviada: item 2 de
> `docs/estimativas/2026-11/estimativa_2026-11-05_almoxarifado-proximas-2.txt` (**2h30**). Fecha o **C469**
> (`docs/almoxarifado-novidades-por-etapa.md`: o "Sai de" da janela de separação — e o da entrega, anotado na 200 — mostra o saldo do
> endereço sem descontar o separado das outras). Plano medido sobre `258616f1` (linhas abaixo são de hoje). Spec:
> `specs/modulo-almoxarifado/05-separacao-picking/README.md`. Ponto de partida: "Próxima tarefa detalhada" de
> `docs/superpowers/plans/2026-11-05-almoxarifado-etapa200-entrega-a-mao-respeita-separado.md` (`:297-331`) — conferida linha a linha, bate.

## Objetivo (em linguagem simples)

Há 6 peças no endereço XB-01 (lote L1). A requisição R1 já separou 4 dali. Quem abre a separação de R2 vê no "Sai de"
*"XB-01 — lote L1 (6)"*, escolhe, digita 4 e só ao confirmar descobre que não pode (a C1 da 198: *"…sobra 2, que não cobre a quantidade
(4)…"*). Passa a ver, na própria lista, *"XB-01 — lote L1 (6; 4 separados para outras; sobra 2)"*. O mesmo na janela de entrega.

## Fase 0 — medido em 2026-11-05 (sobre `258616f1`)

### A rota e quem a lê

- `GET /api/almoxarifado/estoque/:materialId/saldos` — `server/routes/almoxarifado/extended.js:830-835`: só `auth` (mais o middleware do
  módulo no prefixo, `server/routes/almoxarifado.js:327`), devolve `stockService.consultarSaldosPorLocalizacao(db, materialId)` cru. Material
  inexistente → `[]` (200), não 404. **Não há 403/404 próprios na rota hoje** — os que existem são do `auth`/módulo e não mudam.
- `consultarSaldosPorLocalizacao` — `server/services/almoxarifado/stockService.js:3929-3948` (`s.*` + `localizacao_codigo/descricao/tipo`,
  `almoxarifado_codigo/nome`, `lote`). **Também usada pelo extrato** (`extended.js:1009` rota `GET /materiais/:id/extrato`, chamada em `:1021`)
  → **não mexer nela**; o campo novo é montado na rota.
- No `client/`: **só** `client/src/components/almoxarifado/RequisicoesList.js:538` chama a rota (grep de `/saldos` em `client/src`, fora de
  teste: 1 ocorrência). Testes de servidor que leem a rota: `almoxarifadoNasConsultas.api.test.js:146-170` e
  `areasEspeciaisIntegracao.api.test.js:113` — nenhum compara chaves exatas (sem `deepEqual`/`keys`), então campo novo não quebra.

### A régua (`server/services/almoxarifado/requisitionService.js`)

- `parteOrigemSql` / `PARTE_ORIGEM_SQL` (`:67-74`) — a parte da origem de cada item (`quantidade_origem_separacao` limitada à caixa; `NULL`
  legado = caixa inteira).
- `caixaVivaSql(alias)` (`:82-87`) — `ativo = 1` e status em `STATUS_COM_CAIXA`.
- `parteGuardadaDeOutras(db, materialId, origemId, loteId, requisicaoId)` (`:94-104`) — **par a par**, agrupa por requisição com
  `HAVING SUM(parte) > Q.QTD_FOLGA` (`quantidade.js:28`, `1e-9`), devolve `{ q, numeros }`. Não exportada.
- `memoParteGuardadaDeOutras` (`:110-117`) — memo por chamada; usado pela separação (`:1425`) e pela entrega (`:2082`). Não exportado.
- `module.exports` em `:2933`. `requisitionService` só importa serviços (`:4-33`), nenhum arquivo de `routes/`; `extended.js` importa
  `stockService` (`:58`) mas **não** `requisitionService`, que já é carregado por `routes/almoxarifado.js:26` antes de registrar a extended
  (`:5152-5166`) → `require` novo em `extended.js` **sem ciclo**.

### O que o servidor recusa (para decidir o teto da tela)

- **Separação, aceitação (C1)** — `checarOrigemItem` (`:1258-1307`): `saldo = físico do par − jaPedido` (o `pedidoSeparacao`, semeado em
  `:1440-1446` com a parte dos itens **desta** requisição no par + o que a rodada já pediu); recusa a física se `saldo < qty`; recusa a C1 se
  `outras > folga` e `saldo − outras < qty` (`:1301-1306`).
- **Separação, divergência** (`:1511-1524`): o máximo gravado é `físico − outras − pedidoSeparacao` — **já desconta as outras**. A tela não
  desconta: hoje, quem separa a sobra inteira vê *"Separando menos que o possível — conte o porquê"* (motivo opcional), e o servidor grava
  `divergente = 0`. A tela e o servidor discordam.
- **Entrega (E1)** — só o caso (c) (`:2078-2104`); a janela de entrega não tem teto por origem.

### A tela (`client/src/components/almoxarifado/RequisicoesList.js`)

- `rotuloOrigem` `:148` (`` `${codigo}${lote ? ` — lote ${lote}` : ''} (${s.quantidade})` ``), usado em `:2471` (separação) e `:2614` (entrega).
- `opcoesOrigem` `:149-150` (endereço e `quantidade > 0`).
- `s.quantidade` também entra em: `maxSeparavelNaTela` `:279-292` (`:291`: `opcao.quantidade − jaPlanejadoNoPar`) e
  `valorSugeridoNaSeparacao` `:249` (`opcao.quantidade < jaNoPar + qtd`). `maxSeparavelNaTela` é chamada em `:229`
  (`valorPlanejadaNaSeparacao`, pré-seleção da planejada), `:248` (sugerido), `:944` (o `motivo_divergencia` do payload), `:2515` (o
  campo de motivo) e `:304/:318` (sem "Sai de" — não muda).
- **O campo de quantidade não usa a origem:** `max={maxQtdSeparacao(item)}` (`:2537`; `maxQtdSeparacao` `:66-69` = min(pendente, saldo
  separável)). Logo, descontar as outras em `maxSeparavelNaTela` **não bloqueia nada que o servidor aceite** — muda só o aviso de
  divergência e a pré-seleção.
- O efeito de busca `:523-551`: chave `materiaisEntregaKey` (`:516-518`, `E:`/`S:` + materiais); fechar a janela zera a chave, então outra
  requisição com os mesmos materiais busca de novo. `detalhe.id` está no escopo do efeito.

## Caminhos

- Servidor: `server/services/almoxarifado/requisitionService.js` (função nova + export), `server/routes/almoxarifado/extended.js` (rota).
- Teste novo: `server/tests/api/saldosSobraDeOutras.api.test.js`.
- Tela: `client/src/components/almoxarifado/RequisicoesList.js`; teste em `client/src/components/almoxarifado/RequisicoesList.test.js`.

## Regras

- **RN-201.01 — o campo.** Cada linha do `GET …/saldos` ganha `separado_outras` = soma da **parte guardada** (`PARTE_ORIGEM_SQL`) das caixas
  vivas de **outras** requisições cujo par (`origem_separacao_id`, `lote_separacao_id`) é o par da linha (`localizacao_id`, `lote_id`), e
  `sobra` = `max(0, quantidade − separado_outras)`, ambos arredondados por `Q.qtd`. *Cenário:* XB-01/L1 com 6, R1 separou 4 de lá →
  `separado_outras: 4, sobra: 2`; XP-01/L2 sem separado → `0` e `sobra = quantidade`.
- **RN-201.02 — a própria não conta.** Com `?requisicao_id=R`, as caixas de R não entram; sem o parâmetro, entram todas. *Cenário:* o mesmo
  par → `?requisicao_id=R1` dá `0`; `?requisicao_id=R2` dá `4`; sem parâmetro dá `4`.
- **RN-201.03 — a régua é a da C1/E1.** Requisição excluída (`ativo = 0`) e cancelada legada (status `CANCELADO` com caixa) não contam;
  parte limitada (`quantidade_origem_separacao` < caixa) conta só a parte; `NULL` legado conta a caixa; requisição com parte ≤ folga não conta;
  o lote distingue o par (L1 ≠ L2 ≠ sem lote no mesmo endereço); linha sem endereço → `0`. **Equivalência:** para cada par do cenário,
  `separado_outras` da rota == `parteGuardadaDeOutras(...).q` com o mesmo `requisicaoId`.
- **RN-201.04 — o parâmetro.** `requisicao_id` ausente = conta todas; presente e não inteiro positivo (`''`, `abc`, `0`, `-1`, `1.5`) → 400
  literal; inteiro de requisição inexistente → 200 sem excluir nada (não há caixa dela para tirar). 401/403 do `auth`/módulo e o `[]` do
  material inexistente **inalterados**.
- **RN-201.05 — o extrato não muda.** `GET /materiais/:id/extrato` → `saldos_localizacao` sem `separado_outras`/`sobra`.
- **RN-201.06 — o rótulo.** Com `separado_outras > 1e-9`: a literal L1 (abaixo). Sem separado de outras, **ou resposta sem o campo**
  (servidor antigo): o rótulo de hoje, letra por letra.
- **RN-201.07 — a tela manda a requisição.** As duas janelas (separação e entrega) pedem `/almoxarifado/estoque/${materialId}/saldos?requisicao_id=${detalhe.id}`.
- **RN-201.08 — a régua da tela na separação usa a sobra.** `maxSeparavelNaTela` (`:291`) e o teste de cobertura do sugerido (`:249`) passam a
  usar `sobraDaOpcao(s)` = `s.sobra` se número finito, senão `s.quantidade` (compat). Efeitos: (a) separar a sobra inteira não pede mais
  motivo de divergência (bate com o `divergente = 0` do servidor); (b) a planejada e o sugerido que a sobra não cobre não são pré-selecionados
  (fica automático, como já acontece quando o físico não cobre). O campo de quantidade e o filtro `opcoesOrigem` **não mudam** (a opção com
  sobra 0 continua na lista, mostrando por quê). Entrega: só o rótulo (a E1 continua a recusa).
- **RN-201.09 — integração.** R1 separa 4 de XB-01/L1 (6; mais estoque em XP-01 para o teto do item não bater antes) → `GET …/saldos?requisicao_id=R2`
  dá `separado_outras 4, sobra 2` → R2 separa 2 de XB-01 → 200 → nova leitura `?requisicao_id=R3` dá `6` e `sobra 0`; R2 separando 3 em vez de 2
  → C1 com *"sobra 2"*: o número da lista é o número da recusa. **Pela rota** (`PUT …/separacao` + `GET …/saldos`) e **pelo serviço**
  (`separarRequisicao` + `parteGuardadaDeOutrasPorPar`).

## Contrato congelado

**`GET /api/almoxarifado/estoque/:materialId/saldos[?requisicao_id=N]`**

- Resposta 200: o array de hoje, mesma ordem e mesmos campos, **mais** por linha:
  - `separado_outras: number` (≥ 0; `0` em linha sem `localizacao_id`);
  - `sobra: number` = `Q.qtd(Math.max(0, quantidade − separado_outras))`.
- 400 `{ error: 'requisicao_id inválido' }` — parâmetro presente e não casa `/^[1-9]\d*$/`.
- Demais respostas inalteradas (401/403 do `auth` e do módulo; `[]` para material inexistente; 500 pelo `handleError`).
- Sem trava: é leitura de momento (como a `sugestao-coleta`, B1250); quem decide é a C1/E1 na gravação.

**Interno (serviço)** — `requisitionService.parteGuardadaDeOutrasPorPar(db, materialId, requisicaoId = null)` → `Promise<Map<string, number>>`,
chave `` `${origemId}|${loteId ?? ''}` ``. SQL montado com as mesmas peças de `parteGuardadaDeOutras` (`PARTE_ORIGEM_SQL`, `caixaVivaSql('r')`,
`Q.QTD_FOLGA`): subconsulta agrupada por `ir.origem_separacao_id, ir.lote_separacao_id, r.id` com `HAVING SUM(parte) > folga`, somada por par;
`WHERE ir.material_id = ? AND ir.origem_separacao_id IS NOT NULL AND (? IS NULL OR ir.requisicao_id <> ?) AND <viva>`. `parteGuardadaDeOutras`
e o memo **não mudam** (a C1/E1 ficam bit a bit; a equivalência da RN-201.03 é a prova de que a régua é uma só).

**Rótulo (tela) — literal L1**, com `r6 = (x) => Math.round(x * 1e6) / 1e6`:

```
`${s.localizacao_codigo}${s.lote ? ` — lote ${s.lote}` : ''} (${s.quantidade}; ${r6(outras)} ${outras > 1 + 1e-9 ? 'separados' : 'separado'} para outras; sobra ${r6(sobra)})`
```

- Exemplos: *"XB-01 — lote L1 (6; 4 separados para outras; sobra 2)"*; *"XB-01 (3; 1 separado para outras; sobra 2)"*;
  *"XB-01 — lote L1 (2; 4 separados para outras; sobra 0)"* (físico abaixo do guardado).
- Sem separado de outras (`!(outras > 1e-9)`) ou campo ausente: *"XB-01 — lote L1 (6)"*, igual a hoje.
- `quantidade` continua crua (como hoje); "outras" sem "requisições" para caber no celular — a palavra completa e os números das requisições
  ficam na C1/E1.

**Payloads de separação e entrega: inalterados.** C1 e E1: inalteradas.

## Tasks (sort topológico)

- **T1 — tronco — a régua agrupada e a rota** (`requisitionService.js`, `extended.js`).
  1. `parteGuardadaDeOutrasPorPar` ao lado de `parteGuardadaDeOutras` (`:94`), exportada em `:2933` com o comentário `// Etapa 201 (T1)`; `parteGuardadaDeOutras` exportada também, sem mudar (prova de equivalência da T2).
  2. Na rota `:830`: validar `req.query.requisicao_id` (RN-201.04, literal do contrato), ler as linhas por `consultarSaldosPorLocalizacao` (sem
     mexer nela), ler o mapa uma vez e acrescentar `separado_outras`/`sobra` por linha. `require` de `requisitionService` no topo de
     `extended.js` (perto de `:58`), com a nota "sem ciclo: o serviço não importa rotas".
  3. `npm run test:api` inteiro.
  *Estimativa:* 25 min.
- **T2 — tronco — os testes das regras** em `server/tests/api/saldosSobraDeOutras.api.test.js` (molde de setup:
  `separacaoSeparadoDeOutras.api.test.js:26-138`; estoque em outro endereço em todo cenário que separa, senão o teto do item bate antes —
  lição da Fase 2 da 198). Cenários com o ID no nome: RN-201.01, .02, .03 (excluída pelo `DELETE`, cancelada legada por SQL, parte limitada,
  `NULL` legado por SQL, folga, três pares no mesmo endereço, linha sem endereço, equivalência com `parteGuardadaDeOutras` — que a T1
  também exporta, sem mudar, com o comentário `// Etapa 201 (T1): exportada para a prova de equivalencia`), .04 (cada valor inválido → 400 literal; inexistente → 200;
  sem perfil → o mesmo status da rota de hoje), .05.
  *Controles positivos (cada um tem de derrubar o que diz, anotado no plano):* (i) tirar `requisicao_id <> ?` → cai RN-201.02;
  (ii) tirar `caixaVivaSql` → cai RN-201.03 excluída/cancelada; (iii) caixa no lugar de `PARTE_ORIGEM_SQL` → cai parte limitada; (iv) chave
  sem o lote → cai três pares; (v) validação desligada → cai RN-201.04; (vi) campo posto em `consultarSaldosPorLocalizacao` → cai RN-201.05.
  Harness `perl -0pi` com âncora única sobre base LF, md5 antes → sabotado → restaurado igual.
  *Estimativa:* 45 min.
- **T3 — galho (contra o contrato) — a tela** (`RequisicoesList.js` + `RequisicoesList.test.js`; mock de JSON só na fronteira HTTP).
  1. `:538`: `?requisicao_id=${detalhe.id}` (RN-201.07).
  2. `rotuloOrigem` `:148` com a L1 (RN-201.06); `sobraDaOpcao` usado em `:249` e `:291` (RN-201.08); comentário de `:272-275` ("outras
     requisições a tela não conhece") corrigido — deixou de valer.
  3. Jest: URL com `requisicao_id` nas duas janelas; rótulo com 4 e com 1 (plural/singular) e sem campo/0 (igual a hoje); separar a sobra inteira
     não mostra `separacao-motivo-<id>`; a planejada que a sobra não cobre abre em automático.
  *Controles:* (a) URL sem o parâmetro → cai RN-201.07; (b) `sobraDaOpcao` devolvendo `quantidade` → cai RN-201.08; (c) rótulo de hoje → cai
  RN-201.06. `CI=true npx react-scripts build`.
  *Estimativa:* 35 min. **Pode rodar em paralelo com a T2** (só depende do contrato); a T1 vem antes de ambas.
- **T4 — tronco (fecha) — integração RN-201.09** no arquivo da T2, pela rota e pelo serviço. *Controle:* sabotagem (i) da T2 → a leitura de R1
  mostra o próprio separado e a sobra deixa de bater com a C1. *Estimativa:* 15 min.

Ordem: **T1 → (T2 ∥ T3) → T4**. T2 e T3 em paralelo não se pisam (servidor × `client/`, arquivos distintos, nenhuma sabotagem de produção
compartilhada — a T3 não roda a suíte do servidor).

## Letra B proposta (para `docs/almoxarifado-novidades-por-etapa.md`, a partir de B1343)

- **B1343** — campo novo na **rota** (`separado_outras` e `sobra`), não na função do extrato nem no lugar de `quantidade`. **Descartado:** trocar
  `quantidade` (mudaria opções, teto e o extrato); rota nova (duas fontes para a mesma lista).
- **B1344** — a régua agrupada é uma função nova com as mesmas peças da C1, provada equivalente por teste; `parteGuardadaDeOutras` não muda.
  **Descartado:** reusar o memo par a par (N consultas por material, à toa); refatorar a função da C1 para usar a agrupada (mexe na recusa
  sem necessidade nesta etapa).
- **B1345** — `requisicao_id` opcional; inválido → 400 literal; inexistente → conta todas (nada a excluir). **Descartado:** 404 para requisição
  inexistente (a rota é de material e não tem 404 hoje; a tela sempre manda uma que existe); exigir perfil (a rota é de leitura e não tem hoje).
- **B1346** — a régua da tela na separação (aviso de divergência e pré-seleção) usa a sobra; o campo de quantidade não muda. **Descartado:**
  só o rótulo (a tela continuaria pedindo motivo de "menos que o possível" para quem separou tudo o que sobra, e pré-selecionando par que a C1
  recusa); limitar o campo pela sobra (o campo não é por origem hoje e bloquearia a separação no automático, que o servidor aceita).
- **B1347** — a opção com sobra 0 continua na lista. **Descartado:** escondê-la (a pessoa não saberia por que o endereço sumiu).
- **B1348** — rótulo curto "separados para outras", sem os números das requisições. **Descartado:** os números na lista (longo no celular; a
  C1/E1 já os dá).

## Letra C proposta (a partir de C473)

- **C469** — vira **resolvido** (o "Sai de" das duas janelas mostra o separado das outras e a sobra).
- **C473** — o número da lista é o do momento em que a janela abriu: uma separação de outra requisição no meio não aparece até reabrir; a C1/E1
  continuam decidindo na gravação.

## O que não cobre

C470, C471, C472 (entrega acima da parte, só lote, irmão da mesma requisição); a Movimentação (não usa a rota — medido); o "Saldo:" do
cabeçalho do item na janela (`:2457`, é o do material inteiro); o extrato.

## Cabe em 2h30?

**Sim, justo.** Análise 30 min (este plano + Fase 2). Execução ~45 min (T1 25 + parte de código da T3 ~20). Teste ~1h15 (T2 45 + Jest da T3 ~15
+ T4 15) mais a suíte e as sabotagens — dentro de 1h30. Risco de estouro: a suíte de tela ter cenários que afirmam o motivo de divergência ou a
pré-seleção com `quantidade` crua em mock sem `sobra` (a compat da RN-201.08 os protege; medido só na T3). **Corte se estourar:** a RN-201.08
(B1346) sai para uma etapa seguinte (vira C474) e fica só o rótulo — economiza ~20 min.

## Fase 2 — correções do revisor fresco (2026-11-05) — **MANDAM sobre o texto acima onde divergem**

Revisor fresco sobre `855e7404`: 0 trava, 1 importante, 2 menores, todos aceitos. Confirmado: a chave `${origemId}|${loteId ?? ''}` casa NULL com
NULL; linha sem endereço dá 0 (a C1 também só age com endereço, `requisitionService.js:1300`); o NULL legado bate com `parteOrigemSql`
(`:69-73`); a resposta só traz somas (sem números de requisição); a pré-seleção com a sobra só deixa de pré-selecionar o que a C1 já recusava; T2 ∥
T3 independentes; na entrega a E1 do caso (c) usa `saldo − outras`, o mesmo número do rótulo.

1. **[IMPORTANTE] Na janela de SEPARAÇÃO a sobra do rótulo ignorava o que a própria requisição já separou no par.** XB-01/L1 6; R1 separou 4; R2
   já separou 1 ali (pendente); R2 reabre e vê "sobra 2", digita 2, e a C1 recusa "há 5 (já contando 1 desta requisição)… sobra 1". A C1 desconta
   `jaPedido` (`:1440-1446`, `:1293`); a régua da tela também (`jaPlanejadoNoPar`, `RequisicoesList.js:289-291`). **RN-201.06 (só na separação):**
   sobra do rótulo = `max(0, sobraDaOpcao(s) − propriaNoPar)`, `propriaNoPar` = soma de `pendentePlanejado(i)` dos itens do material com
   `valorPlanejada(i) === valorOrigem(s)` (a mesma conta do `pedidoSeparacao`). Com `propriaNoPar > 1e-9` o rótulo diz também "N desta". A entrega
   usa o rótulo sem esse desconto (o separado da própria sai junto). **RN-201.09** ganha: "R2 separa 1, lê sobra 1, tenta 2 → C1 com sobra 1";
   controle: rótulo sem `propriaNoPar` → cai.
2. **[MENOR] Rótulo cortado no celular** (`Almoxarifado.css:569-580`, select a 100%, ~40 caracteres visíveis). **Literal L1 nova, a sobra primeiro:**
   `` `${cod}${lote} (sobra ${r6(sobra)} de ${s.quantidade}; ${r6(outras)} para outras)` `` → "XB-01 — lote L1 (sobra 2 de 6; 4 para outras)"; na
   separação com a própria: "XB-01 — lote L1 (sobra 1 de 6; 4 para outras, 1 desta)". Ajustar os exemplos e a B1348.
3. **[MENOR] RN-201.04:** `requisicao_id` presente e (`typeof !== 'string'` ou não casa `/^[1-9]\d*$/`) → 400; teste com o array
   (`?requisicao_id=1&requisicao_id=2`).

## Fase 2 — revisão do plano (feita — ver o bloco acima)

As quatro perguntas da skill, com atenção a: (1) a chave `` `${origemId}|${loteId ?? ''}` `` casa `lote_id` `NULL` da linha com
`lote_separacao_id` `NULL` do item; (2) a RN-201.08 traçada até a gravação (a pré-seleção que fica automática, o motivo que não aparece, e o
`motivo_divergencia` de `:944` coerente com o campo de `:2515`); (3) se a T2 cobre a fronteira da folga (parte exatamente 1e-9) dos dois lados da equivalência.

## Execução

Executada em série (T1 → T2 → T3 → T4), sobre `1fc07cbf`, com as três correções da Fase 2 aplicadas desde o primeiro código.

- [x] **T1** — `1b04ad38`. `parteGuardadaDeOutrasPorPar` ao lado de `parteGuardadaDeOutras` (que não mudou; só passou a ser exportada).
  Rota: `requisicao_id` presente e (`typeof !== 'string'` ou não casa `/^[1-9]\d*$/`) → 400 `requisicao_id inválido` (Fase 2 item 3);
  `separado_outras`/`sobra` montados na rota; `consultarSaldosPorLocalizacao` (a do extrato) **intocada** (`git diff 855e7404 -- server/services/almoxarifado/stockService.js` vazio).
  **Vermelho** antes do código: 10/11 do arquivo da T2 caíam (só o .05 passava — como devia). O próprio arquivo pegou um `\d` perdido na regex
  (400 para id válido) antes do commit.
- [x] **T2** — `4b62f20c`. `server/tests/api/saldosSobraDeOutras.api.test.js`, 11 cenários (.01, .02, .03 ×6, .04 ×2 com o array e `' 1'`/`'01'`,
  .05). A equivalência compara, em cada cenário, a rota, `parteGuardadaDeOutrasPorPar` e `parteGuardadaDeOutras` par a par (folga 1e-9 dos
  dois lados: as duas dão 0). Controles (perl `-0pi` sobre base LF, âncora `grep -cF` = 1, md5 antes → sabotado → restaurado igual):
  (i) `requisicao_id <> ?` → `? IS NOT NULL` → cai .02; (ii) `caixaVivaSql` → `(1 OR …)` → caem excluída e cancelada; (iii) caixa no lugar da
  parte → caem parte limitada e folga; (iv) chave da rota sem o lote → caem três pares e mais 8; (v) validação desligada → cai .04 inválidos;
  (vi) `0 as separado_outras` em `consultarSaldosPorLocalizacao` → cai .05.
- [x] **T3** — `f089c284`. URL `?requisicao_id=${detalhe.id}` nas duas janelas; `rotuloOrigem(s, propriaNoPar)` com a L1 nova (a sobra
  primeiro; "N desta" só na separação — `propriaNoPar` = soma de `pendentePlanejado` dos itens do material com a planejada no par);
  `sobraDaOpcao` em `maxSeparavelNaTela` e no teste de cobertura do sugerido; comentário "outras requisições a tela não conhece" corrigido.
  Jest novo `RequisicoesSaiDeSobra.test.js` **9/9** (vermelho antes: 7/9 caíam). Controles (Edit e Edit inverso, md5 `1df2decc` igual nos
  quatro): (a) URL sem o parâmetro → 7 caem; (b) `sobraDaOpcao` = `quantidade` → 5 caem (motivo, planejada em automático, rótulos);
  (c) rótulo de hoje → os 3 de rótulo; (d) rótulo da separação sem `propriaNoPar` → só o "1 desta".
- [x] **T4** — `b3727231`. RN-201.09 pela rota (dois cenários: o do plano e o da Fase 2 "R2 separa 1, lê sobra 1, tenta 2 → C1 com sobra 1")
  e pelo serviço. Arquivo: **14/14**. Controles: sabotagem (i) → caem os 3 da T4 (R1 se conta; a rota de R2 dá 5 e a sobra deixa de bater com
  a C1) e o .02; a sobra da separação sem a parte própria (no ajudante do teste) → cai só o da Fase 2 (2 contra o "sobra 1" da C1).

**Divergências do texto do plano (registradas aqui, reversíveis):**
- O rótulo L1 só aparece com `separado_outras > 1e-9` (RN-201.06 como escrita): com **só** a própria no par (outras 0) fica o rótulo de hoje,
  sem "desta". Descartado mostrar "sobra X de Y; 0 para outras, N desta" — não é o C469 e mudaria o rótulo de quem não tem disputa. *(**Revisto na Fase 5 (B1349, `ab1d6246`):** com só a própria no par o rótulo da separação passou a mostrar a sobra, "XB-01 — lote L1 (sobra 5 de 6; 1 desta)" — sem o "0 para outras", que continua descartado —, porque a recusa física já desconta a própria e o número da lista não batia.)*
- O Jest foi num arquivo novo (`RequisicoesSaiDeSobra.test.js`, molde de `RequisicoesSeparacaoDivergencia.test.js`), não em
  `RequisicoesList.test.js`: este não tem a janela de separação montada. Os mocks de saldos de **dez** arquivos comparavam a URL exata e foram
  ajustados para `?requisicao_id=55` (só a fronteira HTTP; nenhuma asserção de comportamento mudou).
- O `npm run test:api` foi rodado uma vez, no fim (não depois da T1), por ordem do coordenador.

**Suítes finais (serial, sobre `b3727231`):** `test:api` **588/588 arquivos**; `test:almoxarifado` **44/0**; Jest da tela inteira **213/213
suítes, 2931/2931 testes**; `CI=true npx react-scripts build` **compilou** (exit 0).

## Fase 5 — revisão adversarial (um revisor fresco, sobre `65902725`)

**0 críticos; 1 correção menor; 2 lacunas de teste**, cada lacuna provada por uma sabotagem que passava **verde**. Uma rodada de correção.

| # | Achado | Sabotagem / sintoma | Conserto | Controle |
|---|---|---|---|---|
| 1 [IMPORTANTE, teste] | o filtro de material da régua agrupada não era testado | `WHERE ir.material_id = ?` → `WHERE (ir.material_id = ? OR 1)` em `parteGuardadaDeOutrasPorPar` (`requisitionService.js:119`; a de `:1858` fica) → `saldosSobraDeOutras` 14/14 | `dfffe96b`: cenário *[RN-201.03 outro material]* — A e B sem controle de lote em XB-01 (o par `(XB-01, NULL)` é o mesmo para os dois); R1 separa 4 de A; a linha de B diz `[5, 0, 5]`, e a equivalência por par compara A e B; o ajudante `material()` ganhou `{ lote }` (padrão 1) | sabotagem (perl na linha 119, md5 `8e80e60d` antes) → cai só o cenário novo (B mostra 7; 14/15); restaurado por `git checkout --` (produção commitada), md5 igual; arquivo **15/15** |
| 2 [MENOR, correção] | na separação, com só a própria requisição no par (outras = 0), o rótulo mostrava o físico *"XB-01 — lote L1 (6)"* enquanto a recusa física usa físico − `jaPedido` (*"O saldo em XB-01 (5) não cobre …"*); com 0,000001 de outras pulava para *"sobra 4.999999 …"* | — | `ab1d6246` (**B1349**): `rotuloOrigem` mostra a sobra quando `propriaNoPar > 1e-9`, mesmo sem outras — frase congelada *"XB-01 — lote L1 (sobra 5 de 6; 1 desta)"*; com os dois, *"(sobra 1 de 6; 4 para outras, 1 desta)"* (igual a antes); sem outras e sem própria, igual a hoje; a entrega não passa `propriaNoPar` (intocada). Descartado: *"0 para outras, 1 desta"* | dois testes no `RequisicoesSaiDeSobra` (outras 0 → a frase nova; outras 0,000001 → não pula); o `rotuloOrigem` de antes (`git show HEAD:`, md5 `1df2decc`) → cai o primeiro; restaurado por cópia, md5 `f210b4b9`; as 19 suítes `Requisicoes*` **355/355** |
| 3 [MENOR, teste da tela] | `propriaNoPar` só testado no caso trivial (parte = caixa = 1) | `pendentePlanejado` → `pendenteSeparado` em `propriaNoPar` (`RequisicoesList.js:~285`), ou sem o filtro `Number(i.material_id) === Number(materialId)` → verde | `298a3d72`: XB-01 sem lote, 10 com 4 de outras (sobra 6); item 1 com caixa 5 e parte 1 no par; item 2 do mesmo material com 2; item 3 de **outro** material também planejado em XB-01 → os dois selects do material dizem *"XB-01 (sobra 3 de 10; 4 para outras, 3 desta)"* — a sobra da C1 (6 − 3) | Edit e Edit inverso: `pendenteSeparado` → cai (7 desta); sem o filtro → cai (4 desta), cada um lido pela linha `● … › …`; md5 `f210b4b9` igual no fim; arquivo **12/12** |

Commits: `dfffe96b` (item 1, só teste), `ab1d6246` (item 2, tela + teste), `298a3d72` (item 3, só teste).

## Placar final

- `saldosSobraDeOutras.api.test.js` **15/15** (11 da T2 + 3 da T4 + 1 da Fase 5); `RequisicoesSaiDeSobra.test.js` **12/12** (9 da T3 + 3 da Fase 5).
- Serial, sobre `298a3d72` (depois da Fase 5): `test:api` **588/588 arquivos**; Jest da tela inteira **213/213 suítes, 2934/2934 testes**;
  `CI=true npx react-scripts build` **compilou** (exit 0); `test:validation` **4/0**; `test:safealter` **3/0**; `test:sqlite` **16/0**.
- `test:almoxarifado` **44/0** sobre `b3727231` (Execução; a Fase 5 não mexeu no serviço do almoxarifado — só teste e o rótulo da tela).

## Retro (4 números)

- **Rodadas de correção até verde:** 1 (a Fase 5).
- **Achados reais da Fase 5:** 1 correção menor (o rótulo com só a própria, B1349) + 2 lacunas de teste; 0 críticos.
- **Paralelismo:** nenhum (o executor fez T2 e T3 em série, embora o plano permitisse T2 ∥ T3).
- **Defeito que escapou da 200:** nenhum conhecido.

## Próxima tarefa detalhada

**Item 3 do 2º pacote** (`docs/estimativas/2026-11/estimativa_2026-11-05_almoxarifado-proximas-2.txt`, **2h30**): **"Movimentação por
integração respeita o lote informado"** — o **C458** (`docs/almoxarifado-novidades-por-etapa.md`, da revisão adversarial da 191; reproduzido
no plano da 191, `:495`). Medido no fechamento da 201 (sobre `298a3d72`):

- **A rota antiga:** `POST /api/almoxarifado/movimentacoes` (`server/routes/almoxarifado.js:1387-1416`), só `requirePermission('movimentar')`
  (o login e o acesso ao módulo vêm do prefixo, `:327-330`). Desestrutura **só** `material_id, tipo, quantidade, motivo, referencia,
  observacoes` (`:1388`) e chama `stockService.registrarMovimentacao(db, req.user, { …, justificativa: motivo || null }, { exigeLote: true,
  exigeSerie: true })` (`:1407-1410`). Tipos: `ENTRADA`, `SAIDA`, `AJUSTE`, `DEVOLUCAO` (`:1390`); motivo obrigatório em `SAIDA`/`AJUSTE`
  (`:1393`). Resposta 201 própria (`id, material_id, tipo, quantidade, saldo_anterior, saldo_posterior, motivo, referencia, observacoes`);
  erro `res.status(e.status || 500).json({ error })` (não usa `handleError`). **`lote`/`lote_id` do corpo são descartados** — o motor nunca
  vê o lote: material **com** `controle_lote` é recusado (`exigeLote`: *"O material ⟨cod⟩ exige lote nesta movimentacao (controle por lote
  ligado)"*, `stockService.js:1352-1357`); material **sem** controle sai **sem lote** mesmo citando um lote vencido (o C458: físico 5 → 4, o
  lote fica 5, a linha sem lote −1).
- **O motor já sabe:** `registrarMovimentacao` (`stockService.js:1104`, com a trava por material) aceita `lote_id` (número) ou `lote`
  (código) (`:1260` em diante; código inexistente numa saída → *"Lote nao encontrado para este material: ⟨L⟩"*, `:1295`); na saída com lote,
  lote não `ATIVO` → *"Lote ⟨L⟩ esta ⟨status⟩ e nao pode ser utilizado"*, e vencido sem liberação → *"Lote ⟨L⟩ vencido em ⟨data⟩ nao pode sair
  para consumo. Libere o vencimento do lote (PUT /api/almoxarifado/lotes/:id/liberar-vencimento) com justificativa, ou baixe por SUCATA/PERDA ou
  corrija por AJUSTE."* (`:1547-1582`; `SUCATA`/`PERDA`/`AJUSTE_NEGATIVO`/… isentos do vencido). Nada a mudar no motor.
- **A rota nova a imitar:** `POST /movimentacoes/v2` (`server/routes/almoxarifado/extended.js:853-867`): `auth`, `requirePermission('movimentar')`,
  `validate(MovimentacaoSchema)` (`services/almoxarifado/schemas.js:87`; `lote: z.string().optional()` `:104`, `lote_id:
  z.number().int().positive().optional()` `:107` — sem declarar, o zod descarta a chave) e repassa `req.body` inteiro com as mesmas opções. As
  recusas de lote vencido, lote inexistente e "exige lote" vêm todas do motor — a v1 ganha as mesmas só repassando `lote`/`lote_id`.
- **Quem chama a v1:** no `client/`, **só** `MateriaisAlmoxarifado.js:154` (o modal rápido de Entrada/Saída da tela **Materiais**), com
  `material_id, tipo, quantidade, motivo, referencia` — **sem lote**: a tela não muda. No servidor nenhum serviço chama a rota; não há chave de
  API nem porta de integração própria no repositório — "integração" é quem chama com o token de um usuário (o C458: "só quem chama a
  integração direto"). Testes que usam a v1: **22** arquivos em `server/tests/api/`; só `loteControleObrigatorio.api.test.js:97` fala de lote
  (a recusa do material com controle e sem lote — tem de continuar).
- **Contrato a congelar (proposta):** a v1 repassa `lote` (string) e `lote_id` (inteiro positivo) ao motor, com a forma validada como na v2
  (decidir entre o `MovimentacaoSchema` inteiro — mudaria as recusas de outros campos — ou validar só os dois); resposta 201 igual
  (acrescentar `lote_id`/`lote_codigo` é opcional — nenhum leitor hoje). Sem lote no corpo: **tudo igual** (o modal da tela).
- **Pontos de atenção:** (1) entrada com `lote` de código novo **cria** o lote (`criarOuObterLote`) — na v1 isso passaria a valer também;
  decidir se a v1 cria lote ou só cita lote existente. (2) A validade do lote na entrada (`data_validade`, Etapa 190) — a v1 não carrega; fora
  ou junto? (3) O material com controle de lote passa a poder movimentar pela v1 citando o lote — o comentário de `:1398-1403` ("o contrato v1
  nao carrega lote") precisa ser reescrito. (4) Testes: saída pela v1 citando lote vencido em material sem controle → 400 com a literal do
  motor e nada gravado (físico, lote e linha sem lote iguais); lote válido → sai do lote (a linha sem lote não fica negativa); `lote_id` de
  outro material → a recusa do motor; sem lote → igual a hoje (os 22 arquivos verdes). Fatia visível: nenhuma na tela (o modal não manda
  lote) — a mudança aparece como recusa para integrações; avaliar mostrar no relatório *Saldo por lote* / **Lotes e Séries** que a linha
  *"Sem lote atribuído"* não fica mais negativa por esse caminho.
