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
> **2026-10-08 — Etapa 78 entregue:** o pedido de compra sai em **PDF no formato do documento da
> GMP** (botão "Documento (PDF)" na lista e no formulário). Antes de emitir o primeiro, preencha os
> dados da empresa (**A4**).
> **2026-10-08 — Etapa 79 entregue:** o PDF e o preview da proposta passaram a **exigir login**
> (A5 fechado, B34).
> **2026-10-08 — Etapa 80 entregue:** os PDFs (proposta e pedido de compra) passam por uma **fila**
> — acabou o PDF que falhava "do nada" e o Chromium que vazava memória (B32 resolvido, B35).
> **2026-10-08 — Etapa 81 entregue:** o **PDF da OS**, o **contrato**, as **cotações** e os
> **comprovantes de viagem** deixaram de abrir sem login; os arquivos públicos (fotos, logos) não
> executam mais código (B36).
> **2026-10-08 — Etapa 82 entregue:** imagens do **chat**, **fotos da proposta** e **avatares** só
> abrem com endereço assinado que vence (B37); uploads de imagem por base64 recusam formato fora da
> lista.
> **2026-10-08 — Etapa 83 entregue:** todos os uploads de imagem decidem o formato pelo **tipo real**
> da imagem; formato errado mostra **"Formato de imagem não suportado"** em vez de "Erro interno do
> servidor" (B38).
> **2026-10-08 — Etapa 84 entregue:** o login e o chat deixaram de aceitar o token **no endereço**
> (`?token=`), que vazava em log e histórico (B39).
> **2026-10-08 — Etapa 85 entregue:** arquivo grande demais mostra **"Arquivo grande demais (máximo
> N MB)"** em vez de "Erro interno do servidor" (B40).
> **2026-10-08 — Etapa 86 entregue:** erros do **almoxarifado, chat, frotas, produção** e demais
> módulos chegam à tela como **mensagem em português**, não mais como página HTML de erro (B41).
> **2026-10-08 — Etapa 87 entregue:** o **PDF da OS** usa o mesmo Chromium dos outros PDFs — sai
> **igual** e cerca de **10× mais rápido** (4,7 s → 0,45 s); nunca mais de um Chromium aberto (B42).
> **2026-10-08 — Etapa 88 entregue:** o PDF da OS numera **cada página** ("Página 2 de 6") e não corta
> mais um item no meio (B43).
> **2026-10-08 — Etapa 89 entregue:** número de OS com barra, aspas ou acento não quebra mais o PDF
> (B44).
> **2026-10-08 — Etapa 90 (só medição):** o PDF e as telas da OS mostram o cliente **abreviado de
> propósito** (3 letras + código) — não mudei nada; ficou a pergunta **D-90**.
> **2026-10-15 — Etapa 100 entregue (frente Compras):** "Remover grupo" dos fornecedores homologados
> funciona (G1); material novo com subfamília no lugar da família é recusado e o antigo é corrigível
> pela tela (G10); o Excel de pedidos leva IPI % e encargos e reimporta com o mesmo total (G13). G11 já
> estava corrigida desde a 38; G15 avaliada e mantida como dívida. Decisões **B45–B48**, consulta
> **A6**. Próxima de Compras: a definir.
> **2026-10-15 — Etapa 103 entregue (frente Compras):** grupo de fornecedores desativado **volta pela tela**
> (botão "Reativar") e **não recebe mais fornecedor** — a tela dele avisa e o servidor recusa; família que
> tem material **não muda de nível** (virar subfamília, trocar de família principal ou virar raiz). Decisões
> **B49–B52**, consulta **A7**. Próxima de Compras: a definir (candidatas no plano da 103).
> **2026-10-15 — Etapa 105 entregue (frente Compras/cadastros):** família com material ativo **não se inativa
> mais pela API** (a mesma regra e a mesma mensagem do "Inativar" da tela), subfamília não se reativa sob família
> principal inativa; e o banco passa a entrar em **WAL já no primeiro boot** — a medição mostrou que o aviso do G12
> **não** era inofensivo: o banco ficava sem WAL em todo boot (G12 estava errado). Decisões **B53–B55**, consulta
> **A8**. Próxima de Compras: candidatas no plano da 105.
> **2026-10-15 — Etapa 107 entregue (frente Compras/dívidas do core):** instalação nova **não semeia mais as categorias
> do almoxarifado em dobro** — o G16 dizia que o banco nascia completo; **estava errado**: em 6 de 14 primeiros boots as
> 27 categorias entravam duas vezes e o índice de nome único nunca era criado; e as **quatro** barras de abas desenhadas à
> mão (Administração, Minha Conta, OS comercial, Almoxarifado → Configurações) passam a ser a barra de Configurações — o
> G8 listava seis, **estava errado** em três (Compras/Financeiro e Operacional não têm barra). Decisões **B56–B58**,
> consulta **A9**. Próxima de Compras: candidatas no plano da 107.
> **2026-10-15 — Etapa 109 entregue (frente Compras/core):** vincular fornecedor a um grupo no mesmo instante em que alguém
> clica "Remover grupo" **não grava mais o vínculo depois da desativação** — a medição mostrou que o B52 exagerava o efeito
> (o estado que sobrava era o mesmo de vincular um instante antes, que sempre foi permitido) e que a corrida **parecida** da
> família (inativar x cadastrar material) é a grave: 30 de 30 deixam família inativa com material ativo (medida, não
> corrigida — é da área da Etapa 108). E a lista de módulos do sistema passa a ter **uma fonte no cliente e uma no
> servidor**, com um teste que falha se divergirem — o G7 dizia quatro listas; **estava errado**: eram cinco com nome e
> mais dez parciais. Decisões **B59–B61**. Próxima de Compras: candidatas no plano da 109.
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
- **A4 (Etapa 78) — Ação sua antes de emitir o primeiro pedido em PDF:** preencher
  **Configurações → Geral → Empresa** — CNPJ, CEP, telefone, e-mail (o seed deixa vazios) e a
  **Inscrição Estadual** nova (hoje a IE `799.890.695.115` só existe fixa no template da proposta).
  Sem isso o cabeçalho do pedido sai com "—" nesses campos.
- **A5 — ✅ RESOLVIDO na Etapa 79 (`b786f506`):** `GET /api/propostas/:id/pdf` **e também**
  `/premium` (o HTML da proposta — a medição da 79 achou a segunda) respondiam sem login; com ids
  sequenciais, qualquer um com o endereço do servidor baixava todas as propostas. Agora exigem
  login. **Ação sua só se** alguém da empresa abria a proposta por um link cru salvo (favorito,
  e-mail): esse link passa a pedir login — o sistema nunca gerou esse link, então não deve haver.

- **A6 (Etapa 100) — Consulta, não ação:** materiais gravados com a subfamília no lugar da família
  (`SELECT m.id, m.codigo, m.nome, m.familia_id FROM materiais_almoxarifado m JOIN familias_material_almoxarifado f ON f.id = m.familia_id WHERE f.parent_id IS NOT NULL`).
  Zero linhas: nada a fazer. Com linhas: abra cada um em **Materiais → editar**, escolha a família
  principal e a subfamília e salve (se a subfamília estiver inativa o campo fica travado — reative a
  sub antes). Nada quebra se ficarem como estão: só não aparecem no filtro pela família principal.
- **A7 (Etapa 103) — Consulta, não ação:** o que a mudança de nível de família pela API pode ter deixado
  antes da 103. (a) Famílias em **três níveis**:
  `SELECT f.id, f.codigo, f.nome FROM familias_material_almoxarifado f JOIN familias_material_almoxarifado p ON p.id = f.parent_id WHERE p.parent_id IS NOT NULL`.
  (b) Materiais cuja subfamília **não é filha** da família gravada:
  `SELECT m.id, m.codigo, m.nome, m.familia_id, m.subfamilia_id FROM materiais_almoxarifado m JOIN familias_material_almoxarifado s ON s.id = m.subfamilia_id WHERE s.parent_id IS NULL OR s.parent_id <> m.familia_id`.
  (c) Famílias com pai que não existe (`parent_id = 0` gravado por `'0'`):
  `SELECT f.id, f.codigo, f.nome, f.parent_id FROM familias_material_almoxarifado f LEFT JOIN familias_material_almoxarifado p ON p.id = f.parent_id WHERE f.parent_id IS NOT NULL AND p.id IS NULL`.
  Zero linhas nas três: nada a fazer (nenhuma tela produz esses casos — só a API). Com linhas: corrigir à mão
  no banco, caso a caso (a tela não muda o nível de família).
- **A8 (Etapa 105) — Consulta, e uma mudança que o deploy faz sozinho:** em que modo está o banco de produção.
  Com o servidor parado (ou numa cópia do arquivo), `sqlite3 database.sqlite "PRAGMA journal_mode;"` — ou, sem
  abrir conexão, o byte 18 do arquivo: `2` = WAL, `1` = rollback. Medido aqui: banco criado pelo código atual
  ficava em **`delete`** (rollback) em todo boot (G12). (a) **`wal`**: nada muda no deploy. (b) **`delete`**: o
  primeiro boot da versão nova **passa o banco para WAL** (B53) — aparecem `database.sqlite-wal` e
  `database.sqlite-shm` ao lado do arquivo; quem copia o banco à mão (backup fora do sistema) passa a copiar os
  **três** com o servidor parado, ou usar o backup do próprio sistema, que já copia os três. Voltar ao modo antigo,
  se preferir: `PRAGMA journal_mode = DELETE;` com o servidor parado — mas o boot seguinte põe WAL de novo (é o
  que o código sempre quis: "WAL mode: Habilitado para melhor concorrência").
- **A9 (Etapa 107) — Consulta, e só age se der linha:** o banco de produção nasceu com categorias (ou tipos de material)
  em dobro? (G16 — acontecia no **primeiro** boot de uma instalação nova, em 6 de 14 medidos.)
  `SELECT 'categoria' AS cadastro, nome, COUNT(*) AS vezes FROM categorias_material_almoxarifado GROUP BY nome HAVING COUNT(*) > 1 UNION ALL SELECT 'tipo', nome, COUNT(*) FROM tipos_material_almoxarifado GROUP BY nome HAVING COUNT(*) > 1`.
  Outro sinal, sem abrir o banco: o log de **todo** boot mostra *"Nao foi possivel criar idx_categorias_almox_nome …
  ha categorias com nome repetido"*. (a) **Zero linhas:** nada a fazer — o deploy desta versão não muda nada. (b) **Com
  linhas:** a versão nova não cria duplicata nova, mas não desfaz a antiga. Veja quais cópias estão em uso:
  `SELECT c.id, c.nome, (SELECT COUNT(*) FROM materiais_almoxarifado m WHERE m.categoria_id = c.id OR m.subcategoria_id = c.id) AS materiais, (SELECT COUNT(*) FROM familias_material_almoxarifado f WHERE f.categoria_id = c.id) AS familias, (SELECT COUNT(*) FROM setor_material_permitido p WHERE p.categoria_id = c.id) AS permissoes FROM categorias_material_almoxarifado c WHERE c.nome IN (SELECT nome FROM categorias_material_almoxarifado GROUP BY nome HAVING COUNT(*) > 1) ORDER BY c.nome, c.id`.
  Se as cópias de **id maior** têm 0 nas três colunas (o normal: o seed em dobro nasce sem uso), apague-as com o
  servidor parado (`DELETE FROM categorias_material_almoxarifado WHERE id IN (…)`) e suba de novo — o aviso some e o
  índice é criado (enquanto ele não existe, **Configurações → Categorias aceita nome repetido** — a recusa *"Já existe uma
  categoria com este nome"* é feita por ele). Se alguma estiver em uso, não apague: me chame (é preciso repassar os vínculos para a cópia que fica).
  Mesmo raciocínio para tipos (`materiais_almoxarifado.tipo_material_id`).

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
- **B26 — Etapa 78: o documento do pedido é um PDF gerado no servidor**, pelo mesmo Chromium que
  gera a proposta. **Descartado:** PDF no navegador (o documento vai ao fornecedor e tem de sair
  igual em qualquer máquina) e `window.print` (sem controle de página).
- **B27 — Etapa 78: o download exige login (Bearer) e o módulo Compras**, como todo PDF do app.
  **Descartado:** token na URL (`?token=`), que o app rejeita de propósito (vaza em histórico/logs).
- **B28 — Etapa 78: os dados da empresa no cabeçalho vêm de Configurações → Geral → Empresa**, que
  ganhou o campo **Inscrição Estadual**. Antes a IE da GMP estava fixa no código do template da
  proposta. **Descartado:** copiar o bloco fixo.
- **B29 — Etapa 78: a nota legal do rodapé (ICMS) não foi inventada** — é um campo novo em
  Configurações ("Nota legal do pedido de compra"); vazio, o bloco não é impresso. O texto exato
  que o ERP imprime hoje é a **D-78**.
- **B30 — Etapa 78: o servidor passou a expor o cabeçalho `Content-Disposition` para o navegador**
  (`cors exposedHeaders`), senão em desenvolvimento por IP o nome do arquivo não chegava. O client
  tem fallback `pedido-compra-⟨número⟩.pdf` de qualquer jeito.
- **B31 — Etapa 78: o valor unitário sai com as casas necessárias (mínimo 2, até 6), não com 3
  fixas como o ERP** — a Etapa 32 mediu que com 3 casas fixas `quantidade × unitário` **não fecha**
  com o total da linha em 6 das 24 linhas do pedido real; no papel da GMP a conta fecha.
  ⚠️ **O plano dizia "até 4" e estava errado:** o total da linha usa o preço gravado inteiro, e o
  campo aceita qualquer número de casas — com 1,23456 × 1000 o papel mostrava 1,2346 e 1.234,56 (a
  revisão pegou; corrigido em `6e5267b6`). A quantidade também vai até 6 casas (0,0004 saía "0").
- **B32 — ✅ RESOLVIDO na Etapa 80:** o Chromium compartilhado era reciclado a cada 20 PDFs sem
  fila — um PDF gerado nesse instante falhava com "Target closed". A medição da 80 achou mais
  três corridas (erro de um derrubando o outro, Chromium aberto em dobro e nunca fechado, e o
  fechamento por ociosidade no meio de uma geração).
- **B45 — Etapa 100 (G1): desativar o grupo NÃO desliga os fornecedores dele.** O `grupo_id` fica;
  reativar o grupo no banco devolve o grupo inteiro. **Descartado:** `grupo_id = NULL` em todos os
  fornecedores no "Remover grupo" (irreversível — ninguém lembraria quem era de qual grupo).
  Consequência conhecida: `FornecedoresDoGrupo` aberto por um endereço antigo ainda vincula
  fornecedor ao grupo desativado (**fechado na Etapa 103**, B52), e o cadastro de **Variáveis técnicas** que aponta para um grupo
  desativado continua oferecendo os fornecedores dele (a lista mostra "Grupo #N").
- **B46 — Etapa 100 (G1): a ficha do fornecedor mostra "Grupo desativado (#N)".** **Descartado:**
  devolver grupos inativos em `GET /compras/grupos` (mudaria as três telas que o consomem). A opção só
  aparece depois de a lista de grupos carregar — se a lista falhar, nada é marcado como desativado.
- **B47 — Etapa 100 (G10): só o valor NOVO é recusado.** Material antigo com a subfamília no lugar da
  família continua editável (o servidor só revalida a família quando ela muda), a tela de edição libera
  o campo para corrigir, e os atalhos de Sobras/Remessas montam o par certo sozinhos. **Descartado:** o
  servidor "consertar" sozinho (`familia_id` = principal, `subfamilia_id` = sub) — conflita quando o
  pedido traz outra subfamília e esconde de quem chama que o dado chegou torto. A mensagem da recusa é
  **"A família escolhida é uma subfamília — escolha a família principal e use a subfamília no campo Subfamília"**.
- **B48 — Etapa 100 (G13): IPI ou encargo ilegível na planilha vira AVISO, não recusa.** A linha entra
  com IPI 0 (ou sem aquele encargo), como já era com a data. **Descartado:** recusar a linha (perderia o
  item comprado por uma célula fiscal). Encargos valem **por pedido gerado** (ordem + fornecedor): se a
  planilha repete o frete em linhas de dois fornecedores da mesma ordem, os dois pedidos ficam com o
  frete. A coluna "IPI" **sozinha** não é lida (na planilha de fornecedor costuma ser o IPI em R$); só
  "IPI %" e variações com "%"/"percentual". Vale o valor da **primeira** linha do pedido; linha seguinte
  com valor diferente ganha o aviso **"Frete diferente do da primeira linha do pedido (vale o da
  primeira)"** (idem ICMS-ST e Desconto). `%` só é aceito no IPI e `R$` só nos encargos ("10%" no
  Desconto vira aviso, não R$ 10); "1.500" é mil e quinhentos, como na coluna de preço. **Não coberto:**
  desconto maior que os produtos dá total negativo (o pedido manual já aceitava).
