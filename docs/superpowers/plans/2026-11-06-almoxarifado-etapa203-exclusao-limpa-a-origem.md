# Etapa 203 — A exclusão da requisição limpa o local separado dos itens

> Item 4 do 2º pacote (`docs/estimativas/2026-11/estimativa_2026-11-05_almoxarifado-proximas-2.txt`, **1h15**) — o **C467**. Ponto de
> partida: "Próxima tarefa detalhada" de `docs/superpowers/plans/2026-11-05-almoxarifado-etapa202-rota-antiga-respeita-o-lote.md` (`:301`
> em diante) — conferida, bate (a exclusão é `excluirSemTrava`, hoje em `requisitionService.js:2531`). Etapa pequena: escala reduzida da
> `desenvolver-etapa` (sem agente de Fase 2; revisão "passaria com a feature quebrada?" feita pelo executor).

## Objetivo (em linguagem simples)

O administrador exclui uma requisição que já tinha material separado na caixa. O estoque volta (o estorno das entregas já existia) e a
requisição some das listas. Mas cada item dela continuava com a anotação *"separado de XB-01, lote L1, 4 peças"*. Hoje nenhuma conta lê essa
anotação de requisição excluída (todas filtram "caixa viva"), então nada errado aparece — mas é um dado morto que engana quem ler a tabela
(ou uma conta nova que esqueça o filtro). Depois desta etapa, a exclusão apaga a anotação junto.

## Fase 0 — medido em 2026-11-06 (sobre `f3bb3200`)

### A exclusão

- Duas rotas, um serviço: `DELETE /api/almoxarifado/requisicoes/:id` (`routes/almoxarifado.js:5088-5110`) e `DELETE
  /api/requisicoes-material/:id` (`routes/requisicoesMaterial.js:460-468`) — as duas chamam `requisitionService.excluirRequisicao`
  (`requisitionService.js:2526-2529`) = `travaPorRequisicao.serializarNaRequisicao` → `comTravaDaRequisicao` (por material dos itens) →
  `excluirSemTrava` (`:2531`).
- `excluirSemTrava`: lê a requisição ativa (senão 404); valida **todas** as partes do estorno antes da primeira ENTRADA (tudo ou nada,
  Etapa 58; recusas de série 400); credita as ENTRADAs; relê o status; `UPDATE requisicoes_almoxarifado SET ativo=0, status='CANCELADO' …
  WHERE id=? AND COALESCE(ativo,1)=1` (`:2702-2707`). Perdeu (`changes = 0`): com estorno → 409 sem nova tentativa (B447/B452); sem estorno →
  404. Ganhou: libera as reservas (best-effort, `.catch` com `console.warn`, `:2726-2731`) e devolve `{ success, estornos,
  reservas_liberadas }`.
- **Nenhum passo toca `itens_requisicao_almoxarifado`.** A caixa (`quantidade_separada − entregue`) e as três colunas da origem planejada
  ficam: `origem_separacao_id`, `lote_separacao_id`, `quantidade_origem_separacao` (`schema.js:2894-2898`).

### Quem lê as três colunas (todos filtram a requisição viva)

| Leitor | Onde | Filtro |
|---|---|---|
| parte guardada de outras (separação 198, C1) | `requisitionService.js:94-104` (`parteGuardadaDeOutras`) | `caixaVivaSql` |
| parte guardada por par (Sai de 200/201) | `:113-122` | `caixaVivaSql` |
| automático da entrega (197) / sugestão | `:423-431` | `caixaVivaSql` |
| parte guardada por lote (191/197) | `:1855-1858` | `caixaVivaSql` |
| fila de separação (rótulo "separado de") | `:1040-1060` | `COALESCE(r.ativo,1)=1 AND status IN statusFila` |
| detalhe da requisição | `routes/almoxarifado.js:3956` | `COALESCE(ativo,1)=1` (excluída → 404) |
| itens separados pendentes do lote | `lotService.js:462-470` | `STATUS_COM_CAIXA` (CANCELADO fora) |
| separação/entrega/devolver-separado da própria | `:1460`, `:1523`, `:1568`, `:2046-2096`, `:2455-2467`, `:2837-2855` | só rodam em requisição ativa (status conferido) |

