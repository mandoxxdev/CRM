# Etapa 33 — Os arquivos antigos param de ser públicos: implementação

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recomendado)
> ou superpowers:executing-plans. Passos com checkbox (`- [ ]`).

**Goal:** fechar o furo **C42** — os uploads legados do almoxarifado deixam de ser alcançáveis sem
assinatura, sem quebrar as três telas que os exibem.

**Architecture:** um módulo puro de assinatura (HMAC sobre `nome:exp`), um middleware que a verifica
na frente dos **dois** mounts estáticos, e o servidor passando a **minar** a URL nas três famílias
exibidas — a foto de material, o certificado de lote e a assinatura de entrega. O client para de
montar endereço a partir de nome de coluna.

> ⚠️ **A Fase 0 do design afirmava que `materialPhoto.js` é "o ponto único" da foto. ESTAVA
> ERRADO**, medido na Fase 2: `requisicoesMaterial.js:288` devolve `itens[].foto` **cru**, sem
> `enrichMaterialRow` — e é exatamente o que `RequisicoesList.js:929` renderiza no modo
> "Minhas Requisições". Hoje funciona porque o helper do client remonta; depois da Task 3 a
> miniatura de **todo item** sumiria da tela, **em silêncio** — o modo de falha que esta etapa diz
> estar eliminando. A Task 2 corrige o endpoint. E há uma **quarta** família write-only que a
> tabela do design não listou: `sobras_material_almoxarifado.foto` (`schema.js:1508`), sem leitor
> nem no servidor nem no client.

**Tech Stack:** Node `crypto` (HMAC-SHA256), Express, `supertest`; React CRA.

**Spec:** `docs/superpowers/specs/2026-09-02-almoxarifado-etapa33-uploads-legados-design.md`
(commit `13dfd4f`).

## Global Constraints

- **Falha responde 404, nunca 401 nem 403.** Um 401 confirma que o arquivo existe — é a informação
  que a obscuridade de hoje protege por acidente.
- **O nome do arquivo entra no HMAC.** Sem isso, assinatura de `foto-a.png` serve para
  `assinatura-secreta.png`. É o erro clássico deste padrão e a RN-02 existe só para ele.
- **Nunca `?token=` com o JWT de sessão** — recusado com raciocínio em
  `RelatoriosAlmoxarifado.js:34-37`. A assinatura desta etapa **não** é credencial de sessão.
- **Nenhum arquivo é movido nem renomeado.** Muda como se alcança, não onde está.
- **Segredo:** `resolveJwtSecret(PERSISTENT_DATA_DIR)` de `services/runtimeSecrets.js`. O
  registrador do almoxarifado já recebe `PERSISTENT_DATA_DIR` como 4º parâmetro — mesmo caminho do
  `uploadsAnexosDir` da Etapa 32. **Nunca re-derivar de `config/paths.js`.**
- Testes descobertos só em `server/tests/api/*.api.test.js`; harness `testApp.js` com
  `requirePermission` real. Commit em português, corpo sem acento. Nunca `git add -A` na raiz.

## Estrutura de arquivos

| Arquivo | Responsabilidade | Task |
|---|---|---|
| `server/services/almoxarifado/urlUpload.js` **(criar)** | assinar, verificar, e o middleware | 1 |
| `server/tests/api/urlUploadAssinada.api.test.js` **(criar)** | RN-01 a RN-04 e RN-07, pelos dois mounts | 1 |
| `server/routes/almoxarifado.js` **(modificar, `:237-238`)** | middleware na frente dos dois mounts | 1 |
| `server/services/almoxarifado/materialPhoto.js` **(modificar)** | `materialPhotoUrl` passa a assinar | 2 |
| `server/services/almoxarifado/deliverySignatureService.js` **(modificar, `:20`)** | `arquivo_url` assinado | 2 |
| `server/services/almoxarifado/lotService.js` **(modificar, `:203`)** | `certificado_url` assinado | 2 |
| `client/src/utils/resolveMaterialPhotoUrl.js` **(modificar)** | para de remontar; `''` para nome cru | 3 |
| `client/src/components/almoxarifado/LotesAlmoxarifado.js` **(modificar, `:365`)** | consome `certificado_url` | 3 |

## Sort topológico

| Task | Tipo | Depende de | Por quê |
|---|---|---|---|
| 1 — assinatura e middleware | **tronco** | — | é a régua que todo o resto consome |
| 2 — as três famílias minando URL | **tronco** | 1 | usa `assinarUpload` da Task 1 |
| 3 — client para de montar URL | sequencial | 2 | precisa do contrato novo já respondido |
| 4 — integração e fechamento | sequencial | 3 | cruza servidor e tela |

**Paralelismo: ZERO, e declarado.** As quatro tasks são a mesma régua atravessando as camadas, em
sequência — a 2 não existe sem a 1, e a 3 quebraria se a 2 não estivesse pronta. Fingir galho aqui
custaria mais integração do que economizaria em relógio. (Etapa 31 tomou a mesma decisão pelo
mesmo motivo.)

