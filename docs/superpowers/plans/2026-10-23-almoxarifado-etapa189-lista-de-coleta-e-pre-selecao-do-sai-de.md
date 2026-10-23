# Etapa 189 — A janela de separação já abre com o endereço sugerido, e a fila imprime a lista de coleta

> **Status:** 📝 **plano escrito (2026-10-23, sobre `7e76acc6`). Fase 2 (revisão do plano) feita em 2026-10-23: 0 Crítico, 3 Importantes, 6 Menores — ver "Emendas da Fase 2" (aplicar antes de T1). Execução não começou.**
> Feature **05** (separação e picking). Continua a Etapa 188 (plano
> `docs/superpowers/plans/2026-10-22-almoxarifado-etapa188-sugestao-de-coleta-na-fila-de-separacao.md`: a "Próxima tarefa detalhada",
> a emenda **I1** da Fase 2 — "subir a pré-seleção a item 1 da 189, ela é o que torna a dica verdadeira" — e a **B1257**).
> **Pré-requisito:** a 188 **fechada** (Fase 5 + `fechar-etapa`). Outra sessão revisa a 188 em paralelo; a 189 mexe em
> `FilaSeparacao.js` e em `requisitionService.listarFilaSeparacao`, que a revisão da 188 pode corrigir. Não começar T1/T3 antes do
> commit de fechamento da 188 — e reler o contrato congelado da 188 ("Execução", T2) depois do fix-round dela.
> Tamanho: **M**.

## Objetivo (em linguagem simples)

Desde a Etapa 188 a Fila de separação diz **"Pegar em B-01 — lote L1 · 5 un — escolha este endereço no 'Sai de' ao separar"**. Mas
quando o almoxarife abre a janela de separação, o "Sai de" está em **"Qualquer endereço (automático)"**. Se ele vai à prateleira B-01,
pega as 5 peças e só clica "Confirmar", o sistema registra a saída **de outro lugar**: da prateleira padrão ou, se o material tem lote,
de uma linha **sem lote** (o automático nunca escolhe lote — B204). A prateleira fica com estoque no papel que não existe mais, e a outra
com estoque a menos. Foi o achado I1 da Fase 2 da 188.

Depois desta etapa:

1. **A janela de separação já abre com o endereço sugerido escolhido** no "Sai de" (quando ele cobre a quantidade). O almoxarife pode
   trocar. O que ele confirma vira a origem da separação, e a entrega sai dali sem perguntar nada — o papel bate com a prateleira.
2. **"Imprimir lista de coleta"**: um PDF com os endereços na ordem em que se anda pelo almoxarifado, com uma caixinha para marcar
   "peguei". Um por requisição, ou um de todas as que estão para separar.

Analogia: a 188 escreveu a lista do mercado na ordem dos corredores. A 189 (1) já deixa o produto certo no carrinho quando você chega
ao caixa — você só tira se trocou de marca — e (2) imprime a lista para levar no bolso.

## Fase 0 (medido em 2026-10-23, sobre `7e76acc6`)

**Onde o "Sai de" é escolhido hoje (a tela)** — tudo em `client/src/components/almoxarifado/RequisicoesList.js`:

| O quê | Onde | O que faz |
|---|---|---|
| Valor de uma opção | `:124` `valorOrigem` | `"<localizacao_id>:<lote_id ou vazio>"` — endereço e lote juntos. |
| Rótulo | `:125` `rotuloOrigem` | `"A-01 — lote L1 (6)"`. |
| Opções | `:126-127` `opcoesOrigem` | linhas de `GET /almoxarifado/estoque/:id/saldos` com endereço e quantidade > 0. **É a mesma fonte** dos pares da sugestão (linha de `estoque_saldo_almoxarifado` com endereço e saldo — 188, Fase 0). |
| Busca das opções | `:434-457` (efeito com `materiaisEntregaKey`, `saldosEntregaSeqRef`) | ao abrir a janela (`S:` separação, `E:` entrega) zera `origensSeparacao`/`origensEntrega` e busca os saldos de cada material. Resposta de abertura velha é descartada pela sequência. |
| Planejada na separação | `:459-476` (efeito) e `:176-188` `valorPlanejadaNaSeparacao` | **Etapa 65 (Fase 2, crítico 2):** item com planejada pendente parte da planejada — só se ela está nas opções **e cobre** a quantidade pré-preenchida (`maxSeparavelNaTela` com a opção). Senão `''` (automático, e o aviso de troca aparece). **Uma vez por abertura:** a chave presente em `origensSeparacao` (inclusive `''`) é escolha feita. |
| Item **sem** planejada | — | **Nenhum efeito o toca: abre em `''` = "Qualquer endereço (automático)".** É isto que a 189 muda. |
| Teto com origem | `:203-215` `maxSeparavelNaTela` | `min(separável dividido, quantidade da opção − o pendente do próprio item se é a planejada)`. Não desconta irmãos que escolheram o mesmo par (o servidor desconta, ver abaixo). |
| Divisão entre irmãos | `:238-249` `quantidadesIniciaisSeparacao`, `:252-254` `separandoOutrosDoMaterial` | a régua da Etapa 127 (B821), na ordem do pedido. |
| Troca na separação | `:170-175` `trocaNaSeparacao` | só existe com planejada pendente; vazio/outro par é troca. |
| Select | `:2306-2318` | `<select id="separacao-origem-<item>">`, primeira opção `""` "Qualquer endereço (automático)". |
| Aviso de troca | `:2321-2335` | `separacao-aviso-troca-<item>` + "Motivo da troca (opcional)". |
| Payload | `:762-790` `handleSeparacao` | manda `localizacao_origem_id` (+ `lote_id` se a opção tem lote) **só quando há escolha**; `PUT /almoxarifado/requisicoes/:id/separacao`. 409 (e 403 `AGUARDANDO_APROVACAO_VALOR`) fecham a janela e recarregam; **400 mantém a janela aberta** (`:802-813`). |
| Separar e entregar | `:344`, `:792-796` | `entregaAposSeparar`: depois de separar, abre a entrega com o detalhe recarregado. |
| Entrega com planejada | `:513-552` (efeito) | **Etapa 59:** item com planejada pendente abre com a planejada escolhida se está nas opções e a quantidade não passa do pendente; fora das opções → `automatico: true` (manda `origem_automatica`, registra troca). Item **sem** planejada abre em automático sem chave. |
| Payload da entrega | `:816-852` `montarItensEntrega` | chaves só com escolha; `origem_automatica` só em item com planejada. |

**De onde vem a janela:** a fila abre a requisição por `navigate('/almoxarifado/requisicoes?id=<id>')` (`FilaSeparacao.js:277`). A
janela usa o **detalhe** (`GET /api/almoxarifado/requisicoes/:id`, `server/routes/almoxarifado.js:3836-3920`), que **não** traz
`pegar_em` e não tem gate de perfil (só o do módulo). A janela não lê a fila. **Logo, a pré-seleção precisa de um dado novo do
servidor** (contrato abaixo).

**O que o servidor faz com a origem escolhida** — `server/services/almoxarifado/requisitionService.js`:

- `checarOrigemItem` (`:1137-1180`): endereço existe e não bloqueado (`validarEnderecoExplicito`, `validarLocalizacaoParaMovimento`),
  lote do material, `ATIVO`, vencido só liberado, e o saldo do par cobre a rodada **somada ao que irmãos do mesmo material pedem do
  mesmo par na mesma rodada** (`pedidoPorOrigem`, `:1167-1170`) **e ao separado pendente desta requisição** no par (semeado antes).
  **Estrita:** não cobre → **400** `"<material_nome>: O saldo em <cód> (<n>) não cobre a quantidade (<q>) — a saída tiraria de outros
  endereços"` (prefixo na `:1404-1406`). Nada é gravado (passada 1).
- Planejada (`:1366-1419`): rodada com par num item **sem** separado pendente → o par vira `origem_separacao_id`/`lote_separacao_id`
  (lote sem endereço não vira planejada). Rodada com **outro** par (ou automática) sobre separado pendente → planejada **nula** e uma
  linha em `substituicoes_origem_requisicao` com `momento = 'SEPARACAO'` (`:1500-1520`). Isto é a "substituição falsa" que a pré-seleção
  não pode provocar.
