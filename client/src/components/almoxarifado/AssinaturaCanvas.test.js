/**
 * AssinaturaCanvas (Etapa 15, contrato C4) — canvas de assinatura com pointer events.
 *
 * Comportamento contratado:
 *  - "Confirmar assinatura" nasce desabilitado (sem traço não há o que confirmar);
 *  - desenhar (pointerdown → pointermove → pointerup) habilita o botão;
 *  - Confirmar chama onConfirm com um Blob PNG (canvas.toBlob);
 *  - "Limpar" apaga o traço e desabilita Confirmar de novo.
 *
 * jsdom não implementa canvas 2D nem toBlob — mockamos os dois no protótipo. O alvo do
 * teste é a máquina de estados do componente (temTraco), não o rasterizador.
 *
 * Executar: cd client && CI=true npx react-scripts test AssinaturaCanvas --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import AssinaturaCanvas from './AssinaturaCanvas';

const BLOB_PNG = new Blob(['png-fake'], { type: 'image/png' });

let container;
let root;

beforeEach(() => {
  // jsdom: getContext lança "Not implemented" — devolvemos um contexto 2D de mentira.
  // No beforeEach (não beforeAll) porque o CRA roda com `resetMocks: true`, que apaga a
  // implementação de todo jest.fn antes de CADA teste — em beforeAll o mock viraria
  // undefined a partir do primeiro reset e o componente ficaria sem contexto.
  HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    lineCap: '',
    lineJoin: '',
    fillRect: jest.fn(),
    beginPath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    stroke: jest.fn(),
  }));
  HTMLCanvasElement.prototype.toBlob = jest.fn(function (cb) { cb(BLOB_PNG); });
  // setPointerCapture também não existe no jsdom.
  HTMLElement.prototype.setPointerCapture = jest.fn();
  HTMLElement.prototype.releasePointerCapture = jest.fn();
  global.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.clearAllMocks();
});

const botaoPorTexto = (texto) => [...container.querySelectorAll('button')]
  .find((b) => b.textContent.trim().includes(texto));

// jsdom não tem PointerEvent; React ouve pelo tipo do evento, então um MouseEvent com o
// type certo (+ pointerId) atravessa a delegação do React 18 normalmente.
const pointerEvent = (tipo, x, y) => {
  const ev = new MouseEvent(tipo, { bubbles: true, cancelable: true, clientX: x, clientY: y });
  Object.defineProperty(ev, 'pointerId', { value: 1 });
  return ev;
};

const desenhar = (canvas) => {
  act(() => { canvas.dispatchEvent(pointerEvent('pointerdown', 10, 10)); });
  act(() => { canvas.dispatchEvent(pointerEvent('pointermove', 40, 30)); });
  act(() => { canvas.dispatchEvent(pointerEvent('pointerup', 40, 30)); });
};

async function renderizar(props = {}) {
  await act(async () => {
    root.render(<AssinaturaCanvas onConfirm={props.onConfirm || jest.fn()} height={180} {...props} />);
  });
}

describe('AssinaturaCanvas (C4)', () => {
  test('renderiza canvas e botões; Confirmar nasce desabilitado', async () => {
    await renderizar();
    expect(container.querySelector('canvas')).toBeTruthy();
    expect(botaoPorTexto('Limpar')).toBeTruthy();
    const confirmar = botaoPorTexto('Confirmar assinatura');
    expect(confirmar).toBeTruthy();
    expect(confirmar.disabled).toBe(true);
  });

  test('desenhar com pointer events habilita Confirmar e captura o ponteiro', async () => {
    await renderizar();
    const canvas = container.querySelector('canvas');
    desenhar(canvas);
    expect(botaoPorTexto('Confirmar assinatura').disabled).toBe(false);
    expect(HTMLElement.prototype.setPointerCapture).toHaveBeenCalledWith(1);
  });

  test('Confirmar chama onConfirm com Blob PNG via toBlob', async () => {
    const onConfirm = jest.fn();
    await renderizar({ onConfirm });
    desenhar(container.querySelector('canvas'));
    await act(async () => { botaoPorTexto('Confirmar assinatura').click(); });
    expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalled();
    expect(onConfirm).toHaveBeenCalledTimes(1);
    const blob = onConfirm.mock.calls[0][0];
    expect(blob).toBe(BLOB_PNG);
    expect(blob.type).toBe('image/png');
  });

  test('Limpar apaga o traço e desabilita Confirmar de novo', async () => {
    await renderizar();
    const canvas = container.querySelector('canvas');
    desenhar(canvas);
    expect(botaoPorTexto('Confirmar assinatura').disabled).toBe(false);
    await act(async () => { botaoPorTexto('Limpar').click(); });
    expect(botaoPorTexto('Confirmar assinatura').disabled).toBe(true);
  });

  test('mover o ponteiro sem pointerdown não conta como traço', async () => {
    await renderizar();
    const canvas = container.querySelector('canvas');
    act(() => { canvas.dispatchEvent(pointerEvent('pointermove', 40, 30)); });
    expect(botaoPorTexto('Confirmar assinatura').disabled).toBe(true);
  });
});
