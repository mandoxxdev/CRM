/**
 * Etapa 8b, Task 9 — descritor do documento de remessa.
 *
 * O montador e testado como funcao PURA: assertar sobre bytes de PDF nao diz se o numero certo foi
 * para a coluna certa, e num documento que acompanha material saindo do predio essa e a unica falha
 * que importa. Mesmo padrao de utils/posicaoClientePdf.js (Etapa 8) e utils/etiquetasPdf.js (6c).
 *
 * Executar: cd client && CI=true npx react-scripts test src/utils/remessaPdf --watchAll=false
 */
import { montarRemessaPDF, gerarRemessaPDF } from './remessaPdf';

// Etapa 186, T2 — o GERADOR, com medidas reais. `getTextWidth`, `splitTextToSize` e `setFontSize` vao para um jsPDF real (A4, mm); TODA
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

const REMESSA = {
  numero: 'REM-12345678',
  fornecedor_nome: 'Galvanizadora Sul LTDA',
  tipo_servico: 'Galvanizacao',
  prazo_previsto: '2026-09-30',
  status: 'ENVIADA',
  observacoes: 'carga fechada',
  proprietario_cliente_id: null,
  proprietario_cliente_nome: null,
};
const ITENS = [
  { material_codigo: 'CHP-3MM', material_nome: 'Chapa 3mm', unidade: 'PC', quantidade: 30, peso: 240, quantidade_retornada: 0 },
  { material_codigo: 'TUB-2', material_nome: 'Tubo 2"', unidade: 'M', quantidade: 12, peso: null, quantidade_retornada: 4 },
];

