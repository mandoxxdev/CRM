# Etapa 183 — A ficha de EPI (tela e PDF) mostra a matrícula confirmada e o aparelho de cada entrega

> **Status:** 📝 **plano (2026-10-22)** — nenhuma task executada. Feature **25** (entrega de EPI), pendência **D (178)**, item (8):
> *"o PDF da ficha ainda não imprime 'confirmado por matrícula' nem o aparelho de onde veio"* — e o último `[ ]` do checklist da spec
> `specs/modulo-almoxarifado/25-entrega-epi/README.md` que não depende da empresa.
> Antes: Etapa 182 (alerta de retirada parada) — **não tocar** nos arquivos dela (outra sessão está neles).

## Objetivo (em linguagem simples)

Quando o colaborador recebe um EPI, ele assina no tablet e digita a própria matrícula. O sistema guarda duas provas a mais: **que a
matrícula foi conferida** com o cadastro e **de qual aparelho** (navegador) veio a assinatura. Essas provas já existem no banco e já
entram no "lacre" (HMAC) da entrega — mas a **ficha impressa** (o PDF que vai para a pasta da NR-6) não as mostra. Quem lê o papel vê
o nome, o EPI e o rabisco, e não vê *"o colaborador digitou M-100 e conferiu"* nem *"assinado no Tablet X"*.

Depois desta etapa, cada entrega na ficha (tela **e** PDF) tem duas linhas a mais:

- **Matrícula confirmada pelo colaborador:** `Sim — digitou M-100 (confere com o cadastro)` — ou `Não registrada` nas entregas antigas;
- **Aparelho:** o texto de identificação do navegador gravado no ato — ou `Não registrado`.

Nada muda em quem pode abrir a ficha nem no que é gravado: só passa a **sair** o que já estava guardado.

## Fase 0 (medido em 2026-10-22, `d13ca04e`)

- **Gravação** — `server/services/almoxarifado/epiService.js:254-267`: a evidência da entrega recebe `confirmado_por_matricula: 1`
  (`:264`, **sempre a flag 1**: a matrícula digitada **não** é gravada), `ip` (`:265`) e `user_agent` cortado em 300 caracteres (`:266`).
  Os três entram no HMAC (`camposDoRegistro`, `:96-99`). As colunas vêm de `safeAlter` na Fase 5 da 178 (`schema.js:429-432`): evidência
  gravada antes disso tem `NULL` nas três (D (178), item 9 — só base de desenvolvimento).
- **A matrícula que o colaborador digitou é a do cadastro, fotografada na entrega**: `entregas_epi_almoxarifado.matricula` (snapshot do ato,
  dentro do HMAC em `camposDoRegistro`, `:67`). O cadastro vivo (`colaboradores.matricula`) pode mudar depois.
- **Leitura da ficha** — `epiService.fichaDoColaborador` (`:416-439`): `SELECT ${COLUNAS_LISTA}, v.arquivo, v.registro_sha256, v.cpf AS
  cpf_snapshot, e.setor AS setor_snapshot` (`:420`) com `LEFT JOIN` da evidência `contexto = 'ENTREGA_EPI'`. **Não** seleciona
  `v.confirmado_por_matricula` nem `v.user_agent` (nem `v.ip`). O `map` (`:434-437`) espalha o resto da linha (`...linha`) — coluna nova no
  SELECT sai no JSON sem mudar o `map`. `colaborador.matricula` do topo da ficha vem do **cadastro vivo** (`:428`) quando ele existe.
- **Rota** — `server/routes/almoxarifado/extended.js:2072-2077`: `GET /api/almoxarifado/epi/ficha/:colaborador_id`, `auth` +
  `requirePermission('entregar_epi')` (ADMINISTRADOR, ALMOXARIFE). Não muda nesta etapa.
- **PDF** — `client/src/utils/fichaEpiPdf.js`: `montarFichaEpi` (`:22-54`) monta as linhas sem confirmação nem aparelho; `gerarFichaEpiPdf`
  (`:75-136`) desenha por entrega a linha da tabela, `Entrega <n> · registro (HMAC-SHA256): <hash>` (`:114`, fonte 7) e a imagem. Quebra de
  página só no começo da linha (`if (y > 245)`, `:108`); a altura da linha hoje é ~36 mm.
