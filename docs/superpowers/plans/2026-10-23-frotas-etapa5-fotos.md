# Frota — Etapa 5: foto da avaria e do cupom (D1)

> **Status:** em execução (2026-10-23).
> **Origem:** "Próxima tarefa detalhada" do [plano da Etapa 4](2026-10-23-frotas-etapa4-relatorios.md) (B54).
> **Spec:** [`specs/modulo-frotas/17-fotos/README.md`](../../../specs/modulo-frotas/17-fotos/README.md) (criada no fechamento) e o mapa
> [`specs/modulo-frotas/README.md`](../../../specs/modulo-frotas/README.md) (D1).
> **Decisões tomadas sem consulta (reversíveis):** [`docs/frotas/novidades-por-etapa.md`](../../frotas/novidades-por-etapa.md), letra B
> (B55+).

## Objetivo

O motorista marca uma avaria ("lado esquerdo: amassado") sem poder mostrar, e o abastecimento entra sem o cupom — o escritório continua
pedindo a foto por fora (WhatsApp). Esta etapa põe a **foto** no registro (saída, retorno, inspeção) e no abastecimento, tirada na hora
pelo celular, e o gestor a vê na lista.

## Fase 0 — medido antes de prometer

- **Não há upload no Frota.** `routes/frotas.js` é registrado em `server/index.js` (~22552) com `(rotasModulos, db, authenticateToken,
  checkModulePermission)`; o almoxarifado recebe `PERSISTENT_DATA_DIR` e cria os próprios multers (`routes/almoxarifado.js` ~231-300).
- **Upload seguro já existe para reaproveitar:**
  - `services/almoxarifado/urlUpload.js`: `criarAssinadorUpload(segredo, { prefixo, dominio, minutos, baldeMinutos })` (HMAC com o nome
    do arquivo, `exp` em balde, teto, **404 em toda falha**), `extensaoSegura(mime)` (extensão do MIME aceito, nunca do nome),
    `cabecalhosUploadSeguro` (`nosniff`, CSP `default-src 'none'; sandbox`, `private`).
  - `services/uploadsAssinadosCrm.js`: `PASTAS` (prefixo + domínio próprio por pasta) — a pasta nova entra aqui.
  - `services/imagemUpload.js`: `multerComLimiteNoErro` (anexa `limiteBytes`), `erroFormatoImagem`/`tratarErroFormatoImagem` (400
    `Formato de imagem não suportado`), `tratarArquivoGrandeDemais` (413 `Arquivo grande demais (máximo N MB)`). Os dois handlers estão
    montados em `/api` **depois** do `rotasModulos` no `index.js` (~22433-22440), mas **não** no harness do Frota.
  - Padrão do almoxarifado: `requirePermission` **antes** do multer (403 não deixa arquivo), órfão apagado em toda saída ≠ 2xx, mount
    assinado + `express.static({ index:false, dotfiles:'deny' })` + **fecho 404**.
- `config/paths.js`: as pastas moram em `<PERSISTENT_DATA_DIR>/uploads/<nome>`; nenhum `express.static` serve a raiz `uploads/` (medido:
  só subpastas nomeadas). O backup (`backupPackage.deveIncluirNoBackup`) leva `uploads/` inteiro.
- Registro do portal = linha de `frotas_checklists` (B1); abastecimento = `frotas_abastecimentos`. Exclusão de ambos é **física**
  (`deleteChecklist`, `deleteAbastecimento`; só o gestor, `gerenciar_veiculos`); nenhum outro `DELETE` nessas tabelas no código.
- Escopo: `escopoDoUsuario` = `null` para ADMIN_FROTA/CONSULTA; senão `{ motoristaId }` (sem vínculo → listas vazias, escrita 409
  `MOTORISTA_NAO_VINCULADO`). `conferirDonoPorMotorista` → 403 `Você só pode alterar os seus próprios registros`. As listas
  `listChecklists`/`listAbastecimentos` e `portalService.meusRegistros` são os três pontos de leitura.
