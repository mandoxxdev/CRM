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

_Em execução — seção escrita no fechamento da etapa._

## Etapa 35 — Cadastro de material: unidades e classe ABC (2026-10-06)

_Em execução — seção escrita no fechamento da etapa._
