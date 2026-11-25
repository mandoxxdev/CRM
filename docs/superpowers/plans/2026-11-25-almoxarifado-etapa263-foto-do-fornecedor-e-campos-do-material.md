# Etapa 263 — Foto do fornecedor na ficha; Aplicação, Especificações Técnicas e Descrição saem do cadastro de material

Pedido do André (25/11/2026), com prioridade sobre os itens 8 a 22 da estimativa de 23/11. Estimativa já commitada:
`docs/estimativas/2026-11/estimativa_2026-11-25_foto-fornecedor-e-campos-do-material.{txt,md}` (`16c5f775`), 1h + 1h.

Item 1 é do **Compras** (ficha do fornecedor); item 2 toca **Compras e Almoxarifado** (o mesmo `MaterialAlmoxarifadoForm`).
Não toca motor, trava nem estoque — revisão do plano (Fase 2) e final (Fase 5) enxutas.

## O que a Fase 0 mediu

- `fornecedores.foto` já existe (`ALTERS_FORNECEDORES`, `server/index.js`) e já é **gravada e mostrada** pela tela
  **Compras → Fornecedores homologados** (`client/src/components/FornecedoresDoGrupo.js:17-45`, `getFotoUrlFornecedor` e
  `uploadFotoFornecedor`), pelas rotas `POST /api/compras/fornecedores/:id/foto` (multer, `uploadFornecedor`: JPEG, PNG, GIF, WEBP,
  10 MB, `index.js:1034`) e `POST /api/compras/fornecedores/:id/foto-base64` (`routes/compras.js:933-985`). As duas **não têm teste**
  (declarado no cabeçalho de `routes/compras.js` e no harness `testApp.js:261-263`).
- `GET /api/compras/fornecedores/:id` (`routes/compras/fornecedores.js`, `COLUNAS_FICHA`) **já devolve `foto`**; a ficha
  (`FornecedorFicha.js`, usada pela página `FornecedorForm` e pela janela do F2 `FornecedorModal`) ignora.
- Gate de quem grava fornecedor e foto: `authenticateToken` + `checkModulePermission('compras')` — o mesmo nas 4 portas (POST, PUT, foto,
  foto-base64). O Compras core tem uma camada só (cabeçalho de `routes/compras.js`). `portaCompras` é a porta do **cadastro de material**
  no Compras, não a do fornecedor.
- Não existe porta para **tirar** a foto. O coordenador mandou **não criar rota nem coluna nova** (reusar as rotas do grupo homologado).
- Material: `descricao` (`MaterialAlmoxarifadoForm.js:741`), `aplicacao` (`:971`), `especificacoes` (`:976`). O `handleSubmit` manda
  `...form` — o valor carregado do GET volta no PUT. `CAMPOS_LIDOS` (conferência de edição concorrente, Etapa 125) inclui os três.
- Quem mais lê: a busca de materiais (`routes/almoxarifado.js:477` e `requisicoesMaterial.js` — `m.descricao`), o catálogo da requisição
  (`RequisicaoMaterialCesta.js:231,294,339` — `m.descricao` embaixo do nome), `buscarMateriais` do pedido (`COALESCE(nome, descricao)`;
  `nome` é obrigatório, então a `descricao` não aparece). `aplicacao`/`especificacoes`: só o formulário. Nenhuma impressão.

## Regras de negócio

- **RN-263.01** — A ficha do fornecedor (página **Novo/Editar fornecedor** e janela do F2) mostra a foto gravada; **Escolher foto** /
  **Trocar foto** abre o seletor (JPEG, PNG, GIF, WEBP), a prévia aparece na hora e a foto é enviada **ao Salvar**, depois de o fornecedor
  ser gravado (no cadastro novo é o único jeito: o id só existe depois). Cancelar não envia nada.
- **RN-263.02** — Antes de enviar, a tela recusa arquivo fora dos quatro tipos (*"Formato de imagem não suportado"*) e acima de 10 MB
  (*"Arquivo grande demais (máximo 10 MB)"*) — as literais que o servidor responde (`MSG_FORMATO_NAO_SUPORTADO` e
  `mensagemArquivoGrande`, `services/imagemUpload.js`). A foto anterior continua. **Corrigido na Fase 2:** a versão anterior desta RN
  dizia que a literal do servidor era *"Apenas imagens (JPEG, PNG, GIF, WEBP)"* — **estava errada**: essa é a mensagem do filtro, que
  só vai para o log; a resposta é *"Formato de imagem não suportado"* (400), e o tamanho é 413.
