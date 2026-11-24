/**
 * Proposta bilíngue — tradução no Chrome (specs/proposta-bilingue/README.md, RN-BI.05/07; Fase 2, I5/I18).
 * O tradutor do Chrome é substituído por um falso que erra como o de verdade errou no spike (CONTRATANTE -> CONTRACTOR).
 */
import {
  protegerTexto, restaurarTexto, traduzirTexto, textosDoDocumento, temTradutorDoChrome, GLOSSARIO,
  linguaJaBaixada, traduzirPendentesDaProposta,
} from './traducaoChrome';

const htmlComPendentes = `<div id="proposalSource">
    <p data-tr-origem="Garantia." data-tr-texto="Warranty.">Warranty.</p>
    <p class="bi-pendente" data-tr-origem="A CONTRATANTE pagará." data-traduzir="A CONTRATANTE pagará.">x</p>
    <span class="bi-pendente" data-tr-origem="METODOLOGIA" data-traduzir="METODOLOGIA">x</span></div>`;

// API falsa: o /traducoes/automatica (o tradutor do SERVIDOR) traduz com o `falso` — ou falha, com `servidorFalha`.
function apiFalsa({ servidorFalha = false } = {}) {
  return {
    get: jest.fn(async () => ({ data: htmlComPendentes })),
    post: jest.fn(async (url, corpo) => {
      if (url === '/traducoes/automatica') {
        if (servidorFalha) throw Object.assign(new Error('502'), { response: { status: 502 } });
        return { data: { traducoes: await Promise.all(corpo.textos.map((t) => falso.translate(t))) } };
      }
      return { data: { gravadas: corpo.itens.length } };
    }),
  };
}

test('[qualquer navegador] traduz SO os pendentes pelo SERVIDOR, num pedido so, e grava como auto — sem tradutor do Chrome', async () => {
  const api = apiFalsa();
  const progresso = [];
  const r = await traduzirPendentesDaProposta({ api, propostaId: 7, idioma: 'en', aoProgredir: (f, t) => progresso.push(`${f}/${t}`) });
  expect(api.get).toHaveBeenCalledWith('/propostas/7/premium?embed=1&bilingue=1', { responseType: 'text' });
  expect(r).toEqual({ traduzidos: 2, falhas: 0, pendentes: 2 });
  expect(progresso).toEqual(['2/2']);
  const [url1, pedido] = api.post.mock.calls[0];
  expect(url1).toBe('/traducoes/automatica');
  // O servidor recebe o texto PROTEGIDO: o glossário vai como ficha, e caixa alta vai em minúsculas (I18).
  expect(pedido).toEqual({ idioma: 'en', textos: ['A ⟦0⟧ pagará.', 'metodologia'] });
  const [url2, corpo] = api.post.mock.calls[1];
  expect(url2).toBe('/traducoes');
  expect(corpo.origem).toBe('auto');
  expect(corpo.itens.map((i) => i.texto_origem)).toEqual(['A CONTRATANTE pagará.', 'METODOLOGIA']);
  expect(corpo.itens[0].texto_traduzido).toBe('the CONTRACTING PARTY pagará.'); // o falso não conhece "pagará." (com ponto)
  expect(corpo.itens[1].texto_traduzido).toBe('METODOLOGIA');
});

test('[qualquer navegador] servidor fora do ar: usa o tradutor do Chrome, se houver', async () => {
  const api = apiFalsa({ servidorFalha: true });
  const chrome = { translate: jest.fn(falso.translate) };
  const r = await traduzirPendentesDaProposta({ api, propostaId: 7, idioma: 'en', tradutorPromessa: Promise.resolve(chrome) });
  expect(r).toEqual({ traduzidos: 2, falhas: 0, pendentes: 2 });
  expect(chrome.translate).toHaveBeenCalledTimes(2);
});

test('[qualquer navegador] servidor fora do ar e sem Chrome: o erro sobe (a tela avisa) e nada é gravado', async () => {
  const api = apiFalsa({ servidorFalha: true });
  await expect(traduzirPendentesDaProposta({ api, propostaId: 7, idioma: 'en' })).rejects.toThrow('502');
  expect(api.post.mock.calls.filter(([u]) => u === '/traducoes')).toHaveLength(0);
});

