# Compras e cadastros — novidades por etapa (documento de apresentação)

> **Para que serve:** este é o documento para **apresentar à empresa** o que mudou no sistema, em
> linguagem de usuário — cada etapa diz o que dá para ver na tela, o que mudou por baixo e um
> roteiro curto para demonstrar ao vivo. Pedido do André em 2026-10-06. O equivalente do
> almoxarifado é `docs/almoxarifado-novidades-por-etapa.md`.
>
> **Onde o desenvolvimento está:** **2026-10-07 — unificação.** A branch `desenvolvimento-almoxarifado`
> (Etapas 0–77 do almoxarifado) foi mesclada na `main`; daqui em diante **só existe a `main`**
> (decisão do André; detalhes e perdas em **B18**). O lote de Compras (Etapas 33–38, seções abaixo)
> continua valendo, com uma exceção: a Etapa 33 ficou sem objeto e a Etapa 32 da `main` saiu.
> O que sobra para o P.O.: **D-37** (categoria depende de família?) e **D-35** (significado de
> A/B/C). Design do lote:
> `docs/superpowers/specs/2026-10-06-crm-lote-compras-outubro-design.md`; índice do módulo:
> `specs/modulo-compras/README.md`.

## ⚠️ Leia antes de apresentar — o que exige decisão ou ação sua

### A. Para rodar em produção antes do deploy
- **A1** — nada a limpar. (As etapas desta noite não exigem limpeza de dado; a Etapa 33 deixa a coluna
  `itens_pedido_compra.data_entrega` no banco, sem leitor — pode ser apagada numa migração futura.)
- **A2** — **Consulta, não ação:** fornecedores com CNPJ fora do padrão de 14 dígitos
  (`SELECT id, razao_social, cnpj FROM fornecedores WHERE LENGTH(REPLACE(REPLACE(REPLACE(cnpj,'.',''),'/',''),'-','')) <> 14 AND cnpj IS NOT NULL AND cnpj <> ''`).
  A tela nova **preserva** esses valores como estão (achado F1 da revisão, corrigido antes do
  push); a consulta é só para você saber quantos existem e decidir se vale normalizar à mão.
- **A3** — O deploy desta versão em banco **já existente** não exige nada. Em banco **novo** o
  primeiro boot deixou de falhar nos `ALTER` de `fornecedores` (F3 — estava assim desde a Etapa 32
  para `grupo_id`/`planilha_*`/`foto`; o container local mostrou o erro).

### B. Decisões que eu tomei e você pode reverter
- **B1 — Esta frente vive em `main`, e `main` tem OUTRO pedido de compra.** A branch
  `desenvolvimento-almoxarifado` (Etapas 38–41) reescreveu o pedido de compra sem saber que `main`
  já tinha a Etapa 32. Os dois gravam nas mesmas tabelas com colunas diferentes. Escolhi
  implementar o lote contra `main` (é o que a empresa vê). **Descartado:** fazer na branch (ninguém
  veria até o merge do módulo). **Pendente para o merge:** escolher um dos dois pedidos — a
  reconciliação não é feita aqui.
- **B2 — Etapa 34: o `PUT` de fornecedor muda de "substitui tudo" para "chave ausente não mexe; vazio/nulo limpa".**
  Efeito colateral bom, achado pela revisão do plano: em `main` o botão **"Remover do grupo"** (tela
  Fornecedores homologados → grupo) mostrava "removido" e **não removia** — o servidor tratava
  `grupo_id: null` como "não mexer". Agora remove de verdade (provado por teste).
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
- **B8 — Etapa 36: as telas de configuração do Almoxarifado e da Produção foram EMBUTIDAS em
  abas de `/configuracoes`, não movidas.** As rotas antigas (`/almoxarifado/configuracoes`,
  `/fabrica/configuracoes`) e os itens de menu continuam — é o que atende o administrador do
  almoxarifado que não tem o módulo Administrativo (ele não chega a `/configuracoes`). Reverter =
  apagar a aba. **Descartado:** mover as 11 abas do almoxarifado (quebraria o acesso desse perfil).
- **B9 — Etapa 36: quem vê qual aba.** A aba de um módulo aparece para quem já pode configurar
  aquele módulo (a mesma régua do item "Configurações" do menu de cada módulo); **Geral** aparece
  sempre para quem entra na tela — um admin do almoxarifado que recebeu o módulo Administrativo
  vê Geral (SMTP, backup) + Almoxarifado, exatamente o que já via nas 7 abas antigas. Módulo sem
  tela de configuração (Compras, Financeiro, Engenharia, Projetos, Frota) ganha uma aba que diz
  "ainda não tem configurações próprias" — é o lugar onde elas vão nascer.
- **B10 — Etapa 36: as abas "Template de proposta", "Opções por família" e "Variáveis técnicas"
  saíram de Geral e foram para a aba Comercial** (operam propostas e famílias de produto). O
  botão "Configurar template" da lista de propostas continua abrindo a aba certa. Reverter = uma
  linha no mapa `ABAS_POR_MODULO`.