---

### Task 1: A assinatura e o middleware  **(tronco)**

> **FEITA** — 10/10 no arquivo novo, `test:api` **168/168** (167 → 168). As CINCO sabotagens
> derrubaram o cenário previsto. **E a RN-03 nasceu VAZIA:** a primeira versão usava um `sig`
> inválido, então o 404 vinha da assinatura errada e não do tempo — a sabotagem que remove a
> checagem de `exp` ficava verde. Corrigida para calcular o HMAC correto de um `exp` vencido, que é
> o único ponto do arquivo em que o teste assina por conta própria, e está dito lá por quê.
> **O controle positivo de `anexoDocumento.api.test.js` foi REESCRITO, não apagado** — ele afirmava
> o furo como contrato ("sai público (200)"); apagá-lo faria o 404 da RN-03 daquele arquivo voltar
> a não provar nada.

**Files:**
- Create: `server/services/almoxarifado/urlUpload.js`
- Create: `server/tests/api/urlUploadAssinada.api.test.js`
- Modify: `server/routes/almoxarifado.js` (bloco dos dois `express.static`, hoje `:237-238`)

**Interfaces:**
- Consumes: `resolveJwtSecret(PERSISTENT_DATA_DIR)` de `services/runtimeSecrets.js`.
- Produces, e as Tasks 2 e 4 dependem destes nomes:
  - `criarAssinadorUpload(segredo)` → `{ assinar(filename), verificar(filename, exp, sig), middleware }`
  - `assinar(filename)` → `"<prefixo>/<filename>?exp=<unix>&sig=<hex>"` (URL relativa, pronta para `<img src>`)
  - `MINUTOS_VALIDADE = 15`

- [x] **Step 1: Escrever o teste que falha**

`server/tests/api/urlUploadAssinada.api.test.js`, molde de runner desta base (array `testes`, laço
final, `process.exit`). Cenários:

1. **RN-01 + controle positivo, nos DOIS mounts** — grave um arquivo em `uploadsAlmoxDir`; `GET`
   sem query nos dois prefixos → **404**; com a assinatura válida → **200 e o conteúdo certo**.
   Sem a metade positiva, o 404 passaria com o arquivo não existindo.
   > ⚠️ **Grave o arquivo com extensão `.png` e asserte o conteúdo por `res.body`, NUNCA por
   > `res.text`.** Medido na Fase 2: o `superagent` não parseia `image/*`, então `res.text` vem
   > `undefined` e `res.body` vem `Buffer`. A leitura natural ("o conteúdo certo" → `res.text`,
   > que é o molde JSON do resto desta base) **reprova com a feature funcionando**.
   > Use `assert.ok(Buffer.from(res.body).equals(CONTEUDO))`.
2. **RN-02** — assine `a.png`, use o `sig` e o `exp` dele na URL de `b.png` → 404. E o controle:
   a assinatura de `b.png` funciona em `b.png`.
3. **RN-03** — `exp` no passado → 404; o mesmo arquivo com `exp` no futuro → 200.
4. **RN-04** — troque **um** caractere do `sig` → 404.
5. **RN-07** — nenhuma das falhas acima pode responder 401 ou 403, e o corpo não pode conter o nome
   do arquivo nem a palavra "assinatura". Asserte o status **e** o corpo.
6. **Travessia** — `?exp&sig` válidos para `a.png`, mas caminho `../almoxarifado-anexos/x.pdf` →
   404 (o middleware confere o **nome pedido**, e o `express.static` não sai da raiz).
7. **Os anexos da Etapa 32 continuam intactos** — `GET /api/almoxarifado/anexos/:id/arquivo`
   segue 200 para quem tem sessão. É a regressão que esta etapa mais pode causar sem perceber.
8. **`sig` com 32 caracteres MULTIBYTE → 404, nunca 500** (achado 1 da Fase 2). Use
   `'á'.repeat(32)`: 32 caracteres, 64 bytes.
9. **Nome com `%` solto → 404, nunca 500** (achado 2): `GET .../foo%.png?exp=1&sig=abc`.
10. **Assinatura VÁLIDA para nome inexistente → 404, e `content-type` que não seja `text/html`**
    (achado 6): prova que o fecho depois do `static` existe, e não o `next()` que em produção
    cairia no SPA.

- [x] **Step 2: Rodar e ver falhar**

`cd server && node tests/api/urlUploadAssinada.api.test.js` → FAIL (`Cannot find module`).

- [x] **Step 3: O módulo**

