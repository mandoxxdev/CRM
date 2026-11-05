# Etapa 195 — Separação: as quantidades digitadas não se perdem ao voltar para a aba

> Etapa pequena, só de tela (`client/src/components/almoxarifado/RequisicoesList.js`). Nenhum contrato de API muda, nenhum servidor.
> Estimativa: item 3 de `docs/estimativas/2026-11/estimativa_2026-11-05_almoxarifado-proximas.txt` (**1h**: análise 15 min, execução
> 30 min, teste 15 min). Fecha o **C454** e leva junto o código morto do **C452**. Plano em escala reduzida (sem design separado).

## Objetivo (em linguagem simples)

Com a janela de separação aberta, o almoxarife digita "3" num item. Ele vai a outra aba (ou outro programa) e volta. Hoje o sistema
recarrega a requisição ao voltar — o que é bom, porque mostra o que outra pessoa mudou —, mas no caminho põe todas as quantidades da
janela de volta no valor inicial: o "3" vira "5". Se ele não reparar, separa 5. Passa a ficar o "3".

## Fase 0 (medido em 2026-11-05, sobre `78172c0e`)

- **Quem recarrega:** `useEffect` em `RequisicoesList.js:762-777` — com `warehouseMode && selectedId`, escuta `focus` (window) e
  `visibilitychange` (document) e, com a página visível, chama `abrirDetalhe(selectedIdRef.current, { force: true })`. Não olha se há
  janela aberta.
- **Quem apaga:** `abrirDetalhe` (`:715-754`) → `aplicarDetalhe` (`:678-684`, `useCallback([])`), que sempre faz
  `setQuantidadesEntrega(quantidadesIniciaisEntrega(...))` e `setQuantidadesSeparacao(quantidadesIniciaisSeparacao(...))`.
- **Por que o "Sai de" não se perde:** `origensSeparacao`/`origensEntrega` não são tocados por `aplicarDetalhe`; os efeitos da
  pré-seleção só preenchem item sem chave (RN-189.05).
- **Quem depende do reset de `aplicarDetalhe` com a janela FECHADA:** `handleAprovar(id, true)` (`:812-815`) carrega o detalhe e só
  depois abre a separação, sem repor as quantidades — depende do reset. Os outros que abrem janela já repõem: `abrirModalSeparacao`
  (`:872-878`), `abrirModalEntrega` (`:1051-1064`), `handleConfirmarEntrega` (`:1066-1094`). Logo o reset tem de continuar quando a
  janela está fechada.
- **Entrega, mesmo defeito:** a janela de entrega usa o mesmo caminho. O teste K1 da 135 (`RequisicoesEntregavelDividido.test.js:155`)
  dispara o foco com a janela aberta, mas sem digitar nada — por isso passava (o inicial é igual ao que estava).
- **O que a janela mostra:** separação lista só `maxQtdSeparacao(i) > 0` (`:2421`), entrega só `maxQtdEntrega(i) > 0` (`:2548`); mas
  `handleSeparacao` (`:884-911`) e `montarItensEntrega` (`:944-975`) mandam **todo** item com quantidade > 0 no estado, visível ou não.
  Manter um digitado de item que saiu da janela mandaria quantidade escondida.
- **C452:** `handleCompletarEntrega` (`:1096-1109`) só é ligado ao botão **Completar Entrega** (`:2106`), que só renderiza com
  `podeEntregar = temPendenteComEstoque(...)` (`:2096`) = `temEntregavel` (`:120-122`) — a condição do primeiro `if`. O ramo
  `precisaSeparar`, o `else` com o toast e o estado `entregaAposSeparar` (`:392`, lido em `:916-920` e `:933`) são inalcançáveis.

## Regras

- **RN-195.01** — Com a janela de **separação** aberta, recarregar o detalhe da **mesma** requisição (foco, volta para a aba, ou
  qualquer outro `abrirDetalhe`) mantém a quantidade de cada item que já estava na janela e continua nela.
- **RN-195.02** — O recarregamento continua acontecendo e o resto é atualizado (detalhe, "Já separado", saldo, status). Só as
  quantidades digitadas ficam.