- **B11 — Etapa 36: a aba interna das configurações do almoxarifado passou a ficar na URL
  (`?tab=`).** Antes, recarregar a página voltava para "Tipos de Material" (achado da revisão do
  plano). Vale também na rota antiga.
- **B12 — Etapa 36: o botão Voltar do navegador volta de MÓDULO, não de aba.** Trocar de módulo
  entra no histórico; trocar de aba interna não (senão cada aba viraria um passo do Voltar).
  Reverter = uma linha (`push` ↔ `replace`).
- **B13 — Etapa 37: a árvore é desenhada na própria aba Famílias** (cartão da raiz com as
  subfamílias dentro), e "Nova subfamília" é um botão no cartão da raiz, com o pai travado.
  **Descartado:** um seletor de "família pai" no formulário de família nova — permitiria promover
  ou rebaixar famílias por engano; o servidor cobre esses casos e a tela não precisa expô-los.
- **B14 — Etapa 37: mover uma subfamília para outra raiz, ou transformar raiz ↔ subfamília,
  continua só pela API.** A tela não oferece; o PUT preserva o vínculo. Reversível quando houver
  um caso real.
- **B15 — Etapa 37: o servidor ganhou três toques para a subfamília ser honesta** — contagem de
  itens por subfamília (era sempre 0), itens ao expandir a subfamília (era vazio) e o filtro de
  Materiais por subfamília (devolvia nada) — e **uma correção de defeito**: inativar uma
  subfamília com itens passava, e os itens dela ficavam ineditáveis; agora é recusado com a mesma
  mensagem que a família raiz já recebia. **Descartado:** entregar só a tela e deixar "0 itens"
  numa subfamília cheia.
- **B16 — Etapa 37 (revisão): material cuja subfamília foi inativada antes desta versão volta a
  ser editável.** O servidor passou a revalidar a subfamília só quando ela **muda**; o cadastro
  mostra "(subfamília inativa)" e deixa manter ou limpar. **Descartado:** apagar o vínculo em
  silêncio ao editar (era o único jeito de salvar antes — e apagava dado sem avisar).
- **B17 — Etapa 38: o número da frase "1 CX contém [12] UN" é obrigatório quando há unidade de
  compra** (o servidor já exigia; a tela agora diz "Obrigatório."), e voltar para "na própria
  unidade" **limpa** o número gravado (antes ficava um número órfão escondido). **Descartado:**
  tornar o número opcional (mudaria a regra do servidor sem pedido).
- **B18 — Unificação (2026-10-07): o almoxarifado inteiro entrou na `main`, e o pedido de compra
  que sobreviveu é o da branch (Etapas 38–41), não o da Etapa 32 da `main`.** Você pediu "todas
  as melhorias do almoxarifado para a `main`, e daqui em diante só `main`". Os dois pedidos
  gravavam nas mesmas tabelas com colunas diferentes, e o recebimento contra pedido do
  almoxarifado (Etapas 37, 42, 71, 72) só entende o da branch. **O que a `main` perde:** o
  formulário da Etapa 32 — IPI por item, frete, condições de pagamento, via de transporte,
  snapshot fiscal do fornecedor no pedido, lançamento em lote. **O que ganha no lugar:** pedido
  gerado da cotação, importação por planilha, atraso por pedido, status automático pelo
  recebimento, e o recebimento fechando/reabrindo o pedido. A Etapa 33 (entrega no pedido)
  fica sem objeto — o pedido da branch nunca teve entrega por item. As colunas da Etapa 32
  continuam no banco, sem leitor. **A ficha do fornecedor da Etapa 34 fica** (vence a da Etapa 40
  da branch). **Reverter:** `git revert -m 1` do commit de merge devolve a `main` de antes; o
  histórico da branch continua existindo. Se os campos de IPI/frete/condições fizerem falta,
  viram pedido para o pedido da branch (etapa própria) — não há como ter os dois.
  **Atualização (mesmo dia):** fizeram falta — a Etapa 32 nascia do documento real que a GMP
  emite ao fornecedor (PDF do ERP, pedido 28433). A **Etapa 39** porta esse conteúdo para o pedido
  atual (B19–B23).
- **B19 — Etapa 39: as regras de ciclo de vida são as do pedido atual.** Número gerado (`PC-…`),
  7 status, status automático pelo recebimento, edição bloqueada após recebimento. **Descartado:**
  número digitado pelo comprador e o enum de 4 status da Etapa 32 (o recebimento, a cotação e a
  importação já geram o número).
- **B20 — Etapa 39: as colunas voltam com os mesmos nomes da Etapa 32** (produção já as tem no
  banco); `data_entrega` por item **não** volta (Etapa 33).