- **Molde** — `client/src/utils/termoFerramenta.js`, `matriculaConfirmadaTexto(evidencia, colaborador)`: flag ≠ 1 → `'Não registrada'`;
  flag 1 com matrícula → `'Sim — digitou <m> (confere com o cadastro)'`; flag 1 sem matrícula → `'Sim'`. Nasceu da correção da T4 da 180
  (a T3 imprimia o campo cru: **"Matrícula digitada: 1"**). Usado em `termoFerramentaPdf.js:63,105` e na tela de ferramentas
  (`FerramentasAlmoxarifado.js:1196`). `termoFerramenta.js` não importa nada (importá-lo de `fichaEpiPdf.js` não cria ciclo; o ciclo
  existiria com `termoFerramentaPdf.js`, que importa `carregarImagemComoDataUrl` de `fichaEpiPdf.js`).
- **Testes existentes que tocam a ficha**: `epiPontaAPonta.api.test.js:195` confere as **chaves exatas** da entrega da ficha
  (`[...CHAVES_LISTA, 'arquivo_url', 'registro_sha256']`) — **vai ficar vermelho** com os campos novos (mudança de contrato intencional,
  ajustar a lista); `epiIntegridade.api.test.js:207-248` e `epiLeituras.api.test.js:57` (403/404 da ficha); `epiMatricula.api.test.js:111-131`
  já prova a gravação de `confirmado_por_matricula`/`ip`/`user_agent`; `client/src/utils/fichaEpiPdf.test.js` (7 testes; jspdf trocado por
  gravador de chamadas).

### Divergências da Fase 0 (o pedido dizia uma coisa, o código diz outra)

1. **"Como a tela já mostra" — falso.** A ficha na tela (`EpiAlmoxarifado.js:505-527`) tem as colunas Data, EPI, CA, Validade CA, Qtd,
   Tamanho, Motivo, Entregue por, Assinatura, Hash — **sem** matrícula confirmada e **sem** aparelho. Nem a tela de ferramentas nem o PDF do
   termo (o molde) mostram o **aparelho**: `user_agent` não aparece em nenhum arquivo de `client/src` (busca por `user_agent`/`aparelho`;
   a régua acha `aparelho` em `ScannerAlmoxarifado.js`, então ela funciona). O molde cobre **só a matrícula**. Decisão: a etapa põe os dois
   dados na **tela e no PDF** da ficha (**B1201**); o aparelho não tem molde e o formato é decidido aqui (RN-183.04).
2. A spec 25 diz *"a tela de verificação e a cadeia usam esses dados"* (D (178), item 8) — **usam no cálculo** do HMAC, não **mostram**. Não é
   erro, mas o fechamento deve reescrever a frase para não sugerir que a tela exibe.

## Regras