- **B49 — Etapa 103 (G10b): família que tem material NÃO muda de nível.** Virar subfamília, trocar de família
  principal ou virar raiz é recusado enquanto houver material ligado a ela (pela família ou pela subfamília),
  **contando os inativos**. **Descartado:** mover os materiais junto (mudaria a família de muitos itens sem
  ninguém ver, e não há volta pela tela); contar só os ativos, como o "Inativar" faz (o material inativo
  reativado depois voltaria a ser o caso errado do G10). Nenhuma tela muda o nível de uma família — a recusa
  só aparece para quem usa a API. Numeração: o doc de Compras tem **série própria** de B (B1–B48 até a 100;
  os números B45–B48 também existem no doc do almoxarifado, com outro conteúdo) — esta etapa continua a série
  daqui; a Etapa 102 (em paralelo) numera no doc do almoxarifado, na faixa B53x, sem colisão.
- **B50 — Etapa 103 (G10b): família com subfamília INATIVA não vira subfamília.** A ativa já era recusada; a
  inativa passava e, reativada depois, deixava três níveis no banco. **Descartado:** aceitar e conferir o
  nível só na hora de reativar a subfamília (deixaria o banco num estado proibido esperando alguém reativar).
- **B51 — Etapa 103: reativar o grupo é um botão próprio, não um campo "ativo" na edição do grupo.** Rota
  própria e a lista com os desativados só quando a tela pede. **Descartado:** "ativo" no salvar do grupo (o
  salvar exige o nome e é o do modal de edição — editar e reativar ficariam misturados); devolver os
  desativados sempre (B46 já tinha descartado: mudaria a ficha do fornecedor e as Variáveis técnicas).
- **B52 — Etapa 103: só o grupo que MUDA é conferido.** Vincular fornecedor a grupo desativado (ou que não
  existe) é recusado; salvar um fornecedor que **já está** num grupo desativado, repetindo o grupo, continua
  funcionando — a ficha dele (B46) e a edição dentro da tela do grupo. **Descartado:** recusar sempre
  (travaria salvar a ficha de quem ficou num grupo desativado). **Muda uma regra da Etapa 34**, que dizia
  "o número do grupo grava sem conferir se o grupo existe". **Não coberto:** a conferência e a gravação não
  são uma operação só — um grupo desativado no mesmo instante em que alguém vincula ainda recebe o vínculo.
- **B53 — Etapa 105 (G12): banco existente em modo `delete` passa a WAL no próximo boot.** O pedido era "WAL no
  primeiro boot sem mudar nada em banco existente"; a medição mostrou que o banco existente criado pelo código
  atual **também** está sem WAL (todo boot perdia a mesma corrida), então as duas metades se contradizem. Escolhido:
  WAL em todo boot, novo ou existente — é o que o código anunciava desde sempre, e banco que já está em WAL não muda
  nada (provado). **Descartado:** WAL só em banco novo (deixaria produção no modo de rollback, com leitura e
  escrita se bloqueando e o checkpoint de recuperação sem efeito, para preservar um estado que ninguém escolheu).
  Reversível: `PRAGMA journal_mode = DELETE` e reverter o commit. Ver **A8**.
- **B54 — Etapa 105 (G10c): o PUT recusa com a mensagem do "Inativar" da tela, palavra por palavra** —
  *"Não é possível remover: família possui N item(ns) ativo(s)"*, inclusive o "remover" (a ação é inativar).
  Escolhido: quem reproduz pela API vê o mesmo texto que a tela mostra. A recusa já existente de **subfamília
  ativa** no PUT (*"Não é possível inativar: família possui subfamília(s) ativa(s)"*) ficou com o texto dela —
  **não** unificada com a do DELETE (*"…possui N subfamília(s) ativa(s)"*). **Descartado:** reescrever as duas para
  "inativar" (mudaria a mensagem da tela, que está no manual) e unificar a de subfamília (troca de contrato sem
  ganho: nenhuma tela mostra a mensagem do PUT). As duas regras só valem na **transição** ativa → inativa: uma
  família que já estava inativa continua editável mesmo com item ativo dentro (legado).
- **B55 — Etapa 105: o campo "ativo" da família só aceita 0/1.** `1`, `'1'`, `true`, `'true'` gravam 1;
  `0`, `'0'`, `false`, `'false'`, `null` gravam 0; qualquer outra coisa (`2`, `'sim'`, `''`) é recusada com
  *"Ativo inválido: use 0 ou 1"*. Antes o valor era gravado cru — `'false'` virava texto e a família sumia **das
  duas** listas (ativas e inativas). **Descartado:** aceitar qualquer coisa e só interpretar (o banco continuaria
  recebendo texto). Nenhuma tela manda esse campo para família.
- **B56 — Etapa 107 (G16): o schema do almoxarifado roda uma vez por conexão de cada vez, em vez de tirar uma das duas
  chamadas do boot.** Quem pede o schema com uma montagem em andamento espera **a mesma**; terminada (bem ou mal), o
  próximo pedido monta de novo — uma falha não fica guardada, e a nova tentativa automática de 400 ms depois continua
  valendo. **Descartado:** tirar uma das duas chamadas (a primeira é a que corre antes das rotas; a segunda é a que tem a
  nova tentativa — tirar qualquer uma muda a ordem ou perde a tentativa, e o próximo módulo que pedir o schema reabre a
  corrida); `INSERT OR IGNORE` em cada semente (só cobre tabela com nome único — categorias e tipos não têm, e
  continuariam em dobro). Reversível: reverter o commit `1fff24f4`.
- **B57 — Etapa 107 (G8): das seis barras de abas que o G8 listava, migrei as quatro que existem e apaguei o código
  morto das outras.** Compras/Financeiro tinham uma lista de abas que nada desenhava (a navegação é pelo menu) e um CSS de
  barra sem elemento; Operacional, só o CSS. **Descartado:** criar barras de abas nessas telas (seria tela nova, não
  unificação). Os **botões de alternância** de outras telas (Ferramentas, Inspeções, Lotes, Reposição, Sobras, Relatórios
  da Produção, Veículos, Dashboard, Atividades, Colaboradores, Aprovações) e o menu vertical de seções do formulário de OS
  do Operacional **ficaram como estão** — não são barras de abas; virar aba mudaria o desenho delas.
- **B58 — Etapa 107 (G8): o visual unificado muda quatro coisas pequenas, de propósito.** (1) Os rótulos das abas da OS
  comercial saem da caixa alta (eram `PROPOSTAS APROVADAS`); (2) no celular as barras rolam de lado em vez de quebrar em
  duas linhas (a da Administração quebrava); (3) a aba ativa das Configurações do Almoxarifado sai do azul-claro fixo para
  o azul do sistema; (4) as setas do teclado (← → Home End) trocam de aba — na OS isso recarrega a lista, como o clique —
  e a tecla Tab passa a entrar só na aba ativa (as outras se alcançam pelas setas; antes o Tab passava por todas — é o
  padrão de acessibilidade de abas, o mesmo de Configurações desde a Etapa 36; achado da revisão final).
  A correção de contraste da aba ativa no celular, que só valia para a OS, passou a valer para todas (inclusive
  Configurações) e deixou de pintar o contador da aba ativa de azul sobre azul. **Descartado:** manter variações por tela
  (seria o CSS próprio de volta). Reversível tela a tela: um commit por barra.
- **B59 — Etapa 109 (B52): o vínculo novo é gravado só se o grupo está ativo no próprio comando que grava.** A
  conferência continua antes (é ela que dá a mensagem no caso comum) e a gravação passou a ser condicional — conferir e
  gravar viram uma coisa só. Numa corrida de verdade (o "Remover grupo" clicado no mesmo instante), quem perde agora recebe
  *"Grupo desativado — reative o grupo em Fornecedores homologados antes de vincular fornecedores"* e **nada** é gravado
  (no PUT, nem os outros campos da ficha). **O que a medição mostrou de diferente do B52:** a corrida não deixava estado
  proibido — o banco ficava igual a "vinculou um instante antes e depois desativou", e desativar nunca desvinculou (B45). O
  que estava errado era a ordem: o vínculo chegava ao banco depois de o "Remover grupo" já ter respondido. **Descartado:**
  trava em memória (premissa de um processo e mais código, sem ganho sobre um comando só) e gravar e desfazer (o vínculo
  apareceria por um instante). Reversível: reverter `083384ea`.
- **B60 — Etapa 109 (G7): unifiquei as listas de módulos sem mudar quem vê o quê — as três divergências que mexem em
  permissão ficaram como estavam, presas num teste.** (1) **TODOLIST:** o cadastro de usuário oferece "Administrador do
  módulo" e o servidor descarta ao salvar (recarregando, o botão volta desligado) — nenhuma regra usa "admin do TODOLIST",
  mas alinhar seria passar a gravar uma permissão que hoje não se grava. (2) **Admin:** o servidor aceita admin de módulo
  do Admin; a tela não oferece o botão (só pela API). (3) **Relatórios:** dá para marcar no cadastro e a linha é gravada,
  mas nenhuma tela, rota ou checagem usa — tirar mudaria o que o salvar do usuário grava. Decida se (1) deve sumir da
  tela ou passar a valer, se (2) deve aparecer, e se (3) deve sair; o teste
  `modulosClienteServidor.api.test.js` cai de propósito quando alguém alinhar um dos lados, para este item ser atualizado.
  **Mudança visível, uma só:** o cartão de engenharia do cadastro de usuário (e o painel de permissões dos grupos, na
  mesma tela) dizia "Engenharia" e passou a dizer **"Cálculos de Engenharia"**, o nome do módulo em todo o resto
  (seleção de módulos, badges, rota). **Descartado:** criar `GET /api/modulos` (D-36d) — contrato novo sem consumidor que
  precise dele: o cliente precisa de ícone e cor, que o servidor não tem; um teste que lê a lista do cliente basta.
- **B61 — Etapa 109: a corrida da família (inativar x cadastrar material) foi medida e NÃO corrigida.** 30 de 30 rodadas,
  nas duas ordens, terminam com **família inativa e material ativo dentro dela** — esta sim um estado que as duas regras
  proíbem ("Inativar" recusa família com material ativo; o cadastro recusa família inativa). Fechar exige mexer no cadastro
  e na edição de material, que é a área da Etapa 108 do almoxarifado em paralelo; deixei para a próxima etapa (é a
  primeira candidata do plano da 109).
  **Fechada na Etapa 110 do almoxarifado (`96f28b29`)** — gravação condicional dos dois lados; ver a C218 em
  `docs/almoxarifado-novidades-por-etapa.md`.
- **B44 — Etapa 89: só o nome do arquivo do PDF da OS é limpo; o número da OS fica como foi digitado.**
  Com `/`, `"` ou `:` no número, o Windows recusava o nome do arquivo e o usuário via "Erro ao gerar
  PDF" (o PDF até era gerado). Agora o arquivo vira `OS_OS_1_2_A_<hora>.pdf` e o documento continua
  mostrando `OS 1/2 "A"`. Acento perde só a marca ("Manutenção" → `Manutencao`). Descartado: proibir esses
  caracteres no cadastro da OS (mudaria dado e tela; OS antigas já podem tê-los).
- **B43 — Etapa 88: o rodapé "Página X de Y" do PDF da OS vem do navegador que gera o PDF.** Antes era
  um texto no fim do documento com o total **estimado** pela quantidade de itens ("Página 1 de 1" num
  PDF de 3 páginas, só na última). Agora sai em toda página com os números reais, 10px cinza
  centralizado. Para caber o rodapé, cada página perdeu 10 mm embaixo — efeito colateral bom: um item
  que não cabe mais inteiro no fim da página começa na seguinte, em vez de ser cortado no meio.
  Medido: OS de 3 e de 12 itens mantiveram o total de páginas (3 e 6). Descartado: corrigir a
  estimativa (continuaria estimativa); paginar em JS como a proposta (muito maior). PDFs já gerados
  antes continuam com o texto antigo até serem gerados de novo.
