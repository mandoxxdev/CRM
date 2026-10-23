/**
 * Etapa 189 (T3) — a lista de coleta impressa (RN-189.10 a RN-189.13). O descritor puro e o GERADOR com medidas reais: `splitTextToSize`
 * e `setFontSize` vão para um jsPDF real (A4, mm); TODA chamada é gravada em `mockPdf` (a RN-186.11 exige que a produção não chame
 * `getTextWidth` nem `setFont`). Molde: posicaoClientePdf.test.js (Etapa 186).
 *
 * Executar: cd client && CI=true npx react-scripts test src/utils/listaColetaPdf --watchAll=false
 */
import {
  montarListaColetaPDF, gerarListaColetaPDF, requisicoesParaImprimir, podeImprimirListaColeta,
  nomeArquivoListaColeta, nomeArquivoListaColetaFila,
} from './listaColetaPdf';

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

// Réguas copiadas aqui (regra da 185: não importar da produção o que se quer provar).
const MARGEM = 196;
const FUNDO = 287;
const LIMITE = 275;
const CABECALHO = ['Nº', 'Endereço', 'Material', 'Lote', 'Qtd', 'OK'];
let JsPdfDoTeste;
{
  const erroOriginal = console.error;
  console.error = () => {};
  try { ({ jsPDF: JsPdfDoTeste } = jest.requireActual('jspdf')); } finally { console.error = erroOriginal; }
}
const regua = new JsPdfDoTeste({ format: 'a4', orientation: 'portrait', unit: 'mm' });
const largura = (t, fonte) => { regua.setFontSize(fonte); return regua.getTextWidth(String(t)); };
const semEspacos = (s) => String(s).replace(/\s+/g, '');

beforeEach(() => { mockPdf.length = 0; });

// Cada `text`/`rect` gravado com a fonte e a página correntes, e o índice na sequência.
function eventos() {
  let fonte = 16;
  let pagina = 0;
  const saida = [];
  mockPdf.forEach(([nome, ...args], i) => {
    if (nome === 'setFontSize') fonte = args[0];
    if (nome === 'addPage') pagina += 1;
    if (nome === 'text') saida.push({ tipo: 'text', t: String(args[0]), x: args[1], y: args[2], fonte, pagina, i });
    if (nome === 'rect') saida.push({ tipo: 'rect', x: args[0], y: args[1], w: args[2], h: args[3], pagina, i });
  });
  return saida;
}
const textos = () => eventos().filter((e) => e.tipo === 'text');
function foraDaFolha() {
  return eventos().filter((e) => (e.tipo === 'text'
    ? e.x + largura(e.t, e.fonte) > MARGEM || e.y > FUNDO
    : e.x + e.w > MARGEM || e.y + e.h > FUNDO))
    .map((e) => (e.tipo === 'text' ? `${e.t} (fim ${(e.x + largura(e.t, e.fonte)).toFixed(1)}, y ${e.y.toFixed(1)})` : `rect ${e.x},${e.y}`));
}
// As paradas: cada uma começa no `rect` (o quadrado) e vai até o próximo rect, tirando o cabeçalho repetido e o título da seção.
function paradas() {
  const ev = eventos();
  const saida = [];
  let atual = null;
  ev.forEach((e) => {
    if (e.tipo === 'rect') { atual = { rect: e, textos: [] }; saida.push(atual); return; }
    if (!atual) return;
    if (e.fonte === 9 && CABECALHO.includes(e.t) && [14, 23, 70, 130, 160, 188].includes(e.x)) return;
    if (e.fonte === 14 || e.fonte === 10 || e.t.startsWith('Fila carregada')) { atual = null; return; }
    atual.textos.push(e);
  });
  return saida;
}
const gravouSave = () => mockPdf.filter(([n]) => n === 'save').map(([, nome]) => nome);