| ID | Regra | Cenário |
|---|---|---|
| RN-183.01 | `GET /epi/ficha/:colaborador_id` devolve em **cada entrega** dois campos novos, lidos da **evidência gravada no ato** (o registro assinado, dentro do HMAC) — nunca do cadastro vivo: `confirmado_por_matricula` (`1` ou `null`; `Number`, como `termoFerramentaService.js:397`) e `user_agent` (texto ou `null`). Sem evidência (LEFT JOIN vazio) → os dois `null`. | Entrega pela rota com `User-Agent: Tablet-Almox/2.1 (Android)` → a ficha traz `confirmado_por_matricula: 1`, `user_agent: 'Tablet-Almox/2.1 (Android)'`. |
| RN-183.02 | O `ip` **não** sai na ficha (nem no PDF). Continua gravado e no HMAC. | A resposta da ficha não tem a chave `ip` em nenhuma entrega, e o JSON inteiro não contém o IP da requisição. |
| RN-183.03 | Linha **"Matrícula confirmada pelo colaborador:"** de cada entrega, na tela e no PDF, pelo **mesmo** `matriculaConfirmadaTexto(evidencia, colaborador)` do termo, com `evidencia = { confirmado_por_matricula }` da entrega e `colaborador = { matricula: e.matricula }` — a matrícula **da entrega** (snapshot), não `ficha.colaborador.matricula` (cadastro vivo). Textos literais: flag 1 → `Sim — digitou M-100 (confere com o cadastro)`; flag 1 e matrícula vazia → `Sim`; flag `null`/`0`/ausente → `Não registrada`. **Nunca** imprime a flag crua (o bug da 180: *"Matrícula digitada: 1"*). | (a) Entrega com M-100; depois o cadastro muda para M-200 → o topo da ficha diz `Matrícula: M-200` e a linha da entrega diz `Sim — digitou M-100 (confere com o cadastro)`. (b) Entrega antiga com flag `null` → `Não registrada`. (c) Nenhum texto do PDF casa `/Matr[ií]cula[^:]*:\s*1\b/` nem termina em `: 1`. |
| RN-183.04 | Linha **"Aparelho:"** de cada entrega: o `user_agent` gravado, **literal** (sem interpretar em "Android/Chrome" — interpretar é adivinhar, e o dado é prova), aparado; vazio/`null` → `Não registrado`. No PDF, fonte 7, quebrado em linhas de até **110** caracteres (no máximo 3 linhas: o gravado tem ≤ 300). Na tela, a célula mostra os primeiros **40** caracteres + `…` quando passa, e o texto inteiro no `title`. | (a) `Mozilla/5.0 (Linux; Android 13; SM-X200) …` (200 chars) → no PDF, `Aparelho: ` + 2 linhas cuja junção é o texto inteiro. (b) entrega antiga sem `user_agent` → `Aparelho: Não registrado`. |
| RN-183.05 | **Entregas antigas** (evidência anterior à Fase 5 da 178, só em base de dev) e entrega **sem evidência** aparecem na ficha sem quebrar: `Matrícula confirmada pelo colaborador: Não registrada` e `Aparelho: Não registrado`. O PDF não omite a linha (a ausência é informação). | Ficha com uma entrega nova e uma antiga → o PDF tem as duas linhas nas duas entregas, com os textos de cada uma. |
| RN-183.06 | **Quem baixa a ficha não muda:** `entregar_epi` (ADMINISTRADOR, ALMOXARIFE). PRODUCAO e GESTOR → 403 na ficha. O PDF é gerado no navegador a partir da mesma resposta — não há porta nova. | PRODUCAO → `GET /epi/ficha/:id` 403; ALMOXARIFE → 200 com os campos novos. |
| RN-183.07 | Ler os campos não muda a integridade: `GET /epi/entregas/:id/verificar` continua `{ integro: true }` e `GET /evidencias/cadeia/verificar` sem problemas depois de abrir a ficha (a etapa não grava nada). | Fluxo da T4. |
| RN-183.08 | O PDF não perde linha no rodapé: com as linhas novas a entrega fica ~10 mm mais alta; a quebra de página no começo da entrega passa de `y > 245` para `y > 235` (a entrega mais alta — 3 linhas de aparelho — termina antes de 287 mm). | Ficha com 8 entregas de aparelho longo → nenhuma chamada `text`/`addImage`/`line` com `y > 287`. |

## Contrato

**`GET /api/almoxarifado/epi/ficha/:colaborador_id`** — método, permissão, 404 e o objeto `colaborador` **sem mudança**. Cada item de
`entregas` passa a ter exatamente as chaves:

```
[...CHAVES_LISTA, 'arquivo_url', 'registro_sha256', 'confirmado_por_matricula', 'user_agent']
```

- `confirmado_por_matricula`: `1 | null` (número; `v.confirmado_por_matricula == null ? null : Number(...)`).
- `user_agent`: `string | null` (como gravado, ≤ 300).
- **Não** sai: `ip`, `cpf` da evidência, `arquivo` cru (já era assim).
- Recusas (literais, já existentes): 403 `{ error }` do `requirePermission` para quem não tem `entregar_epi`; 404
  `Colaborador #<id> não encontrado`.

**Descritor `montarFichaEpi`** (client) — cada linha ganha:
- `matriculaConfirmada: string` (RN-183.03);
- `aparelho: string` (texto inteiro ou `Não registrado`);
- `linhasAparelho: string[]` (quebra de RN-183.04 em 110; `['Não registrado']` quando não há).

No PDF, depois de `Entrega <n> · registro (HMAC-SHA256): <hash>` (fonte 7):
`Matrícula confirmada pelo colaborador: <matriculaConfirmada>` e `Aparelho: <linhasAparelho[0]>` (+ as linhas seguintes recuadas, sem rótulo).

## Tasks