- **RN-263.03** — **Tirar foto** marca a retirada; ao Salvar, o `PUT` leva `foto: null` e a coluna fica vazia. O arquivo **fica** na pasta
  (reversível; B nova). O `PUT` sem a chave `foto` **não mexe** na foto (é o que o modal do grupo homologado manda). Qualquer outro valor de
  `foto` no `PUT` → 400 *"Para trocar a foto, envie a imagem"* (a coluna nunca aponta para um nome de arquivo digitado).
- **RN-263.04** — Foto que falha **depois** de o fornecedor ser salvo: o fornecedor fica salvo e a tela avisa *"Foto não pôde ser salva,
  mas o fornecedor foi salvo: ⟨motivo⟩"* (molde do material, Etapa 86).
- **RN-263.05** — A foto posta na ficha aparece no grupo homologado e vice-versa (mesma coluna, mesma URL `/api/uploads/fornecedores/⟨nome⟩`).
- **RN-263.06** — O cadastro e a edição de material (Compras → Materiais e a consulta do Almoxarifado) **não têm mais** os campos
  Aplicação, Especificações Técnicas e Descrição. Descrição Técnica e Observações Gerais ficam.
- **RN-263.07** — Material que já tem texto num desses três mostra o texto **só para leitura**, com o rótulo
  *"⟨Campo⟩ (campo retirado — só leitura)"*, no lugar onde o campo ficava. Sem texto, nada aparece.
- **RN-263.08** — Salvar não apaga o texto gravado: o POST/PUT **não manda** as três chaves (ausente, o servidor preserva; ver o achado 5
  da Fase 2 — a versão anterior dizia "o PUT leva o mesmo valor carregado" e estava errada). O material
  novo nasce com os três vazios. A busca continua achando pela Descrição antiga e o catálogo da requisição continua mostrando-a (B nova).

## Contratos

- `PUT /api/compras/fornecedores/:id` — chave nova **opcional** `foto`: ausente = não mexe; `null` ou `''` = limpa (grava NULL); outro
  valor → 400 `{ error: 'Para trocar a foto, envie a imagem' }`, nada gravado. Resto do contrato inalterado.
- `POST /api/compras/fornecedores/:id/foto` (multipart, campo `foto`) — inalterado: 200 `{ foto, url }`; 400 `'Nenhuma imagem enviada'`;
  404 `'Fornecedor não encontrado'`; tipo fora → 400 `'Formato de imagem não suportado'`; acima de 10 MB → 413
  `'Arquivo grande demais (máximo 10 MB)'`. A função da tela do grupo (`uploadFotoFornecedor`) reenvia por `/foto-base64` em qualquer 400
  — então o ⟨motivo⟩ da RN-263.04 vem da base64 (a mesma literal de formato); a base64 não tem limite de 10 MB próprio, por isso a
  recusa de tamanho da tela (RN-263.02) é a única antes do envio (o 413 do `/foto` não cai no reenvio).
- Cliente: `client/src/components/compras/fotoFornecedor.js` exporta `getFotoUrlFornecedor` e `uploadFotoFornecedor` (movidos de
  `FornecedoresDoGrupo.js`, que passa a importá-los), mais `TIPOS_FOTO_FORNECEDOR`, `MSG_FOTO_TIPO`, `MSG_FOTO_GRANDE`, `LIMITE_FOTO_BYTES`.

## Revisão do plano (Fase 2) — 6 achados, todos incorporados

1. Literal de formato errada no plano (acima, corrigida e dita).
2. O reenvio por base64 em qualquer 400 (acima, no contrato).
3. `onSalvo` era chamado depois de `setSalvando(false)`: a página navega e o F2 fecha — o envio da foto tem de ser **aguardado antes**
   de `onSalvo`, com o Salvar travado até lá (sem segundo POST no cadastro novo).
4. `foto` **nunca** entra em `CHAVES_CONTRATO`/`formDoServidor`: com a recusa da RN-263.03, mandar o nome sempre travaria o salvar de
   todo fornecedor com foto. Só `foto: null`, só com "Tirar" marcado e nenhuma foto nova escolhida depois (a nova vence).
5. Material: reenviar o valor carregado (o que a RN-263.08 previa) dava **409 sobre um campo que a tela não mostra** quando outra pessoa
   o mudasse depois de abrir (`camposDesfeitos`, `materialService.js`). Trocado por **não mandar as três chaves** no POST/PUT — ausente,
   `editarMaterial` preserva o gravado (`val(k)`) e a conferência não compara. `CAMPOS_LIDOS` fica igual (os testes o escrevem por
   extenso). **A RN-263.08 dizia "o PUT leva o mesmo valor carregado"; estava errada pelo motivo acima.**
