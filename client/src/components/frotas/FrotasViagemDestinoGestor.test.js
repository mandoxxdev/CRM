/**
 * Frota Etapa 9 (C1) — Nova/Editar Viagem do gestor: Destino da lista com "+ Novo destino" e Origem com o endereco da GMP.
 *
 *   RN-F9.18  Sai o campo texto Destino; entra o select dos ativos ("Nome — Cidade/UF") com "+ Novo destino" (POST /frotas/destinos;
 *             201 seleciona; 409 seleciona o existente e avisa "Esse destino já estava cadastrado — selecionamos ele."). Opcional.
 *   RN-F9.19  Editar viagem antiga: destino texto sem destino_id -> select vazio e a nota "Destino gravado: <texto>. Escolha da lista
 *             só se quiser trocar."; salvar sem tocar manda destino_id null e nenhum `destino` (o servidor mantem).
 *   A3        destino_id vai como numero (lista de Number() do handleSave).
 *   A9        400 "Destino não encontrado" ao salvar -> relê GET /frotas/destinos e limpa a selecao.
 *   A10       destino gravado desativado -> opcao "<nome gravado na viagem> (desativado)" com o destino_id da viagem, selecionada.
 *   A11       nao ha como tirar o destino: a opcao vazia da edicao diz "Manter o destino gravado".
 *   RN-F9.24  Sai o campo Origem; entra "Saindo de: GMP — <meta.origemEndereco>"; viagem antiga com outra origem mostra "Origem gravada:
 *             <texto>" e a mantem; origem NULL ganha GMP.
 *
 * Contra o contrato congelado em docs/superpowers/plans/2026-10-29-frotas-etapa9-endereco-do-destino.md. So a fronteira HTTP (`api`)
 * e mockada.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/frotas/FrotasViagemDestinoGestor --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { FrotasViagens } from './FrotasEntityPage';
import { OrigemDaViagemGestor, MSG_DUPLICADO_GESTOR } from './DestinoGestor';
import api from '../../services/api';
import { toast } from 'react-toastify';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warning: jest.fn() } }));
const mockUsuario = { id: 1, nome: 'Gestor', role: 'user', is_superadmin: 0, admin_modulos: ['frota'], perfil_frota: null };
jest.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: mockUsuario, logout: jest.fn() }) }));
jest.mock('../../services/permissionsCache', () => ({ getEffectiveUser: (u) => u }));

const ORIGEM_END = 'Av. Angelo Demarchi 130, Batistini, São Bernardo do Campo/SP, CEP 09844-100';
const META = { setores: [], statusViagem: ['solicitada', 'concluida'], statusVeiculo: ['ativo'], origemPadrao: 'GMP', origemEndereco: ORIGEM_END };
const DESTINOS = [
  { id: 1, nome: 'Cliente Alfa', endereco: 'Rua A, 10, Centro, Diadema/SP', cidade: 'Diadema', uf: 'SP', ativo: 1 },
  { id: 2, nome: 'Obra Antiga', endereco: 'texto', cidade: null, uf: null, ativo: 1 },
];
const VEICULOS = [{ id: 1, placa: 'ABC1D23', status: 'ativo' }];
const VIAGENS = [
  // 0: destino da lista, ativo
  { id: 11, veiculo_id: 1, placa: 'ABC1D23', origem: 'GMP', destino: 'Cliente Alfa', destino_id: 1, status: 'concluida', km_saida: 100 },
  // 1: destino texto antigo (antes da Etapa 8), origem de outro lugar
  { id: 12, veiculo_id: 1, placa: 'ABC1D23', origem: 'Fabrica', destino: 'Cliente Velho', destino_id: null, status: 'concluida' },
  // 2: destino da lista que o gestor desativou depois; origem NULL (antes da Etapa 8)
  { id: 13, veiculo_id: 1, placa: 'ABC1D23', origem: null, destino: 'Galpão 5', destino_id: 5, status: 'concluida' },
];

let container; let root;
let destinosDoServidor;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  destinosDoServidor = DESTINOS;
  api.get.mockImplementation((url) => {
    if (url === '/frotas/meta') return Promise.resolve({ data: META });
    if (url === '/frotas/destinos') return Promise.resolve({ data: destinosDoServidor });
    if (url === '/frotas/veiculos') return Promise.resolve({ data: VEICULOS });
    if (url === '/frotas/motoristas') return Promise.resolve({ data: [] });
    if (url === '/frotas/viagens') return Promise.resolve({ data: VIAGENS });
    return Promise.resolve({ data: [] });
  });
  api.post.mockResolvedValue({ data: { id: 99 } });
  api.put.mockResolvedValue({ data: {} });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.clearAllMocks();
});

async function render(el) {
  await act(async () => { root.render(<MemoryRouter>{el}</MemoryRouter>); });
  await act(async () => {});
}
async function clicar(el) {
  if (!el) throw new Error('elemento nao encontrado');
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await act(async () => {});
}
const botao = (t) => [...container.querySelectorAll('button')].find((b) => b.textContent.trim() === t);
const grupo = (rotulo) => [...container.querySelectorAll('.frotas-form-group')]
  .find((g) => g.querySelector('label')?.textContent.trim() === rotulo);
const campo = (nome) => container.querySelector(`[name="${nome}"]`);
const editarLinha = (i) => container.querySelectorAll('tbody tr')[i].querySelector('.frotas-action-btn[title="Editar"]');
const selectDestino = () => grupo('Destino').querySelector('select[name="destino_id"]');
const opcoes = () => [...selectDestino().options].map((o) => [o.value, o.textContent]);
function digitar(el, v) {
  const alvo = typeof el === 'string' ? campo(el) : el;
  if (!alvo) throw new Error(`campo ${el} nao encontrado`);
  const proto = alvo.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(alvo, v);
    alvo.dispatchEvent(new Event(alvo.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}
async function salvar() {
  await act(async () => {
    container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await act(async () => {});
}
async function novaViagem() {
  await render(<FrotasViagens />);
  await clicar([...container.querySelectorAll('button')].find((b) => b.textContent.includes('Nova Viagem')));
}
const postsDe = (u) => api.post.mock.calls.filter(([url]) => url === u);

describe('RN-F9.18 — Nova Viagem: Destino da lista', () => {
  test('RN-F9.18 o form carrega GET /frotas/destinos; select dos ativos "Nome — Cidade/UF"; nao ha campo texto destino', async () => {
    await novaViagem();
    expect(api.get).toHaveBeenCalledWith('/frotas/destinos');
    expect(campo('destino')).toBeNull();
    expect(grupo('Destino').querySelector('input')).toBeNull();
    expect(opcoes()).toEqual([['', 'Escolha o destino…'], ['1', 'Cliente Alfa — Diadema/SP'], ['2', 'Obra Antiga']]);
    expect(selectDestino().value).toBe('');
    expect(botao('+ Novo destino')).toBeDefined();
  });

  test('RN-F9.18 / A3 escolher e salvar: POST /frotas/viagens com destino_id NUMERO e sem `destino` texto', async () => {
    await novaViagem();
    digitar(grupo('Veículo *').querySelector('select'), '1');
    digitar(selectDestino(), '2');
    await salvar();
    const [[url, corpo]] = postsDe('/frotas/viagens');
    expect(url).toBe('/frotas/viagens');
    expect(corpo.destino_id).toBe(2);
    expect(typeof corpo.destino_id).toBe('number');
    expect('destino' in corpo).toBe(false);
  });

  test('RN-F9.18 opcional: sem escolher, destino_id vai null', async () => {
    await novaViagem();
    await salvar();
    const corpo = postsDe('/frotas/viagens')[0][1];
    expect(corpo.destino_id).toBeNull();
    expect('destino' in corpo).toBe(false);
  });

  test('RN-F9.18 "+ Novo destino" 201: POST /frotas/destinos com nome e endereco, entra na lista selecionado e vai no corpo da viagem', async () => {
    api.post.mockImplementation((url) => {
      if (url === '/frotas/destinos') {
        return Promise.resolve({ data: { id: 7, nome: 'Obra Norte', cidade: 'Mauá', uf: 'SP', endereco: 'Rua N, 1, Centro, Mauá/SP', ativo: 1 } });
      }
      return Promise.resolve({ data: { id: 99 } });
    });
    await novaViagem();
    await clicar(botao('+ Novo destino'));
    const bloco = container.querySelector('[data-testid="novo-destino"]');
    expect(bloco).not.toBeNull();
    expect(botao('+ Novo destino')).toBeUndefined();
    digitar('novo_destino_nome', 'Obra Norte');
    digitar('novo_destino_logradouro', 'Rua N');
    digitar('novo_destino_numero', '1');
    digitar('novo_destino_bairro', 'Centro');
    digitar('novo_destino_cidade', 'Mauá');
    digitar('novo_destino_uf', 'SP');
    await clicar(botao('Adicionar'));
    expect(postsDe('/frotas/destinos')).toEqual([['/frotas/destinos', {
      nome: 'Obra Norte', cep: '', logradouro: 'Rua N', numero: '1', complemento: '', bairro: 'Centro', cidade: 'Mauá', uf: 'SP',
    }]]);
    expect(container.querySelector('[data-testid="novo-destino"]')).toBeNull();
    expect(opcoes()).toContainEqual(['7', 'Obra Norte — Mauá/SP']);
    expect(selectDestino().value).toBe('7');
    expect(toast.success).toHaveBeenCalledWith('Destino adicionado');
    await salvar();
    expect(postsDe('/frotas/viagens')[0][1].destino_id).toBe(7);
  });

  test('RN-F9.18 "+ Novo destino" 409 DESTINO_DUPLICADO: seleciona o existente sem duplicar e avisa', async () => {
    api.post.mockRejectedValueOnce({
      response: { status: 409, data: { error: 'Destino já cadastrado', code: 'DESTINO_DUPLICADO',
        destino: { id: 1, nome: 'Cliente Alfa', endereco: 'Rua A', cidade: 'Diadema', uf: 'SP', ativo: 1 } } },
    });
    await novaViagem();
    await clicar(botao('+ Novo destino'));
    digitar('novo_destino_nome', 'cliente alfa');
    await clicar(botao('Adicionar'));
    expect(opcoes().filter(([v]) => v === '1')).toHaveLength(1);
    expect(selectDestino().value).toBe('1');
    expect(toast.info).toHaveBeenCalledWith('Esse destino já estava cadastrado — selecionamos ele.');
    expect(MSG_DUPLICADO_GESTOR).toBe('Esse destino já estava cadastrado — selecionamos ele.');
    expect(container.querySelector('[data-testid="novo-destino"]')).toBeNull();
  });

  test('RN-F9.18 "+ Novo destino" 400: a mensagem fica no bloco aberto; a selecao nao muda; o modal da viagem continua', async () => {
    api.post.mockRejectedValueOnce({ response: { status: 400, data: { error: 'Informe o número (ou S/N)' } } });
    await novaViagem();
    digitar(selectDestino(), '2');
    await clicar(botao('+ Novo destino'));
    digitar('novo_destino_nome', 'Obra Norte');
    await clicar(botao('Adicionar'));
    const bloco = container.querySelector('[data-testid="novo-destino"]');
    expect(bloco.querySelector('[role="alert"]').textContent).toBe('Informe o número (ou S/N)');
    expect(selectDestino().value).toBe('2');
    expect(postsDe('/frotas/viagens')).toHaveLength(0);
    await clicar(botao('Cancelar'));
    expect(container.querySelector('[data-testid="novo-destino"]')).toBeNull();
    expect(container.querySelector('.frotas-modal')).not.toBeNull();
  });

  test('RN-F9.18 o CEP do "+ Novo destino" do gestor busca e preenche (mesmo componente do portal)', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/cep/09844100') {
        return Promise.resolve({ data: { cep: '09844-100', logradouro: 'Avenida Angelo Demarchi', bairro: 'Batistini', cidade: 'São Bernardo do Campo', estado: 'SP' } });
      }
      if (url === '/frotas/meta') return Promise.resolve({ data: META });
      if (url === '/frotas/destinos') return Promise.resolve({ data: DESTINOS });
      if (url === '/frotas/viagens') return Promise.resolve({ data: VIAGENS });
      return Promise.resolve({ data: [] });
    });
    await novaViagem();
    await clicar(botao('+ Novo destino'));
    digitar('novo_destino_cep', '09844100');
    await clicar(botao('Buscar'));
    expect(campo('novo_destino_logradouro').value).toBe('Avenida Angelo Demarchi');
    expect(campo('novo_destino_uf').value).toBe('SP');
  });
});

describe('RN-F9.19 / A10 / A11 — Editar viagem', () => {
  test('RN-F9.19 destino da lista ativo: abre selecionado; salvar manda o mesmo destino_id numero', async () => {
    await render(<FrotasViagens />);
    await clicar(editarLinha(0));
    expect(selectDestino().value).toBe('1');
    expect(container.querySelector('[data-testid="destino-gravado"]')).toBeNull();
    await salvar();
    const [url, corpo] = api.put.mock.calls[0];
    expect(url).toBe('/frotas/viagens/11');
    expect(corpo.destino_id).toBe(1);
    expect('destino' in corpo).toBe(false);
  });

  test('RN-F9.19 destino texto antigo (sem destino_id): select vazio, a nota, e salvar sem tocar manda destino_id null e nenhum destino', async () => {
    await render(<FrotasViagens />);
    await clicar(editarLinha(1));
    expect(selectDestino().value).toBe('');
    expect(container.querySelector('[data-testid="destino-gravado"]').textContent)
      .toBe('Destino gravado: Cliente Velho. Escolha da lista só se quiser trocar.');
    // A11: a opcao vazia nao oferece "sem destino"
    expect(selectDestino().options[0].textContent).toBe('Manter o destino gravado');
    await salvar();
    const corpo = api.put.mock.calls[0][1];
    expect(corpo.destino_id).toBeNull();
    expect('destino' in corpo).toBe(false);
  });

  test('RN-F9.19 destino texto antigo: escolher da lista troca (destino_id numero)', async () => {
    await render(<FrotasViagens />);
    await clicar(editarLinha(1));
    digitar(selectDestino(), '1');
    await salvar();
    expect(api.put.mock.calls[0][1].destino_id).toBe(1);
  });

  test('A10 destino gravado desativado: opcao "<nome gravado> (desativado)" com o id da viagem, selecionada; salvar manda o mesmo id', async () => {
    await render(<FrotasViagens />);
    await clicar(editarLinha(2));
    expect(opcoes()).toContainEqual(['5', 'Galpão 5 (desativado)']);
    expect(selectDestino().value).toBe('5');
    expect(selectDestino().options[0].textContent).toBe('Manter o destino gravado');
    await salvar();
    expect(api.put.mock.calls[0][1].destino_id).toBe(5);
  });

  test('A10 metade negativa: a Nova Viagem nao mostra opcao "(desativado)"', async () => {
    await novaViagem();
    expect(opcoes().some(([, t]) => t.includes('(desativado)'))).toBe(false);
  });
});

describe('A9 — 400 "Destino não encontrado" ao salvar', () => {
  test('A9 relê os destinos, tira o desativado da lista e limpa a selecao; o toast mostra a mensagem do servidor', async () => {
    api.post.mockRejectedValueOnce({ response: { status: 400, data: { error: 'Destino não encontrado' } } });
    await novaViagem();
    digitar(selectDestino(), '2');
    const leiturasAntes = api.get.mock.calls.filter(([u]) => u === '/frotas/destinos').length;
    destinosDoServidor = [DESTINOS[0]]; // o gestor desativou o 2 com o modal aberto
    await salvar();
    expect(toast.error).toHaveBeenCalledWith('Destino não encontrado');
    expect(api.get.mock.calls.filter(([u]) => u === '/frotas/destinos').length).toBe(leiturasAntes + 1);
    expect(opcoes()).toEqual([['', 'Escolha o destino…'], ['1', 'Cliente Alfa — Diadema/SP']]);
    expect(selectDestino().value).toBe('');
    expect(container.querySelector('.frotas-modal')).not.toBeNull();
  });

  test('A9 metade negativa: outro 400 nao relê os destinos nem limpa a selecao', async () => {
    api.post.mockRejectedValueOnce({ response: { status: 400, data: { error: 'Veículo não encontrado' } } });
    await novaViagem();
    digitar(selectDestino(), '2');
    const leiturasAntes = api.get.mock.calls.filter(([u]) => u === '/frotas/destinos').length;
    await salvar();
    expect(api.get.mock.calls.filter(([u]) => u === '/frotas/destinos').length).toBe(leiturasAntes);
    expect(selectDestino().value).toBe('2');
  });
});

describe('RN-F9.24 — Origem com o endereco da GMP', () => {
  test('RN-F9.24 Nova Viagem: sem campo Origem; linha fixa "Saindo de: GMP — <endereco>"; o corpo vai com origem GMP', async () => {
    await novaViagem();
    expect(campo('origem')).toBeNull();
    expect(grupo('Origem').querySelector('input')).toBeNull();
    expect(container.querySelector('[data-testid="origem-gestor"]').textContent).toBe(`Saindo de: GMP — ${ORIGEM_END}`);
    await salvar();
    expect(postsDe('/frotas/viagens')[0][1].origem).toBe('GMP');
  });

  test('RN-F9.24 viagem antiga com outra origem: "Origem gravada: Fabrica" (sem a linha da GMP) e o PUT a mantem', async () => {
    await render(<FrotasViagens />);
    await clicar(editarLinha(1));
    expect(container.querySelector('[data-testid="origem-gravada"]').textContent).toBe('Origem gravada: Fabrica');
    expect(container.querySelector('[data-testid="origem-gestor"]')).toBeNull();
    await salvar();
    expect(api.put.mock.calls[0][1].origem).toBe('Fabrica');
  });

  test('RN-F9.24 viagem antiga com origem NULL: mostra a GMP e, salva, ganha GMP (ajuste 18 da Etapa 8)', async () => {
    await render(<FrotasViagens />);
    await clicar(editarLinha(2));
    expect(container.querySelector('[data-testid="origem-gestor"]').textContent).toBe(`Saindo de: GMP — ${ORIGEM_END}`);
    expect(container.querySelector('[data-testid="origem-gravada"]')).toBeNull();
    await salvar();
    expect(api.put.mock.calls[0][1].origem).toBe('GMP');
  });

  test('RN-F9.24 sem endereco da GMP nas Configuracoes (origemEndereco vazio ou ausente): so "Saindo de: GMP"', async () => {
    await act(async () => { root.render(<OrigemDaViagemGestor editing={null} meta={{ origemEndereco: '' }} />); });
    expect(container.querySelector('[data-testid="origem-gestor"]').textContent).toBe('Saindo de: GMP');
    await act(async () => { root.render(<OrigemDaViagemGestor editing={{ origem: 'GMP' }} meta={null} />); });
    expect(container.querySelector('[data-testid="origem-gestor"]').textContent).toBe('Saindo de: GMP');
  });
});