| # | Task | Tipo |
|---|---|---|
| T1 | Servidor: RN-183.01/02/05/06 | **tronco** (congela o contrato do JSON) |
| T2 | `fichaEpiPdf.js`: descritor + desenho (RN-183.03/04/05/08) | galho (contra o contrato acima) |
| T3 | Tela `EpiAlmoxarifado.js`: duas colunas na ficha (RN-183.03/04) | galho |
| T4 | Integração pela rota **e** pelo serviço (RN-183.01..07) | depois de T1; o cenário client usa a resposta real capturada |

T2 e T3 mexem em arquivos diferentes do client e só **consomem** o contrato congelado — paralelizáveis. Nenhuma task toca motor de
estoque, trava, migration nem `ACAO_PERFIS`.

### T1 (tronco) — `fichaDoColaborador` devolve a confirmação e o aparelho

Arquivos: `server/services/almoxarifado/epiService.js` (`:420` e o `map` de `:434`), teste novo
`server/tests/api/epiFichaConfirmacao.api.test.js`, ajuste em `server/tests/api/epiPontaAPonta.api.test.js:195`.

1. **Vermelho primeiro.** Teste novo (runner próprio, harness `testApp.js`, `requirePermission` real), semeando pela **rota**
   (`POST /epi/entregas` multipart, PNG real, `.set('User-Agent', 'Tablet-Almox/2.1 (Android)')`, `confirmacao_matricula` certa) e uma
   entrega **antiga** por `INSERT` direto em `entregas_epi_almoxarifado` + evidência com `confirmado_por_matricula`, `ip`, `user_agent` `NULL`
   (os triggers barram só UPDATE/DELETE) e uma entrega **sem evidência**:
   - `[RN-183.01]` a entrega da rota traz `confirmado_por_matricula === 1` e `user_agent === 'Tablet-Almox/2.1 (Android)'`;
   - `[RN-183.01]` `typeof confirmado_por_matricula === 'number'`;
   - `[RN-183.02]` nenhuma entrega tem a chave `ip`; `JSON.stringify(body)` não contém o IP gravado na evidência (lido do banco);
   - `[RN-183.05]` a antiga e a sem evidência → os dois campos `null` (chaves presentes);
   - `[RN-183.03 servidor]` depois de `UPDATE colaboradores SET matricula = 'M-200'`, `body.colaborador.matricula === 'M-200'` e a
     `matricula` da entrega continua `M-100` (o client depende disso);
   - `[RN-183.06]` PRODUCAO e GESTOR → 403; ALMOXARIFE e ADMINISTRADOR → 200 com as chaves.
2. Rodar e ver vermelho pelos motivos certos (campos `undefined`).
3. Implementar: `, v.confirmado_por_matricula, v.user_agent` no SELECT de `:420`; no `map`, normalizar
   `confirmado_por_matricula: linha.confirmado_por_matricula == null ? null : Number(linha.confirmado_por_matricula)` e
   `user_agent: linha.user_agent ?? null`. **Não** acrescentar `v.ip`.
4. Ajustar `epiPontaAPonta.api.test.js:195` para a lista nova de chaves (**mudança de contrato intencional** — registrar na Execução).
5. **Controles positivos** (restauro por cópia + `cmp`, um por vez):
   - tirar `v.user_agent` do SELECT → caem `[RN-183.01]` (valor) e `[RN-183.05]` (chave presente);
   - trocar a normalização por `confirmado_por_matricula: 1` fixo → cai `[RN-183.05]` (a antiga deixa de ser `null`);
   - acrescentar `v.ip` ao SELECT → cai `[RN-183.02]`;
   - trocar `requirePermission('entregar_epi')` da rota da ficha por `requirePermission('visualizar')` → cai `[RN-183.06]` (PRODUCAO 200).
6. Suítes: `test:api` inteira + `epi*` sem mudança de asserção além do item 4.

### T2 (galho) — o PDF imprime as duas linhas

Arquivos: `client/src/utils/fichaEpiPdf.js`, `client/src/utils/fichaEpiPdf.test.js`.