- Front: `FrotasPortalMotorista.js` (`RegistroForm`, `AbastecimentoForm`, `MeusRegistros`); gestor: `frotasEntityConfigs.js`
  (colunas com `render`), `checklists` e `abastecimentos`. Não há helper de reduzir imagem no `client/src` (medido: nenhum `toBlob` fora
  da assinatura) nem `capture=` em lugar nenhum.

## Regras de negócio

| RN | Regra | Cenário |
|---|---|---|
| RN-F5.01 | Tabela `frotas_anexos`; **até 3 fotos** por registro ou abastecimento. O teto é conferido **no mesmo comando** que grava (`INSERT … SELECT … WHERE EXISTS(lançamento) AND (contagem) < 3`) — envios simultâneos não passam de 3 | 4 envios em paralelo no mesmo registro → três 201 e um 409 |
| RN-F5.02 | Só **JPEG, PNG ou WEBP**, até **10 MB**. O tipo é conferido pelo MIME declarado **e** pelos primeiros bytes do arquivo (assinatura do formato); a extensão em disco vem do MIME (`extensaoSegura`), nunca do nome; nome do arquivo aleatório (`frota-<hex 24>.<ext>`) | `foto.html` declarado `image/png` com conteúdo HTML → 400 `Formato de imagem não suportado`; GIF → 400 |
| RN-F5.03 | Envia quem tem `registrar_operacoes` (ADMIN_FROTA, MOTORISTA). O MOTORISTA só no lançamento cujo `motorista_id` é o do vínculo dele; o gestor em qualquer. CONSULTA → 403 | Bruno anexando no registro da Ana → 403 `Você só pode alterar os seus próprios registros` |
| RN-F5.04 | Recusa não deixa arquivo: o 403 do perfil vem **antes** do multer; toda outra recusa apaga o arquivo recebido | depois de 403/400/404/409, a pasta continua com os mesmos arquivos |
| RN-F5.05 | Leitura: `GET /checklists`, `GET /abastecimentos` e `GET /portal/meus-registros` trazem `anexos: [{ id, url, tipo_mime, tamanho, created_at }]` (ordem `id ASC`) em **toda** linha (`[]` sem foto); a URL é **assinada**. O escopo é o das listas (RN-F1.14): o motorista só recebe URL das fotos dos lançamentos dele | Consulta vê as fotos de todos; Bruno não recebe nenhuma URL da Ana |
| RN-F5.06 | Servir: só `GET /api/uploads/frotas-anexos/<arquivo>?exp=&sig=` com assinatura válida do **domínio próprio** (`frotas-anexos-v1`) — assinatura de outra pasta, nome trocado, vencida, sem `sig`, `..` → **404** (nunca 401/403); `nosniff` + CSP `sandbox`; validade **120 min** + balde de 30 | URL de avatar com o nome da foto → 404 |
| RN-F5.07 | Apagar foto: `DELETE /anexos/:id`, mesma régua de quem envia (RN-F5.03); apaga a linha e o arquivo | Ana apaga a foto errada do registro dela; a URL velha passa a 404 |
| RN-F5.08 | Excluir registro ou abastecimento (gestor) apaga as fotos dele (linhas e arquivos) — sem órfão | excluir o abastecimento → `frotas_anexos` sem linha dele e o arquivo some |
| RN-F5.09 | Tela do motorista: **Tirar foto** (`<input type="file" accept="image/*" capture="environment">`) na Saída/Retorno/Inspeção e no Abastecimento; até 3 por lançamento, com miniatura e **Remover foto** antes de salvar. A foto acima de 1 MB é **reduzida no navegador** (lado maior 1600 px, JPEG 0,8); se o navegador não conseguir, vai a original. As fotos sobem **depois** do 201 do lançamento; falha da foto **não desfaz** o lançamento (aviso) | sem internet na hora da foto → o registro fica salvo e o aviso diz que a foto não foi |
| RN-F5.10 | Meus registros: miniaturas de cada lançamento (abrem a foto em outra aba) e **+ Foto** enquanto houver menos de 3 | a foto que falhou é reenviada por aqui |
| RN-F5.11 | Gestor: coluna **Fotos** (miniaturas, abrem em outra aba) nas listas **Checklist** e **Abastecimentos**; sem foto, `-` | |
| RN-F5.12 | Relatórios, painel e planilha **não mudam** (não leem anexo) | |