- **RN-195.03** — Item que saiu da janela no recarregamento (o máximo caiu a 0 — ex.: outra pessoa separou tudo) volta ao inicial (0
  na separação, ausente na entrega): nada escondido vai no envio. Item que não existia no estado recebe o inicial. Item que sumiu do
  detalhe sai do estado. Digitado acima do novo máximo **fica como digitado** (as regras de hoje valem como se ele tivesse digitado
  agora; nada muda sem ele ver).
- **RN-195.04** — A mesma guarda vale para a janela de **entrega** (`quantidadesEntrega`).
- **RN-195.05** — Com a janela fechada, o recarregamento repõe as quantidades iniciais como hoje (o `handleAprovar` com separação
  depende disso).
- **RN-195.06** — O "Sai de" continua como estava (189 e 58/59 intocadas).
- **RN-195.07** — C452: o ramo `precisaSeparar` e o estado `entregaAposSeparar` saem; **Completar Entrega** abre a entrega direto.

## Cenários (teste novo `RequisicoesQuantidadesNoRecarregar.test.js`)

1. Separação aberta, digita 3 (inicial 5), `visibilitychange` → GET do detalhe acontece (premissa), campo continua 3, um dado novo do
   servidor aparece (metade positiva: "Saldo: 18"), e o PUT manda 3. (RN-195.01/02)
2. Mesmo com `focus`. (RN-195.01)
3. Separação aberta, item 2 digitado, outra pessoa separa o item 2 (sai da janela) → o item 1 continua digitado e o PUT não leva o item 2.
   (RN-195.03)
4. Entrega aberta, digita 1 (inicial 2), foco → continua 1, PUT manda 1. (RN-195.04)
5. Sem janela aberta: foco recarrega e, abrindo a separação, vem o inicial do detalhe novo. (RN-195.05)
6. Separação com "Sai de" escolhido + quantidade digitada → foco → os dois continuam. (RN-195.06)
7. Completar Entrega abre a janela de entrega (as suítes da 135 já cobrem; RN-195.07 é remoção de código morto, sem cenário novo).

Rodar também as suítes `RequisicoesSeparacao*`, `RequisicoesEntrega*`, `RequisicoesPreSelecaoFluxo`, `RequisicoesSeparavelDividido`,
`RequisicoesEntregavelDividido` e `RequisicoesList.test.js` (prefixo `src/components/almoxarifado/Requisicoes`).

## Implementação

- `janelasAbertasRef` atualizado no corpo do render com `{ separar: showSeparar, entregar: showEntregar }` (`aplicarDetalhe` segue
  `useCallback([])` — não muda as dependências do listener).
- `aplicarDetalhe(data, id)`: `mesmo = loadedDetalheIdRef.current === id` lido **antes** de gravar o id; se `mesmo` e a janela aberta,
  `setQuantidades*(prev => manterDigitado(prev, inicial, visivel))`, senão o inicial como hoje. Helper puro no topo do arquivo.

## Letra B proposta (para `docs/almoxarifado-novidades-por-etapa.md`)

- **B1309** — A guarda fica em `aplicarDetalhe` (quem apaga), não no listener: o recarregamento ao voltar continua (mostra o que
  outra pessoa mudou e os tetos dependem do detalhe fresco). **Descartado:** não recarregar com janela aberta (perde o detalhe fresco);
  guardar só no listener de foco (outro `abrirDetalhe` com janela aberta apagaria igual).
- **B1310** — Item que saiu da janela volta ao inicial; item novo recebe o inicial; item sumido sai; digitado acima do novo máximo fica.
  **Descartado:** limitar em silêncio ao novo máximo (muda o número sem ele ver); manter também o digitado de item que saiu da janela
  (iria no envio sem aparecer).
- **B1311** — A guarda vale para a entrega também (mesma função, mesmo defeito). **Descartado:** só a separação (deixaria o gêmeo).
- **B1312** — C452 removido, não consertado: **Completar Entrega** só aparece com algo entregável, então o "separar e depois entregar"
  nunca rodou. **Descartado:** fazer o ramo funcionar (mudaria o botão, fora do escopo de 1h; o C452 já documenta a ausência).