const pegar = (over = {}) => ({
  localizacao_id: 1, localizacao_codigo: 'A-01', caminho: 'ALM1 / A-01', lote_id: null, lote_codigo: null, lote_validade: null,
  quantidade_no_endereco: 10, quantidade_sugerida: 2, cobre: true, ...over,
});
const item = (over = {}) => ({
  item_id: 1, material_id: 10, material_codigo: 'MAT-1', material_nome: 'Chapa 3mm', unidade: 'PC', a_separar: 2, separavel: 2,
  a_entregar: 0, origem_separacao_codigo: null, lote_separacao_codigo: null, pegar_em: null, pegar_em_aviso: null, pegar_em_alerta: null,
  ...over,
});
const parada = (it) => ({
  item_id: it.item_id, material_codigo: it.material_codigo, localizacao_id: it.pegar_em.localizacao_id,
  localizacao_codigo: it.pegar_em.localizacao_codigo, caminho: it.pegar_em.caminho, lote_codigo: it.pegar_em.lote_codigo,
  quantidade_sugerida: it.pegar_em.quantidade_sugerida,
});
const req = (over = {}) => ({
  id: 1, numero: 'REQ-001', urgencia: 'URGENTE', solicitante_nome: 'Maria', setor: 'Produção', etapas: ['SEPARAR'],
  itens: [], ordem_coleta: [], ...over,
});

// A requisição do cenário da RN-189.10: ZA-01 (2 itens), ZB-01 com lote e validade e um item na quarentena (sem endereço).
const I1 = item({ item_id: 11, material_codigo: 'MAT-B', material_nome: 'Parafuso', pegar_em: pegar({ localizacao_id: 2,
  localizacao_codigo: 'ZB-01', caminho: 'ZB-01', lote_codigo: 'L7', lote_validade: '2026-11-10', quantidade_sugerida: 4 }),
pegar_em_aviso: 'NENHUM_ENDERECO_COBRE', pegar_em_alerta: 'RETENCAO_NO_MATERIAL' });
const I2 = item({ item_id: 12, material_codigo: 'MAT-A', material_nome: 'Arruela', pegar_em: pegar({ localizacao_codigo: 'ZA-01',
  caminho: 'ALM1 / ZA-01', quantidade_sugerida: 3 }) });
const I3 = item({ item_id: 13, material_codigo: 'MAT-C', material_nome: 'Porca', pegar_em: pegar({ localizacao_codigo: 'ZA-01',
  caminho: 'ALM1 / ZA-01', quantidade_sugerida: 1.5 }) });
const I4 = item({ item_id: 14, material_codigo: 'MAT-Q', material_nome: 'Mola', a_separar: 5, pegar_em_aviso: 'SEM_ENDERECO_SUGERIVEL' });
const I5 = item({ item_id: 15, material_codigo: 'MAT-Z', material_nome: 'Zero', separavel: 0 });
// itens na ordem do pedido (I1 primeiro); a ordem de coleta é outra.
const R = req({ itens: [I1, I2, I3, I4, I5], ordem_coleta: [parada(I2), parada(I3), parada(I1)] });