- **B21 — Etapa 39: o snapshot fiscal do fornecedor é reescrito quando o fornecedor do pedido
  muda** (a Etapa 32 nunca reescrevia — um pedido editado para outro fornecedor imprimiria o fiscal
  do antigo) e também quando o pedido antigo ainda não tinha snapshot. `celular` entra no snapshot.
- **B22 — Etapa 39: o painel do pedido no recebimento mostra fornecedor e condições, não preços
  nem totais** — mantém a decisão da Etapa 42 (quem recebe não vê preço).
- **B23 — Etapa 39: `observacoes` do pedido também fica fora do painel do recebimento** (a rota
  tem o gate do módulo, que alcança produção; o alerta de pedido já classifica a observação como
  "negociação com o fornecedor"). Reverter = uma chave na projeção. `tabela_preco` também fica
  fora do painel (a palavra "preço" não entra na tela de quem recebe).
- **B24 — Etapa 39: no `PUT` do pedido, encargo ausente mantém o gravado e `''` zera** (mesma
  regra dos outros campos do cabeçalho; a Etapa 32 zerava sempre).
- **B25 — Etapa 39: `peso_unitario` do item fica `NULL` quando o material não tem peso** (não
  inventa 0); NCM e peso enviados vazios pela tela significam "o do material".

### D. Dúvidas para você (ou para o P.O.)
- **D-35** — O que A, B e C significam **para a GMP**? A legenda atual é a definição genérica.
  Trocar é editar a constante `LEGENDA_ABC` em `MaterialAlmoxarifadoForm.js`.
- **D-35b — RESPONDIDA em 2026-10-07 pelo André: NÃO converte.** O time achou as legendas
  confusas e não entendeu como funcionava. Resposta na **Etapa 38**: a tela deixa de falar em
  "fator de conversão" e passa a perguntar em frase — *"Como é comprado: 1 CX contém [12] UN"* —
  com a nota "o estoque conta sempre em UN". Mesma coluna no banco; só muda como se pergunta.
- **D-36a — RESPONDIDA em 2026-10-07 pelo André: opção (ii), subfamílias na aba Famílias.**
  (Era: família × categoria — hoje a **família pertence a uma categoria** (`familia.categoria_id`)
  e a task 2 pedia o inverso.) Executada como **Etapa 37** — a aba *Famílias* ganha a árvore
  família → subfamília cadastrável; a pergunta "categoria depende de família?" fica para o P.O.
  como **D-37** abaixo, sem bloquear nada.
- **D-37** — Para o P.O.: a categoria do material deve depender da família (lista de categorias
  diferente por família)? Hoje são independentes (categoria é um catálogo único; a família tem
  uma categoria "padrão" que nada usa). Se sim, é uma etapa de modelo de dados; se não, a árvore
  da Etapa 37 já atende.
- **D-36b** — (respondida pelo caminho reversível na Etapa 36, B8) Configurações por módulo:
  embutir a tela atual de configurações do almoxarifado numa aba "Almoxarifado" de
  `/configuracoes` — foi o que se fez; mover as abas foi descartado.
- **D-36c** — Quem vê a aba Almoxarifado dentro de Configurações: só admin do sistema ou também o
  administrador do almoxarifado?

