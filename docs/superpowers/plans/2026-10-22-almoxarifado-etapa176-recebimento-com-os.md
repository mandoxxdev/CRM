# Etapa 176 — O recebimento informa a OS (material de cliente para industrialização)

> **Status:** 🟢 **fechada** (2026-10-22) — **T1 feita** (`c1c04e1b`, `e79b9718`); **T2 feita** (`0d227edb`); **T3 feita** (`f5c75c68`);
> **Fase 5 (revisão adversarial) feita** (`cf451bed`, `eb82e52b`, `928f5bd6`); fechamento de documentação no commit seguinte. Emendada da
> "próxima tarefa detalhada" da Etapa 174 (B1119). Decisões **B1150** a **B1157**; aviso **C430**; limitações **D (176)**; verificação **F (176)**.
> **A regra RN-176.04 e a "divergência" que estendeu a guarda ao recebimento de pedido foram reescritas na Fase 5** (ver a seção no fim:
> a guarda só recusa no recebimento SEM pedido com OS aberta; com pedido o dono é conferido sob a trava, na reserva).
> **Origem:** resposta do cliente (Matheus, 22/10 09:13): *"Industrialização: materiais que os clientes compram e nossa
> empresa apenas realiza a mão de obra… um estoque de materiais do cliente que ficam em nosso estoque"*. A pergunta
> "o material do cliente já vem para uma OS específica?" **foi feita e aguarda resposta** — por isso a OS é
> **opcional** e a etapa é reversível (nada muda para quem não preencher).
> **Fase 0 (medido):**
> - **Não existe `ENTRADA_CLIENTE`.** Material de cliente entra pelo **recebimento normal** (`POST
>   /api/almoxarifado/recebimentos`, tela `RecebimentosAlmoxarifado.js`) como `ENTRADA_COMPRA`; o dono vem do cadastro
>   do material e a nota é exigida para ele (`receiptService.js:1551-1555`). O plano da 174 chamava isso de "entrada de
>   material de cliente" como se fosse outra porta — **não é**.
> - Esse caminho **já** passa pelas três portas de distribuição da 171 (nota, inspeção, NC) sob a trava; a reserva da
>   OS nasce de `reservaDaOs.osAbertaDoRecebimento` (`:82`), que hoje só segue `pedido_compra_id → pedidos_compra.os_id`.
> - **Não existe guarda de dono na entrada** (`ownerRules.js:131`); `reservarParaOsSobTrava` não confere dono → hoje
>   nada impediria material do cliente A reservado para OS do cliente B.
> - `PREDICADO_RESERVA_DA_OS` está duplicado (`reservaDaOs.js:24` e `osEncerradaService.js:27`).

## Regras

| ID | Regra | Cenário |
|---|---|---|
| RN-176.01 | O recebimento ganha `os_id` **opcional** (`recebimentos_material_almoxarifado.os_id`), aceito no `POST` com a régua da 171 (`OS inválida`; `OS #<id> não encontrada`). | NF de cliente com OS 7 → recebimento com `os_id` 7 |
| RN-176.02 | **Recebimento de pedido:** a OS é a do pedido. `os_id` no payload diferente da do pedido → 400 `A OS do recebimento tem de ser a do pedido (<numero_os do pedido ou "sem OS">)`; igual ou ausente → herda a do pedido. | pedido com OS 7 + payload OS 8 → 400 |
| RN-176.03 | OS **fechada** (régua `osFechada`) no `POST` → 400 `A OS <numero_os> está <status> — não aceita entrada nova`. | — |
| RN-176.04 | **Guarda do dono, por item, na criação do recebimento:** item de material com dono (cliente X) e OS de outro cliente (Y) → 400 `Material <codigo> pertence ao cliente <X>, mas a OS <numero_os> é do cliente <Y>` (nada gravado). OS sem cliente, material próprio, ou mesmo cliente → passa. **(Emendada pela M2: OS sem cliente recusa. Reescrita na Fase 5 — B1152/B1153: recusa só no recebimento SEM pedido com OS aberta; com pedido, o material que não casa entra livre e a reserva da OS não nasce — conferência sob a trava, B1154.)** | chapa do cliente A + OS do cliente B → 400 (sem pedido) |
| RN-176.05 | `osAbertaDoRecebimento` lê **primeiro** o `os_id` do recebimento, depois o do pedido (como hoje). A partir daí tudo é a 171: a entrada `ENTRADA_COMPRA` grava o `os_id` (RN-171.07), o que entrou livre fica reservado para a OS nas três portas (RN-171.08), a requisição da OS converte (RN-171.12), a OS que fecha solta (RN-171.09), o estorno solta (RN-171.11). | nota de cliente sem pedido com OS 7 → reserva da OS 7 |
| RN-176.06 | `PREDICADO_RESERVA_DA_OS` passa a ter **uma** definição (o `osEncerradaService` importa de `reservaDaOs.js`). | — |
| RN-176.07 | Tela de Recebimentos: campo **"OS (opcional)"** (select das OS abertas de `/almoxarifado/aux/ordens-servico`, opção vazia "Sem OS"); com pedido escolhido, mostra a OS do pedido e trava. Lista e detalhe do recebimento mostram a OS. | — |
| RN-176.08 | A lista e o detalhe do recebimento (`GET`) devolvem `os_id` e `os_numero` (leitura viva, `OS #<id>` se sumiu). | — |

