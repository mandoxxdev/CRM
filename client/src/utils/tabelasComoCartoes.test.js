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

import {varrerTabelas, rotuloCurto } from './tabelasComoCartoes';

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

describe('pseudo-tabela feita de <div>', () => {
  // Estrutura real de MinhasSolicitacoesCompra: uma linha .head com os nomes
  // das colunas e varias .msc-row com os dados, todas em CSS grid.
  const GRADE = `
    <div class="msc-table">
      <div class="msc-row head"><div>ID</div><div>Setor</div><div>Status</div><div>Data</div></div>
      <div class="msc-row"><div>#4821</div><div>Engenharia de processos</div>
        <div><span class="msc-status">Aprovada</span></div><div>01/02/2026</div></div>
      <div class="msc-row"><div>#4822</div><div>Manutencao</div>
        <div><span class="msc-status">Pendente</span></div><div>02/02/2026</div></div>
    </div>`;

  test('converte: o cabecalho vira data-label e as linhas viram cartao', () => {
    document.body.innerHTML = GRADE;
    varrerTabelas();

    const container = document.querySelector('.msc-table');
    expect(container.classList.contains('grade-cartoes')).toBe(true);

    const primeira = document.querySelectorAll('.msc-row')[1];
    expect(primeira.classList.contains('cartao-auto')).toBe(true);
    const celulas = Array.from(primeira.children);
    expect(celulas.map((c) => c.getAttribute('data-label')))
      .toEqual(['ID', 'Setor', 'Status', 'Data']);
    expect(celulas[0].getAttribute('data-papel')).toBe('id');
    expect(celulas[1].getAttribute('data-papel')).toBe('titulo');
    expect(celulas[2].getAttribute('data-papel')).toBe('situacao');
  });

  test('NAO converte com menos de tres colunas — empilhar duas nao resolve nada', () => {
    document.body.innerHTML = `
      <div class="x-table">
        <div class="x-row head"><div>A</div><div>B</div></div>
        <div class="x-row"><div>1</div><div>2</div></div>
        <div class="x-row"><div>3</div><div>4</div></div>
      </div>`;
    varrerTabelas();
    expect(document.querySelector('.x-table').classList.contains('grade-cartoes')).toBe(false);
  });

  test('NAO converte quando o cabecalho tem numero de colunas diferente das linhas', () => {
    document.body.innerHTML = `
      <div class="y-table">
        <div class="y-row head"><div>A</div><div>B</div><div>C</div></div>
        <div class="y-row"><div>1</div><div>2</div></div>
      </div>`;
    varrerTabelas();
    expect(document.querySelector('.y-table').classList.contains('grade-cartoes')).toBe(false);
  });

  test('NAO confunde um cabecalho de pagina com tabela', () => {
    // `page-header` casa com /head/, e e o caso classico de falso positivo:
    // converter aqui desconfiguraria uma tela que estava certa.
    document.body.innerHTML = `
      <div class="pagina">
        <div class="page-header"><h1>Titulo</h1><button>Novo</button></div>
        <p>Conteudo</p>
      </div>`;
    varrerTabelas();
    expect(document.querySelector('.pagina').classList.contains('grade-cartoes')).toBe(false);
  });

  test('no computador a grade tambem fica intacta', () => {
    fingirCelular(false);
    document.body.innerHTML = GRADE;
    varrerTabelas();
    expect(document.querySelector('.msc-table').classList.contains('grade-cartoes')).toBe(false);
  });

  test('um codigo dentro de pilula continua sendo CODIGO, nao situacao', () => {
    // Caso real: a coluna ID de Minhas Solicitacoes usa <span class="msc-pill">.
    // A classe casa com "pill" e o numero era promovido a selo de status.
    document.body.innerHTML = `
      <div class="z-table">
        <div class="z-row head"><div>ID</div><div>Setor</div><div>Status</div><div>Data</div></div>
        <div class="z-row"><div><span class="msc-pill">#4821</span></div>
          <div>Engenharia de processos</div>
          <div><span class="msc-status">Aprovada</span></div><div>01/02/2026</div></div>
        <div class="z-row"><div><span class="msc-pill">#4822</span></div>
          <div>Manutencao</div>
          <div><span class="msc-status">Pendente</span></div><div>02/02/2026</div></div>
      </div>`;
    varrerTabelas();
    const p = [...document.querySelectorAll('.z-row')[1].children]
      .map((c) => c.getAttribute('data-papel'));
    expect(p[0]).toBe('id');
    expect(p[2]).toBe('situacao');
    expect(p.filter((x) => x === 'situacao')).toHaveLength(1);
  });
});

