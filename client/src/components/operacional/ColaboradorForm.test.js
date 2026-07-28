/**
 * Mascara de telefone no cadastro de colaborador.
 *
 * Este era um dos campos que ficaram DE FORA quando a mascara nasceu: a mascara existia so no
 * ClienteForm, entao quem testou por aqui viu o campo aceitar "11988887777" cru. O teste digita
 * tecla a tecla num input controlado de verdade (React 18 escuta o evento 'input' na raiz),
 * em vez de chamar a funcao de mascara diretamente — o que estava quebrado era a LIGACAO entre
 * o input e a mascara, e so um teste que passa pelo componente enxerga isso.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/operacional --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ColaboradorForm from './ColaboradorForm';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn() },
}));

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

let container;
let root;

beforeEach(() => {
  // Sem isto o React 18 avisa que o ambiente nao suporta act(); mesmo padrao do BuscaGlobal.test.js.
  global.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function renderizar(props = {}) {
  act(() => {
    root.render(<ColaboradorForm onClose={() => {}} {...props} />);
  });
}

/** Localiza o input pelo rotulo visivel, e nao por posicao no formulario. */
function campoTelefone() {
  const grupo = [...container.querySelectorAll('.form-group')].find(
    (g) => g.querySelector('label')?.textContent.trim() === 'Telefone'
  );
  return grupo.querySelector('input');
}

/**
 * Escreve no input do mesmo jeito que o navegador: seta o value pelo setter nativo (senao o
 * React nao percebe a mudanca no input controlado) e dispara 'input' borbulhando.
 */
function teclar(input, texto) {
  const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  texto.split('').forEach((tecla) => {
    act(() => {
      setValue.call(input, input.value + tecla);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });
}

/** Apaga o ultimo caractere, como o backspace com o cursor no fim do campo. */
function backspace(input) {
  const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  act(() => {
    setValue.call(input, input.value.slice(0, -1));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('ColaboradorForm — telefone', () => {
  test('mascara enquanto o usuario digita um celular', () => {
    renderizar();
    const input = campoTelefone();
    teclar(input, '11988887777');
    expect(input.value).toBe('(11) 98888-7777');
  });

  test('o hifen nao pula de lugar no meio da digitacao', () => {
    renderizar();
    const input = campoTelefone();
    const vistos = [];
    '11988887777'.split('').forEach((tecla) => {
      teclar(input, tecla);
      vistos.push(input.value);
    });
    expect(vistos).toEqual([
      '(1', '(11', '(11) 9', '(11) 98', '(11) 988', '(11) 9888',
      '(11) 98888', '(11) 98888-7', '(11) 98888-77', '(11) 98888-777', '(11) 98888-7777',
    ]);
  });

  test('fixo de 10 digitos usa o corte 4-4', () => {
    renderizar();
    const input = campoTelefone();
    teclar(input, '1129145011');
    expect(input.value).toBe('(11) 2914-5011');
  });

  test('backspace apaga de verdade, sem travar no hifen', () => {
    renderizar();
    const input = campoTelefone();
    teclar(input, '11988887777');
    const passos = [];
    for (let i = 0; i < 6; i++) {
      backspace(input);
      passos.push(input.value);
    }
    // O passo que apaga o "-" nao pode reinseri-lo e deixar o campo parado.
    expect(passos).toEqual([
      '(11) 98888-777', '(11) 98888-77', '(11) 98888-7', '(11) 98888', '(11) 9888', '(11) 988',
    ]);
  });

  test('o campo pode ser esvaziado por completo', () => {
    renderizar();
    const input = campoTelefone();
    teclar(input, '119');
    for (let i = 0; i < 10; i++) backspace(input);
    expect(input.value).toBe('');
  });

  test('colaborador gravado antes da mascara abre a edicao ja formatado', () => {
    renderizar({ colaborador: { id: 1, nome: 'Fulano', telefone: '67998420146' } });
    expect(campoTelefone().value).toBe('(67) 99842-0146');
  });

  test('telefone com ramal abre intacto, sem truncar', () => {
    // mascararTelefoneCompleto devolve o original quando nao reconhece a contagem de digitos:
    // truncar aqui apagaria o ramal que alguem cadastrou de proposito.
    renderizar({ colaborador: { id: 2, nome: 'Beltrano', telefone: '1129145011 r. 24' } });
    expect(campoTelefone().value).toBe('1129145011 r. 24');
  });
});