## Tasks

| # | Task | Tipo |
|---|---|---|
| T1 | Coluna + Zod + `criarRecebimento` (RN-01..04, 08) + RN-05/06 em `reservaDaOs`/`osEncerradaService` + testes pela rota (incluindo o fluxo de cliente: material com dono, NF, OS → reserva → requisição da OS → entrega; e a OS fechando solta). | tronco |
| T2 | Front da tela de Recebimentos (RN-07), mock só na fronteira HTTP. | galho (worktree), contra o contrato acima |
| T3 | Integração pela rota: recebimento de cliente com OS → reserva → requisição com `os_id` → entrega → "posição por cliente" mostra a aplicação na OS e o "Consumo por OS" a conta. | integração |

## Fora do escopo (letra D)

- **Entrada manual pelo motor** (`ENTRADA_MANUAL`, `POST /movimentacoes/v2`) com OS: não distribui reserva (é por
  desenho) e continua sem documento para material de cliente (já era assim — medido, `materialClienteEntrada:139`).
- Guarda de dono na `ENTRADA_MANUAL` com OS de outro cliente (não existe hoje; declarado).
- "Posição por cliente" mostrar a OS da **entrada** (hoje só lista aplicações = saídas).

## Próxima tarefa detalhada — Etapa 178: entrega de EPI ao colaborador com assinatura na tela (NR-6)

**Por que esta:** é o próximo passo do pedido de ferramentas/EPI da usuária de Compras (as Etapas 175 e 177 fizeram a edição e o retorno da
manutenção da ferramenta). A 176 não deixou "falta para 🟢" próprio: a OS do recebimento é opcional e aguarda a resposta do cliente (B1150).

**O que ainda NÃO chegou (deixar explícito em B, B1157):** os **formulários em papel de EPI** da empresa ainda não chegaram — o André vai
pedir à usuária. A planilha `C:\Users\User\projetos\CRM\image.png` é controle de **COMPRAS**, **não** o formulário de EPI: não usar como
fonte de campo. Logo os campos e o layout da ficha são **deduzidos**: a etapa entra com o **mínimo reversível** e é desenhada para trocar
campos depois (campos do EPI numa estrutura isolada, a ficha montada a partir de uma lista de colunas, nada de layout espalhado).

**Exigência literal da usuária (NR-6):** *identificação do colaborador, integridade, recuperação, evidências confiáveis.* Por isso **o que
`deliverySignatureService.js` faz hoje (imagem + nome digitado) NÃO basta**. O molde vale pelo princípio (append-only, assinatura como
evidência, a rota grava o arquivo pelo multer e limpa o órfão nas saídas ≠ 201, trilha que não vira 500 — C252/B784), não pelo conteúdo.
A 178 precisa de:
1. **Colaborador do cadastro**, não texto livre: `colaboradores` (core, `server/index.js:19255` — `id, nome, cpf UNIQUE, matricula UNIQUE,
   cargo, setor, status`). Recusar colaborador inexistente ou `status` ≠ ativo (mensagem a definir e escrever no manual). O nome **também** é
   gravado na linha (foto do momento — o cadastro muda).
2. **Carimbo de hora do servidor** (`CURRENT_TIMESTAMP` no `INSERT`, nunca a hora do navegador) e **quem registrou** (`user.id`, nome).
3. **Hash do registro com a imagem:** SHA-256 do arquivo de assinatura (lido do disco depois do multer) e um hash do registro (colaborador,
   EPI, CA, quantidade, data/hora do servidor, quem registrou, hash do arquivo), gravados na linha. A releitura confere o hash (arquivo
   trocado no disco → a ficha marca "assinatura não confere").
