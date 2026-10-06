# Compras e cadastros — novidades por etapa (documento de apresentação)

> **Para que serve:** este é o documento para **apresentar à empresa** o que mudou no sistema, em
> linguagem de usuário — cada etapa diz o que dá para ver na tela, o que mudou por baixo e um
> roteiro curto para demonstrar ao vivo. Pedido do André em 2026-10-06. O equivalente do
> almoxarifado é `docs/almoxarifado-novidades-por-etapa.md`.
>
> **Onde o desenvolvimento está:** lote de 2026-10-06, branch `main`. Etapas **33, 34 e 35**
> em execução nesta noite; Etapa **36** só especificada (depende das decisões do bloco abaixo).
> Design do lote: `docs/superpowers/specs/2026-10-06-crm-lote-compras-outubro-design.md`.

## ⚠️ Leia antes de apresentar — o que exige decisão ou ação sua

### A. Para rodar em produção antes do deploy
- **A1** — nada ainda. (As etapas desta noite não exigem limpeza de dado; a Etapa 33 deixa a coluna
  `itens_pedido_compra.data_entrega` no banco, sem leitor — pode ser apagada numa migração futura.)

### B. Decisões que eu tomei e você pode reverter
- **B1 — Esta frente vive em `main`, e `main` tem OUTRO pedido de compra.** A branch
  `desenvolvimento-almoxarifado` (Etapas 38–41) reescreveu o pedido de compra sem saber que `main`
  já tinha a Etapa 32. Os dois gravam nas mesmas tabelas com colunas diferentes. Escolhi
  implementar o lote contra `main` (é o que a empresa vê). **Descartado:** fazer na branch (ninguém
  veria até o merge do módulo). **Pendente para o merge:** escolher um dos dois pedidos — a
  reconciliação não é feita aqui.
- **B2 — Etapa 34: o `PUT` de fornecedor muda de "substitui tudo" para "chave ausente não mexe".**
  Necessário para o modal antigo do grupo (que manda só 7 campos) não apagar cidade/CEP/telefone
  do vendedor. Provado por teste nos dois sentidos. **Descartado:** manter substituição total e
  ensinar o modal a mandar 13 campos (mais frágil).
- **B3 — Etapa 34: o telefone do vendedor é coluna NOVA (`telefone_vendedor`).** A coluna `celular`
  já existia (Etapa 32, impressa no documento do pedido) e **não** foi reaproveitada — o rótulo
  mentiria. **Descartado:** renomear `celular`.
- **B4 — Etapa 35 muda a tela de material em `main`; a branch do almoxarifado tem a mesma tela.**
  O commit é candidato a `cherry-pick` para a branch; o manual do sistema precisa da mesma edição
  lá (a versão de lá é mais nova).
- **B5 — Etapa 35: a classe ABC ganhou legenda SEM fonte no projeto.** Nenhum documento define
  A/B/C; usei a definição usual (curva de Pareto: A = poucos itens, maior valor; C = muitos itens,
  baixo valor) e marquei "classificação manual". Ver D-35.
- **B6 — Etapa 34: consulta de CEP é um proxy novo para a ViaCEP (`GET /api/cep/:cep`).** O P.O.
  falou em "biblioteca do CNPJ"; não é biblioteca, é o proxy `GET /api/cnpj/:cnpj` do comercial
  (BrasilAPI → ReceitaWS), e ele **já devolve o endereço** — a Etapa 34 usa os dois.

### D. Dúvidas para você (ou para o P.O.)
- **D-35** — O que A, B e C significam **para a GMP**? A legenda atual é a definição genérica.
  Trocar é editar a constante `LEGENDA_ABC` em `MaterialAlmoxarifadoForm.js`.
- **D-35b** — O fator de conversão é só informação (o sistema não converte quantidades ao receber
  ou requisitar; o manual já dizia isso). Deve passar a converter? Se sim, é regra do motor de
  estoque, etapa própria na branch do almoxarifado.
