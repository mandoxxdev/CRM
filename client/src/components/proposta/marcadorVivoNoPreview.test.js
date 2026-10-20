/**
 * Etapa 167 (RN-167.01 a .03, B1065, C418) — o marcador que sobrevive ao Salvar do preview editável.
 *
 * O servidor resolve os marcadores ({{proposal.date}}...) no documento inteiro, inclusive no #proposalSource que o editor lê. Antes, o
 * Salvar comparava esse texto resolvido com o gravado, achava diferença e gravava a data escrita no lugar do marcador.
 *
 * Duas partes:
 *   - o unitário de `restaurarMarcadores` (a reconciliação de três versões: gravada, inicial, atual);
 *   - o FLUXO INTEIRO no jsdom: o PropostaPreviewEditavel renderizado de verdade, o `api` simulado só na fronteira HTTP e o HTML do
 *     `/premium?embed=1` gerado pelo TEMPLATE REAL do servidor (com o marcador já resolvido por ele). O jsdom ignora o `srcdoc`, então o
 *     HTML é escrito no contentDocument do iframe (o `document.write` roda o script do paginador) e o `load` é disparado.
 *
 * Plano: docs/superpowers/plans/2026-10-20-almoxarifado-etapa167-o-marcador-vivo-no-preview-e-a-atividade-recente-da-viagem-no-dia-de-brasilia.md
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import PropostaPreviewEditavel from './PropostaPreviewEditavel';
import api from '../../services/api';
import { restaurarMarcadores, restaurarMarcadoresNaLista } from './clausulasInlineEditor';

const fs = require('fs');
const os = require('os');
const path = require('path');

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn(), post: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warning: jest.fn() } }));

// ── unitário ────────────────────────────────────────────────────────────────────────────────
const R = restaurarMarcadores;
const G = 'Emitida em {{proposal.date}}, valida por 30 dias.';
const I = 'Emitida em 20/10/2026, valida por 30 dias.';

describe('[RN-167.01] restaurarMarcadores', () => {
  test('intocada -> o gravado (com o marcador)', () => {
    expect(R(G, I, I)).toBe(G);
  });
  test('edicao antes, depois e adjacente ao valor: o marcador volta', () => {
    expect(R(G, I, 'Proposta emitida em 20/10/2026, valida por 30 dias.')).toBe('Proposta emitida em {{proposal.date}}, valida por 30 dias.');
    expect(R(G, I, 'Emitida em 20/10/2026, valida por 60 dias.')).toBe('Emitida em {{proposal.date}}, valida por 60 dias.');
    expect(R(G, I, 'Emitida em 20/10/2026 (Brasilia), valida por 30 dias.')).toBe('Emitida em {{proposal.date}} (Brasilia), valida por 30 dias.');
    expect(R(G, I, 'Emitida em: 20/10/2026, valida por 30 dias.')).toBe('Emitida em: {{proposal.date}}, valida por 30 dias.');
  });
  test('edicao NO valor: vai como o usuario escreveu (sem o marcador)', () => {
    expect(R(G, I, 'Emitida em 21/10/2026, valida por 30 dias.')).toBe('Emitida em 21/10/2026, valida por 30 dias.');
    expect(R(G, I, 'Emitida em , valida por 30 dias.')).toBe('Emitida em , valida por 30 dias.');
  });
  test('dois marcadores, edicao ENTRE eles: os dois voltam', () => {
    const g = '{{client.name}} recebe em {{proposal.date}}.';
    const i = 'ACME LTDA recebe em 20/10/2026.';
    expect(R(g, i, 'ACME LTDA recebera em 20/10/2026.')).toBe('{{client.name}} recebera em {{proposal.date}}.');
    expect(R(g, i, i)).toBe(g);
  });
  test('o mesmo marcador duas vezes e marcador com espacos: o texto exato do gravado volta', () => {
    const g = 'De {{ proposal.date }} a {{proposal.date}}.';
    const i = 'De 20/10/2026 a 20/10/2026.';
    expect(R(g, i, 'Desde 20/10/2026 a 20/10/2026.')).toBe('Desde {{ proposal.date }} a {{proposal.date}}.');
  });
  test('valor vazio: na fronteira fica; na insercao pura fica depois do texto; coberto pela edicao some', () => {
    const g = 'A{{commercial.warranty}}B';
    expect(R(g, 'AB', 'AxB')).toBe('Ax{{commercial.warranty}}B'); // insercao pura: depois (Fase 2 M2) — render igual
    expect(R(g, 'AB', 'ZAB')).toBe('ZA{{commercial.warranty}}B');
    expect(R(g, 'AB', 'ABZ')).toBe('A{{commercial.warranty}}BZ');
    expect(R(g, 'AB', 'AZ')).toBe('AZ'); // a edicao cobre a posicao (B -> Z)
  });
  test('bloco {{#if}}: editado -> o atual; intocado -> o gravado', () => {
    const g = 'X {{#if proposal.date}}com data{{/if}} Y';
    expect(R(g, 'X com data Y', 'X com data Y!')).toBe('X com data Y!');
    expect(R(g, 'X com data Y', 'X com data Y')).toBe(g);
  });
  test('gravado que nao descreve o inicial: editado -> o atual; intocado -> o gravado (os casos da Fase 2 I1)', () => {
    const casos = [
      ['A\n\n{{commercial.warranty}}\n\nB', 'A\n\nB'], // o valor vazio entre paragrafos
      ['{{commercial.warranty}} Texto {{proposal.date}}', 'Texto 20/10/2026'], // o trim
      ['Prazo de {{proposal.date}}', 'Prazo de 20/10/2026'], // o nbsp
    ];
    casos.forEach(([g, i]) => {
      expect(R(g, i, i)).toBe(g);
      expect(R(g, i, `${i} mais`)).toBe(`${i} mais`);
    });
  });
  test('divisao ambigua (o valor contem o literal vizinho): editado -> o atual', () => {
    const g = '{{a}} x {{b}}';
    const i = '1 x 2 x 3';
    expect(R(g, i, '1 x 2 x 4')).toBe('1 x 2 x 4');
    expect(R(g, i, i)).toBe(g);
  });
  test('titulo renumerado (5.3 -> 5.4) com o marcador no fim: volta', () => {
    expect(R('5.3 EMISSAO {{proposal.date}}', '5.3 EMISSAO 20/10/2026', '5.4 EMISSAO 20/10/2026')).toBe('5.4 EMISSAO {{proposal.date}}');
  });
  test('sem marcador no gravado, ou entradas que nao sao texto: o atual', () => {
    expect(R('sem nada', 'sem nada', 'sem nada!')).toBe('sem nada!');
    expect(R(undefined, I, 'x')).toBe('x');
    expect(R(G, null, 'x')).toBe('x');
  });
  test('tempo (Fase 2 C1): 10 marcadores, 5.000 caracteres, gravado que nao casa -> < 50 ms', () => {
    const g = `${Array.from({ length: 10 }, (_, k) => `{{m${k}}}`).join(' ')} FIM-QUE-NAO-EXISTE`;
    const i = 'a '.repeat(2500);
    const t0 = Date.now();
    expect(R(g, i, `${i}z`)).toBe(`${i}z`);
    expect(Date.now() - t0).toBeLessThan(50);
  });
  test('[M1] restaurarMarcadoresNaLista nunca lanca: o item que faz a funcao lancar fica como esta', () => {
    const ruim = { get key() { throw new Error('x'); } };
    const ok = { key: '12', titulo: 'T', conteudo: I.replace('30', '60') };
    const iniciais = new Map([['12', { titulo: 'T', conteudo: I }]]);
    const gravados = new Map([['12', { titulo: 'T', conteudo: G }]]);
    const saida = restaurarMarcadoresNaLista([ruim, ok], iniciais, gravados);
    expect(saida[0]).toBe(ruim);
    expect(saida[1].conteudo).toBe(G.replace('30', '60'));
  });
});

// ── o fluxo inteiro ─────────────────────────────────────────────────────────────────────────
const PASTA_DE_DADOS = fs.mkdtempSync(path.join(os.tmpdir(), 'e167-cli-')); // o config/paths do servidor cria as pastas de upload aqui
process.env.CRM_DATA_DIR = PASTA_DE_DADOS;
afterAll(() => { try { fs.rmSync(PASTA_DE_DADOS, { recursive: true, force: true }); } catch (e) { /* o Windows segura as vezes */ } });
const { gerarHTMLPropostaPremiumV2 } = require('../../../../server/templates/propostaPremiumV2');