```js
/**
 * URL assinada para os uploads LEGADOS do almoxarifado — Etapa 33 (furo C42).
 *
 * Ate aqui `uploads/almoxarifado` era servido por dois `express.static` SEM autenticacao nenhuma:
 * quem tivesse a URL baixava deslogado o certificado do fornecedor, o comprovante de sucateamento
 * e a IMAGEM DA ASSINATURA de quem retirou material. A defesa era o nome do arquivo — obscuridade.
 *
 * NAO usamos `?token=` com o JWT de sessao, embora `authenticateToken` o aceite: esta base ja
 * recusou esse caminho com raciocinio escrito (RelatoriosAlmoxarifado.js:34-37) — o JWT nao expira
 * em minutos, abre o CRM inteiro, e iria para o historico do navegador, o Referer e o log do nginx.
 * A assinatura daqui NAO e credencial de sessao: vale para UM arquivo por 15 minutos.
 */
const crypto = require('crypto');

const MINUTOS_VALIDADE = 15;
const PREFIXO = '/api/uploads/almoxarifado';

function criarAssinadorUpload(segredo) {
  if (!segredo) throw new Error('urlUpload: segredo obrigatorio');

  // O NOME DO ARQUIVO entra no HMAC. Sem ele, uma assinatura valida para `material-1.png` serviria
  // para `assinatura-9.png` — o erro classico deste padrao, e o unico motivo da RN-02.
  const calcular = (filename, exp) => crypto
    .createHmac('sha256', segredo)
    .update(`${filename}:${exp}`)
    .digest('hex')
    .slice(0, 32);

  function assinar(filename) {
    const nome = String(filename || '').trim();
    if (!nome) return null;
    // `exp` em BALDE de 5 minutos, e nao `now + 900` cru: sem isso o `exp` muda a cada segundo,
    // toda carga de lista gera URLs ineditas e o cache do navegador nunca reaproveita nada —
    // regressao de performance justamente na tela de N imagens que a letra B usou para justificar
    // este desenho. Com o balde, a URL do mesmo arquivo e estavel por 5 min e a regua de seguranca
    // nao muda (a validade efetiva fica entre 15 e 20 min).
    const agora = Math.floor(Date.now() / 1000);
    const exp = Math.ceil(agora / 300) * 300 + MINUTOS_VALIDADE * 60;
    return `${PREFIXO}/${encodeURIComponent(nome)}?exp=${exp}&sig=${calcular(nome, exp)}`;
  }

  // O formato e conferido ANTES de virar buffer, e isso nao e zelo: `sig.length` conta
  // CARACTERES e `timingSafeEqual` compara BYTES. Um sig com 32 caracteres acentuados tem 64
  // bytes, o guard de length passava, e o timingSafeEqual LANCAVA RangeError -> 500, violando a
  // RN-07. Medido na Fase 2 — e o pior e que a sabotagem da RN-04 ("troque um caractere do sig")
  // ativa exatamente isso se o caractere escolhido for acentuado, num plano escrito em portugues:
  // o executor veria 500 e iria depurar a coisa errada.
  const HEX32 = /^[0-9a-f]{32}$/;

  function verificar(filename, exp, sig) {
    const n = Number(exp);
    if (!Number.isInteger(n) || n * 1000 < Date.now()) return false;
    if (typeof sig !== 'string' || !HEX32.test(sig)) return false;
    const esperado = calcular(filename, String(exp));
    const recebido = Buffer.from(sig, 'utf8');
    const alvo = Buffer.from(esperado, 'utf8');
    if (recebido.length !== alvo.length) return false;
    return crypto.timingSafeEqual(recebido, alvo);
  }

  // 404 em TODA falha, nunca 401/403: um 401 confirmaria que o arquivo existe, que e exatamente a
  // informacao que a obscuridade de hoje protege por acidente. Quem enumera nao aprende nada.
  function middleware(req, res, next) {
    let nome;
    try {
      // `%` solto no nome (`/foo%.png`) faz decodeURIComponent lancar URIError -> 500. Medido na
      // Fase 2 pela rota real: `req.path` chega NAO decodificado, entao quem estoura e este
      // decode. 500 tambem viola a RN-07, porque e um status distinto de 404.
      nome = decodeURIComponent(String(req.path || '').replace(/^\/+/, ''));
    } catch (e) {
      return res.status(404).end();
    }
    if (!nome || nome.includes('/') || nome.includes('\\')) return res.status(404).end();
    if (!verificar(nome, req.query.exp, req.query.sig)) return res.status(404).end();
    return next();
  }

  return { assinar, verificar, middleware, MINUTOS_VALIDADE };
}

module.exports = { criarAssinadorUpload, MINUTOS_VALIDADE, PREFIXO };
```

- [x] **Step 4: A fiação nos dois mounts**

Em `routes/almoxarifado.js`, onde hoje estão os dois `express.static` (procure por
`'/api/uploads/almoxarifado'`; confira a linha real antes de editar):

