/**
 * Leitores de PLANILHA do modulo core Compras — o cabecalho da planilha em qualquer grafia.
 *
 * ── POR QUE ESTE ARQUIVO EXISTE (Etapa 38, Task 4) ────────────────────────────────────────────
 * Os cinco helpers abaixo nasceram em `server/index.js:20399-20446`, foram movidos VERBATIM para
 * `server/routes/compras.js` na Task 1 e moram aqui desde a Task 4 por um motivo concreto: a
 * importacao de PEDIDOS (`importarPedidos`, em `services/compras/pedidoCompraService.js`) tambem
 * precisa ler linha de planilha, e dentro de `routes/compras.js` eles estao presos no escopo do
 * registrador — inalcancaveis por `require`. As duas alternativas eram piores: copiar os leitores
 * daria DUAS regras de leitura de planilha no mesmo modulo (e a primeira edicao as separaria), e
 * exportar do arquivo de rotas criaria um CICLO de require (`routes/compras` ->
 * `pedidoCompraService` -> `routes/compras`). Um arquivo de servico, requerido pelos dois, nao tem
 * ciclo e mantem UM dono por regra.
 *
 * O bloco marcado abaixo e o MESMO bloco de 48 linhas, byte a byte (`md5sum` conferido:
 * `15ab9fe8d229e46240a508848efb5546`) — os helpers nao capturavam nada do escopo do registrador
 * (nem `db`, nem `uploads`), entao mover nao muda comportamento nenhum. A regua da movimentacao e
 * o cenario (5) de `tests/api/comprasPedidosRotas.api.test.js`, que exercita
 * `POST /api/compras/fornecedores/:fornecedorId/itens/importar`, o unico chamador deles.
 *
 * ⚠️ `normalizarCampo` NAO TEM CHAMADOR — e nao e esquecimento desta task: ela ja era codigo morto
 * em `index.js` antes da extracao (medido: zero chamadores no arquivo de 20 mil linhas). Veio junto
 * porque apaga-la e decisao de limpeza do core, fora do escopo desta etapa; esta dito aqui para o
 * proximo leitor nao procurar o uso que nao existe.
 *
 * ── ⚠️ OS DOIS HELPERS DE PRECO NAO SERVEM PARA QUANTIDADE, e isso foi MEDIDO ─────────────────
 *
 * 1. `parsePrecoBackend` aplica a regra pt-BR: **apaga todos os pontos** e troca a virgula por
 *    ponto antes do `parseFloat`. E correto para `'1.234,50'` (→ 1234.5) e **destrutivo** para
 *    `'1.5'`, que vira **15**. `extrairDoRow`, por sua vez, devolve **sempre String**, entao uma
 *    celula numerica `1.5` do `.xlsx` chega ao parse como `'1.5'` e sai 15. Em
 *    `itens_pedido_compra.quantidade` — a coluna que a Etapa 37 le como `quantidade_pedida` — isso
 *    faria o recebimento oferecer DEZ VEZES o que foi comprado, e o saldo do pedido nunca fecharia.
 *    Dai `numeroDaPlanilha`: **cru primeiro**.
 *
 * 2. `extrairPrecoDoRow` tem um fallback GULOSO — se nenhuma das chaves conhecidas casar, ele
 *    varre `Object.keys(row)` e devolve o primeiro valor "numerico". E `parsePrecoBackend` **nunca
 *    devolve NaN** (devolve 0), entao o `if (!isNaN(n)) return n` aceita a PRIMEIRA chave nao vazia
 *    da linha: para `{ pedido: 'OC-A', qtd: 3, 'preço unitario': 10 }` ele devolve **0** (de
 *    `'OC-A'`). Serve a rota de itens do fornecedor, onde a planilha e uma lista de precos e errar
 *    para 0 e aceitavel; NAO serve o pedido de compra, onde o preco alimenta `valor_total` e o
 *    custo medio do recebimento. A importacao de pedidos le o preco por candidatos EXPLICITOS,
 *    sem fallback guloso.
 *
 * Testes: `server/tests/api/comprasPedidoImportar.api.test.js` (cenarios 2, 4 e 6) e
 *         `server/tests/api/comprasPedidosRotas.api.test.js` (cenario 5, a rota que os herdou).
 */

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// INICIO DO BLOCO MOVIDO VERBATIM (`index.js:20399-20446` -> `routes/compras.js` na T1 -> aqui)
// md5sum das 48 linhas seguintes: 15ab9fe8d229e46240a508848efb5546 — NAO reformate.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
function normalizarCampo(s) {
  if (s == null || s === '') return '';
  return String(s).trim();
}
function parsePrecoBackend(val) {
  if (val == null || val === '') return 0;
  if (typeof val === 'number' && !isNaN(val)) return val;
  const s = String(val).trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}
