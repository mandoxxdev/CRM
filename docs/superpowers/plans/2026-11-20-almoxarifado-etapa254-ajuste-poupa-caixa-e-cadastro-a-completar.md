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
- **RN-254.01 b (Fase 2, achado 1)** A caixa **na própria posição padrão** (a Entrada sem destino cai nela — o caso comum): a linha padrão só
  recebia o resíduo (total − as outras) e nada era drenado enquanto ele ficasse ≥ 0 — padrão *A*, *A* 4 separadas e *B* 3, Ajuste para 4 →
  *A* 1, *B* 3, entrega recusada. Agora a linha padrão tem um **piso** = a parte dela guardada pela caixa, limitada ao que ela tem agora; a 1ª
  passada drena a parte livre das outras até o piso, a 2ª (o separado das outras) só até zero. Ajuste para **cima** nunca move nada entre
  prateleiras. Vale também no ramo com lote (Etapa 253) — a mesma função.
- **RN-254.02** Sem outra saída, a caixa é drenada (o total manda). **Corrigido na Fase 2 (achado 2):** o exemplo que estava aqui (*A* 4
  separadas e *B* 1, Ajuste para 2) **não acontece** — a guarda de retenção da Etapa 97 recusa antes (*"Ajuste para 2 UN deixaria o
  disponível negativo (separada na caixa de requisição: 4, mínimo aceitável: 4 UN)…"*). O caso que alcança: o resto está em linhas **com
  lote**, que o Ajuste sem lote não drena — *A* 4 separadas, *B* 1 sem lote e 3 do lote *LY*, Ajuste para 5 → *B* 0, *A* 2 (anterior à etapa,
  a entrega da caixa fica sem as peças; D (254)).
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
  *"⟨N⟩ materiais criados pelo Almoxarifado (sobra ou remessa a terceiros) com o cadastro a completar: NCM, custo, fornecedor e o
  resto do cadastro. Abra e salve para tirar o aviso."* (com 1: *"1 material criado pelo Almoxarifado …"* — Fase 2, achado 4) e o botão **Ver só esses** / **Ver todos**; na tabela, o selo *Cadastro a completar*
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

## Fase 2 — revisão do plano

Um agente fresco, sondas executadas (scratchpad). **2 importantes, 3 menores, 1 ruído — todos aceitos:**

1. **[importante] A caixa na própria posição padrão** (a Entrada sem destino cai nela — o caso comum) continuava drenada: a linha padrão
   recebe só o resíduo e o drenar só entrava com resíduo negativo. → **RN-254.01 b** (o piso da linha padrão), `0db2b143`.
2. **[importante] O exemplo do RN-254.02 não acontecia** (a guarda de retenção da Etapa 97 recusa antes). → o RN corrigido, dizendo que
   estava errado; o teste afirma a recusa e o caso real (o resto num lote).
3. **[menor]** a contagem da tela colidiria com o mock dos testes antigos (a lista inteira para qualquer parâmetro) → a contagem conta pela
   marca da resposta; o teste do Inativar passou a não contar a chamada da contagem.
4. **[menor]** a literal "material(is)" → singular e plural escritos (acima); `a_completar` com outro valor não filtra (testado); a chave de
   reversão e o PUT do Almoxarifado → B1595.
5. **[menor]** a remessa nasce sem categoria (o servidor grava *OUTROS*) → no roteiro; inativar → reativar volta ao aviso → testado.
6. **[ruído]** ~20 testes antigos criam material pelo POST do Almoxarifado e passam a gravar a marca — nenhum compara a linha inteira.

Pergunta 3: T2/T3 independentes do T1 (arquivos e regras separados); a Fase 2 avisou que as sabotagens do T1 contaminariam uma suíte
rodando junto — foram rodadas em sequência (e a rodada do `test:api` que coincidiu com elas foi descartada, abaixo).

## Tasks

- [x] **T1 (tronco, motor)** C548 — `b5b8c4f1`: o ramo sem lote com as duas passadas (chave `"<loc>|"`). Fase 2 — `0db2b143`: o piso da
  linha padrão. `ajusteSemLotePoupaCaixa.api.test.js` (12; 6 vermelhos no código de antes da etapa, 2 no de `b5b8c4f1`). Sabotagens (9: o
  código de antes, o do T1, piso zero, entrada só com resíduo negativo, piso sem olhar o que a padrão tem — as duas metades juntas: cada uma
  sozinha é coberta pela outra —, sem a 2ª passada, chave sem lote, chave de lote vazia, 1ª passada sem descontar a caixa): cada uma derruba o
  seu cenário.
- [x] **T2 (galho)** item 27 servidor — `67194649`: coluna, `createMaterial` com a opção, a rota (marca, tira, filtro).
  `cadastroACompletar.api.test.js` (9; 9 vermelhos antes). 8 sabotagens, cada uma derruba o seu.
- [x] **T3 (galho)** item 27 tela — `9fa64070`: `TabelaMateriais` (selo, só quando pedem), `MateriaisCompras` (contagem, aviso, Ver só
  esses/Ver todos), `MaterialAlmoxarifadoForm` (aviso no Compras). 8 testes novos no `MateriaisCompras.test.js`; 12 sabotagens, cada uma
  derruba o seu.
- [x] **T4** integração — no T2 (`[integracao] sobra cria -> filtro do Compras mostra -> o Compras salva -> sai do filtro`).
- [x] **T5** Fase 5 — dois revisores frescos (motor; cadastro), sondas executadas:
  - **Cadastro (`76646464`):** 1 menor real — um PUT do Compras só com os campos de concorrência tirava a marca (reproduzido) → só campo do
    cadastro (`MATERIAL_UPDATE_COLUMNS`) tira; +1 teste do servidor, +1 da tela (filtro ligado com zero marcados). Ruído: o salvar sem
    preencher nada tira (é a regra, B1595); a chave de reversão (B1595); o filtro se desliga ao voltar do formulário.
  - **Motor (`6271cda5`):** 1 **importante** — o estorno do Ajuste sem lote que drenou devolve tudo na posição padrão (*A* 7, *B* 0; antes da
    etapa, nesse caso, o Ajuste não drenava e o estorno era exato). Era assim desde a Etapa 51 com resíduo negativo; o piso o leva ao caso
    comum. **Decidido (B1597):** manter a ida e declarar (C549, D (254)), com teste *[documenta]*; gravar de onde a baixa saiu é escopo maior.
    1 menor consequência (o estorno de uma transferência para a prateleira drenada é recusado, limpo). 3 buracos de teste → 2 testes novos
    (a caixa com lote na padrão; o estorno com lote abaixo do piso), o terceiro é ruído (inalcançável pela guarda de retenção).
- [x] **T6** fechamento (fechar-etapa sem 7½ e 8).

## Divergências do plano

- O plano olhou as linhas **drenadas**, não a que recebe o resíduo: a caixa na posição padrão ficou de fora (Fase 2, achado 1). Achado de
  plano: no drenar, a linha padrão também é uma prateleira com caixa.
- O RN-254.02 trazia um exemplo que a guarda de retenção recusa — escrito sem rodar (Fase 2, achado 2).
- O piso foi medido na ida, não no **estorno** (Fase 5): nenhum teste do plano estornava o Ajuste. Ficou declarado (B1597).
- **CLAUDE.md:** a linha "a sobra e a remessa a terceiros ainda criam material pelo Almoxarifado — a rever" ficou incompleta e foi corrigida
  (o material nasce marcado; a criação continua). A seção das travas não muda: a leitura da caixa e o drenar continuam na seção do material.

## Verificação (medida sobre o código final, `6271cda5`)

- `npm run test:api` (rodado **sozinho**, `NODE_OPTIONS=--max-old-space-size=4096`): **651/651 arquivos de teste OK** (o mais lento:
  `propostaSalvarGrava`, 72,4 s). Uma rodada anterior foi **descartada**: coincidiu com os harnesses de sabotagem, que trocavam o
  `stockService.js` e a rota no meio dela (a Fase 2 tinha avisado) — parada e repetida depois do último commit de código.
- `test:almoxarifado` 44/0; `test:validation` 4/0; `test:safealter` 3/0; `test:sqlite` 16/0 (rodados antes da Fase 5, que não tocou nesses
  caminhos; os testes novos e alterados da Fase 5 rodaram sozinhos: `ajusteSemLotePoupaCaixa` 15/15, `cadastroACompletar` 10/10).
- Jest da tela (`--maxWorkers=2`): **239 suítes, 3234 testes**, verdes; `CI=true react-scripts build`: *Compiled successfully*.
- Nenhum clique no navegador (F (254)).

## Retro (4 números)

- Rodadas de correção até verde: 3 (Fase 2: 1 — o piso; Fase 5: 2 — a marca e os testes do motor).
- Achados: Fase 2 — 5 reais (2 importantes, 3 menores), 1 ruído; Fase 5 — 2 reais (1 importante declarado, 1 menor), 1 consequência
  declarada, 2 buracos de teste, 4 ruídos.
- Paralelismo: T1 (motor) e T2/T3 (cadastro) em sequência, na mesma árvore (as sabotagens não podiam rodar juntas); os dois revisores da
  Fase 5 em paralelo, sem retrabalho.
- Defeito que escapou: (preencher na etapa seguinte). Da 253: o drenar com lote não poupava a caixa **na posição padrão** — achado aqui
  (RN-254.01 b; a 253 só testou com a padrão *P* sem caixa).

## Próxima tarefa detalhada

1. **Itens 24, 25 e 26 da estimativa de 18/11 — esperam resposta da empresa** (mudam o que o cadastro mostra ou exige; o André pediu para
   não fazer sem resposta). O caminho reversível de cada um continua o do plano da 253 (seção "Próxima tarefa detalhada"): 24 esconder o
   campo Aplicação sem apagar a coluna (30 min); 25 *"Nº de controle (etiqueta)"* e série obrigatória na tela **Ferramentas** (1h30); 26 tirar
   Especificações Técnicas e Observações Gerais, mostrando só os que têm texto (1h). Lugar: **Compras → Materiais** (o formulário é o mesmo),
   testes `tests/api/compras*.api.test.js` e `client/src/components/compras/`; documento `docs/compras-novidades-por-etapa.md`. **Não comece
   sem a resposta.**
2. **Sem resposta, o próximo do almoxarifado: a Fila de separação agrupada/filtrada por setor, projeto e localização** — o item `[ ]`
   *"Agrupamento por projeto / setor / localização"* da feature 05 (🟡; `specs/modulo-almoxarifado/05-separacao-picking/README.md:90`).
   **Medido (20/11):** `FilaSeparacao.js` só mostra o setor junto do solicitante (`:128`) e não tem filtro nem agrupamento (`grep -i agrup`
   → 0; conferido contra `setor` → acha). Fatia de tela + leitura (~1h, a medir na Fase 0.5): filtro por setor (e projeto, se a requisição o
   trouxer — medir o contrato de `GET /api/almoxarifado/fila-separacao` (`FilaSeparacao.js:245`) antes) e por localização da sugestão; sem mexer em motor.
   As outras 🟡 medidas: a **dupla aprovação do Ajuste** (06, `[ ]` em `06-aprovacoes/README.md:111`) não existe (`grep "dupla aprova"` só acha
   o sucateamento) — muda o que o almoxarife faz, espera decisão; lista de separação como entidade e kits (05) estão fora da estimativa de
   18/11; 16, 21, 22 e 25 dependem da empresa.
3. **O C549** (o estorno do Ajuste sem lote que devolve na posição padrão), se pedirem: gravar as linhas drenadas por movimento (tabela ou
   coluna nova, migration no padrão `safeAlter`) e o estorno sem lote devolvê-las antes do resíduo, sob a mesma seção da trava, com o desfazer
   (`compensarLinhasClaim`) — motor, Fase 2 e Fase 5, ~1h30.
- **O que já está pronto e não reabre:** o Ajuste que poupa a prateleira separada (com e sem lote, ida e estorno com lote) e o cadastro a
  completar (marca, aviso, filtro, selo).
