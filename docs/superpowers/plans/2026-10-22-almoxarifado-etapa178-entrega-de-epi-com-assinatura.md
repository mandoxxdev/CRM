# Etapa 178 — Entrega de EPI ao colaborador com assinatura na tela (NR-6)

> **Status:** ✅ FECHADA (2026-10-22) — T1, T2, T3, revisão adversarial (Fase 5) e fechamento; ver "Verificação final" e "Próxima tarefa
> detalhada" (Etapa 180) no fim. *(Era: 🟡 em execução.)* Emendada da "próxima tarefa detalhada" da Etapa 176 (B1157).
> **Origem:** pergunta 3 da usuária de Compras (21/10) e a observação dela: *"é possível utilizar registros eletrônicos
> para comprovar a entrega de EPIs, mas o sistema deve garantir a identificação do colaborador, a integridade dos
> registros e a possibilidade de recuperação das informações, observando as exigências aplicáveis da NR-6. A assinatura
> feita diretamente na tela do tablet deve ser estruturada de modo que ofereça evidências confiáveis do recebimento."*
> **⚠️ Campos deduzidos:** os formulários em papel de EPI da empresa **não chegaram** (o André vai pedir); a planilha
> recebida é de Compras. CA e validade do CA são exigência da NR-6; tamanho e motivo da entrega são deduzidos e
> **opcionais**. Tudo desenhado para trocar campos depois (letra B).
> **Fase 0 (medido):** `AssinaturaCanvas.js` já é componente separado (props `onConfirm(blobPng)`);
> `deliverySignatureService` é amarrado à requisição, guarda nome **digitado** e não tem hash; nenhum hash de
> arquivo/registro existe no projeto; o material **não tem** CA nem validade do CA; colaboradores só são listáveis com o
> módulo Operacional (e a lista traz CPF e salário); o almoxarifado gera PDF no navegador com jsPDF (molde
> `posicaoClientePdf.js`); não existe ação de perfil para EPI; o motor aceita `SAIDA` com justificativa sem OS (a RN-A só
> vale na requisição).

## Regras

| ID | Regra | Cenário / mensagem literal |
|---|---|---|
| RN-178.01 | **Material de EPI**: `materiais_almoxarifado` ganha `ca_numero TEXT` e `ca_validade DATE` (safeAlter). É EPI quem tem `tipo_material_id` com `is_epi = 1` **ou** `tipo_material = 'epi'` **ou** categoria `EPIs` (as três marcas que existem hoje). O cadastro do material edita os dois campos. | — |
| RN-178.02 | **Entregar EPI** = ação de perfil nova `entregar_epi` (ADMINISTRADOR, ALMOXARIFE). | PRODUCAO → 403 do `requirePermission` |
| RN-178.03 | **Colaborador do cadastro, nunca texto livre**: `colaborador_id` obrigatório, existente e com `status` ativo (`LOWER(TRIM(status)) = 'ativo'`). | `Colaborador #<id> não encontrado` / `Colaborador <nome> não está ativo` |
| RN-178.04 | **CA obrigatório e vigente**: material sem `ca_numero` → 400 `EPI <codigo> sem número de CA cadastrado`; `ca_validade` anterior ao dia de Brasília → 400 `O CA <numero> do EPI <codigo> venceu em <dd/mm/aaaa>`. Material que não é EPI → 400 `Material <codigo> não é EPI`. | — |
| RN-178.05 | **Assinatura obrigatória na mesma requisição HTTP** (multipart: imagem PNG ≤ 2 MB + campos). Sem imagem → 400 `A assinatura do colaborador é obrigatória`. | — |
| RN-178.06 | **Baixa de estoque**: `SAIDA` pelo motor (`registrarMovimentacao`, que já pega a trava do material), `documento_vinculado = <numero da entrega>` (`EPI-…`, gerado por `inserirComNumeroUnico`), `justificativa = 'Entrega de EPI a <nome> (<matricula>)'`. Saldo insuficiente → a recusa do motor. **Nenhuma saída sem evidência e nenhuma evidência apontando para entrega que não existe**: a ordem e o desfazer ficam no serviço (se a gravação da entrega falhar depois da saída, estorna a saída pelo motor). | — |
| RN-178.07 | **Evidência (genérica, reaproveitável pelo termo de ferramenta)**: tabela `evidencias_assinatura_almoxarifado` (`contexto`, `contexto_id`, `colaborador_id`, snapshot `colaborador_nome`/`matricula`/`cpf`, `arquivo`, `arquivo_sha256`, `registro_sha256`, `criado_por`, `criado_por_nome`, `criado_em` do servidor em UTC). `registro_sha256` = SHA-256 do JSON canônico (chaves ordenadas) dos campos da entrega + `arquivo_sha256` + `criado_em`. **Append-only no banco**: triggers `BEFORE UPDATE` e `BEFORE DELETE` com `RAISE(ABORT, 'evidencia de assinatura nao pode ser alterada')` nas duas tabelas (evidência e entrega). | UPDATE direto no SQLite → erro |
| RN-178.08 | **Verificação de integridade**: `GET /api/almoxarifado/epi/entregas/:id/verificar` relê o arquivo, recalcula os dois hashes e responde `{ integro: true }` ou `{ integro: false, motivo: 'arquivo alterado' | 'registro alterado' | 'arquivo ausente' }`. | trocar 1 byte do PNG → `arquivo alterado` |
| RN-178.09 | **Ficha de EPI por colaborador (recuperação)**: `GET /api/almoxarifado/epi/ficha/:colaborador_id` → colaborador (sem CPF completo — mascarado `***.***.***-NN`) + entregas (data, EPI, CA, validade do CA, quantidade, tamanho, motivo, quem entregou, URL da assinatura, `registro_sha256`). PDF no navegador (jsPDF, molde `posicaoClientePdf.js`, montador puro testável) com a imagem de cada assinatura e o hash. | — |
| RN-178.10 | **Lista de colaboradores para o almoxarifado**: `GET /api/almoxarifado/aux/colaboradores` → `id, nome, matricula, setor` dos **ativos** (sem CPF, sem salário), sob o portão do módulo almoxarifado. | — |
| RN-178.11 | Campos opcionais deduzidos: `tamanho` (texto ≤ 20), `motivo` (`PRIMEIRA_ENTREGA`, `TROCA`, `PERDA`, `DANO` — inválido → 400 `Motivo inválido`), `observacao` (≤ 500). | — |