1. **Vermelho primeiro** (Jest, mesmo gravador de chamadas do jspdf):
   - `[RN-183.03]` `montarFichaEpi` com `ENTREGA` (`matricula: 'M-100'`, `confirmado_por_matricula: 1`) e `COLABORADOR.matricula: 'M-200'`
     → `linhas[0].matriculaConfirmada === 'Sim — digitou M-100 (confere com o cadastro)'`;
   - `[RN-183.03]` flag `null`, `0` e ausente → `'Não registrada'`; flag 1 com `matricula: ''` → `'Sim'`;
   - `[RN-183.03]` `gerarFichaEpiPdf`: os textos contêm `'Matrícula confirmada pelo colaborador: Sim — digitou M-100 (confere com o cadastro)'`
     e **nenhum** texto casa `/Matr[ií]cula[^:]*:\s*1\b/`;
   - `[RN-183.04]` `user_agent` de 200 caracteres → `linhasAparelho.length === 2`, `linhasAparelho.join('') === user_agent`, cada uma ≤ 110;
     no PDF, um texto começa com `'Aparelho: '`;
   - `[RN-183.05]` `user_agent: null` → `aparelho === 'Não registrado'`, PDF com `'Aparelho: Não registrado'` e
     `'Matrícula confirmada pelo colaborador: Não registrada'`;
   - `[RN-183.08]` 8 entregas de `user_agent` com 300 caracteres → nenhuma chamada `text`/`line`/`addImage` com coordenada y > 287.
2. Implementar: importar `matriculaConfirmadaTexto` de `./termoFerramenta` (não de `termoFerramentaPdf` — ciclo); `aparelho` por `txt`
   com fallback `Não registrado`; quebra em fatias de 110 (corte simples por caractere: o user agent não tem parágrafos e a fidelidade ao
   texto importa mais que a palavra inteira); desenhar as linhas depois do hash; limiar de página 245 → 235.
3. **Controles positivos:**
   - passar `c` (o `colaborador` da ficha, cadastro vivo) em vez de `{ matricula: e.matricula }` → cai o teste M-100 × M-200;
   - imprimir `` `Matrícula confirmada pelo colaborador: ${e.confirmado_por_matricula}` `` → cai a régua `/…:\s*1\b/` e o texto literal;
   - tirar o fallback `Não registrado` → cai `[RN-183.05]` (sai `—`);
   - voltar o limiar para 245 → cai `[RN-183.08]` (conferir que a ficha de 8 entregas realmente estoura com 245 — se não estourar, aumentar
     o caso até estourar; teste que não sabe falhar não vale).
4. `CI=true npx react-scripts test src/utils/fichaEpiPdf --watchAll=false` e o `termoFerramentaPdf` (o molde não pode mudar).

### T3 (galho) — a ficha na tela mostra as mesmas duas colunas

Arquivos: `client/src/components/almoxarifado/EpiAlmoxarifado.js` (`:505-527`), `EpiAlmoxarifado.test.js`.

1. **Vermelho primeiro:** com a ficha mockada na fronteira HTTP (`GET /almoxarifado/epi/ficha/:id`, JSON do contrato) — cabeçalhos
   `Matrícula confirmada` e `Aparelho`; célula `Sim — digitou M-100 (confere com o cadastro)` com o topo dizendo `Matrícula: M-200`;
   entrega antiga → `Não registrada` / `Não registrado`; `user_agent` de 60 chars → célula com 40 + `…` e `title` com o texto inteiro;
   nenhuma célula com o texto `1` sozinho na coluna da confirmação.
2. Implementar reaproveitando `montarFichaEpi(ficha).linhas[i]` (`matriculaConfirmada`, `aparelho`) — **um** cálculo para tela e PDF.
3. **Controles:** célula com `e.confirmado_por_matricula` cru → cai o teste do `1`; `title` sem o texto inteiro → cai o do aparelho.
4. Jest inteiro + `CI=true build`.

### T4 — integração pela rota e pelo serviço

Arquivo: `server/tests/api/epiFichaConfirmacaoIntegracao.api.test.js` (ou um bloco no fim do de T1, se o runner ficar simples).

- **Pela rota:** `POST /epi/entregas` (multipart, PNG real, `User-Agent` de tablet, confirmação certa) → `GET /epi/ficha/:id` (campos de
  RN-183.01) → `GET /epi/entregas/:id/verificar` `{ integro: true }` → `GET /evidencias/cadeia/verificar` sem problemas (RN-183.07) →
  PRODUCAO 403 na ficha (RN-183.06).