test('[qualquer navegador] o servidor perdeu uma ficha num texto: SO esse fica pendente', async () => {
  const api = apiFalsa();
  api.post.mockImplementation(async (url, corpo) => (url === '/traducoes/automatica'
    ? { data: { traducoes: ['The contractor shall pay.', 'methodology'] } } // a ficha do glossário sumiu no 1º
    : { data: { gravadas: corpo.itens.length } }));
  const r = await traduzirPendentesDaProposta({ api, propostaId: 7, idioma: 'en' });
  expect(r).toEqual({ traduzidos: 1, falhas: 1, pendentes: 2 });
  expect(api.post.mock.calls[1][1].itens).toEqual([{ texto_origem: 'METODOLOGIA', texto_traduzido: 'METHODOLOGY' }]);
});

test('[automatica] sem pendente: nem cria nada nem grava', async () => {
  const api = { get: jest.fn(async () => ({ data: '<p data-tr-origem="A." data-tr-texto="A.">A.</p>' })), post: jest.fn() };
  const tradutor = jest.fn();
  expect(await traduzirPendentesDaProposta({ api, propostaId: 1, idioma: 'es', tradutorPromessa: { then: tradutor } }))
    .toEqual({ traduzidos: 0, falhas: 0, pendentes: 0 });
  expect(api.post).not.toHaveBeenCalled();
});

test('[automatica] lingua ja baixada: so "available" traduz sem clique; erro ou Chrome mudo = false', async () => {
  const jan = (r) => ({ Translator: { create: () => {}, availability: jest.fn(r) } });
  expect(await linguaJaBaixada('en', jan(async () => 'available'))).toBe(true);
  expect(await linguaJaBaixada('en', jan(async () => 'downloadable'))).toBe(false);
  expect(await linguaJaBaixada('en', jan(async () => { throw new Error('x'); }))).toBe(false);
  expect(await linguaJaBaixada('en', jan(() => new Promise(() => {})), 30)).toBe(false); // nunca responde: teto de tempo
  expect(await linguaJaBaixada('en', {})).toBe(false);
});

// Tradutor falso: "traduz" palavra a palavra e REPRODUZ o erro do tradutor real.
const dicionario = { a: 'the', pagará: 'shall pay', 'pelos': 'for the', equipamentos: 'equipment', proposta: 'proposal', para: 'for',
  conforme: 'according to', escopo: 'scope', garantia: 'warranty', de: 'of', meses: 'months', contratante: 'contractor' };
const falso = { translate: async (t) => t.split(/(\s+)/).map((p) => dicionario[p.toLowerCase()] || p).join('') };

test('[RN-BI.07] glossario: CONTRATANTE nunca vira "contractor", mesmo com o tradutor errando', async () => {
  const r = await traduzirTexto(falso, 'A CONTRATANTE pagará pelos equipamentos', 'en');
  expect(r).toBe('the CONTRACTING PARTY shall pay for the equipment');
  expect(r).not.toMatch(/\bcontractor\b/i);
  const es = await traduzirTexto(falso, 'A CONTRATADA pagará', 'es');
  expect(es).toContain('CONTRATISTA');
});

test('[RN-BI.07] fronteira de palavra: SUBCONTRATADA nao casa CONTRATADA', () => {
  const { texto, fichas } = protegerTexto('A SUBCONTRATADA e a CONTRATADA', 'en');
  expect(texto).toBe('A SUBCONTRATADA e a ⟦0⟧');
  expect(fichas).toEqual(['CONTRACTOR']);
});

test('[RN-BI.07] termo com alternativas: "nota fiscalizada" nao vira "invoiceizada" (Fase 5, 8)', () => {
  expect(protegerTexto('a nota fiscalizada', 'en').texto).toBe('a nota fiscalizada');
  expect(protegerTexto('emitir a nota fiscal e as notas fiscais', 'en').fichas).toEqual(['invoice', 'invoice']);
});

test('[I5] marcador {{...}} atravessa a traducao intacto', async () => {
  const r = await traduzirTexto(falso, 'Proposta para {{cliente.nome}} conforme escopo', 'en');
  expect(r).toBe('proposal for {{cliente.nome}} according to scope');
});

test('[I5] tradutor que perde uma ficha: traducao recusada (continua pendente)', async () => {
  const perde = { translate: async (t) => t.replace(/⟦0⟧/, '') };
  expect(await traduzirTexto(perde, 'A CONTRATANTE pagará', 'en')).toBeNull();
  expect(restaurarTexto('sem fichas', ['X'])).toBeNull();
  expect(restaurarTexto('ok ⟦ 0 ⟧ fim', ['X'])).toBe('ok X fim');
});

