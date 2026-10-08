/**
 * Etapa 78 (T1) — o documento impresso do pedido de compra: `gerarHTMLPedidoCompra` e uma funcao
 * PURA (string a partir de `{ pedido, empresa, impressao }`, sem banco), no molde dos
 * `proposta*.test.js`: afirma-se sobre a STRING, nunca sobre o Chromium. RN-78.02 / RN-78.03.
 *
 * Os numeros sao os do pedido REAL TECNOPAR 28433, nas duas linhas que a Etapa 39 portou
 * (198,70 / 12,91 / 211,61) — e a linha `49 x 0,1063 = 5,21` da RN-12 da 32, que so fecha com 4 casas.
 *
 * ⚠️ O QUE ESTE ARQUIVO SE PROIBE: afirmar "existe a chave" — cada bloco procura o VALOR formatado;
 * e teste que nao sabe falhar — o bloco de controle positivo prova que a varredura de
 * `undefined|null|NaN` e o escape de HTML pegam uma string sabotada.
 *
 * Executar: cd server && node tests/pedidoDocumentoHtml.test.js
 */
const assert = require('assert');

let ok = 0; let total = 0;
const t = (nome, fn) => {
  total++;
  try { fn(); ok++; console.log('  OK   ' + nome); }
  catch (e) { console.error('  FALHA ' + nome + ': ' + e.message); }
};

const { gerarHTMLPedidoCompra, formatarValor, formatarUnitario, formatarData, formatarDataHora } =
  require('../services/compras/pedidoDocumentoHtml');

/* ── fixture: o shape de `obterPedido` (Etapa 39) com os numeros do 28433 ─────────────────── */
function pedido28433(over = {}) {
  return {
    id: 29228,
    numero: 'PC-2025-0028',
    data_pedido: '2025-12-16',
    previsao_entrega: '2025-12-18',
    status: 'pendente',
    condicao_pagamento: '28 D.D.L.',
    frete_modalidade: '2-Contratação do Frete por conta de Terceiros',
    via_transporte: 'Rodoviário',
    transportadora: 'TRANSPORTES ABC',
    transportadora_telefone: '(11) 4000-0000',
    tabela_preco: 'Tabela 2025',
    contato: 'Matheus',
    observacoes: 'OS 1714 TQVS-4_INOX 304',
    local_entrega: 'AVENIDA ANGELO DEMARCHI, 130 - SAO BERNARDO DO CAMPO - SP',
    local_cobranca: 'Mesmo endereço',
    total_icms_st: 0, valor_frete: 0, total_desconto: 0,
    fornecedor: {
      id: 7, nome: 'TECNOPAR FIXADORES LTDA', cnpj: '54.984.382/0001-64', ie: '799850123110',
      endereco: 'AV. WINSTON CHURCHILL, 596 - RUDGE RAMOS', municipio: 'SAO BERNARDO DO CAMPO', uf: 'SP',
      cep: '09720-000', telefone: '(11) 4177-2311', celular: '(11) 99999-0000',
      email: 'contato@tecnopar.com.br', origem: 'snapshot',
    },
    itens: [
      { id: 2, item_numero: 2, codigo: 'MP-937', descricao: 'PORCA SEXTAVADA M10 INOX 304', ncm: '73181600',
        peso_unitario: 0.012, quantidade: 2, unidade: 'PC', valor_unitario: 85.11, ipi_percentual: 6.5,
        observacao: null, valor_linha: 170.22, ipi_linha: 11.06 },
      { id: 1, item_numero: 1, codigo: 'MP-936', descricao: 'PARAFUSO SEXTAVADO M10 X 35 INOX 304', ncm: '73181500',
        peso_unitario: 0.012, quantidade: 13, unidade: 'PC', valor_unitario: 2.191, ipi_percentual: 6.5,
        observacao: 'PARAFUSO SEXTAVADO M10 X 35', valor_linha: 28.48, ipi_linha: 1.85 },
    ],
    totais: { total_produtos: 198.70, total_ipi: 12.91, total_icms_st: 0, total_desconto: 0, valor_frete: 0, total_geral: 211.61 },
    ...over,
  };
}

