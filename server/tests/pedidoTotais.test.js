/**
 * Etapa 32 — RN-03 / RN-04 / RN-05 / RN-12: totais do pedido de compra.
 * Executar: node server/tests/pedidoTotais.test.js
 *
 * Os exemplos vêm do pedido REAL TECNOPAR 28433 (24 itens, total 392,21).
 * Mas exemplo prova exemplo — os invariantes no fim é que provam a regra, e são
 * impossíveis de satisfazer por acidente (lição registrada no fechamento da Etapa 31).
 */

const assert = require('assert');
const { calcularTotaisPedido, calcularLinha, arred2 } = require('../services/compras/pedidoTotais');

let ok = 0;
let falhas = 0;
const t = (nome, fn) => {
  try { fn(); ok++; console.log('  ✓ ' + nome); }
  catch (e) { falhas++; console.log('  ✗ ' + nome + ': ' + e.message); }
};

console.log('\n═══ Totais do pedido de compra ═══\n');

/* ── RN-12: a 4ª casa do unitário é o que reproduz o ERP ────────────────── */
console.log('RN-12 — precisão do preço unitário');
{
  // As seis linhas do 28433 que divergiam quando o unitário vinha com 3 casas.
  // [quantidade, unitario_4casas, total_impresso_pelo_ERP]
  const RECONSTRUIDAS = [
    [13, 0.7985, 10.38],
    [7, 0.2824, 1.98],
    [49, 0.1063, 5.21],
    [49, 0.0453, 2.22],
    [49, 0.0381, 1.87],
    [5, 1.1905, 5.95],
  ];
  RECONSTRUIDAS.forEach(([quantidade, valor_unitario, esperado]) => {
    t(`${quantidade} × ${valor_unitario} = ${esperado.toFixed(2)} (igual ao ERP)`, () => {
      const { valor_linha } = calcularLinha({ quantidade, valor_unitario });
      assert.strictEqual(valor_linha, esperado);
    });
  });

  t('com o unitário truncado a 3 casas o resultado MUDA (a perda é do dado, não da fórmula)', () => {
    assert.strictEqual(calcularLinha({ quantidade: 49, valor_unitario: 0.106 }).valor_linha, 5.19);
    assert.strictEqual(calcularLinha({ quantidade: 49, valor_unitario: 0.1063 }).valor_linha, 5.21);
  });
}

/* ── RN-03 / RN-04: linhas ──────────────────────────────────────────────── */
console.log('\nRN-03 / RN-04 — linha e IPI');
{
  t('linha do item 1 do pedido real: 13 × 2,191 = 28,48', () => {
    assert.strictEqual(calcularLinha({ quantidade: 13, valor_unitario: 2.191 }).valor_linha, 28.48);
  });

  t('IPI de 6,5% sobre 28,48 = 1,85', () => {
    const { ipi_linha } = calcularLinha({ quantidade: 13, valor_unitario: 2.191, ipi_percentual: 6.5 });
    assert.strictEqual(ipi_linha, 1.85);
  });

  t('IPI ausente ou zero não inventa imposto', () => {
    assert.strictEqual(calcularLinha({ quantidade: 10, valor_unitario: 5 }).ipi_linha, 0);
    assert.strictEqual(calcularLinha({ quantidade: 10, valor_unitario: 5, ipi_percentual: 0 }).ipi_linha, 0);
  });

  t('RN-03: valor_total enviado pelo cliente é IGNORADO', () => {
    const { itens } = calcularTotaisPedido([
      { quantidade: 13, valor_unitario: 2.191, valor_total: 999, valor_linha: 888 },
    ]);
    assert.strictEqual(itens[0].valor_linha, 28.48);
  });

  t('lixo em quantidade/unitário vira 0, não NaN', () => {
    const { valor_linha } = calcularLinha({ quantidade: 'abc', valor_unitario: null });
    assert.strictEqual(valor_linha, 0);
    assert.ok(Number.isFinite(valor_linha));
  });
}

/* ── RN-05: totais ──────────────────────────────────────────────────────── */
console.log('\nRN-05 — os seis totais');
{
  const itens = [
    { quantidade: 13, valor_unitario: 2.191, ipi_percentual: 6.5 },
    { quantidade: 2, valor_unitario: 85.11, ipi_percentual: 6.5 },
  ];

  t('total_produtos é a soma das linhas', () => {
    const { totais } = calcularTotaisPedido(itens);
    assert.strictEqual(totais.total_produtos, arred2(28.48 + 170.22));
  });

  t('total_geral soma IPI, ICMS ST e frete, e SUBTRAI desconto', () => {
    const { totais } = calcularTotaisPedido(itens, {
      total_icms_st: 10, valor_frete: 20, total_desconto: 5,
    });
    const esperado = arred2(totais.total_produtos + totais.total_ipi + 10 + 20 - 5);
    assert.strictEqual(totais.total_geral, esperado);
  });

  t('pedido sem itens dá seis zeros, não NaN', () => {
    const { totais } = calcularTotaisPedido([]);
    Object.entries(totais).forEach(([k, v]) => {
      assert.strictEqual(v, 0, k + ' deveria ser 0, veio ' + v);
    });
  });

  t('itens não-array não explode', () => {
    assert.strictEqual(calcularTotaisPedido(null).totais.total_geral, 0);
    assert.strictEqual(calcularTotaisPedido(undefined).totais.total_produtos, 0);
  });

  t('os itens voltam COM os derivados (o chamador não recalcula)', () => {
    const { itens: calc } = calcularTotaisPedido(itens);
    assert.ok(calc.every((i) => typeof i.valor_linha === 'number' && typeof i.ipi_linha === 'number'));
  });
}

