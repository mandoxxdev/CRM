/**
 * Etapa 8, Task 8. Molde: utils/etiquetasPdf.js (Etapa 6c) — montadores PUROS testaveis sem DOM
 * nem binario de PDF, e um renderizador jspdf separado. Zero mudanca de servidor.
 *
 * O que se testa aqui e o CONTEUDO montado (o descritor), nunca o PDF gerado: assertar sobre
 * bytes de PDF nao diz se o numero certo foi para a coluna certa, que e o unico erro que importa
 * num documento que o cliente recebe para conferir o patrimonio dele.
 *
 * Executar: cd client && CI=true npx react-scripts test src/utils/posicaoClientePdf --watchAll=false
 */
import { montarPosicaoClientePDF, gerarPosicaoClientePDF } from './posicaoClientePdf';

// Etapa 186, T3 — o GERADOR, com medidas reais. `getTextWidth`, `splitTextToSize` e `setFontSize` vao para um jsPDF real (A4, mm); TODA
// chamada e gravada em `mockPdf` (inclusive as medidas: a RN-186.11 exige que a producao nao chame `getTextWidth` nem `setFont`).
// Funcao comum, nao jest.fn: o CRA liga `resetMocks`. Molde: components/almoxarifado/EpiAlmoxarifado.test.js.
const mockPdf = [];
jest.mock('jspdf', () => {
  const erroOriginal = console.error;
  console.error = () => {};
  let JsPdfReal;
  try { ({ jsPDF: JsPdfReal } = jest.requireActual('jspdf')); } finally { console.error = erroOriginal; }
  return function JsPdfGravador() {
    const medidor = new JsPdfReal({ format: 'a4', orientation: 'portrait', unit: 'mm' });
    const soMedem = { getTextWidth: true, splitTextToSize: true };
    return new Proxy({}, {
      get: (_alvo, nome) => (...args) => {
        mockPdf.push([nome, ...args]);
        if (nome === 'setFontSize') medidor.setFontSize(...args);
        if (soMedem[nome]) return medidor[nome](...args);
        return undefined;
      },
    });
  };
});

const CLIENTE = { id: 7, razao_social: 'Cliente Alfa LTDA' };
const ITENS = [
  { material_id: 1, codigo: 'CHP-001', nome: 'Chapa 3mm', unidade: 'PC', recebido: 100, consumido: 50, devolvido: 10, saldo: 40 },
  { material_id: 2, codigo: 'TUB-002', nome: 'Tubo 2"', unidade: 'M', recebido: 30, consumido: 0, devolvido: 0, saldo: 30 },
];
const APLICACOES = [
  { material_id: 1, codigo: 'CHP-001', os_id: null, numero_os: null, projeto_id: 9, projeto_nome: 'Projeto Alfa', quantidade: 30 },
  { material_id: 1, codigo: 'CHP-001', os_id: 5, numero_os: 'OS-ALFA-1', projeto_id: null, projeto_nome: null, quantidade: 20 },
];

test('o cabecalho nomeia o cliente e a data de geracao', () => {
  const doc = montarPosicaoClientePDF({ cliente: CLIENTE, itens: ITENS, aplicacoes: APLICACOES, geradoEm: '2026-08-12T10:00:00Z' });
  expect(doc.titulo).toBe('Posição de materiais — Cliente Alfa LTDA');
  expect(doc.geradoEm).toBe('12/08/2026');
});

test('as linhas de item trazem recebido, consumido, devolvido e saldo', () => {
  const doc = montarPosicaoClientePDF({ cliente: CLIENTE, itens: ITENS, aplicacoes: [] });
  expect(doc.linhasItens).toEqual([
    ['CHP-001', 'Chapa 3mm', 'PC', '100', '50', '10', '40'],
    ['TUB-002', 'Tubo 2"', 'M', '30', '0', '0', '30'],
  ]);
});

test('o total do rodape soma os saldos', () => {
  const doc = montarPosicaoClientePDF({ cliente: CLIENTE, itens: ITENS, aplicacoes: [] });
  expect(doc.totalSaldo).toBe(70);
});

test('a aplicacao mostra OS quando ha OS e projeto quando so ha projeto', () => {
  const doc = montarPosicaoClientePDF({ cliente: CLIENTE, itens: ITENS, aplicacoes: APLICACOES });
  expect(doc.linhasAplicacoes).toEqual([
    ['CHP-001', 'Projeto Alfa', '30'],
    ['CHP-001', 'OS OS-ALFA-1', '20'],
  ]);
});