describe('montarRemessaPDF', () => {
  test('o titulo traz o numero da remessa e o terceiro', () => {
    const doc = montarRemessaPDF({ remessa: REMESSA, itens: ITENS, geradoEm: '2026-08-12T00:00:00Z' });
    expect(doc.titulo).toContain('REM-12345678');
    expect(doc.subtitulo).toContain('Galvanizadora Sul LTDA');
    expect(doc.subtitulo).toContain('Galvanizacao');
  });

  test('cada item vira uma linha com codigo, nome, unidade, quantidade e peso', () => {
    const doc = montarRemessaPDF({ remessa: REMESSA, itens: ITENS });
    expect(doc.linhasItens).toHaveLength(2);
    expect(doc.linhasItens[0]).toEqual(['CHP-3MM', 'Chapa 3mm', 'PC', '30', '240']);
    // Peso ausente vira '—', nao 'null' nem '0': zero quilo e uma afirmacao, ausencia nao e.
    expect(doc.linhasItens[1]).toEqual(['TUB-2', 'Tubo 2"', 'M', '12', '—']);
  });

  test('o prazo previsto aparece formatado em pt-BR', () => {
    const doc = montarRemessaPDF({ remessa: REMESSA, itens: ITENS });
    expect(doc.prazo).toBe('30/09/2026');
  });

  test('sem prazo o documento diz "sem prazo definido", e nao uma data inventada', () => {
    const doc = montarRemessaPDF({ remessa: { ...REMESSA, prazo_previsto: null }, itens: ITENS });
    expect(doc.prazo).toMatch(/sem prazo/i);
  });

  test('DOCUMENTO DE MATERIAL DE CLIENTE NOMEIA O PROPRIETARIO', () => {
    // Decisao 5: a isencao da guarda do dono so e aceitavel COM esta contrapartida. Sem o nome no
    // papel, material de cliente sai do predio sem rastro de propriedade.
    const doc = montarRemessaPDF({
      remessa: { ...REMESSA, proprietario_cliente_id: 7, proprietario_cliente_nome: 'Cliente Chapa LTDA' },
      itens: ITENS,
    });
    expect(doc.proprietario).toContain('Cliente Chapa LTDA');
  });

  test('[CONTROLE POSITIVO] material NOSSO nao inventa proprietario', () => {
    // A metade que falta: escrever sempre "material de cliente" passaria no teste acima e poria
    // um dono falso em todo documento de material nosso.
    const doc = montarRemessaPDF({ remessa: REMESSA, itens: ITENS });
    expect(doc.proprietario).toBeNull();
  });

  test('o total de itens e a soma das quantidades batem com a lista', () => {
    const doc = montarRemessaPDF({ remessa: REMESSA, itens: ITENS });
    expect(doc.totalItens).toBe(2);
    expect(doc.totalQuantidade).toBe(42);
  });

  test('remessa sem itens nao quebra o montador', () => {
    const doc = montarRemessaPDF({ remessa: REMESSA });
    expect(doc.linhasItens).toEqual([]);
    expect(doc.totalQuantidade).toBe(0);
  });

  // ── Encerramento: o que NAO voltou ────────────────────────────────────────────────────────────
  // Task 7 (thirdPartyService.encerrarRemessa) grava `quantidade_retornada = quantidade` nos itens
  // pendentes ao encerrar com destino — ali isso significa LIQUIDADO, nao "voltou". A verdade do
  // que voltou esta em retornos_remessa_item_almoxarifado; o cabecalho guarda
  // `encerramento_destino`. Sem ler o destino, este documento afirmaria que o material voltou
  // quando ele se perdeu no terceiro.

  test('remessa encerrada por PERDA declara a baixa definitiva e o destino', () => {
    const doc = montarRemessaPDF({
      remessa: {
        ...REMESSA, status: 'ENCERRADA', encerramento_destino: 'PERDA_NO_TERCEIRO',
        encerramento_justificativa: 'sumiu no banho de zinco',
      },
      itens: ITENS,
    });
    expect(doc.encerramento).toMatch(/perda no terceiro/i);
    expect(doc.encerramento).toMatch(/baixa definitiva/i);
    expect(doc.encerramento).toContain('sumiu no banho de zinco');
  });

  test('remessa encerrada por CONSUMO nomeia o consumo, e nao a perda', () => {
    // Os dois destinos baixam estoque, mas dizem coisas diferentes ao operador: "virou cavaco" nao
    // e "sumiu". Trocar um pelo outro no papel troca a explicacao do desaparecimento.
    const doc = montarRemessaPDF({
      remessa: {
        ...REMESSA, status: 'ENCERRADA', encerramento_destino: 'CONSUMIDO_NO_PROCESSO',
        encerramento_justificativa: 'virou cavaco na usinagem',
      },
      itens: ITENS,
    });
    expect(doc.encerramento).toMatch(/consumido no processo/i);
    expect(doc.encerramento).not.toMatch(/perda no terceiro/i);
  });

  test('[CONTROLE POSITIVO] remessa em curso nao declara encerramento nenhum', () => {
    const doc = montarRemessaPDF({ remessa: REMESSA, itens: ITENS });
    expect(doc.encerramento).toBeNull();
  });

  test('[CONTROLE POSITIVO] remessa que voltou inteira encerra SEM destino e nao inventa baixa', () => {
    // Retorno total encerra sozinho, com `encerramento_destino` NULL — e isso e correto, nao buraco
    // (comentario de encerrarRemessa). Escrever "baixa definitiva" aqui afirmaria uma perda que
    // nao houve num papel que o terceiro assinou.
    const doc = montarRemessaPDF({
      remessa: { ...REMESSA, status: 'ENCERRADA', encerramento_destino: null },
      itens: ITENS,
    });
    expect(doc.encerramento).toBeNull();
  });
});