const PROPOSTA = { id: 7, numero_proposta: 'P-167', titulo: 'T', cliente_nome: 'ACME', created_at: '2026-10-20 12:00:00' };
const TOTAIS = { subtotal: 0, icms: 0, ipi: 0, total: 0, dataEmissao: '20/10/2026', dataValidade: '' };
const GRAVADAS = [
  { id: 11, titulo: '5.1 OBJETO', conteudo: 'Texto do objeto da proposta.', ordem: 0 },
  { id: 12, titulo: '5.2 EMISSAO {{proposal.date}}', conteudo: G, ordem: 1 },
  { id: 13, titulo: '5.3 PRAZO', conteudo: 'Prazo de entrega a combinar.', ordem: 2 },
  { id: 14, titulo: '5.25 CONSIDERAÇÃO FINAL', conteudo: 'Final.', ordem: 3 },
];
// o modelo da familia (ramo isDefault): as linhas tem numero, sem id
const MODELO = [
  { numero: '5.1', titulo: 'OBJETO', conteudo: 'Texto do objeto da proposta.' },
  { numero: '5.2', titulo: 'EMISSAO {{proposal.date}}', conteudo: G },
  { numero: '5.3', titulo: 'PRAZO', conteudo: 'Prazo de entrega a combinar.' },
  { numero: '5.25', titulo: 'CONSIDERAÇÃO FINAL', conteudo: 'Final.' },
];
const htmlDo = (clausulas) => gerarHTMLPropostaPremiumV2(PROPOSTA, [], TOTAIS, { clausulas_custom: clausulas }, 'http://127.0.0.1:9', false, true, {});