test('sem aplicacoes o bloco sai vazio, nao quebra', () => {
  const doc = montarPosicaoClientePDF({ cliente: CLIENTE, itens: ITENS, aplicacoes: undefined });
  expect(doc.linhasAplicacoes).toEqual([]);
});

test('item sem saldo continua na lista (o cliente precisa ver o que zerou)', () => {
  const doc = montarPosicaoClientePDF({
    cliente: CLIENTE,
    itens: [{ material_id: 3, codigo: 'X', nome: 'Zerado', unidade: 'PC', recebido: 10, consumido: 10, devolvido: 0, saldo: 0 }],
    aplicacoes: [],
  });
  expect(doc.linhasItens).toHaveLength(1);
  expect(doc.totalSaldo).toBe(0);
});

test('sem dados nenhum o montador nao explode — o botao de PDF pode ser clicado antes da carga', () => {
  const doc = montarPosicaoClientePDF();
  expect(doc.linhasItens).toEqual([]);
  expect(doc.linhasAplicacoes).toEqual([]);
  expect(doc.totalSaldo).toBe(0);
  expect(doc.titulo).toBe('Posição de materiais — cliente');
});

test('aplicacao sem OS e sem projeto nao vira linha em branco', () => {
  // A guarda do dono (Task 3) impede saida de material de cliente sem OS nem projeto, e o
  // servico ja filtra essas linhas — mas o montador e usado com o que a tela tiver em maos, e
  // uma linha "aplicado em —" no PDF do cliente parece perda de rastreabilidade, nao ausencia
  // de dado.
  const doc = montarPosicaoClientePDF({
    cliente: CLIENTE,
    itens: ITENS,
    aplicacoes: [{ material_id: 1, codigo: 'CHP-001', os_id: null, numero_os: null, projeto_id: null, projeto_nome: null, quantidade: 5 }],
  });
  expect(doc.linhasAplicacoes).toEqual([]);
});

// Etapa 170 (RN-170.04, B1082) — o *Gerado em* no dia LOCAL de quem gera. DEPENDE DO FUSO (o `jest.globalSetup.js` fixa
// America/Sao_Paulo); a guarda derruba fora dele.
test('[RN-170.04] guarda: o fuso e o de Brasilia', () => {
  expect(new Date('2026-10-21T01:30:00.000Z').getDate()).toBe(20);
});

test('[RN-170.04] gerado as 22h30 de 20/10 (01h30 de 21/10 em UTC) sai 20/10/2026, nao 21/10; ilegivel -> hoje', () => {
  expect(montarPosicaoClientePDF({ cliente: CLIENTE, itens: ITENS, geradoEm: '2026-10-21T01:30:00.000Z' }).geradoEm).toBe('20/10/2026');
  const hoje = new Date();
  const esperado = `${String(hoje.getDate()).padStart(2, '0')}/${String(hoje.getMonth() + 1).padStart(2, '0')}/${hoje.getFullYear()}`;
  expect(montarPosicaoClientePDF({ cliente: CLIENTE, itens: ITENS, geradoEm: 'lixo' }).geradoEm).toBe(esperado); // antes *Invalid Date*
  expect(montarPosicaoClientePDF({ cliente: CLIENTE, itens: ITENS }).geradoEm).toBe(esperado);
});

// ── Etapa 186 (RN-186.04, .06 a .09, .11; B1230, B1232, B1233, B1236) — o PDF da posicao do cliente cabe na folha ────────────────────
// Reguas copiadas aqui (nao importadas de outro teste — regra da 185). As colunas sao o CONTRATO: literal, nao lido da producao.
const COLUNAS_ITENS = [14, 48, 100, 112, 132, 155, 177];
const COLUNAS_APLICACOES = [14, 48, 144];
const COLUNAS_DA_TABELA = [COLUNAS_ITENS, COLUNAS_APLICACOES];
const CABECALHOS = [
  ['Código', 'Material', 'Un.', 'Recebido', 'Consumido', 'Devolvido', 'Saldo'],
  ['Código', 'Aplicado em', 'Quantidade'],
];
const MARGEM = 196;
const FUNDO = 287;
let JsPdfDoTeste;
{
  const erroOriginal = console.error;
  console.error = () => {};
  try { ({ jsPDF: JsPdfDoTeste } = jest.requireActual('jspdf')); } finally { console.error = erroOriginal; }
}
const regua = new JsPdfDoTeste({ format: 'a4', orientation: 'portrait', unit: 'mm' });
const largura = (t, fonte) => { regua.setFontSize(fonte); return regua.getTextWidth(String(t)); };
const semEspacos = (s) => String(s).replace(/\s+/g, '');

