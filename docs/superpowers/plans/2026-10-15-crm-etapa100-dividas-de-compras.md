# Etapa 100 — dívidas declaradas de Compras (G1, G10, G11, G13; G15 avaliada)

> Frente **Compras (core)**, worktree `CRM-wt-e100`, branch `etapa-e100` (de `main` `5f28c044`).
> Design: `docs/superpowers/specs/2026-10-15-crm-etapa100-dividas-de-compras-design.md` (Fase 0
> medida lá — inclui as duas afirmações do doc que **estavam erradas**: G1 "não há teste" e G11
> "não corrigido").

> **Estado (2026-10-15):** 🟢 fechada — T1–T8 feitas; commits na seção "Fechamento". Baseline (`5f28c044`):
> `test:api` 342/342 (medido no início; a rodada pode ter coincidido com a sabotagem da T1 — vale como
> indicativo); client e build não medidos no baseline.

## Regras de negócio

- **RN-100.01 (G1)** `DELETE /api/compras/grupos/:id` desativa o grupo (`ativo = 0`) e responde
  **200** `{ message: 'Grupo desativado' }`; o grupo some de `GET /api/compras/grupos`. Id inexistente
  → **404** `'Grupo não encontrado'`. Cenário: grupo ativo → DELETE → 200 → GET lista sem ele.
- **RN-100.02 (G1)** O genérico `DELETE /api/compras/:tipo/:id` continua respondendo **400
  `'Tipo inválido'`** para tipo fora do mapa (`/api/compras/xyz/1`) — só `grupos` deixa de cair nele.
- **RN-100.03 (G1, B45)** Desativar o grupo **não** mexe em `fornecedores.grupo_id`.
- **RN-100.04 (G1, B46)** Na ficha do fornecedor (`FornecedorForm`), `grupo_id` apontando para grupo
  que não está na lista de ativos aparece como opção **`Grupo desativado (#<id>)`** selecionada (não
  "Sem grupo"); salvar sem mexer preserva o `grupo_id`; escolher "Sem grupo" limpa.
- **RN-100.05 (G10)** Material **novo** (`POST /api/almoxarifado/materiais` e `materialService.createMaterial`)
  com `familia_id` de uma subfamília (`parent_id IS NOT NULL`) → **400** com a literal **L1**:
  `'A família escolhida é uma subfamília — escolha a família principal e use a subfamília no campo Subfamília'`.
  Ordem das recusas em `validateFamiliaAtiva`: não existe (`'Família não encontrada'`) → subfamília (L1)
  → inativa (literal existente).
- **RN-100.06 (G10, B47)** `PUT /api/almoxarifado/materiais/:id`: **mudar** `familia_id` para uma
  subfamília → 400 L1. Material **legado** já gravado com `familia_id = <sub>`: PUT que omite
  `familia_id` ou manda o **mesmo** valor → 200 (continua editável); PUT que muda para a raiz → 200.
- **RN-100.07 (G11)** Sem código novo: o teste RN-38.05 (`MateriaisAlmoxarifado.test.js:439`) já prende a
  correção da Etapa 38 (`0c890f24`). Esta etapa roda o controle positivo dele.
- **RN-100.08 (G13)** O "Exportar Excel" da aba Pedidos ganha, **no fim** (depois de `Dias de atraso`), as
  colunas **`IPI %`** (número, por item; `''` em pedido sem item), **`Frete`**, **`ICMS-ST`** e
  **`Desconto`** (números do cabeçalho, repetidos em cada linha do pedido; vêm do `GET /compras/pedidos/:id`;
  `''` se a leitura do pedido falhar). As colunas existentes não mudam de nome nem de posição.
- **RN-100.09 (G13)** A importação (`POST /api/compras/pedidos/importar`) lê **IPI %** por linha
  (chaves: `ipi %`, `ipi`, `% ipi`, `ipi (%)`, `ipi_percentual`, `ipi percentual`). Número de 0 a 100 →
  gravado no item; célula vazia → 0 sem aviso; outro valor → item entra com IPI 0 e
  `avisos += { linha, campo: 'ipi_percentual', motivo: 'IPI % não reconhecido (use número de 0 a 100)' }`.