- **B42 — Etapa 87: o PDF da OS entrou na fila do Chromium compartilhado com as mesmas configurações
  de página.** Saíram a interceptação de requisições (só registrava no log), a espera de "rede parada"
  e a espera fixa de 2 s — o HTML da OS já leva logo e fotos embutidos. Resultado medido: arquivo
  idêntico byte a byte (tirando a data) e de 4,7 s para 0,45 s. Também: fechar o Chromium tem prazo
  de 10 s (antes podia travar a fila para sempre) e o logo da OS passa a ir embutido também em
  produção (lá o arquivo só existe no `client/build`). Descartado: reaproveitar o gerador do pedido de
  compra (mudaria o PDF do pedido). Aceito: em desenvolvimento, a mensagem de erro detalhada do PDF da
  OS perdeu os prefixos por etapa.
- **B41 — Etapa 86: os módulos montados por último passam por um "bloco" (Router) que fica antes do
  tratamento de erro.** Parte do almoxarifado e o chat registram as rotas depois que o servidor já
  está no ar — por isso mover o tratamento para o fim não bastaria. Escolhido: um Router dos módulos
  montado antes dos três tratadores. Mensagens: só aparece ao usuário texto escrito pelo **nosso**
  código (ex.: "Certificado deve ser PDF ou imagem"); erro de biblioteca vira mensagem em português
  ("JSON inválido no corpo da requisição", "Requisição grande demais", "Upload inválido", "Arquivo não
  encontrado"); 401/403 vindos de biblioteca viram 500 (o client trataria 401 como sessão expirada).
  Descartado: mover os tratadores para o fim; repetir os tratadores no fim. **Escolha pequena para
  você arbitrar:** na edição de material, depois que a foto sobe com sucesso o campo de arquivo é
  limpo (para o "Salvar" não enviar de novo) — uma linha para desfazer.
- **B40 — Etapa 85: arquivo acima do limite → 413 com o limite na mensagem.** 413 (e não 400) para as
  telas de família/grupo **não** reenviarem o mesmo arquivo grande por base64. O limite vem do próprio
  upload (cada um tem o seu: 5, 10, 15, 20 ou 40 MB) — sem limite conhecido, a mensagem sai sem
  número. Efeito: as telas de **produto** e **proposta** já tinham um aviso próprio de "arquivo grande"
  que nunca aparecia (o servidor dava 500) — agora aparece, com os mesmos números do servidor.
  **Fora:** os módulos montados por último (almoxarifado, chat…) — próxima etapa.
- **B39 — Etapa 84: o login e o socket do chat só aceitam o token no cabeçalho.** O `?token=` no
  endereço vazava o token em log de proxy, histórico do navegador e `Referer`; ninguém no sistema o
  usava (medido: telas, scripts, integrações). Pedido só com `?token=` recebe "Envie o token no
  cabeçalho Authorization" e um aviso no log (sem o token). Descartado: aceitar por um tempo com
  aviso (como o backup, Etapa 21 — lá havia rotina automática provável; aqui não). O **backup**
  continua aceitando `?token=` com o seu token próprio.
- **B38 — Etapa 83: os 14 uploads de imagem decidem a extensão pelo tipo real; formato errado vira
  400 com mensagem clara.** SVG continua aceito **só no logo da empresa** (pode já haver logo vetorial
  em produção; tem CSP própria). Descartado: recusar SVG também no logo da empresa. Efeito colateral
  aceito: ao recusar foto de família/grupo, a tela tenta de novo pelo outro caminho (base64), que
  recusa com a mesma mensagem — duas tentativas, mesma mensagem. Passam a ser recusados formatos de
  navegador muito antigo (`pjpeg`, `x-png`), `apng` e os do Citrix; passa a ser aceito o `.jfif` do
  Windows (gravado `.jpg`). A mensagem clara vale também para os 4 uploads convertidos na 82.
- **B37 — Etapa 82: imagens do chat, fotos da proposta e avatares com endereço assinado, validade
  pela vida da tela.** Chat **8 h**, fotos da proposta **12 h**, avatar **24 h** (o mesmo do login);
  cada pasta com chave própria (assinatura de uma não abre outra). O banco não muda — a assinatura é
  feita na hora de devolver o endereço. Descartado: 15 min para todas (o chat carrega a imagem só
  quando rola até ela; com 15 min, conversa aberta há uma hora mostraria imagem quebrada); trocar
  todo `<img>` por download com login (muito mais telas mexidas). **Limites aceitos:** editor de
  proposta aberto há mais de 12 h perde as fotos na próxima repaginação (recarregar resolve); no
  chat, a imagem vencida é renovada sozinha, uma vez por falha. Formatos: só jpeg/png/gif/webp por
  base64 e nos 4 uploads convertidos; `image/pjpeg` (IE antigo) passou a ser recusado; HEIC já era.
- **B36 — Etapa 81: PDF da OS e contrato só saem por rota com login; cotações e comprovantes perderam
  o endereço público (ninguém usava).** Escolhido: só login (`authenticateToken`), o mesmo das rotas
  vizinhas — **descartado** exigir o módulo Operacional no PDF da OS (a ficha da OS já abre só com
  login, `GET /ordens-servico/:id`; mudar seria outra etapa). Contrato: só baixa o que está em uso
  em algum modelo; **limite conhecido:** modelos copiados por "salvar como" guardam o contrato
  antigo, que continua baixável por quem tem login. Fotos de produto/família/grupo, logos e
  similares **continuam públicas** (são mostradas por `<img>` em muitas telas) mas passam a ir com
  `nosniff` + CSP `sandbox` — um `.html` disfarçado não roda mais como página do CRM; para o
  logo, a CSP libera estilos (SVG com `<style>`) e segue bloqueando script (cabeçalho medido; a
  renderização do SVG não foi vista num navegador). Link antigo salvo de PDF de OS
  (`/uploads/ordens-servico/...`) passa a abrir a tela inicial do sistema em vez do PDF.
- **B35 — Etapa 80: uma fila serial (um PDF por vez no Chromium compartilhado).** Escolhido por ser
  a menor mudança que elimina as quatro corridas de uma vez. Custo medido: com 16 downloads
  simultâneos o mais lento levou ~9 s (antes ~3 s — mas antes eram 29–33 Chromium abertos e 7 PDFs
  com erro). Também: uma geração travada segura a fila no máximo ~60 s por passo
  (`protocolTimeout`, antes 180 s). Descartado: contar abas em uso e adiar a reciclagem (mais
  estado para errar, não resolve o Chromium em dobro); pool de navegadores (memória). **Fora do
  escopo:** a rota de PDF da **OS** abre um Chromium próprio por pedido (não causa as corridas,
  mas pode somar um segundo Chromium); a fila não tem limite de tamanho nem desiste quando quem
  pediu já fechou a aba — aceitável com poucos usuários simultâneos.
- **B34 — Etapa 79: o PDF e o preview da proposta exigem só login, o mesmo que a tela da
  proposta** (`GET /api/propostas/:id`). Quem já via a proposta continua vendo. Descartado:
  exigir também o módulo Comercial (`checkModulePermission`) — mudaria quem tem acesso hoje e não
  era o furo. Descartado: manter a rota aberta "para link direto" — nenhum lugar do sistema gera
  esse link; os 7 botões já mandam o login. Fora do escopo, registrado: o `authenticateToken`
  aceita `?token=` na URL (token em log de proxy); fica para uma etapa de segurança.
- **B33 — Etapa 78: o botão "Documento (PDF)" do formulário imprime o pedido SALVO, não o que está
  na tela.** Se você mudou um preço e não salvou, o PDF sai com o valor antigo. Escolhido porque o
  documento enviado ao fornecedor tem de ser o que está gravado (o mesmo que a lista e o
  recebimento enxergam). Descartado: gerar o PDF a partir da tela sem salvar (o fornecedor
  receberia um pedido que não existe no sistema). Reversível: dá para desabilitar o botão enquanto
  houver alteração não salva, se confundir alguém.

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
- **D-90** — Para você/P.O.: o PDF e as telas da OS mostram o cliente **abreviado** — 3 primeiras
  letras da razão social + o código ("Cliente: CLI (ID: 1)"). É assim desde o primeiro commit e é igual
  em `OSDetalhesForm`, `PreviewOSEditavel` e no PDF, então parece **proposital** (não expor o nome do
  cliente no chão de fábrica). Se for, nada a fazer; se a OS deve mostrar o nome inteiro, é uma troca
  pequena nos três lugares.
- **D-78** — Para o P.O.: qual é o **texto legal** que o pedido de compra do ERP imprime no rodapé
  (a nota sobre crédito de ICMS)? Cole em Configurações → Geral → Empresa → "Nota legal do pedido
  de compra". E o documento precisa do **código do fornecedor** ("3797 - TECNOPAR")? O cadastro não
  tem esse código; se precisar, é coluna nova.
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
- **G1 — corrigido na Etapa 100 (`f8033192`).** O `DELETE` genérico de `/api/compras/:tipo/:id`
  sombreava `grupos` (400 'Tipo inválido'): o botão "Remover grupo" nunca removia. A rota de grupos subiu
  para cima do genérico. **Este item dizia também "em `main` ele mora no `index.js`, fora do harness —
  não há teste que o caracterize"; estava errado desde a extração da Etapa 38:** o genérico mora em
  `server/routes/compras.js` e `comprasPedidosRotas.api.test.js` (4) congelava o 400 — hoje prova o 200.
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
  **G12 — esta descrição estava errada; corrigido na Etapa 105 (`1ace8b88`, `d46126c9`).** Medido com o `journal_mode` lido
  depois do boot: o WAL **não** entrava no boot seguinte — 1º boot em `delete` em 6 de 7, e do 2º ao 6º boot sobre
  o mesmo banco continuou `delete` em 6 de 6. Não era inofensivo: o banco só virava WAL se algum boot ganhasse a
  corrida por sorte (o de desenvolvimento do André está em WAL; um de produção criado com o código atual pode não
  estar — **A8**). A causa não era transação nenhuma: o `PRAGMA` disputava a conexão com os `CREATE`/`SELECT` que
  os módulos enfileiram antes de o banco abrir. Agora ele sai antes de tudo — 6 de 6 boots novos em WAL (B53).
- **G7 — corrigido na Etapa 109 (`0c4da131`). Este item estava errado:** não eram quatro listas — eram
  **cinco** com chave e nome (faltava `UsuarioForm.todosModulos`, justamente a que grava a permissão) e mais **dez**
  parciais com outro propósito (G17). Agora: no servidor `services/modulosSistema.js` alimenta `MODULE_ADMIN_KEYS` e
  `DEFAULT_MODULOS_TIPO` (mesmos valores, mesma ordem); no cliente `constants/modulosMeta.js` alimenta a seleção de
  módulos e o cadastro de usuário; `modulosClienteServidor.api.test.js` lê a do cliente e falha se divergirem. As três
  divergências de permissão ficaram como estavam (B60).
  **(Original):** A lista de módulos do sistema existe em **quatro** lugares (`modulosMeta.js`,
  `TipoSelecao.todosModulos`, `MODULE_ADMIN_KEYS` no servidor, `DEFAULT_MODULOS_TIPO`). A Etapa 36
  usou a do cliente (`modulosMeta.js`) e **não** criou uma quinta; unificar é etapa própria.
- **G17 (Etapa 109, medido, não feito)** — as listas parciais de módulo que ficaram fora do G7, cada uma com outro
  propósito: rótulos de carregamento (`ModuleLoading`), splash (`SplashScreen`), prefetch (`lazyModules`), nomes do
  "acesso negado" do cliente (`ProtectedModuleRoute`) e do log do servidor (`index.js`, só 7 dos 11 — os outros vão para
  o log com a chave crua), requisição de material por módulo e o link do e-mail de recebimento (10, sem TODOLIST — já
  presos um no outro por teste), setores semeados (9), rotas do `App.js`, menus do `Layout` (que chama o comercial de
  `crm`). Nomes diferentes do mesmo módulo entre elas (engenharia "Engenharia"/"Cálculos de Engenharia", admin
  "Admin"/"Administração"). E uma divergência de **permissão**, não de lista: sem nenhuma linha de permissão, a seleção
  libera só Comercial, o portão de rota do cliente libera Comercial **ou Frota**, e o servidor libera Comercial só se o
  usuário não estiver em grupo nenhum (da mesma família do G9).
- **G8 — corrigido na Etapa 107 (`c48efd13`, `1e49c8aa`, `617b122b`, `7af44575`, `6abdee95`, `c52024d9`).** As abas da
  Etapa 36 usam um componente `Tabs` reutilizável novo; as outras seis barras de
  abas do sistema (Admin, Compras/Financeiro, Minha Conta, OS comercial, Operacional, e a barra
  interna do almoxarifado) continuam cada uma com o próprio CSS. Migrar é etapa própria.
  **Esta lista estava errada em três das seis:** Compras/Financeiro e Operacional **não têm** barra de abas — só um
  array `tabs` que nada renderiza e CSS sem elemento (apagados, B57). As quatro reais (Administração, Minha Conta, OS
  comercial, Almoxarifado → Configurações) usam o `ui/Tabs`; o comportamento de cada uma foi preso em teste **antes** da
  migração (B58 lista o que mudou no visual).
- **G10** Material gravado **pela API** com a subfamília no lugar da família (`familia_id = <sub>`;
  nenhuma tela faz isso): a subfamília conta e lista, a raiz não, e o filtro de Materiais não o
  acha. Correção apontada: `validateFamiliaAtiva` recusar subfamília como família em material
  **novo** ("use a subfamília"). Não feito — sem consumidor real.
  **Corrigido na Etapa 100 (`4b091ff6`)** — recusa em material novo, legado editável e corrigível pela
  tela, atalhos de Sobras/Remessas acertam o par (B47, A6). (Este item citava o hash `f80331920`, que **não
  existe** — o commit do G10 é `4b091ff6`; corrigido na Etapa 103.)
  **G10b — corrigido na Etapa 103 (`2e3a09eb`):** `PUT /api/almoxarifado/familias/:id` que dava `parent_id` a
  uma família com materiais recriava o caso antigo. A medição achou mais três portas para estados errados
  (sub com material trocando de família principal ou virando raiz; raiz com subfamília **inativa** virando sub,
  que depois dava três níveis; `parent_id: 'abc'` virando raiz calado) — todas recusadas (B49, B50, A7).
- **G10c — corrigido na Etapa 105 (`80b15bc9`).** O texto abaixo é o de quando foi achado; a medição da 105
  confirmou e achou mais três portas: `ativo: 'false'` gravado como texto (a família sumia das duas listas e passava
  até com subfamília ativa), a recusa de subfamília ativa valendo também para família já inativa (renomear o
  legado dava 400), e o inverso — reativar subfamília sob família principal inativa (B54, B55).
  **(Original, Etapa 103):** `PUT /api/almoxarifado/familias/:id` com `ativo: 0` inativa
  família **com materiais ativos** — o `DELETE` ("Inativar" da tela) recusa com *"Não é possível remover:
  família possui N item(ns) ativo(s)"*, o `PUT` não confere (medido: 200, `ativo = 0`). Nenhuma tela manda
  `ativo` nesse `PUT` (a aba Famílias manda só nome, descrição e tipo de uso) — só a API. Correção apontada: a
  mesma contagem do `DELETE` quando `ativo` passa de 1 para 0.
- **G16 — corrigido na Etapa 107 (`1fff24f4`, `e6b69780`). O texto abaixo estava errado em dois pontos:** o banco **não** nascia
  sempre completo — em 6 de 14 primeiros boots as **27 categorias entravam em dobro** (categorias não têm nome único, as
  duas montagens simultâneas semeavam) e o índice de nome único da Etapa 26 **nunca** era criado (aviso em todo boot
  seguinte); e não era só o seed de setores — todo seed do schema é "conta e, se for zero, insere" (tipos de material
  também não têm nome único). Agora o schema monta uma vez por conexão de cada vez (B56): 8 de 8 boots novos limpos,
  27/27, índice criado. Banco que já nasceu em dobro: **A9**.
  **(Original, Etapa 105):** No primeiro boot em banco novo o log mostra, em parte dos boots,
  `Erro schema almoxarifado v3 (tentativa 1/3): SQLITE_CONSTRAINT: UNIQUE constraint failed: setores_almoxarifado.nome`
  (medido: 3 de 7 boots antes da 105, 5 de 6 depois — a ordem dos comandos mudou, a corrida é a mesma). A segunda
  tentativa passa (nenhum `tentativa 2/3` em 13 boots) e o banco nasce com os 8 setores do seed. Banco existente
  não é afetado. Causa (lida, não corrigida): o schema do almoxarifado (`initSchema`) roda **duas vezes ao mesmo
  tempo** no boot — uma chamada direta em `routes/almoxarifado.js` e outra, com retry, em
  `routes/almoxarifado/extended.js` — e as duas veem a tabela de setores vazia e semeiam. Correção apontada: uma
  chamada só, ou o seed com `INSERT OR IGNORE`. É do almoxarifado; registrado aqui porque a 105 o mediu.
- **G13** (Etapa 39) O export de pedidos para Excel passa a trazer "Valor Total" **com** IPI e
  frete, repetido em cada linha de item, e a reimportação ignora essa coluna — um pedido
  exportado e reimportado nasce com valor menor. Coluna "IPI %" no export fica para depois.
  **Corrigido na Etapa 100 (`cef3d856`; este item citava `f80331923`, hash que **não existe** — corrigido na
  Etapa 103):** o export leva `IPI %`, `Frete`, `ICMS-ST` e `Desconto` no fim e a
  importação os lê (B48) — o pedido reimportado tem o mesmo `valor_total` (vale para pedido da Etapa 39
  em diante; o legado do G15 reimporta recalculado).
- **G14** (Etapa 39) O documento impresso do pedido (PDF/HTML no formato do ERP) **ainda não
  existe** — a Etapa 32 deixou "a fazer" e a 39 porta só o conteúdo. É a **Etapa 78** (numeração unificada; o plano da 39 a chamava de "40").
- **G15** (Etapa 39, achado da revisão) Pedido criado **antes** da 39 com preço unitário de 3+
  casas (ex.: `0,105`) mostra dois totais até ser salvo de novo: a lista mostra o valor gravado cru
  (`0,315`) e a tela do pedido mostra o recalculado por linha (`0,33`); o primeiro salvar grava o
  recalculado. Só pedidos antigos com preço de 4 casas; nenhum pedido novo passa por isso. Se
  incomodar, a correção é devolver os totais gravados quando existem (uma condição em
  `relerPedido`).
  **Avaliada na Etapa 100 e NÃO feita:** o pedido anterior à 39 não tem `total_*` gravados, só o
  `valor_total` cru. Devolvê-lo faria o formulário, o **PDF enviado ao fornecedor** e o recebimento
  mostrarem linhas que somam `0,33` com total `0,315` — troca a divergência entre telas por uma
  divergência **dentro do documento**. Fica como está: o primeiro salvar grava o recalculado.
- **G11** `?familia_id=<id de subfamília>` digitado na URL de Materiais antes de a lista de famílias
  carregar manda só `familia_id` e devolve zero linhas até mexer no filtro. Nenhum link do sistema
  gera essa URL. Correção: incluir `familias` nas dependências da busca (um GET a mais).
  **Já estava corrigido desde a Etapa 38 (`0c890f24`, RN-38.05) — este item estava desatualizado.** A
  Etapa 100 rodou o controle positivo do teste que o prende (`MateriaisAlmoxarifado.test.js`, sabotar a
  dependência derruba o cenário RN-38.05).
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

## Etapa 109 — Vincular fornecedor não perde mais a corrida para o "Remover grupo"; a lista de módulos numa fonte só (2026-10-15)

**Em uma frase.** Se uma pessoa vinculava um fornecedor a um grupo no mesmo instante em que outra clicava "Remover grupo",
o vínculo podia ser gravado depois de o grupo já estar desativado — agora conferir o grupo e gravar o vínculo são uma coisa
só, e quem chega depois recebe a mesma mensagem de grupo desativado; e a lista de módulos do sistema, que estava escrita à
mão em cinco lugares, passa a ter uma fonte no navegador e uma no servidor, com um teste que avisa se as duas divergirem.

### O que há de novo (visível para o usuário)
- **Fornecedores homologados:** vincular (ou cadastrar já num grupo) no instante em que o grupo é removido dá
  *"Grupo desativado — reative o grupo em Fornecedores homologados antes de vincular fornecedores"* e não grava nada.
  Fora dessa coincidência, nada muda: vincular a grupo ativo funciona, o fornecedor que já estava no grupo continua nele
  quando o grupo é removido, e salvar a ficha repetindo o grupo desativado continua funcionando.
- **Cadastro de usuário → Módulos de Acesso:** o cartão de engenharia passa a dizer **"Cálculos de Engenharia"** (era
  "Engenharia"), o mesmo nome da seleção de módulos e das badges. O resto da tela não muda (os mesmos 12 cartões, na mesma
  ordem, com as mesmas descrições).
- **Seleção de módulos:** nada muda na tela (os mesmos 11 cartões, mesma ordem, cores, ícones e destinos).

### Por baixo do capô
- **B52:** `POST` e `PUT /api/compras/fornecedores` gravam o grupo **novo** com `INSERT … SELECT … WHERE EXISTS (grupo
  ativo)` e `UPDATE … WHERE id = ? AND EXISTS (grupo ativo)`. Quando não grava, a rota relê e responde a literal da 103
  (grupo apagado → *"Grupo não encontrado"*; fornecedor apagado → *"Fornecedor não encontrado"*). Medido antes: com as
  duas requisições disparadas juntas, **30 de 30** vínculos do POST gravados depois da desativação; depois: **0 de 20** em
  cada ordem (teste). O PUT quase nunca perdia pela HTTP (a leitura extra dele deixava a desativação passar na frente), mas
  a janela existia — o teste a prova injetando a desativação entre a conferência e a gravação (B59).
- **A medição corrigiu o B52:** o estado que a corrida deixava era permitido (o mesmo de vincular um instante antes); o
  defeito era a ordem. A corrida **grave** é a da família, medida aqui e não corrigida (B61).
- **G7:** `server/services/modulosSistema.js` (uma linha por módulo: tipo padrão e se aceita admin de módulo) alimenta
  `MODULE_ADMIN_KEYS` e `DEFAULT_MODULOS_TIPO` com os mesmos valores e a mesma ordem de antes; `constants/modulosMeta.js`
  ganhou rota e as duas descrições de cada módulo e alimenta a seleção de módulos e o cadastro de usuário. O teste
  `modulosClienteServidor.api.test.js` lê o arquivo do cliente como texto e confere os conjuntos; as três divergências de
  permissão (TODOLIST, Admin, Relatórios) estão congeladas nele (B60).
- **O G7 estava errado:** dizia quatro listas; eram cinco com nome (o cadastro de usuário é a quinta) e mais dez parciais
  com outro propósito (G17).
- Testes novos: `comprasGrupoDesativadoCorrida.api.test.js` (8), `modulosClienteServidor.api.test.js` (7); no client,
  `TipoSelecao.modulos` (4) e `UsuarioForm.modulos` (3) — os dois de tela escritos **antes** da troca e verdes no código
  antigo, menos o rótulo de engenharia.

### Antes → Agora
| Antes | Agora |
|---|---|
| Vincular e "Remover grupo" no mesmo instante: o vínculo gravado depois da desativação em 30 de 30 tentativas (cadastro novo) | 0 de 20 — quem chega depois recebe "Grupo desativado — …" e nada é gravado |
| Grupo apagado do banco entre a conferência e a gravação: erro 500 (com a regra de integridade de produção) | "Grupo não encontrado" |
| Cadastro de usuário: cartão "Engenharia" | "Cálculos de Engenharia" |
| Lista de módulos escrita à mão em 5 lugares (3 no navegador, 2 no servidor), sem teste entre eles | 1 no navegador, 1 no servidor, teste que falha se divergirem |

### Roteiro de teste manual (clicável)
1. **Compras → Fornecedores homologados** (dois navegadores, dois usuários de Compras): abra o mesmo grupo nos dois. No
   segundo, volte à lista e clique "Remover grupo". No primeiro (a tela ainda aberta, com os botões de vincular), vincule
   um fornecedor → *"Grupo desativado — reative o grupo em Fornecedores homologados antes de vincular fornecedores"* e o
   fornecedor não entra. (Isso é o caso sequencial, que já era assim desde a 103; a coincidência de milissegundos não se
   reproduz à mão — está provada no teste.)
2. **Remover grupo com fornecedor dentro:** os fornecedores continuam no grupo (aparecem ao reativar) — como antes.
3. **Administração → Usuários → editar um usuário:** em "Módulos de Acesso", 12 cartões; o de engenharia diz "Cálculos de
   Engenharia"; o Admin não tem "Administrador do módulo"; marque Relatórios, salve, reabra → continua marcado.
4. **Seleção de módulos** (como administrador e como usuário comum com só Compras): os mesmos cartões de antes; o usuário
   comum vê Compras liberado e o resto em "Sem acesso".

### O que a etapa NÃO cobre
- **A corrida da família** (inativar família x cadastrar material no mesmo instante → família inativa com material ativo)
  — medida (30 de 30), não corrigida (B61).
- As três divergências de permissão da lista de módulos (TODOLIST, Admin, Relatórios) — ficaram como estavam (B60).
- As dez listas parciais de módulo (carregamento, splash, prefetch, menus, setores, log do servidor) — G17.
- `canConfigureModule` cliente x servidor (G9) — fora, como combinado.

## Etapa 107 — O primeiro boot não semeia mais as categorias em dobro; as barras de abas são uma só (2026-10-15)

**Em uma frase.** Numa instalação nova o almoxarifado montava o próprio banco duas vezes ao mesmo tempo, e em quase
metade dos primeiros boots as 27 categorias de material entravam em dobro — o seletor de categoria mostrava cada nome
duas vezes e a regra "categoria não repete nome" nunca chegava a valer; e as quatro telas que ainda tinham barra de abas
desenhada à mão (Administração, Minha Conta, Ordens de Serviço do comercial e as Configurações do Almoxarifado) passam a
usar a mesma barra de Configurações, com o mesmo visual, a mesma rolagem no celular e o mesmo teclado.

### O que há de novo (visível para o usuário)
- **Instalação nova:** o almoxarifado nasce com as 27 categorias uma vez só, e o log do primeiro boot fica limpo — some
  o `Erro schema almoxarifado v3 (tentativa 1/3): … UNIQUE constraint failed` e o aviso
  `Nao foi possivel criar idx_categorias_almox_nome`. Banco existente: nada muda (mas veja **A9**).
- **Administração, Minha Conta, Ordens de Serviço (comercial) e Almoxarifado → Configurações:** a barra de abas é a de
  Configurações — mesma altura, mesma cor da aba ativa, rola de lado no celular em vez de quebrar em duas linhas, e as
  setas do teclado (← →, Home, End) trocam de aba. O que cada tela faz não muda: a mesma aba abre primeiro, o endereço
  continua guardando a aba das Configurações do Almoxarifado, quem não é administrador continua sem ver as abas, e os
  contadores da OS continuam aparecendo só quando passam de zero.

### Por baixo do capô
- **G16:** `initSchema(db)` do almoxarifado passa a ser **uma execução por conexão de cada vez**: quem chama com uma
  execução em andamento recebe a mesma promise; terminada (bem ou mal), a próxima chamada roda inteira de novo — a falha
  não fica guardada, então o retry da extended continua valendo (B56). No boot eram duas chamadas
  (`routes/almoxarifado.js` e `runInitSchemaWithRetry` da extended) intercalando comando a comando; todo seed é "conta e,
  se for zero, insere", e as duas viam zero.
- **G8:** `ui/Tabs` ganhou `badge` (contador opcional ao lado do rótulo; 0 e vazio não aparecem). Admin, Minha Conta, OS
  comercial e a barra interna de Almoxarifado → Configurações usam o componente; o CSS próprio de cada barra foi apagado.
  A correção de contraste da aba ativa no celular (que só existia para a OS) vale agora para todas as abas — e o contador
  da aba ativa, que essa regra pintava de azul sobre azul, fica legível.
- **O G8 estava errado em metade da lista:** Compras, Financeiro e Operacional **não têm** barra de abas — só um array
  `tabs` que nada renderiza e CSS sem elemento. Apagados (B57).
- Testes novos: `schemaAlmoxUmaVez.api.test.js` (6); no client, `Admin.abas`, `MinhaConta.abas`,
  `OrdensServicoComercial.abas`, `ConfiguracoesAlmoxarifado.abas`, `Configuracoes.almoxEmbutido` e três casos de `badge`
  em `Tabs.test.js`. Os de comportamento foram escritos **antes** de cada migração e passaram no código antigo.
- A revisão final achou dois testes que diziam prender o que não prendiam (o endereço das Configurações do Almoxarifado
  trocar de aba **sem** encher o histórico do navegador, e a regra de contraste do celular) e uma armadilha no harness de
  testes (montava o app com o schema ainda sendo montado em fundo) — os três fechados (`72f01b83`, `e6b69780`).

### Antes → Agora
| Antes | Agora |
|---|---|
| 1º boot em pasta nova: categorias **54 linhas / 27 nomes** em 6 de 14 boots, índice de nome único ausente | 8 de 8 boots: 27/27, índice criado |
| Log do 1º boot: `UNIQUE constraint failed` (tentativa 1/3) em 13 de 14 boots | 0 de 8 |
| Instalação que nasceu em dobro: **Configurações → Categorias aceitava nome repetido** (a recusa *"Já existe uma categoria com este nome"* vem do índice que faltava) | instalação nova recusa; a que já nasceu em dobro continua aceitando até a limpeza da **A9** |
| Banco que nasceu com categorias em dobro: o aviso do índice em todo boot (duas vezes) | continua avisando (uma vez) — a correção não desfaz o dado antigo (**A9**) |
| `Schema almoxarifado v3 inicializado` duas vezes por boot | uma vez |
| Quatro barras de abas com desenho próprio (e Admin quebrando em duas linhas no celular) | a barra de Configurações nas quatro, rolando de lado |
| Abas trocavam só com o mouse | também com ← → Home End |
| Contador da aba ativa da OS ilegível no celular (azul sobre azul) | branco sobre azul |
| Rótulos das abas da OS em MAIÚSCULAS | caixa normal, como as outras abas (B58) |

### Roteiro de teste manual (clicável)
1. **Administração** (`/admin`, como administrador): três abas Usuários · Permissões · Logs; abre em Usuários; clique em
   Logs → a lista de logs; com a aba focada, ← volta para Permissões.
2. **Minha Conta** (menu do usuário): abre em "Informações pessoais"; "Alterar senha" mostra só o formulário de senha.
3. **Comercial → Ordens de Serviço:** com propostas aprovadas sem OS, a aba "Propostas Aprovadas" mostra o número; sem
   nenhuma, não mostra número (nem "0"). "Ordens de Serviço" mostra os cartões de total/pendentes e a lista.
4. **Almoxarifado → Configurações** (administrador do almoxarifado): 13 abas; clique em "Localizações" e aperte F5 — volta
   em Localizações. Em **Configurações → Almoxarifado**, a mesma barra, menor, abaixo da barra de módulos. Entrando com um
   usuário que não administra o almoxarifado: "Acesso restrito — administrador do Almoxarifado", sem abas.
5. (Quem cuida do servidor.) Suba o servidor numa pasta de dados vazia (`CRM_DATA_DIR`): o log não mostra
   `UNIQUE constraint failed` nem `Nao foi possivel criar idx_categorias_almox_nome`, e
   `SELECT COUNT(*), COUNT(DISTINCT nome) FROM categorias_material_almoxarifado` responde `27|27`.

### O que a etapa NÃO cobre
- **Banco que já nasceu com as categorias em dobro** não é consertado — a consulta **A9** diz se o seu é um deles e o que
  fazer.
- Botões de alternância que **não são** barras de abas ficam como estão: Ferramentas, Inspeções, Lotes, Reposição e Sobras
  do almoxarifado, Relatórios da Produção, Veículos/Manutenção, Dashboard, Atividades, Colaboradores e Aprovações; e a
  navegação vertical de seções do formulário de OS do Operacional. São botões ou menus verticais com o desenho do próprio
  módulo; trocá-los por abas mudaria a tela, não só unificaria.

## Etapa 105 — Família com material ativo não se inativa pela API; o banco entra em WAL no primeiro boot (2026-10-15)

**Em uma frase.** O botão "Inativar" da aba Famílias sempre recusou família com material ativo, mas o mesmo
gesto feito pela API passava calado — a família sumia das listas com os materiais dentro —, e reativar uma
subfamília pela API deixava-a pendurada numa família principal inativa, onde nenhum material novo entra; e, por
baixo de tudo, o banco que deveria funcionar em modo WAL (leitura e escrita sem se bloquear) ficava no modo antigo
em quase todo boot, ao contrário do que o documento dizia.

### O que há de novo (visível para o usuário)
- **Nada muda na tela.** A aba Famílias já recusava inativar família com material ativo (*"Não é possível remover:
  família possui N item(ns) ativo(s)"*); agora quem faz o mesmo pela API recebe **a mesma mensagem**, palavra por palavra.
- **Pela API (nenhuma tela faz isso):** reativar uma subfamília cuja família principal está inativa é recusado com
  **"Não é possível reativar: a família principal desta subfamília está inativa — reative a família principal antes"**;
  o campo "ativo" da família só aceita 0/1 (**"Ativo inválido: use 0 ou 1"**).
- **Banco:** o servidor passa a ligar o modo WAL já no primeiro boot (e no próximo boot de um banco que estava no modo
  antigo). O aviso `WAL mode unavailable` some do log.

### Por baixo do capô
- **G10c:** `PUT /api/almoxarifado/familias/:id` com `ativo` passando de ativo para inativo usa **a mesma contagem** do
  `DELETE` (um helper só para as duas portas): material ativo pela família ou pela subfamília → 400 com a literal do
  DELETE, antes da checagem de subfamília ativa (a ordem do DELETE). Família **já** inativa continua editável.
- A medição achou mais três portas, todas fechadas: `ativo` gravado cru (`'false'` virava texto e a família sumia das
  listas de ativas **e** de inativas; agora 0/1 normalizado, o resto recusado — B55); a recusa de subfamília ativa
  valendo também para família já inativa (renomear o legado dava 400; agora só na transição — B54); e o inverso,
  reativar subfamília sob raiz inativa (antes 200; repetindo o pai, a recusa era a enganosa "máximo 2 níveis").
- **G12:** `configureSqlite` pede o `PRAGMA journal_mode = WAL` por `exec`, que o driver executa **sozinho e antes**
  de tudo o que os módulos enfileiraram antes de o banco abrir (era um `run` comum, que disputava a conexão com ~40
  `CREATE`/`SELECT` e perdia). Os outros PRAGMAs vão logo atrás, ainda antes da fila, e o modo é **lido** depois: o log
  só diz "WAL mode enabled" quando o banco está mesmo em WAL. Cada PRAGMA vai separado, com `foreign_keys` primeiro: a
  revisão final achou que, juntos, um arquivo travado por outro processo no boot deixava as chaves estrangeiras
  desligadas o processo inteiro. Efeito colateral bom: o `PRAGMA temp_store`, que às vezes
  caía com uma exceção não tratada no mesmo boot (1 de 7 medidos), não cai mais.
- A revisão final achou mais duas, também fechadas: reativar uma subfamília que estava num **terceiro nível** (legado de
  antes da 103) trazia o terceiro nível de volta — agora *"Subfamília não pode ter filhos (máximo 2 níveis)"*; e repetir
  no corpo o mesmo pai gravado fazia o sistema revalidá-lo, de modo que uma subfamília sob família principal inativa não
  se renomeava nem se inativava — agora repetir o pai é o mesmo que omiti-lo.
- Testes novos: `familiaInativaPeloPut.api.test.js` (38) e cinco cenários em `sqliteConcurrency.test.js`.

### Antes → Agora
| Antes | Agora |
|---|---|
| `PUT` de família com `ativo: 0` e material ativo: 200, família inativada com os materiais dentro | 400 *"Não é possível remover: família possui N item(ns) ativo(s)"* — a mesma do "Inativar" |
| `ativo: 'false'` gravado como texto: a família sumia das ativas e das inativas | grava 0; valor que não é 0/1 → *"Ativo inválido: use 0 ou 1"* |
| `ativo: 'false'` inativava raiz com subfamília ativa | *"Não é possível inativar: família possui subfamília(s) ativa(s)"* |
| Renomear pela API uma raiz já inativa que tinha subfamília ativa: 400 | 200 (não é inativação) |
| Reativar subfamília com família principal inativa: 200, sub pendurada | *"Não é possível reativar: a família principal desta subfamília está inativa — reative a família principal antes"* |
| Banco novo: modo antigo (`delete`) em 6 de 7 boots, e continuava assim nos boots seguintes | WAL em 6 de 6 boots novos; banco antigo em `delete` vira WAL no primeiro boot |
| Log: `WAL mode unavailable: … within a transaction` (dito inofensivo) | `WAL mode enabled`, só quando o modo lido é WAL |

### Roteiro de teste manual (clicável)
1. **Almoxarifado → Configurações → Famílias** → numa família que tem material ativo, clique no ícone de lixeira
   (**Inativar**) e confirme: aparece *"Não é possível remover: família possui N item(ns) ativo(s)"* (como antes).
2. (Só pela API, autenticado como administrador do almoxarifado.) `PUT /api/almoxarifado/familias/<a mesma família>` com
   `{"nome": "<o mesmo>", "ativo": 0}` → **400** com **a mesma frase** do passo 1. A família continua na aba.
3. Mesma chamada com `"ativo": "talvez"` → **400** *"Ativo inválido: use 0 ou 1"*.
4. Inative uma família **sem** material e com uma subfamília sem material: primeiro a subfamília (lixeira), depois a
   família (lixeira). Pela API, `PUT` na subfamília com `{"nome": "<o mesmo>", "ativo": 1}` → **400**
   *"Não é possível reativar: a família principal desta subfamília está inativa — reative a família principal antes"*.
   Reative a família principal (`PUT` com `"ativo": 1`) e repita na subfamília → 200; as duas voltam à aba.
5. (Banco — quem cuida do servidor.) Suba o servidor numa pasta de dados vazia (`CRM_DATA_DIR`); o log mostra
   `[SQLite] WAL mode enabled` e, com o servidor parado, `PRAGMA journal_mode;` responde `wal`.

### O que a etapa NÃO cobre
- A tela de Famílias continua **sem** botão de reativar família (a reativação é só pela API, como antes).
- A recusa de subfamília ativa do `PUT` manteve o texto próprio (*"Não é possível inativar…"*), diferente do DELETE (B54).
- **G16:** o erro de setores duplicados (`UNIQUE constraint failed: setores_almoxarifado.nome`, tentativa 1/3) no
  primeiro boot continua aparecendo — o schema do almoxarifado roda duas vezes ao mesmo tempo; a segunda tentativa passa.
- Inativar e mexer no material **no mesmo instante** (dois usuários) não é uma operação só — a contagem e a gravação
  são passos separados, como no DELETE desde sempre.

## Etapa 103 — Grupo de fornecedores desativado volta pela tela e não recebe fornecedor; família com material não muda de nível (2026-10-15)

**Em uma frase.** Depois do "Remover grupo" (Etapa 100) o grupo só voltava mexendo no banco, e a tela de um
grupo desativado aberta por um endereço antigo continuava **vinculando fornecedores a ele** sem avisar nada;
e, do lado do almoxarifado, transformar em subfamília uma família que já tinha materiais deixava esses
materiais com a família errada — o mesmo defeito que a Etapa 100 tinha fechado por outra porta.

### O que há de novo (visível para o usuário)
- **Compras → Fornecedores homologados**: se houver grupos desativados, aparece o botão
  **"Mostrar grupos desativados (N)"** abaixo da grade. Cada grupo desativado tem o selo **"Desativado"** e o
  botão **"Reativar"** — clicou, aparece **"Grupo reativado"** e o grupo volta para a grade com os
  fornecedores que estavam nele. Se **todos** os grupos estiverem desativados, a página diz
  **"Nenhum grupo ativo."** e o botão continua lá.
- **A tela de um grupo desativado** (pelo cartão desativado ou por um endereço salvo) mostra
  **"Este grupo está desativado — reative-o para vincular fornecedores."** com o botão **"Reativar grupo"**, e
  **não** mostra "Vincular fornecedor" nem "Novo fornecedor". Editar um fornecedor que já está nele e
  "Remover do grupo" continuam funcionando.
- **Grupo que não existe** (endereço com número errado): o título vira **"Fornecedores – Grupo não encontrado"**
  e aparece **"Grupo não encontrado."**, sem os botões de vincular.
- Quem tentar vincular a um grupo desativado por outro caminho recebe
  **"Grupo desativado — reative o grupo em Fornecedores homologados antes de vincular fornecedores"**.
- **Almoxarifado (só pela API — nenhuma tela faz isso):** mudar o nível de uma família que tem material é
  recusado com **"Não é possível transformar em subfamília: a família tem N material(is) cadastrado(s) (contando
  os inativos)"** ou **"Não é possível mudar a família principal desta subfamília: ela tem N material(is)
  cadastrado(s) (contando os inativos)"**; família com subfamília inativa não vira subfamília
  (**"Família com subfamília(s) inativa(s) não pode virar subfamília — elas ficariam num terceiro nível"**).

### Por baixo do capô
- **Reativar:** `POST /api/compras/grupos/:id/reativar` (mesmo controle de acesso das outras rotas de grupo;
  idempotente; não mexe em quem estava ligado). `GET /api/compras/grupos` e `/grupos/:id` aceitam
  `?incluir_inativos=1`; **sem** o parâmetro respondem como antes — a ficha do fornecedor e as Variáveis
  técnicas não mudam.
- **Vínculo:** as portas de fornecedor que respondem (`routes/compras/fornecedores.js`) conferem o grupo só
  quando ele **muda**: não existe → 400 "Grupo não encontrado"; desativado → 400 com a mensagem acima. O
  **mesmo** grupo do cadastro passa e nem é regravado — em produção a coluna tem chave estrangeira ligada, e
  regravar um grupo que já não existe com ele mesmo dava erro (achado da revisão do plano).
- **Família (G10b):** `PUT /api/almoxarifado/familias/:id` recusa a mudança de nível com material (conta os
  inativos, por família ou subfamília), recusa raiz com subfamília inativa virando sub e recusa `parent_id`
  que não é número (`'abc'` virava raiz sem aviso; `'0'` gravava um pai que não existe) com
  **"Família pai não encontrada"**. Renomear continua livre.
- Testes novos: `familiaMudaDeNivel.api.test.js` (14), `comprasGrupoDesativado.api.test.js` (9, com uma parte
  sobre a estrutura de banco de produção com a chave estrangeira ligada), `GruposFornecedores.test.js` (9) e
  `FornecedoresDoGrupo.test.js` (8). `comprasFornecedor.api.test.js` passou a criar os grupos que usava.

### Antes → Agora
| Antes | Agora |
|---|---|
| Grupo desativado só voltava pelo banco | Botão "Reativar" na lista (seção de desativados) e na tela do grupo |
| Tela de grupo desativado aberta por endereço: título "Grupo", vinculava fornecedor normalmente | Aviso "Este grupo está desativado…", sem "Vincular"/"Novo"; o servidor recusa |
| Endereço de grupo inexistente: título "Grupo", vinculava (em produção dava erro do banco) | "Grupo não encontrado", sem botões; o servidor responde 400 com a mensagem |
| Família com material virava subfamília pela API (materiais com a família errada) | Recusado, com a contagem de materiais |
| Família com subfamília inativa virava subfamília (três níveis depois de reativar) | Recusado |
| `parent_id: 'abc'` transformava a subfamília em raiz sem aviso | "Família pai não encontrada" |

### Roteiro de teste manual (clicável)
1. **Compras → Fornecedores homologados** → **Adicionar grupo** "Teste 103" → abra o grupo → **Vincular
   fornecedor** (escolha um) → volte.
2. Lápis do "Teste 103" → **Remover grupo** → confirme. O grupo some da grade e aparece
   **"Mostrar grupos desativados (1)"**.
3. Clique no botão → o cartão "Teste 103" aparece com **"Desativado"**. Clique **no cartão** (não no botão):
   abre a tela do grupo com **"Este grupo está desativado — reative-o para vincular fornecedores."** e sem
   "Vincular fornecedor"/"Novo fornecedor". O fornecedor do passo 1 continua listado; o lápis dele salva
   normalmente.
4. Clique **"Reativar grupo"** → **"Grupo reativado"**; o aviso some e os botões voltam. Volte: o grupo está na
   grade de novo, com o fornecedor.
5. Troque o número no endereço por um que não existe (ex.: `…/grupo/99999`): **"Fornecedores – Grupo não
   encontrado"** e o aviso **"Grupo não encontrado."**.
6. (Família — só pela API, por exemplo com um cliente HTTP autenticado como administrador do almoxarifado.)
   `PUT /api/almoxarifado/familias/<id de uma família com materiais>` com `{"nome": "<o mesmo>", "parent_id": <id de outra família>}`
   → 400 **"Não é possível transformar em subfamília: a família tem N material(is) cadastrado(s) (contando os
   inativos)"**. O mesmo corpo **sem** `parent_id` → 200 (renomear continua livre).

