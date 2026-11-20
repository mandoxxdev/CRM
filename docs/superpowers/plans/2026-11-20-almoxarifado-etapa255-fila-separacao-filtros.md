# Etapa 255 — Fila de separação com filtro por setor, projeto e localização

> **Status:** FECHADA (20/11/2026). Feature 05 (`specs/modulo-almoxarifado/05-separacao-picking/README.md`), item `[ ]`
> *"Agrupamento por projeto / setor / localização"*. Estimativa: `docs/estimativas/2026-11/estimativa_2026-11-20_almoxarifado-fila-separacao-filtros.*`
> (`9df48668`, 1h15). Os itens 24-26 da estimativa de 18/11 continuam esperando resposta e **não** entram aqui.

## Medido antes (Fase 0)

- `GET /api/almoxarifado/fila-separacao` → `requisitionService.listarFilaSeparacao` (`requisitionService.js:1130`). A requisição da fila
  devolve `setor` (texto livre, o mesmo do formulário: `setor = departamento`), **não** devolve projeto.
- **Achado:** `requisicoes_almoxarifado.projeto_id` existe (`schema.js:2760`) e o `POST` aceita (`requisitionCreateService.js:301`), mas
  **nenhuma tela grava** (`grep projeto client/src/components/almoxarifado/RequisicaoForm.js` → 0). O projeto chega, na prática, pela **OS
  cadastrada** (`os_id`, Etapa 172), e `ordens_servico.projeto_id` existe (`index.js:19293`). Filtrar só por `r.projeto_id` seria um filtro
  que sempre diz "Sem projeto" → B1598.
- O harness (`testApp.js`) **não cria** `projetos` nem `ordens_servico` (tabelas core; `entregaComOsId.api.test.js:10` as cria no teste). Um
  `JOIN projetos` direto na consulta da fila derrubaria as ~9 suítes de fila existentes com *no such table* → a leitura do projeto vai numa
  consulta à parte que só roda se a tabela **e a coluna** existem (`PRAGMA table_info`; Fase 2, achado 4: ~25 suítes criam `ordens_servico`
  **sem** `projeto_id`, e casar só a mensagem *no such table* deixava *no such column* derrubar a fila com 500).
- Cada item da fila devolve `pegar_em` (`localizacao_codigo`, `caminho` = segmentos da árvore `ALMOX / raiz / … / endereço`) e
  `origem_separacao_codigo` (só o código, sem caminho). `lerDadosDaColeta` já lê a árvore inteira (`arvore`), então o caminho da origem
  sai sem consulta nova (`sugestaoDeColeta.caminhoDaLocalizacao`).
- `FilaSeparacao.js`: sem filtro, sem agrupamento; "Imprimir lista de coleta (todas)" imprime `requisicoesParaImprimir(fila)`.

## Regras de negócio

- **RN-255.01 — o projeto da requisição na fila.** Cada requisição da fila traz `projeto_id` e `projeto_nome`: o projeto gravado na
  requisição; sem ele, o projeto da OS cadastrada (`os_id`). Sem nenhum dos dois (inclusive a OS só em texto, sem `os_id`): `null`/`null`.
  Projeto com id mas apagado: `projeto_id` mantido, `projeto_nome` `null` (a tela diz *"Projeto #<id>"*). *Cenário:* requisição com a OS
  cadastrada do projeto *"Ampliação Linha 2"* e sem projeto próprio → `projeto_nome: "Ampliação Linha 2"`.
- **RN-255.02 — o caminho da origem separada.** Cada item da fila traz `origem_separacao_caminho`: o caminho na árvore da origem da
  separação (mesmo formato do `pegar_em.caminho`, separador `' / '`), ou `null` sem origem. Não muda nenhum outro campo.
- **RN-255.03 — os três filtros.** No topo da Fila (só quando a fila tem requisições — no 403, no erro e na fila vazia a barra some, mas as
  escolhas ficam guardadas; Fase 2, achado 1): **Setor**, **Projeto** e **Localização**, cada um com *"Todos"* (padrão). As opções saem da
  fila carregada, em ordem alfabética (número como número). O setor é comparado **aparado** (`"Manutenção "` = `"Manutenção"`; vazio ou só
  espaço = sem setor). Os três ganham *"Sem setor"* / *"Sem projeto"* / *"Sem localização"* quando alguma requisição cai nesse caso.
  Projeto é escolhido pelo id (dois projetos de mesmo nome não se misturam); sem nome, *"Projeto #<id>"*.
- **RN-255.04 — localização é hierárquica.** As opções são todos os prefixos dos caminhos de onde pegar (`pegar_em.caminho`) e das origens
  separadas (`origem_separacao_caminho`) dos itens da fila. A requisição passa se **algum item** listado tem um desses caminhos igual ao
  escolhido ou abaixo dele (`ALM / A` pega `ALM / A / A-01`; não pega `ALM / AB` — comparação por segmento: igual, ou começa com
  `escolhido + ' / '`). Item sem endereço: barrado pela alçada de valor, aguardando saldo, separável sem endereço que sirva
  (`pegar_em_aviso`), ou a entregar separado sem origem (o automático e o legado). *"Sem localização"* = a requisição tem ao menos um item
  listado sem endereço (Fase 2, achado 5: sem esta opção, a requisição pronta para entregar, separada sem origem, sumia de qualquer filtro).
