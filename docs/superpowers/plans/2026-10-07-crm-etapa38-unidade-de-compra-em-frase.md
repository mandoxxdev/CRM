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
- [x] **T1** (`f98fc160`) — `MaterialAlmoxarifadoForm.test.js`: **substituir** as asserções que citam "Fator de
  convers" (`:381`, `:400`, `:434`) pelas de RN-38 e acrescentar: (a) `container.textContent` não
  casa `/fator|convers/i` com e sem unidade de compra; (b) escolher CX → aparece "contém" e o input
  `material-qtd-por-compra`; digitar 12 → POST com `fator_conversao_compra: 12` e `unidade_compra: 'CX'`;
  (c) sem unidade de compra o input não existe e o texto "Só se aplica" não existe; (d) edição com
  ROLO/50 → input vale "50" e a frase mostra "1 ROLO contém" e "M"; (e) CX sem número → toast
  "Informe quantas UN há em 1 CX" e nenhum POST. Vermelho → implementar → verde → sabotagem (voltar
  o rótulo "Fator de conversão"; tirar a validação) → vermelho → restaurar **por edição**.
- [x] **T2** (`0c890f24`) — RN-38.05 em `MateriaisAlmoxarifado.js` + teste em `MateriaisAlmoxarifado.test.js`.
- [x] **T3** (hash no commit de fechamento) — `docs/almoxarifado-manual-do-sistema.md` §2.3: trocar o parágrafo do fator pela frase
  ("Como é comprado: 1 CX contém 12 UN — informação para quem compra; o estoque conta em UN").
  Marcar este plano com hashes; retro curta. **Não** tocar no doc de novidades (integrador).
- Jest inteiro do client + `CI=true build` no fim; citar números.

## Execução (branch `c38`, worktree `CRM-wt-c38`, 2026-10-07)
- **T1 `f98fc160`** — vermelho confirmado antes de implementar: 7 falhas / 24 ok (31). Verde 31/31.
  Sabotagens: rótulo "Fator de conversão" de volta → **7 falhas** (o seletor por rótulo cai junto
  com a RN-38.01); validação RN-38.04 removida → **1 falha** (só a (e)). Restaurado por edição.
  CSS novo: `.almox-frase-compra` + `.almox-input-inline` (o `.almox-input` tem `width: 100%`;
  sem a classe a frase quebrava em três linhas).
- **T2 `0c890f24`** — vermelho confirmado (`familia_id: "3"` em vez de raiz+sub). Verde 16/16.
  Sabotagem (tirar `familias` das deps) → **1 falha**. Restaurado por edição.
- **T3** — manual §2.3 reescrito (título "Unidades: como o estoque conta e como o item é
  comprado"; linha da tabela de seções em §2.1 também); este plano. Hash: o do commit que fecha.
- **Jest inteiro do client: 54 suítes / 799 testes** (baseline 794 → +5: o bloco RN-38 tem 5
  testes no lugar dos 2 do RN-35.02; +2 do RN-38.05). **`CI=true build`: "Compiled successfully"**,
  exit 0. Zero linhas de servidor (`git diff main --stat -- server/` vazio).

### Divergências do plano (decididas pelo caminho reversível)
- **RN-38.03 diz "número"; o payload manda string.** O form sempre mandou o que o `<input>` tem
  (`'12'`), e `numFromForm` no servidor (`schemas.js:296`) coage. Converter no client seria mudar o
  payload — e o plano manda não mudar. O teste assere `Number(payload.fator_conversao_compra) === 12`.
  Se um dia o Zod deixar de coagir, é uma linha no submit.
- **A antiga ajuda "Quantas UN há em 1 CX. Obrigatório e maior que zero." saiu** — a frase já diz
  isso; o "obrigatório" sobrevive no toast da RN-38.04.
- **O teste da RN-38.05 espera em dois `act`**: dentro de um `act` o React só aplica os updates no
  fim; num `act` único de 700ms a render da chegada das famílias saía tarde demais para reagendar o
  debounce. Não é defeito da tela — a primeira rodada vermelha com o `act` único enganou por 1
  rodada (o teste continuava vermelho depois da correção certa).

## Retro
- Rodadas de correção até verde: **T1 zero** (verde na primeira implementação após o vermelho);
  **T2 uma** — o erro estava no teste (espera num `act` só), não na correção.
- Achados da revisão: a revisão adversarial roda no fechamento do integrador. Achado próprio: o
  sabotador do rótulo derruba 7 testes e não 1, porque `selectUnidadeCompra()` busca pelo rótulo —
  é o preço de prender o texto que o usuário lê, e está registrado no cabeçalho do helper.
- Paralelismo: nenhum — T1→T2→T3 num executor só, como o plano previa (uma tela, um arquivo
  vizinho, um doc).
- Defeito escapado: preencher na etapa seguinte (os cinco achados abaixo foram pegos antes do push).

## Revisão adversarial (2026-10-07, só leitura) e onda de correção (`bc77464f`)

Revisor fresco sobre `9acb6c7d..a10174c5`. **Refutado:** texto visível com "fator/conversão" no
client (só comentários e nomes de chave sobraram); payload inalterado (`schemas.js` coage `''`→
ausente e `'12'`→12); edição de ROLO/50; CSS/mobile da frase (`flex-wrap`, o inline vence o
`width: 100%`, nada força largura em `input`). **Achados, todos reproduzidos por leitura e
fechados na onda:**

| # | Sev. | Achado | Correção | Prova |
|---|---|---|---|---|
| 1 | Major (doc) | O guia (`:749`, `:627`, `:738`) mandava procurar "Unidade de Compra"/"Fator de Conversão (Compra)", que saíram da tela | Linhas corrigidas com "era verdade até a Etapa 38" e nota no cabeçalho da cópia de `main` | leitura |
| 2 | Minor | Voltar "Como é comprado" para a própria unidade escondia a frase, mas o número digitado continuava no state e ia no POST (número órfão); no PUT `''` **preservaria** o antigo | payload `fator_conversao_compra: form.unidade_compra ? … : null` (null explícito, padrão dos FKs) | teste novo "voltar para a própria unidade → POST manda `null`"; sabotagem → **1 vermelho** |
| 3 | Minor | G11 em rede lenta: `familias` chegando depois dos 300 ms disparava um **segundo** GET e voltava a lista ao skeleton; comentário antigo contradizia a correção | dependência vira `familiasKey = familiaFilter ? familias.length : 0` (sem filtro, constante); comentário apagado | `MateriaisAlmoxarifado` 16/16 (RN-38.05 continua) |
| 4 | Minor | Obrigatoriedade sumiu da tela (o `*` foi embora com o rótulo antigo; a nota soava opcional) | `aria-required="true"` no input e "Obrigatório." na nota | teste novo |
| 5 | Minor | O select oferecia a própria unidade de medida ("1 UN contém [ ] UN") | `UNIDADES.filter(u => u !== form.unidade)` | teste novo |

Verificação da onda: `MaterialAlmoxarifadoForm` 34/34 + `MateriaisAlmoxarifado` 16/16.

**Integração medida em `main` (merge `a10174c5` + onda `bc77464f`):** client **54 suítes / 802
testes** (baseline 794 → +8: 5 RN-38 no lugar de 2 da RN-35.02, +2 RN-38.05, +3 da onda);
`CI=true npx react-scripts build` "Compiled successfully."; servidor **não tocado** nesta etapa
(`test:api` continua 172/172 da Etapa 37).
