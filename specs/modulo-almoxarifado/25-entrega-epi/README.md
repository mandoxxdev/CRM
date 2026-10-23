# Feature 25 — Entrega de EPI ao colaborador com assinatura na tela (NR-6)

> **Status: 🟡 ENTREGUE no escopo da Etapa 178 (2026-10-22, commits `0ef4c130..853a46ce` + o fechamento) — com campos DEDUZIDOS**
> (os formulários em papel de EPI da empresa não chegaram — **B1160**). Falta para 🟢: conferir os campos com os formulários, a devolução
> de EPI, a validade de uso/troca e a âncora externa da cadeia (ver "Fora").
> Plano: `docs/superpowers/plans/2026-10-22-almoxarifado-etapa178-entrega-de-epi-com-assinatura.md` (regras RN-178.01..11, emendas da
> Fase 2, execução T1/T2/T3, **Fase 5 — revisão adversarial** e a próxima tarefa).
> Novidades: `docs/almoxarifado-novidades-por-etapa.md`, seção "Etapa 178", **A107**, **B1160** a **B1169**, **C431** a **C435**, **D (178)**,
> **F (178)**.
>
> **+ Etapa 180 (2026-10-22, `2092806d`, Fase 5 `003de01b`): a cadeia de evidências ficou MULTI-CONTEXTO** — os termos de responsabilidade de
> ferramenta (feature 16) entram na mesma `sequencia`, com o mesmo segredo. Ver a seção "Etapa 180", no fim. O status desta feature não muda.
>
> **+ Etapa 181 (2026-10-22, T1 `3ce1d3a2`, Fase 5 `0e6d5b37`, `e104df3c`): o relatório *EPI por colaborador* lê as entregas desta feature**
> (com `acao: entregar_epi`), e a justificativa da saída da entrega deixou de levar o nome e a matrícula (as antigas, mascaradas na leitura
> para quem não tem `entregar_epi`). Ver a seção "Etapa 181", no fim. O status desta feature não muda.
>
> **+ Etapa 183 (2026-10-22, `b97ee386`, `58f3f24b`, `399d2a0f`, `f4e5ec9f`, `52fdf3df`, Fase 5 `83ae8be0`, `8e79177e`, `21818eef`): a
> ficha (tela e PDF) mostra a matrícula confirmada e o aparelho de cada entrega** — o último `[ ]` do checklist que não dependia da empresa
> (**D (178)**, item 8). Ver a seção "Etapa 183", no fim. O status continua 🟡: o que falta para 🟢 é todo da empresa ou decisão (os
> formulários, a devolução de EPI, a validade de uso/troca, a âncora externa, a requisição de EPI, série/lote).
>
> **+ Etapa 185 (2026-10-22, T1 `b194b38b`, T2 `b76f7146`, T3 `06ef5377`, Fase 5 `9a5f46a0`, `c98036ac`): a tabela do PDF da ficha cabe na
> folha** — cada célula quebra por largura medida, nada é cortado (resolve a **B1208** / **C444**, registradas na 183, defeito da 178). Ver a
> seção "Etapa 185", no fim. O status continua 🟡 (o que falta para 🟢 é o mesmo da 183, todo da empresa ou decisão).

## Por que é uma feature nova (25) e não a 16 nem a 05

O requisito vem de dois lugares do documento de requisitos (`2026-08-02-requisitos-modulo-almoxarifado.md`): **13.1 Tipos de saída —
"Entrega de EPI"** e **5.1 — "Requisição de EPI"**. Nenhuma feature do mapa o tinha:

- a **16 (Ferramentas e calibração)** é **patrimônio emprestável** que volta; o EPI é **consumo** entregue ao colaborador, que não volta pelo
  empréstimo. O que as duas compartilham é a **evidência de assinatura** (`evidenciaAssinaturaService`, genérica por `contexto`) — a 16 vai
  usá-la no termo de responsabilidade (a próxima, Etapa 180);
