# Etapa 33 — Os arquivos antigos do almoxarifado param de ser públicos

> **Data:** 2026-09-02 · **Furo que fecha:** **C42** · **Features tocadas:** 01 (foto de material),
> 10 (certificado de lote), 04 (assinatura de entrega)
> **Classificação:** arquitetural — muda a fronteira de autorização de arquivo do módulo inteiro e
> altera um contrato de resposta que seis componentes consomem.

## O problema, em uma frase

`server/routes/almoxarifado.js:236-237` monta os uploads do almoxarifado como `express.static`
**sem autenticação nenhuma**, em prefixo diferente do `/api/almoxarifado` autenticado da linha 243.
Quem tiver a URL baixa **deslogado**, de qualquer lugar: certificado do fornecedor, comprovante de
sucateamento e **a imagem da assinatura de quem retirou material**. A defesa atual é o nome do
arquivo (`Date.now()` + `random*1e9`) — obscuridade, não controle.

A Etapa 32 mediu e declarou o furo (**C42**); esta o fecha.

## Fase 0 — o que foi medido

### 1. Só TRÊS das seis famílias de upload são exibidas — as outras são write-only

| Família | Prefixo | Exibida onde | Como |
|---|---|---|---|
| Foto de material | `material-` | 6 componentes | `<img src>` via `resolveMaterialPhotoUrl` |
| Certificado de lote | `certificado-` | `LotesAlmoxarifado.js:360-365` | `<a href>` |
| **Assinatura de entrega** | `assinatura-` | `RequisicoesList.js:1014-1016` | `<a href>` + `<img src>` |
| Comprovante de sucateamento | `comprovante-sucata-` | **nenhum** | — |
| Certificado de calibração | `calibracao-` | **nenhum** | — |
| Foto de ocorrência | `ocorrencia-` | **nenhum** | — |

Varredura por `comprovante_arquivo`, `certificado_path` e `foto_ocorrencia` em `client/src`:
**zero ocorrências**. As três últimas são gravadas e nunca lidas. **Consequência para o escopo:**
fechar o estático **não quebra nada nelas** — elas simplesmente deixam de ser alcançáveis, que é o
objetivo. Nenhuma tela precisa mudar por causa delas.

> *A "próxima tarefa detalhada" do plano da Etapa 32 dizia que este trabalho "mexe em SEIS telas".
> **Estava errado nos dois sentidos** e já foi corrigido lá (`1a86615`): são **seis componentes**
> consumindo `resolveMaterialPhotoUrl`, mas apenas **três famílias** de arquivo, e três das seis
> famílias não têm consumidor nenhum.*

### 2. O servidor já monta a URL da foto num ponto único

`services/almoxarifado/materialPhoto.js` (`materialPhotoUrl` + `enrichMaterialRow(s)`) é chamado
em **6 pontos** de `routes/almoxarifado.js` e `routes/requisicoesMaterial.js`. `enrichMaterialRow`
**substitui** a coluna: `return { ...row, foto: url, foto_url: url }` — então o `m.foto` que o
client recebe de endpoint enriquecido **já é URL**, não nome de arquivo.

**Mas as outras duas famílias não têm esse ponto:** `LotesAlmoxarifado.js` recebe
`certificado_arquivo` **cru** e monta a URL no client; `RequisicoesList.js` recebe `arquivo_url`
e passa pelo mesmo helper.

### 3. `authenticateToken` já aceita `?token=` — e a base já REJEITOU esse caminho

`server/index.js:2874-2876` aceita o JWT na query string. Seria a correção de menor esforço:
`<img src="...?token=JWT">` funcionaria com o middleware que já existe.

**Não vamos por aí, e o motivo está escrito nesta base**, em
`client/src/components/almoxarifado/RelatoriosAlmoxarifado.js:34-37`:

> *"o servidor até aceita `?token=` como fallback — `authenticateToken` em server/index.js — mas
> isso vazaria o token na URL/histórico/logs, e nenhum outro download do app faz isso"*.

