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

- [ ] **T1** — servidor: `foto` no `PUT` (RN-263.03) + teste `comprasFornecedorFoto.api.test.js` (POST /foto grava e o GET devolve;
  PUT sem a chave preserva; PUT `null` limpa; PUT com nome → 400 e nada muda). Controle positivo: sabotar o "ausente não mexe" e a recusa.
- [ ] **T2** — cliente: `fotoFornecedor.js` + seção **Foto** na `FornecedorFicha` (RN-263.01 a 04) + testes no `FornecedorForm.test.js`.
- [ ] **T3** — cliente: tirar os três campos do `MaterialAlmoxarifadoForm` e mostrar o texto antigo só leitura (RN-263.06 a 08) + testes.
- [ ] **T4 (integração)** — cenário que cruza: foto enviada pela rota do grupo homologado aparece no `GET /:id` que a ficha lê, e um `PUT`
  da ficha sem `foto` (como o salvar sem tocar na foto) não a apaga; depois o `PUT` com `foto: null` a tira e o `GET` da lista do grupo
  (`/api/compras/grupos/:id/fornecedores`) também a perde.
- [ ] **T5** — fechamento (`fechar-etapa`), estimado × realizado.

## Próxima tarefa detalhada

(preenchida no fechamento)