### G. Dívidas conhecidas, declaradas
- **G1** O `DELETE` genérico de `/api/compras/:tipo/:id` continua sombreando `grupos` (400 'Tipo
  inválido') — não consertado (escopo da aba Grupos). Em `main` ele mora no `index.js`, fora do
  harness — não há teste que o caracterize.
- **G2 — corrigido em 2026-10-07, depois da Etapa 38.** `GET /api/compras/fornecedores` era
  `SELECT *` e devolvia `planilha_dados` (a planilha de preços inteira em JSON) para quatro telas
  que não a leem (`Compras.js`, `PedidoCompraForm.js`, `FornecedoresDoGrupo.js`,
  `ItensFornecedor.js`). A lista saiu do `index.js` para o módulo de fornecedor com a mesma
  projeção nomeada do `GET /:id`; busca, filtro de status e ordenação iguais. Visível para o
  usuário só como velocidade (a lista e o formulário de pedido deixam de baixar as planilhas).
- **G3** `client/.env.production` tem `CI=false` e `DISABLE_ESLINT_PLUGIN=true`: o build de produção
  **não** cai por warning de lint — a regra "CI=true faz warning virar erro" do `CLAUDE.md` vale
  para o comando de verificação que rodamos, não para o deploy. `Compras.js` (8 warnings) e
  `MaterialAlmoxarifadoForm.js` (2) já tinham warnings antes do lote; os arquivos novos estão limpos.
- **G5 — corrigido em 2026-10-07 (madrugada), depois do fechamento do lote.** O primeiro boot em
  banco novo também falhava para `pedidos_compra` (os `ALTER` da Etapa 32 — `transportadora`,
  `snap_fornecedor_*` — rodavam soltos antes do `CREATE`; medido no log do container em volume
  novo). Mesma correção da Etapa 34: os `ALTER` rodam no callback do `CREATE`. Prova: container
  em volume novo sem **nenhum** erro de `fornecedores` nem de `pedidos_compra` no boot (antes eram
  5 + 5). Em banco já existente (produção) nunca aconteceu — nada a fazer no deploy.
- **G6 — corrigido em 2026-10-07 (prova com `node index.js` contra pasta de dados nova, sem
  Docker).** A classe de defeito do G5 existia em outros módulos: `os_itens.codigo_produto`
  (Operacional), `propostas` (migração de "aceita"), `familias_produto.clausulas_modelo_id`
  (Comercial) — e um **quarto, mais sério, que o log do container tinha escondido**: o **admin
  inicial não era criado no primeiro boot** (`no column named is_superadmin`), ou seja, numa
  instalação nova ninguém conseguia entrar até reiniciar o servidor. Os quatro passaram a rodar
  no callback do `CREATE` da própria tabela (ou a tratar "banco novo" como "nada a migrar").
  Medido: antes 3 `no such table` + 1 `no column named`; depois **0 e 0**, "Admin inicial criado"
  no primeiro boot, segundo boot sem erro. Em banco existente (o seu `npm run dev`) nada muda.
  Fica um aviso pré-existente e inofensivo: `WAL mode unavailable: cannot change into wal mode
  from within a transaction` (o `PRAGMA` roda dentro de uma transação; o WAL entra no boot
  seguinte) — **G12**.
- **G7** A lista de módulos do sistema existe em **quatro** lugares (`modulosMeta.js`,
  `TipoSelecao.todosModulos`, `MODULE_ADMIN_KEYS` no servidor, `DEFAULT_MODULOS_TIPO`). A Etapa 36
  usou a do cliente (`modulosMeta.js`) e **não** criou uma quinta; unificar é etapa própria.
- **G8** As abas da Etapa 36 usam um componente `Tabs` reutilizável novo; as outras seis barras de
  abas do sistema (Admin, Compras/Financeiro, Minha Conta, OS comercial, Operacional, e a barra
  interna do almoxarifado) continuam cada uma com o próprio CSS. Migrar é etapa própria.
- **G10** Material gravado **pela API** com a subfamília no lugar da família (`familia_id = <sub>`;
  nenhuma tela faz isso): a subfamília conta e lista, a raiz não, e o filtro de Materiais não o
  acha. Correção apontada: `validateFamiliaAtiva` recusar subfamília como família em material
  **novo** ("use a subfamília"). Não feito — sem consumidor real.
- **G13** (Etapa 39) O export de pedidos para Excel passa a trazer "Valor Total" **com** IPI e
  frete, repetido em cada linha de item, e a reimportação ignora essa coluna — um pedido
  exportado e reimportado nasce com valor menor. Coluna "IPI %" no export fica para depois.
- **G14** (Etapa 39) O documento impresso do pedido (PDF/HTML no formato do ERP) **ainda não
  existe** — a Etapa 32 deixou "a fazer" e a 39 porta só o conteúdo. É a **Etapa 40**.
- **G11** `?familia_id=<id de subfamília>` digitado na URL de Materiais antes de a lista de famílias
  carregar manda só `familia_id` e devolve zero linhas até mexer no filtro. Nenhum link do sistema
  gera essa URL. Correção: incluir `familias` nas dependências da busca (um GET a mais).
- **G9** `canConfigureModule` diverge entre cliente e servidor: o cliente aceita `role === 'admin'`,
  o servidor só superadmin/admin de módulo. A Etapa 36 não cria porta de servidor, então nada ficou
  mais frouxo — mas a divergência existe desde antes e precisa fechar quando o core ganhar perfis.
- **G4** O cadastro de fornecedor aceita CNPJ em texto livre (sem validação de dígitos no servidor,
  sem `UNIQUE`). A tela nova valida os dígitos só para **consultar**; gravar continua livre, de
  propósito (há CNPJ legado fora do padrão — A2).

---

<!-- Formato de cada seção de etapa (escrita no fechamento da etapa, SÓ dentro do próprio cabeçalho):
**Em uma frase.** · ### O que há de novo (visível para o usuário) · ### Por baixo do capô ·
### Antes → Agora (tabela) · ### Roteiro de teste manual (clicável) · ### O que a etapa NÃO cobre -->

## Etapa 39 — O pedido de compra ganha o documento da Etapa 32 (2026-10-07)

**Em uma frase.** O pedido de compra voltou a carregar **tudo o que o documento da GMP leva ao
fornecedor** — condições comerciais, IPI por item, frete/desconto/ICMS-ST, os seis totais e os
dados fiscais do fornecedor congelados no pedido — sobre o pedido que já conversa com o
recebimento, sem abrir mão do número automático e do fechamento automático.

### O que há de novo (visível para o usuário)
- **Compras → Pedidos → Novo / Editar**, seção **3. Condições**: condição de pagamento, quem paga o
  frete, via de transporte, transportadora e telefone, tabela de preço, contato, *Entregar em* e
  *Cobrar em* — tudo em **botões**; o que você digitar em "Outro" vira botão no próximo pedido.
- **Por item**: IPI % (botões 0 / 3,25 / 5 / 6,5 / 10 / 15 ou "Outro"), NCM e peso (vêm do
  cadastro do material, editáveis), observação do item. Há um IPI padrão do pedido para preencher
  todas as linhas de uma vez.
- **Bloco 4. Total**: frete, desconto e ICMS-ST, e os seis totais (produtos, IPI, ICMS-ST,
  desconto, frete, **total geral**) — calculados **pelo servidor** enquanto você digita; o
  navegador não soma. O total geral é o que a lista de pedidos mostra.
- **Fornecedor congelado no pedido**: ao criar o pedido, nome, CNPJ, IE, endereço, telefone,
  celular e e-mail do fornecedor são gravados **naquele momento**. Mudar o cadastro do fornecedor
  depois não altera o pedido; trocar o fornecedor do pedido congela o novo.
- **Recebimento contra pedido**: ao escolher o pedido, aparece o painel **Fornecedor** e
  **Condições** (pagamento, frete, transportadora, via, contato, entregar em) — **sem preços, sem
  totais e sem observações** (quem recebe não vê negociação).
- Cotação → pedido, importação por planilha e número automático continuam como estavam; pedidos
  vindos deles nascem com IPI 0 e sem encargos.

### Por baixo do capô
- As 24 colunas da Etapa 32 em `pedidos_compra` (9 condições, 5 totais, 10 de snapshot) e 5 em
  `itens_pedido_compra` (`item_numero`, `ncm`, `peso_unitario`, `ipi_percentual`, `observacao`)
  voltam ao código **com os mesmos nomes** (produção já as tinha); `data_entrega` por item não
  volta (Etapa 33).
- `pedidoTotais.js` restaurado **byte a byte** com os 22 testes sobre o pedido real 28433;
  `opcoesPedido.js` restaurado sem o "próximo número". **A cotação passou a usar a mesma conta**
  (antes arredondava a soma e o pedido arredondava por linha — com preço de 4 casas divergiam em
  centavos sem nenhum teste pegar).
- `POST /api/compras/pedidos/calcular` (prévia, tolerante a campo vazio), `GET
  /api/compras/pedidos-aux/opcoes`, `GET /api/almoxarifado/recebimentos-aux/pedidos-compra/:id`
  (projeção sem valores). `GET /pedidos/:id` ganha `itens[].valor_linha/ipi_linha`, `totais` e
  `fornecedor{…, origem}`; a lista ganha `total_geral` e `total_itens`.
- Snapshot gravado **no serviço** (vale para cotação e importação) e reescrito quando o fornecedor
  muda ou quando um pedido antigo sem snapshot é editado.

### Antes → Agora
| Antes (depois do merge) | Agora |
|---|---|
| Pedido = fornecedor, datas, status, observações, itens com quantidade e preço | + condições comerciais, IPI por item, encargos, seis totais, fornecedor congelado |
| Total = soma crua `qtd × unit` no navegador | Conta do documento (arredondada por linha, com IPI e encargos) feita pelo servidor; `valor_total` = total geral |
| Cotação e pedido arredondavam diferente | Uma calculadora só |
| Recebimento mostrava só os itens com saldo | + painel Fornecedor e Condições (sem preço) |

### Roteiro de teste manual (clicável)
1. **Compras → Pedidos → Novo Pedido.** Escolha o fornecedor. Em **3. Condições** clique "30 dias",
   "CIF", "Rodoviário"; em transportadora clique "Outro" e digite "Transp. Teste".
2. Adicione 2 itens: A (2 × 50,00) e B (3 × 10,00). No item A, abra os detalhes e clique **IPI
   10 %**. Veja NCM e peso virem do cadastro.
3. Em **4. Total**, digite frete 50,00. Confira: produtos 130,00 · IPI 10,00 · frete 50,00 ·
   **total geral 190,00** (o número apareceu sem você somar). Salve.
4. Volte à lista: o pedido mostra **R$ 190,00**. Abra de novo: "Transp. Teste" agora é um botão.
5. **Compras → Fornecedores**: edite o fornecedor e troque o nome fantasia. Abra o pedido: o nome
   gravado **não mudou**.
6. **Almoxarifado → Recebimentos → Novo (contra pedido)**: escolha o pedido; aparece o painel com
   Fornecedor e Condições — e **não** aparece preço nem total. Receba 1 unidade de A.
7. **Almoxarifado → Materiais → A → extrato/custo**: o custo médio ficou 50,00 (sem IPI).
8. Receba o resto: o pedido fica **Recebido** sozinho e não pode mais ser editado (só o status).

### O que a etapa NÃO cobre
- **O documento impresso** (PDF/HTML no formato do ERP) — a Etapa 32 nunca o fez; é a **Etapa 40**
  (G14).
- Coluna "IPI %" no export para Excel; a reimportação ignora IPI/frete (G13).
- Importação por planilha com colunas de IPI/NCM.
- Número digitado pelo comprador e os 4 status da Etapa 32 (B19).

## Etapa 38 — "1 CX contém 12 UN": a unidade de compra vira frase (2026-10-07)

**Em uma frase.** No cadastro de material, a palavra **"fator de conversão" sumiu**: o campo
virou a frase que a pessoa diria — *"Como é comprado: 1 CX contém [12] UN"* — com a nota de que
o estoque conta sempre na unidade de medida. Resposta à D-35b (o sistema **não converte**, por
decisão; o time não entendia o termo).

### O que há de novo (visível para o usuário)
- Em **Almoxarifado → Materiais → Novo / Editar**, bloco "Unidades e Custos": o campo *Unidade de
  Compra* passa a se chamar **"Como é comprado"**, com a opção padrão "— na própria unidade de
  medida —".
- Ao escolher uma unidade de compra (ex.: CX), aparece a linha **"1 CX contém [ __ ] UN"** com o
  número dentro da frase, e a nota *"O estoque conta sempre em UN. Este número é só informação
  para quem compra."*
- Sem unidade de compra, nada disso aparece — a tela não fala em fator, conversão nem "só se aplica".
- Se escolher a unidade de compra e deixar o número vazio: *"Informe quantas UN há em 1 CX"*.
- **Nada muda no que é gravado**: é a mesma informação de antes, perguntada de outro jeito. Materiais
  já cadastrados abrem com a frase preenchida ("1 ROLO contém 50 M").

### Por baixo do capô
- Só o formulário (`MaterialAlmoxarifadoForm.js`) e o manual; a coluna `fator_conversao_compra` e a
  validação do servidor (obrigatório e > 0 quando há unidade de compra) ficam iguais.
- Bônus G11: em **Materiais**, abrir a lista com `?familia_id=` de uma subfamília na URL passa a
  rebuscar quando a lista de famílias chega (antes mostrava zero linhas até mexer no filtro).

### Antes → Agora
| Antes | Agora |
|---|---|
| "Unidade de Compra" + "Fator de conversão" (número solto, placeholder "Ex.: 12 (1 CX = 12 UN)") | "Como é comprado: 1 CX contém [12] UN" |
| Ajuda "Quantas UN há em 1 CX. Obrigatório e maior que zero." + "Informativo: … não converte sozinho" | "O estoque conta sempre em UN. Este número é só informação para quem compra." |
| Toast "fator de conversão obrigatório…" | "Informe quantas UN há em 1 CX" |

### Roteiro de teste manual (clicável)
1. **Almoxarifado → Materiais → Novo**. Em "Unidades e Custos", veja que não existe a palavra
   "fator" em lugar nenhum. Unidade de medida: UN.
2. Em **"Como é comprado"** escolha **CX**: aparece "1 CX contém [ ] UN" e a nota do estoque.
3. Salve sem preencher o número: *"Informe quantas UN há em 1 CX"*. Digite 12 e salve.
4. Edite o material: a frase volta preenchida "1 CX contém 12 UN".
5. Troque "Como é comprado" para a opção padrão: a frase some; salve — grava sem o número.

### O que a etapa NÃO cobre
- O sistema continua **sem converter** quantidades (decisão D-35b); o número é informação.
- A tela de recebimento não mostra a frase (fora do escopo; se quiserem ver "1 CX = 12 UN" ao
  receber, é uma linha de leitura — anotar como pedido).

## Etapa 37 — Subfamílias cadastráveis na aba Famílias (2026-10-07)

**Em uma frase.** A aba **Famílias** (Configurações → Almoxarifado) virou uma **árvore**: cada
família raiz mostra as suas subfamílias dentro do cartão, com o botão **"Nova subfamília"** — a
árvore de classificação que a task 2 pedia, na forma que você escolheu (D-36a, opção ii).

### O que há de novo (visível para o usuário)
- **Só famílias raiz como cartões**; dentro de cada um, a lista "Subfamílias (N)" com código,
  nome, selo de tipo de uso, contagem de itens e ações (editar, inativar, expandir itens,
  adicionar item). Raiz sem subfamília mostra "Nenhuma subfamília".
- **"Nova subfamília"** no cartão da raiz abre o formulário com o pai travado ("Subfamília de:
  ROL — Rolamentos"); nome, código (opcional — o sistema gera), descrição e tipo de uso.
- **Contagem honesta:** a subfamília mostra quantos materiais estão nela (antes seria sempre 0,
  porque o material grava a família raiz); a raiz continua mostrando o total, incluindo os das
  subfamílias.
- **Expandir a subfamília** mostra os itens dela (antes viria vazio).
- **"Adicionar item" na subfamília** abre o cadastro de material já com família **e** subfamília
  selecionadas.
- **Materiais → filtro por família** passou a listar a árvore (raiz; "— subfamília" indentada) e
  filtrar de verdade por subfamília (antes escolher uma subfamília devolvia lista vazia).
- **Defeito corrigido:** inativar uma subfamília que tinha itens **passava** — a subfamília sumia
  e os materiais dela ficavam ineditáveis (erro "Subfamília inválida"). Agora é recusado com a
  mesma mensagem da família raiz: *"Não é possível remover: família possui N item(ns) ativo(s)"*.

### Por baixo do capô
- O servidor já tinha a hierarquia (`parent_id`, máximo 2 níveis, bloqueios) desde a Etapa 2 do
  almoxarifado, com 23 cenários de teste; faltava a tela. Esta etapa acrescentou **4 toques** no
  servidor (contagem por subfamília, itens da subfamília, filtro `?subfamilia_id=`, `DELETE`
  contando itens da subfamília) e 8 cenários novos (31 no total).
- Client: `TabFamilias` desenha a árvore e reutiliza o formulário; `MateriaisAlmoxarifado` deriva
  os parâmetros do filtro da própria lista de famílias; `MaterialAlmoxarifadoForm` lê
  `?subfamilia_id` e ignora uma subfamília que não seja filha da família (sem erro).
- Nenhuma permissão nova: criar/editar/inativar família continua exigindo administrador do
  almoxarifado (superadmin, admin do módulo ou perfil ADMINISTRADOR).

### Antes → Agora
| Antes | Agora |
|---|---|
| Criar subfamília: **só pela API** (o guia dizia isso com todas as letras) | Botão "Nova subfamília" no cartão da família |
| Subfamílias apareciam como cartões irmãos das raízes, sem indicação | Árvore: subfamílias dentro da raiz |
| Subfamília sempre com "0 itens" e expandindo vazio | Contagem e itens reais da subfamília |
| Filtrar Materiais por subfamília devolvia nada | Filtra de verdade |
| Inativar subfamília com itens passava e quebrava a edição dos materiais | Recusado com a mensagem certa |

### Roteiro de teste manual (clicável)
1. **Administrativo → Configurações → Almoxarifado → Famílias** (ou Almoxarifado → Configurações →
   Famílias). Veja que só famílias raiz são cartões; abra o cartão **Rolamentos**.
2. Clique **"Nova subfamília"** no cartão: o formulário mostra "Subfamília de: ROL — Rolamentos".
   Digite nome "Rolamentos de esferas", salve. Ela aparece **dentro** de Rolamentos, com "0 itens".
3. Na linha da subfamília, clique **"Adicionar item"**: o cadastro de material abre com Família =
   Rolamentos e Subfamília = Rolamentos de esferas já escolhidas. Preencha nome e salve.
4. Volte a **Configurações → Almoxarifado → Famílias**: a subfamília mostra **"1 item"** e Rolamentos
   somou 1 no total. Clique no chevron da subfamília: o material aparece.
5. Tente **inativar** a subfamília (lixeira): recusado — *"Não é possível remover: família possui 1
   item(ns) ativo(s)"*. Tente inativar **Rolamentos**: recusado por ter subfamília ativa.
6. **Almoxarifado → Materiais**, filtro de família: escolha "— ROL… Rolamentos de esferas": só o
   material do passo 3 aparece. Limpe o filtro.
7. Edite o material do passo 3: a subfamília continua selecionada e salva sem erro.

### O que a etapa NÃO cobre
- Mover uma subfamília para outra família, ou transformar família ↔ subfamília pela tela (B14).
- A pergunta "categoria depende de família?" (**D-37**, P.O.).
- "Materiais por setor" (aba de Configurações) continua listando famílias planas.
- `PUT ativo:0` direto pela API não checa itens (a tela não usa esse caminho).

## Etapa 36 — Configurações com uma aba por módulo (2026-10-07)

**Em uma frase.** A tela **Administrativo → Configurações** ganhou uma barra com **um botão por
módulo** (Geral, Comercial, Compras, Financeiro, Operacional, Cálculos de Engenharia, Engenharia /
Projetos, Almoxarifado, Frota) e as configurações do Almoxarifado e da Produção passaram a abrir
**dentro dela** — é o lugar único onde as configurações de cada módulo vão morar.

### O que há de novo (visível para o usuário)
- **Barra de módulos** no topo de Configurações. Cada pessoa vê **só os módulos que já podia
  configurar** (a mesma regra do item "Configurações" do menu de cada módulo). O administrador do
  sistema vê todos.
- **Geral** = Empresa, Sistema, E-mail, Backup (como antes).
- **Comercial** = Template de proposta, Opções por família, Variáveis técnicas (saíram de "Geral",
  porque são de propostas e produtos). O botão **"Configurar template"** da lista de propostas
  continua abrindo direto a aba certa.
- **Almoxarifado** = as 11 abas que já existiam em *Almoxarifado → Configurações* (Tipos de
  Material, Famílias, Categorias, Materiais por Setor, Estoques Mínimos, Setores, Localizações,
  Alertas, Liberação por Valor, Perfis de Acesso, Configurações Gerais) — **a mesma tela, embutida**.
  O caminho antigo continua funcionando.
- **Operacional** = Motivos de parada (a tela de *Fábrica → Configurações*, embutida).
- **Compras, Financeiro, Engenharia, Projetos, Frota** = uma aba que diz *"O módulo ⟨Nome⟩ ainda
  não tem configurações próprias."* — a aba existe para as configurações nascerem ali (é onde a
  próxima etapa, categorias por família, vai entrar em Almoxarifado).
- **A URL guarda onde você está**: `?modulo=almoxarifado&tab=localizacoes`. Recarregar a página
  (F5) ou mandar o link para alguém abre **no mesmo lugar**. Antes, recarregar a tela do
  almoxarifado voltava sempre para "Tipos de Material".
- No celular, as duas barras rolam para o lado; nenhuma aba fica escondida.

### Por baixo do capô
- Componente de abas **reutilizável** (`client/src/components/ui/Tabs.js`) com acessibilidade de
  verdade (`role="tablist"`, setas do teclado trocam de aba, foco visível). Primeira tela a usá-lo.
- `Configuracoes.js` virou duas camadas: módulo (`?modulo=`) e aba interna (`?tab=`); a lista de
  módulos vem de `modulosMeta.js`, sem lista nova. As telas embutidas carregam **sob demanda**
  (lazy) — abrir "Geral" não baixa o código do almoxarifado.
- `ConfiguracoesAlmoxarifado` e `ConfiguracoesProducao` ganharam a prop `embedded` (sem cabeçalho
  próprio, sem padding duplo). A aba interna do almoxarifado passou a ser **lida e escrita na URL**
  — nos dois caminhos.
- **Zero linhas de servidor.** Nenhuma permissão nova: quem não podia configurar um módulo continua
  sem ver a aba dele, e o backend continua sendo quem decide em cada rota.

### Antes → Agora
| Antes | Agora |
|---|---|
| Configurações do sistema, do almoxarifado e da produção em **três telas**, em três menus | **Uma** tela com uma aba por módulo; as três telas antigas continuam existindo para quem só tem acesso ao próprio módulo |
| 7 abas misturadas em "Configurações do Sistema" (empresa, SMTP, backup, proposta, família…) | **Geral** (4 abas do sistema) e **Comercial** (3 abas de propostas/produtos) |
| Recarregar a página das configurações do almoxarifado voltava para "Tipos de Material" | A aba fica na URL; F5 e links abrem no lugar certo |
| Módulo sem configuração: nenhum lugar previsto | Aba do módulo já existe, dizendo que ainda não há configurações |
| Abas sem teclado nem `role` de acessibilidade | Setas ← → trocam de aba; leitores de tela entendem a barra |

### Roteiro de teste manual (clicável)
1. Entre como administrador. Menu **Administrativo → Configurações**. Veja a barra de módulos no topo:
   **Geral** selecionada, depois Comercial, Compras, Financeiro, Operacional, Cálculos de Engenharia,
   Engenharia / Projetos, Almoxarifado, Frota (sem "Admin" e sem "TODOLIST").
2. Em **Geral**, abra **Empresa** e altere um campo: salva sozinho, como antes. Confira que a aba
   **E-mail** e **Backup** continuam ali e que **Template de proposta** não está mais em Geral.
3. Clique **Comercial**: Template de proposta, Opções por família, Variáveis técnicas.
4. Clique **Almoxarifado**: a barra com as 11 abas aparece, **sem** o cabeçalho "Configurações do
   Almoxarifado". Clique **Localizações**. Olhe a URL: termina em `?modulo=almoxarifado&tab=localizacoes`.
   **Aperte F5**: a tela volta em Almoxarifado → Localizações.
5. Clique **Compras**: *"O módulo Compras ainda não tem configurações próprias."*
6. Vá a **Comercial → Propostas** e clique **"Configurar template"**: abre Configurações já em
   Comercial → Template de proposta.
7. Menu **Almoxarifado → Configurações** (o caminho antigo): a tela abre como sempre, **com**
   cabeçalho; clique em **Perfis de Acesso** e veja a URL ganhar `?tab=perfis`.
8. Entre com um usuário que é administrador do almoxarifado **mas não tem** o módulo Administrativo:
   ele não vê Administrativo → Configurações (como antes) e continua usando o caminho do passo 7.
9. No celular (ou janela estreita): as duas barras rolam para o lado.

### O que a etapa NÃO cobre
- **Categorias por família** (task 2) — espera a decisão D-36a (Etapa 37).
- Migrar as outras seis barras de abas do sistema para o componente novo (G8).
- Unificar as quatro listas de módulos (G7) e a divergência cliente/servidor de
  `canConfigureModule` (G9).
- Abrir `/configuracoes` para quem **não** tem o módulo Administrativo (a regra de acesso ao
  módulo não mudou — B9).

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