test('[I18] texto todo em maiusculas e traduzido em minusculas e volta em maiusculas, com o marcador na caixa original', async () => {
  const visto = [];
  const espia = { translate: async (t) => { visto.push(t); return falso.translate(t); } };
  const r = await traduzirTexto(espia, 'GARANTIA DE 12 MESES PARA {{cliente.nome}}', 'en');
  expect(visto[0]).toBe('garantia de 12 meses para ⟦0⟧');
  expect(r).toBe('WARRANTY OF 12 MONTHS FOR {{cliente.nome}}');
});

test('[RN-BI.05] erro ou resposta vazia do tradutor: null', async () => {
  expect(await traduzirTexto({ translate: async () => { throw new Error('x'); } }, 'Garantia', 'en')).toBeNull();
  expect(await traduzirTexto({ translate: async () => '   ' }, 'Garantia', 'en')).toBeNull();
});

test('[RN-BI.05] textos do documento: chave do servidor (entidade das chaves decodificada), sem repetir, pendente sem traducao', () => {
  const html = `<div id="proposalSource">
    <p data-tr-origem="Garantia de 12 meses.">12-month warranty.</p>
    <p class="bi-pendente" data-tr-origem="Proposta para &#123;&#123;cliente.nome&#125;&#125;." data-traduzir="Proposta para &#123;&#123;cliente.nome&#125;&#125;.">Proposta para ACME.</p>
    <p data-tr-origem="Garantia de 12 meses.">12-month warranty.</p>
    <h3 class="bi-h"><span class="bi-pt">2. METODOLOGIA</span><span class="bi-tr">2. <span data-tr-origem="METODOLOGIA">METHODOLOGY</span></span></h3>
    <p data-tr-origem="Aceite de &#123;&#123;cliente.nome&#125;&#125;." data-tr-texto="Acceptance by &#123;&#123;cliente.nome&#125;&#125;.">Acceptance by ACME SA.</p>
  </div>`;
  expect(textosDoDocumento(html)).toEqual([
    { chave: 'Garantia de 12 meses.', traducao: '12-month warranty.', pendente: false },
    { chave: 'Proposta para {{cliente.nome}}.', traducao: '', pendente: true },
    { chave: 'METODOLOGIA', traducao: 'METHODOLOGY', pendente: false },
    // Fase 5, critico 1: a traducao vem do atributo (com o marcador), nunca do visivel (com o nome deste cliente)
    { chave: 'Aceite de {{cliente.nome}}.', traducao: 'Acceptance by {{cliente.nome}}.', pendente: false },
  ]);
});

test('tradutor do Chrome: so com window.Translator.create', () => {
  expect(temTradutorDoChrome({})).toBe(false);
  expect(temTradutorDoChrome({ Translator: { create: () => {} } })).toBe(true);
  expect(GLOSSARIO.every((g) => g.en && g.es)).toBe(true);
});

// "A tradução de excel ficou sobresalir? não faz sentido, isso não pode ocorrer" (24/11/2026).
test('[termos fixos] Excel, PDF, DWG saem iguais; "Excelência" continua sendo traduzida', async () => {
  // Erra como o de verdade: "excel" (a palavra) vira "Sobresalir".
  const literal = { translate: async (t) => t.replace(/Excelência/g, 'Excelencia').replace(/excel(?![a-zà-ÿ])/gi, 'Sobresalir') };
  expect(await traduzirTexto(literal, '✓ Excel;', 'es')).toBe('✓ Excel;');
  expect(await traduzirTexto(literal, 'Planilhas em Excel e PDF, plantas em DWG.', 'en')).toBe('Planilhas em Excel e PDF, plantas em DWG.');
  expect(await traduzirTexto(literal, 'Excelência Operacional', 'es')).toBe('Excelencia Operacional');
});

test('[termos fixos] o espaço em volta do termo volta quando o tradutor o cola ("✓PDF;")', async () => {
  const cola = { translate: async (t) => t.replace(/\s+⟦/g, '⟦').replace(/⟧\s+/g, '⟧') };
  expect(await traduzirTexto(cola, '✓ PDF;', 'es')).toBe('✓ PDF;');
  expect(await traduzirTexto(cola, 'Arquivos PDF editáveis', 'en')).toBe('Arquivos PDF editáveis');
});