// Etapa 170 (RN-170.04, B1082) — o *Gerado em* no dia LOCAL de quem gera e o prazo no dia gravado. DEPENDE DO FUSO: o
// `client/jest.globalSetup.js` fixa America/Sao_Paulo; a guarda derruba o cenario fora dele (num processo em UTC o dia UTC e o local
// coincidem e o teste passaria provando nada).
describe('[RN-170.04] as datas da remessa no dia de Brasilia', () => {
  test('guarda: o fuso e o de Brasilia', () => {
    expect(new Date('2026-10-21T01:30:00.000Z').getDate()).toBe(20);
  });

  test('gerado as 22h30 de 20/10 (01h30 de 21/10 em UTC) sai 20/10/2026, nao 21/10', () => {
    const doc = montarRemessaPDF({ remessa: REMESSA, itens: ITENS, geradoEm: '2026-10-21T01:30:00.000Z' });
    expect(doc.geradoEm).toBe('20/10/2026');
    // metade positiva: de dia o dia e o mesmo nas duas leituras
    expect(montarRemessaPDF({ remessa: REMESSA, itens: ITENS, geradoEm: '2026-10-20T15:00:00.000Z' }).geradoEm).toBe('20/10/2026');
    // Fase 5 r3: um instante longe de hoje — o documento usa o geradoEm recebido, nao o relogio (sem isto, ignorar o geradoEm passava no
    // dia em que o teste foi escrito)
    expect(montarRemessaPDF({ remessa: REMESSA, itens: ITENS, geradoEm: '2026-08-12T15:00:00.000Z' }).geradoEm).toBe('12/08/2026');
  });

  test('o prazo (coluna so de data) e o dia gravado, com ou sem hora; ilegivel -> sem prazo', () => {
    expect(montarRemessaPDF({ remessa: { ...REMESSA, prazo_previsto: '2026-09-30' }, itens: ITENS }).prazo).toBe('30/09/2026');
    expect(montarRemessaPDF({ remessa: { ...REMESSA, prazo_previsto: '2026-09-30 01:00:00' }, itens: ITENS }).prazo).toBe('30/09/2026');
    expect(montarRemessaPDF({ remessa: { ...REMESSA, prazo_previsto: 'lixo' }, itens: ITENS }).prazo).toBe('sem prazo definido');
  });

  test('geradoEm vazio ou ilegivel -> o dia de hoje (local)', () => {
    const hoje = new Date();
    const esperado = `${String(hoje.getDate()).padStart(2, '0')}/${String(hoje.getMonth() + 1).padStart(2, '0')}/${hoje.getFullYear()}`;
    expect(montarRemessaPDF({ remessa: REMESSA, itens: ITENS }).geradoEm).toBe(esperado);
    expect(montarRemessaPDF({ remessa: REMESSA, itens: ITENS, geradoEm: 'lixo' }).geradoEm).toBe(esperado);
  });
});

// ── Etapa 186 (RN-186.02 a .05, .09, .11; B1230, B1232-B1235) — o PDF da remessa cabe na folha ───────────────────────────────────────
// Reguas copiadas aqui (nao importadas de outro teste — regra da 185). As colunas sao o CONTRATO: literal, nao lido da producao.
const COLUNAS_REMESSA = [14, 48, 126, 142, 166];
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
      // `text` com array (o encerramento): o jsPDF desce fonte x 1,15 pt por linha
      linhas.forEach((l, j) => saida.push({ t: String(l), x, y: y + j * fonte * 1.15 * (25.4 / 72), fonte, pagina }));
    }
  }
  return saida;
}
function textosForaDaFolha() {
  return textosGravados().filter((e) => e.x + largura(e.t, e.fonte) > MARGEM || e.y > FUNDO)
    .map((e) => `${e.t} (x ${e.x}, fim ${(e.x + largura(e.t, e.fonte)).toFixed(1)}, y ${e.y.toFixed(1)}, f${e.fonte})`);
}
const EH_CONTINUACAO = /^Remessa para terceiros — .* \(continuação\)$/;
// A tabela: do 1o cabecalho ('Código') ao fechamento. Cabecalho repetido na pagina nova (I4) e pulado — reconhecido pela string
// 'Código', nao pelo x — e cada cabecalho termina na `line` dele. Itens agrupados pela SEQUENCIA: um item comeca quando o x volta a 14
// depois de uma celula de outra coluna (o recorte por y quebra na pagina 2, I1 da 185).
function tabela() {
  let fonte = 16;
  let pagina = 0;
  let dentro = false;
  let noCabecalho = false;
  const itens = [];
  const cabecalhos = [];
  const continuacoes = [];
  let anteriorX = null;
  for (const [nome, ...args] of mockPdf) {
    if (nome === 'setFontSize') fonte = args[0];
    if (nome === 'addPage') pagina += 1;
    if (nome === 'line') {
      if (noCabecalho) { noCabecalho = false; dentro = true; anteriorX = null; continue; }
      if (dentro) break;
      continue;
    }
    if (nome !== 'text') continue;
    const [t, x, y] = args;
    // fix-round da Fase 5 (I-1): toda pagina nova comeca com a identificacao — nao e item da tabela
    if (EH_CONTINUACAO.test(t)) { continuacoes.push({ t, pagina, y }); continue; }
    if (t === 'Código') { cabecalhos.push({ pagina, y, textos: [] }); noCabecalho = true; }
    if (noCabecalho) { cabecalhos[cabecalhos.length - 1].textos.push({ t, x, y, fonte }); continue; }
    if (!dentro) continue;
    if (x === 14 && anteriorX !== 14) itens.push([]);
    itens[itens.length - 1].push({ t: String(t), x, y, fonte, pagina });
    anteriorX = x;
  }
  return { itens, cabecalhos, continuacoes };
}
const linhasDaTabela = () => tabela().itens;
function celulasInvasoras() {
  const fora = [];
  for (const item of linhasDaTabela()) {
    for (const c of item) {
      const i = COLUNAS_REMESSA.indexOf(c.x);
      const limite = i < 0 ? -1 : (i < COLUNAS_REMESSA.length - 1 ? COLUNAS_REMESSA[i + 1] - 1 : MARGEM);
      if (i < 0 || c.fonte !== 9 || c.x + largura(c.t, 9) > limite) {
        fora.push(`${c.t} (x ${c.x}, fim ${(c.x + largura(c.t, 9)).toFixed(1)}, limite ${limite})`);
      }
    }
  }
  return fora;
}
const celula = (item, col) => item.filter((c) => c.x === COLUNAS_REMESSA[col]);

