# Tema visual Apple — o sistema inteiro (computador e celular)

> **Onde parou (24/11/2026, terceira rodada):** o computador foi **refeito** depois de o
> P.O. reprovar a primeira versão com uma captura ("olha o lixo que está o nosso") e um
> vídeo de referência (dashboard "V14": tela branca, pílulas, número gigante, cartão em
> gradiente). Hoje: tela branca, barra lateral com pílula escura, título grande sem
> cartão, **uma largura só** para todas as telas, Dashboard com número herói + cartão
> azul + gráficos redesenhados (uma família de cor, barras finas, grade mínima),
> **movimento** (entrada em cascata, contagem, varredura na troca de tema), a **tela de
> módulos nova** (saudação + catavento da GMP escrevendo "GMP Industriais", cartão
> "Continuar", cartões com descrição), telas de espera com o **catavento**, fonte **Inter**
> em tudo e a versão **V02** visível. Veja "Terceira rodada" abaixo. Nenhuma função mudou.

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

## Segunda rodada: a FORMA das telas (iOS no celular, macOS no computador)

O tema acima trocou cor, canto e sombra; a composição das telas continuava a mesma e o
P.O. apontou isso ("você só está tirando coisa"). A segunda camada,
`client/src/styles/apple-structure.css` (importada logo após o tema), muda a **forma**:

| Onde | Agora |
|---|---|
| Tela inicial (seletor de módulos) | **Launchpad / tela de início do iOS**: ícones squircle (62–84px) pintados com a cor do módulo, glifo branco, nome embaixo; saudação grande e leve; busca estilo Spotlight centrada. A parede de ladrilhos saiu. |
| Listas (Clientes, `MobileList`, tabela convertida) no celular | **Lista agrupada do iOS**: um bloco branco contínuo, fio entre as linhas, avatar à esquerda, título 17px, chevron à direita; ações como ícones discretos |
| Títulos no celular | **Large Title** (34px), subtítulo cinza; o "+" vira ação no canto do título e "Exportar" vira texto azul |
| Busca e filtros no celular | Pílula cinza de busca + filtros em pílula, sem cartão em volta |
| Login | **Apple ID**: logo 96px, uma linha, os dois campos **num único bloco agrupado** (fio entre eles), botão pílula; sem subtítulos, rótulos ou ícones nos campos |
| Barra lateral no computador | **Source list do macOS**: chip de conta (avatar + nome) no topo, linhas de 32px com ícone cinza, seleção em pílula azul-clara, "Minha Conta"/"Sair" discretos |
| Cabeçalhos de página no computador | **Toolbar unificada** de vidro, fixa no topo: título 17px à esquerda, ações à direita (secundário em texto azul, principal em pílula) — inclusive o cabeçalho do Dashboard, que tinha título em gradiente |
| Tabelas no computador | Estilo **Finder**: cabeçalho em texto cinza, linhas de 40px, zebra sutil, hover azul-claro |
| Dashboard | KPIs como **widgets** (blocos brancos de canto 20, número grande, legenda pequena), em grade |
| Telas de espera (`ModuleLoading`, `SplashScreen`, spinners, skeleton) | Mínimas: ícone do app centrado, indicador de atividade fino e cinza, uma linha de texto; sem cartão, brilho, barras de skeleton ou "100%" |
| Marca | O ícone novo (`orion-mark.svg`, **animado**: anel orbital gira, estrela percorre a órbita) passa a ser a marca em todo lugar — login, barra lateral (+ wordmark "Orion"), barra de topo, seletor, splash, loading, tela de erro e favicon. O `logo.png` continua no repositório. |

Continua sendo visual: nenhum elemento entra ou sai do DOM, nenhum evento muda. As únicas
mudanças em JSX são os `src` dos `<img>` de logo. Para voltar só a forma, remova o import
de `apple-structure.css`; para voltar a marca, troque os `src` de volta para `/logo.png`.

> Pendente, a depender do P.O.: a home estilo **apple.com** (hero com fotos grandes das
> máquinas) precisa de fotos em alta qualidade em `client/public/maquinas/` — sem elas não
> há o que mostrar.

## Terceira rodada (24/11/2026): o computador refeito, gráficos, movimento, tela de módulos

