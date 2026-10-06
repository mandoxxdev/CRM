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