- **RN-255.05 — combinação e ordem.** Os filtros combinam (E). A ordem é a do servidor e os grupos (acionáveis / "Aguardando") ficam como
  estão — a tela só esconde.
- **RN-255.06 — filtro sem resultado ≠ fila vazia.** Fila com requisições e nada passando nos filtros → *"Nenhuma requisição da fila com
  estes filtros."* com o botão **Limpar filtros**; a frase *"Nada para separar ou entregar agora."* continua só para a fila vazia de verdade.
  Acima da lista, com filtro ativo: *"Mostrando N de M requisições."*
- **RN-255.07 — a lista de coleta de todas segue o filtro.** *"Imprimir lista de coleta (todas)"* imprime só as requisições visíveis (na
  mesma regra de antes: etapa Separar e algo a imprimir); sem nenhuma visível imprimível, o botão fica apagado. **Os itens de cada
  requisição vão inteiros** (a localização escolhe a requisição, não recorta os itens dela — Fase 2, achado 6; D (255)).
- **RN-255.08 — o projeto no cartão.** Requisição com projeto mostra *"Projeto: <nome>"* (sem nome: *"Projeto #<id>"*) abaixo do
  solicitante.
- **RN-255.09 — Atualizar, Abrir e voltar não perdem o filtro.** Recarregar a fila mantém as escolhas; se o valor escolhido sumir da fila
  nova, ele continua escolhido (e aparece na lista de opções; o projeto sem nome como *"Projeto #<id>"*), e a tela mostra a frase da
  RN-255.06. Abrir e voltar também não perde (Fase 2, achado 7): as escolhas ficam no navegador de quem usa (`localStorage`, leitura e
  escrita em try/catch; sem ele a tela abre com *"Todos"*).

## Contrato (só leitura, acrescenta campos — nada muda nos existentes)

`GET /api/almoxarifado/fila-separacao` (gate `separar_emitir`, 403 como hoje). Cada requisição ganha `projeto_id: number|null`,
`projeto_nome: string|null`; cada item ganha `origem_separacao_caminho: string|null`. `GET /requisicoes/:id/sugestao-coleta` é o recorte da
mesma função, mas mapeia só 5 campos por item e nada da requisição: **não ganha campo nenhum** (Fase 2, achado 2 — a primeira versão
deste plano dizia que ganhava). Sem parâmetro de consulta novo: o filtro é no navegador (B1599).

## Tasks

- [x] **T1 (tronco)** — `7941ba7f` (9 cenários vermelhos antes; 8 sabotagens, cada uma no seu cenário; o teste de chaves da 188 ganhou o
  campo novo) — serviço: RN-255.01/02. Teste novo `server/tests/api/filaSeparacaoFiltros.api.test.js`: pela **rota** (projeto
  da requisição; projeto da OS; os dois → o da requisição; nenhum; projeto apagado; caminho da origem com pai) e pelo **serviço**
  (`listarFilaSeparacao` direto); sem as tabelas `projetos`/`ordens_servico` e com elas sem a coluna lida (a fila continua 200). Controle
  positivo em cada regra.
- [x] **T2 (galho)** — `56fd4b51` (11 cenários; 17 sabotagens, cada uma no seu cenário) e Fase 5 `f13b0b4a` (+3 cenários, +4 sabotagens) — tela: RN-255.03..09 em `FilaSeparacao.js`, teste novo `FilaSeparacaoFiltros.test.js`. Controle positivo por regra.
- [x] **T3 (integração)** — o cenário de rota da T1 cobre a fiação do servidor; a tela é provada contra o JSON do contrato (fronteira HTTP).
- [x] **T4** — fechamento (fechar-etapa sem 7½ e 8): novidades, specs, guia, manual, plano e o estimado × realizado.

## Fase 5 (um revisor fresco, 20/11) — nada crítico nem importante

- **Menor, corrigido:** dois projetos com o mesmo nome viravam duas opções iguais → *"Linha 2 (#7)"* (`f13b0b4a`).
- **Menor, buracos de teste, cobertos:** todas as requisições do teste tinham um item só (trocar *algum item* por *todos* passava verde);
  nenhum teste guardava filtro de tipo errado (`f13b0b4a`).
- **Menor, declarado:** o filtro guardado vale para o navegador — num computador compartilhado, quem abrir depois herda (B1599); código de
  localização com *" / "* dentro se confunde com os níveis (D (255) 6; a lista de coleta já tinha o mesmo caso).
- **Ruído:** requisição sem itens some com filtro de localização — o servidor não põe na fila requisição sem item listado.

## Divergências do plano