- Entrega (`:1777-1822`): sem escolha, com planejada e separado pendente → **sai da planejada, estrita** (`planejada = true`, `:1784`);
  acima do pendente a baixa se divide (Etapa 63). Escolha de outro par ou `origem_automatica` → substituição `momento = 'ENTREGA'`
  (`:1806-1820`, `:2094`). Entregue todo o separado, a planejada é limpa (`:2102-2106`).

**Pré-seleção velha (o que acontece hoje com uma escolha manual que ficou velha — é o mesmo caminho):**

- O par **sumiu das opções** (saldo foi a 0 entre a fila e a janela): não há opção para escolher; fica automático.
- O par está nas opções mas **perdeu saldo** entre abrir a janela e confirmar: 400 com a literal de `checarOrigemItem`; a janela fica
  aberta, nada gravado; o almoxarife troca para outra opção ou automático e confirma de novo. Nenhuma trava (CLAUDE.md: exibir/pré-escolher
  não reserva nem limita o que outra porta lê para reservar — a separação relê tudo sob `comTravaDaRequisicao`).
- O par perdeu saldo **depois** de separar e antes de entregar: a janela de entrega não acha a planejada nas opções → `automatico: true`
  e a troca é registrada (Etapa 59/63 — honesto); a entrega de um clique sem janela sai da planejada estrita e recusa com a literal da
  `:1796`. É o comportamento de hoje para quem escolheu à mão; a 189 só faz mais gente cair nele (B1262).

**A sugestão (servidor, Etapa 188):** `listarFilaSeparacao(db, user)` (`requisitionService.js:929-1048`), `lerDadosDaColeta`
(`:310-350`, 4–5 consultas por chamada), `sugestaoDeColeta.sugerirColeta` (`server/services/almoxarifado/sugestaoDeColeta.js`). Por
requisição, a regra só depende das linhas daquela requisição (`doReq`) e dos dados globais (saldos, planejado de **todas** as
requisições, árvore) — filtrar a consulta de requisições por id **não muda** o resultado daquela requisição. Item com planejada
pendente: `pegar_em` é **só** a planejada (C1 da 188), nunca outro par. Alçada de valor barrando: `pegar_em: null`, `ordem_coleta: []`
(M4). Rota: `app.get('/api/almoxarifado/fila-separacao', requireSepararEmitir, …)` (`server/routes/almoxarifado.js:4546-4550`).

**A fila na tela:** `FilaSeparacao.js` — `textoPegarEm` (`:93-103`, termina em `" — escolha este endereço no 'Sai de' ao separar"`),
`textoAvisoPegarEm` (`:105-120`), a linha (`:212-232`), "Ordem de coleta" (`:236-246`, só com ≥ 2 paradas), botão "Abrir" (`:200`),
"Atualizar" (`:290`). `ordem_coleta[]` traz `item_id, material_codigo, localizacao_id, localizacao_codigo, caminho, lote_codigo,
quantidade_sugerida` — **sem** `material_nome`, `unidade` e `lote_validade`; esses vêm de `itens[]` pelo `item_id`.

**PDF:** `client/src/utils/pdfTexto.js` (Etapa 186): `linhasPorLargura`, `utilDasColunas`, `prepararCelulas` (coluna numérica não
quebra, encolhe a fonte), `desenharCelulasComFonte`, `desenharQuebrado`, `formatarQuantidade`, `MARGEM_DIREITA = 196`. Molde do
gerador: `client/src/utils/posicaoClientePdf.js` (descritor puro `montar…` + `gerar…` que desenha; `desenharTabela` com cabeçalho
repetido depois de `addPage`, linha não partida entre páginas, `limite` 275). Molde do teste com **jsPDF real**:
`client/src/utils/posicaoClientePdf.test.js:13-35` (mock de `jspdf` que grava toda chamada e mede com o real) e `:130-175`
(`textosGravados`, `textosForaDaFolha` com `MARGEM = 196`, `FUNDO = 287`). RN-186.11: a produção **não** chama `getTextWidth` nem
`setFont`. `jspdf ^2.5.2` já é dependência do client.

**Testes de tela que vão sentir a mudança:** dez `client/src/components/almoxarifado/Requisicoes*.test.js` que abrem a janela de
separação/entrega. O mock deles (`RequisicoesSeparacaoOrigem.test.js:92-101`) devolve `{ data: [] }` para URL desconhecida — a leitura
da sugestão tem de tratar resposta que não é objeto com `itens` como "sem sugestão" (nenhum desses testes muda). Só
`RequisicoesList.test.js` usa `toHaveBeenCalledTimes`, e não em `api.get`.

**Busca por pré-seleção que já existisse:** `grep -n "sugest\|pegar_em\|preSel\|pre-sel" RequisicoesList.js` → zero (controle: o mesmo
grep em `FilaSeparacao.js` acha `pegar_em`). `grep -rn "lista de coleta\|listaColeta" client/src server` → zero (controle: o grep acha
"Ordem de coleta" em `FilaSeparacao.js` com `-i "de coleta"`).

### Divergências e achados da Fase 0

1. **A janela não tem de onde tirar a sugestão.** O "Próxima tarefa detalhada" da 188 oferecia duas saídas: campo novo no detalhe, ou
   "mostrar a dica sem pré-selecionar". A segunda não resolve o I1 (quem segue a dica e confirma no automático continua desalinhando o
   livro). Escolhida uma **rota nova só de leitura, com o gate da fila** (B1260).
2. **`maxSeparavelNaTela` não desconta irmãos que escolheram o mesmo par**, e `checarOrigemItem` desconta. Com dois itens do mesmo
   material, a tela poderia pré-selecionar o mesmo par para os dois e o servidor recusar o segundo. A sugestão do servidor já desconta
   irmãos (RN-188.03), então isso só acontece se a quantidade da janela for maior que a da fila; mesmo assim, a pré-seleção confere a soma
   (RN-189.04).
3. **A frase da fila "escolha este endereço no 'Sai de'" fica falsa** quando a janela já escolhe. Muda (RN-189.09).

## Regras