function extrairDoRow(row, ...candidatos) {
  for (const k of candidatos) {
    const v = row[k];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}
function extrairPrecoDoRow(row) {
  const chavesPreco = ['preco', 'preço', 'valor', 'valor unitario', 'valor unitário', 'price', 'vlr', 'preco unitario', 'preço unitário', 'valor unit', 'preco unit', 'valor_unitario', 'preco_unitario'];
  for (const k of chavesPreco) {
    const v = row[k];
    if (v != null && v !== '') {
      const n = parsePrecoBackend(v);
      if (!isNaN(n)) return n;
    }
  }
  for (const k of Object.keys(row || {})) {
    const v = row[k];
    if (v == null || v === '') continue;
    if (typeof v === 'number' && !isNaN(v)) return v;
    const n = parsePrecoBackend(v);
    if (!isNaN(n)) return n;
  }
  return 0;
}
function extrairDescricaoDoRow(row) {
  const desc = extrairDoRow(row, 'descricao', 'descrição', 'descricao_produto', 'descricao produto', 'produto', 'item', 'nome', 'designacao', 'designação', 'material', 'especificacao', 'denominacao', 'nome do produto', 'desc');
  if (desc) return desc;
  for (const k of Object.keys(row || {})) {
    const v = row[k];
    if (v == null) continue;
    const s = String(v).trim();
    if (s === '') continue;
    if (isNaN(parsePrecoBackend(v))) return s;
  }
  return '';
}
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// FIM DO BLOCO MOVIDO VERBATIM. Daqui para baixo e codigo NOVO da Task 4.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Reescreve a linha da planilha com as CHAVES normalizadas (trim + minuscula), preservando os
 * valores CRUS.
 *
 * `extrairDoRow` procura a chave por igualdade exata, entao `'Código'` e `'CODIGO '` — grafias
 * absolutamente normais num cabecalho digitado por gente — nao casariam com nenhum candidato e a
 * linha inteira seria ignorada por "linha sem código de material". Normalizar as CHAVES (e nao os
 * valores) resolve isso sem mexer em helper nenhum: quem chama passa a linha normalizada para o
 * mesmo `extrairDoRow` de sempre.
 *
 * Os acentos ficam: `'código'` continua diferente de `'codigo'`, e as duas grafias estao nas listas
 * de candidatos de quem chama (e assim que o precedente da rota de itens do fornecedor faz).
 * Ultima chave vence em caso de colisao (`'Codigo'` e `'codigo '` na mesma planilha) — caso
 * patologico, e a alternativa (recusar a linha) seria pior para quem so quer carregar o historico.
 */
function normalizarChavesDaLinha(row) {
  const saida = {};
  for (const k of Object.keys(row || {})) saida[String(k).trim().toLowerCase()] = row[k];
  return saida;
}

/**
 * Primeiro valor NAO VAZIO entre os candidatos, **sem converter para String**.
 *
 * E a diferenca entre este leitor e `extrairDoRow`, e ela e o centro do achado do cenario (6): a
 * celula numerica do `.xlsx` chega aqui como `number` e sai como `number`, sem passar pela regra
 * pt-BR que apagaria o ponto decimal. Quem quer texto usa `extrairDoRow`; quem quer numero usa
 * este + `numeroDaPlanilha`.
 */
function valorCruDoRow(row, ...candidatos) {
  for (const k of candidatos) {
    const v = row[k];
    if (v != null && String(v).trim() !== '') return v;
  }
  return null;
}

/**
 * Converte valor de celula em numero **sem estragar fracionario** — a regra e CRU PRIMEIRO:
 *
 * 1. `number` passa direto (o caso normal do `.xlsx`: a celula ja vem numerica);
 * 2. string **com virgula** e pt-BR e vai para `parsePrecoBackend` (`'1.234,50'` → 1234.5);
 * 3. string **sem virgula** e `parseFloat` normal (`'1.5'` → 1.5, **nunca 15**);
 * 4. qualquer outra coisa devolve `null` — e quem chama transforma em `ignorados`, nunca em 0.
 *
 * O passo 4 e o que separa este leitor dos de preco: eles devolvem **0** quando nao entendem, e 0
 * numa quantidade de pedido gravaria uma linha que o recebimento mostraria com saldo zero sem
 * ninguem saber por que. Aqui o valor incompreensivel vira recusa VISIVEL na resposta.
 */
function numeroDaPlanilha(valor) {
  if (valor == null || valor === '') return null;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  const texto = String(valor).trim();
  if (texto === '') return null;
  if (texto.includes(',')) {
    const pt = parsePrecoBackend(texto);
    return Number.isFinite(pt) ? pt : null;
  }
  const n = parseFloat(texto.replace(/\s/g, ''));
  return Number.isFinite(n) ? n : null;
}

/**
 * ── A CELULA DE DATA DA PLANILHA -> `AAAA-MM-DD`, ou `null` (onda de correcao, F3) ────────────
 *
 * O FURO, tracado linha a linha e confirmado por sonda: o client chama
 * `XLSX.utils.sheet_to_json(sheet, { defval: '' })` — **sem `cellDates`** e com `raw` no default
 * `true` —, entao uma celula formatada como data volta como **SERIAL NUMERICO** (`45000`, nao
 * `'2023-03-15'`). A importacao lia a previsao por `extrairDoRow`, que devolve **sempre String**, e
 * gravava `previsao_entrega = '45000'` numa coluna `DATE`, sem 400 e sem entrada em `ignorados`. O
 * `<input type="date">` do formulario renderiza vazio para esse valor: o comprador que reabrisse o
 * pedido **nao veria** o valor torto — ele sai da tela e continua no banco.
 *
 * ⚠️ A CONVERSAO E DO SERVIDOR, e nao do navegador. `raw: false` no `sheet_to_json` resolveria a
 * data e estragaria o RESTO: quantidade e preco voltariam como texto FORMATADO pela planilha
 * (`'1.234,50'`, `'1,5'`), e a regra "cru primeiro" de `numeroDaPlanilha` — que existe porque
 * `'1.5'` virava **15** — perderia a forma numerica que ela protege. Alem disso a rota recebe linhas
 * de QUALQUER origem (outro client, script de carga): o servidor e a verdade, o navegador nao.
 *
 * As tres formas que entram, e a quarta que sai como `null` (o chamador a transforma em AVISO, nao
 * em recusa — a data e informativa; recusar a linha por causa dela jogaria fora o item comprado):
 * 1. `number` -> SERIAL do Excel, epoch **1899-12-30 UTC** (o "bug de 1900" da Lotus ja embutido:
 *    serial 1 = 1900-01-01 e o ano 1900 conta como bissexto, e e por isso que a base e dia 30 e nao
 *    31). Tudo em UTC: usar hora local faria a data virar o dia anterior a oeste de Greenwich.
 * 2. `Date` (o caso de quem passar `cellDates: true` amanha) -> os componentes UTC.
 * 3. `AAAA-MM-DD` e `DD/MM/AAAA` (tambem com `-` ou `.`) -> normalizados, com o dia CONFERIDO:
 *    `'2026-02-31'` volta `null`, porque `Date.UTC` o aceitaria como 03/03.
 * 4. qualquer outra coisa -> `null`.
 *
 * ⚠️ String numerica so vale como serial a partir de **20000** (1954-10-03): sem esse piso, uma
 * celula `'2026'` (ano digitado sozinho, caso banal) viraria uma data de 1905 em silencio.
 */
const RE_DATA_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const RE_DATA_BR = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;
const RE_SO_NUMERO = /^\d+([.,]\d+)?$/;
const EPOCH_EXCEL_UTC = Date.UTC(1899, 11, 30);
const SERIAL_MINIMO = 20000;
const MS_POR_DIA = 86400000;

function isoDeUTC(ano, mes, dia) {
  // Conferencia de dia real: `Date.UTC(2026, 1, 31)` devolve 03/03 em silencio.
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (!Number.isFinite(d.getTime())) return null;
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() + 1 !== mes || d.getUTCDate() !== dia) return null;
  if (ano < 1900 || ano > 2200) return null;
  return `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

function dataDaPlanilha(valor) {
  if (valor == null || valor === '') return null;
  if (valor instanceof Date) {
    if (!Number.isFinite(valor.getTime())) return null;
    return isoDeUTC(valor.getUTCFullYear(), valor.getUTCMonth() + 1, valor.getUTCDate());
  }
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor) || valor < SERIAL_MINIMO) return null;
    const d = new Date(EPOCH_EXCEL_UTC + Math.round(valor) * MS_POR_DIA);
    return isoDeUTC(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const texto = String(valor).trim();
  if (texto === '') return null;
  const iso = RE_DATA_ISO.exec(texto);
  if (iso) return isoDeUTC(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const br = RE_DATA_BR.exec(texto);
  if (br) return isoDeUTC(Number(br[3]), Number(br[2]), Number(br[1]));
  // Serial que chegou como texto (CSV, ou client que serializou o numero).
  if (RE_SO_NUMERO.test(texto)) return dataDaPlanilha(Number(texto.replace(',', '.')));
  return null;
}

module.exports = {
  normalizarCampo,
  parsePrecoBackend,
  extrairDoRow,
  extrairPrecoDoRow,
  extrairDescricaoDoRow,
  normalizarChavesDaLinha,
  valorCruDoRow,
  numeroDaPlanilha,
  dataDaPlanilha,
};