const EMPRESA = {
  nome: 'GMP INDUSTRIAIS', cnpj: '12.345.678/0001-90', ie: '799.890.695.115',
  endereco: 'Av. Angelo Demarchi 130, Batistini', cidade: 'São Bernardo do Campo', estado: 'SP',
  cep: '09844-100', telefone: '(11) 4513-9570', email: 'compras@gmp.ind.br', nota_pedido_compra: '',
};
const IMPRESSAO = { usuario: 'Matheus', dataHora: new Date(2026, 9, 7, 14, 33) };

const gerar = (over = {}, empresa = EMPRESA, impressao = IMPRESSAO) =>
  gerarHTMLPedidoCompra({ pedido: pedido28433(over), empresa, impressao });

// A varredura ignora o base64 do logo (alfabeto do base64 pode formar qualquer palavra por acaso).
const semBase64 = (html) => html.replace(/data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+/g, 'LOGO');
const VAZAMENTO = /\b(undefined|null|NaN)\b/;

console.log('\n═══ Etapa 78 — o HTML do pedido de compra (funcao pura) ═══\n');

/* ── formatadores ──────────────────────────────────────────────────────────────────────────── */
console.log('RN-78.03 — formatacao pt-BR');
t('valor com 2 casas e separadores pt-BR: 1234.5 -> "1.234,50"', () => {
  assert.strictEqual(formatarValor(1234.5), '1.234,50');
  assert.strictEqual(formatarValor(0), '0,00');
  assert.strictEqual(formatarValor(211.61), '211,61');
});
t('valor nulo/invalido imprime "—" (nunca NaN)', () => {
  assert.strictEqual(formatarValor(null), '—');
  assert.strictEqual(formatarValor(undefined), '—');
  assert.strictEqual(formatarValor('abc'), '—');
});
t('unitario com as casas necessarias: min 2, max 4 (B31 — descarta as 3 fixas do ERP)', () => {
  assert.strictEqual(formatarUnitario(85.11), '85,11');
  assert.strictEqual(formatarUnitario(2.191), '2,191');
  assert.strictEqual(formatarUnitario(0.1063), '0,1063');
  assert.strictEqual(formatarUnitario(5), '5,00');
  assert.strictEqual(formatarUnitario(1.5), '1,50');
  assert.strictEqual(formatarUnitario(0.10630001), '0,1063', 'arredonda na 4a casa');
});
t('datas DD/MM/AAAA e DD/MM/AAAA HH:mm', () => {
  assert.strictEqual(formatarData('2025-12-16'), '16/12/2025');
  assert.strictEqual(formatarData('2025-12-16 10:00:00'), '16/12/2025');
  assert.strictEqual(formatarData(null), '—');
  assert.strictEqual(formatarData(''), '—');
  assert.strictEqual(formatarDataHora(new Date(2026, 9, 7, 9, 5)), '07/10/2026 09:05');
});