6. Na consulta do Almoxarifado (`somenteLeitura`) nada salva; o texto antigo só precisa aparecer fora dos campos desligados.

## Tasks (todas `tronco`, sequenciais — etapa pequena, um executor)

- [x] **T1** (`9bf903a8`) — servidor: `foto` no `PUT` (RN-263.03) + teste `comprasFornecedorFoto.api.test.js` (POST /foto grava e o GET devolve;
  PUT sem a chave preserva; PUT `null` limpa; PUT com nome → 400 e nada muda). Controle positivo: sabotar o "ausente não mexe" e a recusa.
- [x] **T2** (`9bf903a8`) — cliente: `fotoFornecedor.js` + seção **Foto** na `FornecedorFicha` (RN-263.01 a 04) + testes no `FornecedorForm.test.js`.
- [x] **T3** (`6e9d07ca`) — cliente: tirar os três campos do `MaterialAlmoxarifadoForm` e mostrar o texto antigo só leitura (RN-263.06 a 08) + testes.
- [x] **T4 (integração)** (`9bf903a8`, cenário RN-263.05 de `comprasFornecedorFoto.api.test.js`; para o item 2, `materialCamposRetirados.api.test.js` prova pela porta do Compras o contrato de que a tela depende — `6e9d07ca`) — cenário que cruza: foto enviada pela rota do grupo homologado aparece no `GET /:id` que a ficha lê, e um `PUT`
  da ficha sem `foto` (como o salvar sem tocar na foto) não a apaga; depois o `PUT` com `foto: null` a tira e o `GET` da lista do grupo
  (`/api/compras/grupos/:id/fornecedores`) também a perde.
- [x] **T5** — fechamento (`fechar-etapa`), estimado × realizado (commit de documentos).

## Execução — controle positivo

- Servidor (foto): 3 sabotagens (ausente passa a limpar; sem a recusa de nome; null não limpa) — cada uma derruba o cenário da RN certa.
- Ficha: 7 sabotagens (sem envio; `foto: null` em todo salvar; envio sem `await`; sem recusa de tipo/tamanho; prévia da gravada depois de tirar;
  POST sem id) — cada uma pelo teste certo. **A guarda "a nova vence o tirar" é dupla** (`!fotoArquivo` no corpo e `setTirarFoto(false)` na
  escolha): sabotar uma só não derruba nada; as duas juntas derrubam o cenário RN-263.03 (defeito inalcançável por uma só, mantidas as duas).
- Material: 4 sabotagens na tela (manda as chaves; esconde o texto antigo; volta o campo Descrição; mostra o bloco vazio) e uma no servidor (ausente
  vira null só nos três campos) — a do servidor derruba o (a) pela asserção da Descrição preservada (a primeira tentativa, ausente = null em todas
  as colunas, caía pelo NOT NULL do código — asserção errada; trocada pela dirigida).

## Divergências do plano

- RN-263.02 e o contrato do `/foto`: a literal estava errada (Fase 2, 1) — corrigida e dita acima.
- RN-263.08: "o PUT leva o mesmo valor carregado" estava errado (Fase 2, 5) — o formulário não manda as três chaves.
- Pedido do coordenador no meio da T1: reusar as rotas do grupo e **não** criar rota nem coluna — o plano já não criava rota; o "tirar" virou a
  chave `foto` do PUT existente (B94). O item 1 ficou menor do que o estimado no servidor (as rotas de envio existiam).
- Fase 5 (revisão final, nenhum bloqueante; 3 achados baixos reais, 0 ruído): (1) POST sem id perdia a foto em silêncio — **corrigido** antes do
  commit da T2 (toast *"Foto não pôde ser salva, mas o fornecedor foi salvo"*, teste (m2) com sabotagem); (2) **Tirar foto** apaga a foto trocada
  por outra pessoa depois de a ficha abrir — **mantido**, B1620; (3) o arquivo tirado nunca é limpo — **mantido**, B94. O envio real (fetch +
  base64) segue sem teste de tela: o código foi só movido.
- **CLAUDE.md:** nenhuma linha ficou errada (a regra "cadastro é do Compras" vale: tudo no Compras; o Almoxarifado só vê o texto antigo).

## Verificação (medida sobre o código final, `6e9d07ca`)