## Contratos

- `POST /api/almoxarifado/epi/entregas` (multipart, `requirePermission('entregar_epi')`): campos `colaborador_id`,
  `material_id`, `quantidade` (> 0), `tamanho?`, `motivo?`, `observacao?`, arquivo `assinatura`. 201 →
  `{ id, numero, movimentacao_id, evidencia: { id, arquivo_url, arquivo_sha256, registro_sha256, criado_em } }`.
  Upload órfão limpo em toda saída ≠ 201 (molde `extended.js:1954-1975`).
- `GET /api/almoxarifado/epi/entregas?colaborador_id=&material_id=&de=&ate=` (leitura, portão do módulo).
- `GET /api/almoxarifado/epi/entregas/:id/verificar`, `GET /api/almoxarifado/epi/ficha/:colaborador_id`,
  `GET /api/almoxarifado/aux/colaboradores`.

## Tasks

| # | Task | Tipo |
|---|---|---|
| T1 | Schema (colunas do material, duas tabelas, triggers), ação `entregar_epi`, serviço `epiService.js` + `evidenciaAssinaturaService.js` (genérico), rotas, testes (incluindo trigger que barra UPDATE/DELETE, hash que acusa byte trocado, corrida de duas entregas do último item — a trava do motor decide). | tronco |
| T2 | Front: tela "Entrega de EPI" (colaborador da lista aux, EPI, quantidade, opcionais, `AssinaturaCanvas`), ficha por colaborador com PDF, campos CA/validade no cadastro de material. Mock só na fronteira HTTP. | galho (depois da T1) |
| T3 | Integração: cadastrar CA → entregar com assinatura → ficha → verificar íntegro → adulterar arquivo → verificar acusa. | integração |

## Fora do escopo (letra D)

- Termo de responsabilidade de ferramenta (RN-D) — reaproveitará `evidenciaAssinaturaService`.
- Validade de **uso**/data de troca do EPI e alerta de troca (depende do formulário da empresa).
- Proteção do arquivo da assinatura por login: continua a URL assinada de ~15 min do almoxarifado (mesma das demais
  imagens); a integridade é garantida pelo hash, não pelo sigilo da URL.
- Devolução de EPI.

## Próxima tarefa detalhada

*(Preenchida no fechamento — a seção completa está no fim deste plano: "Próxima tarefa detalhada — Etapa 180".)*

---

## Revisão da Fase 2 (2026-10-22) — 2 críticos, 5 importantes, 4 menores; as emendas PREVALECEM

- **C1 — gravação sem UPDATE:** `criado_em` é gerado **no Node** (ISO UTC) e inserido explícito (sem DEFAULT na coluna);
  o número `EPI-…` é gerado com `gerarNumeroDocumento` **antes** da saída (desvio declarado do contrato de
  `inserirComNumeroUnico`: colisão ~0 e a compensação cobre); ordem: validar → **saída pelo motor** → **entrega +
  evidência num único `db.execEmTransacao`** (`sqliteConcurrency.js:267`; `exec` sem parâmetros → escapar textos) com
  `movimentacao_id` já conhecido → falhou a transação → **estorno de compensação** da saída (`opcoesEstorno.compensacao:
  true`). O JSON canônico usa valores **normalizados** (`Number(...)`, `Q.qtd(...)`); teste de ida e volta (insere, lê,
  recalcula → mesmo hash).
- **C2 — a saída de entrega de EPI não se estorna pelo livro:** `cancelarMovimentacao` recusa antes do claim quando
  `EXISTS (SELECT 1 FROM entregas_epi_almoxarifado WHERE movimentacao_id = ?)` → 400 `Saída de entrega de EPI não pode
  ser estornada pelo livro — a ficha do colaborador continuaria dizendo que recebeu`. Casa pelo **vínculo**, não por
  `documento_vinculado LIKE 'EPI-%'`. A compensação (`compensacao === true`) passa. Teste na T1. A **devolução** que
  cite a saída de EPI também é recusada nesta etapa (mesma frase trocando "estornada pelo livro" por "devolvida") — letra D:
  devolução de EPI é etapa própria.
- **I1 — sem FK em `criado_por`** (a exclusão de usuário, `index.js:4310-4350`, faz UPDATE em toda FK para `usuarios` e o
  trigger abortaria; e reescreveria quem entregou). O harness roda `foreign_keys=0` — declarado.