describe('o cartao de materiais que o P.O. fotografou', () => {
  test('a coluna Foto SEM imagem e reconhecida como foto, e nao como dado', () => {
    // O material sem foto traz um PLACEHOLDER: caixa com icone, sem <img>.
    // A versao anterior exigia a tag, entao a celula caia em `meta` e virava
    // uma faixa escrita "FOTO" com um quadrado cinza — 72px medidos, para
    // nao dizer nada.
    document.body.innerHTML = `
      <table>
        <thead><tr><th>Foto</th><th>Código</th><th>Material</th><th>Status</th></tr></thead>
        <tbody>
          <tr>
            <td><div class="placeholder"><svg></svg></div></td>
            <td>CH-0450-316L</td>
            <td>Chapa inox 316L 4,50mm</td>
            <td><span class="badge">OK</span></td>
          </tr>
        </tbody>
      </table>`;
    varrerTabelas(document);
    const primeira = document.querySelector('tbody td');
    expect(primeira.getAttribute('data-papel')).toBe('foto');
  });

  test('celula cujo valor e um traco e marcada como vazia', () => {
    document.body.innerHTML = `
      <table>
        <thead><tr><th>Código</th><th>Material</th><th>Localização</th><th>Status</th></tr></thead>
        <tbody>
          <tr>
            <td>ESC-001</td>
            <td>Folha A4 para impressora</td>
            <td>—</td>
            <td><span class="badge">OK</span></td>
          </tr>
        </tbody>
      </table>`;
    varrerTabelas(document);
    const tds = document.querySelectorAll('tbody td');
    expect(tds[2].getAttribute('data-vazio')).toBe('1');
    expect(tds[0].getAttribute('data-vazio')).toBeNull();
  });

  test('celula com botao NUNCA conta como vazia, mesmo sem texto', () => {
    document.body.innerHTML = `
      <table>
        <thead><tr><th>Código</th><th>Material</th><th>Ações</th></tr></thead>
        <tbody>
          <tr>
            <td>ESC-001</td>
            <td>Folha A4 para impressora</td>
            <td><button title="Extrato"><svg></svg></button></td>
          </tr>
        </tbody>
      </table>`;
    varrerTabelas(document);
    const acoes = document.querySelectorAll('tbody td')[2];
    expect(acoes.getAttribute('data-vazio')).toBeNull();
  });

  test('botao so com icone ganha legenda vinda do title', () => {
    document.body.innerHTML = `
      <table>
        <thead><tr><th>Código</th><th>Material</th><th>Ações</th></tr></thead>
        <tbody>
          <tr>
            <td>ESC-001</td>
            <td>Folha A4 para impressora</td>
            <td>
              <button title="Entrada rápida de estoque neste material"><svg></svg></button>
              <button title="Extrato"><svg></svg></button>
            </td>
          </tr>
        </tbody>
      </table>`;
    varrerTabelas(document);
    const bts = document.querySelectorAll('tbody td button');
    expect(bts[0].getAttribute('data-rotulo')).toBe('Entrada rápida');
    expect(bts[1].getAttribute('data-rotulo')).toBe('Extrato');
  });

  test('botao que JA mostra texto nao recebe legenda repetida', () => {
    document.body.innerHTML = `
      <table>
        <thead><tr><th>Código</th><th>Material</th><th>Ações</th></tr></thead>
        <tbody>
          <tr>
            <td>ESC-001</td>
            <td>Folha A4 para impressora</td>
            <td><button title="Abrir o extrato">Extrato</button></td>
          </tr>
        </tbody>
      </table>`;
    varrerTabelas(document);
    expect(document.querySelector('tbody td button').getAttribute('data-rotulo')).toBeNull();
  });
});

describe('rotuloCurto', () => {
  test('corta a frase do title numa etiqueta que cabe no botao', () => {
    expect(rotuloCurto('Extrato')).toBe('Extrato');
    expect(rotuloCurto('Entrada rápida de estoque neste material')).toBe('Entrada rápida');
    expect(rotuloCurto('Imprimir etiqueta do material')).toBe('Imprimir');
  });

  test('nao deixa preposicao pendurada no fim', () => {
    // "Plano de" cabe em 14 caracteres, mas termina no ar.
    expect(rotuloCurto('Plano de inspeção')).toBe('Plano');
    expect(rotuloCurto('Edita o cadastro deste material')).toBe('Edita');
  });

  test('aguenta title vazio ou ausente sem quebrar', () => {
    expect(rotuloCurto('')).toBe('');
    expect(rotuloCurto(null)).toBe('');
    expect(rotuloCurto(undefined)).toBe('');
  });

  test('uma palavra sozinha e longa demais ainda volta inteira', () => {
    // Melhor uma etiqueta grande do que um botao sem nome.
    expect(rotuloCurto('Reclassificar')).toBe('Reclassificar');
  });
});
