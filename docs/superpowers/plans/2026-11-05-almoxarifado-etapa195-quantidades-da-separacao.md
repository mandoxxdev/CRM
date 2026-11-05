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
- [ ] Fechamento de documentação (novidades B1309–B1312, C454/C452, guia, manual, specs) — fica para depois da revisão.