## O que não cobre

- Se o recarregamento mostra que a requisição saiu do status (outra pessoa entregou tudo), a janela continua aberta com o detalhe novo,
  como hoje; o servidor recusa o envio (409 → a janela fecha, Etapa 94).
- Motivos digitados nunca eram apagados pelo recarregamento (não estão em `aplicarDetalhe`); nada muda neles.

## Execução

- [x] Plano — `f8398b40`.
- [x] Código + teste — `650db899`: `manterDigitado` (helper puro), `janelasAbertasRef` (janelas abertas **e** os itens do detalhe na
  tela, lido no render), `aplicarDetalhe` com a guarda; C452 removido (`handleCompletarEntrega` = `abrirModalEntrega()`, sem
  `entregaAposSeparar`). Teste novo `client/src/components/almoxarifado/RequisicoesQuantidadesNoRecarregar.test.js` (7 cenários).
- **Vermelhos medidos (antes do código):** 5 de 6 caíram no valor do campo — separação `3→5`, `2→5`, `3→5`, `4→5`; entrega `1→2`
  (o C454 da entrega, que dizia "não medido", agora está medido). O de janela fechada (RN-195.05) passava antes, como devia.
- **Divergência do plano, achada pela suíte:** a primeira versão mantinha o digitado de todo item que continuava na janela; o J2 da 189
  ("item que saiu da janela e voltou na mesma abertura → decidido de novo") caiu: o item voltava com o 0 de quando saiu e a frase ganhava
  o "Entregue esta parte…". Corrigido: só fica o digitado de item que **estava** na janela no detalhe da tela (RN-195.03 ganhou o
  cenário "saiu e voltou", o 7º).
- **Controles positivos** (sabotagem por Edit, restauro por Edit inverso, md5 `7f07902fe693d82b893c74cb83394140` igual ao
  pós-implementação):
  1. guarda tirada nas duas (`false && …`) → caem 6 (todos menos RN-195.05);
  2. guarda só na separação → cai `[RN-195.04] entrega aberta, digita 1…`;
  3. sem a regra "estava na janela" → caem `[RN-195.03] item que saiu da janela e voltou…` e o `[Fase 5, J2] item que saiu da janela e
     voltou…` da 189;
  4. mantendo o digitado de item fora da janela → cai `[RN-195.03] outra pessoa separa o item 2 no meio…`;
  5. guarda sem olhar se a janela está aberta → cai `[RN-195.05] janela fechada: "Aprovar e Separar"…`.
  O `mesmo` (mesmo id) não tem controle: pela tela a janela cobre a lista, então não há troca de requisição com janela aberta — a
  condição fica por segurança (NO-OP declarado).
- **Placar:** `src/components/almoxarifado/Requisicoes` 17 suítes / 327 testes verdes; tela inteira 211 suítes / 2893 testes verdes;
  `CI=true npx react-scripts build` sem warning.

## Fase 5 — revisor fresco (2026-11-05)

Um revisor fresco, por leitura e execução, sobre `650db899`. **Nenhum defeito.** Duas lacunas de teste:

1. **[MENOR] B1310 sem teste** — trocar `qtds[item.id] = anteriores[item.id]` (`RequisicoesList.js:129`) por
   `Math.min(Number(anteriores[item.id]) || 0, Number(iniciais[item.id] ?? 0))` (limitar em silêncio ao novo máximo, a alternativa
   descartada da B1310) deixava 327/327 verde. **Consertado em `727792a3`** (só o teste): cenário novo
   `[RN-195.03, B1310] digitado 4 com máximo 5; outra pessoa separa 3 (máximo 2) -> o campo continua 4, sem limitar em silêncio`, com a metade
   positiva *"Já separado: 3"* (o detalhe novo foi aplicado). **Controle positivo:** com a sabotagem acima, cai **só** o cenário novo
   (`● Etapa 195 — … › [RN-195.03, B1310] digitado 4 com máximo 5; …`, 1 de 8); restaurado por `git checkout --` (a produção já estava
   commitada e só o teste mudou), md5 `7f07902fe693d82b893c74cb83394140` igual ao de `650db899`.
   **Por que a B1310 é segura:** o digitado acima do novo máximo não passa — o servidor recusa o envio com a conta inteira, antes de gravar:
   separação *"⟨material⟩: não é possível separar ⟨X⟩ ⟨un⟩. Máximo: ⟨m⟩ (pendente: …, disponível: …)"*
   (`server/services/almoxarifado/requisitionService.js:1388-1394`, em `separarSemTrava`); entrega *"⟨material⟩: não é possível entregar ⟨X⟩
   ⟨un⟩. Máximo: …"* (`:1905-1907` e `:1962-1964`). E a janela continua aberta com o digitado nessas recusas (manual 10.2). Limitar calado
   mudaria o número sem o almoxarife ver.
