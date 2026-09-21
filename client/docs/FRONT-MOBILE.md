# O front de celular do Orion

**Leia isto antes de criar um módulo, uma tela ou uma função nova.**

O objetivo deste documento é simples: **você não deveria precisar escrever CSS de
celular.** Se a tela nova seguir as convenções abaixo, ela já nasce funcionando
no aplicativo. Quando não seguir, o guarda avisa.

---

## 1. O que já acontece sozinho

Três camadas trabalham antes de você escrever qualquer coisa.

### a) Toda tabela vira cartão

`src/utils/tabelasComoCartoes.js` observa a página inteira e converte **qualquer**
`<table>` em lista de cartões quando a tela tem 768px ou menos. Ele deduz o papel
de cada coluna pelo conteúdo e monta a hierarquia:

| papel      | como é detectado                              | como aparece             |
|------------|-----------------------------------------------|--------------------------|
| `foto`     | célula só com `<img>`                          | miniatura à esquerda     |
| `id`       | texto curto, sem espaço, com dígito            | código pequeno, no topo  |
| `situacao` | célula com badge/status/selo, ou coluna "Status" | pílula no canto        |
| `titulo`   | o texto mais longo entre as 5 primeiras colunas | nome em negrito         |
| `valor`    | primeira célula em `R$`                        | número grande            |
| `acoes`    | célula com botões/links e pouco texto          | barra embaixo            |
| `meta`     | todo o resto                                   | `RÓTULO: valor`, discreto |

**A única coisa que você precisa fazer:** dar um `<thead>` com `<th>` nomeados à
sua tabela. Sem cabeçalho não há de onde tirar rótulo, e a tabela volta a rolar
de lado.

Para deixar uma tabela de fora (é raro; um calendário, por exemplo):

```html
<table data-sem-cartoes>
```

### b) As convenções de nome recebem a pele do aplicativo

`src/styles/app-glass.css` estiliza por **padrão de nome de classe**, não por
componente. Use estes nomes e o visual vem junto:

| se a classe contém… | recebe                                    |
|---------------------|-------------------------------------------|
| `-card`             | vidro, canto 22px, sombra, entrada animada |
| `-panel`, `-modal`  | vidro e canto                              |
| `-busca`, `-search` | pílula de busca, com o campo sem caixa própria |
| `-chips`            | fileira rolável com máscara na borda        |
| `chip`, `badge`, `pill`, `tag` | pílula                          |
| `-folha`, `-sheet`, `-drawer` | folha que sobe de baixo          |
| `btn-primar`, `-primario` | gradiente azul da marca              |

Exemplo: chamar a lista de `minha-feature-card` já dá cartão de vidro com
animação de entrada — sem uma linha de CSS sua.

### c) As proteções estruturais

`src/styles/mobile-app.css` impede os estouros clássicos: largura máxima em
cartões e modais, `flex-wrap` nas famílias de cabeçalho e barra, `min-width: 0`
em filhos de grade, campos com 16px (abaixo disso o iOS dá zoom ao focar).

---

## 2. As cinco regras que não dá para quebrar

Cada uma nasceu de um defeito **real** deste projeto.

### 1. `backdrop-filter` só em elemento parado

Um elemento desfocado que se move obriga o navegador a re-amostrar o fundo a
cada quadro. Foi o que travava o menu lateral e as folhas.

- **Parado** (barra de topo, dock, modal já aberto): pode desfocar.
- **Se move** (gaveta, folha, cortina): fundo sólido, use `var(--ag-solido)`.

### 2. Altura fixa não convive com quebra de linha

A camada global força `flex-wrap: wrap` em tudo que casa com *header*,
*toolbar*, *barra*, *actions*, *filtros*. Se o seu container tem `height: 52px`
fixo, os filhos quebram em três linhas e **vazam para fora da caixa**, por cima
do conteúdo. Foi exatamente o defeito da barra de "Ver proposta".

Use `min-height`, nunca `height`, nesses containers.

### 3. Anime só `transform` e `opacity`

São as duas propriedades que o navegador resolve no compositor, sem refazer
layout nem pintura. Animar `width`, `top`, `box-shadow` ou `background` custa um
recálculo por quadro.

E não anime `scale` num elemento que tem `filter: blur()` — escalar obriga a
refazer o desfoque; deslocar, não.

### 4. Nada de largura fixa acima de 360px

Um `min-width: 800px` cria rolagem lateral na **página inteira**, não só no seu
componente. Se precisar de espaço, use `min-width` dentro de um
`@media (min-width: 769px)`.

### 5. Componente só de celular nasce escondido

Se você criar um bloco que só existe no telefone, declare-o escondido no CSS do
**próprio componente** e ligue-o dentro do media query:

```css
.minha-lista-mobile { display: none; }          /* no seu Componente.css */

@media (max-width: 768px) {
  body .minha-lista-mobile { display: block; }  /* no app-glass.css */
}
```

O `body ` na frente não é enfeite. O CSS do seu componente viaja num *chunk*
que o webpack injeta **depois** do `main.css`; em empate de especificidade
ganha o último, e o último é sempre o chunk. Subir um degrau tira a decisão da
ordem de carga.

---

## 3. O guarda

```bash
npm run check:mobile
```

Compara o estado atual com `scripts/mobile-baseline.json` e **falha só quando
algum número piora**. Ele não reprova a dívida que já existe — reprova a dívida
nova.

```bash
npm run check:mobile -- --detalhar   # mostra cada ocorrência
npm run check:mobile -- --gravar     # baixa a linha de base após corrigir algo
```

O script tem um **controle positivo**: antes de dizer "está tudo bem", ele prova
que ainda consegue enxergar um caso que sabidamente existe. Uma verificação que
não acha nada pode estar certa — ou quebrada — e as duas coisas são
indistinguíveis sem esse teste.

---

## 4. Quando vale escrever uma lista à mão

A conversão automática é boa e resolve a maioria. Uma lista dedicada (como
`.plm` em Propostas e `.prm` em Produtos) vale a pena quando:

- a tela é das mais usadas no celular, **e**
- a hierarquia precisa de algo que a heurística não adivinha (um desconto
  calculado, duas ações destacadas em vez de uma).

Nesse caso, a regra que importa: **reaproveite os handlers da tabela.** Na lista
de propostas e na de produtos, `podeEnviar`, `handleDelete`, `handleClonar`,
`formatCurrency` e as permissões são os mesmos objetos da tabela. Não é economia
de código — é não ter duas listas de regras que divergem no dia em que uma
mudar.

---

## 5. Onde cada coisa mora

| arquivo | papel |
|---|---|
| `src/styles/app-glass.css` | a pele do aplicativo. **Tudo** dentro de `@media (max-width: 768px)`, com uma única exceção documentada no topo. |
| `src/styles/mobile-app.css` | proteções estruturais (estouro, quebra, alvo de toque). |
| `src/utils/tabelasComoCartoes.js` | conversão automática de tabela em cartão. |
| `src/components/BarraInferiorMobile.js` | o dock. Os itens vêm dos **mesmos** `menuItems` da sidebar. |
| `src/components/FundoAppMobile.js` | o fundo animado (portal para o `body`). |
| `scripts/verificar-mobile.js` | o guarda. |

**A regra de ouro do `app-glass.css`:** nenhuma regra fora do media query. O
sistema no computador não pode mudar, e é isso que garante.
