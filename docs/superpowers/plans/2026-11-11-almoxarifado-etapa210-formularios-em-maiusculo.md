# Etapa 210 (núcleo) — textos dos formulários em maiúsculo

> Pedido da empresa via André (11/11/2026): "mudar todos os textos de todos os formulários pra caps lock, tanto ao digitar quanto
> colar". Estimativa `99e780ba` (`docs/estimativas/2026-11/estimativa_2026-11-11_formularios-em-maiusculo.md`): 5h30 (4h + 1h30).
> A Etapa 209 (almoxarifado, T0–T5 feitas) fica parada na T6 e é retomada depois desta.

## Medido antes (Fase 0)

- 141 arquivos de tela com `<input>`/`<textarea>`, 949 campos, 475 não texto. 22 `email`/`password`/`url`.
- Já existe a regra no fornecedor (Compras 192, `e8bd4374`): CSS `text-transform` + corpo subido no envio, porque trocar o valor a
  cada tecla "pulava o cursor". Aqui o pedido inclui **colar** e é para **todos** os formulários: trocar tela a tela (141 arquivos)
  é o caminho caro e esquecível (tela nova nasceria minúscula). Escolhido: um **utilitário global** iniciado no `index.js`, como os
  três do celular (`iniciarTabelasComoCartoes` etc.), que vale para tela que ainda nem existe.
- O servidor já tem `services/buscaSemCaixa.js` (Etapa 159): a busca procura o termo como veio, em MAIÚSCULAS e em minúsculas, porque
  o `LIKE` do SQLite só ignora a caixa sem acento (`'SÃO' LIKE '%são%'` = 0). Várias buscas ainda usam `LIKE` cru.

## Regras de negócio

- **RN-210.01** — Campo de texto (`<input>` de tipo texto, ou sem tipo, e `<textarea>`): o que é digitado **ou colado** vira
  MAIÚSCULO com acento (`toLocaleUpperCase('pt-BR')`, "são joão" → "SÃO JOÃO") no mesmo instante, e o valor que a tela guarda e
  envia já é o maiúsculo. O cursor fica onde estava (corrigir no meio do texto não pula para o fim).
- **RN-210.02** — Ficam **fora**: e-mail, senha, endereço de site (`type` email/password/url, ou `name`/`id`/`autocomplete` que diga
  e-mail, senha, url, site, link, token, host); campos numéricos/data/etc. (não são texto); **caixas de busca e filtro** (`type=search`
  ou placeholder começando com Buscar/Pesquisar/Procurar/Filtrar) — não são dado gravado, e a busca já ignora caixa; o **editor do
  documento da proposta** (texto editável dentro da folha, não é campo); a **mensagem do chat** (conversa, não formulário); e qualquer
  campo marcado com `data-sem-maiusculas` (a saída para casos futuros).
- **RN-210.03** — Teclado de celular que monta a palavra (composição): não mexe no meio da composição; sobe quando a palavra fecha.
  Enquanto isso o campo **mostra** em maiúsculo (CSS), então quem digita não vê minúscula.
- **RN-210.04** — Os cadastros já gravados **não** são convertidos (conversão em massa é irreversível — letra B). Um campo antigo em
  minúsculo só sobe se for editado.
- **RN-210.05** — A busca do servidor acha o texto em qualquer caixa, com acento: as buscas que ainda usam `LIKE` cru passam a usar a
  `condicaoDeBusca` da 159 (como veio, MAIÚSCULAS, minúsculas). Assim "são" acha o "SÃO" novo e "SÃO" acha o "são" antigo.

## Contratos

Nenhuma rota nova nem mensagem nova. RN-210.05 só muda o que as buscas existentes acham (passam a achar mais, nunca menos: a forma
"como veio" continua no `OR`).

## Tasks

| # | Task | Tipo | Estado |
|---|---|---|---|
| T1 | `client/src/utils/maiusculasNosFormularios.js` (`iniciarMaiusculasNosFormularios`, `campoVaiEmMaiusculas`) + teste Jest com controle positivo; iniciado no `index.js`; CSS da classe de foco | galho (tela) | — |
| T2 | Exclusões explícitas: `data-sem-maiusculas` no chat e no que a varredura achar | galho (tela) | — |
| T3 | Servidor: buscas com `LIKE` cru de texto digitado → `condicaoDeBusca`; teste pelo servidor real | galho (servidor) | — |
| T4 | Integração: componente React controlado de verdade (estado recebe o maiúsculo ao digitar e ao colar) | integração | — |
| T5 | Fechamento (`fechar-etapa`) | — | — |

T1/T2 e T3 não dividem regra: a tela não depende do servidor e vice-versa (RN-210.05 vale mesmo sem a tela).

### Como a T1 funciona (para quem retomar)

Ouvinte de `input` em `document`, **fase de captura** — roda antes do React 18 (que escuta no `#root`). Sobe o valor pelo **setter
nativo** (`Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set`): atribuir `el.value = x` atualizaria o rastreador
de valor do React e o `onChange` não dispararia. Depois devolve a seleção (`setSelectionRange`) contando o comprimento do prefixo
subido. Com `isComposing`, não mexe; no `compositionend`, sobe e dispara um `input` novo.