4. **Append-only:** nenhum `UPDATE`/`DELETE` na tabela de entregas de EPI nem por rota nem por serviço; correção = novo registro que cita o
   anterior (estorno). Teste que prova a ausência de rota de edição/exclusão (controle positivo: criar a rota faz o teste cair).
5. **CA e validade do EPI:** número do **CA** e a **validade** (do CA e/ou da troca) gravados **na entrega** (foto do momento). Onde ficam no
   cadastro (material com tipo `EPI` — `tipos_material_almoxarifado.is_epi`, `schema.js:439`; categoria `EPIs`) é decisão da T1: coluna nova
   reversível no material ou tabela própria. Tamanho e periodicidade de troca **a confirmar com o cliente** — entram como opcionais.
6. **Ficha de EPI por colaborador**, recuperável e **imprimível em PDF** (o client já usa `jspdf` + `jspdf-autotable`; o servidor tem
   `pdfkit`): todas as entregas do colaborador, com data/hora do servidor, EPI, CA, validade, quantidade, quem entregou, a imagem da assinatura
   e o hash; o PDF diz se cada assinatura confere.
7. **Serviço/componente ÚNICO de assinatura**, reaproveitável pelo futuro **termo de responsabilidade de ferramenta** (RN-D do pedido da
   usuária): um serviço de servidor (gravar arquivo + hash + carimbo + quem registrou, devolvendo o id da evidência) e um componente de tela
   (o canvas de assinatura já existe na entrega de requisição — medir na Fase 0 onde, e extrair em vez de copiar). A entrega de EPI e o termo
   de ferramenta só referenciam a evidência.

**Contrato a medir na Fase 0 (não presumir):** a rota atual `POST /api/almoxarifado/requisicoes/:id/assinatura-entrega`
(`routes/almoxarifado/extended.js:1946-1954`, multipart `assinatura`, gate `separar_emitir`, `assinatura-<ts>-<rand>.<ext>`, 2 MB) e a tabela
`assinaturas_entrega_almoxarifado`; se a entrega de EPI vira uma **saída** do motor (`registrarMovimentacao`, sob `naTravaDoMaterial` — a
regra da trava do CLAUDE.md) ou só referencia uma saída já feita; quem pode (perfil — `ACAO_PERFIS`; provavelmente a mesma
`separar_emitir`, ou ação nova reversível registrada em B); se `colaboradores` existe no harness (`testApp.js` — tabelas core costumam faltar,
o teste as cria, como `ordens_servico` aqui).

**Pontos de atenção:** a imagem é **evidência** — a rota de leitura usa a URL assinada de `materialPhotoUrl` (Etapa 33), nunca arquivo
público; CPF do colaborador é dado pessoal: a ficha mostra, a lista não (registrar em B); `TZ` — a data/hora do PDF no dia de Brasília (a
régua da 170).

**O que NÃO precisa reabrir:** nada da 176 — o recebimento com OS, a reserva da OS e a guarda do dono estão fechados.

---

## Fase 5 — revisão adversarial (2026-10-22)

Revisão independente sobre `c1c04e1b..b1781ad7`, com sonda executada (`sonda.js` no scratchpad da sessão, quatro cenários pela rota). As
correções (TDD, controle positivo na asserção certa, restauro por cópia + `cmp`, um commit por assunto):