let container; let root;
// o servidor simulado guarda o estado: o PUT de uma clausula muda o que o GET seguinte (e o HTML seguinte) devolvem
function servidor({ isDefault, gravadas = GRAVADAS }) {
  const estado = servidor.estado = { linhas: gravadas.map((c) => ({ ...c })) };
  const linhasDoModelo = () => MODELO.map((c, i) => ({ id: 100 + i, titulo: `${c.numero} ${c.titulo}`, conteudo: c.conteudo, ordem: i }));
  api.get.mockImplementation((url) => {
    const usaModelo = isDefault && !servidor.inicializado;
    if (url === '/propostas/7/premium?embed=1') return Promise.resolve({ data: htmlDo(usaModelo ? MODELO : (isDefault ? linhasDoModelo() : estado.linhas)) });
    if (url === '/propostas/7/clausulas') {
      if (!usaModelo) return Promise.resolve({ data: { clausulas: isDefault ? linhasDoModelo() : estado.linhas, isDefault: false } });
      return Promise.resolve({ data: { clausulas: MODELO, isDefault: true, modelo_id: 3 } });
    }
    return Promise.resolve({ data: [] });
  });
  api.post.mockImplementation((url) => {
    if (url === '/propostas/7/clausulas/inicializar') { servidor.inicializado = true; return Promise.resolve({ data: { ok: true, total: MODELO.length } }); }
    return Promise.resolve({ data: { id: 999 } });
  });
  api.put.mockImplementation((url, corpo) => {
    const m = /\/propostas\/7\/clausulas\/(\d+)$/.exec(url);
    const linha = m && estado.linhas.find((c) => String(c.id) === m[1]);
    if (linha) Object.assign(linha, { titulo: corpo.titulo, conteudo: corpo.conteudo });
    return Promise.resolve({ data: { ok: true } });
  });
  api.delete.mockResolvedValue({ data: { ok: true } });
  return htmlDo(isDefault ? MODELO : estado.linhas);
}
const espera = async (n = 10) => { for (let k = 0; k < n; k++) await act(async () => { await new Promise((r) => setTimeout(r, 5)); }); };

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  servidor.inicializado = false;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