- a **05 (Separação e picking)** é a saída **da requisição**; a entrega de EPI desta etapa é **avulsa**, no balcão, sem requisição;
- a **24 (Mobilidade)** tem a assinatura **da entrega de requisição** (nome digitado + traço, sem hash) — outro serviço, que esta etapa não
  mudou.

A "Requisição de EPI" (5.1) **não** foi feita: fica registrada aqui como item aberto.

## O que existe hoje

- **Cadastro do material:** `ca_numero` e `ca_validade` (`materiais_almoxarifado`, safeAlter), editáveis no formulário do material; a lista,
  a busca e o detalhe devolvem `is_epi` (bool) pelas três marcas (tipo de material `is_epi = 1`, `tipo_material = 'epi'`, categoria `EPIs`).
- **Entrega** (`POST /api/almoxarifado/epi/entregas`, multipart, ação `entregar_epi` = ADMINISTRADOR/ALMOXARIFE): colaborador do cadastro
  ativo, **matrícula digitada pelo colaborador** conferida com o cadastro, EPI com CA obrigatório e vigente, quantidade inteira, PNG ≤ 2 MB,
  chave de idempotência opcional; saída pelo motor (`documento_vinculado` = `EPI-…`) → entrega + evidência numa transação, na fila da cadeia;
  compensação que respeita devolução viva; mensagens literais no plano.
- **Evidência** (`evidencias_assinatura_almoxarifado`, genérica): snapshot do colaborador, `arquivo_sha256`, **`registro_sha256` = HMAC-SHA256**
  com segredo fora do banco (`runtimeSecrets.resolveEvidenciaAssinaturaSecret`), **`sequencia`** (UNIQUE) + **`hash_anterior`** (cadeia),
  `confirmado_por_matricula`, `ip`, `user_agent`. As duas tabelas são **append-only** (triggers `BEFORE UPDATE/DELETE`).
- **Leituras** (com `entregar_epi`): `GET /epi/entregas`, `GET /epi/entregas/:id/verificar`, `GET /epi/ficha/:colaborador_id`. **Desde a
  180** (ver o fim): `GET /evidencias/cadeia/verificar` (com `/epi/cadeia/verificar` de apelido) e `GET /aux/colaboradores` aceitam
  `entregar_epi` **OU** `gerenciar_ferramentas` — esta linha dizia "todas com `entregar_epi`", **o que deixou de ser verdade na 180**.
- **Tela** `Almoxarifado → Entrega de EPI` (`EpiAlmoxarifado.js`): Nova entrega, Entregas (filtros, verificar, verificar cadeia), Ficha por
  colaborador com PDF (`fichaEpiPdf.js`, jsPDF no navegador).
- O estorno pelo livro e a devolução da saída de uma entrega são **recusados** (casam pelo vínculo `movimentacao_id`).

## Checklist

- [x] CA e validade do CA no material, com `is_epi` na lista/detalhe — `6ee553f3`, `3dfd69ef`, tela `674c05a1`
- [x] Ação de perfil `entregar_epi` (ADMINISTRADOR, ALMOXARIFE) — `5d06920b`; rótulo no client `6ddecac2`
- [x] Schema append-only (duas tabelas, quatro triggers, sem FK — I1/I2) — `5d06920b`
- [x] Entrega com assinatura PNG, saída pelo motor, transação única e compensação — `6ee553f3`
- [x] Saída da entrega não se estorna pelo livro nem se devolve (C2) — `6ee553f3`
- [x] Verificação de integridade por entrega — `6ee553f3`; com os elos da cadeia — `dcf65ae1`
- [x] Ficha por colaborador (CPF mascarado, snapshot do excluído) e PDF que relê a ficha — `6ee553f3`, `674c05a1`, `bc5fa54d`
- [x] Lista de colaboradores ativos sem CPF/salário — `6ee553f3`; restrita a `entregar_epi` — `4c4bacbf`
- [x] Integração ponta a ponta pela rota com PNG real — `2a33f279`
- [x] **Fase 5:** HMAC com segredo fora do banco + cadeia + `GET /epi/cadeia/verificar` — `dcf65ae1`
- [x] **Fase 5:** devolução na janela e compensação que diz a verdade (e preserva o PNG) — `4568c917`
- [x] **Fase 5:** matrícula digitada pelo colaborador, IP e user agent no HMAC — `44f58fd9`
- [x] **Fase 5:** as cinco leituras restritas a `entregar_epi` — `4c4bacbf`
- [x] **Fase 5:** idempotência por `chave_idempotencia` — `d9cd7604`
- [x] **Fase 5:** tela com a matrícula, a chave, as mensagens e Verificar cadeia — `853a46ce`
- [x] **Relatório *EPI por colaborador*** lê as entregas (14 colunas, filtros colaborador/EPI/período, `entregar_epi`) — `3ce1d3a2`; a coluna
  Assinatura filtra a evidência pelo contexto — `e104df3c` (Etapa 181)