2. **[MENOR] a guarda `mesmo`** (`RequisicoesList.js:698`, `loadedDetalheIdRef.current === id`) é redundante hoje: `abrirDetalhe` faz
   `setDetalhe(null)` ao trocar de id (`:748`) e os ids de item são únicos entre requisições — o `estavam` de `manterDigitado` já não casaria
   item de outra requisição. **Declarada sem controle, sem teste** (não há como derrubá-la pela tela: a janela cobre a lista, e com outro id
   os itens são outros). Fica por segurança, contra uma mudança futura em `abrirDetalhe`.

**Placar depois da Fase 5 (sobre `727792a3`):** `src/components/almoxarifado/Requisicoes` **17 suítes / 328 testes** verdes; tela inteira
**211 suítes / 2894 testes** verdes. Suítes do servidor não rodadas (a etapa é só tela).

- [x] Fase 5 — `727792a3`.
- [x] Fechamento de documentação — commit "Etapa 195: fechamento - novidades, specs, mapa, guia, manual e planos": novidades (cabeçalho,
  seção da 195 com Antes → Agora e cenários; **B1309** a **B1312**; **C454** e **C452** resolvidos; D (195); F (195) — nenhum clique no
  navegador), spec 05 (cabeçalho e seção com checklist e hashes), mapa (linha da 05), guia (cabeçalho e seção com roteiro), manual (10.2 e
  7.5: o recarregamento mantém as quantidades digitadas), este plano e o cabeçalho do plano da pausa. Verificação final e estimado × gasto:
  fora deste commit (feitos por quem fecha a etapa).

**Divergências do plano, em resumo:** (1) a regra "mantém o digitado de todo item que continua na janela" caiu na suíte da 189 (J2) e virou
"só de item que **estava** na janela no detalhe da tela" (RN-195.03 ganhou o cenário "saiu e voltou"); (2) o C454 da entrega, que dizia
"não medido", foi medido (`1→2`) e consertado pela mesma função; (3) o `mesmo` ficou sem controle (Fase 5, achado 2).

**Retro (4 números):** rodadas de correção até verde: **1** (na execução — o J2 da 189 caiu na primeira versão); achados reais da Fase 5:
**0 defeitos, 2 lacunas de teste** (uma coberta, uma declarada), ruído **0**; paralelismo: **nenhum** (etapa de 1h, uma frente só);
defeito que escapou da 194: **nenhum conhecido**.

## Próxima tarefa detalhada

**"Separar em duas vezes — 1ª parte: o local de onde sai"** — item 4 da fila da estimativa
`docs/estimativas/2026-11/estimativa_2026-11-05_almoxarifado-proximas.md` (**motor**). Fecha (ou reduz) o **C453**: separar uma requisição
em duas rodadas, de endereços diferentes, **sem entregar no meio**, troca a origem — grava uma troca no bloco **Substituições** e a entrega
sai no automático; em material com lote, a linha *sem lote* fica negativa (reproduzido na 189: 1 troca de 3 e −6 sem lote). Hoje a janela
só avisa (*"Entregue esta parte antes de separar o resto — separar o resto de outro endereço troca a origem."*, B1262). **É tronco**: motor
de estoque; `separarSemTrava` roda sob `travaPorRequisicao.serializarNaRequisicao` → `comTravaDaRequisicao` (trava por material dos itens).