- **RN-100.10 (G13)** A importação lê **Frete** (`frete`, `valor_frete`, `valor frete`, `valor do frete`),
  **ICMS-ST** (`icms-st`, `icms st`, `icms_st`, `total_icms_st`) e **Desconto** (`desconto`,
  `total_desconto`, `total desconto`) por **pedido**: vale a primeira linha do grupo com número ≥ 0
  (a planilha repete o valor em cada linha). Valor não numérico ou negativo → `avisos += { linha, campo:
  'valor_frete' | 'total_icms_st' | 'total_desconto', motivo: '<Frete|ICMS-ST|Desconto> não reconhecido (use número maior ou igual a 0)' }`
  e a linha não contribui com esse valor (a linha entra).
- **RN-100.11 (G13, integração)** Pedido com IPI e frete/ICMS-ST/desconto, exportado com as colunas da
  RN-100.08 e reimportado, nasce com o **mesmo `valor_total`** e os mesmos `total_*`.

## Contratos congelados
- `DELETE /api/compras/grupos/:id` — 200 `{ message: 'Grupo desativado' }` | 404 `{ error: 'Grupo não encontrado' }` | 500 `{ error: err.message }`. Gate: `authenticateToken` + `checkModulePermission('compras')` (inalterado).
- `DELETE /api/compras/:tipo/:id` — inalterado (mapa `fornecedores`, `pedidos`, `cotacoes`).
- `POST/PUT /api/almoxarifado/materiais` — novo 400 `{ error: L1 }` (RN-100.05/06). Nada mais muda.
- `POST /api/compras/pedidos/importar` — mesma forma `{ pedidos, itens, ignorados, avisos }`; `avisos[].campo`
  ganha os valores `ipi_percentual`, `valor_frete`, `total_icms_st`, `total_desconto`.
- Cabeçalhos do Excel (contrato entre `Compras.js` e o serviço): `'IPI %'`, `'Frete'`, `'ICMS-ST'`, `'Desconto'`.

## Tasks (todas `galho` — regras disjuntas; executadas em série por um executor, ver retro)
- [x] **T1 (G1 servidor)** `routes/compras.js`: `app.delete('/api/compras/grupos/:id')` sobe para ACIMA do
  genérico; cabeçalho do arquivo corrigido. `comprasPedidosRotas` (4) vira RN-100.01/02/03 (o 400 de
  caracterização vira 200 — dizer no commit). Controle positivo: devolver a rota para baixo do genérico.
- [x] **T2 (G1 cliente)** `FornecedorForm.js` opção "Grupo desativado (#id)" (RN-100.04) + teste.
  Controle positivo: remover a opção.
- [x] **T3 (G10)** `validateFamiliaAtiva` + `parent_id`; testes RN-100.05/06 (POST, serviço, PUT legado
  preservado, PUT mudando para sub). Controle positivo: tirar a checagem; e conferir que o legado não
  depende dela (PUT legado tem de continuar 200 com a checagem ligada).
- [x] **T4 (G11)** controle positivo do teste RN-38.05 (sabotar `familiasKey`) — sem commit de código.
- [x] **T5 (G13 servidor)** `importarPedidos` lê IPI e encargos (RN-100.09/10) + cenários em
  `comprasPedidoImportar.api.test.js`. Controle positivo por regra.
- [x] **T6 (G13 cliente)** `linhaExportPedido` com as 4 colunas (RN-100.08) + teste em `Compras.test.js`.
- [x] **T7 (integração)** RN-100.11: pedido criado pela ROTA com IPI + encargos → `GET /:id` → linhas no
  formato do export (cabeçalhos literais) → `POST importar` → `valor_total`/`total_*` iguais.
- [x] **T8** revisão adversarial (agente fresco) + fechamento (`fechar-etapa`, versão Compras).