const CODIGO_25 = 'EIXO-SAE1045-D50-L1200-RT';
const NOME_71 = 'Eixo usinado em aco SAE 1045 retificado diametro 50 mm comprimento 1200';
const NOME_46 = 'Chapa de aco inox 304 2B 3,00 x 1250 x 3000 mm';
const W_120 = 'W'.repeat(120);
const curto = (k) => ({ material_codigo: `MAT-${k}`, material_nome: `Item ${k}`, unidade: 'UN', quantidade: 1, peso: null });
const alto = (k) => ({ material_codigo: `MAT-${k}`, material_nome: W_120, unidade: 'UN', quantidade: 1, peso: null });
// Observacao de exatamente n linhas em 175 mm, fonte 9 (medida no jsPDF real).
function observacaoDe(n) {
  const frase = 'Material embalado em caixa de madeira lacrada, conferir lacre na chegada. ';
  let t = '';
  regua.setFontSize(9);
  while (regua.splitTextToSize(t.trim() || 'x', 175).length < n) t += frase;
  while (regua.splitTextToSize(t.trim(), 175).length > n) t = t.slice(0, -1);
  return t.trim();
}
const gerar = (remessa, itens) => {
  mockPdf.length = 0;
  gerarRemessaPDF({ remessa: { ...REMESSA, ...remessa }, itens, geradoEm: '2026-10-22T15:00:00.000Z' });
};
const pagEy = (e) => e.pagina * 1000 + e.y;
const linhasDaObservacao = (n) => {
  const textos = textosGravados();
  const iRotulo = textos.findIndex((e) => e.t === 'Observações:');
  return textos.slice(iRotulo + 1).filter((e) => !EH_CONTINUACAO.test(e.t)).slice(0, n);
};

