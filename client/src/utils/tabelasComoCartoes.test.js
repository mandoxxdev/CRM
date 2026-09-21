/**
 * Testes da conversão automática de tabela em cartão.
 *
 * Isto existe porque a conversão é a peça de que 51 das 52 tabelas do sistema
 * dependem para serem usáveis no celular — e ela é uma HEURÍSTICA. Heurística
 * sem teste quebra em silêncio: ninguém percebe que o título virou o código
 * até um usuário reclamar que "os cartões estão estranhos".
 *
 * Cada caso abaixo é uma tabela real do sistema, reduzida ao essencial.
 */

import { varrerTabelas } from './tabelasComoCartoes';

/** Finge um telefone: é a largura que liga a conversão. */
function fingirCelular(ehCelular = true) {
  window.matchMedia = (consulta) => ({
    matches: ehCelular && /max-width:\s*768px/.test(consulta),
    media: consulta,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
  });
}

function montar(html) {
  document.body.innerHTML = html;
  return document.querySelector('table');
}

const papeis = (tabela) => Array.from(tabela.querySelectorAll('tbody tr:first-child td'))
  .map((td) => td.getAttribute('data-papel'));

beforeEach(() => {
  document.body.innerHTML = '';
  fingirCelular(true);
});

describe('conversão de tabela em cartão', () => {
  test('tabela de produtos: deduz foto, código, título, valor e ações', () => {
    const t = montar(`
      <table>
        <thead><tr>
          <th>Foto</th><th>Código</th><th>Nome</th><th>Família</th>
          <th>Preço Base</th><th>ICMS</th><th>Ações</th>
        </tr></thead>
        <tbody><tr>
          <td><img src="/x.png" alt=""></td>
          <td>60-01-DHY-10-01</td>
          <td>Disco dispersor dentado 400mm</td>
          <td>Discos</td>
          <td>R$ 2.480,00</td>
          <td>18%</td>
          <td><button>e</button><button>x</button></td>
        </tr></tbody>
      </table>`);

    varrerTabelas();

    expect(papeis(t)).toEqual([
      'foto', 'id', 'titulo', 'meta', 'valor', 'meta', 'acoes',
    ]);
    expect(t.classList.contains('tabela-cartoes-rica')).toBe(true);
  });

  test('tabela de propostas: o título é o assunto, não o cliente nem o número', () => {
    const t = montar(`
      <table>
        <thead><tr>
          <th>Número</th><th>Título</th><th>Cliente</th><th>Status</th><th>Valor</th>
        </tr></thead>
        <tbody><tr>
          <td>138-01-AJ-2026-REV00</td>
          <td>Disco dispersor de laboratório</td>
          <td>CARVALHO TINTAS</td>
          <td><span class="badge">Enviada</span></td>
          <td>R$ 2.000,00</td>
        </tr></tbody>
      </table>`);

    varrerTabelas();

    const p = papeis(t);
    expect(p[0]).toBe('id');
    expect(p[1]).toBe('titulo');
    expect(p[3]).toBe('situacao');
    expect(p[4]).toBe('valor');
  });

  test('o rótulo da coluna vai para data-label em todas as células', () => {
    const t = montar(`
      <table>
        <thead><tr><th>Código</th><th>Descrição</th></tr></thead>
        <tbody><tr><td>A-1</td><td>Uma descrição qualquer</td></tr></tbody>
      </table>`);

    varrerTabelas();

    const tds = t.querySelectorAll('tbody td');
    expect(tds[0].getAttribute('data-label')).toBe('Código');
    expect(tds[1].getAttribute('data-label')).toBe('Descrição');
  });

  test('só o PRIMEIRO valor em R$ vira destaque; os demais são meta', () => {
    const t = montar(`
      <table>
        <thead><tr><th>Item</th><th>Preço</th><th>Desconto</th><th>Total</th></tr></thead>
        <tbody><tr>
          <td>Bomba centrífuga</td>
          <td>R$ 1.000,00</td>
          <td>R$ 100,00</td>
          <td>R$ 900,00</td>
        </tr></tbody>
      </table>`);

    varrerTabelas();

    const p = papeis(t);
    expect(p.filter((x) => x === 'valor')).toHaveLength(1);
    expect(p[1]).toBe('valor');
    expect(p[2]).toBe('meta');
    expect(p[3]).toBe('meta');
  });

  test('a linha de "nenhum resultado" (colSpan) não é rotulada', () => {
    const t = montar(`
      <table>
        <thead><tr><th>Código</th><th>Nome</th></tr></thead>
        <tbody>
          <tr><td>A-1</td><td>Item de verdade</td></tr>
          <tr><td colspan="2">Nenhum registro encontrado</td></tr>
        </tbody>
      </table>`);

    varrerTabelas();

    const ultima = t.querySelectorAll('tbody tr')[1].querySelector('td');
    expect(ultima.getAttribute('data-papel')).toBeNull();
    expect(ultima.getAttribute('data-label')).toBeNull();
  });

  test('tabela sem cabeçalho não é convertida — melhor rolar do que virar cartão sem rótulo', () => {
    const t = montar(`
      <table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>`);

    varrerTabelas();

    expect(t.classList.contains('tabela-cartoes')).toBe(false);
    expect(t.classList.contains('tabela-cartoes-rica')).toBe(false);
  });

  test('data-sem-cartoes mantém a tabela intacta', () => {
    const t = montar(`
      <table data-sem-cartoes>
        <thead><tr><th>Código</th><th>Nome</th></tr></thead>
        <tbody><tr><td>A-1</td><td>Item</td></tr></tbody>
      </table>`);

    varrerTabelas();

    expect(t.classList.contains('tabela-cartoes')).toBe(false);
  });

  test('sem título identificável, cai para o modo simples em vez de inventar hierarquia', () => {
    // Todas as colunas são números e datas: não há nome de coisa nenhuma.
    const t = montar(`
      <table>
        <thead><tr><th>Data</th><th>Qtd</th><th>Hora</th></tr></thead>
        <tbody><tr><td>01/02/2026</td><td>12</td><td>03/04/2026</td></tr></tbody>
      </table>`);

    varrerTabelas();

    expect(t.classList.contains('tabela-cartoes')).toBe(true);
    expect(t.classList.contains('tabela-cartoes-rica')).toBe(false);
  });

  // ── CONTROLE NEGATIVO ─────────────────────────────────────────────────────
  // Prova que a conversão depende mesmo da largura, e não acontece sempre.
  // Sem este caso, todos os testes acima passariam com uma função que
  // rotulasse tudo, em qualquer tela — inclusive no computador.
  test('no computador NADA é convertido', () => {
    fingirCelular(false);
    const t = montar(`
      <table>
        <thead><tr><th>Código</th><th>Nome</th></tr></thead>
        <tbody><tr><td>A-1</td><td>Item</td></tr></tbody>
      </table>`);

    varrerTabelas();

    expect(t.classList.contains('tabela-cartoes')).toBe(false);
    expect(t.querySelector('td').getAttribute('data-papel')).toBeNull();
  });
});
