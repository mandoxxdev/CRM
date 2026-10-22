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
- [ ] **Campos conferidos com os formulários de EPI da empresa** — os formulários não chegaram (**B1160**); tudo foi desenhado para trocar.
- [ ] **Devolução de EPI** — fora por decisão (**B1167**): precisa de regra própria (para onde vai o EPI usado?).
- [ ] **Validade de uso / data de troca / alerta de troca** — depende do formulário da empresa.
- [ ] **Requisição de EPI** (requisito 5.1) — não pedida nesta rodada; a entrega é avulsa.
- [ ] **EPI com série ou lote** — recusado (**B1161**): a assinatura teria de dizer qual série/lote.
- [ ] **Âncora externa da cadeia** (exportar a cabeça / carimbo de tempo de terceiro) — **D (178)**: quem tem banco + disco + segredo ainda
  forja.
- [ ] **"Confirmado por matrícula" e o aparelho no PDF da ficha** — os dados existem na evidência; o PDF ainda não os imprime (**D (178)**).

## Correção declarada

O plano da etapa (RN-178.07, versão da T1) dizia que `registro_sha256` era o **SHA-256** do JSON canônico e que isso garantia a integridade.
**Estava errado como garantia:** a fórmula era pública, e a revisão adversarial provou a forja (P1) e o apagamento sem rastro (P2). O certo,
desde `dcf65ae1`: **HMAC-SHA256** com segredo fora do banco + cadeia por `sequencia`/`hash_anterior`. O nome da coluna ficou (contrato
congelado da T2). A RN-178.10 dizia "sob o portão do módulo almoxarifado" para `/aux/colaboradores`, e o contrato dizia "leitura, portão do
módulo" para a lista — **mudou de propósito** na Fase 5 (`4c4bacbf`): as leituras exigem `entregar_epi`.

## Fora (letra D da novidades, "(178)")

Ver **D (178)** no documento de novidades — âncora externa, URL assinada de ~15 min, matrícula como confirmação e não senha, devolução de EPI,
validade de uso, série/lote, requisição de EPI, PDF sem a confirmação, evidências de dev anteriores à Fase 5.

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