- **Pelo serviço:** `epiService.fichaDoColaborador(db, id)` devolve `deepStrictEqual` ao corpo da rota (menos a assinatura temporária do
  `arquivo_url`, comparada por regex) — a rota não pode filtrar nem acrescentar nada.
- **Cruzando com o client:** o corpo real da rota é gravado como fixture JSON (`client/src/utils/__fixtures__/fichaEpi.rota.json`, gerado
  pelo teste com `CRM_GRAVAR_FIXTURE=1`, versionado) e um teste Jest em `fichaEpiPdf.test.js` passa essa fixture por `montarFichaEpi` e
  confere `Sim — digitou … (confere com o cadastro)` e o aparelho do tablet. Assim, se a T1 renomear um campo, o Jest cai — o mock da T2
  sozinho não pegaria.
- **Controle positivo:** renomear `user_agent` → `aparelho` no `map` da T1 e regravar a fixture → o Jest da fixture cai em
  `Aparelho: Não registrado`.

### Fechamento (skill `fechar-etapa`)

Spec 25 (item do checklist com hash; frase do D (178)(8) corrigida — "usam no cálculo", não "mostram"), mapa, guia do usuário (roteiro:
entregar no tablet → Ficha → Gerar PDF → conferir as duas linhas; entrega antiga), novidades (seção da Etapa 183, letra B abaixo) e este
plano com a próxima tarefa detalhada.

## Execução

_(vazia — preencher task a task: feita, hash, divergência do previsto, controles rodados e números das suítes.)_

## Letra B proposta (para `docs/almoxarifado-novidades-por-etapa.md`)

- **B1200** — A matrícula confirmada da ficha usa a matrícula **gravada na entrega**, não a do cadastro de hoje. Se o RH trocar a matrícula,
  o topo da ficha mostra a nova e cada entrega continua dizendo a que o colaborador digitou no dia. **Descartado:** a do cadastro vivo (a
  ficha diria que ele digitou um número que não existia na data). Reversível.
- **B1201** — Os dois dados entram na **tela** da ficha também, não só no PDF. O pedido dizia que a tela já mostrava; **não mostrava** (Fase 0,
  divergência 1). **Descartado:** só o PDF (o papel diria algo que a tela não diz, e quem confere pela tela não veria). Reversível.
- **B1202** — O **endereço de rede (IP)** não sai na ficha nem no PDF; continua gravado e no lacre. **Descartado:** imprimir o IP (dado de
  rede interno, não ajuda quem lê a ficha da NR-6 e circula no papel). Reversível: é um campo a mais no SELECT.
- **B1203** — O aparelho sai **como foi gravado** (o texto do navegador), não traduzido em "Android — Chrome". **Descartado:** interpretar
  (adivinhação; o texto cru é o que está no lacre). Reversível.
- **B1204** — Entrega antiga mostra **"Não registrada" / "Não registrado"**, em vez de esconder as linhas. **Descartado:** omitir (a ausência
  da prova é informação para quem audita). Reversível.
- **B1205** — O relatório *EPI por colaborador* e a lista *Entregas* **não** ganham as duas colunas nesta etapa (o pedido é a ficha). Fica
  registrado como possível próxima pequena etapa. Reversível.

## Próxima tarefa detalhada

_(preencher no fechamento.)_

## Emendas da Fase 2

Revisão fresca (2026-10-22, sobre `c8500355`). **Prevalecem sobre a tabela de regras e as tasks acima.** Sem crítico.

**Conferido e certo (não muda nada):**
- **De onde vem a matrícula da linha:** `e.matricula` (`COLUNAS_LISTA`, `epiService.js:381`) — o snapshot do cadastro **no ato**, gravado em
  `registrarEntrega` (`:211`, `colab.matricula` depois de `conferirMatricula`) e **dentro do HMAC** duas vezes (`camposDoRegistro`, `matricula`
  `:67` e `evidencia.matricula` `:86`). A flag `confirmado_por_matricula` também está no HMAC (`:97`). O topo da ficha é o cadastro vivo
  (`:428-429`). A RN-183.03 está certa ao usar `{ matricula: e.matricula }`.