/** monta o editor, escreve no iframe o HTML que o servidor entregou e dispara o load */
async function abrir(html) {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/propostas/7/preview']}>
        <Routes><Route path="/propostas/:id/preview" element={<PropostaPreviewEditavel />} /></Routes>
      </MemoryRouter>
    );
  });
  await espera();
  return carregar(html);
}
/** escreve no iframe (o atual — o editor o recria a cada carregamento) o HTML que o servidor entregou e dispara o load */
async function carregar(html) {
  const iframe = container.querySelector('iframe.ppe-iframe');
  expect(iframe).toBeTruthy();
  const doc = iframe.contentDocument;
  await act(async () => {
    doc.open(); doc.write(html); doc.close();
    try { iframe.contentWindow.paginateProposalContent(); } catch (e) { /* o load do proprio script tambem pagina */ }
    iframe.dispatchEvent(new Event('load'));
  });
  await espera();
  // guarda: a clausula chegou RESOLVIDA (senao o cenario nao prova nada)
  const fonte = doc.getElementById('proposalSource');
  expect(fonte).toBeTruthy();
  expect(fonte.textContent).toContain('Emitida em 20/10/2026');
  expect(fonte.innerHTML).not.toContain('{{');
  return doc;
}
/** o gesto do usuario: digitar na pagina gerada (o input sincroniza com o #proposalSource) */
async function digitar(doc, key, campo, transforma) {
  const els = [...doc.querySelectorAll(`.proposal-page[data-generated="1"] [data-clausula-key="${key}"] [data-clausula-campo="${campo}"]`)];
  expect(els.length).toBeGreaterThan(0); // guarda: o paginador gerou a pagina e o editor a ativou
  const el = els[0];
  expect(el.contentEditable).toBe('true');
  await act(async () => {
    if (campo === 'titulo') el.textContent = transforma(el.textContent);
    else el.innerHTML = transforma(el.innerHTML);
    el.dispatchEvent(new Event('input'));
  });
}
async function salvar() {
  const b = [...container.querySelectorAll('.ppe-toolbar-actions button')].find((x) => /Salvar/.test(x.textContent) && !/revis/i.test(x.textContent));
  expect(b).toBeTruthy();
  expect(b.disabled).toBe(false);
  await act(async () => { b.click(); });
  await espera(20);
}
const puts = () => api.put.mock.calls.filter(([u]) => /\/clausulas\/\d+$/.test(u));
const putDe = (id) => puts().filter(([u]) => u === `/propostas/7/clausulas/${id}`);

test('[RN-167.03, F1] editar OUTRA clausula -> Salvar: um PUT so, o da outra; nenhum para a do marcador', async () => {
  const doc = await abrir(servidor({ isDefault: false }));
  await digitar(doc, '13', 'conteudo', (h) => h.replace('a combinar', 'em 30 dias'));
  await salvar();
  expect(putDe(13)).toHaveLength(1);
  expect(putDe(13)[0][1].conteudo).toBe('Prazo de entrega em 30 dias.');
  expect(putDe(12)).toEqual([]); // antes: o PUT da 12 com "20/10/2026" no titulo e no texto
  expect(puts()).toHaveLength(1);
});

test('[RN-167.01, F2] acrescentar texto na clausula do marcador: o PUT leva o marcador e o texto novo, nao a data', async () => {
  const doc = await abrir(servidor({ isDefault: false }));
  await digitar(doc, '12', 'conteudo', (h) => h.replace('30 dias.', '30 dias corridos.'));
  await salvar();
  expect(putDe(12)).toHaveLength(1);
  const corpo = putDe(12)[0][1];
  expect(corpo.conteudo).toBe('Emitida em {{proposal.date}}, valida por 30 dias corridos.');
  expect(corpo.titulo).toBe('5.2 EMISSAO {{proposal.date}}');
  expect(JSON.stringify(corpo)).not.toContain('20/10/2026');
});