## G15 — não feita (decisão registrada)
A correção apontada ("devolver os totais gravados quando existem") só atinge pedido anterior à Etapa 39,
que não tem `total_*` gravados — só `valor_total` cru. Devolvê-lo faria o formulário, o **PDF enviado ao
fornecedor** e o recebimento mostrarem linhas somando um valor e total outro. Para pedido da 39 em
diante, gravado e recalculado são a mesma conta. A dívida fica no doc com este motivo.

## Fase 2 — revisão do plano (agente fresco, 2026-10-15) e o que mudou
O revisor achou **3 altos, 4 médios, 3 baixos**. Aceitos e incorporados como emendas às RN (valem
sobre o texto acima):
- **(Alta 1) G10 deixava o legado sem saída — a B47 afirmava algo falso.** O select de família do
  formulário de material fica **desabilitado na edição** (`MaterialAlmoxarifadoForm.js:635`, "A família
  não pode ser alterada após o cadastro"), então o legado **não** era corrigível pela tela; e os atalhos
  de Sobras/Remessas copiam `familia_id` do material de origem — com origem legada passariam a tomar a
  recusa nova. Emendas:
  - **RN-100.06b** No formulário de edição, quando a família gravada é uma **subfamília** (legado), o
    select de família fica **habilitado** e aparece a nota literal
    `Este material está gravado com uma subfamília no lugar da família — escolha a família principal e depois a subfamília.`
  - **RN-100.06c** Os atalhos "criar material" de Sobras (retalho) e Remessas (resultado da
    transformação), com material de origem legado, criam o novo com `familia_id = <pai>` e
    `subfamilia_id = <sub>` (só se a sub estiver ativa) e pedem o próximo código pela família principal
    (`utils/familiaDoNovoMaterial.js`). Origem no padrão: nada muda.
- **(Alta 2) `numeroDaPlanilha` é leniente** (`'isento, ver NF'` → 0, `'12abc'` → 12, sem aviso). Emenda:
  IPI e encargos usam um leitor **estrito** (`numeroFiscalDaPlanilha`): número; ou texto só com dígitos,
  sinal, separadores pt-BR/ponto, `R$` opcional na frente e `%` opcional no fim; qualquer outra coisa
  → aviso.
- **(Alta 3) Frete duplicado com dois fornecedores na mesma ordem.** O grupo é (ordem, fornecedor);
  RN-100.10 passa a dizer **por grupo** (ordem + fornecedor), lido só das linhas daquele fornecedor.
  Planilha que repete o frete em linhas de dois fornecedores dá frete aos dois pedidos — declarado (D).
  O export do CRM nunca produz isso (um pedido = um fornecedor).
- **(Média 4)** RN-100.04 só mostra "Grupo desativado (#id)" se a lista de grupos **carregou com sucesso**.
- **(Média 5)** `FornecedoresDoGrupo` por URL antiga ainda vincula a grupo inativo; `VariaveisTecnicas`
  edita preservando o id sem mostrar. Declarados (C/D), não corrigidos. **Recusado** o trecho "nenhuma
  tela chama o DELETE": o modal de edição do grupo tem o botão "Remover grupo" (`ModalGrupoComprasForm.js:226`).
- **(Média 6)** Export: os 3 encargos vêm de `detalhe.totais` (0 em pedido legado, nunca NULL);
  `linhaExportPedido(pedido, item, detalhe)`. Alias `ipi` sozinho **removido** (coluna "IPI" em R$ de
  planilha de fornecedor viraria %). Valores diferentes entre linhas do mesmo grupo: vale a primeira, sem
  aviso (declarado).
- **(Média 7)** `PUT /familias/:id` que reparenteia uma raiz com materiais ainda cria legado novo — fica
  como dívida residual (**G10b**), não corrigida aqui (rota do almoxarifado, outra frente em paralelo).
- **(Baixas)** RN-100.01: grupo já desativado → 200 (idempotente). RN-100.11 vale para pedido da Etapa 39
  em diante (o legado G15 reimporta com o total recalculado). Cabeçalho do teste (4) já corrigido.
- T7 depende de T5/T6 (não é galho) — execução em série, sem efeito.

## Execução — o que foi feito em cada task (divergências do previsto incluídas)
- **T1 (G1 servidor)** — rota movida; `comprasPedidosRotas` (4) virou RN-100.01/02/03 com grupo próprio do
  cenário (o `grupoId` do fixture é lido ativo pelo (5)). **Divergência:** a suíte inteira achou uma
  **segunda** caracterização do mesmo defeito que a Fase 0 não listou — `comprasPedidoEditarExcluir` (8)
  também congelava o 400; virou o 200. Controle positivo: tirar a rota de grupos (o pedido cai no
  genérico) → (4) vermelho em "400 Tipo inválido".
- **T2 (G1 cliente)** — `gruposCarregados` + opção "Grupo desativado (#id)". 3 cenários (k). Controles:
  sem a opção → (k)1 vermelho; sem a guarda da lista → (k)3 vermelho.
- **T3 (G10)** — `FAMILIA_E_SUBFAMILIA` + `parent_id` em `validateFamiliaAtiva`; teste novo
  `materialFamiliaSubfamilia.api.test.js` (6). Controles: sem a checagem → 3 vermelhos (POST, serviço,
  PUT mudando); PUT sempre revalidando → o cenário do legado vermelho. **Emenda da Fase 2** (RN-100.06b/c):
  `MaterialAlmoxarifadoForm` destrava o select pela família **gravada** (2 cenários) e
  `utils/familiaDoNovoMaterial.js` (4 cenários) nos atalhos de Sobras e Remessas (1 cenário de tela em
  cada). Controles: select sem a exceção → vermelho; exceção por `form.familia_id` → vermelho no
  "não volta a travar" (**a 1ª tentativa dessa sabotagem não sabotou nada**: o `useMemo` não dependia de
  `form.familia_id`; refeita mudando as dependências); telas com a linha antiga e helper sem o teste de
  `ativo` → 3 vermelhos.
- **T4 (G11)** — sem código; sabotar `familiasKey` derruba o cenário RN-38.05 (1 de 20).
- **T5 (G13 servidor)** — leitura de IPI e encargos. Cenários (11)–(12). Controles (9 sabotagens no total,
  todas vermelhas na asserção certa): sem `ipi_percentual` no item, sem encargos no pedido, leitor
  leniente no lugar do estrito, sem a faixa 0–100, `ipi` sozinho de volta, `%`/`R$` sem tipo, sem o aviso
  de divergência, ponto decimal antes do milhar, "último vence" no lugar de "primeiro".
- **T6 (G13 cliente)** — 4 colunas no fim; (h) com a ordem congelada estendida; (r100) novo. Controles:
  Frete vazio, IPI vazio, Frete lido da linha da **lista** → vermelho.
- **T7 (integração)** — cenário (13): criar pela ROTA com IPI e 3 encargos → `GET` pela rota → linhas no
  formato literal do export → importar → os 6 totais iguais. Derrubado pelas sabotagens 1 e 2 da T5.

## Fase 5 — revisão adversarial final (agente fresco, 2026-10-15)
Sem defeito bloqueante. **6 achados, 6 reais (reproduzidos por sonda), 0 ruído**; 5 corrigidos, 1 declarado:
1. (Média) `%`/`R$` não distinguiam a coluna: `'10%'` no Desconto virava R$ 10; `'R$ 15,30'` no IPI virava
   15,3% — **corrigido**: o leitor recebe o tipo da coluna (`%` só no IPI, `R$` só nos encargos).
2. (Média) encargo com valores diferentes entre linhas do mesmo pedido colapsava calado — **corrigido**:
   aviso `"<Frete|ICMS-ST|Desconto> diferente do da primeira linha do pedido (vale o da primeira)"`.
3. (Baixa) `'1.500'` em texto virava 1,5 no Frete e 1500 no preço da mesma linha — **corrigido**: milhar pt-BR
   primeiro, como `parsePrecoBackend`.
4. (Baixa, não nova) desconto maior que os produtos dá total negativo — **declarado** (o `POST` manual já
   aceitava; a importação só o torna alcançável por planilha).
5. (Teste) o export passava lendo `pedido.totais` da lista — **corrigido**: `totais` só no detalhe do mock.
6. (Teste) "último vence" passava no (12) — **corrigido**: ICMS-ST diferente entre as linhas.
Refutados pelo revisor (conferidos): `'6'` x `6` no `familiaChanged` (o `validate` substitui o corpo pelo
parseado); outros chamadores de `validateFamiliaAtiva`; permissões inalteradas nos dois módulos.

## Fechamento
Commits: ver "Commits" abaixo (preenchido depois do commit). Docs: `docs/compras-novidades-por-etapa.md`
(seção Etapa 100, cabeçalho, A6, B45–B48, G1/G10/G11/G13/G15), `specs/modulo-compras/README.md` (linha 100 +
seção do defeito congelado marcada como corrigida), `specs/modulo-almoxarifado/22-integracoes/README.md`
(nota no "não mudou" da 38). **Não tocados de propósito:** `docs/almoxarifado-manual-do-sistema.md`,
`docs/almoxarifado-guia-etapas-e-testes.md`, `docs/almoxarifado-novidades-por-etapa.md` e
`specs/modulo-almoxarifado/README.md` — a Etapa 99 do almoxarifado roda em paralelo e edita esses
arquivos; a regra nova do material (recusa de subfamília, nota do legado) fica para o integrador enxertar
no manual (texto pronto na seção Etapa 100 do doc de Compras).

## Retro (4 números)
- Rodadas de correção até verde: **2** (a suíte achou a 2ª caracterização do G1; a revisão final, 5 correções).
- Achados de revisão: Fase 2 **10** (3 altos reais — incluindo a B47 que afirmava algo falso —, 7 médios/baixos;
  1 trecho recusado: "nenhuma tela chama o DELETE" estava errado); Fase 5 **6 reais, 0 ruído**.
- Paralelismo: **0 galhos em paralelo** — um executor em série (frentes pequenas; a suíte é um SQLite por
  processo e as sabotagens tocariam os mesmos serviços). Sem retrabalho por paralelismo.
- Defeito escapado: preencher na etapa seguinte de Compras.

## Próxima de Compras: a definir
Candidatas medidas aqui, sem prioridade decidida: **G10b** (`PUT /api/almoxarifado/familias/:id` que dá
`parent_id` a família com materiais — recusar como o `DELETE` já recusa família com itens; rota do
almoxarifado); reativar grupo de fornecedores pela tela; `FornecedoresDoGrupo` por URL de grupo inativo
(hoje vincula); **G15** só se o P.O. aceitar mostrar o total gravado com nota de "pedido anterior à 39".

## Commits (branch `etapa-e100`)
- `f8033192` G1 — rota de grupos acima do genérico + as duas caracterizações viradas + ficha do fornecedor.
- `4b091ff6` G10 — recusa da subfamília, legado editável/corrigível, atalhos de Sobras/Remessas.
- `cef3d856` G13 — export com IPI %/encargos e importação com leitor estrito.
- docs — este plano, o design, `compras-novidades-por-etapa.md`, `specs/modulo-compras/README.md`,
  `specs/modulo-almoxarifado/22-integracoes/README.md`.

**Medido antes dos commits (árvore final):** `test:api` **343/343** (uma rodada concorrente com o jest do
client deu 338/343 por `EADDRINUSE` em porta efêmera — ambiente, não asserção; rodada sozinha 343/343);
`test:almoxarifado` **44/44**; `test:validation` 4/4, `test:safealter` 3/3, `test:sqlite` 5/5; client
**97 suítes / 1512 testes**; `CI=true react-scripts build` **Compiled successfully**.