```js
  // Etapa 33 (C42): os dois mounts deixam de ser publicos. O verificador vem ANTES do static e
  // so olha `exp`+`sig` — sem banco e sem sessao, de proposito: ele roda em TODA imagem de TODA
  // lista, e nao pode custar uma consulta.
  const assinadorUpload = criarAssinadorUpload(resolveJwtSecret(PERSISTENT_DATA_DIR));
  app.use('/api/uploads/almoxarifado', assinadorUpload.middleware, require('express').static(uploadsAlmoxDir));
  app.use('/uploads/almoxarifado', assinadorUpload.middleware, require('express').static(uploadsAlmoxDir));
  // FECHO obrigatorio: `express.static` chama next() quando o arquivo NAO existe, e em producao a
  // requisicao continua descendo ate o catch-all do SPA (index.js:23213 monta o build do client na
  // raiz, e o modulo e registrado ANTES). Sem estas duas linhas, uma assinatura VALIDA para um nome
  // inexistente devolve **200 com o HTML do SPA** dentro de um <img>. Medido na Fase 2. E pior: no
  // harness, que nao tem catch-all, o comportamento e OUTRO — entao o teste passaria por um motivo
  // que producao nao tem.
  app.use('/api/uploads/almoxarifado', (req, res) => res.status(404).end());
  app.use('/uploads/almoxarifado', (req, res) => res.status(404).end());
```

E exponha `assinadorUpload` para a extended (6º parâmetro de `registerExtendedRoutes`) e para os
serviços da Task 2 — **passando adiante**, nunca re-derivando.

- [x] **Step 5: Rodar, ver passar, e sabotar**

Sabotagens, uma por vez, revertendo depois de cada:

1. Tire o `filename` do HMAC (`update(String(exp))`) → **RN-02 tem de cair**.
2. Tire a checagem de `exp` → **RN-03 cai**.
3. Troque `res.status(404)` por `res.status(401)` → **RN-07 cai**.
4. Remova o `middleware` de **um** dos dois mounts → **RN-01 cai no mount que ficou aberto**. Se
   cair só num, confirme que o cenário testa os dois.

- [x] **Step 6: Commit** (`msg-assinatura.txt`)

---

### Task 2: As três famílias passam a minar URL assinada  **(tronco)**

**Files:**
- Modify: `server/services/almoxarifado/materialPhoto.js`
- Modify: `server/services/almoxarifado/deliverySignatureService.js` (`:20`)
- Modify: `server/services/almoxarifado/lotService.js` (`listarLotesDoMaterial`, `:203`)
- Modify: `server/routes/requisicoesMaterial.js` (`:288` — **o endpoint que não enriquece**)
- Modify: `server/tests/api/fotoMaterialRastro.api.test.js` (`:138` — igualdade exata da URL)
- Modify: `server/tests/api/anexoDocumento.api.test.js` (`:180-190` — o controle positivo que
  **afirma o furo**)
- Modify: `server/tests/materialPhoto.test.js` (órfão — ver o passo próprio)
- Modify: `server/tests/api/urlUploadAssinada.api.test.js` (cenários novos)

**Interfaces:** consome `assinar(filename)` da Task 1.

> **A dificuldade real desta task é de INJEÇÃO, não de lógica** — e a Fase 2 mediu que a solução
> que este plano trazia estava incompleta em dois pontos e quebrada num terceiro.
>
> **`materialPhoto.js`** é módulo puro importado em 6 pontos e não tem como conhecer o segredo.
> Fica a inicialização única (`materialPhoto.configurarAssinador(assinador)` no registrador),
> **mas com três correções obrigatórias, todas medidas:**
>
> 1. **O singleton é global ao PROCESSO, e cada `createTestApp()` gera um segredo DIFERENTE**
>    (`testApp.js` faz `mkdtempSync` por app e `JWT_SECRET` não está no ambiente de teste —
>    medido: dois apps no mesmo processo produzem segredos distintos, e o app A deixa de validar as
>    próprias URLs assim que o app B configura). **14 arquivos de `tests/api/` criam mais de um app
>    no mesmo processo.** Correção: fixar `process.env.JWT_SECRET = process.env.JWT_SECRET ||
>    'test-secret-almoxarifado'` no topo de `createTestApp`. Resolve a divergência **e** cala as 30
>    linhas de `console.log` de `runtimeSecrets.js:52`, que ainda por cima imprimem um caminho
>    errado (dizem `server/data/` quando o segredo foi para o tmp).
> 2. **O cenário "sem configurar, lança" é dependente de ORDEM** — depois de qualquer
>    `createTestApp()` o módulo já está configurado e ele reprova sem motivo real. Ele tem de ser
>    **o primeiro `test()` do arquivo**, ou o assinador tem de ser zerado (`configurarAssinador(null)`)
>    dentro dele. Escreva qual dos dois no cenário.
> 3. **`lotService` e `deliverySignatureService` NÃO usam o singleton** — o plano tratava as duas
>    como "modificar a linha X" e isso esconde o mesmo problema em mais dois lugares. Elas recebem o
>    assinador **por argumento**, porque os call sites são poucos e o estado global não se paga:
>    - `listarLotesDoMaterial(db, materialId, { apenasComSaldo, assinador })` — **1** call site
>      (`extended.js:1047`);
>    - `registrarAssinatura(db, user, reqId, dados, assinador)` e
>      `listarAssinaturas(db, reqId, assinador)`, com `montarResposta(row, assinador)` — **2** call
>      sites (`extended.js:1652` e `almoxarifado.js:3013`).
>    E `MATERIAL_PHOTO_API_PREFIX` deixa de ser usado por `deliverySignatureService` (o prefixo passa
>    a vir de `urlUpload`): o import da linha 12 vira **morto** e sai.
>
> **Registrar na letra B:** `configurarAssinador` é estado global de processo, aceito só para
> `materialPhoto` porque são 6 call sites; a alternativa descartada é passar o assinador nos seis.
>
> 4. **UM ponto de mintagem, e `MATERIAL_PHOTO_API_PREFIX` SAI do `module.exports`.** Enquanto o
>    prefixo for exportável, qualquer módulo remonta URL crua e o guard de "lançar sem assinador"
>    não vale nada — foi assim que `deliverySignatureService.js:20` montou a dele sem passar por
>    `materialPhotoUrl`. Com o prefixo privado, a sabotagem "devolver URL sem assinatura" derruba
>    **as três** famílias, e não uma.

