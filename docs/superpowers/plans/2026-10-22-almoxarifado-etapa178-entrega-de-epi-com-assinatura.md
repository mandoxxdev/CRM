# Etapa 178 — Entrega de EPI ao colaborador com assinatura na tela (NR-6)

> **Status:** 🟡 em execução (2026-10-22). Emendada da "próxima tarefa detalhada" da Etapa 176 (B1157).
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

*(preencher no fechamento)*

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