### O que a etapa NÃO cobre
- **G10c:** o `PUT` de família com `ativo: 0` ainda inativa família com materiais ativos (o "Inativar" da tela
  recusa; o `PUT` não confere). Nenhuma tela manda isso. **Corrigido na Etapa 105 (`80b15bc9`).**
- Mudar o nível de uma família pela **tela** continua não existindo (era e continua só API).
- Família ou material que já estejam num estado errado **antes** desta etapa não são corrigidos sozinhos —
  a consulta **A7** os acha.
- Vincular e desativar o grupo **no mesmo instante** (dois usuários) ainda pode deixar um vínculo novo no grupo
  desativado (B52).
- Variáveis técnicas que apontam para um grupo desativado continuam oferecendo os fornecedores dele (B45).

## Etapa 100 — Dívidas de Compras: "Remover grupo" funciona, família no lugar certo, Excel de pedidos com IPI e frete (2026-10-15)

**Em uma frase.** Três defeitos que estavam declarados e tinham conserto conhecido: o botão
**"Remover grupo"** dos fornecedores homologados não removia nada; dava para gravar um material pela
API com a **subfamília no lugar da família** (e ele sumia do filtro); e um pedido com **IPI ou frete**
exportado para Excel e importado de volta nascia **mais barato** do que o original.