A segunda rodada no computador (source list cinza, toolbar de vidro, widgets com ícone)
foi **reprovada**: o P.O. mandou uma captura do Dashboard e um vídeo de referência (um
dashboard de fintech: tela branca e arejada, navegação em pílulas, saudação grande, um
número gigante, um cartão em gradiente, estatísticas soltas, gráficos de uma cor,
versão escura com o mesmo cartão) e pediu "disso para melhor", "as animações muito
parecidas", "gráficos refeitos", "fontes", "espaçamento igual em todas as telas", "tela
de módulos por completo", "o catavento do site da GMP em algum lugar", "V02".

| Onde | Agora |
|---|---|
| Tela (computador) | **Branca** (preta no escuro); o buraco de 70px no topo (reserva de um header que não existe) saiu |
| Barra lateral | Branca com um fio; lockup **Orion + V02** alinhado à coluna do menu (estava centrado e "largado"); "Selecionar Módulo" em botão cinza-claro; linhas de 34px; item ativo em **pílula escura** (clara no escuro); rodapé com avatar + nome e **Minha Conta / Sair como ícones** (o selo "FULL ACCESS" que estourava a largura saiu) |
| Cabeçalho das telas | Título 30px leve + subtítulo, sem cartão, sem toolbar de vidro; botão principal = **pílula escura**, secundário = pílula cinza-clara (também `.btn-pri/.btn-sec` das Propostas) |
| **Largura padrão** | A raiz de toda tela recebe a mesma caixa: máx. 1600, centrada, 40px de respiro (Clientes tinha 1600 e Propostas 1400 — começavam em x diferentes). Fora: chat, kanban, mapa, scanner |
| Dashboard | "Propostas aprovadas" vira o **número herói** (até 54px); "Propostas por status" vira o **cartão em gradiente azul** com brilho que respira e a marca no canto; taxa e clientes viram estatísticas soltas; o cartão "RESUMO COMERCIAL" com cabeçalho saiu; segmentado Geral/Vendas estilo macOS; sino e Filtros em pílula |
| **Gráficos** (`apple-charts.css` + `Dashboard.js`) | Paleta de **uma família** (azuis + neutros, em variáveis `--chart-*` que trocam no escuro) em vez de azul/verde/laranja; barras finas e arredondadas; grade só horizontal num fio; sem linha de eixo; ticks 11px cinza; tooltip em folha branca; rosca com cantos arredondados e vão da cor do painel; painéis cinza-claros sem borda nem fio azul; séries crescem em 900ms uma após a outra |
| **Movimento** | Entrada em cascata (título, herói, cartão, estatísticas, gráficos, cartões da tela de módulos); fade na troca Geral↔Vendas; brilho lento no cartão herói; **troca de tema por varredura** (View Transition: um círculo cresce a partir do controle tocado; onde a API não existe, troca como antes); tudo desligado com `prefers-reduced-motion` |
| Notificações | O painel caía no meio da tela e por baixo do cartão herói (ancestral com `transform`/`will-change` vira bloco de contenção do `position: fixed`). Sem o transform nos ancestrais, abre sob o sino; folha branca de canto 16 |
| **Fonte** | **Inter** em tudo (a pilha "do sistema" caía no Segoe UI no Windows — "as fontes zoadas") |
| **Tela de módulos** (`apple-launchpad.css`, `TipoSelecao.js`) | Refeita: lockup Orion + V02 no topo; saudação 52px com a **data** e o número de módulos; o **catavento da GMP** (até 240px) ao lado, que dá cinco voltas, assenta e **escreve "GMP Industriais"** em Caveat (a manuscrita do site, revelada em 2,6s, com um traço laranja); **"Continuar"** = o último módulo como cartão herói com o degradê do módulo + os outros recentes numa lista; **"Seus módulos"** = cartões brancos com fio, ícone em squircle, nome e **descrição** (existia em `modulosMeta` e não era mostrada); "Sem acesso" apagado com cadeado. No celular: 2 colunas |
| **Catavento** (`CataventoGMP.js/.css`) | A peça do site gmpindustriais.com (seção "g26") portada: 4 pás (verde, amarelo, vermelho, azul) com degradê e cubo branco; `entrada` (5 voltas + giro lento de 80s), `girando` (espera), `parado`; `legenda`/`legendaDestaque` escrevem a assinatura |
| Telas de espera | `ModuleLoading`: o catavento girando É o indicador (64px; 22px no compacto). `SplashScreen`: catavento com a assinatura + "Orion" + nome do módulo + fio de progresso — o logo com o ícone do módulo girando por cima ("símbolo de alvo") saiu |
| Versão | `constants/versao.js` (`V02`), ao lado do lockup na tela de módulos e na barra lateral |

