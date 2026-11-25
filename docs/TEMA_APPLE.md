# Tema visual Apple — o sistema inteiro (computador e celular)

> **Onde parou:** o visual do sistema todo foi trocado por um tema inspirado na Apple —
> fundo quase branco, superfícies brancas, vidro de verdade só onde conteúdo passa por
> baixo (barra lateral, topo, dock, modais), **uma** cor de ação (azul `#0071E3`), botão
> principal em pílula, cantos suaves, sombras quase invisíveis, tipografia do sistema,
> movimento curto e **sem fundo animado**. O login ganhou um cartão de vidro centrado e
> um **logo novo** em estilo de ícone de aplicativo. Nenhuma função mudou.

## O que você vê (Antes → Agora)

| Onde | Antes | Agora |
|---|---|---|
| Login | Fundo azul-marinho com manchas, barras girando e um aperto de mãos ao fundo; botão **laranja** | Fundo quase branco com um halo azul suave, cartão de vidro centrado, logo novo (ícone azul com anel orbital), campos cinza preenchidos, botão **pílula azul** |
| Seletor de módulos | Cinco manchas coloridas de fundo, esferas flutuantes, pássaro no canto, selo "FULL ACCESS" rosa | Fundo limpo com um halo só; esferas e pássaro saem; selo neutro; busca em pílula; cartões de módulo com canto 18 e sombra suave (cor mantida — é identidade) |
| Barra lateral (computador) | Escura/translúcida com item ativo em barra azul e brilho | Vidro claro (`blur 24px`), hairline, item ativo em **pílula azul-clara** sem barra nem brilho; "Minha Conta" neutro e "Sair" em vermelho suave |
| Botões | Gradientes (azul→ciano, verde→turquesa, laranja), brilho e "pulo" no hover | Sólidos no tom do sistema (azul, verde, vermelho, âmbar), pílula, sem sombra; secundário cinza com texto azul |
| Campos | Caixa branca com borda cinza de 1px | Preenchido em cinza claro, sem borda; **borda e anel azuis só no foco** |
| Cartões, modais, painéis | Superfície cinza com sombra pesada | Branco, canto 16 (modal 20), hairline, sombra quase invisível; cortina do modal leve e desfocada |
| Tabelas | Cabeçalho azul com texto branco | Cabeçalho cinza miúdo em maiúsculas, linhas com hairline |
| Etiquetas de status | Retângulos em caixa alta | Pílulas suaves (verde/âmbar/vermelho/azul em tinta leve) |
| Fundo animado (malha, constelação, esferas) | Em todas as telas | **Sai de todas** — calma é parte do estilo |
| Selo "Orion-BETA-V0" | Flutuava no canto | Some |
| Celular | Pele de vidro **azul** (três manchas fortes, botão em gradiente) | A mesma estrutura (dock em pílula, gaveta, cartões ricos), agora em vidro **neutro**: fundo quase branco, manchas como um sopro, botão principal azul sólido |

## Por que isto não quebra nada

É **só CSS**: um arquivo novo, `client/src/styles/apple-theme.css`, importado por último em
`App.js`. Nenhum componente, rota, handler, chamada de API ou dado foi alterado. As únicas
mudanças fora do CSS são (1) o import, (2) o `<img>` do login apontar para o logo novo e
(3) o próprio arquivo do logo (`client/public/orion-mark.svg`). O logo original
(`logo.png`) **continua** no repositório, na barra lateral e na barra de topo.

Como o tema é aplicado, da alavanca mais barata para a mais pontual:

1. **Variáveis.** O design system inteiro lê `--gmp-*`, `--glass-*`, `--sidebar-*`,
   `--elevation-*`, `--radius-*`. Trocar o valor da variável re-pinta cards, modais,
   tabelas, formulários e a barra lateral sem brigar com especificidade.
2. **Componentes.** O que estava escrito à mão (gradientes de botão, laranja do login,
   item ativo da gaveta, selos de acesso, fundos decorativos) é sobrescrito pelo próprio
   seletor, com `!important` onde a base já usava `!important` (glass-override, app-glass).
3. **Celular.** O `app-glass.css` (só celular) decide a pele pelas variáveis `--ag-*`; o tema
   as redefine para o vidro neutro, dentro do mesmo `@media (max-width: 768px)`. A estrutura
   dele fica inteira.

## Como voltar atrás

Remova (ou comente) **uma linha** em `client/src/App.js`:

```js
import './styles/apple-theme.css';
```

O sistema volta exatamente ao visual anterior. Para voltar só o logo do login, troque o
`src` em `client/src/components/Login.js` de `/orion-mark.svg` para `/logo.png`.

## Como foi verificado

- `CI=true npx react-scripts build` — **passou** (warnings viram erro no CI): sem aviso novo.
- Dev server: "Compiled successfully", **zero erros no console** nas telas testadas.
- Login: no celular por imagem; no computador por **medição** (botão `rgb(0,113,227)`,
  título `#1D1D1F`, opacidade 1 em toda a cadeia, logo 84px sem filtro).
- Seletor de módulos, Dashboard e Clientes (computador): por **medição** — `.main-content`
  renderizado, 11 cartões de módulo, card branco raio 16 com sombra suave, sidebar
  `rgba(255,255,255,.72)` + `blur(24px)`, selo e fundos animados ausentes.

> **Por que medição e não só captura:** nas telas com `backdrop-filter` e manchas
> desfocadas, a captura do painel sai lavada ou branca mesmo com a página renderizada —
> é artefato de composição da captura, não defeito. Por isso o veredito veio de
> `getComputedStyle`/`getBoundingClientRect`, e a captura só confirma onde sai nítida
> (login, telas sem desfoque).

## O que o tema NÃO faz

- Não mexe em lógica, permissões, rotas, textos ou dados.
- Não altera os **gradientes dos cartões de módulo** (identidade de cada módulo) — só os
  acalma (`saturate(.88)`), arredonda e dá sombra suave.
- Não remove o `app-glass.css` nem o `mobile-app.css`: harmoniza por cima deles.
- Não redesenha telas uma a uma; é a pele global. Telas com cor escrita inline no JSX
  continuam valendo do `contrasteNoCelular.js` no celular.

## Notas para a próxima sessão

- Arquivos: `client/src/styles/apple-theme.css` (tema), `client/public/orion-mark.svg`
  (logo), `client/src/App.js` (import), `client/src/components/Login.js` (logo do login).
- Para capturar telas com vidro no painel, prefira medir por JS ou capturar em
  largura de computador (≥769px), onde não há manchas desfocadas.
- Usuário de teste `claude.review@local.test` (superadmin local, script
  `server/scripts/seed-claude-review-user.js`, não versionado) ainda existe — remover
  quando não for mais necessário.