Reabrir essa decisão em silêncio seria o pior tipo de regressão: a que contradiz um raciocínio já
registrado. O JWT desta base **não expira em minutos** e dá acesso ao CRM inteiro; colocá-lo no
`src` de uma imagem o joga no histórico do navegador, no `Referer` e no log de acesso do nginx.

### 4. `resolveMaterialPhotoUrl` deixa passar URL pronta, e RECONSTRÓI nome cru

```js
if (!apiPath.startsWith('/api/uploads/almoxarifado/')) { /* remonta a partir do nome */ }
```

URL que já vem com o prefixo — **incluindo query string** — passa **intacta**. Nome de arquivo cru
é remontado. É exatamente a propriedade que decide o desenho: **uma URL assinada sobrevive ao
helper; um nome cru vira URL sem assinatura e quebra a imagem em silêncio.**

### 5. O segredo já existe e o registrador já tem o que precisa

`resolveJwtSecret(PERSISTENT_DATA_DIR)` (`services/runtimeSecrets.js`) resolve o segredo com
persistência em `server/data/`. O registrador do almoxarifado **já recebe `PERSISTENT_DATA_DIR`
como 4º parâmetro** — o mesmo caminho por onde o `uploadsAnexosDir` desceu na Etapa 32. Nada de
infraestrutura nova.

## Decisões de desenho

### D1 — URL assinada de vida curta, e não o token de sessão

O servidor passa a devolver a URL do arquivo já **assinada**:

```
/api/uploads/almoxarifado/material-1756...-482.png?exp=1756846800&sig=<hex>
```

`sig = HMAC-SHA256(segredo, "<nome do arquivo>:<exp>")`, truncado. Um middleware na frente dos dois
mounts estáticos recalcula e compara; sem assinatura válida, **404**.

**Por que assinada e não autenticada:**

1. **`<img src>` não manda header.** Qualquer solução baseada em `Authorization` obriga o client a
   buscar cada imagem por `fetch`/`blob` — e a foto de material aparece em **lista** (a cesta de
   requisição desenha um card por material). Cinquenta linhas viram cinquenta requisições com
   blob, cada uma precisando de `revokeObjectURL`, num helper que hoje é síncrono e teria de virar
   hook em seis componentes.
2. **A assinatura não é credencial de sessão.** Ela dá acesso a **um arquivo** por **poucos
   minutos**. Vazar essa URL num log vaza a capacidade de baixar aquele arquivo até expirar —
   incomparavelmente menos que vazar o JWT, que é o que a decisão do `RelatoriosAlmoxarifado`
   recusou. **Não estamos reabrindo aquela decisão; estamos respeitando o motivo dela.**
3. **Só o servidor mina URL.** Isso força a eliminação do maior defeito estrutural de hoje: o
   client montando endereço de arquivo a partir de um nome de coluna.

**Validade: 15 minutos**, o suficiente para a tela ser usada e curto o bastante para a URL copiada
não virar link permanente. Renovar é recarregar a tela — que é o que o usuário faz naturalmente.

**Alternativa descartada (letra B):** `fetch` + blob nos seis componentes. Não vaza nada em URL
nenhuma e é o padrão que a Etapa 32 usou para os anexos — mas ali é **um arquivo por clique**, e
aqui é **N por tela**. A troca é: um pouco mais de exposição (URL de um arquivo, 15 min) por muito
menos complexidade e nenhuma regressão de performance em lista.

### D2 — O middleware é de *assinatura*, não de sessão, e vem ANTES do `express.static`

```
app.use('/api/uploads/almoxarifado', verificarAssinatura, express.static(uploadsAlmoxDir));
app.use('/uploads/almoxarifado',     verificarAssinatura, express.static(uploadsAlmoxDir));
```