describe('[Etapa 186] o PDF da remessa cabe na folha (jsPDF real)', () => {
  test('[RN-186.02] codigo de 25 e nome de 71: nada invade, nada se perde; codigo em 2 linhas e material em 2', () => {
    gerar({}, [{ material_codigo: CODIGO_25, material_nome: NOME_71, unidade: 'UN', quantidade: 2, peso: 10 }]);
    expect(celulasInvasoras()).toEqual([]);
    const [item] = linhasDaTabela();
    expect(semEspacos(celula(item, 0).map((c) => c.t).join(''))).toBe(semEspacos(CODIGO_25));
    expect(semEspacos(celula(item, 1).map((c) => c.t).join(''))).toBe(semEspacos(NOME_71));
    expect(celula(item, 0)).toHaveLength(2);
    expect(celula(item, 1)).toHaveLength(2);
  });

  test('[RN-186.03] item comum: cada celula e UM text; x do cabecalho e das celulas = o contrato', () => {
    gerar({}, [{ material_codigo: 'EPI-MASC-SOLDA-07', material_nome: NOME_46, unidade: 'UN', quantidade: 99999.125, peso: '1250.75' }]);
    const { itens, cabecalhos } = tabela();
    expect(itens).toHaveLength(1);
    expect(itens[0].map((c) => c.x)).toEqual(COLUNAS_REMESSA);
    // fix-round da Fase 5 (M-c): numero no formato das telas do modulo (pt-BR, ate 4 casas)
    expect(itens[0].map((c) => c.t)).toEqual(['EPI-MASC-SOLDA-07', NOME_46, 'UN', '99.999,125', '1.250,75']);
    expect(cabecalhos).toHaveLength(1);
    expect(cabecalhos[0].textos.map((c) => c.x)).toEqual(COLUNAS_REMESSA);
    expect(cabecalhos[0].textos.map((c) => c.t)).toEqual(['Código', 'Material', 'Un.', 'Qtde', 'Peso (kg)']);
    gerar({}, [{ material_codigo: 'X', material_nome: 'Y', unidade: 'BARRA', quantidade: 1, peso: null }]);
    expect(linhasDaTabela()[0]).toHaveLength(5);
  });

  test('[RN-186.04] (a) itens curtos: o passo de hoje (y0, y0 + 5, y0 + 10) — y0 = 49 sem proprietario', () => {
    gerar({}, [curto(1), curto(2), curto(3)]);
    expect(linhasDaTabela().map((item) => item[0].y)).toEqual([49, 54, 59]);
  });

  test('[RN-186.04] (b) a linha cresce: depois de um item de 5 linhas o seguinte vem em y + 5 + 16', () => {
    gerar({}, [curto(1), alto(2), curto(3)]);
    const itens = linhasDaTabela();
    expect(celula(itens[1], 1).map((c) => c.y)).toEqual([54, 58, 62, 66, 70]);
    expect(itens[2][0].y).toBe(54 + 5 + 16);
  });

  test('[RN-186.04] (c) 60 itens de 5 linhas: nada abaixo de 262, nenhum item partido, cabecalho repetido em cada pagina (I4)', () => {
    gerar({}, Array.from({ length: 60 }, (_, k) => alto(k)));
    const { itens, cabecalhos, continuacoes } = tabela();
    expect(itens).toHaveLength(60);
    expect(mockPdf.filter(([n]) => n === 'addPage').length).toBeGreaterThanOrEqual(1);
    const celulas = itens.flat();
    expect(celulas.filter((c) => c.y > 262).map((c) => `${c.t.slice(0, 8)} y ${c.y}`)).toEqual([]);
    for (const item of itens) expect(new Set(item.map((c) => c.pagina)).size).toBe(1);
    // I4: cada pagina com itens comeca com os 5 cabecalhos nos x do contrato; na pagina nova a 1a linha vem em 18 + 7 = 25
    const paginas = [...new Set(celulas.map((c) => c.pagina))];
    expect(paginas.length).toBeGreaterThanOrEqual(2);
    expect(cabecalhos.map((c) => c.pagina)).toEqual(paginas);
    for (const c of cabecalhos) {
      expect(c.textos.map((h) => h.x)).toEqual(COLUNAS_REMESSA);
      expect(c.textos.map((h) => h.t)).toEqual(['Código', 'Material', 'Un.', 'Qtde', 'Peso (kg)']);
    }
    // fix-round da Fase 5 (I-1): a pagina nova abre com a identificacao em 18; o cabecalho vem em 26 e a 1a linha em 26 + 7 = 33
    expect(continuacoes.map((c) => [c.pagina, c.y])).toEqual(paginas.slice(1).map((p) => [p, 18]));
    for (const p of paginas.slice(1)) {
      expect(itens.find((item) => item[0].pagina === p)[0].y).toBe(33);
      expect(cabecalhos.find((c) => c.pagina === p).y).toBe(26);
    }
  });

  test('[RN-186.05] proprietario de 80 W e subtitulo de 120: quebram em 2+ text e nada passa da folha', () => {
    gerar({ proprietario_cliente_id: 9, proprietario_cliente_nome: 'W'.repeat(80), fornecedor_nome: 'Fornecedor '.repeat(11).trim() }, [curto(1)]);
    expect(textosForaDaFolha()).toEqual([]);
    const textos = textosGravados();
    expect(textos.filter((e) => e.fonte === 10 && /^(Material de propriedade|W{5})/.test(e.t)).length).toBeGreaterThanOrEqual(2);
    expect(textos.filter((e) => e.fonte === 10 && /Fornecedor/.test(e.t)).length).toBeGreaterThanOrEqual(2);
  });

  test('[RN-186.05] textos curtos: o y de hoje (Gerado em em 18 + 6 + 5 + 5 = 34)', () => {
    gerar({}, [curto(1)]);
    expect(textosGravados().find((e) => /^Gerado em/.test(e.t)).y).toBe(34);
  });

  test('[RN-186.05] observacao de 10 linhas: a assinatura fica abaixo da ultima linha (pagina, y — M6)', () => {
    const obs = observacaoDe(10);
    gerar({ observacoes: obs }, [curto(1)]);
    const linhasObs = linhasDaObservacao(10);
    expect(semEspacos(linhasObs.map((e) => e.t).join(''))).toBe(semEspacos(obs));
    const ultima = linhasObs[linhasObs.length - 1];
    // a 1a `line` da assinatura (x de 14 a 89), com a pagina corrente
    let pagina = 0;
    let assinatura = null;
    for (const [nome, ...args] of mockPdf) {
      if (nome === 'addPage') pagina += 1;
      if (nome === 'line' && args[0] === 14 && args[2] === 89) assinatura = { pagina, y: args[1] };
    }
    expect(assinatura).not.toBeNull();
    const mesmaPaginaAbaixo = assinatura.pagina === ultima.pagina && assinatura.y > ultima.y + 4;
    expect({ assinatura, ultima: { pagina: ultima.pagina, y: ultima.y }, ok: mesmaPaginaAbaixo || assinatura.pagina > ultima.pagina })
      .toEqual(expect.objectContaining({ ok: true }));
  });

  test('[RN-186.05] (I1) 37 itens curtos + observacao de 20 linhas: a observacao vira a pagina e nada sai da folha', () => {
    const obs = observacaoDe(20);
    gerar({ observacoes: obs }, Array.from({ length: 37 }, (_, k) => curto(k)));
    expect(textosForaDaFolha()).toEqual([]);
    const linhasObs = linhasDaObservacao(20);
    expect(semEspacos(linhasObs.map((e) => e.t).join(''))).toBe(semEspacos(obs));
    // metade positiva: houve addPage ENTRE linhas da observacao, e a ordem (pagina, y) cresce
    expect(new Set(linhasObs.map((e) => e.pagina)).size).toBeGreaterThanOrEqual(2);
    for (let j = 1; j < linhasObs.length; j += 1) expect(pagEy(linhasObs[j])).toBeGreaterThan(pagEy(linhasObs[j - 1]));
  });

  test('[RN-186.09] pior caso: campos longos, encerramento de 500 letras (M2), observacao de 20 linhas — com 60 e com 37 itens', () => {
    const longos = {
      fornecedor_nome: 'Fornecedor '.repeat(11).trim(),
      tipo_servico: 'Galvanizacao a fogo '.repeat(3).trim(),
      proprietario_cliente_id: 9,
      proprietario_cliente_nome: 'W'.repeat(80),
      status: 'ENCERRADA',
      encerramento_destino: 'PERDA_NO_TERCEIRO',
      encerramento_justificativa: 'perda registrada no terceiro '.repeat(18).slice(0, 500),
      observacoes: observacaoDe(20),
    };
    const longo = (k) => ({
      material_codigo: `${CODIGO_25}-${k}`, material_nome: `${NOME_71} ${W_120}`, unidade: 'BARRA', quantidade: 0.1 + 0.2, peso: '1250.75',
    });
    for (const n of [60, 37]) {
      gerar(longos, Array.from({ length: n }, (_, k) => (n === 60 ? longo(k) : curto(k))));
      expect(textosForaDaFolha()).toEqual([]);
      expect(celulasInvasoras()).toEqual([]);
      expect(linhasDaTabela()).toHaveLength(n);
    }
  });

  test('[RN-186.11] a producao nao chama getTextWidth nem setFont (o FakePdf da tela nao tem)', () => {
    gerar({ observacoes: observacaoDe(3), proprietario_cliente_id: 9, proprietario_cliente_nome: 'Cliente' }, [curto(1), alto(2)]);
    const nomes = new Set(mockPdf.map(([n]) => n));
    expect(nomes.has('text')).toBe(true);
    expect(nomes.has('getTextWidth')).toBe(false);
    expect(nomes.has('setFont')).toBe(false);
  });
});