- [x] **A saída da entrega não diz quem recebeu no histórico** (`Entrega de EPI <numero>`; antigas mascaradas sem `entregar_epi`) — `0e6d5b37`
  (Etapa 181)
- [ ] **Campos conferidos com os formulários de EPI da empresa** — os formulários não chegaram (**B1160**); tudo foi desenhado para trocar.
- [ ] **Devolução de EPI** — fora por decisão (**B1167**): precisa de regra própria (para onde vai o EPI usado?).
- [ ] **Validade de uso / data de troca / alerta de troca** — depende do formulário da empresa.
- [ ] **Requisição de EPI** (requisito 5.1) — não pedida nesta rodada; a entrega é avulsa.
- [ ] **EPI com série ou lote** — recusado (**B1161**): a assinatura teria de dizer qual série/lote.
- [ ] **Âncora externa da cadeia** (exportar a cabeça / carimbo de tempo de terceiro) — **D (178)**: quem tem banco + disco + segredo ainda
  forja.
- [x] **"Confirmado por matrícula" e o aparelho na ficha — tela e PDF** (Etapa 183): `GET /epi/ficha/:colaborador_id` devolve
  `confirmado_por_matricula` e `user_agent` da evidência (sem o `ip`) — `b97ee386`; o descritor (`matriculaConfirmadaTexto` com a
  matrícula **da entrega**) — `58f3f24b`; o PDF imprime as duas linhas — `399d2a0f`, quebradas por largura e com a página pela altura
  medida — `83ae8be0`, e a assinatura abaixo delas — `8e79177e`; as duas colunas na tela — `f4e5ec9f`; integração pela rota e pelo serviço,
  com a fixture do client — `52fdf3df`, com um User-Agent real de 197 caracteres — `21818eef`.