**Um endpoint que a Fase 0 não viu, e que sozinho quebraria uma tela:**

`server/routes/requisicoesMaterial.js:288` faz `.map(sanitizeRequisicaoItemForSector)` **sem**
`enrichMaterialRow` — enquanto o irmão da linha 153 enriquece. Acrescente:

```js
const itensSanitizados = (itens || []).map((row) => enrichMaterialRow(sanitizeRequisicaoItemForSector(row)));
```

(`enrichMaterialRow` já está importado em `:19`.) E um cenário: `GET /api/requisicoes-material/:id`
→ `itens[].foto` **assinado**. Sem isso, a Task 3 apaga a miniatura de "Minhas Requisições".

**Dois testes de API existentes vão ficar vermelhos, e um deles é o pior tipo:**

- **`anexoDocumento.api.test.js:180-190`** — o cenário `[CONTROLE POSITIVO] o mesmo arquivo DENTRO
  de uploads/almoxarifado sai publico (200)` **afirma como contrato que o estático responde 200 sem
  assinatura**. Ele tem de ser **reescrito, não apagado**: passa a exigir 200 **com assinatura
  válida**. Se for apagado, o 404 da RN-03 daquele arquivo (`:167`) volta a não provar nada — é o
  teste vazio que o CLAUDE.md nomeia.
- **`fotoMaterialRastro.api.test.js:138`** — `assert.strictEqual(res.body.foto_url, `/api/uploads/almoxarifado/${res.body.foto}`)`,
  igualdade exata. Troque por `startsWith(...)` mais a presença de `exp` e `sig`.
  (Conferido na Fase 2: `requisicaoAssinaturaEntrega.api.test.js:93` e `backupExposicao.api.test.js:74`
  **continuam passando** — não os toque.)

Cenários novos:

1. `GET /almoxarifado/materiais` devolve `foto_url` **com `exp` e `sig`**, e essa URL responde 200.
2. `GET /almoxarifado/materiais/:id/lotes` devolve `certificado_url` assinado quando há
   certificado, e **ausente** quando não há.
3. A assinatura de entrega devolve `arquivo_url` assinado, e ele responde 200.
4. **Sem `configurarAssinador`, `materialPhotoUrl` lança** — não devolve URL crua.

- [x] **Antes de commitar, trate `server/tests/materialPhoto.test.js`.** Ele chama
      `materialPhotoUrl` direto, sem configurar assinador, e **não é rodado por script nenhum** —
      o runner só descobre `tests/api/*.api.test.js`. Quando `materialPhotoUrl` passar a lançar,
      ele quebra **em silêncio**. Atualize-o para o contrato novo, ou apague-o dizendo no commit
      que estava órfão. Não deixe como está.
- [x] Steps: teste → falhar → implementar → passar → sabotar (devolver URL sem assinatura em cada
      uma das três famílias tem de derrubar o cenário correspondente) → commit (`msg-familias.txt`).

---

### Task 3: O client para de montar URL

**Files:**
- Modify: `client/src/utils/resolveMaterialPhotoUrl.js`
- Modify: `client/src/components/almoxarifado/LotesAlmoxarifado.js` (`:365`)
- Modify: os testes que congelam a URL pública: `LotesAlmoxarifado.test.js:298`,
  `RequisicoesList.test.js:155,289`