- **D-36a** — Família × categoria: hoje a **família pertence a uma categoria** (`familia.categoria_id`).
  A task 2 pede o inverso (categorias dentro da família). Qual é a árvore certa? Minha recomendação:
  primeiro dar à aba *Famílias* a criação de **subfamílias** (o campo já existe no banco, falta a
  tela) e perguntar ao P.O. se categoria depende mesmo de família.
- **D-36b** — Configurações por módulo: embutir a tela atual de configurações do almoxarifado numa
  aba "Almoxarifado" de `/configuracoes` (minha recomendação) ou mover as 13 abas?
- **D-36c** — Quem vê a aba Almoxarifado dentro de Configurações: só admin do sistema ou também o
  administrador do almoxarifado?

### G. Dívidas conhecidas, declaradas
- **G1** O `DELETE` genérico de `/api/compras/:tipo/:id` continua sombreando `grupos` (400 'Tipo
  inválido') — não consertado (escopo da aba Grupos). Em `main` ele mora no `index.js`, fora do
  harness — não há teste que o caracterize.
- **G2** `GET /api/compras/fornecedores` é `SELECT *` e devolve `planilha_dados` (a planilha
  inteira em JSON) para quatro telas que não a leem (`Compras.js`, `PedidoCompraForm.js`,
  `FornecedoresDoGrupo.js`, `ItensFornecedor.js`). Só custo de payload; a projeção nomeada do
  `GET /:id` da Etapa 34 é o modelo para a lista numa etapa posterior.

---

<!-- Formato de cada seção de etapa (escrita no fechamento da etapa, SÓ dentro do próprio cabeçalho):
**Em uma frase.** · ### O que há de novo (visível para o usuário) · ### Por baixo do capô ·
### Antes → Agora (tabela) · ### Roteiro de teste manual (clicável) · ### O que a etapa NÃO cobre -->

## Etapa 33 — A entrega é do pedido, não do item (2026-10-06)

**Em uma frase.** O pedido de compra passou a ter **uma** seção "Entrega" (previsão + local), e a
linha do item deixou de pedir data de entrega própria — inclusive na tela de recebimento.

### O que há de novo (visível para o usuário)

- **Tela do pedido (Compras → Pedidos → Novo / editar):** a seção **"3. Entrega"** é nova e reúne
  *Previsão de entrega* (botões 7/15/30/45 dias ou data livre) e *Entregar em* (nossa empresa,
  endereço do fornecedor ou outro). Os dois já existiam, mas escondidos no fim de "Condições".
- **"Condições"** virou a seção **4** (pagamento, frete, via de transporte) e **"Total"** a **5**.
  *Cobrar em* continua em **"Mais opções"**, como antes.
- **Na linha do item**, o painel de detalhes (seta ao lado da lixeira) ficou só com **Unidade, IPI,
  Descrição e Observação**. O bloco "Entrega deste item" (Hoje / 7 / 15 / 30 dias + data) sumiu.
- **Recebimento por pedido (Almoxarifado → Recebimentos NF → Novo → Por Pedido de Compra):** a
  tabela de itens do pedido não mostra mais a coluna **"Entrega"**. A previsão do pedido continua
  no bloco "Condições do pedido", logo acima.

### Por baixo do capô

- O servidor **ignora** `data_entrega` por item no `POST`/`PUT /api/compras/pedidos`: a coluna
  `itens_pedido_compra.data_entrega` fica no banco (reversível) mas é sempre gravada como vazia e
  **não é mais devolvida** na leitura — nem para o comprador nem para o almoxarife (as duas telas
  leem o mesmo serviço, `pedidoLeitura`).
- **Pedido antigo** que tinha data por item: abre sem mostrar a data; ao salvar de novo, a coluna é
  zerada. Não houve migração de dados (ver A1 no bloco do topo).
- Nenhuma rota nova, nenhum campo novo no corpo do pedido.

### Antes → Agora

| | Antes | Agora |
|---|---|---|
| Data de entrega | uma por **item**, em "detalhes" da linha, mais a previsão do pedido escondida em "Condições" | **uma por pedido**, na seção "3. Entrega", ao lado do local |
| Seções do pedido | 1 Fornecedor · 2 Itens · 3 Condições · 4 Total · Mais opções | 1 Fornecedor · 2 Itens · **3 Entrega** · 4 Condições · 5 Total · Mais opções |
| Painel de detalhes do item | Unidade, IPI, Entrega, Descrição, Observação | Unidade, IPI, Descrição, Observação |
| Recebimento por pedido | coluna "Entrega" em cada item | sem a coluna; previsão no cabeçalho do pedido |
| Servidor | gravava e devolvia `data_entrega` por item | descarta na gravação e não devolve |

### Roteiro de teste manual (clicável)

1. **Compras → Pedidos de Compra → Novo pedido.** Confira os títulos das seções: *1. Fornecedor*,
   *2. O que está sendo comprado*, **3. Entrega**, *4. Condições*, *5. Total* e o botão *Mais opções*.
2. Em **3. Entrega**, clique em **Em 15 dias** — a data aparece abaixo dos botões (ex.: 21/10/2026).
   Clique em **Outro endereço** e digite um endereço em *Entregar em*.
3. Em **2. O que está sendo comprado**, clique **Adicionar um → Escolher material**, escolha um
   material, informe quantidade e preço. Clique na **seta** ao lado da lixeira (dica ao passar o mouse:
   *"Unidade, IPI e observações deste item"*): o painel mostra **Unidade**, **IPI deste item**,
   **Descrição no pedido** e **Observação do item** — **não** há "Entrega deste item".
4. Escolha o fornecedor em **1. Fornecedor** e clique **Salvar pedido**. Reabra o pedido na lista:
   a previsão e o local de entrega voltam preenchidos em **3. Entrega**.
5. **Almoxarifado → Recebimentos NF → Novo Recebimento → Forma de recebimento: Por Pedido de
   Compra → selecione o pedido.** No painel do pedido, o bloco *Condições do pedido* mostra
   **Previsão de entrega**; a tabela de itens tem as colunas #, Código, Descrição, NCM, Qtd, Un,
   Vl. unit. e Total — **sem "Entrega"**.
6. *(Pedido antigo, se houver)* Abra um pedido criado antes desta etapa que tinha data por item:
   o painel de detalhes do item não mostra data; salve e reabra — continua sem.

### O que a etapa NÃO cobre

- Apagar a coluna `itens_pedido_compra.data_entrega` do banco (fica, sem leitor; A1).
- Entrega parcelada (mais de uma data por pedido) ou previsão por fornecedor.
- Imprimir a previsão/local no documento PDF do pedido além do que a Etapa 32 já imprimia.
- O pedido de compra da branch do almoxarifado (B1) — esta etapa é só da linha `main`.

## Etapa 34 — A ficha do fornecedor (2026-10-06)

**Em uma frase.** O fornecedor ganhou uma tela própria de cadastro e edição — com dois
telefones (empresa e vendedor), endereço completo e preenchimento automático por CNPJ e por
CEP — e os botões "Novo Fornecedor" e o lápis da lista, que não faziam nada, passaram a abri-la.

### O que há de novo (visível para o usuário)

- **Compras > Fornecedores > Novo Fornecedor** abre a ficha completa, em três blocos:
  *Identificação* (razão social, nome fantasia, CNPJ com lupa, inscrição estadual, grupo
  homologado), *Contato* (nome do vendedor, telefone da empresa, telefone do vendedor, e-mail)
  e *Endereço* (CEP com lupa, endereço, cidade, estado). O lápis de cada linha da lista abre a
  mesma ficha para editar, com o campo *Status* (ativo/inativo).
- **CNPJ preenche a ficha.** No cadastro novo, basta digitar o CNPJ e sair do campo: razão
  social, nome fantasia, e-mail, telefone da empresa, endereço, cidade, estado e CEP vêm da
  Receita. Na edição a consulta é pela lupa e **só preenche o que está vazio** — o que você já
  digitou não é sobrescrito. Se a consulta falhar, aparece "Não foi possível consultar o CNPJ"
  e nada muda.
- **CEP preenche o endereço.** Digitou o CEP e saiu do campo: endereço (rua e bairro), cidade
  e estado entram sozinhos, também só nos campos vazios. CEP inexistente avisa "CEP não
  encontrado".
- **Dois telefones.** *Telefone da empresa* e *Telefone do vendedor* são campos separados, os
  dois com máscara enquanto se digita. O antigo "Contato" agora se chama *Nome do vendedor*.
- **A lista mostra os dois telefones** na mesma coluna (empresa em cima, vendedor embaixo) e
  a exportação para Excel ganhou a coluna "Telefone vendedor".
- **"Remover do grupo" passou a remover** (em Fornecedores Homologados > grupo). Antes mostrava
  "removido" e o fornecedor continuava no grupo.

### Por baixo do capô

- As rotas de fornecedor (`POST`/`PUT /api/compras/fornecedores`) saíram do arquivo principal
  do servidor para um módulo próprio (`server/routes/compras/fornecedores.js`), onde a suíte de
  testes consegue montá-las. Nasceu `GET /api/compras/fornecedores/:id` (devolve a ficha, sem a
  planilha de itens que a lista carrega inteira).
- Coluna nova no banco: `fornecedores.telefone_vendedor` (criada sozinha ao subir o servidor).
  A coluna `celular` da Etapa 32 continua intocada — o documento do pedido a imprime.
- O `POST` passou a gravar **as 13 colunas** da ficha. Antes descartava endereço, cidade,
  estado, CEP e inscrição estadual em silêncio.
- O `PUT` mudou de semântica: **chave ausente não mexe; vazio ou nulo limpa**. É o que deixa
  o modal antigo do grupo (que manda 7 campos) continuar sem apagar cidade/CEP/telefone do
  vendedor — e é o que consertou o "Remover do grupo" (manda `grupo_id: null`, que antes era
  ignorado). Decisão registrada em **B2**.
- Proxy novo `GET /api/cep/:cep` (ViaCEP, 8 s de timeout), ao lado do proxy de CNPJ que já
  existia. Decisão registrada em **B6**.
- Utilitário `client/src/utils/cnpj.js` (validação de dígitos, máscaras, tradução da consulta,
  "preencher só vazios") — o cadastro de cliente do comercial pode adotá-lo depois.
- Testes: `comprasFornecedor.api.test.js` (22 cenários), `cep.api.test.js` (8),
  `cnpj.test.js` (10), `FornecedorForm.test.js` (16), `Compras.fornecedores.test.js` (2).

### Antes → Agora

| | Antes | Agora |
|---|---|---|
| "Novo Fornecedor" na lista | Não fazia nada (a rota caía na própria lista) | Abre a ficha completa |
| Lápis "Editar" na lista | Idem | Abre a ficha preenchida, com status |
| Cadastro possível | Só o modal do grupo homologado (7 campos) | Ficha com 13 campos; o modal continua funcionando |
| Endereço, cidade, estado, CEP, IE no cadastro novo | Descartados pelo servidor | Gravados |
| Telefone | Um campo ("Telefone") e "Contato" | Telefone da empresa, telefone do vendedor e nome do vendedor |
| Preenchimento por CNPJ | Só no cadastro de cliente (comercial) | Na ficha do fornecedor, sem sobrescrever o que já foi digitado |
| Preenchimento por CEP | Não existia em lugar nenhum do sistema | Endereço, cidade e estado pelo CEP |
| "Remover do grupo" (Fornecedores Homologados) | Mostrava "removido" e **não removia** | Remove |
| Lista / Excel | Um telefone | Os dois telefones; coluna "Telefone vendedor" no Excel |

### Roteiro de teste manual (clicável)

1. **Compras > Fornecedores > Novo Fornecedor.** A tela "Novo fornecedor" abre com os três
   blocos. (Antes: nada acontecia.)
2. Em *CNPJ*, digite `54.984.382/0001-64` e clique fora do campo (ou na lupa). Razão social,
   nome fantasia, endereço, cidade, estado, CEP e telefone da empresa se preenchem. Digite um
   CNPJ com dígito errado (ex.: `54.984.382/0001-65`) e saia do campo: nada é consultado.
3. Apague o CEP e o endereço, digite `01310-100` em *CEP* e saia do campo: endereço vira
   "Avenida Paulista, Bela Vista", cidade "São Paulo", estado "SP". Digite `99999-999`:
   aparece "CEP não encontrado".
4. Em *Telefone do vendedor*, digite `11987654321`: aparece `(11) 98765-4321`. Em *Telefone da
   empresa*, `1141772311` vira `(11) 4177-2311`.
5. Preencha *Nome do vendedor*, escolha um *Grupo homologado* e clique **Salvar**. Toast
   "Fornecedor salvo"; a lista mostra o fornecedor com os dois telefones na coluna Telefone.
6. Clique no lápis do fornecedor recém-criado: a ficha abre preenchida, com *Status*. Apague
   a cidade, clique na lupa do CNPJ: só a cidade é preenchida de novo — o resto fica como
   estava. Troque o status para *Inativo* e salve; a lista mostra o badge "inativo".
7. Apague a razão social e clique Salvar: a tela mostra "Razão social é obrigatória" e não
   grava.
8. **Fornecedores Homologados > um grupo > "Remover do grupo"** em um fornecedor: confirme e
   recarregue a página — o fornecedor **saiu** do grupo (antes voltava).
9. **Exportar Excel** na aba Fornecedores: a planilha tem a coluna "Telefone vendedor".

### O que a etapa NÃO cobre

- O modal de edição dentro do grupo homologado continua com 7 campos (não ganhou os dois
  telefones nem o endereço completo); edição completa é pela ficha.
- A lista de fornecedores continua carregando a planilha de itens inteira (dívida **G2**).
- O `DELETE` de grupos continua sombreado pelo `DELETE` genérico (dívida **G1**).
- O cadastro de **cliente** (comercial) não foi tocado — continua com a lógica própria de CNPJ
  e sem consulta de CEP.
- Não valida se o grupo informado existe (nunca validou; o modal depende disso).
- Sem foto na ficha (a foto continua pelo modal do grupo, como antes).

## Etapa 35 — Cadastro de material: unidades e classe ABC (2026-10-06)

**Em uma frase.** O cadastro de material parou de fingir que converte unidades: o campo de consumo saiu, o fator de conversão explica o que é com um exemplo vivo ("1 CX = 12 UN") e a classe ABC ganhou legenda.

Commits: `0e7c0a36` (código, só client — zero linhas de servidor) e o commit de fechamento (docs).

### O que há de novo (visível para o usuário)

- **Unidade de Consumo e Fator de Conversão (Consumo) não existem mais na tela.** O sistema nunca usou os dois para nada além de gravar e mostrar; a dupla de fatores dava a impressão de que havia conversão em curso. O que já estava gravado nos materiais antigos **não se perde**: a tela simplesmente não manda mais o campo e o servidor preserva a coluna.
- **"Fator de Conversão (Compra)" virou "Fator de conversão"**, com a ajuda *"Quantas UN há em 1 CX"* (monta com as unidades que você escolheu), o exemplo vivo **"1 CX = 12 UN"** enquanto você digita, e a frase honesta: *"Informativo: as entradas e saídas são lançadas na unidade de medida; o sistema não converte sozinho."* Sem unidade de compra, o campo diz que só se aplica quando a unidade de compra é diferente da de medida.
- **Classe ABC tem legenda ao lado do campo:** A — itens de maior valor ou consumo (poucos itens, maior parte do valor; contagem e reposição mais frequentes); B — intermediários; C — muitos itens de baixo valor, controle simplificado. Rodapé: *"Classificação manual, definida por quem analisa consumo e valor."*

### Por baixo do capô

- `MaterialAlmoxarifadoForm.js`: `unidade_consumo` e `fator_conversao_consumo` saíram do state inicial, da carga na edição e da validação do submit. Como o payload é `...form`, a chave deixa de ir no `POST`/`PUT`. Antes o state nascia com `unidade_consumo: ''` e **todo** submit mandava a chave vazia — foi o controle positivo do teste (b).
- Constante exportada `LEGENDA_ABC` (`{A, B, C}`) — a tela, o teste e o manual citam o mesmo texto; trocar a definição é editar um lugar.
- CSS: `.almox-help` (ajuda abaixo do campo) e `.almox-legenda-abc` (lista compacta, 13px, `--gmp-text-light`).
- **Servidor intocado.** `materialCompleto.api.test.js` (20/20) continua provando que a API aceita `unidade_consumo` e exige o fator quando ela vem — só a tela parou de mandar.
- Testes: 6 cenários novos (a)–(f) em `MaterialAlmoxarifadoForm.test.js`; vermelho 6 falhando / 16 passando antes, verde 22/22 depois. Suíte do client 691/691 em 44 arquivos; build CI limpo.

### Antes → Agora

| Antes | Agora |
|---|---|
| Três unidades na tela (medida, compra, consumo) e dois fatores | Duas unidades (medida, compra) e um fator |
| "Fator de Conversão (Compra)" com placeholder e nada mais | "Fator de conversão" com ajuda nomeando as unidades, exemplo vivo e aviso de que é informativo |
| Editar material antigo reenviava `unidade_consumo` (vazio ou o valor carregado) | A chave não vai; o servidor preserva o que estava gravado |
| Select A/B/C sem explicação | Legenda das três classes + "classificação manual" |
| Manual §2.3 descrevia o campo de consumo; §2.5 sem legenda | Manual atualizado nas duas seções, com a legenda e a dúvida D-35 |

### Roteiro de teste manual (clicável)

1. **Almoxarifado > Materiais > Novo.** Em *Estoque e Reposição*, deixe **Unidade de Medida = UN**. Em *Unidades e Custos*, escolha **Unidade de Compra = CX**: aparece a ajuda *"Quantas UN há em 1 CX"* e a frase *"Informativo: … o sistema não converte sozinho"*.
2. Digite **12** no *Fator de conversão*: aparece **"1 CX = 12 UN"** em negrito. Troque a unidade de medida para M e a de compra para ROLO: o exemplo vira "1 ROLO = 12 M". Apague o fator: o exemplo some, a frase informativa fica.
3. Ainda em *Unidades e Custos*, confira a **legenda** embaixo de *Classe ABC*: três linhas A/B/C e o rodapé "Classificação manual…".
4. Percorra a seção inteira: **não existe** mais "Unidade de Consumo" nem "Fator de Conversão (Consumo)".
5. Volte à lista e **edite um material antigo** que tinha unidade de consumo gravada (ou qualquer material): mude só a descrição e salve. Reabra: unidade de compra e fator continuam; nada foi apagado. (Pela API, `GET /almoxarifado/materiais/:id` continua devolvendo `unidade_consumo` com o valor antigo.)
6. Escolha uma unidade de compra e tente salvar **sem** fator: a tela recusa com "Informe um fator de conversão maior que zero".

### O que a etapa NÃO cobre

- **O sistema continua sem converter.** Receber 2 CX de um material com fator 12 continua sendo lançado como 24 UN pelo usuário; o fator é só informação (dúvida **D-35b** — converter no recebimento é regra nova do motor de estoque, etapa própria na branch do almoxarifado).
- As colunas `unidade_consumo`/`fator_conversao_consumo` **não foram apagadas** nem o Zod mudou: quem manda por API continua aceito. Apagar seria irreversível e não traz nada agora.
- A legenda ABC é a definição genérica, **sem fonte no projeto** (dúvida **D-35**, B5).
- O manual da branch `desenvolvimento-almoxarifado` é mais novo que o de `main` e **não** recebeu esta edição — repetir §2.3/§2.5 no merge, junto com o `cherry-pick` do `0e7c0a36` (B4).