// ── Fix-round da Fase 5 da 186 (I-1, I-2, M-a, M-c) — a assinatura cabe, nunca fica sozinha nem sem identificacao ─────────────────────
// I-2: sem o `if` de quebra da assinatura a suite ficava verde (31/31) — nenhum cenario punha a assinatura perto do fim. Aqui: a linha E o
// rotulo de cada campo de assinatura, com a pagina, medidos contra o fundo (287); a pagina dela tem de dizer de que remessa e (o titulo, na
// 1a; `… (continuação)` em 18, nas outras); com observacao, a ultima linha dela vai junto; o rotulo `Observações:` nunca fica sem a 1a linha.
function conferirAssinatura() {
  const textos = textosGravados();
  let pagina = 0;
  const linhas = [];
  for (const [nome, ...args] of mockPdf) {
    if (nome === 'addPage') pagina += 1;
    if (nome === 'line' && ((args[0] === 14 && args[2] === 89) || (args[0] === 114 && args[2] === 189))) linhas.push({ pagina, y: args[1] });
  }
  const rotulos = textos.filter((e) => /^(Responsável GMP|Recebido pelo terceiro)/.test(e.t));
  const erros = [];
  if (linhas.length !== 2 || rotulos.length !== 2) return [`assinatura com ${linhas.length} linhas e ${rotulos.length} rotulos`];
  const pag = rotulos[0].pagina;
  for (const e of [...linhas, ...rotulos]) {
    if (e.pagina !== pag) erros.push(`assinatura partida: ${e.t || 'line'} na pagina ${e.pagina}, rotulo na ${pag}`);
    if (e.y > FUNDO) erros.push(`${e.t || 'line'} em y ${e.y} > ${FUNDO}`);
  }
  const naPagina = textos.filter((e) => e.pagina === pag && !rotulos.includes(e));
  const identificada = pag === 0
    ? naPagina.some((e) => e.fonte === 14 && /^Remessa para terceiros/.test(e.t))
    : naPagina.some((e) => e.y === 18 && EH_CONTINUACAO.test(e.t));
  if (!identificada) erros.push(`assinatura na pagina ${pag} sem identificacao`);
  const iRotulo = textos.findIndex((e) => e.t === 'Observações:');
  if (iRotulo >= 0) {
    const obs = textos.slice(iRotulo + 1).filter((e) => !EH_CONTINUACAO.test(e.t) && !rotulos.includes(e));
    if (obs[0].pagina !== textos[iRotulo].pagina) erros.push(`Observações: na pagina ${textos[iRotulo].pagina}, 1a linha na ${obs[0].pagina}`);
    if (obs[obs.length - 1].pagina !== pag) erros.push(`assinatura sozinha: ultima linha da observacao na pagina ${obs[obs.length - 1].pagina}, assinatura na ${pag}`);
  }
  return erros;
}
const observacaoEmLinhas = (n) => Array.from({ length: n }, (_, i) => `obs ${i}`).join('\n');