O helper passa a: devolver a URL que já vem do servidor **preservando a query**, e **`''`** para
qualquer outra coisa — em vez de fabricar endereço que responderá 404. Comente o porquê: troca
defeito silencioso (imagem quebrada sem erro) por ausência explícita.

> ⚠️ **Remova SÓ o bloco de remontagem (`:14-20`). O bloco de origem (`:22-28`) FICA.** Ele
> prefixa o host quando `api.defaults.baseURL` é absoluto (`REACT_APP_API_URL` cross-origin), e
> implementar "devolve intacta" ao pé da letra tornaria a URL relativa à origem do **client**, não
> à da API. Um cenário com `baseURL = 'https://api.exemplo/api'` tem de provar que a origem
> continua prefixada **e** a query preservada.

**E o plano previa vermelho onde vai dar VERDE — corrigido aqui:**

- `LotesAlmoxarifado.test.js:290-298` **quebra de verdade**, e já em `:296`: o componente passa a
  ler `l.certificado_url`, que o fixture não tem. Troque o fixture para `certificado_url`, senão o
  texto "anexado em" também some e o executor vai caçar um bug que ele mesmo criou.
- `RequisicoesList.test.js:155` é **fixture**, não asserção. E `:289` usa `.includes(...)`, com a
  query entrando como **sufixo** — ele **passa antes e depois**, inclusive com a feature quebrada,
  porque o fixture é escrito à mão. Não prometa vermelho ali: **mude o fixture para uma URL
  assinada** e asserte que o `src` **preserva a query**. É o único jeito de o cenário reprovar se o
  helper voltar a mutilar a URL.
  (Varredura confirmada: só esses três arquivos citam `uploads/almoxarifado` em teste de client;
  `LotesAlmoxarifado.test.js:307` continua passando.)

**Acrescente `onError` nos quatro `<img>`** (`MateriaisAlmoxarifado.js:251`,
`RequisicaoMaterialCesta.js:245,294`, `RequisicoesList.js:929`, `MaterialAlmoxarifadoForm.js:941`):
hoje **não há `onError` em componente nenhum** do módulo, então assinatura expirada mostra o
**ícone de imagem quebrada** do navegador. Degradar para o mesmo visual de "sem foto" é uma linha, e
importa mais do que parece porque `RequisicaoMaterialCesta` usa `loading="lazy"`: numa cesta longa
o usuário rola **depois** de 15 minutos e pega 404 em imagens que nunca chegaram a carregar — e
aquela tela é a de uso mais demorado do módulo.

- [x] Steps: teste → falhar → implementar → passar → sabotar (fazer o helper remontar a partir do
      nome tem de derrubar o cenário do `''`) → commit (`msg-client.txt`).

---

### Task 4: Integração e fechamento

- [x] Um cenário que percorre **servidor → tela**: pedir o material pela rota, pegar o `foto_url`
      que veio, e provar que **aquela URL exata** responde 200 no mount estático — sem o teste
      montar a URL por conta própria. É o único cenário que prova que as duas metades se encaixam.
- [x] As cinco suítes + client + build.
- [x] **Fase 5** — revisores frescos, lentes: (a) a assinatura resiste a replay, truncamento e
      confusão de arquivo? (b) alguma tela ficou sem imagem sem ninguém notar? (c) "este teste
      passaria com a feature quebrada?", com foco no cenário que usa a URL **devolvida** em vez de
      montada.
- [x] `fechar-etapa` inteira. **Letra C: o C42 sai da lista** (riscado, não apagado, com o commit
      que o fechou). **Letra B:** a validade de 15 minutos e o descarte do `fetch`+blob.
      **Letra A:** nenhuma consulta nova — mas **avise que URLs de imagem copiadas antes do deploy
      param de funcionar**, e que quem já baixou continua com o arquivo (fechar a porta não recolhe
      o que saiu).

---

## Fechamento (2026-09-03)

| Task | Commit | Medido |
|---|---|---|
| 1 — assinatura e middleware | `666e80a` | 10/10 · `test:api` 168/168 |
| 2 — as três famílias minando URL | `88b00ee` | `test:api` 169/169 |
| 3 — client para de montar URL | `4531b1c` | client 43 suítes / 654 testes |
| 4 — integração | `65811d2` | `urlUploadAssinada` 12/12 |

### Onde a execução divergiu do plano

1. **A RN-03 nasceu VAZIA, e o plano não previu.** O cenário usava um `sig` inválido para o `exp`
   no passado, então o 404 vinha da assinatura errada e **não do tempo** — a sabotagem que remove
   a checagem de `exp` ficava verde. Corrigido calculando o HMAC **correto** de um `exp` vencido,
   que é o único ponto do arquivo em que o teste assina por conta própria, e está dito lá por quê.
2. **Uma sabotagem prevista fica verde, e está CERTO.** Trocar o prefixo de `/api/uploads` para
   `/uploads` em `assinar()` não derruba nada — os dois mounts servem o mesmo diretório com o
   mesmo middleware, então não é defeito. É o caso "o defeito virou inalcançável" da skill:
   registrado, não forçado.
