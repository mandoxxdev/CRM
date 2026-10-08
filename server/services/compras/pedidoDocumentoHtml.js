/**
 * Etapa 78 (RN-78.02, RN-78.03) — o DOCUMENTO IMPRESSO do pedido de compra, o que a GMP emite ao
 * fornecedor no formato do ERP antigo (form `TF_PEDCOMPRA`, PDF `Matheus - TECNOPAR 28433`).
 * Layout: `docs/superpowers/specs/2026-09-11-compras-etapa32-pedido-de-compra-design.md` §3.1–3.7.
 *
 * FUNCAO PURA: `gerarHTMLPedidoCompra({ pedido, empresa, impressao })` -> string. Sem banco, sem
 * `req`, sem relogio proprio (a data-hora da impressao vem de fora) — e o molde dos
 * `proposta*.test.js`: o teste afirma sobre a STRING, e o Chromium so entra na rota.
 *
 * Entradas:
 * - `pedido`: o shape de `obterPedido` (Etapa 39) — cabecalho + 9 condicoes + encargos,
 *   `fornecedor{nome, cnpj, ie, endereco, municipio, uf, cep, telefone, celular, email, origem}`,
 *   `itens[]` (com `item_numero`, `ncm`, `peso_unitario`, `ipi_percentual`, `observacao`,
 *   `valor_linha`, `ipi_linha`) e `totais{6}`. Pedido LEGADO (pre-39, `null` por toda parte, sem
 *   `totais`) tambem entra: a conta e refeita pelo MESMO `calcularTotaisPedido` que grava — nunca
 *   uma segunda formula — e todo vazio imprime "—".
 * - `empresa`: `lerEmpresa(db)` de `opcoesPedido.js` (`{ nome, cnpj, ie, endereco, cidade, estado,
 *   cep, telefone, email, nota_pedido_compra }`). B28: nada fiscal fixo no codigo — a IE que a
 *   proposta ainda carrega cravada (`propostaPremiumV2.js:1541`) aqui vem das configuracoes.
 * - `impressao`: `{ usuario, dataHora }` — quem pediu e quando (Date ou string ja formatada).
 *
 * O que NAO esta aqui, e por que:
 * - "Folha X/Y" e "Impresso por": sao do `footerTemplate` do Puppeteer (RN-78.05) — o HTML nao
 *   sabe em que pagina esta. A "Emissao" (§3.1) fica no cabecalho, que e do documento.
 * - data de entrega POR ITEM (coluna do ERP): a Etapa 33 nao a criou; a previsao do pedido vai
 *   no cabecalho ("Previsao de entrega").
 * - a nota legal de ICMS: B29 — NAO e inventada. Sai so quando `empresa.nota_pedido_compra` tem
 *   texto (D-78 para o P.O.: qual e o texto que o ERP imprime hoje).
 * - `fornecedor.origem`: snapshot e cadastro imprimem igual, sem selo (RN-78.07) — o fornecedor
 *   nao precisa saber de onde o CRM leu o proprio CNPJ dele.
 *
 * FORMATACAO (RN-78.03): pt-BR com 2 casas; o UNITARIO com as casas necessarias (min 2, ate 6 —
 * B31; o "max 4" original nao fechava a linha, ver `formatarUnitario`). A RN-12 da Etapa 32 mediu que o ERP imprime 3 casas fixas e por isso `qtd x unit` NAO fecha
 * com o total da linha em 6 das 24 linhas do 28433 (`49 x 0,106 = 5,194` vs `5,21`); aqui o papel
 * tem de fechar, entao `0,1063` sai inteiro e `85,11` nao ganha zeros.
 *
 * CSS DE IMPRESSAO (RN-78.05): `@page { size: A4; margin: 12mm }` — ⚠️ NAO copiar o `margin: 0` da
 * proposta: ela pagina em JS e desenha o proprio rodape; aqui o rodape e do Puppeteer e o `@page`
 * do CSS prevalece sobre o `margin` de `page.pdf` — com 0 o rodape some. `thead { display:
 * table-header-group }` repete o cabecalho da tabela em cada folha, `tr { break-inside: avoid }`
 * nao parte linha, `.avoid-break` segura totais e assinaturas juntos, e NAO ha `overflow: hidden`
 * no wrapper da tabela (corta a repeticao do thead). `Arial, Helvetica, sans-serif` porque o
 * Dockerfile so tem `ttf-freefont` — nada de fonte embutida como a proposta faz.
 */