- **Literais:** `matriculaConfirmadaTexto({ confirmado_por_matricula: 1 }, { matricula: 'M-100' })` (`termoFerramenta.js:69-74`) →
  `Sim — digitou M-100 (confere com o cadastro)`; `null`/`0`/ausente → `Number(...) !== 1` → `Não registrada`; `1` com `''` → `Sim`. Bate
  com a RN-183.03. Entrega sem evidência (LEFT JOIN vazio) e evidência de antes da Fase 5 da 178 caem em `Não registrada`/`Não registrado`.
- **jsPDF 2.5.2** (Helvetica, `WinAnsiEncoding`) mapeia `—` (U+2014 → 151) e `í`: as frases novas renderizam, como já renderizam no termo.
  O `User-Agent` chega pelo Node só em latin1 e sem CR/LF (o parser recusa), então não quebra linha nem sai glifo fora da tabela.
- **Exposição:** o `user_agent` sai só para `entregar_epi` (ADMINISTRADOR, ALMOXARIFE — `extended.js:2073`, sem mudança), e é o navegador do
  **tablet do almoxarifado**, não dado pessoal do colaborador; o `ip` fica fora (B1202). Nenhuma outra leitura (lista, relatório, cadeia)
  ganha o campo.
- **Do gesto ao fim:** entregar → ficha na tela → Gerar PDF (que **relê** a ficha, `EpiAlmoxarifado.js:232`, então tela e PDF vêm da mesma
  resposta) → verificar/cadeia (a etapa não grava; o HMAC não muda). Nenhum passo recusa ou mostra diferente, fora o corte de 40 caracteres do
  aparelho na tela (intencional, texto inteiro no `title`).

### Importantes

- **I1 — T2 e T3 não são independentes (e a T4 depende da T2).** A T3 manda reaproveitar `montarFichaEpi(ficha).linhas[i].matriculaConfirmada`/
  `.aparelho`, mas esses campos **só a T2 cria** (`fichaEpiPdf.js:22-54`). O `EpiAlmoxarifado.test.js` troca o `jspdf` (`:41`), **não** o
  `fichaEpiPdf` — então o teste da T3 roda o `montarFichaEpi` real: em paralelo, ou ele fica vermelho pelo motivo errado (campo `undefined`), ou o
  agente da T3 edita `fichaEpiPdf.js` e conflita com a T2. A parte client da T4 também escreve em `fichaEpiPdf.test.js` (arquivo da T2) e precisa
  dos campos dela. **Correção:** o **descritor** vira tronco. Nova ordem:
  - **T1** (servidor, como está) e **T1c** (client, tronco): `montarFichaEpi` ganha `matriculaConfirmada`, `aparelho`, `linhasAparelho`, com os
    testes de descritor da RN-183.03/04/05 (os itens do vermelho da T2 que só olham `linhas[i]`) e os controles "passar `c` em vez de
    `{ matricula: e.matricula }`" e "tirar o fallback `Não registrado`". T1 e T1c não se tocam (servidor × client) e podem ir juntas.
  - **T2** (galho): só `gerarFichaEpiPdf` — as linhas desenhadas, a régua `/Matr[ií]cula[^:]*:\s*1\b/`, `Aparelho: ` e a RN-183.08.
  - **T3** (galho): só a tela, consumindo os campos da T1c.
  - **T4**: depois de T1, T1c **e** T2 (o teste Jest da fixture mora em `fichaEpiPdf.test.js`).

- **I2 — A régua do rodapé (RN-183.08) não olha a imagem inteira, e o espaçamento não está fixado.** O teste proposto confere a coordenada y de
  `text`/`line`/`addImage`; no `addImage(img, 'PNG', x, y, 60, 22.5)` (`fichaEpiPdf.js:117`) o y é o **topo**: uma assinatura que começa em 280 e
  termina em 302,5 passa. E o "~10 mm" e o `235` foram estimados sem o passo das linhas novas. **Correção (contrato do desenho):** depois do hash,
  `y += 3` → `Matrícula confirmada pelo colaborador: …`; `y += 3` → `Aparelho: <linhasAparelho[0]>`; cada linha seguinte `y += 3` (recuo
  `M + 14`, sem rótulo); depois `y += 2` e segue como hoje (imagem 22,5 + `y += 25`, ou o aviso). Entrega mais alta (3 linhas de aparelho), do
  início `s` à linha divisória: `s + 4 + 3 + 3 + 3 + 3 + 2 + 25 = s + 43`; fundo da imagem `s + 40,5`. Com `s ≤ 235` → divisória ≤ 278; com
  `s ≤ 245` → até 288 > 287 (o controle "voltar para 245" cai com 3 linhas, se alguma entrega começar em (235, 245] — montar o caso para isso).
  A régua do teste: `text`/`line` com **todo** y ≤ 287 **e** `addImage` com `y + h ≤ 287` (argumentos 4 e 6). Se o agente mudar o passo,
  recalcula o limiar e registra na Execução.