// Cada `text` gravado com a fonte e a pagina correntes (pagina 0 = a primeira).
function textosGravados() {
  let fonte = 16;
  let pagina = 0;
  const saida = [];
  for (const [nome, ...args] of mockPdf) {
    if (nome === 'setFontSize') fonte = args[0];
    if (nome === 'addPage') pagina += 1;
    if (nome === 'text') {
      const [t, x, y] = args;
      const linhas = Array.isArray(t) ? t : [t];
      linhas.forEach((l, j) => saida.push({ t: String(l), x, y: y + j * fonte * 1.15 * (25.4 / 72), fonte, pagina }));
    }
  }
  return saida;
}
function textosForaDaFolha() {
  return textosGravados().filter((e) => e.x + largura(e.t, e.fonte) > MARGEM || e.y > FUNDO)
    .map((e) => `${e.t} (x ${e.x}, fim ${(e.x + largura(e.t, e.fonte)).toFixed(1)}, y ${e.y.toFixed(1)}, f${e.fonte})`);
}
// As tabelas (0 = itens, 1 = aplicacoes). Uma tabela comeca num cabecalho ('Código') depois que a anterior fechou; o cabecalho repetido na
// pagina nova (I4) e reconhecido pela string 'Código', nao pelo x, e termina na `line` dele; a `line` fora de cabecalho fecha a tabela (a
// de aplicacoes vai ate o fim). Itens agrupados pela SEQUENCIA: um item comeca quando o x volta a 14 depois de outra coluna.
function tabelas() {
  let fonte = 16;
  let pagina = 0;
  let dentro = false;
  let noCabecalho = false;
  let anteriorX = null;
  const saida = [];
  let atual = null;
  for (const [nome, ...args] of mockPdf) {
    if (nome === 'setFontSize') fonte = args[0];
    if (nome === 'addPage') pagina += 1;
    if (nome === 'line') {
      if (noCabecalho) { noCabecalho = false; dentro = true; anteriorX = null; continue; }
      if (dentro) { dentro = false; atual.fechada = true; }
      continue;
    }
    if (nome !== 'text') continue;
    const [t, x, y] = args;
    if (t === 'Código') {
      if (!atual || atual.fechada) { atual = { itens: [], cabecalhos: [], fechada: false }; saida.push(atual); }
      atual.cabecalhos.push({ pagina, y, textos: [] });
      noCabecalho = true;
    }
    if (noCabecalho) { atual.cabecalhos[atual.cabecalhos.length - 1].textos.push({ t, x, y, fonte }); continue; }
    if (!dentro) continue;
    if (x === 14 && anteriorX !== 14) atual.itens.push([]);
    atual.itens[atual.itens.length - 1].push({ t: String(t), x, y, fonte, pagina });
    anteriorX = x;
  }
  return saida;
}
const linhasDaTabela = (k) => (tabelas()[k] || { itens: [] }).itens;
function celulasInvasoras(k) {
  const colunas = COLUNAS_DA_TABELA[k];
  const fora = [];
  for (const item of linhasDaTabela(k)) {
    for (const c of item) {
      const i = colunas.indexOf(c.x);
      const limite = i < 0 ? -1 : (i < colunas.length - 1 ? colunas[i + 1] - 1 : MARGEM);
      if (i < 0 || c.fonte !== 9 || c.x + largura(c.t, 9) > limite) {
        fora.push(`${c.t} (x ${c.x}, fim ${(c.x + largura(c.t, 9)).toFixed(1)}, limite ${limite})`);
      }
    }
  }
  return fora;
}
const celula = (item, k, col) => item.filter((c) => c.x === COLUNAS_DA_TABELA[k][col]);

