/**
 * Modal compartilhado de impressão de etiquetas (Etapa 6c — Task 3).
 *
 * Consome `FORMATOS_ETIQUETA`/`gerarEtiquetasPDF` (Tasks 1-2, `utils/etiquetasPdf.js`) e é
 * chamado de todas as telas que precisam imprimir etiqueta com QR (material, lote, série,
 * recebimento) — por isso vive fora de qualquer tela específica.
 *
 * Duas regras de UX que os testes fixam porque não são óbvias lendo só o componente:
 * - O formato escolhido é lembrado em localStorage (`almox_etiqueta_formato`) — decisão do
 *   usuário: térmica é o caminho provável do galpão, quem usa escolhe uma vez e não quer
 *   escolher de novo a cada impressão.
 * - "Cópias" só faz sentido quando há UMA etiqueta selecionada (imprimir N vias da mesma
 *   etiqueta); com várias etiquetas na lista, copias fica implícito em 1 — não existe um caso
 *   de uso de "3 cópias de cada uma dessas 11 etiquetas" no fluxo do almoxarifado.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/EtiquetasPdfModal --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import EtiquetasPdfModal from './EtiquetasPdfModal';
import { gerarEtiquetasPDF } from '../../utils/etiquetasPdf';

jest.mock('../../utils/etiquetasPdf', () => ({
  ...jest.requireActual('../../utils/etiquetasPdf'),
  gerarEtiquetasPDF: jest.fn().mockResolvedValue(),
}));

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

const ETIQUETA_1 = { codigo: 'MAT-1', nome: 'Chapa 3mm', linhaControle: '', qrUrl: 'https://x/1' };

const onzeEtiquetas = Array.from({ length: 11 }, (_, i) => ({
  codigo: `MAT-${i}`, nome: `Material ${i}`, linhaControle: '', qrUrl: `https://x/${i}`,
}));

let container;
let root;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.clearAllMocks();
});

async function renderizar(props) {
  await act(async () => {
    root.render(<EtiquetasPdfModal {...props} />);
  });
}

/** Campo do modal aberto, localizado pelo texto do <label> (molde de LotesAlmoxarifado.test.js). */
function campoPorLabel(rotulo) {
  const grupo = [...container.querySelectorAll('.almox-modal .almox-field')]
    .find((g) => g.querySelector('label')?.textContent.replace('*', '').trim() === rotulo);
  return grupo?.querySelector('input, textarea, select');
}

function preencher(elemento, valor) {
  const proto = elemento.tagName === 'SELECT' ? window.HTMLSelectElement.prototype
    : window.HTMLInputElement.prototype;
  const setValue = Object.getOwnPropertyDescriptor(proto, 'value').set;
  act(() => {
    setValue.call(elemento, valor);
    elemento.dispatchEvent(new Event(elemento.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}

/** Botão do rodapé do modal pelo texto. */
async function clicarBotaoModal(texto) {
  const botao = [...container.querySelectorAll('.almox-modal-footer button')]
    .find((b) => b.textContent.trim() === texto);
  await act(async () => { botao.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

describe('EtiquetasPdfModal', () => {
  test('gera com o formato escolhido e persiste a escolha no localStorage', async () => {
    await renderizar({ etiquetas: [ETIQUETA_1], onClose: jest.fn() });
    preencher(campoPorLabel('Formato'), 'TERMICA_100x50');
    await clicarBotaoModal('Gerar');
    expect(gerarEtiquetasPDF).toHaveBeenCalledWith(expect.objectContaining({ formato: 'TERMICA_100x50' }));
    expect(localStorage.getItem('almox_etiqueta_formato')).toBe('TERMICA_100x50');
  });

  test('reabre ja com o formato lembrado', async () => {
    localStorage.setItem('almox_etiqueta_formato', 'TERMICA_100x50');
    await renderizar({ etiquetas: [ETIQUETA_1], onClose: jest.fn() });
    expect(campoPorLabel('Formato').value).toBe('TERMICA_100x50');
  });

  test('formato invalido/corrompido no localStorage cai no default A4_GRADE', async () => {
    localStorage.setItem('almox_etiqueta_formato', 'FORMATO_QUE_NAO_EXISTE_MAIS');
    await renderizar({ etiquetas: [ETIQUETA_1], onClose: jest.fn() });
    expect(campoPorLabel('Formato').value).toBe('A4_GRADE');
  });

  test('contagem mostra N etiquetas e M paginas por formato', async () => {
    await renderizar({ etiquetas: onzeEtiquetas, onClose: jest.fn() });
    // A4_GRADE (default): grade 2x5 = 10 por pagina -> 11 etiquetas = 2 paginas.
    expect(container.textContent).toMatch(/11 etiqueta/);
    expect(container.textContent).toMatch(/2 p[aá]gina/);

    preencher(campoPorLabel('Formato'), 'TERMICA_100x50');
    // Termica: 1 por pagina -> 11 etiquetas = 11 paginas.
    expect(container.textContent).toMatch(/11 p[aá]gina/);
  });

  test('sem etiquetas: botao desabilitado com explicacao', async () => {
    await renderizar({ etiquetas: [], onClose: jest.fn() });
    const gerar = [...container.querySelectorAll('.almox-modal-footer button')]
      .find((b) => b.textContent.trim() === 'Gerar');
    expect(gerar.disabled).toBe(true);
    expect(container.textContent).toMatch(/nenhuma etiqueta/i);
  });

  test('copias so aparece para etiqueta unica e multiplica no call', async () => {
    await renderizar({ etiquetas: onzeEtiquetas, onClose: jest.fn() });
    expect(campoPorLabel('Cópias')).toBeUndefined();

    await act(async () => { root.render(<EtiquetasPdfModal etiquetas={[ETIQUETA_1]} onClose={jest.fn()} />); });
    preencher(campoPorLabel('Cópias'), '5');
    await clicarBotaoModal('Gerar');
    expect(gerarEtiquetasPDF).toHaveBeenCalledWith(expect.objectContaining({ copias: 5, etiquetas: [ETIQUETA_1] }));
  });

  test('nao renderiza nada quando etiquetas e null/undefined', async () => {
    await renderizar({ etiquetas: null, onClose: jest.fn() });
    expect(container.querySelector('.almox-modal-overlay')).toBeNull();
  });

  test('gerar com sucesso chama onClose e toast de sucesso', async () => {
    const onClose = jest.fn();
    const { toast } = require('react-toastify');
    await renderizar({ etiquetas: [ETIQUETA_1], onClose });
    await clicarBotaoModal('Gerar');
    expect(toast.success).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  test('erro ao gerar mostra toast.error e nao fecha o modal', async () => {
    gerarEtiquetasPDF.mockRejectedValueOnce(new Error('boom'));
    const onClose = jest.fn();
    const { toast } = require('react-toastify');
    await renderizar({ etiquetas: [ETIQUETA_1], onClose });
    await clicarBotaoModal('Gerar');
    expect(toast.error).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