- **I2 — sem FK para `colaboradores`**; a ficha usa o snapshot da evidência quando o colaborador foi excluído (teste).
- **I3 — EPI com controle de série ou lote → 400 `EPI <codigo> com controle de série/lote não é suportado nesta
  etapa`** (letra B, reversível).
- **I4 — a T1 inclui o backend do cadastro do material** salvando `ca_numero`/`ca_validade` (`routes/almoxarifado.js:582/601`,
  `materialService.js:291/367`, `schemas.js:296`, `camposLidos.js`). `ca_validade` `AAAA-MM-DD` ou vazio; inválida → 400
  `Validade do CA inválida`.
- **I5 — só `image/png`** → senão 400 `A assinatura deve ser uma imagem PNG`.
- **Menores:** quantidade **inteira** > 0 → senão 400 `Quantidade de EPI deve ser inteira`; CPF mascarado só com ≥ 2
  dígitos (`***.***.***-NN` dos dígitos), senão `null`; `epiService` **não** se embrulha em `naTravaDoMaterial` (o motor
  já pega; a compensação roda depois de a saída voltar).

### Contratos congelados para a T2

- `POST /api/almoxarifado/epi/entregas` 201 → `{ id, numero, movimentacao_id, evidencia: { id, arquivo_url,
  arquivo_sha256, registro_sha256, criado_em } }`; 400 com `{ error }` (mensagens literais acima); 403 do
  `requirePermission`.
- `GET /api/almoxarifado/epi/entregas?colaborador_id=&material_id=&de=&ate=` → `[{ id, numero, criado_em,
  colaborador_id, colaborador_nome, matricula, material_id, material_codigo, material_nome, ca_numero, ca_validade,
  quantidade, tamanho, motivo, entregue_por_nome }]` (mais recentes primeiro).
- `GET /api/almoxarifado/epi/ficha/:colaborador_id` → `{ colaborador: { id, nome, matricula, setor, cpf_mascarado,
  excluido: bool }, entregas: [{ ...linha da lista, arquivo_url, registro_sha256 }] }`; colaborador sem entregas e
  inexistente → 404 `Colaborador #<id> não encontrado`.
- `GET /api/almoxarifado/epi/entregas/:id/verificar` → `{ integro: true }` | `{ integro: false, motivo }`; 404
  `Entrega de EPI #<id> não encontrada`.
- `GET /api/almoxarifado/aux/colaboradores` → `[{ id, nome, matricula, setor }]` (ativos, por nome).
- Material (`GET/POST/PUT /materiais`) com `ca_numero`, `ca_validade`; a lista/busca de materiais devolve `is_epi`
  (bool calculado pelas três marcas) para a tela filtrar.

---

## Execução

### T1 (tronco) — ✅ 2026-10-22 — `5d06920b`, `6ee553f3`, `3dfd69ef`

- [x] Schema: `ca_numero`/`ca_validade` (safeAlter); `entregas_epi_almoxarifado` e `evidencias_assinatura_almoxarifado` sem FK
  nenhuma, `criado_em TEXT NOT NULL` sem DEFAULT, triggers `BEFORE UPDATE`/`BEFORE DELETE` → `RAISE(ABORT, 'evidencia de
  assinatura nao pode ser alterada')` nas duas (`schema.js` `ensureEntregaEpi`). 1º boot com `CRM_DATA_DIR` vazio, duas vezes:
  0 erros de schema, tabelas/índices/4 triggers criados. Harness: stub de `colaboradores` (DDL de produção) em `testApp.js` — `5d06920b`.
- [x] Ação `entregar_epi` (ADMINISTRADOR, ALMOXARIFE) — `5d06920b`.
- [x] `evidenciaAssinaturaService.js` (genérico) e `epiService.js` (RN-178.01..11, C1, C2, I2, I3, I5, menores) — `6ee553f3`.
- [x] `cancelarMovimentacao` recusa a saída da entrega (guarda antes do claim **e** `NOT EXISTS` no claim); compensação passa.
  Devolução que cite a saída → 400; a saída sai de `saidas-elegiveis` — `6ee553f3`.
- [x] Cadastro do material (I4) + `is_epi` na lista/busca **e** no `GET /materiais/:id`; `ca_numero`/`ca_validade` em
  `camposLidos.js` **e** no `CAMPOS_LIDOS` do cliente (37 → 39, pedido do coordenador) — `6ee553f3`, `3dfd69ef`.
- [x] Rotas em `extended.js` (multer só `image/png`, 2 MB, `limparUploadOrfaoEm` em toda saída ≠ 201) e `/aux/colaboradores`.
- [x] Testes: `epiEntrega.api.test.js` 29/29, `epiIntegridade.api.test.js` 17/17. Suítes: `test:api` **506/506** arquivos;
  `test:almoxarifado` 44/0; `test:validation` 4/0; `test:safealter` 3/0; `test:sqlite` 16/0; cliente
  `MaterialAlmoxarifadoForm.test.js` 74/74. (A 1ª rodada do `test:api` deu 505/506: `auditLabels` acusou `ENTREGA_EPI` e
  `entrega_epi` sem rótulo — rótulos acrescentados.)