`caixaVivaSql` (`:82-87`) = `COALESCE(r.ativo,1)=1 AND r.status IN STATUS_COM_CAIXA` — a excluída (ativo 0, CANCELADO) já sai por duas
condições. **Nenhuma conta muda** com a limpeza.

### Quem já limpa a origem

- A entrega, quando a caixa do item zera (`:2465-2467`); o **devolver à prateleira** (Etapa 98), quando a caixa zera (`:2854-2856`).
- **O cancelamento NÃO limpa** (`routes/almoxarifado.js:5052`, `routes/requisicoesMaterial.js:424`): grava `CANCELADO` sem tocar os itens.
  Mas a rota de cancelar **recusa requisição com caixa** (M1, provado por `separacaoSeparadoDeOutras` *"[RN-198.03 cancelada, controle]"*),
  então uma cancelada nova não tem caixa com origem; a "cancelada legada com caixa" só existe por SQL ou dado antigo e é filtrada por status.
  O brief desta etapa supunha "o cancelamento já limpa ao devolver" — **não limpa**; quem limpa ao devolver é o devolver-separado. Fica fora
  (C476).

### Testes que montam a excluída **pela rota** e dependem da origem gravada

| Arquivo | Teste | O que faz hoje |
|---|---|---|
| `separacaoSeparadoDeOutras` | `[RN-198.03 excluida, C467]` (`:209`) | asserta `origem_separacao_id = XB-01` (*"premissa C467: a exclusao nao limpa a origem"*) e prova o filtro |
| `entregaSaiDeRespeitaSeparado` | `[RN-200.05 excluida]` (`:234`) | asserta a origem (*"premissa C467: a origem fica"*) e prova o filtro |
| `entregaAutomaticaPeloLote` | `[Fase 5 M3]` (`:479`) | asserta `it.o` (origem) e prova o filtro do automático |
| `saldosSobraDeOutras` | `[RN-201.03 excluida]` (`:154`) | não asserta a origem; com a limpeza, o 0 viria da origem nula, não do filtro |

Depois da etapa as três primeiras **quebram na premissa**, e as quatro deixam de provar o filtro (o 200/0 viria da origem vazia). Cada uma
vira **duas**: (i) pela rota, assertando a origem **limpa** e o mesmo resultado; (ii) **por SQL** (`ativo = 0, status = 'CANCELADO'` com
a origem gravada — o dado legado de antes da 203), provando o filtro como antes.

As outras exclusões na suíte (`entregaAutomaticaPeloLoteIntegracao`, `origemSeparacaoEmDuasVezesIntegracao`, `portasAvulsasCaixaIntegracao`,
`requisicaoGestosConcorrentes*`) excluem requisição **entregue** (caixa 0) ou conferem só estoque/livro — não leem a origem.

## Decisões (letra B — reversíveis; números livres depois de B1357)

- **B1358 — onde limpar:** um `UPDATE itens_requisicao_almoxarifado SET origem_separacao_id = NULL, lote_separacao_id = NULL,
  quantidade_origem_separacao = NULL WHERE requisicao_id = ? AND (origem_separacao_id IS NOT NULL OR lote_separacao_id IS NOT NULL OR
  quantidade_origem_separacao IS NOT NULL)` **logo depois** do `UPDATE … ativo=0` que **venceu**, dentro das duas travas (a seção já
  existe), antes de liberar as reservas. "No mesmo UPDATE" não dá: é outra tabela. **Descartados:** limpar antes do estorno (se uma ENTRADA
  recusar, a requisição fica viva e sem o plano da caixa — a próxima entrega sairia do automático); limpar dentro do ramo "perdeu" (quem
  excluiu por fora já limpou, ou a requisição está viva).
- **B1359 — falha na limpeza é best-effort:** erro no `UPDATE` dos itens → `console.warn` e a exclusão responde 200 como antes. Nada
  tenta de novo e nada lança: a requisição já está excluída e o estoque estornado (B447/B452 — refazer estornaria de novo); e nenhuma conta
  lê a origem de excluída. Mesmo molde da liberação de reservas (`:2726-2731`). **Descartado:** lançar 500 (o usuário clicaria de novo e
  receberia 404, com a exclusão feita).
