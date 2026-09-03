# Etapa 33 — Os arquivos antigos param de ser públicos: implementação

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recomendado)
> ou superpowers:executing-plans. Passos com checkbox (`- [ ]`).

**Goal:** fechar o furo **C42** — os uploads legados do almoxarifado deixam de ser alcançáveis sem
assinatura, sem quebrar as três telas que os exibem.

**Architecture:** um módulo puro de assinatura (HMAC sobre `nome:exp`), um middleware que a verifica
na frente dos **dois** mounts estáticos, e o servidor passando a **minar** a URL nas três famílias
exibidas — a foto de material (ponto único que já existe), o certificado de lote e a assinatura de
entrega. O client para de montar endereço a partir de nome de coluna.

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
| `server/routes/almoxarifado.js` **(modificar, `:236-237`)** | middleware na frente dos dois mounts | 1 |
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

**Files:**
- Create: `server/services/almoxarifado/urlUpload.js`
- Create: `server/tests/api/urlUploadAssinada.api.test.js`
- Modify: `server/routes/almoxarifado.js` (bloco dos dois `express.static`, hoje `:236-237`)

**Interfaces:**
- Consumes: `resolveJwtSecret(PERSISTENT_DATA_DIR)` de `services/runtimeSecrets.js`.
- Produces, e as Tasks 2 e 4 dependem destes nomes:
  - `criarAssinadorUpload(segredo)` → `{ assinar(filename), verificar(filename, exp, sig), middleware }`
  - `assinar(filename)` → `"<prefixo>/<filename>?exp=<unix>&sig=<hex>"` (URL relativa, pronta para `<img src>`)
  - `MINUTOS_VALIDADE = 15`

- [ ] **Step 1: Escrever o teste que falha**

`server/tests/api/urlUploadAssinada.api.test.js`, molde de runner desta base (array `testes`, laço
final, `process.exit`). Cenários:

1. **RN-01 + controle positivo, nos DOIS mounts** — grave um arquivo em `uploadsAlmoxDir`; `GET`
   sem query nos dois prefixos → **404**; com a assinatura válida → **200 e o conteúdo certo**.
   Sem a metade positiva, o 404 passaria com o arquivo não existindo.
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

- [ ] **Step 2: Rodar e ver falhar**

`cd server && node tests/api/urlUploadAssinada.api.test.js` → FAIL (`Cannot find module`).

- [ ] **Step 3: O módulo**

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
    const exp = Math.floor(Date.now() / 1000) + MINUTOS_VALIDADE * 60;
    return `${PREFIXO}/${encodeURIComponent(nome)}?exp=${exp}&sig=${calcular(nome, exp)}`;
  }

  function verificar(filename, exp, sig) {
    const n = Number(exp);
    if (!Number.isInteger(n) || n * 1000 < Date.now()) return false;
    const esperado = calcular(filename, String(exp));
    if (typeof sig !== 'string' || sig.length !== esperado.length) return false;
    // timingSafeEqual so aceita buffers do MESMO tamanho — o guard de length acima e por isso.
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(esperado));
  }

  // 404 em TODA falha, nunca 401/403: um 401 confirmaria que o arquivo existe, que e exatamente a
  // informacao que a obscuridade de hoje protege por acidente. Quem enumera nao aprende nada.
  function middleware(req, res, next) {
    const nome = decodeURIComponent(String(req.path || '').replace(/^\/+/, ''));
    if (!nome || nome.includes('/') || nome.includes('\\')) return res.status(404).end();
    if (!verificar(nome, req.query.exp, req.query.sig)) return res.status(404).end();
    return next();
  }

  return { assinar, verificar, middleware, MINUTOS_VALIDADE };
}

module.exports = { criarAssinadorUpload, MINUTOS_VALIDADE, PREFIXO };
```

- [ ] **Step 4: A fiação nos dois mounts**

Em `routes/almoxarifado.js`, onde hoje estão os dois `express.static` (procure por
`'/api/uploads/almoxarifado'`; confira a linha real antes de editar):

```js
  // Etapa 33 (C42): os dois mounts deixam de ser publicos. O verificador vem ANTES do static e
  // so olha `exp`+`sig` — sem banco e sem sessao, de proposito: ele roda em TODA imagem de TODA
  // lista, e nao pode custar uma consulta.
  const assinadorUpload = criarAssinadorUpload(resolveJwtSecret(PERSISTENT_DATA_DIR));
  app.use('/api/uploads/almoxarifado', assinadorUpload.middleware, require('express').static(uploadsAlmoxDir));
  app.use('/uploads/almoxarifado', assinadorUpload.middleware, require('express').static(uploadsAlmoxDir));