- Controles positivos (sabotar → vermelho na asserção certa → restaurar por cópia + `cmp`): trigger `SELECT 1` → "Missing
  expected rejection"; `verificar` sem o hash do registro → os 5 "registro alterado"; sem as duas guardas do estorno → 200 !== 400;
  **só** sem a guarda de leitura → verde (o claim recusa sozinho); só sem o `NOT EXISTS` do claim → vermelho no teste da janela
  (a 1ª leitura da guarda é forçada a "não viu"); sem a compensação → "a saida nao foi estornada"; sem `cancelado = 0` no INSERT
  da entrega → 201 em vez de 409; sem a guarda da devolução → "mudou enquanto a devolução era gravada"; sem a limpeza do órfão →
  16 vermelhos (corrida 20 !== 10); `<=` no CA → "vence hoje" recusado; quantidade sem `isInteger` → 1.5 dá 201.
  **Declarado:** trocar a saída por `registrarMovimentacaoSemTrava` **não** deixa a corrida vermelha (10/10 verdes) — quem decide
  o último item é o claim guardado do motor, não só a trava. O teste prova "uma 201, uma recusa de saldo, nada órfão", não a trava.
- Os testes embrulham a conexão com `wrapDatabase` para passar pelo `db.execEmTransacao` de produção; o serviço tem fallback
  (`exec` com BEGIN IMMEDIATE/COMMIT/ROLLBACK) para conexão crua.

**Contrato REAL (o que mudou ou foi acrescentado em relação ao congelado — o front depende):**
- `POST /epi/entregas`: 201 exatamente como congelado. Recusas extras além das literais do plano: 400 `O colaborador é
  obrigatório`, `O EPI é obrigatório`, `Material #<id> não encontrado`, `Tamanho deve ter no máximo 20 caracteres`,
  `Observação deve ter no máximo 500 caracteres`; `Colaborador #<id> não encontrado` é **400** no POST (404 só na ficha);
  `Quantidade de EPI deve ser inteira` vale também para 0, negativo e vazio. Arquivo > 2 MB → **413** do módulo (`Arquivo grande
  demais…`), não 400. MIME ≠ PNG → 400 do multer; **bytes** que não são PNG com MIME png → o mesmo 400 `A assinatura deve ser uma
  imagem PNG`. 409 `A saída da entrega <numero> foi estornada enquanto a entrega era gravada — nada foi gravado. Faça a entrega de
  novo.` 500 `Não foi possível gravar a entrega de EPI — a saída do estoque foi desfeita. (<erro>)`.
- `arquivo_url` sai por `materialPhotoUrl` (`/api/uploads/almoxarifado/assinatura-epi-….png?exp=&sig=`).
- `GET /epi/entregas`: chaves exatamente as congeladas; `de`/`ate` `AAAA-MM-DD` (dia de Brasília sobre `criado_em` UTC); valor fora do
  formato é ignorado.
- Ficha: `entregas[]` = as chaves da lista + `arquivo_url` + `registro_sha256`. `excluido: true` usa nome/matrícula/setor da entrega
  mais recente e o CPF (mascarado) da evidência. Colaborador existente sem entregas → 200 com `entregas: []`.
- `is_epi` é **bool** na lista e no detalhe; `ca_numero`/`ca_validade` vêm no objeto (`m.*`). PUT: `ca_validade` `''`/`null` limpa,
  omitido preserva; `ca_numero` é aparado.
- Auditoria: entidade `entrega_epi`, verbo `ENTREGA_EPI` (rótulos "Entrega de EPI").

**Letra B (reversíveis, escolhidos sem consulta):** (1) CA **sem** validade cadastrada passa (a RN-178.04 só recusa vencido) —
alternativa descartada: exigir a validade. (2) conferência dos bytes do PNG além do MIME. (3) janela residual: uma devolução
**avulsa por API** que cite a saída entre a saída e a transação da entrega (ms, exige saber o id) passaria — o INSERT da devolução
tem `NOT EXISTS` da entrega, mas o da entrega não confere devolução; fechar exigiria recusar a entrega depois de a saída já ter sido
devolvida. (4) o hash amarra a evidência à entrega pelo `numero` (o `id` e o `contexto_id` não existem antes do INSERT).

### T3 (integração) — ✅ 2026-10-22 — `2a33f279`, `bc5fa54d`, `6ddecac2`

- [x] `server/tests/api/epiPontaAPonta.api.test.js` **11/11**, tudo pela rota: POST/PUT `/materiais` (CA) → GET `/materiais`
  (`is_epi: true`, `ca_validade` `AAAA-MM-DD`) → ENTRADA por `/movimentacoes` → `/aux/colaboradores` → POST `/epi/entregas` multipart com
  PNG **real** 240×80 RGBA (o hash do arquivo = o do PNG enviado, saldo 10 → 8, `documento_vinculado` = número) → lista (chaves congeladas,
  filtro `de`/`ate` do dia e de ontem) → ficha (`***.***.***-01`, CPF completo não aparece) → GET da `arquivo_url` **sem sessão** (200
  `image/png`, mesmos bytes; sem `sig` ou `sig` trocada → 404) → `/verificar` íntegro → 1 byte trocado → `arquivo alterado` → estorno pelo
  livro → 400 literal → colaborador excluído → ficha pelo snapshot (`excluido: true`) e a assinatura ainda abre; 413 e 400 de MIME com
  `{ error }` e nenhum órfão. Colaborador criado/excluído direto no SQLite (tabela core, sem rota no harness). `EPI_T3_FORMAS=1` imprime as
  formas reais — `2a33f279`.