- [x] **A linha da entrega no PDF da ficha cabe na folha — nada é cortado** (Etapa 185, **B1208**/**C444**): colunas medidas
  (x = 14, 32, 82, 102, 121, 131, 143, 168), célula quebrada por palavra com a linha aparada à direita, altura da entrega com `4·n`, topo da
  ficha quebrado por largura — `b194b38b`; integração pela tela com a fixture real da rota — `06ef5377`; teste do aparar (emenda M1) —
  `c98036ac`. O termo de ferramenta (feature 16) — `b76f7146`, `9a5f46a0`.

## Correção declarada

O plano da etapa (RN-178.07, versão da T1) dizia que `registro_sha256` era o **SHA-256** do JSON canônico e que isso garantia a integridade.
**Estava errado como garantia:** a fórmula era pública, e a revisão adversarial provou a forja (P1) e o apagamento sem rastro (P2). O certo,
desde `dcf65ae1`: **HMAC-SHA256** com segredo fora do banco + cadeia por `sequencia`/`hash_anterior`. O nome da coluna ficou (contrato
congelado da T2). A RN-178.10 dizia "sob o portão do módulo almoxarifado" para `/aux/colaboradores`, e o contrato dizia "leitura, portão do
módulo" para a lista — **mudou de propósito** na Fase 5 (`4c4bacbf`): as leituras exigem `entregar_epi`.

**Etapa 183 — a frase do D (178), item (8), estava errada.** Ela dizia que o PDF não imprimia a confirmação nem o aparelho *"(a tela de
verificação e a cadeia usam esses dados)"*. **Estava errado** como descrição do sistema: a verificação e a cadeia **usam esses dados no
cálculo** do HMAC (`camposDoRegistro`), mas **nenhuma tela os mostrava** — nem a ficha na tela, nem a lista, nem a verificação (`user_agent`
não aparecia em nenhum arquivo de `client/src`, medido na Fase 0 da 183). O plano da 183 atribuiu a frase a esta spec; ela estava só no
documento de novidades (D (178)), onde também foi corrigida, dizendo. O certo, desde a 183: a **ficha** (tela e PDF) mostra os dois; a
verificação e a cadeia continuam só calculando.

**Etapa 185 — a B1208 e a C444 (Etapa 183) nomeavam o defeito só em *Entregue por* e no EPI; estavam incompletas.** A medida da Fase 0 da 185
achou também o **Motivo** — perda de texto num valor fixo e comum (*Primeira entrega* → *Primeira entreg*, em toda primeira entrega) — e a
invasão da coluna vizinha em **Tam.** (até 20 caracteres no servidor) e **CA** (texto livre) nos casos raros. Corrigido nos dois documentos,
dizendo (a B1208 e a C444 marcadas resolvidas na 185, com as quatro colunas).

## Fora (letra D da novidades, "(178)")

Ver **D (178)** no documento de novidades — âncora externa, URL assinada de ~15 min, matrícula como confirmação e não senha, devolução de EPI,
validade de uso, série/lote, requisição de EPI, ~~PDF sem a confirmação~~ (resolvido na 183), evidências de dev anteriores à Fase 5.
Da 183: **D (183)**.
Da 185: **D (185)** (entrega mais alta que uma página e nome de colaborador de milhares de letras ainda passam da folha; remessa e
posição do cliente fora, **B1220**).

## Etapa 180 — a cadeia ficou multi-contexto (2026-10-22)

- `evidenciaAssinaturaService.registrarContexto(contexto, { montador, extras })`: cada dono de contexto (`ENTREGA_EPI`, aqui; `TERMO_FERRAMENTA`,
  feature 16) registra como remontar o registro dele e os controles que só ele vê. `verificarCadeia` usa o montador **do contexto da linha**;
  contexto sem montador → `contexto desconhecido` (não "registro alterado"). O EPI registra os extras dele (`entrega sem evidência`, cauda
  apagada da tabela de entregas). `2092806d`. **Antes:** `epiService.verificarCadeia` montava só o registro de EPI e devolvia `null` para outro
  contexto — um termo de ferramenta gravado na cadeia faria o EPI acusar "registro alterado".
- **Fase 5 (`003de01b`):** a verificação carrega os donos conhecidos (`DONOS_DE_CONTEXTO`) antes de percorrer — um script que carregasse só o
  `epiService` via os termos como `contexto desconhecido`. Teste por processo filho em `evidenciaMultiContexto.api.test.js`.
- Rota `GET /api/almoxarifado/evidencias/cadeia/verificar` (`requireAlgumaPermissao(['entregar_epi', 'gerenciar_ferramentas'])`); o apelido
  `/epi/cadeia/verificar` passou a aceitar as duas também (divergência registrada no plano da 180, T1). A tela de EPI chama a rota nova.
- **Prova de que o EPI não mudou:** os 8 `epi*.api.test.js` verdes **sem mudança de asserção** depois da T1.
- Motivos novos que a cadeia pode listar (vindos dos termos): `termo sem evidência`, `texto do termo alterado`, `termo apagado no fim da tabela`,
  `empréstimo reapontado`.

## Etapa 181 — o relatório lê as entregas, e o histórico não diz quem recebeu (2026-10-22)

- **`epi-colaborador`** (`reportService.relatorioEPIPorColaborador`, `reportRegistry.js`): SELECT próprio sobre `entregas_epi_almoxarifado` —
  `criado_em` em `AAAA-MM-DD HH:MM:SS` (a tela e a planilha mostram Brasília), número, colaborador, matrícula, setor, código, EPI, CA, validade
  do CA, quantidade, tamanho, motivo por extenso, `entregue_por_nome`, `tem_evidencia` *Sim*/*Não* por `EXISTS` na evidência
  `contexto = 'ENTREGA_EPI'` (sem recalcular hash — **B1187**). Filtros pelo helper `epiService.filtroDasEntregas` (o mesmo de
  `listarEntregas`): `colaborador_id` (select, `/aux/colaboradores` — só ativos, **B1183**), `material_id` (número, **B1184**), `de`/`ate` no dia
  de Brasília. `acao: 'entregar_epi'` (**B1182**). `3ce1d3a2`; teste `relatorioEpiPorColaborador.api.test.js` (12, com o cenário
  `TERMO_FERRAMENTA` da Fase 5 — `e104df3c`).
- **A justificativa da saída** (`epiService.registrarEntrega`): era `Entrega de EPI a <nome> (<matrícula>)` e saía para qualquer usuário do
  módulo pelo histórico (sete leituras: `GET /movimentacoes`, `/materiais/:id/historico`, `/materiais/:id/extrato`, `/dashboard`,
  `/relatorio/movimentacoes-periodo`, o dispatcher de relatórios e a exportação). Agora é `Entrega de EPI <numero>`; as antigas ficam no banco e
  são mascaradas na leitura sem `entregar_epi` (`services/almoxarifado/mascaraEntregaEpi.js`) — *"Entrega de EPI (dados do colaborador
  restritos)"* (**B1185**). A justificativa **não** entra no HMAC (`camposDoRegistro` leva o `movimentacao_id`). `0e6d5b37`; teste
  `historicoEntregaEpiMascara.api.test.js` (7).
