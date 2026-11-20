# Etapa 254 — o Ajuste sem lote poupa a caixa separada (C548) e o material da sobra/remessa nasce com "cadastro a completar" (item 27)

> Item 1: o **C548** (letra C das novidades; achado na revisão final da 253) — estimativa própria
> `docs/estimativas/2026-11/estimativa_2026-11-20_almoxarifado-ajuste-sem-lote-poupa-separacao.md` (45 min, `e45be42d`).
> Item 2: o **item 27** da estimativa de 18/11 (`estimativa_2026-11-18_cadastro-e-almoxarifado-semana.md`, 1h30) — *depende de resposta*;
> segue o caminho reversível registrado no plano da 253 e na seção "Os que dependem de resposta" da estimativa (letra B).
> **Não entram:** os itens 24, 25 e 26 (tirar Aplicação, série obrigatória, Especificações/Observações) — mudam o que o usuário vê ou exige
> e esperam resposta da empresa (ficam na próxima tarefa, como pendentes de resposta).
> **Fatia visível:** o aviso e o filtro *Cadastro a completar* em **Compras → Materiais** (item 2). O item 1 não tem tela (o Ajuste sem lote
> é o da tela Movimentações; o que muda é de onde sai a baixa — a entrega da requisição deixa de ser recusada).

## Fase 0 — medido (código, 20/11)

- **C548.** `stockService.syncSaldoLocalizacaoPadrao` (`drenar`, AJUSTE de ida sem localização): com lote, duas passadas (primeiro a parte
  de cada endereço que **não** está guardada pela caixa viva — `requisitionService.parteGuardadaDeOutrasPorPar(db, m, null)`, chave
  `"<origem>|<lote>"` —, depois o resto; Etapa 253, Fase 5). **Sem lote, a passada única da Etapa 51** (`ORDER BY quantidade DESC, id`): a
  maior linha — a da caixa — é drenada primeiro. A régua já devolve os pares sem lote (chave `"<origem>|"`). Quem alcança: o AJUSTE e o
  AJUSTE_INVENTARIO sem localização (tela Movimentações, v1 e v2, a conclusão da contagem). O estorno do AJUSTE sem lote **não** drena
  (`drenar: Boolean(mov.lote_id)`), fica fora. A sonda é o teste vermelho (T1).
- **Item 27.** `POST /api/almoxarifado/materiais` (só a sobra — `SobrasAlmoxarifado.cadastrarMaterialDoRetalho` — e a remessa —
  `RemessasTerceirosAlmoxarifado.cadastrarMaterialResultante` — o chamam; `restringirCriacaoNoAlmoxarifado` aceita só código, nome, unidade,
  família, subfamília, categoria e dono, Etapa 193 R3b). Nada marca o material criado assim: no **Compras → Materiais** ele é igual a
  qualquer outro, sem NCM, custo, fornecedor, mínimo. A coluna não existe (`grep cadastro_a_completar` → 0, conferido contra
  `grep quantidade_em_terceiros` → acha). A porta do Compras (`POST /api/compras/materiais/cadastro`, `PUT .../cadastro/:id`) usa o mesmo
  handler, com `req.portaDoCompras = true` (`comoCompras`).

## Regras de negócio

**Item 1 (C548) — o Ajuste sem lote poupa a caixa separada:**

- **RN-254.01** AJUSTE (ou AJUSTE_INVENTARIO) sem localização, **sem lote**, que baixa o total e drena as prateleiras sem lote: primeiro a
  parte de cada prateleira que **não** está separada na caixa viva de uma requisição (`parteGuardadaDeOutrasPorPar`, todas as requisições,
  par (endereço, sem lote)); só depois o resto, na mesma ordem (maior primeiro, depois a mais antiga). Cenário C548: *A* 4 (separadas de *A*)
  e *B* 3, Ajuste para 4 → *A* 4, *B* 0, a entrega da requisição sai (antes: *A* 1, *B* 3, entrega recusada *"… não serve mais"*).
- **RN-254.02** Sem outra saída, a caixa é drenada (o total manda): *A* 4 separadas e *B* 1, Ajuste para 2 → *B* 0 primeiro, depois *A* 2.
  A guarda de retenção do material continua decidindo **se** o ajuste passa (não muda).
- **RN-254.03** O separado **com lote** num endereço não protege as linhas **sem lote** desse endereço (o par é (endereço, lote)); sem
  caixa nenhuma, a ordem e o resultado de sempre (Etapa 51), byte a byte. O estorno do AJUSTE sem lote continua sem drenar.

**Item 2 (27) — cadastro a completar:**