| ID | Regra | Cenário |
|---|---|---|
| **RN-189.01** | `GET /requisicoes/:id/sugestao-coleta` devolve, para a requisição, **exatamente** o que a fila devolve para ela: por item da fila, `separavel`, `pegar_em` e `pegar_em_aviso`; e a `ordem_coleta`. Requisição ativa que não está na fila (sem etapa) → 200 com `itens: []` e `ordem_coleta: []`. Só leitura (RN-188.07 vale aqui também). | A fila mostra o item 31 com `pegar_em` ZB-01/L1 5 → a rota nova mostra o mesmo objeto, campo a campo. Requisição ENTREGUE → `itens: []`. |
| **RN-189.02** | Ao abrir a janela de separação, item **sem planejada pendente** (`temPlanejada` falso) e com `maxQtdSeparacao > 0` parte do par sugerido no "Sai de" quando, **ao mesmo tempo**: a sugestão do item chegou com `pegar_em` não nulo, `cobre: true` e `pegar_em_aviso: null`; o par está nas opções do "Sai de" (`valorOrigem` = `"<localizacao_id>:<lote_id ou vazio>"`); e cobre a quantidade pré-preenchida (RN-189.04). | Fila: B-01/L1 cobre 5 → a janela abre com "B-01 — lote L1 (6)" escolhido e quantidade 5. |
| **RN-189.03** | **A pré-seleção nunca toca item com planejada pendente** — ele segue a Etapa 65 (`valorPlanejadaNaSeparacao`), mesmo que a sugestão aponte outro par. A tela não confia que o servidor respeita a C1 da 188. | Item com 3 separados de ZA-01 e sugestão (adulterada no mock) ZP-01 cobrindo → o "Sai de" fica na regra da 65 (ZA-01 se cobre; senão automático com aviso de troca); nunca ZP-01. |
| **RN-189.04** | O par cobre quando `maxSeparavelNaTela(item, valor, opções, outros)` ≥ quantidade pré-preenchida do item **e** a quantidade da opção ≥ a soma das quantidades pré-preenchidas de todos os itens do mesmo material pré-selecionados no mesmo par nesta abertura (a régua `pedidoPorOrigem` do servidor). Não cobre → automático. | Dois itens do mesmo material, 4 e 4, ambos sugeridos A-01 (mock) com A-01 = 6 → o primeiro pré-seleciona A-01, o segundo fica automático. |
| **RN-189.05** | **A escolha do almoxarife vence, e a pré-seleção é uma vez por abertura.** Chave presente em `origensSeparacao` (inclusive `''`) não é sobrescrita; a sugestão que chega depois de ele mexer no select não muda nada. Fechar e abrir de novo pré-seleciona de novo (busca nova). Mudar a quantidade depois **não** desfaz a pré-seleção (a recusa, se houver, é a do servidor, RN-189.07). | Abre a janela, troca para "Qualquer endereço" antes de a sugestão chegar → continua automático. |
| **RN-189.06** | **Sem sugestão, fica como hoje (automático), sem erro:** a busca falhou (rede, 403, 404, 500), a resposta não tem `itens` em array, o item não está na resposta, `pegar_em` nulo, `cobre: false`, aviso não nulo, par fora das opções ou não cobre (RN-189.04). Falha **aberto**: nada bloqueia a separação. | O mock devolve `{ data: [] }` → nenhum item pré-selecionado e todos os testes de separação de hoje continuam verdes sem mudança. |
| **RN-189.07** | **Pré-seleção velha: o servidor decide.** O par perdeu saldo entre abrir e confirmar → 400 com a literal de sempre (`"<material>: O saldo em <cód> (<n>) não cobre a quantidade (<q>) — a saída tiraria de outros endereços"`), a janela continua aberta, nada é gravado; trocar para outra opção ou automático e confirmar → 200. A pré-seleção não pega trava nem reserva. | T4, cenário "dica velha pela janela". |
| **RN-189.08** | **Separar do par pré-selecionado e entregar não gera substituição.** A rodada grava o par como planejada; a janela de entrega abre com a planejada escolhida (Etapa 59) e a entrega sai dela; `substituicoes_origem_requisicao` sem linha nova; o saldo baixa **do par** (endereço e lote), não da padrão nem de linha sem lote. | Material com lote, L1 6 em ZB-01, L2 9 na padrão ZP-01: separar 5 pela janela (pré-selecionada ZB-01/L1) e entregar → ZB-01/L1 fica 1, ZP-01/L2 fica 9, **nenhuma** linha sem lote negativa, 0 substituições. Antes da 189 (automático) ficava L1 6, L2 9 e −5 sem lote (sonda `f2r188-sonda2`). |
| **RN-189.09** | A janela mostra, abaixo do "Sai de" do item pré-selecionado, **"Sugerido pela fila de separação. Se pegou de outro endereço, troque aqui."** (`separacao-sugestao-<item>`). Item com `pegar_em` que **não** foi pré-selecionado (`cobre: false`, fora das opções, não cobre a quantidade) mostra **"Sugestão da fila: ⟨localizacao_codigo⟩[ — lote ⟨lote_codigo⟩] · ⟨quantidade_sugerida⟩[ ⟨unidade⟩] — não veio escolhida porque não cobre a quantidade desta separação."** (mesmo testid). Item com planejada pendente: nenhuma das duas (a 65 já fala). Na fila, `textoPegarEm` passa a terminar em **" — já vem escolhido no 'Sai de' ao separar"** com `cobre: true` e mantém **" — escolha este endereço no 'Sai de' ao separar"** com `cobre: false`. | Ver T2 e T3. |
| **RN-189.10** | **Lista de coleta por requisição.** Botão **"Imprimir lista de coleta"** (`fila-imprimir-<req>`) em cada requisição da fila com `ordem_coleta.length > 0` ou com algum item com `pegar_em_aviso` não nulo. O PDF tem: título **"Lista de coleta — ⟨numero⟩"**, a linha **"Fila carregada em DD/MM/AAAA HH:MM — a sugestão vale para esse momento; recarregue a fila antes de imprimir de novo."**, solicitante/setor e urgência; a tabela **na ordem de `ordem_coleta`** com as colunas **Nº · Endereço · Material · Lote · Qtd · ☐**, onde Endereço = `localizacao_codigo` + (` (caminho)` se o caminho tem mais de um segmento), Material = `material_codigo — material_nome`, Lote = `lote_codigo` + (` vence DD/MM/AAAA`) ou `—`, Qtd = `formatarQuantidade(quantidade_sugerida)` + ` unidade`, ☐ = um quadrado vazio desenhado (`rect`). Item com `pegar_em` **e** aviso: a frase do aviso (a da tela, `textoAvisoPegarEm`) numa linha inteira logo abaixo da parada, fonte 8. Itens **sem** `pegar_em` com aviso não nulo: bloco **"Sem endereço sugerido"** no fim, uma linha por item (`material_codigo — material_nome · a separar ⟨q⟩`) + a frase do aviso. Itens sem `pegar_em` e sem aviso (separável 0, alçada M4) não aparecem. | Requisição com paradas ZA-01 (2 itens) e ZB-01 e um item na quarentena → 3 linhas na ordem ZA-01, ZA-01, ZB-01; bloco "Sem endereço sugerido" com 1 item e a frase de `SEM_ENDERECO_SUGERIVEL`. |
| **RN-189.11** | **Lista de coleta da fila.** Botão **"Imprimir lista de coleta (todas)"** (`fila-imprimir-todas`) no cabeçalho: um PDF com uma **seção por requisição**, só as que têm a etapa `SEPARAR` e passariam na RN-189.10, **na ordem da fila** (a do servidor). Cada seção começa com o cabeçalho da requisição (número, solicitante, urgência) e a numeração das paradas recomeça em 1. Nenhuma requisição assim → botão desabilitado. As requisições **não** são intercaladas por endereço. | Fila com R1 (SEPARAR, 2 paradas), R2 (só ENTREGAR), R3 (SEPARAR, 1 parada) → seções R1 e R3, nessa ordem; R2 fora. |
| **RN-189.12** | **O papel cabe na folha (régua da Etapa 186).** A4 retrato, mm, margem esquerda 14: nenhum `text` termina depois de **x = 196** nem fica abaixo de **y = 287**, o quadrado ☐ também; célula de texto longa **quebra** dentro da coluna (`prepararCelulas`), nenhuma letra perdida; a coluna Qtd **não** quebra (numérica: encolhe a fonte); a parada não é partida entre páginas; o cabeçalho da tabela é repetido depois de todo `addPage`; o cabeçalho de uma seção (RN-189.11) nunca fica sozinho no pé da página (só começa se cabe ele + a primeira parada). A produção não chama `getTextWidth` nem `setFont` (RN-186.11). | Caminho de 120 letras e nome de 100: quebram, nada passa de 196. 80 paradas: 3+ páginas, cabeçalho repetido, nenhuma parada partida. Qtd `9999999999.9999`: um `text` só, dentro da coluna. |
| **RN-189.13** | **O PDF é só da tela.** Gerado no navegador com o JSON da fila **já carregado** (nenhuma chamada nova ao servidor, nenhum campo novo). O nome do arquivo é `lista-coleta-<numero>.pdf` (por requisição; `numero` com `\W+` → `-`) e `lista-coleta-fila-<AAAA-MM-DD>.pdf` (todas, dia local). | Clicar "Imprimir" não faz `api.get`. |

## Contrato (congelado)

### Novo: `GET /api/almoxarifado/requisicoes/:id/sugestao-coleta`

- **Gate:** `requirePermission('separar_emitir')` — o mesmo da fila e da separação (`requireSepararEmitir`, `server/routes/almoxarifado.js:4544`).
  Sem a ação → **403** `{ "error": "Sem permissão para esta operação", "acao": "separar_emitir", "perfil": "<perfil>" }` (a literal do
  `requirePermission`, `services/almoxarifado/permissions.js:292`).
- **404** `{ "error": "Requisição não encontrada" }` — id inexistente, inativa (`COALESCE(ativo,1) = 0`) ou não numérico (a mesma literal
  do detalhe, `routes/almoxarifado.js:3843`).
- **500** `{ "error": "<mensagem>" }`.
- **200:**

```json
{
  "requisicao_id": 55,
  "itens": [
    { "item_id": 31, "separavel": 5,
      "pegar_em": { "localizacao_id": 12, "localizacao_codigo": "B-01", "caminho": "ALM1 / B-01", "lote_id": 7, "lote_codigo": "L1",
                    "lote_validade": "2026-11-10", "quantidade_no_endereco": 6, "quantidade_sugerida": 5, "cobre": true },
      "pegar_em_aviso": null }
  ],
  "ordem_coleta": [
    { "item_id": 31, "material_codigo": "MAT-9", "localizacao_id": 12, "localizacao_codigo": "B-01", "caminho": "ALM1 / B-01",
      "lote_codigo": "L1", "quantidade_sugerida": 5 }
  ]
}
```