- Fora: **D (181)**. Plano: `docs/superpowers/plans/2026-10-22-almoxarifado-etapa181-relatorio-epi-por-colaborador.md`. Novidades: seção
  "Etapa 181", **B1180** a **B1188**, **C440** a **C442**.

## Etapa 183 — a ficha mostra a matrícula confirmada e o aparelho (2026-10-22)

- **Servidor** (`epiService.fichaDoColaborador`): o SELECT ganha `v.confirmado_por_matricula, v.user_agent` da evidência
  `contexto = 'ENTREGA_EPI'` (o `LEFT JOIN` que já existia); o `map` normaliza `confirmado_por_matricula` para `1 | null` (número) e
  `user_agent` para `string | null`. **O `ip` não sai** (**B1202**). Cada entrega da ficha tem exatamente
  `[...CHAVES_LISTA, 'arquivo_url', 'registro_sha256', 'confirmado_por_matricula', 'user_agent']` — mudança de contrato intencional
  (`epiPontaAPonta.api.test.js` ajustado). Rota e permissão (`entregar_epi`) sem mudança. `b97ee386`; teste `epiFichaConfirmacao.api.test.js` (10).
- **Descritor** (`client/src/utils/fichaEpiPdf.js`, `montarFichaEpi`): `matriculaConfirmada` pelo **mesmo** `matriculaConfirmadaTexto` do termo
  de ferramenta, com a matrícula **da entrega** (`e.matricula`, a fotografia do ato, no HMAC) — não a do cadastro de hoje (**B1200**);
  `aparelho` literal, aparado, `Não registrado` quando falta (**B1203**, **B1204**). `58f3f24b`.