O middleware não consulta banco e não conhece usuário — só confere `exp` e `sig` contra o nome do
arquivo pedido. **Isso é deliberado:** ele roda em toda imagem de toda lista, e não pode custar uma
consulta.

**Resposta a falha: 404, nunca 401.** Um 401 confirmaria que o arquivo existe, que é a informação
que a obscuridade de hoje acidentalmente protege. Com 404, quem enumera não aprende nada.

**O nome do arquivo entra no HMAC.** Sem isso, uma assinatura válida para `foto-a.png` serviria
para `assinatura-secreta.png` — o erro clássico deste padrão.

### D3 — O client para de montar URL, e o helper passa a acusar quando alguém tentar

`resolveMaterialPhotoUrl` deixa de remontar a partir do nome. Ele passa a:

- devolver **intacta** qualquer URL que já venha do servidor (com ou sem query);
- devolver `''` para valor que **não** seja URL do prefixo — em vez de fabricar um endereço que
  responderá 404.

Isso transforma um defeito silencioso (imagem quebrada, sem erro) em ausência explícita, e é o que
o teste ancora: se algum ponto ainda passar nome cru, o `''` aparece e o cenário reprova.

**As três famílias passam a receber URL assinada do servidor:**

| Família | Onde a URL passa a ser minada |
|---|---|
| Foto de material | `materialPhoto.js` — o ponto único que já existe |
| Certificado de lote | a consulta que devolve `certificado_arquivo` ganha `certificado_url` |
| Assinatura de entrega | `deliverySignatureService` — onde `arquivo_url` nasce |

### D4 — O que NÃO muda

- **As três famílias write-only** (comprovante de sucateamento, certificado de calibração, foto de
  ocorrência) não ganham tela nem rota de download. Elas ficam **inalcançáveis**, que é o estado
  correto para arquivo que nada lê. Quando alguma tela precisar delas, ela pede a URL assinada ao
  servidor como as outras três.
- **Os anexos da Etapa 32 não são tocados.** Eles moram em diretório irmão, fora do estático, com
  download autenticado por rota própria — e continuam assim. São dois mecanismos com propósitos
  diferentes: anexo é documento com trilha; foto de material é ilustração de lista.
- **Nenhum arquivo é movido ou renomeado.** A migração é de *como se alcança*, não de *onde está*.

## Regras de negócio

| ID | Enunciado | Cenário que a prova |
|---|---|---|
| **RN-01** | Sem assinatura, o arquivo não sai — nem no `/api`, nem no `/uploads` | `GET` do nome real nos dois mounts → **404**, com o mesmo arquivo saindo **200** com assinatura válida |
| **RN-02** | A assinatura vale para **um** arquivo | assinatura de `a.png` usada em `b.png` → 404 |
| **RN-03** | A assinatura expira | `exp` no passado → 404, e o mesmo par volta 200 com `exp` no futuro |
| **RN-04** | Assinatura adulterada não passa | um caractere trocado no `sig` → 404 |
| **RN-05** | O servidor é o único que mina URL | o helper do client devolve `''` para nome cru, em vez de fabricar endereço |
| **RN-06** | As três famílias exibidas continuam funcionando | foto, certificado e assinatura carregam nas telas, pela URL que o servidor mandou |
| **RN-07** | Falha é 404, nunca 401 | nenhuma resposta do mount estático revela existência de arquivo |

## O que esta etapa NÃO cobre

1. **Rotação da assinatura em tela aberta por mais de 15 minutos.** A imagem passa a dar 404 até
   recarregar. É o corte consciente do D1 — tratar isso exigiria renovação em background, que é
   complexidade para um caso que o recarregamento resolve.
2. **Os arquivos já vazados.** Quem copiou uma URL antes do deploy não a usa mais (ela não tem
   assinatura), mas quem **baixou** o arquivo continua com ele. Fechar a porta não recolhe o que
   saiu.
3. **Expurgo/retenção de upload** — corte já declarado desde a feature 23.