## Contratos de API (congelados)

Todas sob `authenticateToken + checkModulePermission('frota') + ensureSchema`, exceto o `GET` do arquivo (só assinatura).

### `POST /api/frotas/anexos` — multipart

Campos: `foto` (arquivo, um só), `entidade` (`registro` | `abastecimento`), `entidade_id` (inteiro > 0). Recusas, **nesta ordem**:

| # | Status | Corpo | Quando |
|---|---|---|---|
| 1 | 403 | `{ error: 'Sem permissão para esta operação', … }` (o corpo do `requirePermission` traz também `acao` e `perfil`) | perfil sem `registrar_operacoes` (CONSULTA) — antes do multer |
| 2 | 400 | `{ error: 'Envie uma foto por vez' }` | mais de um arquivo, ou arquivo em campo que não é `foto` (o multer recusa antes do filtro) |
| 3 | 400 | `{ error: 'Formato de imagem não suportado' }` | MIME declarado fora de jpeg/jpg/png/webp (o filtro roda no cabeçalho do arquivo, antes dos bytes) |
| 4 | 413 | `{ error: 'Arquivo grande demais (máximo 10 MB)' }` | arquivo > 10 MB |
| 5 | 400 | `{ error: 'Não foi possível ler a foto enviada' }` | outro erro do multer (corpo multipart torto) |
| 6 | 400 | `{ error: 'Nenhuma foto enviada' }` | sem arquivo |
| 7 | 400 | `{ error: 'Tipo de lançamento inválido' }` | `entidade` fora da lista |
| 8 | 400 | `{ error: 'Lançamento inválido' }` | `entidade_id` não é inteiro > 0 |
| 9 | 404 | `{ error: 'Registro não encontrado' }` / `{ error: 'Abastecimento não encontrado' }` | não existe |
| 10 | 409 | `{ error: MSG_NAO_VINCULADO, code: 'MOTORISTA_NAO_VINCULADO' }` | MOTORISTA sem vínculo |
| 11 | 403 | `{ error: 'Você só pode alterar os seus próprios registros' }` | MOTORISTA, lançamento de outro (ou sem motorista) |
| 12 | 400 | `{ error: 'Formato de imagem não suportado' }` | os primeiros bytes não são do formato declarado |
| 13 | 409 | `{ error: 'Este lançamento já tem 3 fotos', code: 'LIMITE_DE_FOTOS' }` | teto (RN-F5.01) |

`201` → `{ id, entidade, entidade_id, url, tipo_mime, tamanho, created_at }`. Toda recusa a partir da 2 sai **sem arquivo no disco**.

### `DELETE /api/frotas/anexos/:id`

403 perfil (antes) → 404 `{ error: 'Foto não encontrada' }` → 409 `MOTORISTA_NAO_VINCULADO` → 403 `Você só pode alterar os seus próprios
registros` (lançamento de outro; lançamento que não existe mais → só o gestor) → `200 { success: true }`; apaga o arquivo (falha ao
apagar o arquivo não derruba a resposta: loga).

### `GET /api/uploads/frotas-anexos/<arquivo>?exp=&sig=`