- Controles positivos (sabotar → vermelho no ponto certo → restaurar por cópia + `cmp`): `verificar` sem comparar o hash do arquivo → só o
  teste do byte trocado; ficha do excluído com `excluido: false` → só o I2; middleware da URL sem conferir a assinatura → `200 !== 404`.
  (A 1ª sabotagem mostrou a falha vazando para o teste seguinte — o byte agora volta num `finally`.)
- [x] **Conferência do front contra o backend real** — campo a campo bate (chaves da lista/ficha, `is_epi` bool, `ca_validade`
  `AAAA-MM-DD`, `criado_em` ISO UTC com ms, `quantidade` número, `cpf_mascarado`, `excluido`, 413/400/409/500 todos `{ error }`, que a tela
  mostra literal). **Duas divergências, corrigidas no front:**
  1. **A `arquivo_url` expira em ~15 min** (`exp − agora = 900 s`, medido) e o "Gerar PDF" buscava as assinaturas pelas URLs da ficha já
     carregada: ficha aberta há mais tempo → 404 → PDF da NR-6 sem nenhuma assinatura, **sem aviso**. Agora o botão relê a ficha antes (URLs
     novas); releitura que falha → erro e nada de PDF; assinatura que não carrega → `toast.warn`. Jest +3 (vermelhos antes: 3 failed) — `bc5fa54d`.
  2. **`entregar_epi` sem rótulo no `permissaoErro` do client** (a T1 criou a ação no servidor): a suíte inteira do client estava vermelha
     em `permissaoErro.test.js` (`semRotulo = ["entregar_epi"]`) — `6ddecac2`.
- Suítes: cliente `CI=true react-scripts test` **2312/2313** (o 1 vermelho era o rótulo acima; `permissaoErro` 9/9 depois; EPI 3 arquivos
  38/38 → 41 com os novos) e `CI=true react-scripts build` **Compiled successfully** (rodado antes do rótulo, mudança só de string).
  **`test:api` incompleto:** o processo foi encerrado pelo sistema por falta de memória da máquina — 429 de 507 arquivos rodaram (428 OK,
  incluindo `epiEntrega` 29/29, `epiIntegridade` 17/17, `epiPontaAPonta` 11/11, `auditLabels`); os 78 de `schemaAlmoxUmaVez` em diante não
  rodaram. `test:almoxarifado` **não rodou** (vinha depois). Rodar os dois de novo com memória livre antes de fechar a etapa.

**Letra B (T3):** o PDF relê a ficha em vez de (descartados) aumentar a validade da URL no servidor (mesma URL de todas as imagens do módulo,
letra D) ou o cliente interpretar o `exp` da URL.

---

## Fase 5 — revisão adversarial (2026-10-22) — 1 crítico, 4 importantes, 3 menores; todos corrigidos

Revisor independente com sondas executadas (`rev-178/sonda.js` no scratchpad da sessão: P1 forja, P2 apagar, P3 devolução no meio, P4
compensação que falha — **as quatro reproduzidas** antes da correção). TDD em todos: o teste novo vermelho na asserção do achado, a correção,
verde, e o controle positivo (sabotar → vermelho na asserção certa → restaurar por cópia + `cmp`).