- **I3 — A fixture da T4 só pega a troca de nome se alguém lembrar de regravá-la.** O plano grava `client/src/utils/__fixtures__/fichaEpi.rota.json`
  com `CRM_GRAVAR_FIXTURE=1` e não diz o que o teste do servidor faz sem a variável. Se não compara, a T1 renomeia `user_agent` e as **duas**
  suítes continuam verdes (o Jest lê a fixture velha) — o controle proposto ("renomear **e regravar**") prova o caminho que ninguém percorre no
  dia a dia. **Correção:** molde `listasNotificacoesPortao.api.test.js:323-326` — o teste do servidor **sempre** lê a fixture versionada e confere
  `Object.keys(entrega).sort()` da fixture = da resposta real, e os tipos de `confirmado_por_matricula` (`number`) e `user_agent` (`string`);
  com `CRM_GRAVAR_FIXTURE=1` ele só regrava. Controle positivo: renomear no `map` **sem** regravar → cai o teste do **servidor**; regravar → cai o
  Jest (`Aparelho: Não registrado`). A fixture não pode conter o `ip` (conferir com `includes` do IP do banco, como na RN-183.02).

### Menores

- **M1 — Previsão errada num controle da T1.** "Tirar `v.user_agent` do SELECT → caem RN-183.01 (valor) **e RN-183.05 (chave presente)**": o `map`
  com `user_agent: linha.user_agent ?? null` recria a chave, então **só a RN-183.01 cai** (a antiga e a sem evidência continuam `null`). Corrigir a
  expectativa (não "consertar" o teste para cair). O mesmo vale para `confirmado_por_matricula`.
- **M2 — RN-183.02 pode virar teste vazio.** `!JSON.stringify(body).includes(ip)` com o `ip` lido do banco: se ele vier `null`, `String(null)`
  é `'null'` (o corpo tem `null` → vermelho falso) ou a guarda pula a asserção. Antes, `assert.ok(ip && ip.length > 3)` (no harness o supertest
  grava `::ffff:127.0.0.1`).
- **M3 — Teste que vai ficar vermelho e não está listado.** `fichaEpiPdf.test.js:37-52` faz `toEqual` da **linha inteira** do descritor: os
  três campos novos o derrubam. É mudança de contrato intencional (como `epiPontaAPonta.api.test.js:195`) — ajustar e registrar na Execução da
  T1c. A `ENTREGA` dele não tem `confirmado_por_matricula` → `Não registrada`.
- **M4 — O 403 sem literal.** O contrato diz "403 `{ error }`"; o literal é `{ error: 'Sem permissão para esta operação', acao: 'entregar_epi',
  perfil }` (`permissions.js:292`). O teste da RN-183.06 confere `error` e `acao`.
- **M5 — "digitou M-100" é o cadastro, não o que foi digitado letra a letra.** `conferirMatricula` compara sem caixa e sem espaços
  (`identificacaoColaborador.js:38-46`): quem digitou `m 100` vê `digitou M-100`. É o texto do molde (Etapa 180) e **não muda** aqui (a ficha e o
  termo têm de dizer o mesmo); o guia explica que "(confere com o cadastro)" é a conferência normalizada. Letra B nova: **B1206** — mantido o texto
  do molde; **descartado:** gravar a matrícula digitada (mudaria o HMAC e o schema; é outra etapa).
- **M6 — Corte fixo de 110 caracteres.** Em fonte 7, um UA real (minúsculas e dígitos) dá ~140-150 mm dos 182 úteis; uma sequência só de
  maiúsculas largas passaria da margem. `getTextWidth` não serve porque o gravador do teste devolve `undefined`. Aceito como limite conhecido
  (o UA vem do navegador do almoxarifado); registrar em D (183).