`200` com a imagem (`Content-Type` pela extensão, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none';
sandbox`, `Cache-Control: private, max-age=0, must-revalidate`) ou `404` sem corpo em qualquer falha (sem auth de sessão, como o
almoxarifado).

### Leituras — aditivo

`GET /checklists`, `GET /abastecimentos`: cada linha `+ anexos`. `GET /portal/meus-registros`: `registros[]` e `abastecimentos[]`, cada
um `+ anexos`. Formato do item: `{ id, url, tipo_mime, tamanho, created_at }`.

### `DELETE /checklists/:id`, `DELETE /abastecimentos/:id` — efeito novo

Também apagam as linhas de `frotas_anexos` do lançamento e os arquivos (RN-F5.08). Resposta igual.

### Injeção (servidor)

`registerFrotasRoutes(app, db, authenticateToken, checkModulePermission, { dataDir, segredoUpload })` — **obrigatório**: sem os dois, o
registrador **lança** (não sobe sem foto em silêncio). `index.js` passa `{ dataDir: PERSISTENT_DATA_DIR, segredoUpload: JWT_SECRET }`
(o mesmo segredo raiz das outras pastas assinadas; a chave é derivada pelo domínio). Pasta: `<dataDir>/uploads/frotas-anexos` (criada no
registro). O harness `frotasTestApp` passa uma pasta temporária por app e um segredo de teste, e expõe `uploadsDir`.

### Textos de tela (literais)

- Grupo no registro: legenda `Fotos`; dica `Até 3 fotos (avarias, painel…). Elas sobem depois que o registro for salvo.`
- Grupo no abastecimento: legenda `Foto do cupom`; dica `Até 3 fotos. Elas sobem depois que o abastecimento for salvo.`
- Botão: `Tirar foto` (desabilitado com 3, e a dica vira `Limite de 3 fotos.`); na miniatura: `Remover foto`.
- Falha ao enviar depois do 201: toast de aviso `Salvo, mas 1 foto não foi enviada: <mensagem>` ou `Salvo, mas N fotos não foram
  enviadas: <mensagem>` (a mensagem do servidor da primeira falha, ou `Confira a internet e tente de novo em Meus registros.`).
- Meus registros: botão `+ Foto` (some com 3); sucesso `Foto enviada`; erro: toast com a mensagem do servidor ou `Não foi possível enviar
  a foto. Confira a internet e tente de novo.`
- Meus registros, cada miniatura: botão `Remover foto` com confirmação `Remover esta foto?`; sucesso `Foto removida`.
- Gestor: coluna `Fotos` com **só a primeira** miniatura (`alt` `Foto 1`, `loading="lazy"`, abre em outra aba) e, se houver mais, o texto `+1`/`+2` (link para a segunda/terceira); sem foto `-` (Fase 2, 18).

## Tasks (sort topológico)

| # | Task | Tipo | Depende |
|---|---|---|---|
| T1 | Servidor: `PASTAS.frotasAnexos`, tabela, `services/frotas/anexosService.js` (validar, conferir bytes, gravar com teto, apagar, `comAnexos`), rotas (POST/DELETE, mount assinado, listas e exclusões embrulhadas), DI no `index.js` e no harness. Teste `frotasAnexos.api.test.js` | tronco | — |
| T2 | Tela: `frotasApi.enviarFotoFrota`/`reduzirFoto`, componentes `FotosAntesDeSalvar` e `MiniaturasFotos`, portal (registro, abastecimento, Meus registros) e coluna Fotos do gestor. Teste `FrotasFotos.test.js` (fronteira HTTP mockada pelo contrato) | galho | contrato |
| T3 | Integração `frotasAnexosIntegracao.api.test.js`: (a) **pela rota** — motorista registra saída com avaria pelo portal → envia a foto → `meus-registros` traz a URL → o GET da URL devolve os mesmos bytes → gestor e Consulta veem a mesma foto na lista Checklist; Bruno não vê e leva 403; abastecimento com cupom idem; gestor exclui o registro → arquivo some e URL 404; (b) **pelo serviço** — `anexosService.gravar`/`comAnexos`/`apagarDoLancamento` direto no mesmo cenário | integração | T1 |

Cada task: TDD com controle positivo (sabotar e ver cair **a asserção certa**).

## Estado das tasks

| Task | Estado | Commit |
|---|---|---|
| Plano + Fase 2 | em andamento | |
| T1 | | |
| T2 | | |
| T3 | | |

## Ajustes da Fase 2 (revisor fresco: 5 travas + 15 menores — **valem sobre o texto acima**)

| Achado | Ajuste |
|---|---|
| T-1 (trava) exclusão × envio em corrida deixaria foto órfã | ordem fixada: **apaga o lançamento → lê as fotos → apaga as linhas → apaga os arquivos**; depois do 1º passo nenhum envio passa no `WHERE EXISTS` (404 e o arquivo vai embora). Teste: exclusão e envios em paralelo, sem órfão |
| T-2 (trava) recusas 2–5 só existem se a rota traduzir o erro do multer (o harness não tem os handlers do `/api`) | a rota chama `upload.single('foto')(req, res, cb)` e, no `cb`, `tratarErroFormatoImagem` → `tratarArquivoGrandeDemais` → `Envie uma foto por vez` / `Não foi possível ler a foto enviada` — a mesma resposta no harness e no `index.js` |
| T-3 (trava) `comLoginReal` (mesmo harness) também chama o registrador | as duas montagens do `frotasTestApp` passam `{ dataDir, segredoUpload }` (`frotasPerfisIdaEVolta` usa a segunda) |
| T-4 (trava, tela) o id do lançamento sai de lugares diferentes | registro: `data.registro.id` (`POST /portal/registros` → `{ registro, viagem }`); abastecimento: `data.id` (a linha) |
| T-5 (trava, tela) o formulário sai da tela (`onSalvo`) logo depois do 201 — o aviso da foto se perderia e "Meus registros" recarregaria sem a foto | ordem: 201 → envia as fotos (`await`, uma por vez) → aviso → `onSalvo()` |
| 3 ordem multer | o `fileFilter` roda no cabeçalho do arquivo: **formato (3) vem antes do tamanho (2)**; campo errado sai antes dos dois. Tabela de recusas reordenada: 3 → 2 → 4 |
| 4 GIF | filtro **próprio** (só jpeg/jpg/png/webp): `filtroImagemMulter` aceita gif |
| 5 corpo do 403 de perfil | é `{ error, acao, perfil }` — o contrato só garante o `error` |
| 6 403 com corpo grande | teste do 403 com arquivo pequeno (o servidor responde antes de ler o corpo) |
| 8 "Meus registros" | usa `motoristaDoUsuario` (não `escopoDoUsuario`): só o que é do vínculo, mesmo para o gestor com vínculo. A Fase 0 dizia "os três pontos seguem a RN-F1.14" — **estava impreciso** |
| 9 dono trocado no meio do envio | para quem tem escopo, o `INSERT … WHERE EXISTS (… AND motorista_id = ?)`: o gestor trocar o motorista entre a conferência e a gravação → 403 |
| 10 `DELETE` duplicado | o arquivo só é apagado quando o `DELETE` da linha casou (`changes = 1`); caminho por `path.basename` |
| 12 URL na tela | `resolverUrlAssinada(url, '/api/uploads/frotas-anexos/')` (`utils/resolveUploadAssinadoUrl.js`) — com `REACT_APP_API_URL` absoluta o `src` relativo iria para a origem errada |
| 13 `anexos` ausente | a tela trata como `[]` |
| 15 tempo do envio | `enviarFotoFrota` com `timeout` de 120 s (o `api` tem 30 s) |
| 16 HEIC do iPhone / EXIF | a tela **reconverte** para JPEG toda foto acima de 1 MB **ou** fora de jpeg/png/webp (HEIC); se não conseguir, manda a original (o servidor recusa HEIC com a mensagem de formato). A reconversão tira os metadados (GPS); a original abaixo de 1 MB sobe com eles — **B57** |
| 17 URL vence com a tela aberta | validade de 2 h + balde de 30 min (B56); a tela relida assina de novo. Tela aberta há mais que isso: a miniatura não abre até recarregar — **C17** |
| 18 limite de requisições (500 por IP a cada 15 min, `/api` inteiro) | cada miniatura é um GET. Lista do gestor: **só a 1ª miniatura + "+N"**, `loading="lazy"` — **B58**, **C18** |
| 19 gestor sem botão de apagar foto | **Remover** no "Meus registros" (motorista) entra na etapa (RN-F5.10); na lista do gestor, não — **D14** (o `DELETE` existe; o gestor exclui o lançamento ou pede ao motorista) |
| 20 segurança | coberta; o **fecho 404** depois do `express.static` entra na lista do T1; nada montado fora de `/api` |