- `itens`: os mesmos itens (e na mesma ordem — a do pedido, B821) que o elemento da fila desta requisição traz em `itens[]`, reduzidos a
  `item_id`, `separavel`, `pegar_em`, `pegar_em_aviso` — os objetos `pegar_em` **idênticos** aos da fila (o contrato congelado da 188).
  `ordem_coleta`: idêntica à da fila. Requisição fora da fila: `itens: []`, `ordem_coleta: []`.
- Sem trava, sem escrita, nenhuma mensagem de recusa nova.
- **Serviço:** `requisitionService.sugestaoDeColetaDaRequisicao(db, user, requisicaoId)` → confere a requisição (404 com `status: 404`),
  chama `listarFilaSeparacao(db, user, { requisicaoId })` e devolve o recorte. `listarFilaSeparacao` ganha o **terceiro parâmetro
  opcional** `{ requisicaoId }` que só acrescenta `AND r.id = ?` à consulta de requisições (`:931-934`); a consulta de itens, o
  `ORDER BY ir.requisicao_id, ir.id` (B821), `dividirSeparavel` e `lerDadosDaColeta` ficam **byte a byte**. Sem o parâmetro, a fila é a
  de hoje.

### Sem mudança

`GET /fila-separacao`, `GET /requisicoes/:id`, `PUT /requisicoes/:id/separacao` e a entrega: **nenhuma** mudança de payload, resposta ou
mensagem. O PDF não consome nada novo.

### Frases literais da tela (congeladas)

- Janela, pré-selecionado: **`Sugerido pela fila de separação. Se pegou de outro endereço, troque aqui.`**
- Janela, não pré-selecionado: **`Sugestão da fila: ⟨localizacao_codigo⟩`** + ` — lote ⟨lote_codigo⟩` (com lote) + ` · ⟨fmtQtd(quantidade_sugerida)⟩`
  + ` ⟨unidade⟩` (com unidade) + **` — não veio escolhida porque não cobre a quantidade desta separação.`**
- Fila, `textoPegarEm`: o fim **`— já vem escolhido no 'Sai de' ao separar`** (`cobre: true`) | **`— escolha este endereço no 'Sai de' ao separar`** (`cobre: false`).
- PDF: título **`Lista de coleta — ⟨numero⟩`**; **`Fila carregada em DD/MM/AAAA HH:MM — a sugestão vale para esse momento; recarregue a fila antes de imprimir de novo.`**;
  cabeçalho **`Nº`, `Endereço`, `Material`, `Lote`, `Qtd`, `☐`** (o ☐ é desenhado com `rect`, não com caractere — a fonte padrão do jsPDF
  não tem o glifo; no cabeçalho vai o texto **`OK`**); bloco **`Sem endereço sugerido`**; botões **`Imprimir lista de coleta`** e
  **`Imprimir lista de coleta (todas)`**.

## Tasks

Ordem: **T1 (tronco) → (T2 ∥ T3) → T4.** T2 e T3 são galhos de tela contra o contrato congelado (mock só na fronteira HTTP); T3 não
depende de T1 (só do contrato da 188) e pode começar junto com T1. **T2 é dono de `RequisicoesList.js`; T3 é dono de `FilaSeparacao.js`,
`client/src/utils/coletaTexto.js` e `client/src/utils/listaColetaPdf.js`** — nenhum arquivo em comum. Em worktrees separadas (junction de
`node_modules`, memória "worktree com junction"); T2 e T3 não sabotam o server, então não contaminam a suíte de T1.

### T1 (tronco) — a rota da sugestão por requisição

Arquivos: `server/services/almoxarifado/requisitionService.js` (parâmetro opcional de `listarFilaSeparacao` + `sugestaoDeColetaDaRequisicao`,
exportada), `server/routes/almoxarifado.js` (a rota, ao lado da `fila-separacao`, `:4546`). Teste novo
`server/tests/api/sugestaoColetaRequisicao.api.test.js` (runner próprio, `test()`, contador, `process.exit`; `testApp.js` com
`requirePermission` real; fixtures pelo molde de `filaSugestaoColeta.api.test.js`):

1. `[RN-189.01] igual a fila`: duas requisições na fila (uma com duas paradas, uma com `PLANEJADA_NAO_COBRE`) → para cada uma, `itens`
   (item_id, separavel, pegar_em, aviso) e `ordem_coleta` `deepStrictEqual` ao recorte do elemento da fila.
2. `[RN-189.01] fora da fila -> itens [] e ordem_coleta []` (requisição ENTREGUE).
3. `[RN-189.01] 404`: inexistente, inativa, `abc` — a literal.
4. `Gate: sem separar_emitir -> 403` com a literal e `acao`.
5. `[RN-188.07] so leitura`: chamar duas vezes não muda contagem nem `MAX(updated_at)` de requisições, itens, saldos, reservas, substituições.
6. `[B821] a fila sem o parametro nao mudou`: `listarFilaSeparacao(db, user)` antes/depois (o cenário `[127 RN-10]`: separável 4 e 0, itens na ordem do pedido).

**Controles positivos** (perl `-0pi`, base LF, âncora contada = 1, md5 antes/sabotado/restaurado; registrar o vermelho no plano):
(a) o filtro desligado (`AND 1 = 1`) **e** o recorte pegando `fila[0]` em vez de procurar pelo id → cai o 1 na segunda requisição (só
desligar o filtro não derruba nada se o recorte procura pelo id — por isso a sabotagem é dupla, e o cenário 1 tem duas requisições
com a fila ordenada de modo que a pedida **não** seja a primeira); (b) o gate trocado
por `(req, res, next) => next()` → cai o 4; (c) devolver `itens: linhas` sem passar por `sugerirColeta` (pegar_em `undefined`) → cai o 1;
(d) `ORDER BY ir.requisicao_id, ir.id DESC` → cai o 6 (e `separavelDividido.api.test.js` `[127 RN-10]`).

Rodar também, sem mudança esperada: `filaSugestaoColeta`, `filaSugestaoColetaIntegracao`, `filaSeparacao`, `separavelDividido`.

### T2 (galho) — a janela de separação pré-seleciona

Arquivo: `client/src/components/almoxarifado/RequisicoesList.js` **só**.

- Estado `sugestaoSeparacao` (Map `item_id → { pegar_em, pegar_em_aviso }` ou `null`) e `sugestaoSeqRef`. Ao abrir a janela de separação
  (o mesmo gatilho `materiaisEntregaKey` começando com `S:`, ou `showSeparar` + `detalhe.id`), zera e busca
  `GET /almoxarifado/requisicoes/<id>/sugestao-coleta`; resposta de abertura velha descartada pela sequência; erro ou resposta sem
  `itens` em array → `null` (RN-189.06), **sem toast**.
- Função pura exportada `valorSugeridoNaSeparacao(item, sugestao, rows, qtdSugerida, outrosMesmoMaterial, jaPreSelecionadoNoPar)` →
  `''` ou o valor (RN-189.02/04). O efeito novo roda **depois** do da Etapa 65 e só para itens com `!temPlanejada(item)` (RN-189.03), sem
  chave em `origensSeparacao` (RN-189.05), com `rows` e a sugestão carregados; acumula, na ordem do pedido, o que já pré-selecionou por
  par (RN-189.04).
- Guardar quais itens foram pré-selecionados (`preSelecionados`, Set) para a frase (RN-189.09): a frase "Sugerido…" aparece enquanto o
  valor do select for o par sugerido; a frase "Sugestão da fila: …" aparece para item sem planejada com `pegar_em` que não foi
  pré-selecionado.
- `handleSeparacao` **não muda** (a pré-seleção é um valor do select como outro qualquer).

Teste novo `client/src/components/almoxarifado/RequisicoesSeparacaoPreSelecao.test.js` (mock HTTP no molde de
`RequisicoesSeparacaoOrigem.test.js:88-102`, acrescentando a URL nova):

1. `[RN-189.02] cobre -> abre com o par escolhido e a frase`; confirmar → o PUT leva `localizacao_origem_id` e `lote_id` do par.
2. `[RN-189.02] par sem lote -> valor "<loc>:" e o PUT sem lote_id`.
3. `[RN-189.03] planejada pendente -> regra da 65, nunca a sugestao` (sugestão adulterada para outro par que cobre).
4. `[RN-189.04] dois irmaos no mesmo par que nao comporta os dois -> so o primeiro`.
5. `[RN-189.05] o usuario muda antes da sugestao chegar -> continua a escolha dele` (a sugestão resolvida por promessa controlada depois do `change`).
6. `[RN-189.06]` um caso por causa: busca rejeitada (500), `{ data: [] }`, `cobre: false` (frase "Sugestão da fila: … não cobre"),
   par fora das opções, não cobre a quantidade pré-preenchida → automático e **nenhum** toast de erro.