3. **A sabotagem que assina o CAMINHO em vez do nome também fica verde no arquivo de rota**,
   porque o multer nunca gera nome com caminho. Quem a pega é `materialPhotoAssinada`, que cobre
   a coluna legada. Duas suítes, dois recortes — está escrito nos dois.
4. **A sabotagem da fiação DERRUBA O PROCESSO** em vez de derrubar um cenário: sem
   `configurarAssinador`, `materialPhotoUrl` lança no primeiro upload. É o comportamento
   desenhado (falhar alto em vez de devolver URL crua), e o "vermelho" dele é o stack trace.
5. **`server/tests/materialPhoto.test.js` foi APAGADO, não corrigido.** Ele era órfão — nenhum
   script npm o rodava — e congelava as URLs sem assinatura como contrato. Virou
   `tests/api/materialPhotoAssinada.api.test.js`, onde o runner o enxerga. Resolver pelo sintoma
   (atualizar o arquivo órfão) o deixaria órfão de novo.

### Retro de 4 números

1. **Rodadas de correção até verde: 0.** Nenhum fix-round: os 18 achados da Fase 2 entraram no
   plano **antes** da execução, e a Fase 5 rodou depois do código pronto.
2. **Achados: 18 na Fase 2, 0 ruído.** **Seis travariam a execução**, e dois deles são a mesma
   classe: código que responde **500** onde o contrato promete 404. O mais instrutivo é que **a
   sabotagem prescrita pelo próprio plano ativava um deles** — "troque um caractere do `sig`",
   num plano escrito em português, com um caractere acentuado.
3. **Paralelismo: ZERO, declarado desde o plano.** As quatro tasks são a mesma régua atravessando
   as camadas. **Zero retrabalho** — e a decisão se pagou: a Task 2 mudou o contrato que a Task 3
   consome (o `certificado_url`), o que teria custado uma rodada se as duas tivessem corrido em
   paralelo.
4. **Defeito que escapou:** preencher na etapa seguinte.

**Quinto número: 3 testes passavam com a feature quebrada** — a RN-03 (achado meu, durante a
execução), `RequisicoesList.test.js:289` (achado da Fase 2: `.includes()` sobre fixture escrito à
mão passava **antes, depois e com a feature quebrada**) e `anexoDocumento.api.test.js:180`, que
não passava por acidente: ele **afirmava o furo como contrato**.

### Lição da etapa: o teste mede o pedaço do estado que ele usa para montar a entrada

A RN-03 montava a URL com um `sig` qualquer e um `exp` vencido — dois pedaços, e só um deles era o
que estava sob teste. O 404 chegava pelo pedaço errado. `RequisicoesList.test.js:289` montava a
asserção com `.includes()` sobre um fixture escrito à mão: o pedaço verificado (o prefixo) não
era o que a etapa mudou (a query).

**É a terceira etapa seguida com a mesma forma** — na 29 foi fixture simétrica, na 31 foram
exemplos que só separavam por comprimento, e na 32 foi uma URL montada pelo *basename* em vez do
caminho. A regra que fica: **quando o teste constrói a entrada a partir de um pedaço do estado em
vez do estado inteiro, ele mede o pedaço.** O antídoto é o mesmo das três: pedir ao sistema o
estado inteiro (a URL que o servidor devolveu) e usá-lo cru.

## Próxima tarefa detalhada

**Plugar os anexos nas outras cinco telas** — material, requisição, recebimento, devolução e item
de remessa. É o item de maior valor por unidade de trabalho no módulo: backend testado,
componente genérico pronto, contrato congelado.