**Onde a origem é escolhida e gravada (medido em 2026-11-05, sobre `727792a3`, sem consertar)** —
`server/services/almoxarifado/requisitionService.js`:
- **Entrada:** `separarRequisicao` (`:1281-1284`) → `separarSemTrava` (`:1286`), sob as duas travas.
- **O retrato da origem antes da rodada:** `planejadaAntes` (`:1336-1343`) — item com `origem_separacao_id` e separado pendente
  (separado − entregue > 0) guarda `{ origemId, loteId, pend }`; o mesmo pendente entra em `pedidoSeparacao` (`:1344-1347`, o comprometido
  do par).
- **A origem da rodada:** `entrada.localizacao_origem_id` / `entrada.lote_id` do payload (`:1400-1401`); `pendenteAntes` (`:1402`);
  `mesmoPar` (`:1407-1408`, par exato endereço+lote, Etapa 65).
- **A causa — a regra "mista → nula":** `planejada` (`:1441-1444`): com separado pendente **e** outro par, a origem do item vira
  `{ null, null }`. Gravada em `item.origem_separacao_id`/`lote_separacao_id` (`:1451-1452`) e no banco pelo `UPDATE
  itens_requisicao_almoxarifado SET quantidade_separada = ?, origem_separacao_id = ?, lote_separacao_id = ?` (`:1514-1516`).
- **A troca registrada:** depois da rodada, `INSERT INTO substituicoes_origem_requisicao … momento 'SEPARACAO'` (`:1537-1552`) para
  todo item que tinha planejada (`planejadaAntes`) e ficou sem origem.
- **Por que a entrega sai no automático:** a entrega só usa a planejada se `item.origem_separacao_id` existe (`:1817-1821`); nula, a baixa
  vai pela regra geral (endereço padrão, depois os com mais saldo) e, sem lote escolhido, sai da linha *sem lote* (o C451/B204).
- **Causa provável, em uma frase:** o item guarda **um** par de origem só (`origem_separacao_id`, `lote_separacao_id` — B1254); a 2ª rodada
  de outro endereço não tem onde guardar a sua parte e a regra da Etapa 65 apaga a origem para não mentir. O dado por rodada **já existe**:
  cada rodada grava em `separacoes_requisicao_almoxarifado.itens_json` o `localizacao_origem_id`/`lote_id` e a quantidade de cada item
  (`:1517-1530`). Na tela, a 2ª rodada do item com separado pendente não é pré-selecionada (RN-189: só item sem separado pendente), então o
  **Sai de** dele parte do automático — e o automático também é "outro par".

**Pontos de atenção (para a Fase 0/2):**
- Caminhos a pesar: (a) a entrega dividir a baixa pelas rodadas pendentes (`itens_json`), mantendo a coluna do item como "a última" — muda
  a ordem de baixa da entrega (Etapas 63 e 136) e o estorno/exclusão que devolvem por saída; (b) uma tabela de origens por item (par →
  pendente), com as mesmas contas em `pedidoSeparacao`, na régua de divergência (`:1420-1433`, `regua.saldoOrigem`) e na fila de separação
  (`planejados`, `:321-348`); (c) o mínimo: a 2ª rodada **no automático** (sem escolha) sobre separado pendente herda a planejada em vez de
  trocar — só a escolha explícita de outro par troca. O (c) é o menor e talvez seja a "1ª parte" do título; medir antes se o caso real é
  "automático" ou "outro endereço escolhido".
- Quem mais lê a planejada: devolver à prateleira (`:2509`, `:2520` — zera a origem), a entrega que zera ao esvaziar (`:2137-2139`), a
  conferência da troca da entrega (`:1839-1850`), a fila (`:321-348`) e o detalhe (`:954-955`, `:1038`).
- Teste de corrida, se a regra mudar o que a separação lê do saldo: o gesto concorrente disparado do contexto do teste, nunca de dentro do
  gancho (CLAUDE.md).
- Já pronto, não reabrir: o aviso da janela (B1262), a pré-seleção (189), as quantidades que ficam ao recarregar (195).