const fs = require('fs');
const path = require('path');
const { calcularTotaisPedido } = require('./pedidoTotais');

const VAZIO = '—';

/* ── escape ───────────────────────────────────────────────────────────────────────────────── */
const MAPA_ESCAPE = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function escapar(valor) {
  if (valor === null || valor === undefined) return '';
  return String(valor).replace(/[&<>"']/g, (c) => MAPA_ESCAPE[c]);
}

/** Texto para a celula: vazio/null -> "—"; o resto escapado. */
function texto(valor) {
  if (valor === null || valor === undefined) return VAZIO;
  const s = String(valor).trim();
  return s === '' ? VAZIO : escapar(s);
}

/** Texto de varias linhas (observacoes, nota legal): escapado, `\n` -> `<br>`. */
function textoMultilinha(valor) {
  if (valor === null || valor === undefined) return VAZIO;
  const s = String(valor).trim();
  return s === '' ? VAZIO : escapar(s).replace(/\r?\n/g, '<br>');
}

/* ── numeros ──────────────────────────────────────────────────────────────────────────────── */
function numeroOuNulo(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = typeof valor === 'number' ? valor : Number(String(valor).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** `1234.5` -> `1.234,50` (ponto de milhar, virgula decimal), `casas` fixas. */
function ptBR(n, casas) {
  const fixo = Math.abs(n).toFixed(casas);
  const [inteiro, dec] = fixo.split('.');
  const comMilhar = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (n < 0 ? '-' : '') + comMilhar + (dec ? ',' + dec : '');
}

/** Moeda/valor com 2 casas; nulo ou invalido -> "—". */
function formatarValor(valor, casas = 2) {
  const n = numeroOuNulo(valor);
  return n === null ? VAZIO : ptBR(n, casas);
}

/**
 * Teto de casas do unitario e da quantidade. 6 e o que cabe sem ruido de ponto flutuante em valores
 * de pedido (o `toFixed(6)` de `1.23456` e `1.234560`, nunca `1.2345600000001`).
 */
const CASAS_MAX = 6;

/**
 * Unitario com as casas NECESSARIAS: minimo 2, ate 6 (B31). O "max 4" original do plano estava
 * errado: `valor_linha` e `arred2(qtd x unit)` com o unitario INTEIRO (`pedidoTotais.js`), entao
 * `1000 x 1,23456` imprimia `1,2346` ao lado de `1.234,56` — o papel nao fechava (RN-78.03).
 */
function formatarUnitario(valor) {
  const n = numeroOuNulo(valor);
  if (n === null) return VAZIO;
  // Arredonda na 6a casa e corta os zeros a direita, mas nunca abaixo de 2.
  let casas = CASAS_MAX;
  const dec = n.toFixed(CASAS_MAX).split('.')[1];
  while (casas > 2 && dec[casas - 1] === '0') casas -= 1;
  return ptBR(n, casas);
}

/** Quantidade: inteira sem casas, fracionada com ate 6 (com 3, `0.0004` imprimia "0"). */
function formatarQuantidade(valor) {
  const n = numeroOuNulo(valor);
  if (n === null) return VAZIO;
  if (Number.isInteger(n)) return ptBR(n, 0);
  let fixo = n.toFixed(CASAS_MAX);
  while (fixo.endsWith('0')) fixo = fixo.slice(0, -1);
  const casas = (fixo.split('.')[1] || '').length;
  return ptBR(n, casas);
}

/* ── datas ────────────────────────────────────────────────────────────────────────────────── */
const dois = (n) => String(n).padStart(2, '0');

/** `AAAA-MM-DD[ ...]` -> `DD/MM/AAAA`; vazio -> "—"; o que nao e ISO sai como veio (escapado). */
function formatarData(valor) {
  if (valor === null || valor === undefined) return VAZIO;
  const s = String(valor).trim();
  if (s === '') return VAZIO;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    return `${dois(valor.getDate())}/${dois(valor.getMonth() + 1)}/${valor.getFullYear()}`;
  }
  return escapar(s);
}

/** `Date` -> `DD/MM/AAAA HH:mm` (hora local do servidor); string vem como esta; vazio -> "—". */
function formatarDataHora(valor) {
  if (valor === null || valor === undefined || valor === '') return VAZIO;
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return VAZIO;
    return `${dois(valor.getDate())}/${dois(valor.getMonth() + 1)}/${valor.getFullYear()} `
      + `${dois(valor.getHours())}:${dois(valor.getMinutes())}`;
  }
  return escapar(String(valor));
}

/* ── situacao ─────────────────────────────────────────────────────────────────────────────── */
// Os 7 de `STATUS_PEDIDO_COMPRA` (schemas.js); um status desconhecido sai como veio, escapado.
const ROTULO_STATUS = {
  pendente: 'Pendente', aprovado: 'Aprovado', rejeitado: 'Rejeitado', em_analise: 'Em análise',
  enviado: 'Enviado', recebido: 'Recebido', cancelado: 'Cancelado',
};
function rotuloStatus(status) {
  if (status === null || status === undefined || String(status).trim() === '') return VAZIO;
  return ROTULO_STATUS[String(status)] || escapar(String(status));
}

/* ── logo ─────────────────────────────────────────────────────────────────────────────────── */
// Lido UMA vez e guardado: ~18 kB em base64 por documento, como a proposta faz. `assetProposta`
// da proposta e closure local de `gerarHTMLPropostaPremiumV2` — por isso a leitura propria.
const LOGO_PATH = path.join(__dirname, '..', '..', 'assets', 'proposta', 'logo-gmp.png');
let logoDataUrl;
function logoBase64() {
  if (logoDataUrl === undefined) {
    try {
      logoDataUrl = 'data:image/png;base64,' + fs.readFileSync(LOGO_PATH).toString('base64');
    } catch (e) {
      logoDataUrl = ''; // sem logo o cabecalho mostra o nome da empresa em texto
    }
  }
  return logoDataUrl;
}

/* ── blocos ───────────────────────────────────────────────────────────────────────────────── */
function enderecoCompleto(e) {
  const linha1 = texto(e.endereco);
  // Cada parte e escapada UMA vez, aqui. (A versao anterior escapava "o indice 0" da lista ja
  // filtrada: sem cidade/UF o CEP virava o indice 0 e saia escapado duas vezes — "A&amp;amp;B".)
  const limpo = (v) => (v == null ? '' : String(v).trim());
  const cidadeUf = [e.cidade, e.estado].map(limpo).filter(Boolean).join(' - ');
  const cep = limpo(e.cep);
  const linha2 = [cidadeUf ? escapar(cidadeUf) : '', cep ? `CEP ${escapar(cep)}` : ''].filter(Boolean);
  return linha2.length ? `${linha1}<br>${linha2.join(' - ')}` : linha1;
}

function blocoEmpresa(e, titulo) {
  return `
    <section class="bloco">
      <h2>${titulo}</h2>
      <table class="dados">
        <tr><th>Razão social</th><td>${texto(e.nome)}</td><th>CNPJ</th><td>${texto(e.cnpj)}</td></tr>
        <tr><th>Endereço</th><td colspan="3">${enderecoCompleto(e)}</td></tr>
        <tr><th>IE</th><td>${texto(e.ie)}</td><th>Telefone</th><td>${texto(e.telefone)}</td></tr>
        <tr><th>E-mail</th><td colspan="3">${texto(e.email)}</td></tr>
      </table>
    </section>`;
}

function blocoFornecedor(f) {
  const municipioUf = [f.municipio, f.uf].map((v) => (v == null ? '' : String(v).trim())).filter(Boolean).join(' / ');
  return `
    <section class="bloco">
      <h2>Dados do fornecedor</h2>
      <table class="dados">
        <tr><th>Nome</th><td colspan="3">${texto(f.nome)}</td></tr>
        <tr><th>CNPJ</th><td>${texto(f.cnpj)}</td><th>Inscrição Estadual</th><td>${texto(f.ie)}</td></tr>
        <tr><th>Endereço</th><td colspan="3">${texto(f.endereco)}</td></tr>
        <tr><th>Município / UF</th><td>${texto(municipioUf)}</td><th>CEP</th><td>${texto(f.cep)}</td></tr>
        <tr><th>Telefone</th><td>${texto(f.telefone)}</td><th>Celular</th><td>${texto(f.celular)}</td></tr>
        <tr><th>E-mail</th><td colspan="3">${texto(f.email)}</td></tr>
      </table>
    </section>`;
}

/**
 * `descontoImpresso` e o `totais.total_desconto` (o arred2 de `pedidoTotais.js`), o MESMO valor do
 * quadro de totais. Ler `p.total_desconto` cru aqui imprimia 1.005 como "1,00" num bloco e "1,01"
 * no outro — dois descontos diferentes no mesmo papel.
 */
function blocoComplementares(p, descontoImpresso) {
  return `
    <section class="bloco">
      <h2>Dados complementares</h2>
      <table class="dados">
        <tr><th>Desconto</th><td>${formatarValor(descontoImpresso == null ? 0 : descontoImpresso)}</td>
            <th>Condição de pagamento</th><td>${texto(p.condicao_pagamento)}</td></tr>
        <tr><th>Transportadora</th><td>${texto(p.transportadora)}</td>
            <th>Telefone da transportadora</th><td>${texto(p.transportadora_telefone)}</td></tr>
        <tr><th>Frete</th><td colspan="3">${texto(p.frete_modalidade)}</td></tr>
        <tr><th>Tabela de preço</th><td>${texto(p.tabela_preco)}</td>
            <th>Via de transporte</th><td>${texto(p.via_transporte)}</td></tr>
        <tr><th>Contato</th><td colspan="3">${texto(p.contato)}</td></tr>
        <tr><th>Observações</th><td colspan="3">${textoMultilinha(p.observacoes)}</td></tr>
      </table>
    </section>`;
}

function linhaItem(item, indice) {
  const numero = numeroOuNulo(item.item_numero);
  const descricao = texto(item.descricao);
  const obs = item.observacao == null || String(item.observacao).trim() === ''
    ? ''
    : `<div class="obs-item">${textoMultilinha(item.observacao)}</div>`;
  return `
        <tr>
          <td class="c">${numero === null ? indice + 1 : ptBR(numero, 0)}</td>
          <td>${texto(item.codigo)}</td>
          <td class="descricao">${descricao}${obs}</td>
          <td class="c">${texto(item.ncm)}</td>
          <td class="r">${formatarValor(item.peso_unitario, 3)}</td>
          <td class="r">${formatarQuantidade(item.quantidade)}</td>
          <td class="c">${texto(item.unidade)}</td>
          <td class="r">${formatarUnitario(item.valor_unitario)}</td>
          <td class="r">${formatarValor(item.ipi_percentual == null ? 0 : item.ipi_percentual)}</td>
          <td class="r">${formatarValor(item.valor_linha)}</td>
        </tr>`;
}

function ordenarItens(itens) {
  // `ORDER BY item_numero, id` da leitura; refeito aqui porque a funcao e pura e nao confia na
  // ordem do array que recebeu. NULL ordena primeiro, como no SQLite.
  const chave = (i) => {
    const n = numeroOuNulo(i.item_numero);
    return n === null ? -Infinity : n;
  };
  return itens.map((i, idx) => ({ i, idx }))
    .sort((a, b) => (chave(a.i) - chave(b.i)) || ((numeroOuNulo(a.i.id) || 0) - (numeroOuNulo(b.i.id) || 0)) || (a.idx - b.idx))
    .map(({ i }) => i);
}

function blocoItens(itens) {
  const linhas = itens.map(linhaItem).join('');
  return `
    <section class="bloco">
      <h2>Itens do pedido</h2>
      <table class="itens">
        <thead>
          <tr>
            <th class="c">It.</th><th>Material</th><th>Descrição / Observação</th><th class="c">NCM</th>
            <th class="r">Peso Un (kg)</th><th class="r">Qtde.</th><th class="c">Un</th>
            <th class="r">Valor Unitário</th><th class="r">% IPI</th><th class="r">Valor Total</th>
          </tr>
        </thead>
        <tbody>${linhas || '\n        <tr><td colspan="10" class="c">—</td></tr>'}
        </tbody>
      </table>
    </section>`;
}

function blocoTotais(t) {
  return `
    <section class="bloco avoid-break">
      <table class="totais">
        <tr><th>Total dos produtos</th><td class="r">${formatarValor(t.total_produtos)}</td></tr>
        <tr><th>Total do IPI</th><td class="r">${formatarValor(t.total_ipi)}</td></tr>
        <tr><th>Total ICMS-ST</th><td class="r">${formatarValor(t.total_icms_st)}</td></tr>
        <tr><th>Total desconto</th><td class="r">${formatarValor(t.total_desconto)}</td></tr>
        <tr><th>Frete</th><td class="r">${formatarValor(t.valor_frete)}</td></tr>
        <tr class="total-geral"><th>Total geral</th><td class="r">R$ ${formatarValor(t.total_geral)}</td></tr>
      </table>
    </section>`;
}

function blocoRodape(p, empresa) {
  const nota = empresa.nota_pedido_compra == null ? '' : String(empresa.nota_pedido_compra).trim();
  return `
    <section class="bloco">
      <table class="dados">
        <tr><th>Local de entrega</th><td>${textoMultilinha(p.local_entrega)}</td></tr>
        <tr><th>Local de cobrança</th><td>${textoMultilinha(p.local_cobranca)}</td></tr>
      </table>
    </section>${nota ? `
    <section class="bloco nota-legal-wrap">
      <p class="nota-legal">${textoMultilinha(nota)}</p>
    </section>` : ''}
    <section class="assinaturas avoid-break">
      <div class="assinatura"><div class="linha"></div>Depto. Compras</div>
      <div class="assinatura"><div class="linha"></div>Diretoria</div>
    </section>`;
}

const CSS = `
    @page { size: A4; margin: 12mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 9pt; color: #111; background: #fff; }
    h1 { font-size: 13pt; margin: 0; letter-spacing: .02em; }
    h1 .numero { display: block; font-size: 11pt; }
    .numero { white-space: nowrap; }
    .nowrap { white-space: nowrap; }
    h2 { font-size: 9pt; margin: 0 0 3px 0; padding: 2px 6px; background: #e8e8e8; border: 1px solid #bbb; border-bottom: 0; text-transform: uppercase; }
    .bloco { margin-bottom: 8px; }
    .cabecalho { display: flex; align-items: stretch; gap: 10px; border: 1px solid #bbb; padding: 6px; margin-bottom: 8px; }
    .cabecalho .logo { width: 150px; flex: 0 0 150px; display: flex; align-items: center; }
    .cabecalho .logo img { max-width: 150px; max-height: 60px; }
    .cabecalho .logo .nome { font-weight: bold; font-size: 12pt; }
    .cabecalho .emitente { flex: 1 1 auto; font-size: 8.5pt; line-height: 1.35; }
    .cabecalho .identificacao { flex: 0 0 235px; border-left: 1px solid #bbb; padding-left: 8px; font-size: 8.5pt; line-height: 1.5; }
    .cabecalho .identificacao .campo b { display: inline-block; min-width: 118px; }
    table { width: 100%; border-collapse: collapse; }
    table.dados th, table.dados td { border: 1px solid #bbb; padding: 2px 6px; vertical-align: top; text-align: left; }
    table.dados th { width: 17%; background: #f4f4f4; font-weight: bold; white-space: nowrap; }
    table.itens th, table.itens td { border: 1px solid #bbb; padding: 2px 4px; vertical-align: top; }
    table.itens th { background: #e8e8e8; font-size: 8pt; white-space: nowrap; }
    table.itens td.descricao { width: 32%; }
    .obs-item { font-size: 7.5pt; color: #444; margin-top: 1px; }
    .c { text-align: center; }
    .r { text-align: right; white-space: nowrap; }
    thead { display: table-header-group; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    .avoid-break { break-inside: avoid; page-break-inside: avoid; }
    table.totais { width: 45%; margin-left: auto; }
    table.totais th, table.totais td { border: 1px solid #bbb; padding: 2px 6px; text-align: left; }
    table.totais th { background: #f4f4f4; }
    table.totais tr.total-geral th, table.totais tr.total-geral td { font-weight: bold; font-size: 10.5pt; background: #ddd; }
    .nota-legal { font-size: 7.5pt; color: #333; border: 1px solid #bbb; padding: 4px 6px; margin: 0; }
    .assinaturas { display: flex; justify-content: space-around; gap: 40px; margin-top: 28px; }
    .assinatura { flex: 1 1 0; text-align: center; font-size: 8.5pt; }
    .assinatura .linha { border-top: 1px solid #111; margin-bottom: 3px; }
`;

/**
 * Gera o HTML completo (pagina inteira, CSS inline, logo em base64) do pedido de compra.
 * @param {{ pedido: object, empresa: object, impressao?: { usuario?: string, dataHora?: Date|string } }} entrada
 * @returns {string}
 */
function gerarHTMLPedidoCompra({ pedido, empresa, impressao } = {}) {
  const p = pedido || {};
  const e = empresa || {};
  const imp = impressao || {};
  const fornecedor = p.fornecedor || {};
  const itensBrutos = Array.isArray(p.itens) ? p.itens : [];

  // A conta e a MESMA que gravou: se o pedido veio sem `totais` (legado), `calcularTotaisPedido`
  // refaz linhas e totais; se veio com, as linhas sem `valor_linha` ainda ganham o derivado.
  const precisaConta = !p.totais || itensBrutos.some((i) => i.valor_linha === undefined || i.valor_linha === null);
  const calculado = precisaConta
    ? calcularTotaisPedido(itensBrutos, { total_icms_st: p.total_icms_st, valor_frete: p.valor_frete, total_desconto: p.total_desconto })
    : null;
  const itens = ordenarItens(calculado ? calculado.itens : itensBrutos);
  const totais = p.totais || calculado.totais;

  const logo = logoBase64();
  const numero = texto(p.numero);
  const emissao = formatarDataHora(imp.dataHora);
  const usuario = texto(imp.usuario);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Pedido de compra ${numero}</title>
  <style>${CSS}  </style>
</head>
<body>
  <header class="cabecalho">
    <div class="logo">${logo ? `<img src="${logo}" alt="${texto(e.nome)}" />` : `<span class="nome">${texto(e.nome)}</span>`}</div>
    <div class="emitente">
      <b>${texto(e.nome)}</b><br>
      ${enderecoCompleto(e)}<br>
      CNPJ ${texto(e.cnpj)} &middot; IE ${texto(e.ie)}<br>
      Tel. ${texto(e.telefone)} &middot; ${texto(e.email)}
    </div>
    <div class="identificacao">
      <h1>PEDIDO DE COMPRA <span class="numero">${numero}</span></h1>
      <div class="campo"><b>Data do pedido:</b> ${formatarData(p.data_pedido)}</div>
      <div class="campo"><b>Situação:</b> ${rotuloStatus(p.status)}</div>
      <div class="campo"><b>Previsão de entrega:</b> ${formatarData(p.previsao_entrega)}</div>
      <div class="campo"><b>Emissão:</b> <span class="nowrap">${emissao}</span></div>
      <div class="campo"><b>Usuário:</b> ${usuario}</div>
    </div>
  </header>
${blocoFornecedor(fornecedor)}
${blocoEmpresa(e, 'Dados para faturamento')}
${blocoComplementares(p, totais.total_desconto)}
${blocoItens(itens)}
${blocoTotais(totais)}
${blocoRodape(p, e)}
</body>
</html>`;
}

module.exports = {
  gerarHTMLPedidoCompra,
  formatarValor,
  formatarUnitario,
  formatarQuantidade,
  formatarData,
  formatarDataHora,
  escapar,
};