const CODIGO_25 = 'EIXO-SAE1045-D50-L1200-RT';
const NOME_71 = 'Eixo usinado em aco SAE 1045 retificado diametro 50 mm comprimento 1200';
const PROJETO_80 = 'Ampliacao da estacao de tratamento de efluentes industriais da planta Sul fase B';
const RAZAO_69 = 'Industria e Comercio de Equipamentos para Saneamento Basicos Ltda EPP';
const N = 99999.125;
const itemCurto = (k) => ({ codigo: `MAT-${k}`, nome: `Item ${k}`, unidade: 'UN', recebido: 1, consumido: 0, devolvido: 0, saldo: 1 });
const itemAlto = (k) => ({ ...itemCurto(k), nome: NOME_71 });
const aplicacaoAlta = (k) => ({ codigo: `MAT-${k}`, numero_os: null, projeto_nome: PROJETO_80, quantidade: 1 });
const gerar = ({ cliente = CLIENTE, itens = [], aplicacoes = [] } = {}) => {
  mockPdf.length = 0;
  gerarPosicaoClientePDF({ cliente, itens, aplicacoes, geradoEm: '2026-10-22T15:00:00.000Z' });
};
const conferirPaginas = (k, limite) => {
  const { itens, cabecalhos } = tabelas()[k];
  const celulas = itens.flat();
  expect(celulas.filter((c) => c.y > limite).map((c) => `${c.t.slice(0, 8)} y ${c.y}`)).toEqual([]);
  for (const item of itens) expect(new Set(item.map((c) => c.pagina)).size).toBe(1);
  // I4: cada pagina com linhas da tabela comeca com o cabecalho dela nos x do contrato; na pagina nova a 1a linha vem em 18 + 7 = 25
  const paginas = [...new Set(celulas.map((c) => c.pagina))];
  expect(paginas.length).toBeGreaterThanOrEqual(2);
  expect(cabecalhos.map((c) => c.pagina)).toEqual(paginas);
  for (const c of cabecalhos) {
    expect(c.textos.map((h) => h.x)).toEqual(COLUNAS_DA_TABELA[k]);
    expect(c.textos.map((h) => h.t)).toEqual(CABECALHOS[k]);
  }
  for (const p of paginas.slice(1)) {
    expect(itens.find((item) => item[0].pagina === p)[0].y).toBe(25);
    expect(cabecalhos.find((c) => c.pagina === p).y).toBe(18);
  }
  return itens;
};