/* ── INVARIANTES — é o que prova a regra ────────────────────────────────── */
console.log('\nInvariantes (aleatórios, 400 casos)');
{
  // Gerador determinístico: falha reproduzível, sem depender de Math.random.
  let semente = 20260911;
  const rnd = () => {
    semente = (semente * 1103515245 + 12345) % 2147483648;
    return semente / 2147483648;
  };
  const geraItens = () => Array.from({ length: 1 + Math.floor(rnd() * 30) }, () => ({
    quantidade: Math.round(rnd() * 5000) / 100,
    valor_unitario: Math.round(rnd() * 100000) / 10000,
    ipi_percentual: [0, 6.5, 10, 12.5][Math.floor(rnd() * 4)],
  }));

  t('INV-1: total_produtos === arred2(Σ das linhas JÁ arredondadas)', () => {
    for (let i = 0; i < 400; i++) {
      const itens = geraItens();
      const { itens: calc, totais } = calcularTotaisPedido(itens);
      const soma = arred2(calc.reduce((s, x) => s + x.valor_linha, 0));
      assert.strictEqual(totais.total_produtos, soma, 'caso ' + i);
    }
  });

  t('INV-2: total_geral é exatamente a soma dos cinco componentes', () => {
    for (let i = 0; i < 400; i++) {
      const enc = { total_icms_st: rnd() * 50, valor_frete: rnd() * 80, total_desconto: rnd() * 30 };
      const { totais } = calcularTotaisPedido(geraItens(), enc);
      const esperado = arred2(
        totais.total_produtos + totais.total_ipi + totais.total_icms_st
        + totais.valor_frete - totais.total_desconto
      );
      assert.strictEqual(totais.total_geral, esperado, 'caso ' + i);
    }
  });

  t('INV-3: nenhum total sai com mais de 2 casas decimais', () => {
    for (let i = 0; i < 400; i++) {
      const { totais } = calcularTotaisPedido(geraItens(), { valor_frete: rnd() * 99 });
      Object.entries(totais).forEach(([k, v]) => {
        assert.strictEqual(arred2(v), v, k + ' com mais de 2 casas: ' + v);
      });
    }
  });

  t('INV-4: dobrar a quantidade de todos os itens dobra o total de produtos', () => {
    for (let i = 0; i < 100; i++) {
      // Só com unitários de 2 casas: aí a linha é exata e a proporcionalidade
      // não sofre do arredondamento de cada linha.
      const itens = Array.from({ length: 1 + Math.floor(rnd() * 10) }, () => ({
        quantidade: 1 + Math.floor(rnd() * 50),
        valor_unitario: Math.round(rnd() * 10000) / 100,
      }));
      const simples = calcularTotaisPedido(itens).totais.total_produtos;
      const dobro = calcularTotaisPedido(
        itens.map((x) => ({ ...x, quantidade: x.quantidade * 2 }))
      ).totais.total_produtos;
      assert.strictEqual(dobro, arred2(simples * 2), 'caso ' + i);
    }
  });
}

/* ── Controle positivo ──────────────────────────────────────────────────── */
console.log('\nControle positivo — os invariantes sabem reprovar?');
{
  // Réplica sabotada: arredonda a SOMA em vez das linhas (o erro que a RN-05 proíbe).
  const sabotado = (itens) => {
    const bruto = itens.reduce((s, i) => s + (i.quantidade || 0) * (i.valor_unitario || 0), 0);
    return arred2(bruto);
  };
  const itensQueDenunciam = [
    { quantidade: 3, valor_unitario: 0.005 },
    { quantidade: 3, valor_unitario: 0.005 },
    { quantidade: 3, valor_unitario: 0.005 },
  ];
  t('INV-1 reprova a versão que arredonda a soma em vez das linhas', () => {
    const correto = calcularTotaisPedido(itensQueDenunciam).totais.total_produtos;
    const errado = sabotado(itensQueDenunciam);
    assert.notStrictEqual(correto, errado,
      'a fixture não distingue as duas ordens de arredondamento — invariante inútil');
  });
}

console.log(`\n${ok} passaram, ${falhas} falharam`);
process.exit(falhas === 0 ? 0 : 1);
