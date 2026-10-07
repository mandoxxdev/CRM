# Etapa 38 (linha `main`) — "1 CX contém 12 UN": a unidade de compra vira frase

> Origem: resposta do André à **D-35b** em 2026-10-07: *"não deve converter, eles acharam as
> legendas confusas e não entenderam como funcionava"*. A Etapa 35 tirou a unidade de consumo e
> explicou o fator — mas a tela **continua falando em "fator de conversão"**, que é linguagem de
> sistema. Esta etapa tira a palavra da tela e faz o campo ser a frase que a pessoa diria.
> Branch: `main`. **Zero linhas de servidor** (a coluna `fator_conversao_compra` e o Zod ficam).
> Baseline: client 54 suítes / 794 testes; `test:api` 172/172; build limpo.
> **Revisão de plano (Fase 2) dispensada, declarado:** uma tela, nenhum contrato de API, nenhuma
> regra de servidor; o executor faz a própria sabotagem e a revisão adversarial roda no fechamento.

## O que a tela tem hoje (`client/src/components/almoxarifado/MaterialAlmoxarifadoForm.js`, `34d348ed`+)
- Seção "Unidades e Custos" (`:898`): *Unidade de Compra* (`<select>`, `:920-921`) e *Fator de
  conversão* (`<input type=number>`, `:932-937`, placeholder "Ex.: 12 (1 CX = 12 UN)"), ajuda
  "Quantas UN há em 1 CX. Obrigatório e maior que zero." e o `.almox-help` com o exemplo vivo
  "1 CX = 12 UN. Informativo: … o sistema não converte sozinho." (`:938-949`); sem unidade de
  compra, "Só se aplica quando a unidade de compra é diferente da unidade de medida." (`:950-953`).
- Validação local (`:440`): toast quando há unidade de compra e o número não é > 0.
- Testes: `MaterialAlmoxarifadoForm.test.js:365-440` (RN-35) referenciam o rótulo `/^Fator de convers/i`
  (`:381`, `:400`) e o valor do input (`:434`).

## Regras (`grep RN-38`)
- **RN-38.01** Nenhum texto da tela de material contém "fator" nem "conversão" (em qualquer caixa).
- **RN-38.02** O campo *Unidade de Compra* ganha o rótulo **"Como é comprado"** com a opção vazia
  "— na própria unidade de medida (⟨UN⟩) —"; escolher uma unidade mostra, na linha de baixo, a
  **frase com o número dentro**: `1 ⟨CX⟩ contém [ 12 ] ⟨UN⟩` (input numérico inline,
  `aria-label="Quantidade de ⟨UN⟩ em 1 ⟨CX⟩"`, `data-testid="material-qtd-por-compra"`), e a nota
  "O estoque conta sempre em ⟨UN⟩. Este número é só informação para quem compra." Sem unidade de
  compra escolhida, **nada** disso aparece (nem a frase "Só se aplica…").
- **RN-38.03** O payload **não muda**: a chave continua `fator_conversao_compra` (número) e
  `unidade_compra`; o servidor e o Zod ficam como estão. Editar material com `ROLO`/`50` mostra
  "1 ROLO contém [50] M".
- **RN-38.04** Validação local: com unidade de compra e número vazio/zero, toast
  **"Informe quantas ⟨UN⟩ há em 1 ⟨CX⟩"** (sem a palavra fator) e nenhum POST.
- **RN-38.05** (G11, arquivo diferente) `MateriaisAlmoxarifado.js`: `familias` entra nas
  dependências da busca com debounce (`:83-86`), para `?familia_id=<sub>` na URL rebuscar quando a
  lista chegar. Teste: montar com `?familia_id=3` (sub da fixture) → depois de `familias` chegar, a
  última chamada de `GET /almoxarifado/materiais` tem `{ familia_id: 1, subfamilia_id: 3 }`.

## Tasks (um executor, client)
- **T1** — `MaterialAlmoxarifadoForm.test.js`: **substituir** as asserções que citam "Fator de
  convers" (`:381`, `:400`, `:434`) pelas de RN-38 e acrescentar: (a) `container.textContent` não
  casa `/fator|convers/i` com e sem unidade de compra; (b) escolher CX → aparece "contém" e o input
  `material-qtd-por-compra`; digitar 12 → POST com `fator_conversao_compra: 12` e `unidade_compra: 'CX'`;
  (c) sem unidade de compra o input não existe e o texto "Só se aplica" não existe; (d) edição com
  ROLO/50 → input vale "50" e a frase mostra "1 ROLO contém" e "M"; (e) CX sem número → toast
  "Informe quantas UN há em 1 CX" e nenhum POST. Vermelho → implementar → verde → sabotagem (voltar
  o rótulo "Fator de conversão"; tirar a validação) → vermelho → restaurar **por edição**.
- **T2** — RN-38.05 em `MateriaisAlmoxarifado.js` + teste em `MateriaisAlmoxarifado.test.js`.
- **T3** — `docs/almoxarifado-manual-do-sistema.md` §2.3: trocar o parágrafo do fator pela frase
  ("Como é comprado: 1 CX contém 12 UN — informação para quem compra; o estoque conta em UN").
  Marcar este plano com hashes; retro curta. **Não** tocar no doc de novidades (integrador).
- Jest inteiro do client + `CI=true build` no fim; citar números.

## Retro (preencher no fechamento)
- Rodadas de correção até verde: _preencher_
- Achados da revisão: _preencher_
- Paralelismo: _preencher_
- Defeito escapado: preencher na etapa seguinte.