| # | Achado | Correção | Commit |
|---|---|---|---|
| 1 (crítico, P1/P2) | `registro_sha256` era o SHA-256 **público** do JSON canônico: quem tinha o banco e o disco derrubava o trigger, trocava o PNG, mudava a entrega (qtd 1→5, outro nome), recalculava os dois hashes → `/verificar` "íntegro"; apagar entrega + evidência não deixava rastro | (a) **HMAC-SHA256** com segredo **fora do banco** — `runtimeSecrets.resolveEvidenciaAssinaturaSecret` (env `EVIDENCIA_ASSINATURA_SECRET` ou `evidenciaAssinaturaSecret` no `.runtime-secrets.json` do diretório de dados, gerado e persistido no primeiro uso, o mesmo mecanismo do `jwtSecret`); (b) **cadeia**: `sequencia` (UNIQUE, global) + `hash_anterior` no HMAC, gravação numa fila em memória (`naFilaDaCadeia`: cabeça → elo → HMAC → transação); `/verificar` confere o elo com a anterior e a posterior; rota nova **`GET /epi/cadeia/verificar`** (lacuna = "registro apagado", "elo quebrado", arquivo/registro alterado, "entrega sem evidência", "registro apagado no fim da cadeia" pelo `sqlite_sequence`) | `dcf65ae1` |
| 2 (importante, P3) | devolução citando a saída, gravada na janela saída → transação, deixava a entrega gravar (201) com o material de volta | `AND NOT EXISTS` de devolução viva (`DEVOLUCAO_VIVA_SQL`) no INSERT da entrega → compensação; a compensação pede **`semDevolucaoViva: true`** ao motor (`exigeSemDevolucao` na guarda e no claim de `cancelarMovimentacao`) — sem isso ela estornava por cima da devolução e o físico ia a **11 com 10** de verdade | `4568c917` |
| 3 (importante, P4) | compensação que falhava respondia "a saída do estoque foi desfeita" | desfez → 500 `Não foi possível gravar a entrega de EPI — nada foi gravado: a saída do estoque foi desfeita. Pode tentar de novo. (<erro>)`; não desfez → 500 `Não foi possível gravar a entrega de EPI e a saída do estoque NÃO pôde ser desfeita: a movimentação #<id> (<numero>) ficou registrada sem evidência de entrega. A assinatura foi preservada no servidor. Avise o administrador antes de entregar de novo. (<causa>; <erro da compensação>)` com `preservarArquivo` (a rota não apaga o PNG) | `4568c917` |
| M1 | o 409 "foi estornada, nada foi gravado" valia com o claim provisório | só com `cancelado = 1` **e** `movimento_estorno_id`; senão compensação (que falha → o 500 do item 3); saída viva sem linha gravada e compensação ok → 409 `A entrega <n> não foi gravada — a saída mudou enquanto a entrega era gravada (devolução ou estorno no meio); nada foi gravado: a saída do estoque foi desfeita. Faça a entrega de novo.` | `4568c917` |
| M3 | erro depois do COMMIT apagava o PNG de uma evidência gravada | todo erro pós-commit carrega `preservarArquivo`; 500 `A entrega <n> foi gravada, mas a resposta falhou (<erro>) — confira a ficha do colaborador antes de entregar de novo.` (gancho `depoisDaGravacao` para o teste) | `4568c917` |
| 4 (importante) | a assinatura não identificava quem assinou | `confirmacao_matricula` obrigatória, conferida com o cadastro (sem caixa, pontas e espaços internos; zeros à esquerda contam): `Colaborador <nome> sem matrícula cadastrada — não é possível confirmar a identidade`, `A matrícula informada não confere com a do colaborador`, `O colaborador deve digitar a própria matrícula para confirmar o recebimento`; evidência com `confirmado_por_matricula = 1`, `ip`, `user_agent` (≤ 300) no HMAC | `44f58fd9` |
| 5 (importante) | ficha, lista, verificar, cadeia e `/aux/colaboradores` abertos a todo o módulo (PRODUCAO lia CPF mascarado, matrícula e URL da assinatura) | `requirePermission('entregar_epi')` nas **cinco** leituras (o `/verificar` por id entrou junto — o pedido listava quatro) | `4c4bacbf` |
| M2 | reenvio depois de a resposta se perder duplicava a entrega | `chave_idempotencia` (índice UNIQUE parcial, no HMAC); reenvio com a mesma chave → **200** com o corpo do 201 + `reutilizada: true`, sem saída nova, PNG do reenvio apagado; a busca vem **antes** da conferência de estoque (no último item o reenvio dava "saldo insuficiente"); dois envios iguais em paralelo → o perdedor do UNIQUE compensa e devolve o do vencedor; mesma chave com outro colaborador/EPI/quantidade → 409 `Chave de idempotência já usada em outra entrega`; fora de `^[A-Za-z0-9-]{8,100}$` → 400 `Chave de idempotência inválida` | `d9cd7604` |
| front + M5 | — | campo **Matrícula — digitada pelo colaborador**; o seletor da Nova entrega sem a matrícula (nome (setor)); chave por tentativa (`getRandomValues` sem `randomUUID` — o tablet abre por http no IP), mantida só quando a rede cai sem resposta; mensagens literais do 413 e do 500 da compensação falha; sem `entregar_epi` a tela só avisa e não chama nada; botão **Verificar cadeia** | `853a46ce` |

**Testes novos:** `epiCadeiaHmac` 13/13, `epiCompensacao` 6/6, `epiMatricula` 9/9, `epiLeituras` 6/6, `epiIdempotencia` 7/7; existentes
ajustados: `epiEntrega` 29/29 (o "colaborador sem matrícula entrega" virou 400; PRODUCAO não lê a lista; a frase nova do 500), `epiIntegridade`
17/17 (HMAC no lugar do SHA), `epiPontaAPonta` 11/11 (manda a matrícula e um User-Agent); cliente EPI 3 arquivos **49/49**.

**Controles positivos (todos vermelhos na asserção do achado, restaurados por cópia + `cmp`):** HMAC → SHA público (P1 e o teste do HMAC);
sem a fila (a concorrência dá 500 no UNIQUE da sequência); elos sempre ok (P2 vizinhos e o "quem tem o segredo"); sem o `sqlite_sequence` (a
cauda apagada); sem o `NOT EXISTS` da devolução e sem o `semDevolucaoViva` (P3); a rota apagando sempre (P3, P4, M1, M3); M1 sem
`movimento_estorno_id`; sem a conferência da matrícula (4 cenários); `ip`/`user_agent`/`confirmado_por_matricula` fora do HMAC (os três
cenários do HMAC — o `ok` passou a ser gravado **antes** das asserções do cenário de cima, senão a sabotagem derrubava os três pela asserção
errada); sem a busca antecipada da chave (o último item dá 400 — a busca do catch cobre o reenvio sequencial sozinha, **declarado**); sem a busca
no catch (a corrida dá 500); a rota sem apagar o PNG do reenvio (órfão); no cliente, trocar a chave em todo erro e tirar o bloqueio das
leituras (1 vermelho cada). O item 5 não tem sabotagem separada: o teste foi rodado **vermelho antes** da mudança (200 !== 403) nos quatro perfis.

**Declarados (letra D):** (1) quem tem o banco, o disco **e** o segredo ainda forja — reescrevendo a evidência e todas as posteriores; âncora
externa (exportar a cabeça da cadeia, carimbo de tempo de terceiro) fica para depois; (2) a cauda apagada **junto** com a `sqlite_sequence`
editada escapa; (3) a URL assinada da imagem (~15 min) continua abrindo sem sessão; (4) a matrícula é **confirmação** de identidade, não
senha — quem sabe a matrícula do colega assina por ele; (5) bases de **dev** que já tinham entregas da T1 mostram essas evidências como "fora da
cadeia" / "registro alterado" (SHA antigo) — a etapa não foi publicada antes da Fase 5; (6) o PDF da ficha ainda não imprime "confirmado por
matrícula" nem o IP.