7. `[RN-189.07] o 400 do servidor mantem a janela; trocar para automatico e confirmar -> PUT sem chave`.
8. `[RN-189.09] trocar o select tira a frase "Sugerido…"`.
9. Abrir, fechar e abrir outra requisição → a resposta atrasada da primeira não pré-seleciona a segunda (sequência).

**Controles positivos:** (e) tirar a guarda `!temPlanejada` → cai o 3; (f) tirar a soma por par → cai o 4; (g) tirar a guarda da chave
presente → cai o 5; (h) aceitar `cobre: false` → cai o 6 (`cobre: false`); (i) não descartar a resposta velha → cai o 9.
**Regressão:** rodar os dez `Requisicoes*.test.js` — **nenhum** pode mudar de asserção (o mock deles devolve `{ data: [] }` para a URL
nova; RN-189.06). Build `CI=true`.

### T3 (galho) — o PDF e as frases da fila

1. **Mover as frases**: `textoPegarEm` e `textoAvisoPegarEm` (e `fmtQtd`/`fmtData` que usam) para `client/src/utils/coletaTexto.js`
   (puro, sem React); `FilaSeparacao.js` importa e **re-exporta** com os mesmos nomes (o `FilaSeparacao.test.js` da 188 não muda de
   import). Motivo: o PDF precisa das mesmas frases, e importar um componente de tela num gerador de PDF repete o acoplamento M5 da 185
   (a sabotagem de uma tela derrubava a suíte de outro papel). `textoPegarEm` ganha o fim da RN-189.09 (`cobre`).
2. **Gerador** `client/src/utils/listaColetaPdf.js`, molde `posicaoClientePdf.js`:
   - `montarListaColetaPDF({ requisicoes, carregadaEm })` — **puro**, devolve o descritor: por requisição `{ titulo, subtitulo,
     linhas: [[nº, endereço, material, lote, qtd]], avisos: Map(índice da linha → frase), semEndereco: [{ texto, aviso }] }` e
     `carregadaEm` formatada (dia e hora **locais**, `dataLocal.js`, sem `new Date()` cru para o dia — RN-170.04).
   - `requisicoesParaImprimir(fila)` — o filtro da RN-189.11 (etapa `SEPARAR` + RN-189.10), na ordem recebida.
   - `gerarListaColetaPDF({ requisicoes, carregadaEm, nomeArquivo })` — desenha: colunas sugeridas `[14, 23, 75, 140, 168, 188]`
     (util `[8, 51, 64, 27, 19, 8]` por `utilDasColunas`; **medir** com o jsPDF real e ajustar antes de congelar — o cabeçalho `Endereço` e
     `Material` em f9 cabem); ☐ = `rect(189, y − 3, 3.5, 3.5)` (termina em 192,5 ≤ 196); `desenharTabela` próprio com `prepararCelulas`
     (`numericas: [0, 4]`), `limite` 275, cabeçalho repetido no `addPage`, linha de aviso por `desenharQuebrado` (largura 168, f8) contada
     **junto** com a parada para não partir; seção nova só se cabe o cabeçalho dela + a primeira parada (RN-189.12). `pdf.save(nomeArquivo)`.
3. **Botões** em `FilaSeparacao.js`: `fila-imprimir-<req>` na linha (ao lado de "Abrir") quando a RN-189.10 deixa; `fila-imprimir-todas`
   no cabeçalho (ao lado de "Atualizar"), desabilitado sem requisição imprimível. O estado guarda `carregadaEm` no fim de cada carga com
   sucesso. Clicar não chama o servidor (RN-189.13).

Testes:

- `client/src/utils/listaColetaPdf.test.js` — **jsPDF real** pelo molde de `posicaoClientePdf.test.js:13-35` e `:130-175` (o gravador +
  `textosGravados`/`textosForaDaFolha` com `MARGEM = 196`, `FUNDO = 287`; o `rect` gravado também é conferido: `x + w ≤ 196`, `y + h ≤ 287`):
  `[RN-189.10]` ordem = `ordem_coleta` (não `itens`); endereço com e sem caminho; lote com validade e `—`; aviso abaixo da parada;
  bloco "Sem endereço sugerido"; item sem `pegar_em` e sem aviso fora. `[RN-189.11]` filtro e ordem das seções, numeração recomeça.
  `[RN-189.12]` caminho de 120 e nome de 100 quebram sem perder letra (junção sem espaços = o original); 80 paradas → nada abaixo de 275
  na tabela, nenhuma parada partida (nem com o aviso), cabeçalho repetido em toda página; Qtd `9999999999.9999` num `text` só; seção no
  pé da página vai inteira para a próxima; nenhum `getTextWidth`/`setFont` pela produção. `[RN-189.13]` nomes de arquivo; o dia de
  `carregadaEm` às 22h30 local é o local (molde `[RN-170.04]`).
- `client/src/utils/coletaTexto.test.js` — as frases da 188 iguais (cópia das asserções do `FilaSeparacao.test.js`) + o fim por `cobre`.
- `FilaSeparacao.test.js` — botões: aparece/não aparece pela RN-189.10; "todas" desabilitado sem SEPARAR; clicar chama o gerador (mock
  de `../../utils/listaColetaPdf` só aqui — fronteira entre tela e papel; o papel é provado no teste acima) com as requisições certas e
  **nenhum** `api.get` a mais.

**Controles positivos:** (j) imprimir na ordem de `itens` → cai a ordem; (k) tirar `numericas` da Qtd → cai o "um text só";
(l) tirar o cabeçalho repetido → cai o "cabeçalho em toda página"; (m) não contar a linha do aviso na altura → cai o "nenhuma parada
partida" (montar o caso que encosta no limite); (n) `rect` em x 194 → cai o "☐ dentro da folha"; (o) o filtro da "todas" sem a etapa
SEPARAR → cai o `[RN-189.11]`; (p) a frase `cobre: true` antiga → cai o `coletaTexto` do fim por `cobre`. Build `CI=true`.

### T4 — integração (servidor pela rota e pelo serviço; tela pelo fluxo)

**Servidor** — `server/tests/api/preSelecaoColetaIntegracao.api.test.js` (molde `filaSugestaoColetaIntegracao.api.test.js`: cadastro
pela rota, entrada com lote pelo motor, criar e aprovar pela rota, validade por `UPDATE`):

1. `[T4 rota, RN-189.08] fila -> sugestao -> separar o par -> entregar sem escolha`: material com lote, L1 (vence antes) 6 em ZB-01, L2
   9 na padrão ZP-01; requisição de 5. `GET /fila-separacao` e `GET /requisicoes/:id/sugestao-coleta` → o mesmo `pegar_em` ZB-01/L1;
   `PUT /separacao` com o par (o que a janela manda) → 200, planejada ZB-01/L1; `PUT /entregar` **sem** chave de origem (o que a janela
   de entrega manda com a planejada escolhida, e a entrega de um clique) → 200; ZB-01/L1 = 1, ZP-01/L2 = 9, **nenhuma** linha sem lote
   com quantidade ≠ 0 do material, `substituicoes_origem_requisicao` com **0** linhas da requisição.
2. `[T4 rota, controle historico]` o mesmo cenário separando **sem** chave (o automático de antes da 189) → a linha sem lote −5 na padrão
   (a sonda `f2r188-sonda2`). Prova que o cenário 1 mede o que a pré-seleção muda, não um acaso do fixture.
3. `[T4 rota, RN-189.07] dica velha`: listar a sugestão; saída avulsa de 4 em ZB-01/L1 (com `justificativa` e `lote`); separar 5 do par
   → 400 com a literal; separar 5 sem chave → 200 (a escolha do usuário depois da recusa).
4. `[T4 servico]` `sugestaoDeColetaDaRequisicao(db, user, id)` = a rota = o recorte de `listarFilaSeparacao(db, user)`.
5. `[T4 rota, C1/RN-189.03]` item com 3 separados de ZA-01 (a sonda `f2r188-sonda1`): a sugestão é ZA-01 com `PLANEJADA_NAO_COBRE`;
   separar 1 de ZA-01 → 200, 0 substituições.