### O que há de novo (visível para o usuário)
- **Compras → Fornecedores homologados → lápis do grupo → "Remover grupo"** agora desativa o grupo: ele
  some da lista. Os fornecedores do grupo **continuam cadastrados e ligados a ele** (nada se perde).
- A ficha do fornecedor ligado a um grupo desativado mostra **"Grupo desativado (#N)"** no campo
  *Grupo homologado* — antes mostrava "Sem grupo" enquanto continuava ligado.
- Material novo com uma subfamília no campo de família é recusado com:
  **"A família escolhida é uma subfamília — escolha a família principal e use a subfamília no campo Subfamília"**.
- Material **antigo** gravado assim continua editável e, ao abrir a edição, o campo *Família* fica
  **liberado** com a nota **"Este material está gravado com uma subfamília no lugar da família — escolha a
  família principal e depois a subfamília."** — dá para corrigir pela tela.
- **Criar material do retalho** (Sobras) e **Criar material resultante** (Remessas) a partir de um desses
  materiais antigos criam o novo já com a família principal e a subfamília no lugar certo.
- **Compras → Pedidos → Exportar Excel** ganha quatro colunas no fim: **IPI %**, **Frete**, **ICMS-ST** e
  **Desconto**. **Importar planilha** lê essas colunas — o pedido reimportado tem o **mesmo valor total**.
  Valor que não dá para entender vira aviso (a linha entra mesmo assim), por exemplo
  **"Linha 4 (ipi_percentual): IPI % não reconhecido (use número de 0 a 100)"** e
  **"Linha 1 (valor_frete): Frete não reconhecido (use número maior ou igual a 0)"**.