---

## Fechamento (2026-10-22)

**Documentação:** `docs/almoxarifado-novidades-por-etapa.md` (seção "Etapa 178" antes de "Onde estamos"; cabeçalho com a 178 no topo e a 176
em "Também em"; **A107** — ação antes do deploy, o segredo no backup do servidor; **B1160** a **B1169**; **C431** a **C435**; **D (178)**; **F
(178)**; o bullet em "Onde estamos"); spec nova **`specs/modulo-almoxarifado/25-entrega-epi/README.md`** (por que 25 e não 16/05, checklist com
hash, a correção declarada do "SHA-256 garante a integridade") e a linha 25 no mapa; nota na spec 16; guia (cabeçalho e roteiro de 10 passos);
manual (**21-bis. Entrega de EPI**, a linha da permissão em 5.5 e a leitura que ela explica, **Nº do CA / Validade do CA** em 2.4, a recusa no
estorno 6.10 e na devolução 12.2); `docs/DEPLOY_COOLIFY.md` (a variável `EVIDENCIA_ASSINATURA_SECRET` e o backup). Rótulo do PDF da ficha
"registro (HMAC-SHA256)" (era "registro SHA-256", desde a Fase 5 errado). Commits de código do fechamento: `f454d877` (rótulo do PDF) e `8b93b960` (`window.crypto` no lugar de `globalThis` — o eslint acusava erro que derrubaria o build).

### Retro

- **A revisão adversarial achou o crítico que as três tasks não acharam**, e ele estava no **plano** (RN-178.07: "SHA-256 do JSON canônico"):
  hash público não é prova contra quem tem o banco. A suíte da T1 testava "linha alterada → registro alterado" **derrubando o trigger e não
  recalculando o hash** — provava a detecção do descuido, não da forja. Lição: integridade se testa com o atacante que **recalcula**.
- **A compensação genérica do motor (`compensacao: true`) pula a guarda de devolução** — certo para desfazer o próprio evento no mesmo instante,
  errado quando outra porta pode citar a saída no meio. O `semDevolucaoViva` é opt-in; as outras compensações (retalho, transformação) não
  citam saída devolvível e ficaram como estavam (não medido além disso).
- **Controle positivo na asserção errada, de novo:** a primeira sabotagem dos campos do HMAC derrubava os três cenários pelo `ok` não gravado
  (o cenário de cima falhava antes). Corrigido gravando o `ok` antes das asserções.
- **Memória:** a T3 perdeu a rodada do `test:api` por falta de memória; o fechamento rodou as suítes **uma por vez**.
- **Divergências do plano:** o contrato congelado da T2 mudou em três pontos de propósito (Fase 5): `confirmacao_matricula` obrigatória, as
  leituras com `entregar_epi` e o 200 `reutilizada` — todos com a tela ajustada no mesmo turno (`853a46ce`).

---

## Próxima tarefa detalhada — Etapa 180: termo de responsabilidade de ferramenta (RN-D) com a mesma assinatura

> **Número:** 180, não 179 — a 179 não tem commit até este fechamento, mas fica reservada para a outra frente (sessão paralela) para não
> colidir (**B1169**). **Depende dos formulários em papel da empresa** (o termo de responsabilidade e a ficha de EPI); sem eles o texto do
> termo é deduzido e declarado em B, como nesta etapa.

**O que é.** O empréstimo de ferramenta (`POST /api/almoxarifado/ferramentas/:id/emprestar`, `toolService.emprestarFerramenta`, gate
`gerenciar_ferramentas`) passa a colher o **termo de responsabilidade**: o colaborador **do cadastro** (`colaborador_id` obrigatório — hoje é
opcional e `colaborador_nome` é texto livre), a **assinatura** PNG e a **matrícula digitada por ele**, e o **texto do termo versionado** (a
evidência guarda **qual versão** ele assinou).

**O que já está pronto e não se reabre:**
- `evidenciaAssinaturaService` (genérico por `contexto`): `registroHmac`, `naFilaDaCadeia` + `cabecaDaCadeia` (a cadeia é **global** — o termo
  entra na **mesma** sequência das entregas de EPI), `conferirElos`, `verificarCadeia(db, { dir, segredo, camposDe })`, `literalSql`,
  `textoLimpo`, `mascararCpf`, `sha256Arquivo`. Tabela `evidencias_assinatura_almoxarifado` (append-only, `contexto`/`contexto_id`,
  `sequencia` UNIQUE, `hash_anterior`, `confirmado_por_matricula`, `ip`, `user_agent`).
- O segredo: `runtimeSecrets.resolveEvidenciaAssinaturaSecret` e o `segredoDaEvidencia()` de `extended.js` (resolvido no 1º uso).
- O molde completo em `epiService.registrarEntrega`: PNG pelos bytes, `conferirMatricula`, a ordem efeito → transação única na fila da
  cadeia, compensação, `preservarArquivo`, `chave_idempotencia`, os ganchos de teste. A tela: `AssinaturaCanvas`, o campo de matrícula, a
  chave por tentativa (`novaChaveIdempotencia`), `mensagemErroEntrega`.