describe('[RN-189.10] o conteúdo por requisição', () => {
  test('a tabela na ordem de ordem_coleta (não de itens), endereço com e sem caminho, lote com validade e —, Qtd com unidade', () => {
    const r = montarListaColetaPDF({ requisicoes: [R], carregadaEm: '2026-10-23T17:30:00.000Z' }).requisicoes[0];
    expect(r.titulo).toBe('Lista de coleta — REQ-001');
    expect(r.subtitulo).toBe('Solicitante: Maria · Produção · Urgência: Urgente');
    expect(r.linhas).toEqual([
      ['1', 'ZA-01 (ALM1 / ZA-01)', 'MAT-A — Arruela', '—', '3 PC'],
      ['2', 'ZA-01 (ALM1 / ZA-01)', 'MAT-C — Porca', '—', '1,5 PC'],
      ['3', 'ZB-01', 'MAT-B — Parafuso', 'L7 vence 10/11/2026', '4 PC'],
    ]);
  });
  test('aviso e alerta da parada (as frases da tela, nessa ordem); bloco "Sem endereço sugerido"; sem pegar_em e sem aviso fora', () => {
    const r = montarListaColetaPDF({ requisicoes: [R] }).requisicoes[0];
    expect([...r.avisos.keys()]).toEqual([2]);
    expect(r.avisos.get(2)).toBe('Nenhum endereço tem tudo: pegue 4 aqui. Separar o resto de outro endereço depois troca a origem da '
      + "separação. Na entrega, escolha o lote no 'Sai de': a saída automática não escolhe lote. Parte do saldo deste material está "
      + 'retida (em inspeção, bloqueada ou em terceiros) e o sistema não sabe em qual endereço — confira antes de pegar.');
    expect(r.semEndereco).toEqual([{
      texto: 'MAT-Q — Mola · a separar 5 PC',
      aviso: 'Sem endereço para sugerir (o saldo está sem endereço, em endereço bloqueado ou inativo, em área especial ou em lote '
        + 'bloqueado/vencido).',
    }]);
  });
  test('"Fila carregada em …" com a hora local', () => {
    const d = montarListaColetaPDF({ requisicoes: [R], carregadaEm: new Date(2026, 9, 23, 14, 5) });
    expect(d.linhaCarregada).toBe('Fila carregada em 23/10/2026 14:05 — a sugestão vale para esse momento; recarregue a fila antes de '
      + 'imprimir de novo.');
  });
  test('o papel desenhado: os endereços na ordem da coleta, o quadrado por parada, o aviso abaixo dela e o bloco no fim', () => {
    gerarListaColetaPDF({ requisicoes: [R], carregadaEm: new Date(2026, 9, 23, 14, 5), nomeArquivo: 'x.pdf' });
    const t = textos().map((e) => e.t);
    const ends = t.filter((s) => /^Z[AB]-01/.test(s));
    expect(ends).toEqual(['ZA-01 (ALM1 / ZA-01)', 'ZA-01 (ALM1 / ZA-01)', 'ZB-01']);
    expect(eventos().filter((e) => e.tipo === 'rect')).toHaveLength(3);
    const p = paradas();
    expect(p[2].textos.some((e) => e.fonte === 8 && e.t.startsWith('Nenhum endereço'))).toBe(true);
    expect(t.indexOf('Sem endereço sugerido')).toBeGreaterThan(t.indexOf('ZB-01'));
    expect(t).toContain('MAT-Q — Mola · a separar 5 PC');
    expect(t.join(' ')).not.toContain('MAT-Z');
    expect(foraDaFolha()).toEqual([]);
  });
  test('[M6] sem paradas: sem tabela (nem cabeçalho), só o bloco', () => {
    gerarListaColetaPDF({ requisicoes: [req({ itens: [I4], ordem_coleta: [] })], nomeArquivo: 'x.pdf' });
    const t = textos().map((e) => e.t);
    expect(t).not.toContain('Endereço');
    expect(t).toContain('Sem endereço sugerido');
    expect(eventos().filter((e) => e.tipo === 'rect')).toHaveLength(0);
  });
  test('podeImprimirListaColeta: com paradas, ou com item com aviso; senão não', () => {
    expect(podeImprimirListaColeta(R)).toBe(true);
    expect(podeImprimirListaColeta(req({ itens: [I4] }))).toBe(true);
    expect(podeImprimirListaColeta(req({ itens: [I5] }))).toBe(false);
    expect(podeImprimirListaColeta(req({ itens: [], ordem_coleta: undefined }))).toBe(false);
  });
});