describe('[Etapa 186, fix-round da Fase 5] a assinatura da remessa cabe e fica identificada (jsPDF real)', () => {
  test('[I-1] 30 itens + observacao de 10 linhas (termina em y > 245): a assinatura CABE e fica na pagina 1, junto da observacao', () => {
    gerar({ observacoes: observacaoEmLinhas(10) }, Array.from({ length: 30 }, (_, k) => curto(k)));
    expect(conferirAssinatura()).toEqual([]);
    const ultima = linhasDaObservacao(10)[9];
    // guarda do cenario: a observacao termina abaixo de 245 (o `if` antigo mandava a assinatura sozinha para a pagina 2)
    expect(ultima.y).toBeGreaterThan(245);
    expect(textosGravados().find((e) => e.t === 'Responsável GMP').pagina).toBe(0);
    expect(mockPdf.filter(([n]) => n === 'addPage')).toHaveLength(0);
  });

  test('[I-2] 30 itens + observacao de 16 linhas: a ultima linha desce com a assinatura; tudo ate 287; pagina identificada', () => {
    gerar({ observacoes: observacaoEmLinhas(16) }, Array.from({ length: 30 }, (_, k) => curto(k)));
    expect(conferirAssinatura()).toEqual([]);
    expect(mockPdf.filter(([n]) => n === 'addPage')).toHaveLength(1);
    expect(textosForaDaFolha()).toEqual([]);
  });

  test('[I-2] 42 itens sem observacao: a assinatura nao cabe ate 287 e vira a pagina — que diz de que remessa e', () => {
    gerar({ observacoes: null }, Array.from({ length: 42 }, (_, k) => curto(k)));
    expect(conferirAssinatura()).toEqual([]);
    const cont = textosGravados().filter((e) => EH_CONTINUACAO.test(e.t));
    expect(cont.map((e) => [e.pagina, e.y, e.t])).toEqual([[1, 18, 'Remessa para terceiros — REM-12345678 (continuação)']]);
  });

  test('[M-a] 43 itens + observacao de 3 linhas: o rotulo Observações: desce com a 1a linha (nao fica orfao no pe da folha)', () => {
    gerar({ observacoes: observacaoEmLinhas(3) }, Array.from({ length: 43 }, (_, k) => curto(k)));
    expect(conferirAssinatura()).toEqual([]);
    const rotulo = textosGravados().find((e) => e.t === 'Observações:');
    expect([rotulo.pagina, rotulo.y]).toEqual([1, 26]);
  });

  test('[I-1/I-2/M-a] varredura: 0 a 70 itens x observacao de 0, 1, 3, 10 e 16 linhas — nenhum caso com assinatura fora, sozinha ou sem identificacao', () => {
    const erros = [];
    for (let n = 0; n <= 70; n += 1) {
      for (const linhasObs of [0, 1, 3, 10, 16]) {
        gerar({ observacoes: linhasObs ? observacaoEmLinhas(linhasObs) : null }, Array.from({ length: n }, (_, k) => curto(k)));
        conferirAssinatura().forEach((e) => erros.push(`${n} itens, obs ${linhasObs}: ${e}`));
        textosForaDaFolha().forEach((e) => erros.push(`${n} itens, obs ${linhasObs}: fora ${e}`));
      }
    }
    expect(erros).toEqual([]);
  });

  test('[M-c] quantidade 0,1 + 0,2 sai 0,3 numa linha; numero enorme encolhe a fonte e nao quebra; total no mesmo formato', () => {
    gerar({}, [{ ...curto(1), quantidade: 0.1 + 0.2, peso: 0.1 + 0.2 }, { ...curto(2), quantidade: 9999999999.9999, peso: 1 }]);
    const [a, b] = linhasDaTabela();
    expect(celula(a, 3).map((c) => [c.t, c.fonte])).toEqual([['0,3', 9]]);
    expect(celula(a, 4).map((c) => [c.t, c.fonte])).toEqual([['0,3', 9]]);
    const enorme = celula(b, 3);
    expect(enorme.map((c) => c.t)).toEqual(['9.999.999.999,9999']);
    expect(enorme[0].fonte).toBeLessThan(9);
    regua.setFontSize(enorme[0].fonte);
    expect(enorme[0].x + regua.getTextWidth(enorme[0].t)).toBeLessThanOrEqual(COLUNAS_REMESSA[4] - 1);
    // a fonte volta a 9 depois da celula encolhida
    expect(celula(b, 4).map((c) => c.fonte)).toEqual([9]);
    expect(textosGravados().some((e) => e.t === '2 item(ns) · quantidade total: 10.000.000.000,2999')).toBe(true);
  });
});