O contrato completo está no plano da Etapa 32
(`docs/superpowers/plans/2026-09-02-almoxarifado-etapa32-anexos.md`, seção "Próxima tarefa
detalhada"): props, `data-testid`, e o ponto de atenção sobre **quando o `id` existe** em cada
tela — foi o que derrubou a Task 4 daquela etapa no plano original.

**Um ponto de atenção NOVO, desta etapa:** as telas que ganharem o bloco de anexos e também
exibirem foto precisam receber a foto **já assinada** do servidor. Se o endpoint daquela tela não
passar por `enrichMaterialRow`, a foto some — foi exatamente isso que aconteceu com
`requisicoesMaterial.js`. Antes de plugar, confira o endpoint.

## Fase 2 — o que a revisão do plano pegou ANTES de executar

Dois revisores frescos, lentes distintas (corretude da assinatura e dos contratos de código;
cobertura real do que quebra em tela). **18 achados, 0 ruído: 6 travariam a execução**, 4 são
defeito silencioso, 8 menores. Tudo reproduzido rodando código.

### Os seis que travariam

1. **`crypto.timingSafeEqual` lança `RangeError` → 500.** O guard comparava `sig.length`
   (**caracteres**) enquanto `timingSafeEqual` compara **bytes**: um `sig` de 32 caracteres
   acentuados tem 64 bytes, passava pelo guard e estourava. Viola a RN-07 (500 ≠ 404) e é um DoS
   de exceção não tratada. **E a sabotagem que o próprio plano manda fazer — "troque um caractere
   do `sig`" — ativa exatamente isso** se o caractere for acentuado, num plano escrito em
   português: o executor veria 500 e depuraria a coisa errada.
2. **`decodeURIComponent` lança `URIError` → 500** para `%` solto (`/foo%.png`). Medido pela rota
   real: `req.path` chega **não decodificado**, então é o decode do middleware que estoura.
3. **`materialPhoto.js` NÃO é o ponto único que a Fase 0 afirmou.**
   `requisicoesMaterial.js:288` devolve `itens[].foto` **cru**, e `RequisicoesList.js:929` o
   renderiza — a Task 3 apagaria a miniatura de "Minhas Requisições" **em silêncio**.
4. **Dois testes de API existentes ficariam vermelhos e não estavam listados** — e um deles,
   `anexoDocumento.api.test.js:180-190`, **afirma como contrato que o estático responde 200 sem
   assinatura**. Se for apagado em vez de reescrito, o 404 da RN-03 daquele arquivo volta a não
   provar nada.
5. **O cenário "sem configurar, `materialPhotoUrl` lança" é dependente de ORDEM** e impossível de
   passar depois de qualquer `createTestApp()` — e, pior, **cada app de teste gera um segredo
   diferente** (`mkdtempSync` por app, `JWT_SECRET` ausente do ambiente): dois apps vivos no mesmo
   processo fazem o primeiro deixar de validar as próprias URLs. **14 arquivos de `tests/api/`
   criam mais de um app por processo.**
6. **`supertest` devolve `res.text === undefined` para `.png`.** A leitura natural de "asserte o
   conteúdo" (`res.text`, o molde JSON do resto da base) **reprova com a feature funcionando**.

### Os silenciosos

- **Assinatura válida para arquivo inexistente cai no `next()` do `express.static`** e, em
  produção, desce até o catch-all do SPA: o `<img>` recebe **200 com HTML**. No harness, que não
  tem catch-all, o comportamento é outro — o teste passaria por um motivo que produção não tem.
- **A injeção só estava desenhada para uma das três famílias.** `deliverySignatureService.js:20`
  monta a URL com o prefixo importado, **sem** passar por `materialPhotoUrl`: o guard de "lançar
  sem assinador" não o alcança, e a assinatura de entrega viraria o furo de volta com tudo verde.
  Correção: um ponto único de mintagem **e** `MATERIAL_PHOTO_API_PREFIX` sai do `module.exports` —
  enquanto ele for exportável, qualquer módulo remonta URL crua.
- **`RequisicoesList.test.js:289` NÃO quebra — e esse é o problema.** O `.includes()` sobre um
  fixture escrito à mão passa antes, depois, e **com a feature quebrada**.
- **`server/tests/materialPhoto.test.js` congela as URLs sem assinatura e nenhum script npm o
  roda.** Ele quebraria em silêncio, continuando a afirmar no repositório que a URL é pública.

### Duas medições que mudaram o desenho, não só o plano

- **`exp` mudava a cada segundo**, então toda carga de lista geraria URLs inéditas e o cache do
  navegador nunca reaproveitaria nada — regressão de performance **justamente na tela de N
  imagens** que a letra B usou para justificar o desenho. Passou a balde de 5 minutos.
- **Não há `onError` em componente nenhum do módulo**, e `RequisicaoMaterialCesta` usa
  `loading="lazy"`: numa cesta longa o usuário rola **depois** dos 15 minutos e pega 404 em imagens
  que nunca chegaram a carregar, vendo o ícone de imagem quebrada. Vira uma linha por `<img>`.

### O que os dois confirmaram, e sustenta a etapa

A régua de travessia resiste (`..%2f`, subpasta, raiz do mount); `?sig=a&sig=b` vira array e cai no
`typeof`; `exp` em formatos exóticos não forja assinatura de outro; **fuso é irrelevante** (mesmo
processo, epoch UTC nos dois lados); o cache do navegador **revalida** (`max-age=0` + ETag), então
a RN-03 vale de fato na tela; os **anexos da Etapa 32 ficam intactos** (diretório irmão, fora dos
dois mounts, com rota autenticada própria); `<a href target="_blank">` com URL assinada **funciona**,
porque é navegação do browser e o middleware só lê `path` e `query`; **nenhuma geração de PDF ou
etiqueta** embute arquivo de `uploads/almoxarifado` (o único `addImage` do client é o QR code,
gerado no browser); e a coluna `foto` **não** está em `MATERIAL_UPDATE_COLUMNS`, então não há risco
de gravar uma URL assinada de volta no banco.