describe('[RN-189.11] a lista da fila: uma seção por requisição SEPARAR, na ordem da fila', () => {
  const R1 = req({ id: 1, numero: 'R1', itens: [I2, I3], ordem_coleta: [parada(I2), parada(I3)] });
  const R2 = req({ id: 2, numero: 'R2', etapas: ['ENTREGAR'], itens: [I2], ordem_coleta: [parada(I2)] });
  const R3 = req({ id: 3, numero: 'R3', etapas: ['SEPARAR', 'ENTREGAR'], itens: [I1], ordem_coleta: [parada(I1)] });
  const R4 = req({ id: 4, numero: 'R4', itens: [I5] });
  test('o filtro (etapa SEPARAR + algo a imprimir) e a ordem recebida', () => {
    expect(requisicoesParaImprimir([R3, R2, R1, R4]).map((r) => r.numero)).toEqual(['R3', 'R1']);
    expect(requisicoesParaImprimir([R1, R2, R3, R4]).map((r) => r.numero)).toEqual(['R1', 'R3']);
    expect(requisicoesParaImprimir([R2, R4])).toEqual([]);
  });
  test('a numeração das paradas recomeça em 1 em cada seção', () => {
    const d = montarListaColetaPDF({ requisicoes: requisicoesParaImprimir([R1, R2, R3]) });
    expect(d.requisicoes.map((r) => r.titulo)).toEqual(['Lista de coleta — R1', 'Lista de coleta — R3']);
    expect(d.requisicoes.map((r) => r.linhas.map((l) => l[0]))).toEqual([['1', '2'], ['1']]);
  });
});