/* ── blocos do §3 ──────────────────────────────────────────────────────────────────────────── */
console.log('\nRN-78.02 — os blocos do design §3.1–3.7 com os dados do 28433');
t('e uma pagina HTML completa, A4 com margem 12mm, Arial, thead repetido e tr sem quebra', () => {
  const html = gerar();
  assert.ok(/^<!DOCTYPE html>/i.test(html.trim()));
  assert.ok(html.includes('<meta charset="UTF-8"'));
  assert.ok(/@page\s*\{\s*size:\s*A4;\s*margin:\s*12mm;?\s*\}/.test(html), '@page { size: A4; margin: 12mm }');
  assert.ok(/font-family:\s*Arial,\s*Helvetica,\s*sans-serif/.test(html));
  assert.ok(/thead\s*\{[^}]*display:\s*table-header-group/.test(html));
  assert.ok(/\btr\s*\{[^}]*break-inside:\s*avoid/.test(html));
  assert.ok((html.match(/class="[^"]*\bavoid-break\b[^"]*"/g) || []).length >= 2, '.avoid-break em totais E assinaturas');
  assert.ok(!/overflow:\s*hidden/.test(html), 'overflow:hidden no wrapper corta a repeticao do thead');
});
t('§3.1 cabecalho: empresa das configuracoes, logo em base64, numero, data, situacao, previsao', () => {
  const html = gerar();
  assert.ok(html.includes('data:image/png;base64,'), 'logo embutido');
  assert.ok(html.includes('GMP INDUSTRIAIS'));
  assert.ok(html.includes('12.345.678/0001-90'), 'CNPJ da empresa');
  assert.ok(html.includes('799.890.695.115'), 'IE da empresa');
  assert.ok(html.includes('Av. Angelo Demarchi 130, Batistini'));
  assert.ok(html.includes('(11) 4513-9570'));
  assert.ok(html.includes('compras@gmp.ind.br'));
  assert.ok(/PEDIDO DE COMPRA\s*<[^>]*>\s*PC-2025-0028|PEDIDO DE COMPRA PC-2025-0028/.test(html), 'titulo com o numero');
  assert.ok(html.includes('16/12/2025'), 'data do pedido');
  assert.ok(html.includes('18/12/2025'), 'previsao de entrega no cabecalho');
  assert.ok(html.includes('Previsão de entrega'));
  assert.ok(html.includes('Pendente'), 'situacao legivel');
  assert.ok(html.includes('07/10/2026 14:33'), 'emissao');
  assert.ok(html.includes('Matheus'), 'usuario da impressao');
});
t('§3.2 fornecedor: imprime o fornecedor{} recebido (snapshot ou cadastro, sem selo)', () => {
  const html = gerar();
  for (const v of ['TECNOPAR FIXADORES LTDA', '54.984.382/0001-64', '799850123110',
    'AV. WINSTON CHURCHILL, 596 - RUDGE RAMOS', 'SAO BERNARDO DO CAMPO', '09720-000',
    '(11) 4177-2311', '(11) 99999-0000', 'contato@tecnopar.com.br']) {
    assert.ok(html.includes(v), `fornecedor: ${v}`);
  }
  assert.ok(!/snapshot|cadastro vivo/i.test(semBase64(html)), 'o fornecedor nao precisa saber da origem');
  const cadastro = gerar({ fornecedor: { ...pedido28433().fornecedor, nome: 'OUTRO FORNECEDOR SA', origem: 'cadastro' } });
  assert.ok(cadastro.includes('OUTRO FORNECEDOR SA'));
  assert.ok(!cadastro.includes('TECNOPAR FIXADORES LTDA'));
});
t('§3.3 faturamento: o bloco da empresa aparece de novo (endereco de faturamento)', () => {
  const html = gerar();
  assert.ok(/Faturamento/i.test(html));
  assert.ok((html.match(/12\.345\.678\/0001-90/g) || []).length >= 2, 'CNPJ no cabecalho E no faturamento');
});
t('§3.4 dados complementares: as 9 condicoes e a observacao', () => {
  const html = gerar();
  for (const v of ['28 D.D.L.', '2-Contratação do Frete por conta de Terceiros', 'Rodoviário',
    'TRANSPORTES ABC', '(11) 4000-0000', 'Tabela 2025', 'Matheus', 'OS 1714 TQVS-4_INOX 304']) {
    assert.ok(html.includes(v), `complementar: ${v}`);
  }
});
t('§3.5 itens: as 10 colunas (SEM data de entrega por item), ordem por item_numero, observacao junto da descricao', () => {
  const html = gerar();
  for (const col of ['It.', 'Material', 'Descrição', 'NCM', 'Peso Un', 'Qtde.', 'Un', 'Valor Unitário', '% IPI', 'Valor Total']) {
    assert.ok(html.includes(col), `coluna ${col}`);
  }
  assert.ok(!/Data\s*(de\s*)?Entrega/i.test(html.replace(/Previsão de entrega/g, '')), 'coluna do ERP que a 33 nao tem');
  const p936 = html.indexOf('MP-936'); const p937 = html.indexOf('MP-937');
  assert.ok(p936 > 0 && p937 > 0 && p936 < p937, 'item 1 (MP-936) antes do item 2 (MP-937) mesmo com id invertido');
  assert.ok(html.includes('73181500') && html.includes('73181600'));
  assert.ok(html.includes('0,012'), 'peso com 3 casas');
  assert.ok(html.includes('2,191'), 'unitario com 3 casas quando precisa');
  assert.ok(html.includes('85,11'), 'unitario com 2 casas quando basta');
  assert.ok(html.includes('6,50'), '% IPI com 2 casas');
  assert.ok(html.includes('28,48') && html.includes('170,22'), 'valor total da linha');
  assert.ok(html.includes('PARAFUSO SEXTAVADO M10 X 35'), 'observacao do item');
  const linha = html.slice(html.indexOf('MP-936'), html.indexOf('MP-937'));
  assert.ok(linha.includes('PARAFUSO SEXTAVADO M10 X 35'), 'observacao dentro da linha do item');
});
t('§3.5 unitario com 4 casas fecha a linha: 49 x 0,1063 = 5,21 (RN-12 da 32)', () => {
  const html = gerar({
    itens: [{ item_numero: 1, codigo: 'ARR-1', descricao: 'ARRUELA', ncm: null, peso_unitario: null,
      quantidade: 49, unidade: 'PC', valor_unitario: 0.1063, ipi_percentual: 0, observacao: null,
      valor_linha: 5.21, ipi_linha: 0 }],
    totais: { total_produtos: 5.21, total_ipi: 0, total_icms_st: 0, total_desconto: 0, valor_frete: 0, total_geral: 5.21 },
  });
  assert.ok(html.includes('0,1063'), 'quatro casas');
  assert.ok(html.includes('5,21'));
  assert.ok(!html.includes('0,106<'), 'nao e truncado em 3');
});
t('§3.6 totais: produtos, IPI, ICMS-ST, desconto, frete e o total geral em destaque', () => {
  const html = gerar();
  for (const r of ['Total dos produtos', 'Total do IPI', 'ICMS', 'Desconto', 'Frete', 'Total geral']) {
    assert.ok(new RegExp(r, 'i').test(html), `rotulo ${r}`);
  }
  assert.ok(html.includes('198,70') && html.includes('12,91') && html.includes('211,61'));
  assert.ok(/class="[^"]*total-geral[^"]*"/.test(html), 'total geral marcado para destaque');
});
t('§3.6 totais ausentes (pedido legado) sao recalculados das linhas, nunca NaN', () => {
  const html = gerar({ totais: undefined });
  assert.ok(html.includes('198,70') && html.includes('211,61'));
  assert.ok(!VAZAMENTO.test(semBase64(html)));
});
t('§3.7 rodape: local de entrega, local de cobranca, assinaturas', () => {
  const html = gerar();
  assert.ok(html.includes('AVENIDA ANGELO DEMARCHI, 130 - SAO BERNARDO DO CAMPO - SP'));
  assert.ok(html.includes('Mesmo endereço'));
  assert.ok(/Local de entrega/i.test(html) && /Local de cobrança/i.test(html));
  assert.ok(html.includes('Depto. Compras') && html.includes('Diretoria'));
});