- `npm run test:api` (sozinho, `NODE_OPTIONS=--max-old-space-size=4096`): **670/672 arquivos OK**. Os 2 vermelhos são do módulo de
  propostas e **não** desta etapa — `propostaBilingueTemplate` (BI-T01: o pt-BR do preview de equipamento mudou de hash) e
  `propostaPdfExigeLogin` (rota aberta nova `GET /api/uploads/grupos-produtos/:arquivo` em `index.js`); os dois caem do mesmo jeito sozinhos,
  e esta etapa não toca `index.js` nem a proposta (últimos commits desses arquivos: a outra máquina, "Proposta em dolar ou euro").
- `test:almoxarifado` **44 passou, 0 falhou**; `test:validation` **4/0**; `test:safealter` **3/0**; `test:sqlite` **16/0**.
- Jest da tela (`--maxWorkers=2`): **255/255 suítes, 3347/3347 testes**. `CI=true npx react-scripts build`: **Compiled successfully.**
- Novos: `comprasFornecedorFoto` 4/4, `materialCamposRetirados` 3/3, `FornecedorForm.test.js` 39/39, `MaterialAlmoxarifadoForm.test.js` 77/77.

## Retro (4 números)

- Rodadas de correção até verde: **1** (a Fase 5 trouxe uma correção pequena; nenhum teste caiu duas vezes).
- Achados da revisão: Fase 2 **6 reais / 0 ruído**; Fase 5 **3 reais (baixos) / 0 ruído**.
- Paralelismo: **0** galhos em paralelo (etapa pequena, um executor); revisões em agente separado.
- Defeito que escapou: preencher na próxima etapa.

## Próxima tarefa detalhada

Os itens **8 e 9** da estimativa de 23/11 (`docs/estimativas/2026-11/estimativa_2026-11-23_almoxarifado-semana.md`), juntos numa etapa — a
próxima tarefa do plano da 262, que esta etapa (pedido com prioridade) passou na frente. Nada desta etapa toca o que eles mexem. Régua:
`bloqueioPorLote.bloqueadoDoLoteSql` e o retido de `retidoDoLote.js`.

1. **Item 8 — a Saída e a Perda com lote respeitam as peças bloqueadas do lote (C546, D (249) 1; 1h15, motor).** Medido na 249: *L1* 4 com 2
   bloqueados em *L1*, *L2* 4 — a **Saída** de 4 do *L1* (Movimentações) passa, confere o bloqueado do **material** e não o do lote; *L1* fica 0
   e o livro ainda diz *L1 2* bloqueado. Onde: `stockService.registrarMovimentacao` (ramo de saída com `lote_id`; o motor inteiro roda sob
   `naTravaDoMaterial`); hoje o motor não usa `retidoDoLote` nem `bloqueioPorLote` na saída (só `requisitionService`,
   `reservaChegadaService`, `lotService`). Fatia visível: o seletor de lote da Saída já mostra o livre do lote (Etapa 241) — somar as
   bloqueadas. Pontos de atenção: a mesma régua da entrega (`loteImpedido`/`retidoDoLote`, com o limite por família B1436) para não divergir;
   a literal no molde da recusa do lote na entrega (*"no lote L1 há 4 PC, mas só 2 podem sair …"*); as compensações internas e a devolução para
   Sucata (`parDaDevolucao`) não podem ser barradas pelo bloqueio que a própria devolução gravou.
2. **Item 9 — o estorno da entrada de um lote com peças bloqueadas (C547; 1h, motor/estorno).** Medido na 249: *L1* 4 todo bloqueado no
   lote, *L2* 4 — estornar a entrada do *L1* passa; *L1* 0 e o livro diz *L1 4* bloqueado. Onde: `cancelarMovimentacao`, ramo de entrada
   (`tiposEntrada`), dentro da seção da trava — conferir `bloqueadoDoLoteSql(material, mov.lote_id)` contra o saldo do lote depois do débito;
   recusa com o caminho (*Desbloquear* escolhendo o lote). Atenção: a entrada da devolução para Quarentena já é recusada pela RN-262.02 (a guarda
   nova não pode mudar a mensagem dela — ordem); o claim provisório (régua "vivo" = estorno concluído).
- Motor/estorno: Fase 2 e Fase 5 com sonda executada, falha forçada e corrida.
- **O que já está pronto e não reabre:** a foto do fornecedor na ficha e os campos retirados do material (esta etapa); as recusas do estorno da
  entrada da devolução (262).
