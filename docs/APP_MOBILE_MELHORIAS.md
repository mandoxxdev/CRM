# App no celular — melhorias de aparência (rodada de refino)

> Onde parou: rodada de **refino visual mobile** sobre a camada global que já existia
> (`client/src/styles/mobile-app.css`). Todas as regras vivem dentro de
> `@media (max-width: 768px)` — **o desktop não muda um pixel**. Testado no app rodando,
> no viewport de celular (375x812), tela a tela.

## Antes → Agora (testado a 375px)

| Item | Antes | Agora |
|---|---|---|
| Fundo das telas | Malha animada (constelação) aparecia ATRAVÉS dos cartões translúcidos em toda tela de conteúdo — cara de "site quebrado" | Some no celular; fundo sólido e limpo — cara de aplicativo |
| Botão de ação principal (`.btn-premium`, ex.: "+") | 72px de altura, virava um bloco laranja gigante | 48px — alvo de toque correto, alinhado aos demais botões |
| Cabeçalho do seletor de módulos | Pássaro decorativo cobria o selo "ADMINISTRADOR" | Pássaro escondido no celular; selo inteiro e legível |
| Selo "Orion-BETA-V0" | Flutuava sobre o conteúdo no topo | Escondido no celular |
| Gaveta de navegação ("Menu") | Abria PRESA fora da tela — o toque parecia não fazer nada | Abre de verdade, estilo app (~86% da tela, conteúdo espiando sob o overlay) |
| **Visual geral (premium)** | Cartões cinza chapados, barra colada na borda, campos com borda dura, badges retangulares | Fundo com profundidade, **cartões brancos flutuando** com sombra suave, **barra inferior flutuante** arredondada, campos preenchidos/arredondados, chips em pílula |

## O que já estava bom (mantido, não mexi)
- Barra inferior de navegação (tipo app), que troca de itens conforme o módulo.
- Campos de formulário com fonte 16px (evita o zoom automático do iOS).
- **Tabela vira lista de cartões** no celular — confirmado com dados reais na tela de
  Clientes (cada linha vira um cartão rótulo→valor, com chips de segmento/status e ações).

## O que esta rodada NÃO cobre (próximos passos)
- Densidade fina de espaçamento em telas específicas (dashboards com muitos KPIs).
- Revisão de modais grandes e telas de engenharia/cálculo caso a caso.
- Toque final de tipografia (títulos) por tela.

## Notas técnicas para a próxima sessão
- Arquivo alterado (versionado): `client/src/styles/mobile-app.css` — nova seção
  "Aparência de aplicativo: fundo, cromo e botão".
- **Ambiente OneDrive:** `node_modules` e alguns fontes ficam como *placeholders*
  (Files On-Demand) e falham na leitura (`UNKNOWN read -4094`), derrubando server e CRA.
  Resolvido reinstalando limpo (`npm ci`/`npm install`) e hidratando os fontes. Se voltar
  a falhar, reinstale as dependências.
- Patch dev-only (NÃO versionado, em `node_modules`): `react-scripts/config/webpackDevServer.config.js`
  passou a cair para `allowedHosts: 'all'` quando o host de LAN vem vazio (preview local).
  Some ao reinstalar; reaplicar se o CRA reclamar de `allowedHosts[0] should be a non-empty string`.
- Usuário de teste criado para permitir a revisão sem login manual:
  `claude.review@local.test` (superadmin, script `server/scripts/seed-claude-review-user.js`).
  **Remover quando não for mais necessário** (é um superadmin local).