- A primeira versão do plano dizia que o recorte `sugestao-coleta` ganhava os campos novos — não ganha (Fase 2, achado 2).
- A primeira versão tolerava só *no such table*; a Fase 2 mediu ~25 suítes com `ordens_servico` sem `projeto_id` (*no such column*) → `PRAGMA`.
- A T2 foi escrita antes do teste (o teste veio depois, com controle positivo por sabotagem em todas as regras) — fora da ordem TDD.
- O teste de chaves da Etapa 188 (`filaSugestaoColeta`) fixava as chaves do item e caiu com o campo novo (esperado, atualizado no T1).

## Verificação (medida sobre o código final, `f13b0b4a`)

- `npm run test:api` (rodado **sozinho** depois do último commit de servidor `7941ba7f`, `NODE_OPTIONS=--max-old-space-size=4096`):
  **652/652 arquivos de teste OK** (o mais lento: `entregaGuardaSemLote`, 106,3 s). O `f13b0b4a` só mexe na tela.
- `npm run test:almoxarifado`: **44 passou, 0 falhou**. `test:validation` **4/0**, `test:safealter` **3/0**, `test:sqlite` **16/0**.
- Jest da tela (`--maxWorkers=2`, código final): **240/240 suítes, 3248/3248 testes**.
- `CI=true npx react-scripts build`: **Compiled successfully.**
- Nenhum clique no navegador (F (255)).

## Retro (4 números)

- Rodadas de correção até verde: 1 (o teste de chaves da 188).
- Achados: Fase 2, 7 reais (absorvidos no plano antes do código); Fase 5, 3 menores reais (1 corrigido, 2 declarados), 2 buracos de teste, 1 ruído.
- Paralelismo: T1 e T2 em sequência na mesma árvore; os revisores rodaram em paralelo com o trabalho, sem retrabalho.
- Defeito que escapou: (preencher na etapa seguinte). Da 254: nenhum apontado.

## Próxima tarefa detalhada

1. **Itens 24, 25 e 26 da estimativa de 18/11 — continuam esperando resposta da empresa.** O caminho reversível de cada um está no plano da
   253 ("Próxima tarefa detalhada"). **Não comece sem a resposta.**
2. **Sem resposta, o próximo do almoxarifado sem dependência da empresa: o C549** — o estorno do Ajuste sem lote devolve tudo na posição
   padrão. Gravar as linhas drenadas por movimento (tabela ou coluna nova, migration `safeAlter`) e o estorno sem lote devolvê-las antes do
   resíduo, sob a mesma seção da trava, com o desfazer (`compensarLinhasClaim`) — **motor**: Fase 2 e Fase 5 completas, ~1h30. Medir antes:
   `stockService.syncSaldoLocalizacaoPadrao` (o `drenar` do AJUSTE) e o estorno em `cancelarMovimentacao`; os testes
   `ajusteSemLotePoupaCaixa.api.test.js` (o *[documenta]* do estorno vira a prova do conserto).
3. **Se pedirem, a continuação desta etapa:** (a) agrupar a fila em seções (B1600 — por cima dos filtros, sem mudar a ordem dentro de cada
   seção); (b) o campo **Projeto** no formulário da requisição (o `POST` já aceita `projeto_id`, `requisitionCreateService.js:301`; mudaria o
   que o solicitante preenche — espera pedido); (c) filtro guardado por usuário. Contrato que a tela da fila consome hoje: `GET
   /api/almoxarifado/fila-separacao` → por requisição `setor`, `projeto_id`, `projeto_nome`; por item `pegar_em.caminho` e
   `origem_separacao_caminho` (separador `' / '`). A lógica dos filtros mora em `client/src/utils/filtrosFilaSeparacao.js`.
4. Outras 🟡 já medidas (plano da 254): a dupla aprovação do Ajuste (06) espera decisão; lista de separação como entidade e kits (05) fora da
   estimativa.
- **O que já está pronto e não reabre:** os três filtros da Fila, o projeto no cartão e na fila, o caminho da origem separada.


## Fase 2 (revisor fresco, 20/11) — 7 achados, todos absorvidos acima

1. Barra de filtros nos estados 403/erro/vazio (RN-255.03). 2. O recorte `sugestao-coleta` não ganha campos (contrato). 3. Projeto que sumiu
→ *"Projeto #id"* (RN-255.09). 4. *no such column* com `ordens_servico` sem `projeto_id` → `PRAGMA` (cenário novo). 5. Itens sem endereço →
*"Sem localização"* (RN-255.04). 6. A lista de coleta imprime os itens inteiros (RN-255.07, D (255)). 7. Abrir e voltar perdia o filtro →
`localStorage` (RN-255.09). E ainda: filtro ≠ agrupamento — o item da spec continua `[ ]` na parte do agrupamento (B1600); setor aparado
(RN-255.03); prefixo por segmento (RN-255.04). A T1 e a T2 são independentes (só o JSON do contrato as liga).

## Pontos de atenção

- Nada de motor, trava ou saldo: a fila é só leitura (`listarFilaSeparacao` não escreve). Fase 5 enxuta.
- A conferência da tabela/coluna é por `PRAGMA` (não por mensagem de erro): outro erro de SQL sobe como hoje.