### Por baixo do capô
- **G1:** `DELETE /api/compras/grupos/:id` subiu para cima do `DELETE /api/compras/:tipo/:id` genérico em
  `server/routes/compras.js` (como as rotas de pedido e cotação). O cenário (4) de
  `comprasPedidosRotas.api.test.js`, que **congelava** o 400 como caracterização, virou o teste do
  comportamento certo. `FornecedorForm.js` ganha a opção do grupo desativado só depois de a lista de
  grupos carregar com sucesso.
- **G10:** `validateFamiliaAtiva` (`materialService.js`) recusa família com `parent_id`. O `PUT` do
  material só revalida a família quando ela **muda** — o legado não trava. `MaterialAlmoxarifadoForm.js`
  destrava o select quando a família **gravada** é subfamília; `utils/familiaDoNovoMaterial.js` acerta o
  par nos atalhos de Sobras e Remessas. Teste novo: `materialFamiliaSubfamilia.api.test.js` (6).
- **G11:** **já estava corrigido desde a Etapa 38** (`0c890f24`); a letra G deste documento estava
  desatualizada. Esta etapa só rodou o controle positivo do teste que o prende.
- **G13:** `importarPedidos` lê `IPI %` por linha e Frete/ICMS-ST/Desconto por pedido, com um leitor
  **estrito** (texto como "isento, ver NF" ou "12abc" vira aviso, nunca número inventado). O export
  (`Compras.js`) põe as quatro colunas no fim. Cenários (11)–(13) de `comprasPedidoImportar.api.test.js`,
  o (13) cruzando criar pela rota → ler pela rota → reimportar → mesmo `valor_total`.
- **G15:** avaliada e **não feita** — a correção apontada faria o documento do pedido antigo mostrar
  linhas que somam um valor e total outro (ver G15 abaixo).

### Antes → Agora
| Antes | Agora |
|---|---|
| "Remover grupo" → erro "Tipo inválido", grupo continuava na lista | Grupo desativado, some da lista; fornecedores continuam ligados |
| Ficha de fornecedor de grupo desativado mostrava "Sem grupo" (e salvava o grupo mesmo assim) | Mostra "Grupo desativado (#N)"; "Sem grupo" de fato desliga |
| API aceitava material novo com a subfamília no campo família | 400 com a mensagem que orienta |
| Material antigo assim: família travada na edição, impossível corrigir pela tela | Campo liberado com nota; corrige escolhendo a principal e a sub |
| Retalho/resultado de material antigo herdava a subfamília como família | Nasce com a principal + a sub |
| Export de pedidos sem IPI/encargos → reimport com valor menor | Colunas IPI %, Frete, ICMS-ST, Desconto; reimport com o mesmo total |

### Roteiro de teste manual (clicável)
1. **Compras → Fornecedores homologados** → crie o grupo "Teste 100" → abra um fornecedor e escolha o grupo
   "Teste 100" → **Salvar**.
2. Volte em **Fornecedores homologados** → lápis do "Teste 100" → **Remover grupo** → confirme a pergunta
   *"Desativar o grupo "Teste 100"? Os fornecedores continuarão cadastrados, mas o grupo não aparecerá na
   lista."* → o grupo **some** da lista.
3. Abra o fornecedor do passo 1: o campo *Grupo homologado* mostra **"Grupo desativado (#N)"**. Escolha
   **Sem grupo** → **Salvar** → reabra: "Sem grupo".
4. **Pedidos → Novo pedido**: um item com quantidade 3, valor 33,33 e IPI 12; frete 45,90 → **Salvar**.
   Na lista, **Exportar Excel**: o arquivo tem as colunas **IPI %** (12), **Frete** (45,9), **ICMS-ST** e
   **Desconto** no fim.
5. **Novo pedido → Importar planilha** com esse mesmo arquivo: o pedido criado tem **o mesmo Valor Total**
   do original. Troque a célula *IPI %* por `isento` e importe de novo: aparece
   **"Linha 1 (ipi_percentual): IPI % não reconhecido (use número de 0 a 100)"** e o pedido entra sem IPI.
6. (Família — precisa de um material antigo gravado com a subfamília no lugar da família; a consulta
   **A6** acha os que existirem.) Abra a edição dele: o campo *Família* está liberado com a nota
   *"Este material está gravado com uma subfamília no lugar da família — escolha a família principal e
   depois a subfamília."* → escolha a principal e a subfamília → **Salvar**.

### O que a etapa NÃO cobre
- **Reativar** um grupo desativado: não há botão (só no banco: `UPDATE grupos_compras SET ativo = 1`). → **Etapa 103** criou o botão.
- Material antigo cuja subfamília (gravada no lugar da família) está **inativa**: o campo continua
  travado na edição (a tela só reconhece subfamílias ativas) — corrigir pela API ou reativar a sub.
- `PUT /familias/:id` que transforma uma família **com materiais** em subfamília ainda cria o caso antigo
  (**G10b**). → **fechado na Etapa 103**.
- Pedido **anterior à Etapa 39** com preço de 3+ casas reimporta com o total recalculado, não o gravado
  (**G15**).

## Etapa 89 — Número de OS com barra ou aspas não quebra mais o PDF (2026-10-08)

**Em uma frase.** Uma OS numerada como `OS 1/2 "A"` dava "Erro ao gerar PDF" — o número ia cru para o
nome do arquivo e o Windows recusava; agora o nome do arquivo é limpo e o PDF sai normalmente, com o
número original no documento.

### O que há de novo (visível para o usuário)
- **OS → Gerar PDF** funciona com qualquer número de OS (barra, aspas, dois-pontos, acento).
- O documento mostra o número exatamente como foi digitado.

### Por baixo do capô
- `nomeArquivoPdfOs` em `services/pdfOs.js` (troca o que não é letra/dígito/`.`/`-` por `_`, tira acento,
  limita a 80 caracteres, cai no id da OS se sobrar nada). Teste `pdfOsNomeArquivo.api.test.js` (10).

### Antes → Agora
| Antes | Agora |
|---|---|
| `numero_os = 'OS 1/2 "A"'` → 500 "Erro ao gerar PDF" | 200, arquivo `OS_OS_1_2_A_<hora>.pdf`, documento com `OS 1/2 "A"` |

### Roteiro de teste manual (clicável)
1. **Operacional → OS → editar** o número para `OS 1/2 "A"` → **Gerar PDF**: o PDF abre e mostra o número
   como digitado.

### O que a etapa NÃO cobre
- PDFs que falharam antes não existem — é só gerar de novo.

## Etapa 88 — PDF da OS com "Página X de Y" em toda página (2026-10-08)

**Em uma frase.** O PDF da OS dizia "Página 1 de 1" mesmo tendo 3 ou 6 páginas, e só na última folha;
agora cada página tem o número certo no rodapé.

### O que há de novo (visível para o usuário)
- **OS → Gerar PDF**: rodapé "Página 1 de 6", "Página 2 de 6"… em toda folha.
- Um item (foto + especificações) não é mais cortado entre duas páginas: se não cabe, começa na seguinte.

### Por baixo do capô
- `services/pdfOs.js`: o `@page` da OS (margem inferior de 10 mm) e as opções do `page.pdf` com o rodapé
  do Chromium; `gerarHTMLOS` não estima mais páginas. Teste `pdfOsRodape.api.test.js` (6), que a revisão
  reforçou contra 4 jeitos de esconder ou quebrar o rodapé sem nenhum teste falhar.

### Antes → Agora
| Antes | Agora |
|---|---|
| "Página 1 de 1" só na última folha (PDF de 3 ou 6 páginas) | "Página X de Y" real em toda folha |
| Item podia ser cortado entre páginas | Item inteiro na página seguinte |

### Roteiro de teste manual (clicável)
1. **Operacional → OS** com vários itens → **Gerar PDF**: confira o rodapé de cada página.

### O que a etapa NÃO cobre
- PDFs de OS gerados antes continuam com o rodapé antigo até serem gerados de novo.

## Etapa 87 — PDF da OS 10× mais rápido, na fila dos PDFs (2026-10-08)

**Em uma frase.** O PDF da OS abria um navegador interno novo a cada geração (~580 MB de memória) e
esperava 2 segundos fixos; agora usa o mesmo navegador da proposta e do pedido de compra, na mesma
fila — sai igual, em menos de meio segundo.

### O que há de novo (visível para o usuário)
- **OS → Gerar PDF**: o mesmo documento de antes, em **~0,5 s** (antes ~4,7 s).
- Gerar PDF de OS e de proposta ao mesmo tempo não abre dois navegadores no servidor (menos risco de
  o servidor cair por falta de memória).

### Por baixo do capô
- A rota de PDF da OS ganhou um bloco próprio na fila (`enfileirarPdf` + `obterNavegadorPdf`), com as
  mesmas opções de página; saíram o `puppeteer.launch` próprio, cinco `browser.close`, a interceptação
  de requisições, o `networkidle0` e o sleep de 2 s.
