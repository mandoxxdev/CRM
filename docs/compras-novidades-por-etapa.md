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

_Em execução — seção escrita no fechamento da etapa._

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

_Em execução — seção escrita no fechamento da etapa._