**Tela** — `client/src/components/almoxarifado/RequisicoesPreSelecaoFluxo.test.js` (mock HTTP com estado: o detalhe devolvido depois do
PUT traz `origem_separacao_id`/`lote_separacao_id` do par):

6. Abrir a requisição → "Separar e entregar" → o "Sai de" vem no par → confirmar → o PUT leva o par → a janela de entrega abre com a
   planejada escolhida → confirmar → o PUT da entrega **sem** `origem_automatica`, **sem** `motivo_substituicao`, **sem**
   `localizacao_origem_id` de outro par; nenhum aviso de troca na tela.
7. `FilaSeparacao` com o JSON da fila → clicar "Imprimir lista de coleta" de uma requisição → o gerador **real** (sem mock de
   `listaColetaPdf`; `jspdf` com o gravador) recebe a chamada e o `save` é chamado com `lista-coleta-<numero>.pdf`; os `text` gravados
   contêm os endereços na ordem de `ordem_coleta`.

**Controles:** (q) a tela mandando o PUT da separação sem o par (pré-seleção desligada) → caem o 6 e o cenário 1 continua verde (é
servidor) — o 6 é o que prova a fiação; (r) `listarFilaSeparacao` ignorando `requisicaoId` e a rota pegando `fila[0]` → cai o 4;
(s) no 7, imprimir pela ordem de `itens` → cai a ordem.

### Fechamento (skill `fechar-etapa`)

- Spec 05: item da `:63` (a "Sugestão de rota", fechado pela 188) ganha a nota da pré-seleção e do PDF com os hashes; registrar que a
  lista impressa **não** é a "Lista de separação como entidade própria" (`:56`, continua aberta). Status no topo.
- Mapa (`specs/modulo-almoxarifado/README.md`), guia (`docs/almoxarifado-guia-etapas-e-testes.md`: cabeçalho "onde parou", seção da 189,
  "Antes → Agora", roteiro clicável — fila → Imprimir → Abrir → Separar e entregar com o "Sai de" já escolhido → entregar → bloco
  "Substituições" vazio; e o que **não** cobre: entrega de item separado no automático continua automática (I2 da 188), lista única
  intercalando requisições, a combinação de endereços), novidades (letra B abaixo), este plano (Execução, retro, próxima tarefa).
- Corrigir no guia da 188 a frase do "o que não cobre" sobre o automático (I1): deixa de valer para quem separa pela janela.

## Letra B proposta (para `docs/almoxarifado-novidades-por-etapa.md`)

*(O último usado é B1259, da Etapa 188. A 189 usa B1260 a B1269.)*

- **B1260 (NOVA, da Etapa 189) — a janela busca a sugestão numa rota nova, só de leitura, com o gate da fila.**
  `GET /requisicoes/:id/sugestao-coleta` (`separar_emitir`) devolve o recorte da fila para a requisição, pelo mesmo código
  (`listarFilaSeparacao` filtrada). **Descartado:** campo novo no detalhe (`GET /requisicoes/:id` não tem gate de perfil, é aberto por
  várias telas e passaria a fazer 4–5 consultas a mais em toda abertura); a janela ler a fila inteira (avalia a alçada de valor de toda
  requisição da fila a cada abertura). **Reversível.**
- **B1261 (NOVA, da Etapa 189) — o padrão do "Sai de" na separação muda de "automático" para o endereço sugerido.** Só no item sem
  separado pendente, só quando a sugestão cobre a quantidade e o par está nas opções. É o que torna a dica da 188 verdadeira (I1): quem pega
  da prateleira sugerida e confirma deixa o livro igual à prateleira, e o material com lote deixa de gerar linha sem lote negativa.
  **Descartado:** manter o automático com um botão "usar sugestão" (o separador segue a dica, esquece o botão e o I1 continua);
  pré-selecionar quando não cobre, baixando a quantidade para o que cabe (mudaria a quantidade padrão e abriria o "motivo da divergência"
  sem o usuário ter feito nada). **Reversível** (a pré-seleção é uma função e um efeito na tela).
- **B1262 (NOVA, da Etapa 189) — o custo aceito: mais entregas saem da planejada, estrita.** Separar com origem grava a planejada; se o
  par perder saldo entre separar e entregar, a janela de entrega abre em automático com a troca registrada, e a entrega de um clique sem
  janela recusa com a literal da planejada. É o comportamento de hoje para quem escolhe à mão (Etapa 59/63), e é o livro honesto (o
  material saiu de lá). **Descartado:** uma pré-seleção "macia" que não grava planejada (o servidor não tem isso; seria campo novo na
  rodada e uma segunda régua de origem).
- **B1263 (NOVA, da Etapa 189) — a pré-seleção nunca troca a planejada.** Item com separado pendente segue a regra da Etapa 65 na tela,
  mesmo que a sugestão aponte outro par — a tela não confia só na C1 do servidor. **Reversível.**
- **B1264 (NOVA, da Etapa 189) — na entrega, nada novo.** A entrega já parte da planejada (Etapa 59), e é ela que a pré-seleção da
  separação passa a gravar. Item separado no automático continua saindo no automático: o endereço de onde ele foi pego não está gravado em
  lugar nenhum (I2 da 188), e sugerir um na entrega seria chutar. **Descartado:** pré-selecionar o `pegar_em` na entrega (na etapa
  ENTREGAR o separável é 0 e não há `pegar_em`; seria regra nova).
- **B1265 (NOVA, da Etapa 189) — a frase da fila segue a pré-seleção.** Com `cobre: true` a fila diz "já vem escolhido no 'Sai de'"; com
  `cobre: false`, continua "escolha este endereço". **Reversível.**
- **B1266 (NOVA, da Etapa 189) — lista de coleta por requisição e "todas", uma seção por requisição.** As que estão para separar, na
  ordem da fila. **Descartado:** uma lista só intercalando as requisições pelo caminho (wave picking): misturaria o que vai em caixas
  diferentes e é a "lista de separação como entidade" da spec 05 (`:56`), que segue aberta; caixinhas de marcar requisições na fila (mais
  estado de tela para um ganho pequeno).
- **B1267 (NOVA, da Etapa 189) — o papel é do momento em que a fila foi carregada.** Gerado no navegador com o JSON já na tela, sem
  chamada nova; o papel diz "Fila carregada em …" e manda recarregar antes de imprimir de novo. **Descartado:** recarregar a fila ao
  imprimir (o papel ficaria diferente do que a tela mostra, e a dica continua podendo envelhecer no caminho até a prateleira — quem
  decide é a separação, RN-189.07).
- **B1268 (NOVA, da Etapa 189) — as frases da dica moram em `utils/coletaTexto.js`.** A tela e o papel usam as mesmas; o gerador não
  importa um componente (o acoplamento M5 da 185). `FilaSeparacao.js` re-exporta os nomes.
- **B1269 (NOVA, da Etapa 189) — o papel tem caixinha "OK" e não tem assinatura.** É roteiro de trabalho, não documento de controle (a
  rodada de separação já registra quem separou, Etapa 28). **Descartado:** campo de assinatura (sugeriria um controle que o sistema não
  confere).

## Emendas da Fase 2

Revisor fresco, 2026-10-23, sobre `9652ec6a`. Leu o CLAUDE.md (travas), este plano, o plano da 188 (Emendas C1/I1/I2/I3 e a
"Próxima tarefa"), a spec 05, `requisitionService.js` (`lerDadosDaColeta`, `listarFilaSeparacao`, `checarOrigemItem`, a passada 1 da
separação `:1295-1420`, a troca na separação `:1497-1520`, a entrega `:1700-1822`), `sugestaoDeColeta.js`, `permissions.js`
(`requirePermission`, `separar_emitir` = ADMINISTRADOR/ALMOXARIFE), a rota do detalhe (`routes/almoxarifado.js:3836-3843`) e a da fila
(`:4543-4550`), `RequisicoesList.js` (`:121-260`, os efeitos `:420-552`, `handleSeparacao` `:755-814`, `montarItensEntrega`, os botões de
entrega `:1920-1960`), `FilaSeparacao.js` e `pdfTexto.js`. Duas sondas executadas (scratchpad, prefixo `f2r189-`):
`f2r189-sonda1.js` (servidor real pelo `testApp`: duas rodadas de material com lote, com e sem o par na primeira; 403 de PRODUCAO; 404
de `abc`) e `f2r189-sonda2.js` (jsPDF real: largura das células com as colunas sugeridas).