test('[RN-167.01, F3] reescrever a propria data: o PUT leva a data escrita, sem o marcador', async () => {
  const doc = await abrir(servidor({ isDefault: false }));
  await digitar(doc, '12', 'conteudo', (h) => h.replace('20/10/2026', '21/10/2026'));
  await salvar();
  expect(putDe(12)).toHaveLength(1);
  expect(putDe(12)[0][1].conteudo).toBe('Emitida em 21/10/2026, valida por 30 dias.');
  expect(putDe(12)[0][1].titulo).toBe('5.2 EMISSAO {{proposal.date}}'); // o titulo, intocado, mantem o marcador
});

test('[RN-167.02, F4] ramo isDefault (o modelo com o marcador): editar outra -> inicializar, e nenhum PUT leva a data', async () => {
  const doc = await abrir(servidor({ isDefault: true }));
  await digitar(doc, 'default-5.3', 'conteudo', (h) => h.replace('a combinar', 'em 30 dias'));
  await salvar();
  expect(api.post).toHaveBeenCalledWith('/propostas/7/clausulas/inicializar');
  expect(puts().length).toBeGreaterThan(0); // a editada foi gravada (metade positiva)
  expect(putDe(102)).toHaveLength(1);
  expect(putDe(102)[0][1].conteudo).toBe('Prazo de entrega em 30 dias.');
  expect(putDe(101)).toEqual([]); // a do marcador, copiada do modelo com o marcador, nao e regravada
  expect(JSON.stringify(puts())).not.toContain('20/10/2026');
});

// ── Fase 5 (r3): as lacunas que a sabotagem achou ─────────────────────────────────────────────────
test('[RN-167.01, r3 C18] apagar um caractere repetido no fim: o ponto apagado nao volta', () => {
  expect(R('Emitida em {{proposal.date}}, valida por 30 dias..', 'Emitida em 20/10/2026, valida por 30 dias..', 'Emitida em 20/10/2026, valida por 30 dias.'))
    .toBe('Emitida em {{proposal.date}}, valida por 30 dias.');
});

test('[RN-167.02, r3 C06] a gravada que o htmlParaTexto muda (uma quebra no fim): a comparacao e no mesmo formato', async () => {
  const gravadas = GRAVADAS.map((c) => (c.id === 12 ? { ...c, conteudo: `${G}\n` } : c));
  const doc = await abrir(servidor({ isDefault: false, gravadas }));
  await digitar(doc, '12', 'conteudo', (h) => h.replace('30 dias.', '30 dias corridos.'));
  await salvar();
  expect(putDe(12)).toHaveLength(1);
  expect(putDe(12)[0][1].conteudo).toBe('Emitida em {{proposal.date}}, valida por 30 dias corridos.');
});

test('[RN-167.02, r3 C01 / Fase 2 M4] dois Salvar seguidos: o texto inicial e recapturado a cada carregamento', async () => {
  const doc = await abrir(servidor({ isDefault: false }));
  await digitar(doc, '12', 'conteudo', (h) => h.replace('30 dias.', '30 dias corridos.'));
  await salvar();
  expect(putDe(12)).toHaveLength(1);
  expect(servidor.estado.linhas.find((c) => c.id === 12).conteudo).toBe('Emitida em {{proposal.date}}, valida por 30 dias corridos.');
  // o editor recarregou (GET do HTML novo): escreve-o no iframe de agora e dispara o load
  const doc2 = await carregar(htmlDo(servidor.estado.linhas));
  expect(doc2.getElementById('proposalSource').textContent).toContain('30 dias corridos.'); // metade positiva: o HTML novo
  await digitar(doc2, '13', 'conteudo', (h) => h.replace('a combinar', 'em 30 dias'));
  await salvar();
  expect(putDe(13)).toHaveLength(1);
  expect(putDe(12)).toHaveLength(1); // so o do primeiro Salvar (com o inicial velho, a 12 seria regravada com a data)
  expect(JSON.stringify(puts())).not.toContain('20/10/2026');
});
