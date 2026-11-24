/**
 * Proposta bilíngue — tradução no Chrome (specs/proposta-bilingue/README.md, RN-BI.05/07; Fase 2, I5/I18).
 * O tradutor do Chrome é substituído por um falso que erra como o de verdade errou no spike (CONTRATANTE -> CONTRACTOR).
 */
import { protegerTexto, restaurarTexto, traduzirTexto, textosDoDocumento, temTradutorDoChrome, GLOSSARIO } from './traducaoChrome';

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