```

E exponha `assinadorUpload` para a extended (6º parâmetro de `registerExtendedRoutes`) e para os
serviços da Task 2 — **passando adiante**, nunca re-derivando.

- [ ] **Step 5: Rodar, ver passar, e sabotar**

Sabotagens, uma por vez, revertendo depois de cada:

1. Tire o `filename` do HMAC (`update(String(exp))`) → **RN-02 tem de cair**.
2. Tire a checagem de `exp` → **RN-03 cai**.
3. Troque `res.status(404)` por `res.status(401)` → **RN-07 cai**.
4. Remova o `middleware` de **um** dos dois mounts → **RN-01 cai no mount que ficou aberto**. Se
   cair só num, confirme que o cenário testa os dois.

- [ ] **Step 6: Commit** (`msg-assinatura.txt`)

---

### Task 2: As três famílias passam a minar URL assinada  **(tronco)**

**Files:**
- Modify: `server/services/almoxarifado/materialPhoto.js`
- Modify: `server/services/almoxarifado/deliverySignatureService.js` (`:20`)
- Modify: `server/services/almoxarifado/lotService.js` (`listarLotesDoMaterial`, `:203`)
- Modify: `server/tests/api/urlUploadAssinada.api.test.js` (cenários novos)

**Interfaces:** consome `assinar(filename)` da Task 1.

> **A dificuldade real desta task é de INJEÇÃO, não de lógica.** `materialPhoto.js` é um módulo
> puro, sem estado, importado em 6 pontos; ele não tem como conhecer o segredo. As opções são
> passar o assinador como argumento (invasivo em 6 call sites) ou inicializar o módulo uma vez no
> boot. **Escolha a inicialização** (`materialPhoto.configurarAssinador(assinador)` chamada no
> registrador), e **escreva o cenário que prova o modo de falha**: sem configurar, `materialPhotoUrl`
> tem de **lançar**, nunca devolver URL sem assinatura em silêncio — que seria o furo de volta com
> a suíte verde.

Cenários novos:

1. `GET /almoxarifado/materiais` devolve `foto_url` **com `exp` e `sig`**, e essa URL responde 200.
2. `GET /almoxarifado/materiais/:id/lotes` devolve `certificado_url` assinado quando há
   certificado, e **ausente** quando não há.
3. A assinatura de entrega devolve `arquivo_url` assinado, e ele responde 200.
4. **Sem `configurarAssinador`, `materialPhotoUrl` lança** — não devolve URL crua.

- [ ] Steps: teste → falhar → implementar → passar → sabotar (devolver URL sem assinatura em cada
      uma das três famílias tem de derrubar o cenário correspondente) → commit (`msg-familias.txt`).

---

### Task 3: O client para de montar URL

**Files:**
- Modify: `client/src/utils/resolveMaterialPhotoUrl.js`
- Modify: `client/src/components/almoxarifado/LotesAlmoxarifado.js` (`:365`)
- Modify: os testes que congelam a URL pública: `LotesAlmoxarifado.test.js:298`,
  `RequisicoesList.test.js:155,289`

O helper passa a: devolver intacta a URL que já vem do servidor (com query), e **`''`** para
qualquer outra coisa — em vez de fabricar endereço que responderá 404. Comente o porquê: troca
defeito silencioso (imagem quebrada sem erro) por ausência explícita.

**Os dois testes que congelam a URL antiga vão ficar vermelhos, e isso é o esperado** — eles
afirmam exatamente o comportamento que esta etapa remove. Reescreva-os para o contrato novo
**dizendo no comentário que a expectativa antiga deixou de valer e por quê**, no molde do que a
Etapa 32 fez com o cenário (3) de `HistoricoInspecoes.test.js`.

- [ ] Steps: teste → falhar → implementar → passar → sabotar (fazer o helper remontar a partir do
      nome tem de derrubar o cenário do `''`) → commit (`msg-client.txt`).

---

### Task 4: Integração e fechamento

- [ ] Um cenário que percorre **servidor → tela**: pedir o material pela rota, pegar o `foto_url`
      que veio, e provar que **aquela URL exata** responde 200 no mount estático — sem o teste
      montar a URL por conta própria. É o único cenário que prova que as duas metades se encaixam.
- [ ] As cinco suítes + client + build.
- [ ] **Fase 5** — revisores frescos, lentes: (a) a assinatura resiste a replay, truncamento e
      confusão de arquivo? (b) alguma tela ficou sem imagem sem ninguém notar? (c) "este teste
      passaria com a feature quebrada?", com foco no cenário que usa a URL **devolvida** em vez de
      montada.
- [ ] `fechar-etapa` inteira. **Letra C: o C42 sai da lista** (riscado, não apagado, com o commit
      que o fechou). **Letra B:** a validade de 15 minutos e o descarte do `fetch`+blob.
      **Letra A:** nenhuma consulta nova — mas **avise que URLs de imagem copiadas antes do deploy
      param de funcionar**, e que quem já baixou continua com o arquivo (fechar a porta não recolhe
      o que saiu).

## Próxima tarefa detalhada

**Plugar os anexos nas outras cinco telas** — material, requisição, recebimento, devolução e item
de remessa. Contrato congelado no plano da Etapa 32 (`docs/superpowers/plans/2026-09-02-almoxarifado-etapa32-anexos.md`,
seção "Próxima tarefa detalhada"), com os `data-testid` e o ponto de atenção do `id`.