- `fecharNavegadorComPrazo` (`services/filaPdf.js`): fechar o navegador tem prazo de 10 s, depois mata o
  processo. `resolveClientAsset` (`services/assetsDoClient.js`): o logo é achado em `client/build` ou
  `client/public`.
- Régua `filaPdfFiacao.api.test.js` (18): um único `launch`, cada bloco fecha a aba e conta o PDF, toda
  chamada da fila é aguardada, ninguém fecha o navegador por apelido.

### Antes → Agora
| Antes | Agora |
|---|---|
| PDF da OS: ~4,7 s, navegador próprio | ~0,45 s, navegador compartilhado |
| Proposta + OS juntas: até 2 navegadores | no máximo 1 |
| Fechar o navegador podia travar a fila | prazo de 10 s |
| Logo da OS buscado pela rede em produção | embutido no PDF |

### Roteiro de teste manual (clicável)
1. **Operacional → OS → Gerar PDF**: o PDF abre quase na hora, com logo, itens e imagens como antes.
2. Gere um PDF de proposta e, logo em seguida, o da OS: os dois saem.

### O que a etapa NÃO cobre
- O rodapé do PDF da OS diz "Página 1 de 1" mesmo quando o documento tem mais páginas (defeito antigo,
  igual antes e depois) — próxima etapa.
- A rota de gerar o PDF da OS não exige o módulo Operacional (só login).

## Etapa 86 — Erros dos módulos viram mensagem (2026-10-08)

**Em uma frase.** Quando algo dava errado no almoxarifado (foto de material grande demais,
certificado em formato errado, assinatura de requisição pesada…), a tela recebia uma página HTML de
erro e mostrava um texto genérico; agora recebe a mensagem certa, em português.

### O que há de novo (visível para o usuário)
- **Almoxarifado**: foto de material de 11 MB → "Arquivo grande demais (máximo 10 MB)"; assinatura de
  requisição de 3 MB → "máximo 2 MB"; certificado de lote em `.txt` → "Certificado deve ser PDF ou
  imagem"; calibração, ocorrência e destino de sucata idem.
- **Foto do material**: se não puder ser salva, aparece o motivo. Na **edição**, o aviso não diz mais
  "o material foi criado", a foto anterior volta e o "Salvar" não tenta enviar de novo.
- Dados malformados enviados ao servidor respondem "JSON inválido no corpo da requisição".

### Por baixo do capô
- `rotasModulos` (Router) em `server/index.js`: almoxarifado (+ as ~90 rotas que registram depois),
  requisições, frotas, produção, todolist, WhatsApp e chat passam por ele, antes dos tratadores.
- `services/errosApi.js` (`tratarErroGlobalApi`, `erroComMensagemUsuario`): o tratador global saiu do
  `index.js` e virou módulo — o ambiente de testes usa o mesmo, na mesma ordem da produção.
- Os uploads do almoxarifado e do chat passaram a informar o limite no erro (Etapa 85).
- Testes: `errosModulosJson.api.test.js` (26, rotas de verdade do almoxarifado, inclusive as que
  registram depois), réguas de posição reescritas, 6 testes novos na tela do material.

### Antes → Agora
| Antes | Agora |
|---|---|
| Foto de material grande → página HTML 500 → "Foto não pôde ser salva" | 413 "Arquivo grande demais (máximo 10 MB)" na tela |
| Certificado em formato errado → HTML 500 | 400 "Certificado deve ser PDF ou imagem" |
| JSON malformado → 500 "Erro interno do servidor" | 400 "JSON inválido no corpo da requisição" |
| Edição de material com foto recusada dizia "material foi criado" | "Foto não pôde ser salva: <motivo>" e a foto anterior volta |

### Roteiro de teste manual (clicável)
1. **Almoxarifado → Materiais → editar → foto**: envie uma imagem de mais de 10 MB — aparece o motivo;
   a foto anterior continua.
2. **Almoxarifado → Lotes → certificado**: envie um `.txt` — "Certificado deve ser PDF ou imagem".
3. **Chat**: envie uma imagem grande — continua a mensagem do chat.

### O que a etapa NÃO cobre
- O PDF da OS ainda abre um Chromium próprio (B35) — próxima etapa.

## Etapa 85 — Arquivo grande demais com mensagem clara (2026-10-08)

**Em uma frase.** Enviar um arquivo maior que o limite (foto de produto, avatar, logo, anexo de
proposta…) mostrava "Erro interno do servidor"; agora mostra **"Arquivo grande demais (máximo N MB)"**.

### O que há de novo (visível para o usuário)
- Foto de produto de 11 MB → "Arquivo grande demais (máximo 10 MB)"; avatar de 6 MB → "máximo 5 MB".
- Produto e proposta mostram o aviso que já existia na tela e nunca aparecia.
- Chat continua com a mensagem dele ("Imagem muito grande. Máximo 10MB.").

### Por baixo do capô
- `multerComLimiteNoErro` (`services/imagemUpload.js`) embrulha o `require('multer')` do `index.js`: os
  18 uploads com limite passam a anexar o limite ao erro; `tratarArquivoGrandeDemais` responde 413 e
  registra no log. Teste `uploadGrandeDemais.api.test.js` (11) com multer de verdade.

### Antes → Agora
| Antes | Agora |
|---|---|
| Arquivo acima do limite → 500 "Erro interno do servidor" | 413 "Arquivo grande demais (máximo N MB)" |

### Roteiro de teste manual (clicável)
1. **Produtos → editar → foto**: envie uma imagem de mais de 10 MB — aviso de arquivo grande.
2. **Minha Conta → foto**: imagem de mais de 5 MB — "Arquivo grande demais (máximo 5 MB)".

### O que a etapa NÃO cobre
- Almoxarifado e os outros módulos montados por último: o erro de arquivo grande ainda vira uma página
  HTML de erro 500 (próxima etapa).
- Outros erros de upload (campo com nome errado etc.) continuam 500.

## Etapa 84 — O token sai do endereço (2026-10-08)

**Em uma frase.** O servidor aceitava o token de login também **no endereço** (`…?token=…`) — e
endereço fica gravado em log, histórico e cabeçalho `Referer`; agora o login e o chat só aceitam o
token no cabeçalho, que é como todas as telas já mandavam.

### O que há de novo (visível para o usuário)
- **Nada muda para quem usa o sistema** — todas as telas e o chat já mandavam o token no cabeçalho.
- Quem colar um endereço com `?token=` recebe "Envie o token no cabeçalho Authorization".
- O backup por endereço (`/api/backup?token=…`, com o token do backup) continua como estava.

### Por baixo do capô
- `services/authenticateToken.js` (`criarAuthenticateToken`) e `services/tokenDaRequisicao.js`: o
  login lê só `Authorization: Bearer` e `X-Auth-Token`; o aviso de recusa vai ao log sem a query.
- Chat: `criarAuthSocket` em `services/chat/socket.js` lê só o `auth` do handshake e o cabeçalho.
- Testes **por comportamento** (`tokenNaUrl` 16, `chatSocketTokenNaUrl` 11): a revisão provou que a
  primeira versão, que só lia o código, deixava voltar o login por `?token=` sem nenhum teste falhar.

### Antes → Agora
| Antes | Agora |
|---|---|
| `/api/auth/me?token=<jwt>` → 200 | → 401 `TOKEN_NA_URL` |
| Socket do chat com token na query → conectava | → recusado "Token não fornecido" |
| Testes do login liam o código-fonte | Testes executam o middleware de verdade |

### Roteiro de teste manual (clicável)
1. Use o sistema normalmente (propostas, compras, chat): nada muda.
2. (Técnico) Copie o token do `localStorage` e abra `http://<servidor>:5000/api/auth/me?token=<token>`
   numa aba: aparece `{"error":"Envie o token no cabeçalho Authorization"...}`.

### O que a etapa NÃO cobre
- O backup continua aceitando o token dele no endereço (B39; Etapa 21).

## Etapa 83 — Todo upload de imagem pelo tipo real (2026-10-08)

**Em uma frase.** Dez telas de upload de imagem (produto, material de escritório, família,
esquemático, grupo, logo da empresa, logo do cliente, header, footer, capa) gravavam o arquivo com a
extensão que o **nome** dizia — agora o servidor olha o tipo real da imagem, e quem manda um
formato errado vê uma mensagem clara.

### O que há de novo (visível para o usuário)
- Enviar um arquivo que não é imagem (ou um SVG fora do logo da empresa) mostra **"Formato de
  imagem não suportado"** — antes aparecia "Erro interno do servidor".
- A foto salva pelo Windows como `.jfif` passa a ser aceita.
- **Esquemático da família**: o envio direto passou a funcionar — antes era sempre recusado por um
  defeito antigo, e a tela disfarçava enviando de novo por outro caminho.
- Fotos de produto com transparência (PNG com nome `.jpg`) não perdem mais o fundo transparente na
  otimização.

### Por baixo do capô
- Os 10 multers passam por `services/imagemUpload.js` (formato pelo tipo, extensão pelo tipo, miolo
  do nome preservado); a exceção do SVG fica só no logo da empresa, fora do mapa compartilhado.
- Erro de formato marcado e convertido em 400 por um middleware próprio, registrado depois das rotas
  de upload e antes do handler global; a recusa vai para o log (`[upload] formato recusado`).
- Removido o multer morto do chat antigo (aceitava qualquer arquivo; ninguém usava).
- Régua no `imagemUploadFiltros.api.test.js` (26): todo `multer.diskStorage` do `index.js` está na
  lista de imagem ou de documento; nos de imagem, o nome gravado termina com a extensão segura.

### Antes → Agora
| Antes | Agora |
|---|---|
| `foto.html` com tipo `image/png` gravado `.html` | gravado `.png` |
| SVG aceito como foto de produto | recusado: "Formato de imagem não suportado" |
| Formato errado → "Erro interno do servidor" | → "Formato de imagem não suportado" |
| Esquemático por envio direto sempre recusado | funciona |

### Roteiro de teste manual (clicável)
1. **Produtos → editar → foto**: envie um JPEG normal — aparece. Envie um `.svg` — "Formato de
   imagem não suportado".
2. **Famílias → editar → esquemático**: envie um PNG — aparece.
3. **Configurações → Modelo de proposta → logo**: um SVG continua aceito.
4. Salve uma imagem da internet no Windows (vira `.jfif`) e envie como foto de produto — aceita.

### O que a etapa NÃO cobre
- Arquivo grande demais ainda mostra "Erro interno do servidor" (limite de tamanho do upload) —
  não é formato, fica registrado.
- Logo da empresa em SVG continua aceito (B38).

## Etapa 82 — Imagens do chat, fotos da proposta e avatares com endereço que vence (2026-10-08)

**Em uma frase.** As imagens do chat interno, as fotos soltas da proposta e as fotos de perfil
abriam por um endereço fixo sem login — o do avatar era o mais fácil de adivinhar
(`avatar_<id do usuário>_<hora>`); agora o servidor entrega um endereço **assinado** que vence, e o
endereço cru não abre mais.

### O que há de novo (visível para o usuário)
- Para quem usa o sistema, **nada muda na tela**: chat, preview da proposta, menu lateral e Minha
  Conta mostram as imagens como antes.
- **Chat**: se a conversa ficar aberta tanto tempo que o endereço de uma imagem vença, a imagem se
  renova sozinha quando aparece (sem recarregar a conversa nem perder a rolagem). Funciona também na
  imagem ampliada.
- **Minha Conta**: ao trocar ou remover a foto, o menu atualiza na hora; se a foto não carregar,
  aparecem as iniciais em vez do ícone de imagem quebrada.
- Grupos, famílias, fornecedores e grupos de compras: imagem em formato estranho (SVG, ícone, HTML
  disfarçado) é recusada com **"Formato de imagem não suportado"**.

### Por baixo do capô
- O assinador do almoxarifado virou genérico (`criarAssinadorUpload(segredo, { prefixo, dominio,
  minutos, baldeMinutos })`), com a **pasta na chave**; o almoxarifado continua idêntico.
- Chat: `mapMessage` assina o anexo (REST, envio e socket); rota nova `GET /api/chat/mensagens/:id/anexo`
  (só participante) para renovar. Fotos: as rotas `/fotos` devolvem `url` assinado e o preview V2
  recebe um assinador injetado (o PDF continua com a imagem embutida). Avatar: campo novo
  `foto_src` (sempre presente) no login, `/auth/me` e Minha Conta.
- Filtros: `services/imagemUpload.js` decide formato pelo tipo real da imagem, não pelo nome.
- Testes novos: `urlUploadParametrizada` (6), `chatAnexoAssinado` (15, rota de verdade),
  `fotosAvataresAssinados` (18), `imagemUploadFiltros` (15) e 6 arquivos no client. A revisão provou
  que dava para pôr a validade do chat em 15 min ou repetir a chave de outra pasta sem nenhum teste
  falhar — agora as configurações reais são afirmadas.

### Antes → Agora
| Antes | Agora |
|---|---|
| `/api/uploads/avatares/avatar_<id>_<hora>.png` abria sem login | 404 sem assinatura |
| Imagem do chat e foto da proposta com endereço fixo | Endereço assinado (8 h / 12 h) |
| Uma chave de assinatura só (almoxarifado) | Uma chave por pasta |
| `data:image/svg+xml` / sem prefixo virava `.jpg` no disco | 400 "Formato de imagem não suportado" |

### Roteiro de teste manual (clicável)
1. **Chat**: envie uma imagem numa conversa; ela aparece normalmente; clique para ampliar.
2. Clique com o botão direito na imagem → "Copiar endereço da imagem"; apague tudo depois de `.png`
   (o `?exp=...&sig=...`) e abra numa aba anônima: **não abre**.
3. **Minha Conta**: troque a foto — o menu lateral muda na hora; remova — aparecem as iniciais.
4. **Proposta → preview editável**: cole uma foto; ela aparece e continua lá depois de mudar de página.
5. **Compras → Grupos**: tente enviar um arquivo `.svg` renomeado: "Formato de imagem não suportado".

### O que a etapa NÃO cobre
- Os outros **10 uploads de imagem** (produtos, materiais de escritório, famílias, esquemático,
  grupos por multipart, logos, logo do cliente, header, footer, capa) ainda escolhem a extensão
  pelo nome do arquivo — o cabeçalho da Etapa 81 já impede a execução; é a próxima etapa.