- **PDF** (`gerarFichaEpiPdf`): depois do registro HMAC de cada entrega, fonte 7, *"Matrícula confirmada pelo colaborador: …"* e *"Aparelho:
  …"* (linhas seguintes recuadas). `399d2a0f`. **Fase 5 (`83ae8be0`):** as duas linhas quebram por **largura medida** (o aparelho por
  caractere — a junção é o texto gravado —, a matrícula por palavra) e a página quebra pela **altura medida** da entrega (`y + altura ≤ 287`),
  não mais pelo limiar fixo 235 nem por fatias de 110 caracteres (**B1207**). Assinatura sempre abaixo do texto — `8e79177e`.
- **Tela** (`EpiAlmoxarifado.js`, aba Ficha): colunas **Matrícula confirmada** e **Aparelho** (40 caracteres + `…`, o texto inteiro no
  `title`), lidas do mesmo descritor do PDF (**B1201**). `f4e5ec9f`.
- **Integração** (`epiFichaConfirmacaoIntegracao.api.test.js`, 6): entrega pela rota → ficha → `/verificar` íntegro → cadeia íntegra → 403 de
  PRODUCAO; o serviço igual ao corpo da rota; a fixture versionada `client/src/utils/__fixtures__/fichaEpi.rota.json` conferida contra a
  resposta real (chaves, tipos, sem IP e com o mesmo aparelho). `52fdf3df`, UA real de 197 caracteres `21818eef`.
- Fora: **D (183)**. Plano: `docs/superpowers/plans/2026-10-22-almoxarifado-etapa183-ficha-epi-com-matricula-e-aparelho.md`. Novidades:
  seção "Etapa 183", **B1200** a **B1209**, **C444**.

## Etapa 185 — a tabela do PDF da ficha cabe na folha (2026-10-22)

- **Desenho** (`client/src/utils/fichaEpiPdf.js`, `gerarFichaEpiPdf`): `COLUNAS = [14, 32, 82, 102, 121, 131, 143, 168]` (eram 14, 34, 86, 106,
  128, 140, 154, 176), útil até 1 mm antes da coluna seguinte (a última até 196) — **B1216**; cada célula por `splitTextToSize` (quebra por
  palavra, palavra maior que a coluna partida por caractere; nenhuma letra perdida — **B1215**, **B1217**), com a linha aparada à direita
  (emenda M1); a linha j em `y + 4·j`, a altura da entrega `4·n + 3·(conf + aparelho) + 2 + (25 | 8)` e a régua de página da 183 (`y + altura ≤
  287`) com o `4·n`; o topo (título, nome, setor, aviso de excluído) quebra por largura (**B1218**). `b194b38b`. Some o corte por contagem
  (`slice(0, larguras[i] * 1.4)`).
- **Descritor** (`montarFichaEpi`): **não mudou** (os textos já eram inteiros). API, HMAC e a tela da ficha: sem mudança.
- **Medido** (jsPDF real, `p185-sonda-pos.js`): *Entregue por* 214,0 → **195,4** mm (limite 196); EPI 95,4 → **80,6** (81); CA 127,8 → 99,9
  (101); Tam. 155,6 → 140,5 (142); Motivo *Primeira entrega* inteiro, 166,3 (167); junção = texto em 43/43 casos.
- **Testes:** `fichaEpiPdf.test.js` (réguas `textosForaDaFolha` em toda fonte, `celulasInvasoras` e `celulasDaEntrega` pelo recorte por
  **ordem** das chamadas — emenda I1), `EpiAlmoxarifado.test.js` (a ficha pela tela com a fixture real `fichaEpi.rota.json`, `06ef5377`); Fase 5:
  o aparar da M1 com teste e controle (`c98036ac`).
- Fora: **D (185)**, **B1220** (remessa e posição do cliente — a próxima, **B1222**). Plano:
  `docs/superpowers/plans/2026-10-22-almoxarifado-etapa185-tabela-da-ficha-epi-dentro-da-folha.md`. Novidades: seção "Etapa 185", **B1215** a
  **B1222**, **C445**, **C447**, **C444** resolvido.
