/**
 * `AnexosModal` — a casca que leva o bloco de anexos às três telas sem casa (Etapa 34).
 *
 * O que estes cenários protegem, e por quê:
 *
 * 1. **RN-01 na casca** — sem `entidadeId` não desenha overlay nenhum. Cuidado ao ler o controle
 *    positivo: sabotar esta guarda derruba a asserção do `querySelector`, **não** a do `api.get`.
 *    A requisição já é barrada pela guarda própria de `AnexosDocumento.js:117`; a da casca só
 *    evita um overlay vazio. Reportar as duas seria reportar cobertura que não existe.
 *
 * 2. **A entidade e o id chegam ao bloco** — é a régua da etapa inteira. Um plug com a chave
 *    errada renderiza igual e só falha em produção com 400 "Entidade inválida para anexo".
 *
 * 3. **O título não se repete.** O cabeçalho do modal já diz o que é; sem `titulo={null}` o
 *    usuário lê "Anexos" duas vezes, uma embaixo da outra.
 *
 * Executar: cd client && CI=true npx react-scripts test --watchAll=false src/components/almoxarifado/AnexosModal.test.js
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import AnexosModal from './AnexosModal';
import api from '../../services/api';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

jest.mock('../../hooks/useAlmoxPermissoes', () => ({
  useAlmoxPermissoes: () => ({
    perfil: 'ADMINISTRADOR',
    pode: () => true,
    bloquearSeNaoPode: () => true,
    loading: false,
  }),
}));

const URL_LISTA = '/almoxarifado/anexos';

let container;
let root;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  // Fallback que REJEITA: é suíte nova, não há legado a preservar, e o fallback que resolve é
  // exatamente o que deixaria este arquivo cego.
  api.get.mockImplementation((url) => (url === URL_LISTA
    ? Promise.resolve({ data: [] })
    : Promise.reject(new Error(`URL inesperada no mock: ${url}`))));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.clearAllMocks();
});

const esperarEfeitos = async () => {
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
};

async function renderizar(props = {}) {
  await act(async () => {
    root.render(<AnexosModal entidade="material" entidadeId={7} onClose={() => {}} {...props} />);
  });
  await esperarEfeitos();
}

const clicar = async (el) => {
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
};

const chamadasDeAnexo = () => api.get.mock.calls.filter(([u]) => u === URL_LISTA);

describe('AnexosModal — RN-01: sem registro no banco não há casca', () => {
  test('sem entidadeId, o modal nao monta e nao consulta', async () => {
    await renderizar({ entidadeId: null });
    expect(container.querySelector('[data-testid="anexos-modal"]')).toBeNull();
    expect(chamadasDeAnexo()).toHaveLength(0);
  });
});

describe('AnexosModal — a entidade e o id chegam ao bloco', () => {
  test('com entidadeId, monta o bloco e consulta a entidade certa', async () => {
    await renderizar({ entidade: 'material', entidadeId: 7 });
    expect(container.querySelector('[data-testid="anexos-modal"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="anexos-documento"]')).not.toBeNull();
    expect(api.get).toHaveBeenCalledWith(URL_LISTA,
      { params: { entidade: 'material', entidade_id: 7 } });
    // RN-02, regra (ii): "uma requisição" — `toHaveBeenCalledWith` sozinho aceitaria dez.
    expect(chamadasDeAnexo()).toHaveLength(1);
  });

  test('a casca repassa a entidade que recebeu, nao uma fixa', async () => {
    await renderizar({ entidade: 'item_remessa', entidadeId: 11 });
    expect(api.get).toHaveBeenCalledWith(URL_LISTA,
      { params: { entidade: 'item_remessa', entidade_id: 11 } });
  });
});

describe('AnexosModal — cabeçalho', () => {
  test('o cabecalho do modal nao duplica o titulo do bloco', async () => {
    await renderizar({ titulo: 'Anexos do material' });
    expect(container.textContent).toContain('Anexos do material');
    // O `<h4>` interno do AnexosDocumento tem de estar ausente — é o que `titulo={null}` compra.
    expect(container.querySelectorAll('.almox-anexos-titulo')).toHaveLength(0);
  });

  test('o cabecalho usa h2, como os 44 modais desta base — o CSS so estiliza h2', async () => {
    await renderizar({ titulo: 'Anexos do material' });
    const cabecalho = container.querySelector('.almox-modal-header');
    expect(cabecalho.querySelector('h2')).not.toBeNull();
    expect(cabecalho.querySelector('h3')).toBeNull();
  });

  test('o subtitulo aparece quando dado, e some quando nao', async () => {
    await renderizar({ subtitulo: 'MAT-001 — Chapa 3mm' });
    expect(container.textContent).toContain('MAT-001 — Chapa 3mm');
    await act(async () => { root.render(
      <AnexosModal entidade="material" entidadeId={7} onClose={() => {}} />); });
    await esperarEfeitos();
    expect(container.textContent).not.toContain('MAT-001');
  });
});

describe('AnexosModal — fechar', () => {
  test('fecha pelo X e pelo overlay, mas nao pelo corpo', async () => {
    const onClose = jest.fn();
    await renderizar({ onClose });

    await clicar(container.querySelector('.almox-modal-close'));
    expect(onClose).toHaveBeenCalledTimes(1);

    // O corpo tem `stopPropagation`: clicar dentro não pode fechar, senão selecionar texto no
    // nome de um anexo fecharia o modal.
    await clicar(container.querySelector('.almox-modal-body'));
    expect(onClose).toHaveBeenCalledTimes(1);

    await clicar(container.querySelector('[data-testid="anexos-modal"]'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