/* ── nota legal ────────────────────────────────────────────────────────────────────────────── */
console.log('\nB29 — a nota legal vem das configuracoes, nunca inventada');
t('nota vazia -> o bloco NAO aparece', () => {
  const html = gerar({}, { ...EMPRESA, nota_pedido_compra: '' });
  assert.ok(!html.includes('class="nota-legal"'));
  const semChave = gerar({}, { ...EMPRESA, nota_pedido_compra: undefined });
  assert.ok(!semChave.includes('class="nota-legal"'));
});
t('nota configurada -> aparece, escapada, com quebras de linha preservadas', () => {
  const html = gerar({}, { ...EMPRESA, nota_pedido_compra: 'Linha 1 do ICMS\nLinha 2 <b>x</b>' });
  assert.ok(html.includes('class="nota-legal"'));
  assert.ok(html.includes('Linha 1 do ICMS<br>Linha 2 &lt;b&gt;x&lt;/b&gt;'));
});

/* ── vazios e vazamentos ───────────────────────────────────────────────────────────────────── */
console.log('\nRN-78.03 — "—" nos vazios; nenhum undefined/null/NaN; escape de HTML');
t('shape pre-39 (tudo null) imprime "—" e nao vaza undefined/null/NaN', () => {
  const html = gerar({
    previsao_entrega: null, condicao_pagamento: null, frete_modalidade: null, via_transporte: null,
    transportadora: null, transportadora_telefone: null, tabela_preco: null, contato: null,
    observacoes: null, local_entrega: null, local_cobranca: null, status: null,
    total_icms_st: null, valor_frete: null, total_desconto: null,
    fornecedor: { id: 7, nome: null, cnpj: null, ie: null, endereco: null, municipio: null, uf: null,
      cep: null, telefone: null, celular: null, email: null, origem: 'cadastro' },
    itens: [{ id: 1, item_numero: null, codigo: null, descricao: 'SEM NADA', ncm: null, peso_unitario: null,
      quantidade: 3, unidade: null, valor_unitario: null, ipi_percentual: null, observacao: null }],
    totais: undefined,
  }, { nome: '', cnpj: '', ie: '', endereco: '', cidade: '', estado: '', cep: '', telefone: '', email: '', nota_pedido_compra: '' },
  { usuario: null, dataHora: null });
  const limpo = semBase64(html);
  assert.ok(!VAZAMENTO.test(limpo), 'vazou: ' + (limpo.match(VAZAMENTO) || [])[0]);
  assert.ok((limpo.match(/—/g) || []).length >= 15, 'os vazios viram travessao');
});
t('fixture completa tambem nao vaza undefined/null/NaN', () => {
  assert.ok(!VAZAMENTO.test(semBase64(gerar())));
});
t('descricao, observacao, fornecedor e usuario sao escapados (<b> vira texto, nunca tag)', () => {
  const html = gerar({
    itens: [{ item_numero: 1, codigo: 'X<1>', descricao: 'TUBO <b>INOX</b> & CIA', ncm: null, peso_unitario: null,
      quantidade: 1, unidade: 'PC', valor_unitario: 1, ipi_percentual: 0, observacao: '"aspas" <i>obs</i>',
      valor_linha: 1, ipi_linha: 0 }],
    observacoes: '<script>alert(1)</script>',
    fornecedor: { ...pedido28433().fornecedor, nome: 'FORN <b>X</b>' },
  }, EMPRESA, { usuario: '<img src=x>', dataHora: IMPRESSAO.dataHora });
  assert.ok(html.includes('TUBO &lt;b&gt;INOX&lt;/b&gt; &amp; CIA'));
  assert.ok(!html.includes('<b>INOX</b>'));
  assert.ok(html.includes('&quot;aspas&quot; &lt;i&gt;obs&lt;/i&gt;'));
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(html.includes('FORN &lt;b&gt;X&lt;/b&gt;'));
  assert.ok(!html.includes('<img src=x>'));
  assert.ok(html.includes('X&lt;1&gt;'));
});
t('e pura: duas chamadas com a mesma entrada dao a mesma string', () => {
  assert.strictEqual(gerar(), gerar());
});

/* ── controle positivo ─────────────────────────────────────────────────────────────────────── */
console.log('\nControle positivo — as varreduras sabem falhar');
t('a varredura de vazamento pega uma string com "undefined" fora do base64', () => {
  const sabotado = gerar().replace('211,61', 'undefined');
  assert.ok(VAZAMENTO.test(semBase64(sabotado)));
});
t('a varredura de vazamento pega "NaN" e "null" tambem', () => {
  assert.ok(VAZAMENTO.test('<td>NaN</td>'));
  assert.ok(VAZAMENTO.test('<td>null</td>'));
  assert.ok(!VAZAMENTO.test('<td>nullable annulled</td>'), 'so a palavra inteira');
});
t('a verificacao de ordem pega itens fora de ordem', () => {
  const html = gerar();
  const invertido = html.replace('MP-936', 'TMP').replace('MP-937', 'MP-936').replace('TMP', 'MP-937');
  assert.ok(invertido.indexOf('MP-936') > invertido.indexOf('MP-937'));
});

console.log(`\n${ok}/${total} testes OK`);
process.exit(ok === total ? 0 : 1);