**Atenção — a árvore de trabalho tem mudança da Fase 5 da 188 ainda não commitada** (`requisitionService.js` e `sugestaoDeColeta.js`:
campo novo `pegar_em_alerta` = `RETENCAO_NO_MATERIAL`, aviso novo `PLANEJADA_INDISPONIVEL`). A sonda 1 rodou com ela; o cenário dela
não passa pelas linhas mudadas (planejada sugerível; separação e entrega intocadas). Ver I3.

**Resultado: 0 Crítico, 3 Importantes, 6 Menores. O contrato muda (I3: recorte com `pegar_em_alerta`; I2: colunas do PDF) — reler e
congelar de novo depois do commit da Fase 5 da 188, antes de T1.**

### I1 (Importante) — separação em duas rodadas: a pré-seleção grava uma troca que o almoxarife não fez, e o livro continua errado

**Onde:** a passada 1 (`requisitionService.js:1407-1409`, "mista -> nula") e a troca na separação (`:1500-1520`), com a regra da 65 na
tela (`RequisicoesList.js:183-188`). A RN-189.08 só vale quando o item é separado **numa rodada só** (ou entregue antes da segunda).

**Cenário (sonda `f2r189-sonda1.js`, reproduzido):** material com lote, só L1 3 em YB-01; requisição de 6. Fila: `pegar_em` YB-01/L1 3,
`cobre: true` (cobre o **separável** 3, não o pedido 6). Rodada 1 com o par (o que a janela da 189 pré-seleciona) → 200, planejada
YB-01/L1. Chega L2 3 em YP-01. Fila: `pegar_em: null`, `PLANEJADA_NAO_COBRE`. A janela (65) abre em automático com o aviso de troca;
confirmar → 200, planejada **nula** e **1 substituição** `SEPARACAO`, `automatica = 1`, 3. Entrega de um clique de 6 → 200: L1 3, L2 3,
**linha sem lote −6**. O mesmo cenário com a rodada 1 automática (antes da 189): o **mesmo** saldo (L1 3, L2 3, −6) e **0**
substituições. Isto é: a 189 não conserta o livro de quem separa em duas rodadas antes de entregar, e acrescenta no bloco
"Substituições" uma troca que o almoxarife não escolheu (ele pegou 3 de um lugar e 3 de outro, e o sistema só guarda uma origem por item,
B1254). A B1262 só fala da entrega.

**Emenda (caminho reversível, escolhido):** manter a pré-seleção (o fluxo comum, "Separar e entregar", entrega a rodada 1 antes da 2 e
fica certo) e dizer o custo:
- **B1262** ganha o parágrafo: "separar uma parte do par sugerido e o resto **depois**, sem entregar no meio, troca a origem na segunda
  rodada (a 65 registra a troca, `momento = 'SEPARACAO'`), e a entrega sai no automático — para material com lote, a linha sem lote fica
  negativa como antes da 189. Descartado: não pré-selecionar quando a rodada é parcial (perderia o conserto do caso parcial que é entregue
  antes da próxima rodada, o mais comum)."
- **RN-189.09:** quando a quantidade pré-preenchida do item pré-selecionado é **menor** que o pendente de separação dele, a frase
  "Sugerido…" ganha o fim **" Entregue esta parte antes de separar o resto — separar o resto de outro endereço troca a origem."**
  (literal; T2 testa; controle: tirar a condição → a frase aparece no item que cobre tudo).
- **T4 servidor, cenário novo 6** `[T4 rota, I1 da Fase 2] duas rodadas sem entregar -> 1 troca SEPARACAO automatica e a linha sem lote`
  (o cenário da sonda) — documenta o custo pela porta real; e `[... ] entregando entre as rodadas -> 0 trocas e nenhuma linha sem lote`.
- **Guia, "o que não cobre":** a frase da B1262 em linguagem de usuário.

### I2 (Importante) — a coluna Qtd sugerida não cabe o número da RN-189.12 em linha nenhuma

**Onde:** T3 item 2 (colunas `[14, 23, 75, 140, 168, 188]`, util da Qtd **19 mm**) × RN-189.10 (Qtd = `formatarQuantidade(q)` +
` unidade`) × RN-189.12 ("Qtd `9999999999.9999`: um `text` só, dentro da coluna").

**Medido (sonda `f2r189-sonda2.js`, jsPDF real):** `"9.999.999.999,9999 PC"` = 33,27 mm em f9, 29,58 f8, 25,88 f7, **22,18 f6** — não
cabe em 19 mm nem na fonte mínima de `fonteQueCabe` (6); `prepararCelulas` (`pdfTexto.js:90-94`) cai no `linhasPorLargura` e **quebra**
o número em duas linhas, o que a RN-186 proíbe e o teste da RN-189.12 pega. O executor só sairia disso enfraquecendo o teste ou
mudando colunas no meio da task. (`"1.234,5678 KG"` também não cabe em f9: 21,21 mm.) Os cabeçalhos `Nº` (3,43) e `OK` (4,57) cabem nos 8.

**Emenda:** colunas **`[14, 23, 70, 130, 160, 188]`** (util `[8, 46, 59, 29, 27, 8]`): o pior caso em f7 = 25,88/26,03 mm (`PC`/`UN`) ≤ 27.
Congelar estas e manter o "medir com o jsPDF real" como conferência, não como decisão da task. Endereço 46 e Material 59 continuam
quebrando dentro da célula (`prepararCelulas`), e o ☐ continua `rect(189, y − 3, 3.5, 3.5)`.

### I3 (Importante) — o contrato da 189 não conhece o que a Fase 5 da 188 está acrescentando

**Onde:** a árvore de trabalho (não commitada, outra sessão): `listarFilaSeparacao` grava `l.pegar_em_alerta` (`RETENCAO_NO_MATERIAL`
quando o material tem bloqueado + em inspeção + em terceiros > 0) e `sugerirColeta` ganha o aviso `PLANEJADA_INDISPONIVEL` (planejada
em endereço bloqueado/inativo/área especial ou lote bloqueado/vencido).

**Consequência se nada mudar:** o recorte da RN-189.01 (`item_id, separavel, pegar_em, pegar_em_aviso`) perde o alerta — a janela
pré-seleciona sem dizer que o sistema não sabe se ali estão as peças boas; e o PDF (que usa `textoAvisoPegarEm`) imprime linha vazia
para `PLANEJADA_INDISPONIVEL` se a frase não existir em `coletaTexto.js`.

**Emenda:** (1) RN-189.01 e o contrato: o recorte leva também **`pegar_em_alerta`** (idêntico ao da fila). (2) RN-189.02: o alerta **não**
impede a pré-seleção (o livro fica certo qualquer que seja a peça boa pega dali; caminho reversível) e a janela mostra a frase do alerta
da 188 abaixo do "Sai de" (mesmo testid da RN-189.09, depois da frase "Sugerido…"). (3) RN-189.10: o alerta vai na linha de aviso da
parada (junto com o aviso, se houver), e o bloco "Sem endereço sugerido" cobre `PLANEJADA_INDISPONIVEL` sem `pegar_em`. (4) T3 move para
`coletaTexto.js` **todas** as frases que a 188 fechar (as do aviso e a do alerta). (5) "Pré-requisito" do cabeçalho: congelar de novo
este contrato **depois** do commit da Fase 5 da 188 (o plano já pede reler; agora se sabe o que muda).

### Menores

- **M1 — a soma da RN-189.04 só conta os pré-selecionados; o servidor soma todos.** `checarOrigemItem` (`:1167-1170`) soma a rodada de
  todo irmão no mesmo par e o separado pendente de **todos** os itens da requisição planejados nele (semeado em `:1295-1313`). Cenário: o
  almoxarife escolhe A-01 à mão no item 1 (4) antes de a sugestão chegar; o item 2 (4) é pré-selecionado em A-01 (6) → 400 "O saldo em
  A-01 (2) não cobre a quantidade (4)". Recuperável (RN-189.07), mas evitável. **Emenda:** a soma é sobre todo item do mesmo material cujo
  valor **atual** no "Sai de" é o par (manual, a planejada da 65 ou pré-selecionado) **mais** o separado pendente dos irmãos planejados no
  par; T2 caso 4 ganha a variante "o primeiro escolhido à mão".