describe('[RN-189.12] o papel cabe na folha', () => {
  test('caminho de 120 letras e nome de 100 quebram dentro da coluna, sem perder letra', () => {
    const caminho = `ALM1 / ${'CORREDOR-LONGO-'.repeat(8)}`.slice(0, 120);
    const nome = 'Parafuso sextavado zincado com porca e arruela de pressao para uso em estrutura metalica pesada M12x '.repeat(2)
      .slice(0, 100);
    const it = item({ material_nome: nome, pegar_em: pegar({ caminho, localizacao_codigo: 'X-01' }) });
    gerarListaColetaPDF({ requisicoes: [req({ itens: [it], ordem_coleta: [parada(it)] })], nomeArquivo: 'x.pdf' });
    expect(caminho).toHaveLength(120);
    expect(nome).toHaveLength(100);
    const [p] = paradas();
    const daColuna = (x) => p.textos.filter((e) => e.x === x).map((e) => e.t);
    expect(daColuna(23).length).toBeGreaterThan(1);
    expect(daColuna(70).length).toBeGreaterThan(1);
    expect(semEspacos(daColuna(23).join(''))).toBe(semEspacos(`X-01 (${caminho})`));
    expect(semEspacos(daColuna(70).join(''))).toBe(semEspacos(`MAT-1 — ${nome}`));
    expect(foraDaFolha()).toEqual([]);
  });
  test('Qtd 9999999999.999 PC: um text só, dentro da coluna (encolhe a fonte, não quebra)', () => {
    const it = item({ pegar_em: pegar({ quantidade_sugerida: 9999999999.999 }) });
    gerarListaColetaPDF({ requisicoes: [req({ itens: [it], ordem_coleta: [parada(it)] })], nomeArquivo: 'x.pdf' });
    const qtd = textos().filter((e) => e.x === 160);
    expect(qtd.map((e) => e.t)).toEqual(['Qtd', '9.999.999.999,999 PC']);
    expect(qtd[1].x + largura(qtd[1].t, qtd[1].fonte)).toBeLessThanOrEqual(187);
    expect(foraDaFolha()).toEqual([]);
  });
  test('80 paradas com aviso: 3+ páginas, cabeçalho em toda página, nenhuma parada partida, nada da tabela abaixo de 275', () => {
    const itens = [];
    for (let k = 1; k <= 80; k += 1) {
      itens.push(item({ item_id: k, material_codigo: `M-${k}`, material_nome: k % 3 ? `Material ${k}` : `Material de nome comprido ${k} `.repeat(3),
        pegar_em: pegar({ localizacao_codigo: `E-${k}`, quantidade_sugerida: k }),
        pegar_em_aviso: k % 2 ? 'NENHUM_ENDERECO_COBRE' : null, pegar_em_alerta: k % 5 ? null : 'RETENCAO_NO_MATERIAL' }));
    }
    gerarListaColetaPDF({ requisicoes: [req({ itens, ordem_coleta: itens.map(parada) })], nomeArquivo: 'x.pdf' });
    const ps = paradas();
    expect(ps).toHaveLength(80);
    const paginas = new Set(ps.map((p) => p.rect.pagina));
    expect(paginas.size).toBeGreaterThanOrEqual(3);
    // nenhuma parada partida: todo texto dela na página do quadrado, e nenhum abaixo do limite
    const partidas = ps.filter((p) => p.textos.some((e) => e.pagina !== p.rect.pagina || e.y > LIMITE + 1e-9))
      .map((p) => p.textos[0] && p.textos[0].t);
    expect(partidas).toEqual([]);
    // o cabeçalho em toda página que tem parada, antes da primeira parada dela
    const ev = eventos();
    paginas.forEach((pg) => {
      const primeiraParada = ev.find((e) => e.tipo === 'rect' && e.pagina === pg);
      const cab = ev.filter((e) => e.tipo === 'text' && e.pagina === pg && e.i < primeiraParada.i && CABECALHO.includes(e.t)).map((e) => e.t);
      expect(cab).toEqual(CABECALHO);
    });
    expect(foraDaFolha()).toEqual([]);
  });
  test('a parada com aviso no pé da página: o aviso conta na altura (varre o pé — N paradas simples e depois uma com aviso)', () => {
    let empurradaPeloAviso = 0;
    for (let n = 35; n <= 55; n += 1) {
      mockPdf.length = 0;
      const itens = [];
      for (let k = 1; k <= n; k += 1) itens.push(item({ item_id: k, material_codigo: `M-${k}`, pegar_em: pegar({ localizacao_codigo: `E-${k}` }) }));
      itens.push(item({ item_id: 999, material_codigo: 'M-AVISO', pegar_em: pegar({ localizacao_codigo: 'E-AV', lote_codigo: 'L1', cobre: false }),
        pegar_em_aviso: 'NENHUM_ENDERECO_COBRE', pegar_em_alerta: 'RETENCAO_NO_MATERIAL' }));
      gerarListaColetaPDF({ requisicoes: [req({ itens, ordem_coleta: itens.map(parada) })], nomeArquivo: 'x.pdf' });
      const ps = paradas();
      const ultima = ps[ps.length - 1];
      const penultima = ps[ps.length - 2];
      const fora = ultima.textos.filter((e) => e.pagina !== ultima.rect.pagina || e.y > LIMITE + 1e-9).map((e) => `${n}: ${e.t} y ${e.y}`);
      expect(fora).toEqual([]);
      // a linha da parada (sem o aviso) caberia na página da anterior, e mesmo assim ela foi para a próxima: o aviso contou
      if (ultima.rect.pagina > penultima.rect.pagina && penultima.rect.y + 3 + 5 <= LIMITE) empurradaPeloAviso += 1;
    }
    expect(empurradaPeloAviso).toBeGreaterThan(0); // premissa: a varredura encostou no pé de verdade
  });

  test('a seção que não cabe no pé da página vai inteira para a próxima (o cabeçalho nunca fica sozinho)', () => {
    // R1 enche a página até perto do limite; R2 tem de começar na página seguinte, com a primeira parada junto.
    const muitos = [];
    for (let k = 1; k <= 45; k += 1) muitos.push(item({ item_id: k, material_codigo: `M-${k}`, pegar_em: pegar({ localizacao_codigo: `E-${k}` }) }));
    const R1 = req({ id: 1, numero: 'R1', itens: muitos, ordem_coleta: muitos.map(parada) });
    const outro = item({ item_id: 99, material_codigo: 'M-99', pegar_em: pegar({ localizacao_codigo: 'E-99' }) });
    const R2 = req({ id: 2, numero: 'R2', itens: [outro], ordem_coleta: [parada(outro)] });
    gerarListaColetaPDF({ requisicoes: [R1, R2], nomeArquivo: 'x.pdf' });
    const ev = eventos();
    const tituloR2 = ev.find((e) => e.tipo === 'text' && e.t === 'Lista de coleta — R2');
    const ultimaDeR1 = ev.filter((e) => e.tipo === 'rect' && e.i < tituloR2.i).pop();
    const rectR2 = ev.find((e) => e.tipo === 'rect' && e.i > tituloR2.i);
    expect(tituloR2.pagina).toBe(rectR2.pagina);
    expect(tituloR2.pagina).toBe(ultimaDeR1.pagina + 1); // premissa: R1 terminou perto do pé
  });
  // Fase 5 da 189 (achado 3, sonda P-d): nenhum teste derrubava tirar o addPage do bloco "Sem endereço sugerido" — os cenários longos
  // eram de paradas. Uma requisição com 80 itens sem endereço: o bloco cruza páginas e nada passa do pé da folha.
  test('[Fase 5, P-d] 80 itens sem endereço: o bloco "Sem endereço sugerido" cruza páginas sem passar do pé', () => {
    const itens = [];
    for (let k = 1; k <= 80; k += 1) {
      itens.push(item({ item_id: k, material_codigo: `M-${k}`, a_separar: 3, origem_separacao_codigo: 'A-01',
        pegar_em_aviso: k % 2 ? 'SEM_ENDERECO_SUGERIVEL' : 'PLANEJADA_INDISPONIVEL' }));
    }
    gerarListaColetaPDF({ requisicoes: [req({ itens, ordem_coleta: [] })], nomeArquivo: 'x.pdf' });
    const t = textos();
    // premissa: os 80 itens foram desenhados
    expect(t.filter((e) => /^M-\d+ — /.test(e.t))).toHaveLength(80);
    // o que se prova (antes da premissa das páginas, para ser ESTA a asserção que cai sem o addPage do bloco)
    expect(t.filter((e) => e.y > LIMITE + 1e-9).map((e) => `${e.t} y ${e.y.toFixed(1)}`)).toEqual([]);
    expect(foraDaFolha()).toEqual([]);
    // premissa: o bloco não coube numa página
    expect(Math.max(...t.map((e) => e.pagina))).toBeGreaterThanOrEqual(1);
  });
  test('a produção não chama getTextWidth nem setFont', () => {
    gerarListaColetaPDF({ requisicoes: [R], nomeArquivo: 'x.pdf' });
    expect(mockPdf.filter(([n]) => n === 'getTextWidth' || n === 'setFont')).toEqual([]);
  });
});