- [x] **Importante (reproduzido) — a guarda do dono travava o recebimento de pedido.** A guarda (criação e pré-checagem do processamento,
  `problemasDoDonoComOs`) recusava o recebimento de **pedido** cuja OS estava **fechada** ou **sem cliente** — a 171 aceitava (OS fechada →
  entra como estoque, sem reserva). Um recebimento criado antes da 176 deixava de processar, e o pedido parcialmente recebido travava para
  sempre (`atualizarPedido` bloqueia depois do recebimento). **Correção `cf451bed` (B1152, B1153):** a guarda **recusa só no recebimento SEM
  pedido** (a OS própria, que o almoxarife escolheu) e só com a OS **aberta** (`osAbertaDoRecebimento` na pré-checagem; a criação já exige a
  OS aberta). **Com pedido, a guarda não recusa nunca** — nem OS de outro cliente, nem OS sem cliente: o material entra **livre** e a reserva
  da OS não nasce (item seguinte). **Mais largo que a recomendação da revisão** (que mantinha a recusa de "outro cliente" com pedido):
  recusar a segunda nota de um pedido já parcialmente recebido cai na mesma trava — descartado, registrado em B1153. O teste antigo
  "[RN-176.04 + C1] recebimento de pedido: a guarda do dono usa a OS do pedido" (400) **mudou de lado**: agora 201, processa, sem reserva.
  Testes novos: pedido com OS fechada (de outro cliente) → 201/200, físico 3, reservado 0; pedido com OS aberta sem cliente → idem; recebimento
  "pré-176" (OS trocada depois de criar: pedido cuja OS fechou, pedido cuja OS ficou sem cliente, NF própria cuja OS fechou) processa; e a
  metade que continua recusando (NF sem pedido, OS aberta que ficou sem cliente → 400 no processamento com a frase literal).
- [x] **Importante — a OS troca de cliente por rota (o plano estava errado).** `PUT /api/operacional/ordens-servico/:id` com `cliente_id`
  troca. **Correção `eb82e52b` (B1154):** `reservaDaOs.reservarParaOsSobTrava` (nota, inspeção, NC) relê **sob a trava** o dono do material e
  o cliente da OS (`problemasDoDonoComOs`); não casa → não reserva, o material fica livre e loga
  `[almoxarifado-reserva-os] Nao reservado para a OS …`. A conferência roda **depois** do teto de quantidade (sem livre não há o que conferir —
  evita log de item que já entrou). Teste: item crítico vai à inspeção com a OS do cliente A, a OS passa ao cliente B (por `UPDATE` — a rota
  da OS é core, fora do harness), a inspeção aprova 4 → reserva da OS 0, físico 4, reservado 0.
- [x] **Lacunas de teste** (`cf451bed`, `928f5bd6`): retomada parcial na pré-checagem (o item com `entrada_estoque_em` não entra na guarda —
  simulado por `UPDATE`, a falha no meio não é alcançável pela rota); criação com `tipo_recebimento: NOTA_FISCAL` + `pedido_compra_id` cru (o
  ramo `else osPedido` — o pedido não é resolvido); `/fiscal` com `pedido_compra_id` que não resolve num recebimento com OS própria → 400
  "(sem OS)" (o mesmo ramo no `/fiscal`); inspeção de recebimento com **OS própria** (NF sem pedido) → o aprovado vira reserva da OS (a NC não
  ganhou teste direto com OS própria: a NC passa pela mesma `reservarParaOsSobTrava` e a 171 a cobre com pedido); front (h): escolher a OS 7
  sem pedido → trocar para pedido → voltar → `os_id` `''` e o payload manda `null`.