Arquivos novos: `client/src/styles/apple-desktop.css`, `apple-charts.css`,
`apple-launchpad.css`, `client/src/components/CataventoGMP.js` + `.css`,
`client/src/constants/versao.js`. Alterados: `App.js` (imports), `apple-theme.css`
(Inter), `apple-structure.css` (saíram 1.2, 2.7 e 3.1–3.5, que esta rodada substitui),
`Dashboard.js` (paleta, eixos, raio e animação das séries — nenhum dado ou cálculo),
`ThemeContext.js` (varredura), `Layout.js` (title nos ícones, V02), `TipoSelecao.js`,
`ModuleLoading.js`, `SplashScreen.js`, `index.html` (Caveat).

**Para voltar atrás** por partes: remover um import em `App.js` desfaz a camada
correspondente (`apple-desktop.css` = computador; `apple-charts.css` = gráficos e
movimento; `apple-launchpad.css` = tela de módulos). A varredura de tema some apagando o
bloco `startViewTransition` de `ThemeContext.js` (volta o `setTheme` puro).

**Como foi verificado:** `CI=true npx react-scripts build` **passou**; no painel, por
medição e captura (as capturas com `backdrop-filter` saem lavadas — medi e, quando
precisei ver, desliguei o filtro só na captura): Dashboard a 874px e 1280px claro e
escuro, Clientes, Propostas (x=317 nas duas), formulário de cliente, tela de módulos a
1660px e 375px, painel de notificações sob o sino (x=1268 para o sino em 1697), troca de
tema (`data-theme` claro→escuro→claro com `--vt-*` gravados), splash do Comercial.

**O que não cobre:** as outras telas de cada módulo só receberam as regras globais
(largura, cabeçalho, botões, tabela); telas com cabeçalho ou botão de classe própria
podem ainda destoar — é olhar uma a uma. A home apple.com continua esperando fotos.

## Noite de 24/11: ajustes ao vivo em produção e o incidente do limitador

Depois do push da rodada 3 o P.O. passou a revisar **em produção** e mandou ajustes
curtos, todos atendidos no mesmo turno (commits `702faf39`, `a1796257`, `8ce98b18`, `662e8920`):

| O que ele viu | O que entrou |
|---|---|
| Tela branca ao abrir às 22:28 (console: `main.af73ec6c.js` 404) | Era a **troca de contêiner** do deploy (Coolify): o `index.html` novo veio de um contêiner e o JS foi pedido ao outro. Entrou um script inline no `index.html` que detecta o 404 do bundle principal, mostra "Atualizando o sistema…" e recarrega (até 3 vezes por aba; o app zera o contador ao subir). |
| "Muitas requisições" para todo mundo e telas vazias ("parece que zerou o banco") | O limitador da `/api` contava por `req.ip`, que atrás do proxy é **um só para a empresa inteira** (500 pedidos/15 min compartilhados). A noite de três deploys encheu o balde. Agora conta por **usuário do token** (sem token, pelo IP real do `x-forwarded-for`) e o teto padrão subiu para 1500. O banco não foi tocado: a API só recusava. |
| Esteira de logos parava ao passar o mouse | Segue rolando. |
| Produtos: "cada imagem parece ter um tamanho" | Cartões brancos com fio, foto 16:10 que preenche, número em pílula, "Ver famílias" como link (`apple-telas.css`, a folha dos ajustes tela a tela). |
| Barra lateral "sem vida" | Ícones em ladrilhos coloridos e, no rodapé, o **catavento + "GMP / INDUSTRIAIS"** em Inter (ele pediu a marca em todos os dashboards e "mais sério" aqui); no celular o catavento vai para a barra de topo. |
| Botão "Fundo Animado" sem serventia | Saiu do menu de Preferências (o fundo animado não é mais desenhado em tela nenhuma). |
| Abertura escura com o pássaro ("essa tela deveria sumir") | `OrionIntro` nunca mais é mostrada; o tour de boas-vindas passa a disparar na montagem. |

> **Deploy:** cada push gera um deploy automático no Coolify. Os três últimos commits da noite
> levaram mais de 25 minutos para aparecer no servidor (o `index.html` ainda era o das 22:28);
> se a fila travar, é no painel de "Deployments" do Coolify que se vê — o repositório não tem
> acesso a ele.

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
