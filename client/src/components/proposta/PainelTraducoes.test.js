/**
 * Painel "Traduções" (specs/proposta-bilingue/README.md, RN-BI.05/06/07; Fase 2, I11). O mock de `services/api` é a fronteira HTTP;
 * o tradutor do Chrome é um falso em window.Translator que erra como o de verdade (CONTRATANTE -> contractor).
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import PainelTraducoes from './PainelTraducoes';
import api from '../../services/api';

jest.mock('../../services/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warning: jest.fn() } }));

const HTML = `<html><body><div id="proposalSource">
  <p data-tr-origem="Garantia de 12 meses.">12-month warranty.</p>
  <p class="bi-pendente" data-tr-origem="A CONTRATANTE pagará." data-traduzir="A CONTRATANTE pagará.">A CONTRATANTE pagará.</p>
  <h3 class="bi-h"><span class="bi-pt">2. METODOLOGIA</span><span class="bi-tr">2. <span class="bi-pendente" data-tr-origem="METODOLOGIA" data-traduzir="METODOLOGIA">METODOLOGIA</span></span></h3>
</div></body></html>`;

let container; let root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  api.get.mockResolvedValue({ data: HTML });
  api.post.mockResolvedValue({ data: { gravadas: 1, ignoradas: 0 } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); delete window.Translator; });

async function montar() {
  await act(async () => { root.render(<PainelTraducoes propostaId="9" idioma="en" onFechar={() => {}} />); });
  for (let k = 0; k < 4; k++) await act(async () => { await Promise.resolve(); });
}
const botao = (txt) => [...container.querySelectorAll('button')].find((b) => b.textContent.includes(txt));
async function clicar(b) { await act(async () => { b.click(); }); for (let k = 0; k < 8; k++) await act(async () => { await Promise.resolve(); }); }

test('[RN-BI.05] lista os textos do documento bilingue (rota com bilingue=1) e conta os pendentes', async () => {
  await montar();
  expect(api.get).toHaveBeenCalledWith('/propostas/9/premium?embed=1&bilingue=1', { responseType: 'text' });
  expect(container.textContent).toContain('3 texto(s) · 2 sem tradução');
  const areas = [...container.querySelectorAll('textarea')];
  expect(areas.map((a) => a.value)).toEqual(['12-month warranty.', '', '']);
});

test('[I11] sem o tradutor do Chrome: botao desligado e o aviso para preencher a mao', async () => {
  await montar();
  expect(botao('Traduzir pendentes').disabled).toBe(true);
  expect(container.textContent).toContain('preencha a tradução à mão');
});

test('[RN-BI.05/07] Traduzir pendentes: so os pendentes, glossario aplicado, grava como auto', async () => {
  const visto = [];
  window.Translator = { create: jest.fn(async () => ({ translate: async (t) => { visto.push(t); return t.replace('A ', 'The ').replace('pagará', 'shall pay').replace('metodologia', 'methodology'); } })) };
  await montar();
  await clicar(botao('Traduzir pendentes (2)'));
  expect(window.Translator.create).toHaveBeenCalledWith({ sourceLanguage: 'pt', targetLanguage: 'en' });
  expect(visto).toEqual(['A ⟦0⟧ pagará.', 'metodologia']); // CONTRATANTE protegido; maiusculas traduzidas em minusculas
  const [url, corpo] = api.post.mock.calls[0];
  expect(url).toBe('/traducoes');
  expect(corpo).toEqual({ idioma: 'en', origem: 'auto', itens: [
    { texto_origem: 'A CONTRATANTE pagará.', texto_traduzido: 'The CONTRACTING PARTY shall pay.' },
    { texto_origem: 'METODOLOGIA', texto_traduzido: 'METHODOLOGY' },
  ] });
});

test('[RN-BI.06] correcao do vendedor grava como manual; sem mudanca nao grava', async () => {
  await montar();
  expect(botao('Salvar correções (0)').disabled).toBe(true);
  const area = container.querySelectorAll('textarea')[0];
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(area, 'Warranty: 12 months.');
    area.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await clicar(botao('Salvar correções (1)'));
  expect(api.post).toHaveBeenCalledWith('/traducoes', { idioma: 'en', origem: 'manual', itens: [
    { texto_origem: 'Garantia de 12 meses.', texto_traduzido: 'Warranty: 12 months.' },
  ] });
});
