/**
 * Mascara de telefone no cadastro de motorista (Frotas).
 *
 * Este campo nao e escrito a mao: o formulario de Frotas e generico e monta os inputs a partir
 * de frotasEntityConfigs. Por isso o telefone do motorista nao aparece como um <input> com a
 * palavra "telefone" em lugar nenhum do JSX — e um caso que a varredura de codigo-fonte de
 * utils/telefone.test.js NAO enxerga. A cobertura dele tem de vir de um teste que renderiza a
 * tela de verdade, que e o que este arquivo faz.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/frotas --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import FrotasEntityPage from './FrotasEntityPage';
import api from '../../services/api';
import { fetchFrotasMeta } from '../../utils/frotasApi';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

jest.mock('../../utils/frotasApi', () => ({
  fetchFrotasMeta: jest.fn(),
}));

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const MOTORISTA_DO_BANCO = {
  id: 1,
  nome: 'Jose da Silva',
  cpf: '',
  cnh_numero: '123',
  cnh_categoria: 'D',
  cnh_validade: '',
  setor: 'Logistica',
  // Gravado antes de a mascara existir, exatamente como esta no banco de producao.
  telefone: '67998420146',
  email: '',
  status: 'ativo',
  observacoes: '',
};

let container;
let root;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  // As implementacoes ficam aqui, e nao na fabrica do jest.mock: o clearAllMocks do afterEach
  // apaga implementacoes, e sem isto so o primeiro teste do arquivo teria dados.
  fetchFrotasMeta.mockResolvedValue({ setores: ['Logistica'] });
  api.get.mockImplementation((url) => {
    if (url === '/frotas/motoristas') return Promise.resolve({ data: [MOTORISTA_DO_BANCO] });
    return Promise.resolve({ data: [] });
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.clearAllMocks();
});

async function renderizarMotoristas() {
  // O cabecalho da pagina usa <Link>, entao precisa de um Router em volta.
  await act(async () => {
    root.render(
      <MemoryRouter>
        <FrotasEntityPage entityKey="motoristas" />
      </MemoryRouter>
    );
  });
}

/** Abre o modal de edicao pelo botao da linha, como o usuario faria. */
async function abrirEdicao() {
  const botao = container.querySelector('.frotas-actions .frotas-action-btn');
  await act(async () => {
    botao.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

function campoTelefone() {
  const grupo = [...container.querySelectorAll('.frotas-form-group')].find(
    (g) => g.querySelector('label')?.textContent.trim() === 'Telefone'
  );
  return grupo.querySelector('input');
}

function teclar(input, texto) {
  const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  texto.split('').forEach((tecla) => {
    act(() => {
      setValue.call(input, input.value + tecla);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });
}

describe('FrotasEntityPage — telefone do motorista', () => {
  test('o registro do banco abre a edicao ja formatado', async () => {
    await renderizarMotoristas();
    await abrirEdicao();
    expect(campoTelefone().value).toBe('(67) 99842-0146');
  });

  test('mascara a cada tecla no formulario generico', async () => {
    await renderizarMotoristas();
    await abrirEdicao();
    const input = campoTelefone();
    act(() => {
      const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setValue.call(input, '');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    teclar(input, '11988887777');
    expect(input.value).toBe('(11) 98888-7777');
  });

  test('so o telefone recebe mascara: os vizinhos continuam texto livre', () => {
    // Se a mascara vazasse para o input generico, CNH e observacoes virariam telefone.
    const { ENTITY_CONFIGS } = jest.requireActual('./frotasEntityConfigs');
    expect(ENTITY_CONFIGS.motoristas.camposTelefone).toEqual(['telefone']);
    expect(ENTITY_CONFIGS.veiculos.camposTelefone).toBeUndefined();
  });

  test('campo nao declarado como telefone nao e mascarado ao abrir', async () => {
    await renderizarMotoristas();
    await abrirEdicao();
    const grupoCnh = [...container.querySelectorAll('.frotas-form-group')].find(
      (g) => g.querySelector('label')?.textContent.trim() === 'Nº CNH'
    );
    expect(grupoCnh.querySelector('input').value).toBe('123');
  });
});