- **RN-254.10** Material criado pela porta do **Almoxarifado** (`POST /api/almoxarifado/materiais`, a sobra e a remessa) nasce com a marca
  *cadastro a completar*. Pela porta do Compras, não. Com a chave de reversão da Etapa 193 ligada (`cadastroNoAlmoxarifadoLiberado()` — o
  Almoxarifado volta a cadastrar tudo), não marca.
- **RN-254.11** Salvar o cadastro pelo **Compras** (`PUT /api/compras/materiais/cadastro/:id`) com qualquer campo além de `ativo` tira a
  marca, no mesmo `UPDATE` da gravação (a recusa — 400/403/409 — não tira). Só reativar/inativar (`{ ativo }`) não tira.
- **RN-254.12** `GET .../materiais` (as duas portas) aceita `a_completar=1` (texto exato): só os marcados, com os outros filtros. Sem ele, a
  resposta de sempre (com a coluna nova em `m.*`).
- **RN-254.13** Tela **Compras → Materiais**: com pelo menos um material ativo marcado, o aviso
  *"⟨N⟩ material(is) criado(s) pelo Almoxarifado (sobra ou remessa a terceiros) com o cadastro a completar: NCM, custo, fornecedor e o
  resto do cadastro. Abra e salve para tirar o aviso."* e o botão **Ver só esses** / **Ver todos**; na tabela, o selo *Cadastro a completar*
  ao lado do nome (só no Compras: a lista do Almoxarifado não mostra). Sem marcados, nada aparece.
- **RN-254.14** Formulário de edição pelo Compras de um material marcado: o aviso
  *"Cadastro a completar: este material foi criado pelo Almoxarifado (sobra ou remessa a terceiros) só com código, nome, unidade e família.
  Complete o cadastro e salve — ao salvar, o aviso sai."* Na consulta do Almoxarifado, não.

## Contratos

- `POST /api/almoxarifado/materiais` — resposta 201 igual, com `cadastro_a_completar: 1` (coluna nova). Recusas iguais.
- `POST /api/compras/materiais/cadastro` — `cadastro_a_completar: 0`.
- `PUT /api/compras/materiais/cadastro/:id` — grava `cadastro_a_completar = 0` junto (RN-254.11); resposta com o campo.
- `GET /api/almoxarifado/materiais` e `GET /api/compras/materiais/cadastro` — `?a_completar=1` (RN-254.12).
- `materialService.createMaterial(db, user, data, { cadastroACompletar = false } = {})` — opção nova; os outros chamadores, sem mudança.
- Banco: `materiais_almoxarifado.cadastro_a_completar INTEGER DEFAULT 0` (`safeAlter`, molde das colunas de `materiais_almoxarifado`). Material
  antigo: 0 (não se sabe quais vieram da sobra; ver B).

## Desenho

- **1:** `syncSaldoLocalizacaoPadrao` — o ramo sem lote passa a ler `localizacao_id` e a montar as duas passadas com a chave
  `"<loc>|"`; o `guardadoPorPar` é lido sempre que há linhas positivas (com ou sem lote). Linha sem endereço: guarda 0. **Travas:** nada novo
  — o AJUSTE roda sob `naTravaDoMaterial` (Etapa 97) e a leitura da caixa já roda dentro da seção no ramo com lote (Etapa 253).
- **2:** schema (`safeAlter`), `createMaterial` com a opção, rota (`criarMaterial`: `cadastroACompletar: !req.portaDoCompras &&
  !cadastroNoAlmoxarifadoLiberado()`; `editarMaterial`: `, cadastro_a_completar = 0` no SET quando `req.portaDoCompras` e o corpo tem chave
  além de `ativo`), filtro na lista. Tela: `MateriaisCompras` (contagem por `GET` com `a_completar=1`, aviso, botão, filtro), `TabelaMateriais`
  (prop `mostrarCadastroACompletar`), `MaterialAlmoxarifadoForm` (aviso quando `rotas.modulo === 'compras'`).

## Tasks

- [ ] **T1 (tronco, motor)** C548 — teste `ajusteSemLotePoupaCaixa.api.test.js` vermelho, o conserto, sabotagens.
- [ ] **T2 (galho)** item 27 servidor — `cadastroACompletar.api.test.js` (sobra/remessa marcam pela rota; o Compras não; o PUT do Compras
  tira; reativar não tira; recusa não tira; o filtro; a chave de reversão).
- [ ] **T3 (galho)** item 27 tela — `MateriaisCompras.test.js` (aviso, contagem, botão, selo) e o aviso do formulário.
- [ ] **T4** integração: criar pela rota da sobra → lista do Compras com `a_completar=1` → PUT pelo Compras → some do filtro (no T2).
- [ ] **T5** Fase 5 (o T1 toca o motor) e fechamento.