- **Vermelho antes (TDD):** 6 de 10 novos vermelhos no ponto certo (os 4 de item 1 no status 400 ≠ 201/200, o de item 2 em "sem reserva da OS
  do cliente B 4 !== 0", o `/fiscal` pelo status do recebimento — fixture corrigida para levar até o faturamento); os outros passaram de
  primeira (o código já fazia) e ganharam controle positivo.
- **Controles positivos** (cópia em scratchpad, `md5sum` antes/depois, `cmp` ok ao restaurar, `git diff` só com o conserto):
  S1 sem o filtro `!i.entrada_estoque_em` → só a retomada vermelha (400 com a frase do material 1); S2 `else osPedido = null` na criação → só o
  NOTA_FISCAL+pedido vermelho (`(sem OS)` ≠ o número); S3 `else osPedido = Number(rec.os_id)` no `/fiscal` → só o `/fiscal` vermelho (200 ≠
  400); S4 `osDoRecebimento` sem o `os_id` próprio → 10 vermelhos, incluindo a inspeção com OS própria (`[]` ≠ `[[4, rec, os]]`); S5 sem a
  conferência sob a trava → os 4 de reserva vermelhos ("sem reserva da OS" 2/4/5/4 ≠ 0); S6 a guarda da criação de volta com a OS do pedido →
  os 3 de criação com pedido vermelhos (400 ≠ 201) — **a primeira versão de S6 não sabotava** (`osIdProprio || pedido` passava `osIdProprio`
  nulo à guarda): refeita passando a OS do pedido; S7 a pré-checagem sem o filtro de pedido/OS aberta → os 4 de processamento com pedido
  vermelhos. Front: sem o `os_id: ''` no `onChange` da forma → só o (h) vermelho, na linha do `value` (`'7'` ≠ `''`).
- **Nota sobre os commits:** `cf451bed` leva os testes da Fase 5 inteiros; os de B1153/item 2 só ficam verdes com `eb82e52b` (o commit
  seguinte) — a suíte vale em `eb82e52b`.

**Declarado (não corrigido):** a troca de cliente da OS **depois** de a reserva da OS ter nascido não a solta (D (176)); a `ENTRADA_MANUAL`
com OS não reserva nem tem guarda (D (176), já declarado); a posição por cliente mostra as aplicações brutas (D (176)).

**Suítes:** ver "Verificação do fechamento" no fim.

## Retro da etapa

- **O plano errou duas vezes, e as duas foram pegas por execução:** "a OS não troca de cliente por rota" (havia a rota, e um teste da 155 a
  usava) e "a guarda vale também para o pedido" (a divergência da T1 regrediu a 171 sem nenhum teste vermelho, porque nenhum teste da 171
  recebia material **de cliente** com OS fechada). A sonda pela rota achou o primeiro em quatro cenários; leitura não achou.
- **Guarda na porta de criação é sinal; a proteção é sob a trava.** Toda conferência que depende de dado que muda (dono do material, cliente
  da OS) tem de ser refeita no momento do efeito, sob a trava — a criação e a pré-checagem só dão a mensagem cedo.
- **Sabotagem que passa um valor nulo à função sabotada não sabota** (S6, primeira versão): conferir que o caminho sabotado alcança o efeito,
  não só que a condição mudou.

---

## Revisão da Fase 2 (2026-10-22) — 1 crítico, 4 importantes, 5 menores; as emendas PREVALECEM

- **C1 + I1 — a OS efetiva do recebimento é UMA régua só:** `osDoRecebimento(rec)` = se `rec.pedido_compra_id`
  (o **gravado**, não o `tipo`) → a OS **viva** do pedido (como na 171 — trocar a OS do pedido antes do processamento
  continua valendo); senão → `rec.os_id`. **Recebimento de pedido NÃO grava `os_id` próprio** (fica NULL). Contratos:
  - `POST` com `pedido_compra_id` e `os_id` não nulo diferente da OS do pedido → 400 `A OS do recebimento tem de ser a
    do pedido (<numero_os do pedido ou "sem OS">)`; igual → aceito e **não** gravado.
  - `PUT /recebimentos/:id/fiscal` (`salvarDadosFiscal`, `receiptService.js:1252-1300`) que liga um pedido a um
    recebimento com `os_id` próprio: OS do pedido diferente → 400 com a mesma frase; igual → aceito e o `os_id` próprio
    é **limpo** (passa a valer o do pedido).
- **I2 —** `darEntradaEstoque` (`:1599`) grava na `ENTRADA_COMPRA` o `os_id` de `osDoRecebimento`, não só o do pedido.
  `reservaDaOs.osAbertaDoRecebimento` usa a mesma régua.
- **I3 — a regra do dono na distribuição passa a ver a OS** com a precedência da 174 (projeto primeiro, depois OS):
  `saidaPassaNaRegraDoDono(db, material, projetoId, osId)` nos três chamadores (`reservaChegadaService.js:107-111` e
  `receiptNotificationService.js:378`, `:488`). Cenário obrigatório na T1: requisição da OS **sem projeto, aprovada
  ANTES da nota** do material de cliente → a fila a serve.
- **I4 — a RN-176.04 roda também na pré-checagem de `darEntradaEstoque`** (`:1532-1590`, recusa a nota inteira, mesmo
  texto): o dono pode trocar entre criar e processar (material sem histórico troca sem permissão,
  `ownerRules.js:412-421`). ~~A troca de cliente da OS não tem rota medida — declarado.~~ **ESTAVA ERRADO** (achado da revisão da
  Fase 5): `PUT /api/operacional/ordens-servico/:id` com `cliente_id` troca o cliente da OS (provado em
  `listasNotificacoesPortao.api.test.js:314`). A conferência do dono passou a rodar também **sob a trava**, na criação da reserva da OS
  (`reservaDaOs.reservarParaOsSobTrava`, `eb82e52b`).
- **M1 — a conversão na aprovação** (`requisitionService.js:~369`) passa a conferir o dono com a mesma régua antes de
  converter (projeto do cliente B + OS do cliente A → não converte; a entrega recusaria). 
- **M2 — contratos completos da RN-04:** material de cliente + OS **sem cliente** → 400 `Material <codigo> pertence ao
  cliente <X>, mas a OS <numero_os> não tem cliente` (a saída recusaria: NULL não é coringa, `ownerRules.js:157`);
  qualquer item que falhe recusa a **nota inteira** (como a pré-checagem já faz); `OS inválida` e `OS #<id> não
  encontrada` como na 171; OS que sumiu entre criar e processar → a nota processa e **não reserva** (como a 171 —
  `OS #<id>` na leitura).
- **M3 — contratos de leitura para a T2 (congelados):** `GET /api/almoxarifado/aux/ordens-servico` ganha `?abertas=1`
  (filtro `osFechada` antes do `LIMIT`) e o campo `cliente_id` — aditivo, sem `abertas` nada muda.
  `lerPedidoParaRecebimento` e a lista de pedidos para recebimento (`receiptService.js:~2299`) devolvem `os_id`,
  `os_numero`. A T2 só começa depois da T1.
- **M4 —** `listarRecebimentos` (`:2121`) e `getRecebimento` (`:2906`) ganham `os_id` efetivo e `os_numero` por leitura
  viva separada (`OS #<id>` se sumiu).
- **M5 — RN-06:** `osEncerradaService` passa a reexportar o `PREDICADO_RESERVA_DA_OS` vindo de `reservaDaOs.js`
  (mesmo nome exportado, para não quebrar quem importa).

---

## Execução (2026-10-22)

- [x] **T1** — `c1c04e1b` (regra) + `e79b9718` (leituras, contrato da T2). Teste novo
  `server/tests/api/recebimentoComOs.api.test.js` (22, pela rota): fluxo do cliente (NF sem pedido com OS → `os_id` gravado,
  ENTRADA_COMPRA com a OS, reserva da OS); régua do `os_id` (Zod `Dados inválidos — os_id: OS inválida` na rota e `OS inválida`
  no serviço; `OS #<id> não encontrada`); sem OS nada muda; RN-03; RN-04 (A + OS de B), M2 (OS sem cliente; donos diferentes
  recusam a nota inteira, nada gravado); material próprio passa; I4 (dono trocado entre criar e processar → 400 no
  processamento, nada entra); M2 (OS que sumiu → processa com a marca e não reserva); RN-02/C1 (divergente → 400 com o
  número da OS do pedido ou "sem OS"; igual → 201 sem gravar `os_id`); guarda do dono com a OS do pedido; I1 (OS do pedido
  trocada depois de criar → entrada e reserva na OS nova); `/fiscal` (outra OS / pedido sem OS → 400; mesma → 200 e limpa);
  I3 (requisição da OS sem projeto aprovada **antes** da nota → a fila a serve com 4, a OS fica com 6); requisição criada
  depois converte e entrega (SAÍDA com a OS); M1 (projeto de B + OS de A não converte); a OS que fecha solta; M5; aux
  `?abertas=1`; leituras com `os_numero`.
  **Vermelho antes:** 21/22 (o de I1 já passava — a 171 já lia a OS do pedido viva; fica como guarda de regressão).
  **Controles positivos** (um por vez, restaurado por cópia + `cmp` ok): fila sem `candidato.os_id` → só I3 vermelho (`0 !== 4`);
  conversão sem `donoDeixaConverter` → só M1 vermelho; processamento sem a guarda → só I4 vermelho (200 ≠ 400);
  `osAbertaDoRecebimento` só pelo pedido → 5 vermelhos (reserva 0); `/fiscal` sem limpar → só C1/fiscal vermelho (`os_id: 15`);
  criação sem a OS do pedido → os 2 de RN-02/pedido vermelhos (201 ≠ 400).
  **Primeiro boot** com `CRM_DATA_DIR` vazio (`node index.js`): `recebimentos_material_almoxarifado.os_id INTEGER` criada.
- [x] **T2** — `0d227edb`. `RecebimentosAlmoxarifado.js`: campo "OS (opcional)" (`data-testid="receb-os"`) no novo recebimento,
  select "Sem OS" + OS de `GET /almoxarifado/aux/ordens-servico?abertas=1` (`numero_os — cliente_nome`, ou só o número),
  carregado **ao abrir o modal** (não na montagem — a lista envelhece); falha → aviso discreto (`receb-os-erro`) e o
  recebimento segue sem OS. Sem pedido: `os_id` numérico ou `null`. Com pedido: o campo mostra a OS da linha do pedido
  (`os_id`/`os_numero` de `recebimentos-aux/pedidos-compra`, "Sem OS" se não tem) e fica `disabled`; o payload **não manda**
  `os_id` (escolha: o servidor herda a OS viva do pedido, C1 — mandar a da lista, que pode ter envelhecido, só arriscaria o
  400 da RN-02). Recusas do servidor no alerta do formulário (form não é limpo). Lista: coluna "OS"; detalhe: campo "OS"
  (`os_numero` ou "—", o mesmo vazio das outras colunas). Teste novo `RecebimentosOs.test.js` (7, mock só no `api`).
  **Controles positivos** (restaurados por cópia + `cmp`): sem `Number()` → só (b) vermelho (`"7"` ≠ `7`); sem `disabled`
  com pedido → (c) e (d) vermelhos. Client **176 suítes / 2263 testes** antes do merge da 177 e **176 / 2271** depois dele (HEAD `0d227edb`, sobre `881e4c12`); `CI=true react-scripts build` ok nos dois.
- [x] **T3** — `f5c75c68`. Teste novo `server/tests/api/recebimentoClienteOsPontaAPonta.api.test.js` (2, tudo
  pela rota). **Roteiro 1:** material do cliente A + OS do cliente A → `POST /recebimentos` sem pedido com `os_id` e NF → detalhe
  com a OS → conferir → workflow (compras, faturamento) → `/fiscal` → processar → `ENTRADA_COMPRA` com a OS e reserva da OS de 10
  → requisição pela **cesta** (`POST /api/requisicoes-material`, usuário sem módulo) com `os_id` e **sem projeto** → aprovar
  `TOTALMENTE_RESERVADA` (a OS fica com 2) → separar → entregar 8 (SAÍDA com a OS) → posição do cliente A: saldo 2, recebido 10,
  consumido 8, aplicação `[os, numero_os, projeto null, 8]`; ausente na posição do cliente B → "Consumo por OS" 8/0/8 → devolução
  de 3 para Estoque (herda a OS) → 8/3/5, físico 5. **Roteiro 2:** o mesmo começo (saldo 10, disponível 0) → OS `cancelada` +
  `osEncerradaService.liberarReservasDaOs` → 1 reserva solta, reserva da OS 0, físico 10, disponível 10, dono continua A, ausente
  na posição do B e na `/relatorio/posicao-estoque` (`assertSegregado` com controle do material próprio).
  Passou de primeira (as peças são da T1 e da 174) — **controle positivo:** `osDoRecebimento` sabotado para ignorar o `os_id` do
  recebimento (sem pedido → `null`) → **os 2 vermelhos no ponto certo** (`I2: a ENTRADA_COMPRA grava a OS do recebimento`,
  `null` ≠ id); restaurado por cópia + `cmp` ok. **Nenhum defeito real encontrado.** Nota (não é defeito, já declarado na letra
  D): as aplicações da posição por cliente são brutas (8 depois da devolução de 3); o líquido é do "Consumo por OS".
  Suítes: `test:api` **504/504** arquivos (o novo incluso); `test:almoxarifado` 44/0.

**Suítes (estado de `e79b9718`):** `test:api` 501/502 na primeira rodada — o único vermelho era o contrato de chaves do aux
(`listasNotificacoesPortao`, RN-155.01: fixture `osDoAuxDoServidor.json`), atualizado com `cliente_id` (fixture + teste do
client `ReservasAlmoxarifado.test.js`); depois 10/10 nesse arquivo e, na 2ª rodada (estado de `e79b9718`), **502/502**; `test:almoxarifado` 44/0;
`test:validation` 4/0; `test:safealter` 3/0; `test:sqlite` 16/0; client 175 suítes / 2256 testes. Os testes da 171/172/174 e
`materialCliente*` ficaram verdes sem alteração.

**Divergências do plano:**
- **RN-03 só vale sem pedido.** A nota de pedido cuja OS fechou continua entrando como estoque (RN-171.03/B1101); recusar
  ali regrediria a 171. Com pedido, a OS do payload só é comparada com a do pedido (RN-02).
- ~~**A guarda do dono vale também para recebimento de pedido** (ela usa a OS efetiva, C1): pedido com OS do cliente B
  recebendo material do cliente A → 400 na criação e na pré-checagem.~~ **Revertida na Fase 5 (B1153)** — recusava também o pedido
  cuja OS fechou ou ficou sem cliente (a 171 aceitava) e travava para sempre o pedido parcialmente recebido. Ver "Fase 5".
- **`/fiscal` não aceita `os_id`** (a OS se escolhe na criação); ele só confere/limpa ao ligar um pedido (C1).
- **M2 "OS que sumiu"**: a ENTRADA continua gravando o `os_id` como marca (igual à 171 com pedido) — só a reserva não nasce.
- **Conversão (M1)** usa a mesma pergunta da fila (`saidaPassaNaRegraDoDono` com projeto e OS); requisição só com o texto da
  OS (sem `os_id`) de material de cliente sem projeto deixa de converter — a entrega já recusaria.
- **Mudança de contrato aditiva no aux de OS** quebrou o teste de chaves da 155 (servidor e client) — atualizados, sem mudar
  a tela das Reservas.
- Testes que trocam o dono do material e a OS do pedido fazem por `UPDATE` (o que está em prova é a releitura no
  processamento); a OS fechando chama `osEncerradaService.liberarReservasDaOs` (a rota da OS é core, fora do harness).

**CONTRATO REAL das leituras para a T2 (front):**
- `GET /api/almoxarifado/aux/ordens-servico?abertas=1` → `[{ id, numero_os, status, cliente_id, cliente_nome }]`, só abertas
  (fora de `cancelado|cancelada|concluido|concluida|encerrada`, sem caixa/espaço), `ORDER BY id DESC LIMIT 300`. Sem
  `abertas`: as mesmas chaves, todas as OS. Falha de tabela → `[]`.
- `GET /api/almoxarifado/recebimentos-aux/pedidos-compra` → cada linha ganha `os_id` (number|null) e `os_numero`
  (string|null; `OS #<id>` se a OS sumiu).
- `GET /api/almoxarifado/recebimentos-aux/pedidos-compra/:id` → ganha `os_id`, `os_numero` (mesma regra).
- `GET /api/almoxarifado/recebimentos` e `GET /api/almoxarifado/recebimentos/:id` → `os_id` é o **efetivo** (com pedido, o do
  pedido; sem pedido, o próprio) e `os_numero` vivo (`OS #<id>` se sumiu; `null` sem OS). Atenção: na lista, `os_id` **não** é
  a coluna crua (para recebimento de pedido a coluna é sempre NULL).
- `POST /api/almoxarifado/recebimentos` aceita `os_id` (number, string de dígitos, `null`, `''`). Recusas (400, `error`):
  `Dados inválidos — os_id: OS inválida`; `OS #<id> não encontrada`; `A OS <numero> está <status> — não aceita entrada nova`
  (sem pedido); `A OS do recebimento tem de ser a do pedido (<numero da OS do pedido>|sem OS)` (com pedido e `os_id` não nulo
  diferente — a tela deve mandar a OS do pedido ou nada); `Material <codigo> pertence ao cliente <X>, mas a OS <numero> é do
  cliente <Y>` / `... mas a OS <numero> não tem cliente` (vários itens: unidos por `; `).
- Processar (`POST .../workflow {acao:'processar'}`) pode recusar com `Nao foi possivel dar entrada no estoque: Material ...`
  (I4, mesmo texto da criação depois do prefixo).
- `PUT .../fiscal` com `pedido_compra_id` num recebimento com OS própria: OS do pedido diferente → 400 com a frase da RN-02;
  igual → 200 e a OS própria é limpa.

## Verificação do fechamento (2026-10-22, estado de `3ef8526b` — o código é o de `928f5bd6`; o fechamento só mexe em documento)

- `cd server && npm run test:api` → **504/504 arquivos de teste OK** (`recebimentoComOs.api.test.js` com 31 cenários).
- `cd server && npm run test:almoxarifado` → **44 passou, 0 falhou**.
- `test:validation` **4/0**, `test:safealter` **3/0**, `test:sqlite` **16/0**.
- `cd client && CI=true npx react-scripts test --watchAll=false` → **176 suítes / 2272 testes**, todos verdes (`RecebimentosOs.test.js` com 8).
- `cd client && CI=true npx react-scripts build` → **Compiled successfully**.
- Nenhum clique no navegador (letra F (176)).