**Pontos de atenção (medir na Fase 0):**
1. **`verificarCadeia` de `epiService` só monta os campos de `ENTREGA_EPI`** (`camposDe` devolve `null` para outro contexto → "registro
   alterado"). Ao criar o contexto `TERMO_FERRAMENTA`, a verificação da cadeia tem de virar um **registro de montadores por contexto**
   (`{ ENTREGA_EPI: epiService.camposDoRegistro, TERMO_FERRAMENTA: … }`) e a rota da cadeia sair de `/epi/` (ex.: `GET
   /api/almoxarifado/evidencias/cadeia/verificar`, mantendo `/epi/cadeia/verificar` como apelido) — senão o primeiro termo assinado deixa a
   cadeia do EPI "com problema".
2. **O empréstimo não mexe em estoque** (ferramenta é patrimônio — claim de status em `ferramentas_almoxarifado`); a compensação é devolver o
   status a `DISPONIVEL` (já existe no `.catch` do INSERT). O termo tem de entrar **na mesma transação** do empréstimo (hoje são dois comandos
   soltos: claim + INSERT) — reescrever com `execEmTransacao` e a fila da cadeia.
3. **`emprestimos_ferramenta_almoxarifado` não é append-only** (a devolução faz UPDATE `status`/`data_devolucao_real`): o termo é uma linha
   nova (tabela `termos_ferramenta_almoxarifado` append-only, ou só a evidência com `contexto_id = emprestimo_id`), **nunca** trigger no
   empréstimo.
4. **Texto versionado:** `termos_responsabilidade_versao` (id, versão, texto, vigente_desde) append-only; o HMAC inclui `versao` e o SHA-256 do
   texto. Quem edita o texto: `configurar` (ADMINISTRADOR). Sem formulário da empresa → texto deduzido, letra B.
5. **Leituras:** a ficha do colaborador ganha os termos (ou uma ficha própria de ferramentas); restringir como a 178 (`gerenciar_ferramentas`).
6. **Devolução da ferramenta:** assinar também na devolução? (decisão — o formulário dirá; default: não, letra B).
7. Os testes de corrida do empréstimo (`ferramentas*.api.test.js`) e o C252 (auditoria fora do ato) continuam valendo.

**Contrato proposto (congelar na Fase 2):** `POST /ferramentas/:id/emprestar` passa a multipart (`assinatura` PNG + `colaborador_id`,
`confirmacao_matricula`, `data_prevista_devolucao?`, `observacoes?`, `chave_idempotencia?`) → 201 `{ id, termo: { evidencia_id, versao,
registro_sha256, arquivo_url, criado_em } }`; o JSON antigo (sem assinatura) → 400 literal ou aceito com flag de configuração — **decidir na
Fase 2** (reversível, letra B).

## Verificação final (2026-10-22) — medida, uma suíte por vez; INCOMPLETA por falta de memória da máquina

| Suíte | Resultado |
|---|---|
| `test:api` | **INCOMPLETA:** o processo foi encerrado pelo sistema por falta de memória (a máquina tinha ~1,8 GB livres de 32 GB, com o `npm run dev` do André em `projetos\CRM` ocupando). **313 de 512** arquivos terminaram, **0 falha** (nenhum `✗` no log), incluindo os **8 de EPI** (`epiCadeiaHmac` 13, `epiCompensacao` 6, `epiEntrega` 29, `epiIdempotencia` 7, `epiIntegridade` 17, `epiLeituras` 6, `epiMatricula` 9, `epiPontaAPonta` 11); o 314º (`propostaDocumentoDesconto`) foi morto no meio e os 198 seguintes não rodaram. **Não foi reiniciado** (a instrução do sistema foi não reiniciar com a memória curta). |
| `test:almoxarifado` | **44 passou, 0 falhou** |
| `test:validation` / `test:safealter` / `test:sqlite` | **4/0**, **3/0**, **16/0** |
| client | **suíte inteira NÃO rodada** (memória). Rodados com `--maxWorkers=1`: `EpiAlmoxarifado`, `epiEntrega`, `fichaEpiPdf`, `permissaoErro`, `MaterialAlmoxarifadoForm` — **5 arquivos, 132/132**. |
| `CI=true react-scripts build` | **NÃO rodado** (memória). No lugar: `eslint --max-warnings=0` nos arquivos da tela de EPI — achou **um erro real** (`'globalThis' is not defined`, que derrubaria o build com `CI=true`), corrigido em `8b93b960`; depois, 0 erro e 0 aviso. App.js/Layout.js têm avisos **antigos** do eslint puro (variáveis não usadas, de antes desta etapa; a mudança nelas é só comentário). |

**Para fechar a verificação (com memória livre — parar o `npm run dev` antes):** `cd server && npm run test:api`; `cd client && CI=true npx
react-scripts test --watchAll=false`; `cd client && CI=true npx react-scripts build`.

### Verificação completada (2026-10-22, pelo controlador, depois do fechamento `d358fc49`)

Rodadas em sequência, sem outro agente ativo, sobre a main com todas as correções da Fase 5:

| Suíte | Resultado |
|---|---|
| `test:api` | **512/512 arquivos OK** |
| client (`CI=true react-scripts test --watchAll=false`) | **179 suítes / 2324 testes**, todos passando |
| `CI=true react-scripts build` | **Compiled successfully** |

A tabela acima ("INCOMPLETA") fica como registro do que a sessão de fechamento conseguiu medir; esta é a medição que vale.