- **M2 — item com separado pendente SEM planejada (rodada anterior no automático) é pré-selecionado e a pré-seleção não vira planejada.**
  `temPlanejada` é falso (planejada nula), então a RN-189.02 pré-seleciona; mas `pendenteAntes > 0 && !mesmoPar` (`:1407`) grava planejada
  nula de novo e a entrega sai no automático — a frase "Sugerido pela fila…" promete o que não acontece. E a dica, ali, é a do I2 da 188
  (o separado no automático não é descontado: na sonda 1, cenário "antes da 189", a rodada 2 recebeu YB-01/L1 3 `cobre: true` com as 3
  peças possivelmente já fora da prateleira). **Emenda:** RN-189.02 exige também `pendenteSeparado(item) === 0`; o item com pendente sem
  planejada mostra a frase "Sugestão da fila: …" (sem pré-selecionar). Corrigir a frase do I2 da 188 ("some quando a 189 pré-selecionar")
  no fechamento: some só para o que foi separado pela pré-seleção.
- **M3 — a frase "não veio escolhida porque não cobre a quantidade desta separação" é falsa em dois dos motivos da RN-189.06** (par fora
  das opções: busca de saldos falhou ou o saldo zerou; `cobre: false` da fila, que já disse "escolha este endereço") e a fila diz "já vem
  escolhido" (B1265) também quando a janela não vai escolher por esses motivos. **Emenda:** frase neutra **"Sugestão da fila: ⟨…⟩ — não
  veio escolhida; confira o saldo no 'Sai de' antes de escolher."** para todos os motivos; a B1265 diz "vem escolhido **quando o endereço
  ainda tem o saldo ao abrir a janela**".
- **M4 — T2 precisa formatar `quantidade_sugerida` e `RequisicoesList.js` não tem `fmtQtd`; o `coletaTexto.js` é de T3.** Se T2 importar
  `coletaTexto`, deixa de ser galho independente. E o papel mistura dois formatos para a mesma quantidade: a coluna Qtd por
  `formatarQuantidade` (até **4** casas) e a frase do aviso por `fmtQtd` da fila (até **3**): `0,1235` na coluna e "pegue 0,124 aqui"
  na mesma parada. **Emenda:** T2 declara um `fmtQtd` local idêntico ao da fila (pt-BR, até 3 casas — o da tela que o almoxarife vê);
  T3 usa o `fmtQtd` de `coletaTexto.js` também na coluna Qtd (tela = papel), e o T2 pode trocar o local pelo import num commit depois de
  T3 (anotar na Execução). T2 e T3 continuam sem arquivo em comum.
- **M5 — T4 cenário 2 diz "a linha sem lote −5 na padrão", e a fixture do molde não grava padrão.** O material da sonda (mesmo `INSERT` do
  `filaSugestaoColetaIntegracao`) deixa `localizacao_padrao_id` nulo e a linha sem lote nasce com **endereço nulo** (sonda 1:
  `{"loc":null,"lote":null,"quantidade":-6}`). **Emenda:** assertar "linha sem lote −5" sem endereço, ou gravar a padrão ZP-01 no `INSERT`
  e então assertar o endereço.
- **M6 — PDF de requisição com 0 paradas e só avisos, e o "a separar ⟨q⟩" sem fonte.** A RN-189.10 deixa o botão aparecer (item com
  aviso) mas não diz se a tabela (e o cabeçalho) é desenhada vazia. **Emenda:** sem paradas, nenhuma tabela — o título, a linha "Fila
  carregada em…", o cabeçalho da requisição e o bloco "Sem endereço sugerido"; `q` = `a_separar` do item (o número que a linha da fila
  mostra). Teste em `listaColetaPdf.test.js`.

### As quatro perguntas

1. **Contrato.** O 403 é a literal de `requirePermission` (`permissions.js:292`; medido na sonda 1 pela fila: `{"error":"Sem permissão
   para esta operação","acao":"separar_emitir","perfil":"PRODUCAO"}`); o 404 é a do detalhe (`routes/almoxarifado.js:3843`; `abc` → 404
   medido). "Outro dono": nem a fila nem a separação filtram por dono — `separar_emitir` é do almoxarife e do administrador, que veem
   todas; a rota nova segue (sem achado). Fora de SEPARAR: requisição só com ENTREGAR **está** na fila e volta com `itens` não vazio e
   `pegar_em: null` (separável 0); só a que não tem etapa volta `itens: []` — coerente com a RN-189.01, mas o T1 caso 2 deve ter também a
   variante "só ENTREGAR → itens com pegar_em null, ordem_coleta []". **O filtro não muda a fila sem filtro, nem o resultado da
   requisição filtrada:** `sugerirColeta` é chamada por requisição, sem estado entre requisições (`sugeridoPorPar` é local à chamada);
   `lerDadosDaColeta` lê saldos e séries **por material** e planejado/árvore **globais** — filtrar `itens` só tira materiais de outras
   requisições, cujas linhas não entram na desta. A 404 de id não numérico tem de ser conferida **antes** do `AND r.id = ?` (o serviço
   valida `Number.isInteger(Number(id))`; não passar `NaN` ao SQLite). Lacuna: I3 (o campo novo da 188).
2. **RN × spec/B821/B204/65/C1.** B821: `itens` na ordem do pedido, recorte não reordena (ok). B204: a RN-189.08 é exatamente o conserto
   do automático que não escolhe lote — vale para **uma** rodada (I1). Etapa 65: a RN-189.03 preserva a regra (a pré-seleção só em item
   sem planejada), mas falta o item com pendente sem planejada (M2). C1 da 188: a tela não confia nela (RN-189.03, ok). Spec 05: a lista
   impressa não é a "lista de separação como entidade" (`:56`), e o plano registra isso (ok).
3. **Independência.** T1 → (T2 ∥ T3) → T4 é real: T2 mexe só em `RequisicoesList.js` e mocka a rota; T3 **cria** `coletaTexto.js` e
   `listaColetaPdf.js` e mexe em `FilaSeparacao.js`; nenhum arquivo em comum. O único acoplamento escondido era a formatação de
   quantidade (M4, resolvido sem import cruzado). T3 depende do contrato da 188 **depois** da Fase 5 dela (I3). T4 caso 6 depende de T2,
   caso 7 de T3.
4. **Até o último gesto.** Janela abre pré-selecionada (RN-189.02) → separar: o servidor exige que o **par** (endereço **e** lote) cubra a
   rodada mais o pendente da requisição no par (`checarOrigemItem`, estrita; 400 mantém a janela). Série: a janela de **separação** não
   escolhe séries (só a de entrega, `:430-470`), então a pré-seleção não precisa preencher nada; mas o lote do par vira a planejada e a
   entrega passa a exigir séries **daquele lote** (`:1796-1801`; a janela de entrega filtra por ele, `seriesDoLote`, `:995`) — antes, no
   automático, qualquer lote servia. A dica conta só séries EM_ESTOQUE do lote (I3 da 188), então o caso comum fecha; o custo vai na B1262
   (texto no fim desta resposta). Segunda rodada: a pré-seleção não roda (planejada pendente → 65) e **não** cria troca falsa por si; quem cria a troca é a
   segunda rodada de outro par/automática — I1. Entrega "Sai de": nada novo (B1264, ok); a janela de entrega parte da planejada (Etapa 59)
   e a de um clique também sai dela (`:1784`); par que perdeu saldo → a de um clique recusa "a origem da separação (…) não serve mais (…) —
   entregue escolhendo de onde sai" (`:1761`) e a janela abre em automático com a troca. PDF: fila vazia → "todas" desabilitado (ok);
   requisição com 0 paradas → M6; 200 requisições: o papel é gerado do JSON já carregado, sem rede; o custo é ~5 `splitTextToSize` por
   célula (`fonteQueCabe` desce até f6) — milhares de chamadas síncronas, ordem de grandeza de 1 s, sem achado (não prometer número sem medir
   no fechamento).
   - **B1262 para o usuário:** do jeito que está, não diz o que muda na tela. A emenda do I1 dá o texto; o guia precisa ainda de: "se o
     'Confirmar Entrega' responder *a origem da separação (B-01) não serve mais … — entregue escolhendo de onde sai*, clique em **Entregar
     escolhendo de onde sai…** e escolha outro endereço: a troca fica registrada no bloco Substituições" e "material com série: depois de
     separar do endereço sugerido, a entrega pede séries daquele lote".

## Execução

*(vazia — nenhuma task começou)*

## Próxima tarefa detalhada

*(preencher no fechamento)*