- **B1360 — só as três colunas:** a caixa (`quantidade_separada`, `quantidade_entregue`) e o histórico das rodadas
  (`separacoes_requisicao_almoxarifado.itens_json`, com a origem de cada rodada) ficam — o que foi separado de onde continua no histórico.
  **Descartado:** zerar a caixa (o separado da excluída aparece no histórico e nos relatórios de requisição; mudaria leitura sem pedido).
- **B1361 — sem migração:** requisições excluídas **antes** da 203 continuam com a origem gravada; o filtro `caixaVivaSql` as protege
  (provado pelos testes por SQL). **Descartado:** um `UPDATE` de boot (mexe em dado de produção por higiene, sem efeito em conta).
- **B1362 — os testes do filtro passam a semear por SQL:** a excluída com origem gravada só existe agora como dado legado (B1361) — é ela
  que prova o filtro. Os de rota passam a assertar a origem limpa.

## Regras de negócio

- **RN-203.01** — Excluir pela rota do almoxarifado (`DELETE /api/almoxarifado/requisicoes/:id`) uma requisição com caixa separada de
  *XB-01*/L1 (4): 200; o item fica com `origem_separacao_id`, `lote_separacao_id` e `quantidade_origem_separacao` **NULL**;
  `quantidade_separada` continua 4; a rodada da separação continua com a origem no `itens_json`; o saldo de *XB-01*/L1 não muda (6).
- **RN-203.02** — O mesmo pela rota dos outros módulos (`DELETE /api/requisicoes-material/:id`).
- **RN-203.03** — Requisição com dois itens (um com origem, um no automático sem origem) e entrega parcial (separado 4 de *XB-01*, entregue
  1): 200, o estorno é o de antes (1 ENTRADA de 1), e o item com origem fica NULL nas três; a outra requisição com origem no mesmo par
  **não** é tocada.
- **RN-203.04** — Exclusão **recusada** não limpa: requisição com entrega de material com série cujo controle foi desligado depois → 400 (a
  literal de sempre); a origem do item que tem caixa continua gravada (tudo ou nada). E sem perfil (ALMOX) → 403, origem gravada.
- **RN-203.05** — Limpeza que falha (gancho no `db.run` que devolve erro para o `UPDATE` dos itens) → 200, a requisição excluída (ativo 0),
  o estorno feito uma vez, a origem continua gravada e nada tenta de novo (um único disparo do gancho).
- **RN-203.06** — Nenhuma conta muda: os quatro testes da tabela acima ganham a versão por SQL (excluída legada com a origem gravada → o
  mesmo resultado de antes) e a versão pela rota asserta a origem limpa; as suítes 196–202 verdes.

## Contrato

Nenhum endpoint muda: mesmas rotas, mesmos status, mesmas mensagens, mesma resposta (`{ success, estornos, reservas_liberadas }`). Só o
estado gravado dos itens da excluída.

## Tasks

- **T1 (tronco)** — `server/tests/api/exclusaoLimpaOrigem.api.test.js` (RN-203.01 a .05), vermelho; a limpeza em `excluirSemTrava`; verde.
- **T2 (tronco)** — os quatro testes da tabela: versão por SQL + a da rota assertando a limpeza (RN-203.06). Integração cruzando rotas: o
  RN-203.01 encadeia separar (rota do almoxarifado) → excluir (rota) → separar de novo o mesmo par por outra requisição (rota) → 200.
- **T3** — controles positivos, revisão "passaria com a feature quebrada?", suítes, fechamento.

## Pontos de atenção

- A limpeza fica **depois** do `UPDATE ativo=0` vencedor e **dentro** da seção — nunca antes do estorno.
- O `UPDATE` é por `requisicao_id` — não pode encostar em item de outra requisição (RN-203.03 confere).
- Os ganchos de `requisicaoGestosConcorrentes` casam SQL por regex; o `UPDATE` novo não pode casar com eles (conferir na suíte).

## Execução

(preenchido no fechamento)

## Próxima tarefa detalhada

(preenchida no fechamento)