describe('[RN-189.13] nomes de arquivo e o dia local', () => {
  test('por requisição e da fila', () => {
    expect(nomeArquivoListaColeta('REQ-055')).toBe('lista-coleta-REQ-055.pdf');
    expect(nomeArquivoListaColeta('REQ 0/55')).toBe('lista-coleta-REQ-0-55.pdf');
    expect(nomeArquivoListaColetaFila(new Date(2026, 9, 23, 9, 0))).toBe('lista-coleta-fila-2026-10-23.pdf');
  });
  test('[RN-170.04] guarda: o fuso é o de Brasília', () => {
    expect(new Date('2026-10-21T01:30:00.000Z').getDate()).toBe(20);
  });
  test('carregada às 22h30 de 20/10 (01h30 de 21/10 em UTC): o dia e a hora locais', () => {
    expect(montarListaColetaPDF({ requisicoes: [], carregadaEm: '2026-10-21T01:30:00.000Z' }).carregadaEm).toBe('20/10/2026 22:30');
    expect(nomeArquivoListaColetaFila('2026-10-21T01:30:00.000Z')).toBe('lista-coleta-fila-2026-10-20.pdf');
  });
  test('o gerador salva com o nome dado', () => {
    gerarListaColetaPDF({ requisicoes: [R], nomeArquivo: 'lista-coleta-REQ-001.pdf' });
    expect(gravouSave()).toEqual(['lista-coleta-REQ-001.pdf']);
  });
});