- Logo em SVG continua aceito (B36).

## Etapa 81 — Arquivos enviados só com login (2026-10-08)

**Em uma frase.** O PDF da OS (cliente, itens, valores), o modelo de contrato, as cotações de
fornecedor e os comprovantes de viagem abriam por um endereço direto **sem login** — e o nome do
PDF da OS era fácil de adivinhar (`OS_<número>_<hora>.pdf`); agora só saem para quem está logado.

### O que há de novo (visível para o usuário)
- **OS → Ver PDF / Gerar PDF**: funcionam como antes, mas o PDF vem pela rota com login. A aba nova
  abre **no clique** (o Chrome bloqueava aba aberta depois de uma geração demorada); se você fechar
  a aba enquanto gera, aparece "PDF gerado — clique em VER PDF". Clicar duas vezes não abre duas abas.
- **Configurações → Modelo de proposta → contrato anexo** e o **preview da proposta**: o link do
  contrato virou botão que baixa o arquivo (com login).
- Um contrato **removido** deixa de ser baixável, mesmo que o arquivo continue no servidor.
- Nada muda nas fotos de produto, logos etc. — continuam aparecendo em todas as telas.

### Por baixo do capô
- Rotas novas com login: `GET /api/operacional/ordens-servico/:id/pdf` e
  `GET /api/proposta-template/contrato-anexo/:arquivo` (`server/services/arquivosProtegidos.js`):
  só o nome do arquivo é usado (nada de `../`), o contrato tem de estar em uso em algum modelo,
  resposta `private, no-store` + `nosniff`, nome do arquivo codificado (número de OS com travessão
  ou aspas não derruba mais o download).
- Saíram 4 montagens públicas: `/uploads/ordens-servico`, `/api/uploads/contrato`, `cotacoes`,
  `comprovantes-viagens`. As 13 pastas públicas restantes ganharam `nosniff` + CSP `sandbox`.
- Client: `utils/baixarArquivoProtegido.js` (download por blob com a mensagem de erro do servidor).
- Testes: `uploadsProtegidos.api.test.js` (29: handlers de verdade + régua no código: cada rota
  registrada **uma** vez e com login, nenhuma montagem das pastas protegidas, cabeçalhos em todas
  as públicas), `OSDetalhesForm.test.js` (10), `ContratoAnexoDownload.test.js` (5).

### Antes → Agora
| Antes | Agora |
|---|---|
| `/uploads/ordens-servico/OS_<n>_<hora>.pdf` abria o PDF sem login | Não abre; o PDF sai por `/api/.../pdf` com login |
| Contrato, cotação e comprovante com endereço público | Só pelas rotas com login |
| Contrato removido continuava baixável | 404 "Contrato não encontrado" |
| `.html` enviado como foto rodava como página do CRM | Servido com `nosniff` + CSP `sandbox` |
| "Ver PDF" com `:5000` fixo no código | Rota relativa ao servidor |

### Roteiro de teste manual (clicável)
1. **Operacional → OS** de uma OS com PDF: **Ver PDF** abre o PDF numa aba. **Gerar PDF** de novo:
   a aba abre logo e o PDF aparece quando termina.
2. Numa **aba anônima**, cole
   `http://<servidor>:5000/uploads/ordens-servico/OS_<número>_<algo>.pdf` de um PDF antigo: não
   abre o PDF.
3. **Configurações → Modelo de proposta**: clique no contrato anexo — baixa. Clique **Remover
   contrato** e tente baixar pelo preview de uma proposta: "Contrato não encontrado".
4. Fotos de produto e logos continuam aparecendo nas listas e na proposta.

### O que a etapa NÃO cobre
- Chat, fotos soltas da proposta e avatares continuam com endereço público (nomes difíceis de
  adivinhar no chat; os outros mais fáceis) — exigem **URL assinada** (Etapa 82).
- Os filtros de upload que aceitam SVG/extensão livre (o cabeçalho já impede a execução; o filtro é
  a segunda camada) — Etapa 82.
- Exigir o módulo Operacional para o PDF da OS (B36).

## Etapa 80 — Um PDF por vez: acabou o PDF que falhava sem motivo (2026-10-08)

**Em uma frase.** A proposta e o pedido de compra geram PDF no mesmo navegador interno; quando
duas pessoas geravam ao mesmo tempo, às vezes um falhava e o servidor acumulava navegadores
abertos comendo memória — agora os pedidos de PDF entram numa fila e saem um de cada vez.

### O que há de novo (visível para o usuário)
- **"Gerar PDF" da proposta e "Documento (PDF)" do pedido não falham mais por concorrência.** Antes,
  com vários PDFs seguidos, aparecia às vezes "Erro ao gerar PDF: Target closed" e era preciso
  clicar de novo.
- Com muita gente gerando junto, o PDF pode **demorar alguns segundos a mais** (espera a vez).
- Menos risco de o servidor cair por falta de memória: medido, antes chegava a **33 navegadores**
  abertos ao mesmo tempo; agora nunca mais de **1**.

### Por baixo do capô
- `server/services/filaPdf.js`: fila serial pura (uma tarefa por vez, em ordem; o erro de uma não
  trava as seguintes). No `index.js`, `enfileirarPdf` embrulha **todo** o trecho que usa o
  navegador nos dois chamadores; reciclagem, fechamento por erro e por ociosidade rodam só entre
  gerações. `protocolTimeout: 60000` no lançamento.
- `PDF_RECICLAR_APOS` (variável de ambiente, padrão 20) — só para a prova conseguir reciclar com
  poucos PDFs.
- Testes: `filaPdf.api.test.js` (ordem, concorrência máxima medida = 1, erro isolado) e
  `filaPdfFiacao.api.test.js` (lê o `index.js`: nada usa ou fecha o navegador fora da fila — a
  revisão provou que a primeira versão passava **com a fila removida** e o teste foi reforçado).

### Antes → Agora
| Antes (prova real, 16 PDFs) | Agora (mesma prova) |
|---|---|
| até 4 de 16 com erro 500 ("Target closed", "Printing failed") | 16 de 16 OK |
| até 33 navegadores abertos | no máximo 1 |
| mais lento ~3 s | mais lento ~9 s (espera na fila) |

### Roteiro de teste manual (clicável)
1. Abra duas abas logadas: numa, **Comercial → Propostas → Gerar PDF**; na outra, **Compras →
   Pedidos → Documento (PDF)** — clique nas duas quase juntas, algumas vezes seguidas.
2. Todos os PDFs baixam; nenhum "Erro ao gerar PDF".
3. (Técnico) No log do servidor, cada PDF de proposta mostra `fila=⟨ms⟩` — o tempo que esperou a vez.

### O que a etapa NÃO cobre
- O PDF da **OS** (abre um navegador próprio, fora da fila — B35).
- Limite de tamanho da fila e desistir quando quem pediu fechou a aba (B35).

## Etapa 79 — A proposta comercial só abre com login (2026-10-08)

**Em uma frase.** O PDF e o "Ver proposta" deixaram de responder para quem não está logado — antes,
quem soubesse o endereço do servidor baixava qualquer proposta (cliente, itens, preços) trocando o
número na URL.

### O que há de novo (visível para o usuário)
- **Nada muda para quem usa o sistema logado:** "Ver proposta", "Gerar PDF", o preview editável e
  o download na lista funcionam como antes.
- Quem tentar abrir `…/api/propostas/⟨número⟩/pdf` ou `/premium` sem login recebe **"Token não
  fornecido"** em vez da proposta.
- Se a sessão expirou, clicar em "Gerar PDF" leva ao login (antes gerava assim mesmo).

### Por baixo do capô
- `authenticateToken` nas duas rotas do `server/index.js` — o mesmo gate da rota que a tela usa
  para ler a proposta. O comentário antigo ("liberada sem autenticação para abertura direta via
  link") foi reescrito explicando por que caiu.
- Teste novo `propostaPdfExigeLogin.api.test.js`: além das duas rotas, uma **régua** — a lista de
  rotas `/api` do `index.js` sem login tem de ser exatamente as 7 legítimas (saúde, login,
  versão, backup com token próprio…). Uma rota nova aberta por engano derruba a suíte.

### Antes → Agora
| Antes | Agora |
|---|---|
| `/api/propostas/1/pdf` sem login → PDF da proposta | → 401 "Token não fornecido" |
| `/api/propostas/1/premium` sem login → HTML completo | → 401 |
| Nenhum teste sobre rotas abertas | Régua: só as 7 legítimas podem ficar sem login |

### Roteiro de teste manual (clicável)
1. Logado, **Comercial → Propostas**: abra uma proposta, clique **Ver proposta** e **Gerar PDF** —
   ambos funcionam.
2. Numa **aba anônima**, cole `http://⟨servidor⟩:5000/api/propostas/1/pdf`: aparece
   `{"error":"Token não fornecido"}` — antes baixava o PDF.

### O que a etapa NÃO cobre
- Exigir o módulo Comercial para abrir a proposta (B34).
- Token na URL (`?token=`) ainda é aceito pelo login do servidor (B34).
- Os arquivos estáticos em `/api/uploads/*` (fotos, anexos de contrato) continuam sem login —
  é outra medição, não feita aqui.

## Etapa 78 — O documento impresso do pedido de compra (2026-10-08)

**Em uma frase.** O pedido de compra agora **sai em PDF no formato do documento que a GMP manda ao
fornecedor** — cabeçalho da empresa, fornecedor, faturamento, condições, itens, os seis totais e
assinaturas — com um clique, pronto para anexar no e-mail.

### O que há de novo (visível para o usuário)
- **Compras → Pedidos**: cada linha da lista tem o botão **"Documento (PDF)"**; o mesmo botão
  aparece no formulário de um pedido já salvo (inclusive quando só o status pode mudar). O arquivo
  baixa com o nome `pedido-compra-⟨número⟩.pdf`.
- **O documento:** logo e dados da GMP; número, datas, situação, emissão e quem emitiu; **Dados do
  fornecedor** (os congelados no pedido — mudar o cadastro depois não muda o papel); **Dados para
  faturamento**; **Dados complementares** (pagamento, frete, transportadora, via, contato,
  observações); a tabela de itens (material, descrição e observação, NCM, peso, quantidade,
  unidade, valor unitário, IPI %, total); os totais (produtos, IPI, ICMS-ST, desconto, frete,
  **total geral**); local de entrega/cobrança; linhas de assinatura "Depto. Compras" e "Diretoria";
  a nota legal, se configurada.
- **Pedido longo:** a tabela continua na folha seguinte **repetindo o cabeçalho das colunas**, e
  toda folha tem no rodapé **"Folha X/Y · Impresso por ⟨usuário⟩ em ⟨data hora⟩"**.
- **A conta fecha no papel:** o valor unitário sai com as casas que tiver (mínimo 2, até 6), então
  quantidade × unitário bate com o total da linha (o ERP imprimia 3 casas fixas e não batia — B31).
- **Configurações → Geral → Empresa** ganhou **Inscrição Estadual** e **Nota legal do pedido de
  compra** (texto livre que sai no fim do documento; vazio = não imprime).

### Por baixo do capô
- `server/services/compras/pedidoDocumentoHtml.js`: função **pura** que recebe pedido, empresa e
  quem imprime e devolve o HTML — testada sem navegador (30 testes, incluindo que **todo** texto
  digitado é escapado: nada que alguém escreva numa observação vira código dentro do Chromium).
- `GET /api/compras/pedidos/:id/documento` (HTML) e `/documento.pdf` (PDF, `attachment`), atrás
  do login e do módulo Compras, como o resto dos pedidos. Pedido inexistente: 404 "Pedido de compra
  não encontrado". O número vai saneado para o nome do arquivo.
- O PDF sai **do mesmo Chromium que já gera a proposta** (`gerarPdfDeHtml` ao lado de
  `obterNavegadorPdf` no `index.js`): A4, margens de 12 mm, rodapé numerado. Em erro, fecha o
  navegador (como a proposta) para não contaminar o próximo PDF.
- Dados da empresa lidos das configurações (`lerEmpresa`); as duas chaves novas nascem vazias no
  primeiro boot. O servidor passou a expor `Content-Disposition` ao navegador (B30); o client tem
  um nome de arquivo de reserva de qualquer jeito.

### Antes → Agora
| Antes | Agora |
|---|---|
| O pedido existia só na tela; para mandar ao fornecedor, refazia-se no ERP | Botão "Documento (PDF)" na lista e no formulário |
| — | PDF A4 no layout do documento da GMP, com cabeçalho repetido e "Folha X/Y" |
| ERP imprimia unitário com 3 casas e a conta da linha não fechava | Unitário com as casas necessárias: a conta fecha |
| IE da empresa fixa no código da proposta | IE e nota legal editáveis em Configurações → Empresa |

### Roteiro de teste manual (clicável)
1. **Configurações → Geral → Empresa:** preencha CNPJ, **Inscrição Estadual**, CEP, telefone,
   e-mail; escreva algo em **Nota legal do pedido de compra**. Salve.
2. **Compras → Pedidos:** num pedido com IPI e frete (o do roteiro da Etapa 39 serve), clique
   **Documento (PDF)**. O arquivo `pedido-compra-PC-….pdf` baixa.
3. Abra o PDF: cabeçalho com os dados do passo 1; fornecedor; itens; **total geral igual ao da
   lista**; assinaturas; a nota legal no fim; "Folha 1/1 · Impresso por ⟨você⟩" no rodapé.
4. Edite o cadastro do fornecedor (troque o telefone) e baixe de novo: o PDF **continua** com o
   telefone antigo (é o congelado no pedido).
5. Abra o pedido em edição e clique **Documento (PDF)** no rodapé: baixa **sem salvar nem mudar
   nada** no pedido.
6. Num pedido com 30+ itens: a segunda folha repete o cabeçalho da tabela e mostra "Folha 2/N".

### O que a etapa NÃO cobre
- **Enviar por e-mail** direto do sistema — hoje baixa e anexa.
- **Código do produto no fornecedor** e o texto legal oficial de ICMS — dependem do P.O. (**D-78**).
- O PDF imprime o pedido **salvo** (B33).
- Fila para o Chromium compartilhado (B32).
- O PDF da proposta continuava sem exigir login (**A5**) — fechado na Etapa 79.

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
- **O documento impresso** (PDF/HTML no formato do ERP) — a Etapa 32 nunca o fez; **entregue na
  Etapa 78** (G14).
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