describe('[Etapa 186] o PDF da posicao do cliente cabe na folha (jsPDF real)', () => {
  test('[RN-186.06] codigo de 25 e material de 71: nada invade, nada se perde; material em 3 linhas', () => {
    gerar({ itens: [{ ...itemCurto(1), codigo: CODIGO_25, nome: NOME_71 }] });
    expect(celulasInvasoras(0)).toEqual([]);
    const [item] = linhasDaTabela(0);
    expect(semEspacos(celula(item, 0, 0).map((c) => c.t).join(''))).toBe(semEspacos(CODIGO_25));
    expect(semEspacos(celula(item, 0, 1).map((c) => c.t).join(''))).toBe(semEspacos(NOME_71));
    expect(celula(item, 0, 1)).toHaveLength(3);
  });

  test('[RN-186.06] item comum: um text por celula, x do cabecalho e das celulas = o contrato; cabecalhos em 1 linha', () => {
    gerar({ itens: [{ codigo: 'EPI-MASC-SOLDA-07', nome: 'Mascara de solda', unidade: 'UN', recebido: N, consumido: N, devolvido: N, saldo: N }] });
    const [t] = tabelas();
    expect(t.itens).toHaveLength(1);
    expect(t.itens[0].map((c) => c.x)).toEqual(COLUNAS_ITENS);
    expect(t.itens[0].map((c) => c.t)).toEqual(['EPI-MASC-SOLDA-07', 'Mascara de solda', 'UN', '99999.125', '99999.125', '99999.125', '99999.125']);
    expect(t.cabecalhos).toHaveLength(1);
    expect(t.cabecalhos[0].textos.map((c) => c.x)).toEqual(COLUNAS_ITENS);
    expect(t.cabecalhos[0].textos.map((c) => c.t)).toEqual(CABECALHOS[0]);
    expect(celulasInvasoras(0)).toEqual([]);
    gerar({ itens: [{ ...itemCurto(1), unidade: 'BARRA' }] });
    expect(linhasDaTabela(0)[0]).toHaveLength(7);
  });

  test('[RN-186.07] aplicacao com projeto de 80: 2 linhas ate 143, nada se perde; OS 2026-00042 em 1', () => {
    gerar({
      itens: [itemCurto(1)],
      aplicacoes: [aplicacaoAlta(1), { codigo: 'MAT-2', numero_os: '2026-00042', projeto_nome: null, quantidade: 3 }],
    });
    expect(celulasInvasoras(1)).toEqual([]);
    const [projeto, os] = linhasDaTabela(1);
    expect(semEspacos(celula(projeto, 1, 1).map((c) => c.t).join(''))).toBe(semEspacos(PROJETO_80));
    expect(celula(projeto, 1, 1)).toHaveLength(2);
    expect(celula(os, 1, 1).map((c) => c.t)).toEqual(['OS 2026-00042']);
    expect(tabelas()[1].cabecalhos[0].textos.map((c) => c.x)).toEqual(COLUNAS_APLICACOES);
  });

  test('[RN-186.04] (posicao) itens curtos: o passo de hoje (39, 44, 49)', () => {
    gerar({ itens: [itemCurto(1), itemCurto(2), itemCurto(3)] });
    expect(linhasDaTabela(0).map((item) => item[0].y)).toEqual([39, 44, 49]);
  });

  test('[RN-186.04] (posicao) 70 itens de 3 linhas: nada abaixo de 275, nenhum item partido, cabecalho repetido (I4)', () => {
    gerar({ itens: Array.from({ length: 70 }, (_, k) => itemAlto(k)) });
    const itens = conferirPaginas(0, 275);
    expect(itens).toHaveLength(70);
  });

  test('[RN-186.04] (posicao) 70 aplicacoes de 2 linhas: nada abaixo de 280, nenhuma partida, cabecalho repetido (I4)', () => {
    gerar({ itens: [itemCurto(1)], aplicacoes: Array.from({ length: 70 }, (_, k) => aplicacaoAlta(k)) });
    const itens = conferirPaginas(1, 280);
    expect(itens).toHaveLength(70);
  });

  test('[RN-186.08] razao social de 69: titulo em 2 text de fonte 14 ate 196; a tabela comeca depois; razao curta -> Gerado em em 24', () => {
    gerar({ cliente: { id: 1, razao_social: RAZAO_69 }, itens: [itemCurto(1)] });
    const titulo = textosGravados().filter((e) => e.fonte === 14);
    expect(titulo).toHaveLength(2);
    for (const e of titulo) expect(e.x + largura(e.t, 14)).toBeLessThanOrEqual(MARGEM);
    expect(semEspacos(titulo.map((e) => e.t).join(''))).toBe(semEspacos(`Posição de materiais — ${RAZAO_69}`));
    expect(tabelas()[0].cabecalhos[0].y).toBeGreaterThan(titulo[1].y);
    gerar({ itens: [itemCurto(1)] });
    expect(textosGravados().find((e) => /^Gerado em/.test(e.t)).y).toBe(24);
  });

  test('[RN-186.09] pior caso: razao de 69, 70 itens longos e 70 aplicacoes longas — nada fora da folha nem invadindo', () => {
    const item = (k) => ({ codigo: `${CODIGO_25}-${k}`, nome: `${NOME_71} ${'W'.repeat(40)}`, unidade: 'BARRA',
      recebido: 0.1 + 0.2, consumido: N, devolvido: N, saldo: 0.1 + 0.2 });
    gerar({
      cliente: { id: 1, razao_social: RAZAO_69 },
      itens: Array.from({ length: 70 }, (_, k) => item(k)),
      aplicacoes: Array.from({ length: 70 }, (_, k) => ({ ...aplicacaoAlta(k), codigo: `${CODIGO_25}-${k}`, quantidade: 0.1 + 0.2 })),
    });
    expect(textosForaDaFolha()).toEqual([]);
    expect(celulasInvasoras(0)).toEqual([]);
    expect(celulasInvasoras(1)).toEqual([]);
    expect(linhasDaTabela(0)).toHaveLength(70);
    expect(linhasDaTabela(1)).toHaveLength(70);
  });

  test('[RN-186.11] a producao nao chama getTextWidth nem setFont (o FakePdf da tela nao tem)', () => {
    gerar({ cliente: { id: 1, razao_social: RAZAO_69 }, itens: [itemAlto(1)], aplicacoes: [aplicacaoAlta(1)] });
    const nomes = new Set(mockPdf.map(([n]) => n));
    expect(nomes.has('text')).toBe(true);
    expect(nomes.has('getTextWidth')).toBe(false);
    expect(nomes.has('setFont')).toBe(false);
  });
});
