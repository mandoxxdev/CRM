/**
 * Frota Etapa 5 (T2) — fotos da avaria e do cupom na tela (RN-F5.09, RN-F5.10, RN-F5.11), contra o contrato congelado do plano
 * docs/superpowers/plans/2026-10-23-frotas-etapa5-fotos.md (com os "Ajustes da Fase 2"). So a fronteira HTTP (`api`) e mockada.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/frotas/FrotasFotos --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import FrotasPortalMotorista, { RegistroForm, AbastecimentoForm } from './FrotasPortalMotorista';
import { ENTITY_CONFIGS } from './frotasEntityConfigs';
import { reduzirFoto, enviarFotoFrota } from '../../utils/frotasApi';
import api from '../../services/api';
import { toast } from 'react-toastify';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warning: jest.fn() } }));
// Estavel entre renders (o portal recarrega quando o refreshUser muda)
const mockAuth = { user: { id: 7, nome: 'Jose', role: 'usuario', perfil_frota: null }, refreshUser: () => Promise.resolve(null) };
jest.mock('../../context/AuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('../../services/permissionsCache', () => ({ getEffectiveUser: (u) => u }));

const ITENS = ['pneus_estepe', 'farois_lanternas', 'setas_luz_freio', 'parabrisa_vidros', 'espelhos_retrovisores', 'limpadores_agua',
  'oleo_motor', 'arrefecimento', 'freios', 'buzina_cintos', 'documentos_equipamentos', 'carroceria_carga']
  .map((chave, i) => ({ chave, rotulo: `Item ${i + 1}` }));
const VEICULOS = [{ id: 1, placa: 'ABC1D23', modelo: 'Sprinter', marca: 'Mercedes', km_atual: 1000, tipo_medicao: 'km', status: 'ativo' }];
const inicio = (over = {}) => ({
  motorista: { id: 7, nome: 'Jose da Silva' }, viagem_aberta: null, veiculos: VEICULOS, itens: ITENS,
  perfil: 'MOTORISTA', pode_registrar: true, pode_gerir: false, ...over,
});

const URL_A = (n) => `/api/uploads/frotas-anexos/frota-${n}.jpg?exp=1&sig=x`;

let container;
let root;
let previas;
let meusRegistros;
const urlOriginal = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  previas = 0;
  URL.createObjectURL = jest.fn(() => { previas += 1; return `blob:previa-${previas}`; });
  URL.revokeObjectURL = jest.fn();
  meusRegistros = {
    registros: [{ id: 5, tipo_registro: 'saida', placa: 'ABC1D23', data_checklist: '2026-10-22', horario: '08:10', km: 1000,
      status_geral: 'OK', anexos: [{ id: 31, url: URL_A(31), tipo_mime: 'image/jpeg', tamanho: 10, created_at: '2026-10-22' }] }],
    abastecimentos: [{ id: 9, placa: 'ABC1D23', data_abastecimento: '2026-10-21', litros: 40,
      anexos: [41, 42, 43].map((id) => ({ id, url: URL_A(id), tipo_mime: 'image/jpeg', tamanho: 10, created_at: '2026-10-21' })) }],
  };
  api.get.mockImplementation((url) => {
    if (url === '/frotas/portal/inicio') return Promise.resolve({ data: inicio() });
    if (url === '/frotas/portal/meus-registros') return Promise.resolve({ data: meusRegistros });
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
  URL.createObjectURL = urlOriginal.create;
  URL.revokeObjectURL = urlOriginal.revoke;
});

const foto = (nome = 'avaria.jpg', tipo = 'image/jpeg', bytes = 10) => new File([new Uint8Array(bytes)], nome, { type: tipo });
const botoes = () => [...container.querySelectorAll('button')];
const botao = (texto) => botoes().find((b) => b.textContent.trim() === texto);
async function clicar(el) {
  if (!el) throw new Error('elemento nao encontrado');
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}
async function escolherArquivos(input, arquivos) {
  if (!input) throw new Error('input de foto nao encontrado');
  Object.defineProperty(input, 'files', { value: arquivos, configurable: true });
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
}
const inputTirarFoto = () => container.querySelector('input[type="file"][aria-label="Tirar foto"]');
const dicaFotos = () => container.querySelector('[data-testid="dica-fotos"]').textContent;
async function enviarFormulario() {
  await act(async () => { container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
}
async function responderTudo() {
  for (const it of ITENS) {
    // eslint-disable-next-line no-await-in-loop
    await clicar(container.querySelector(`[aria-label="${it.rotulo}: OK"]`));
  }
}
const chamadasDeAnexo = () => api.post.mock.calls.filter(([u]) => u === '/frotas/anexos');

async function abrirRegistro(onSalvo) {
  await act(async () => {
    root.render(<RegistroForm tipo="inspecao" inicio={inicio()} onCancelar={() => {}} onSalvo={onSalvo} onAtualizar={() => {}} />);
  });
}
async function abrirAbastecimento(onSalvo) {
  await act(async () => { root.render(<AbastecimentoForm inicio={inicio()} onCancelar={() => {}} onSalvo={onSalvo} />); });
}

describe('RN-F5.09 — Tirar foto antes de salvar', () => {
  test('registro: legenda, dica, e o input e de camera (accept image/*, capture environment)', async () => {
    await abrirRegistro(jest.fn());
    const grupo = container.querySelector('[data-testid="fotos-antes-de-salvar"]');
    expect(grupo.querySelector('legend').textContent).toBe('Fotos');
    expect(dicaFotos()).toBe('Até 3 fotos (avarias, painel…). Elas sobem depois que o registro for salvo.');
    const input = inputTirarFoto();
    expect(input).not.toBeNull();
    expect(input.getAttribute('accept')).toBe('image/*');
    expect(input.getAttribute('capture')).toBe('environment');
    expect(botao('Tirar foto')).toBeDefined();
  });

  // Etapa 8 (RN-F8.12): dizia que o abastecimento tinha foto ("Foto do cupom"); a spec 20 tirou.
  test('abastecimento: nao ha Tirar foto nem "Foto do cupom"; o grupo de fotos nao existe', async () => {
    await abrirAbastecimento(jest.fn());
    expect(container.querySelector('[data-testid="fotos-antes-de-salvar"]')).toBeNull();
    expect(inputTirarFoto()).toBeNull();
    expect(botao('Tirar foto')).toBeUndefined();
    expect(container.textContent).not.toContain('Foto do cupom');
    expect(container.querySelector('form[aria-label="Formulário de Abastecimento"]')).not.toBeNull();
  });

  test('miniatura de previa; Remover foto tira a previa e libera a URL', async () => {
    await abrirRegistro(jest.fn());
    await escolherArquivos(inputTirarFoto(), [foto('a.jpg')]);
    await escolherArquivos(inputTirarFoto(), [foto('b.jpg')]);
    let imgs = [...container.querySelectorAll('[data-testid="fotos-antes-de-salvar"] img')];
    expect(imgs.map((i) => i.getAttribute('src'))).toEqual(['blob:previa-1', 'blob:previa-2']);
    const remover = botoes().filter((b) => b.textContent.trim() === 'Remover foto');
    expect(remover).toHaveLength(2);
    await clicar(remover[0]);
    imgs = [...container.querySelectorAll('[data-testid="fotos-antes-de-salvar"] img')];
    expect(imgs.map((i) => i.getAttribute('src'))).toEqual(['blob:previa-2']);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:previa-1');
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:previa-2');
  });

  test('ao sair do formulario, as previas que sobraram sao liberadas', async () => {
    await abrirRegistro(jest.fn());
    await escolherArquivos(inputTirarFoto(), [foto('a.jpg')]);
    act(() => root.render(<div />));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:previa-1');
  });

  test('limite de 3: com 3, o botao fica desabilitado e a dica vira "Limite de 3 fotos."; a 4a escolhida e ignorada', async () => {
    await abrirRegistro(jest.fn());
    await escolherArquivos(inputTirarFoto(), [foto('a.jpg'), foto('b.jpg')]);
    expect(botao('Tirar foto').disabled).toBe(false);
    await escolherArquivos(inputTirarFoto(), [foto('c.jpg'), foto('d.jpg')]);
    expect(container.querySelectorAll('[data-testid="fotos-antes-de-salvar"] img')).toHaveLength(3);
    expect(botao('Tirar foto').disabled).toBe(true);
    expect(inputTirarFoto().disabled).toBe(true);
    expect(dicaFotos()).toBe('Limite de 3 fotos.');
    await clicar(botoes().find((b) => b.textContent.trim() === 'Remover foto'));
    expect(botao('Tirar foto').disabled).toBe(false);
    expect(dicaFotos()).toBe('Até 3 fotos (avarias, painel…). Elas sobem depois que o registro for salvo.');
  });
});

describe('RN-F5.09 — as fotos sobem depois do 201, uma por vez, e so entao o formulario sai (Fase 2 T-4/T-5)', () => {
  test('registro: POST do registro, depois um POST /frotas/anexos por foto com entidade=registro e o id de data.registro.id; onSalvo por ultimo', async () => {
    const ordem = [];
    api.post.mockImplementation((url, corpo) => {
      ordem.push(url === '/frotas/anexos' ? `anexo:${corpo.get('foto').name}` : url);
      if (url === '/frotas/portal/registros') return Promise.resolve({ data: { registro: { id: 41 }, viagem: { id: 99 } } });
      return Promise.resolve({ data: { id: 1, url: URL_A(1) } });
    });
    const onSalvo = jest.fn(() => ordem.push('onSalvo'));
    await abrirRegistro(onSalvo);
    await responderTudo();
    await escolherArquivos(inputTirarFoto(), [foto('a.jpg'), foto('b.png', 'image/png')]);
    await enviarFormulario();

    expect(ordem).toEqual(['/frotas/portal/registros', 'anexo:a.jpg', 'anexo:b.png', 'onSalvo']);
    const envios = chamadasDeAnexo();
    expect(envios).toHaveLength(2);
    envios.forEach(([, fd, opcoes]) => {
      expect(fd).toBeInstanceOf(FormData);
      expect(fd.get('entidade')).toBe('registro');
      expect(fd.get('entidade_id')).toBe('41');
      expect(fd.get('foto')).toBeInstanceOf(File);
      expect(opcoes).toEqual({ timeout: 120000 });
    });
    expect(toast.success).toHaveBeenCalledWith('Inspeção registrada');
    expect(toast.warning).not.toHaveBeenCalled();
  });

  test('o formulario so sai depois que a foto terminou de subir (envio pendente segura o onSalvo)', async () => {
    let soltar;
    api.post.mockImplementation((url) => {
      if (url === '/frotas/portal/registros') return Promise.resolve({ data: { registro: { id: 41 } } });
      return new Promise((resolve) => { soltar = () => resolve({ data: { id: 1 } }); });
    });
    const onSalvo = jest.fn();
    await abrirRegistro(onSalvo);
    await responderTudo();
    await escolherArquivos(inputTirarFoto(), [foto('a.jpg')]);
    await enviarFormulario();
    expect(chamadasDeAnexo()).toHaveLength(1);
    expect(onSalvo).not.toHaveBeenCalled();
    await act(async () => { soltar(); });
    expect(onSalvo).toHaveBeenCalledTimes(1);
  });

  // Etapa 8 (RN-F8.12): dizia que o abastecimento tinha foto (era um test.each registro/abastecimento); a spec 20 tirou — so registro.
  test('Fase5-F1/F2 (registro): enquanto as fotos sobem, "Remover foto" e "Voltar" ficam desligados', async () => {
    let soltar;
    api.post.mockImplementation((url) => {
      if (url === '/frotas/portal/registros') return Promise.resolve({ data: { registro: { id: 41 } } });
      return new Promise((resolve) => { soltar = () => resolve({ data: { id: 1 } }); });
    });
    const onSalvo = jest.fn();
    const onCancelar = jest.fn();
    await act(async () => {
      root.render(<RegistroForm tipo="inspecao" inicio={inicio()} onCancelar={onCancelar} onSalvo={onSalvo} onAtualizar={() => {}} />);
    });
    await responderTudo();
    await escolherArquivos(inputTirarFoto(), [foto('a.jpg'), foto('b.jpg')]);
    // metade positiva: antes de salvar, os dois botoes estao ligados
    expect(botoes().filter((b) => b.textContent.trim() === 'Remover foto').map((b) => b.disabled)).toEqual([false, false]);
    expect(botao('Voltar').disabled).toBe(false);
    await enviarFormulario();
    expect(chamadasDeAnexo()).toHaveLength(1);
    expect(botoes().filter((b) => b.textContent.trim() === 'Remover foto').map((b) => b.disabled)).toEqual([true, true]);
    expect(botao('Voltar').disabled).toBe(true);
    await clicar(botao('Voltar'));
    expect(onCancelar).not.toHaveBeenCalled();
    await act(async () => { soltar(); });
    await act(async () => { soltar(); });
    expect(chamadasDeAnexo().map(([, fd]) => fd.get('foto').name)).toEqual(['a.jpg', 'b.jpg']);
    expect(onSalvo).toHaveBeenCalledTimes(1);
  });

  test('sem foto, nao ha POST de anexo e o onSalvo vem logo depois do 201', async () => {
    api.post.mockResolvedValue({ data: { registro: { id: 41 } } });
    const onSalvo = jest.fn();
    await abrirRegistro(onSalvo);
    await responderTudo();
    await enviarFormulario();
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(onSalvo).toHaveBeenCalledTimes(1);
  });

  // Etapa 8 (RN-F8.12): dizia que o abastecimento subia a foto do cupom com entidade=abastecimento; a spec 20 tirou.
  test('abastecimento: salvar faz 1 POST em /portal/abastecimentos e 0 em /anexos; onSalvo logo depois do 201', async () => {
    const ordem = [];
    api.post.mockImplementation((url) => {
      ordem.push(url);
      if (url === '/frotas/portal/abastecimentos') return Promise.resolve({ data: { id: 77 } });
      return Promise.resolve({ data: { id: 1 } });
    });
    const onSalvo = jest.fn(() => ordem.push('onSalvo'));
    await abrirAbastecimento(onSalvo);
    const litros = container.querySelector('input[name="litros"]');
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    await act(async () => { set.call(litros, '30'); litros.dispatchEvent(new Event('input', { bubbles: true })); });
    await enviarFormulario();
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post.mock.calls[0][0]).toBe('/frotas/portal/abastecimentos');
    expect(chamadasDeAnexo()).toHaveLength(0);
    expect(ordem).toEqual(['/frotas/portal/abastecimentos', 'onSalvo']);
    expect(onSalvo).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith('Abastecimento registrado');
    expect(toast.warning).not.toHaveBeenCalled();
  });

  test('falha de 1 foto: o registro fica salvo, aviso com a mensagem do servidor, e o formulario sai', async () => {
    let n = 0;
    api.post.mockImplementation((url) => {
      if (url === '/frotas/portal/registros') return Promise.resolve({ data: { registro: { id: 41 } } });
      n += 1;
      if (n === 2) return Promise.reject({ response: { status: 409, data: { error: 'Este lançamento já tem 3 fotos', code: 'LIMITE_DE_FOTOS' } } });
      return Promise.resolve({ data: { id: n } });
    });
    const onSalvo = jest.fn();
    await abrirRegistro(onSalvo);
    await responderTudo();
    await escolherArquivos(inputTirarFoto(), [foto('a.jpg'), foto('b.jpg'), foto('c.jpg')]);
    await enviarFormulario();
    expect(chamadasDeAnexo()).toHaveLength(3); // a falha da 2a nao para as outras
    expect(toast.warning).toHaveBeenCalledTimes(1);
    expect(toast.warning).toHaveBeenCalledWith('Salvo, mas 1 foto não foi enviada: Este lançamento já tem 3 fotos');
    expect(toast.success).toHaveBeenCalledWith('Inspeção registrada');
    expect(onSalvo).toHaveBeenCalledTimes(1);
  });

  test('falha de 2 fotos sem resposta (rede): aviso no plural com a mensagem de internet', async () => {
    api.post.mockImplementation((url) => {
      if (url === '/frotas/portal/registros') return Promise.resolve({ data: { registro: { id: 41 } } });
      return Promise.reject(new Error('Network Error'));
    });
    const onSalvo = jest.fn();
    await abrirRegistro(onSalvo);
    await responderTudo();
    await escolherArquivos(inputTirarFoto(), [foto('a.jpg'), foto('b.jpg')]);
    await enviarFormulario();
    expect(toast.warning).toHaveBeenCalledWith(
      'Salvo, mas 2 fotos não foram enviadas: Confira a internet e tente de novo em Meus registros.',
    );
    expect(onSalvo).toHaveBeenCalledTimes(1);
  });

  // Etapa 8 (RN-F8.12/14): dizia que o abastecimento tinha foto; a spec 20 tirou — o cenario (que e sobre a ordem das falhas) vale
  // para o registro, que mantem as fotos.
  test('falha de 2: a mensagem e a da PRIMEIRA falha', async () => {
    let n = 0;
    api.post.mockImplementation((url) => {
      if (url === '/frotas/portal/registros') return Promise.resolve({ data: { registro: { id: 41 } } });
      n += 1;
      return Promise.reject(n === 1
        ? { response: { status: 400, data: { error: 'Formato de imagem não suportado' } } }
        : { response: { status: 413, data: { error: 'Arquivo grande demais (máximo 10 MB)' } } });
    });
    // HEIC tenta reduzir; navegador sem canvas -> vai a original (o servidor recusa com a mensagem de formato)
    const getContext = jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    try {
      await abrirRegistro(jest.fn());
      await responderTudo();
      await escolherArquivos(inputTirarFoto(), [foto('a.heic', 'image/heic'), foto('b.jpg')]);
      await enviarFormulario();
    } finally {
      getContext.mockRestore();
    }
    expect(chamadasDeAnexo()[0][1].get('foto').name).toBe('a.heic');
    expect(toast.warning).toHaveBeenCalledWith('Salvo, mas 2 fotos não foram enviadas: Formato de imagem não suportado');
  });

  // Etapa 8 (RN-F8.12/14): dizia que o abastecimento tinha foto; a spec 20 tirou — o cenario vale para o registro.
  test('recusa do lancamento: nenhuma foto sobe e o formulario fica com as previas', async () => {
    api.post.mockRejectedValueOnce({ response: { status: 400, data: { error: 'KM inválido' } } });
    const onSalvo = jest.fn();
    await abrirRegistro(onSalvo);
    await responderTudo();
    await escolherArquivos(inputTirarFoto(), [foto('painel.jpg')]);
    await enviarFormulario();
    expect(chamadasDeAnexo()).toHaveLength(0);
    expect(onSalvo).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]').textContent).toBe('KM inválido');
    expect(container.querySelectorAll('[data-testid="fotos-antes-de-salvar"] img')).toHaveLength(1);
  });
});

describe('RN-F5.10 — Meus registros', () => {
  async function abrirPortal() {
    await act(async () => { root.render(<FrotasPortalMotorista />); });
  }
  const secao = () => container.querySelector('[aria-label="Meus registros"]');
  // o seletor CSS [aria-label="+ Foto"] nao casa no nwsapi do jsdom (o "+"); filtra pelo atributo
  const inputMaisFoto = () => [...secao().querySelectorAll('input[type="file"]')].find((i) => i.getAttribute('aria-label') === '+ Foto');
  const leiturasMeus = () => api.get.mock.calls.filter(([u]) => u === '/frotas/portal/meus-registros').length;

  test('miniaturas com a URL assinada do servidor, abrindo em outra aba', async () => {
    await abrirPortal();
    const links = [...secao().querySelectorAll('a')];
    expect(links).toHaveLength(4);
    expect(links[0].getAttribute('href')).toBe(URL_A(31));
    expect(links[0].getAttribute('target')).toBe('_blank');
    expect(links[0].getAttribute('rel')).toContain('noopener');
    expect(links[0].querySelector('img').getAttribute('src')).toBe(URL_A(31));
  });

  test('+ Foto aparece com menos de 3 e some com 3; o input e de camera', async () => {
    await abrirPortal();
    const maisFoto = [...secao().querySelectorAll('button')].filter((b) => b.textContent.trim() === '+ Foto');
    expect(maisFoto).toHaveLength(1); // so o registro (1 foto); o abastecimento nao tem + Foto desde a Etapa 8 (RN-F8.13)
    const input = inputMaisFoto();
    expect(input.getAttribute('capture')).toBe('environment');
    expect(input.getAttribute('accept')).toBe('image/*');
  });

  // Etapa 8 (RN-F8.13): dizia que o abastecimento ganhava "+ Foto" com menos de 3; a spec 20 tirou. As miniaturas antigas (e o
  // "Remover foto") continuam; sem anexos, nao aparece bloco de fotos nenhum.
  test('Meus registros: abastecimento com 2 anexos mostra 2 miniaturas (com Remover foto) e 0 "+ Foto"; sem anexos, nada', async () => {
    meusRegistros = {
      registros: [],
      abastecimentos: [
        { id: 9, placa: 'ABC1D23', data_abastecimento: '2026-10-21', litros: 40,
          anexos: [41, 42].map((id) => ({ id, url: URL_A(id), tipo_mime: 'image/jpeg', tamanho: 10, created_at: '2026-10-21' })) },
        { id: 10, placa: 'ABC1D23', data_abastecimento: '2026-10-22', litros: 30, anexos: [] },
      ],
    };
    await abrirPortal();
    const itens = [...secao().querySelectorAll('.portal-lista-item')];
    expect(itens).toHaveLength(2);
    expect(itens[0].querySelectorAll('img')).toHaveLength(2);
    expect([...itens[0].querySelectorAll('button')].filter((b) => b.textContent.trim() === 'Remover foto')).toHaveLength(2);
    expect([...secao().querySelectorAll('button')].filter((b) => b.textContent.trim() === '+ Foto')).toHaveLength(0);
    expect(secao().querySelectorAll('input[type="file"]')).toHaveLength(0);
    expect(itens[1].querySelectorAll('img')).toHaveLength(0);
    expect(itens[1].querySelector('.frota-fotos-do-lancamento')).toBeNull();
  });

  test('+ Foto envia para o lancamento certo, avisa "Foto enviada" e recarrega', async () => {
    api.post.mockResolvedValue({ data: { id: 32 } });
    await abrirPortal();
    const antes = leiturasMeus();
    await escolherArquivos(inputMaisFoto(), [foto('nova.jpg')]);
    const envios = chamadasDeAnexo();
    expect(envios).toHaveLength(1);
    expect(envios[0][1].get('entidade')).toBe('registro');
    expect(envios[0][1].get('entidade_id')).toBe('5');
    expect(toast.success).toHaveBeenCalledWith('Foto enviada');
    expect(leiturasMeus()).toBe(antes + 1);
  });

  test('+ Foto: erro do servidor no toast; sem resposta, a mensagem de internet', async () => {
    api.post.mockRejectedValueOnce({ response: { status: 409, data: { error: 'Este lançamento já tem 3 fotos' } } });
    await abrirPortal();
    await escolherArquivos(inputMaisFoto(), [foto('nova.jpg')]);
    expect(toast.error).toHaveBeenCalledWith('Este lançamento já tem 3 fotos');
    api.post.mockRejectedValueOnce(new Error('Network Error'));
    await escolherArquivos(inputMaisFoto(), [foto('nova.jpg')]);
    expect(toast.error).toHaveBeenLastCalledWith('Não foi possível enviar a foto. Confira a internet e tente de novo.');
    expect(toast.success).not.toHaveBeenCalled();
  });

  test('Remover foto pede confirmacao, apaga, avisa "Foto removida" e recarrega', async () => {
    api.delete.mockResolvedValue({ data: { success: true } });
    const confirmar = jest.spyOn(window, 'confirm').mockReturnValue(true);
    try {
      await abrirPortal();
      const antes = leiturasMeus();
      const remover = [...secao().querySelectorAll('button')].filter((b) => b.textContent.trim() === 'Remover foto');
      expect(remover).toHaveLength(4);
      await clicar(remover[0]);
      expect(confirmar).toHaveBeenCalledWith('Remover esta foto?');
      expect(api.delete).toHaveBeenCalledWith('/frotas/anexos/31');
      expect(toast.success).toHaveBeenCalledWith('Foto removida');
      expect(leiturasMeus()).toBe(antes + 1);
    } finally {
      confirmar.mockRestore();
    }
  });

  test('Remover foto cancelado na confirmacao: nao apaga', async () => {
    const confirmar = jest.spyOn(window, 'confirm').mockReturnValue(false);
    try {
      await abrirPortal();
      await clicar([...secao().querySelectorAll('button')].find((b) => b.textContent.trim() === 'Remover foto'));
      expect(api.delete).not.toHaveBeenCalled();
    } finally {
      confirmar.mockRestore();
    }
  });

  test('lancamento sem `anexos` (servidor antigo): sem miniatura e sem quebrar, com + Foto', async () => {
    meusRegistros = { registros: [{ id: 5, tipo_registro: 'saida', placa: 'ABC1D23', data_checklist: '2026-10-22' }], abastecimentos: [] };
    await abrirPortal();
    expect(secao().querySelectorAll('img')).toHaveLength(0);
    expect([...secao().querySelectorAll('button')].filter((b) => b.textContent.trim() === '+ Foto')).toHaveLength(1);
  });
});

describe('RN-F5.11 — coluna Fotos do gestor (Checklist e Abastecimentos)', () => {
  const colunaFotos = (entidade) => ENTITY_CONFIGS[entidade].columns.find((c) => c.label === 'Fotos');
  async function renderizarCelula(entidade, linha) {
    await act(async () => { root.render(<table><tbody><tr><td>{colunaFotos(entidade).render(linha)}</td></tr></tbody></table>); });
    return container.querySelector('td');
  }
  const anexos = (n) => Array.from({ length: n }, (_, i) => ({ id: 50 + i, url: URL_A(50 + i), tipo_mime: 'image/jpeg' }));

  test.each(['checklists', 'abastecimentos'])('%s: tem a coluna Fotos com render', (entidade) => {
    expect(colunaFotos(entidade)).toBeDefined();
    expect(typeof colunaFotos(entidade).render).toBe('function');
  });

  test.each(['checklists', 'abastecimentos'])('%s: so a 1a miniatura (alt "Foto 1", lazy, outra aba) e "+2" para a 2a', async (entidade) => {
    const td = await renderizarCelula(entidade, { id: 1, anexos: anexos(3) });
    const imgs = td.querySelectorAll('img');
    expect(imgs).toHaveLength(1);
    expect(imgs[0].getAttribute('alt')).toBe('Foto 1');
    expect(imgs[0].getAttribute('loading')).toBe('lazy');
    expect(imgs[0].getAttribute('src')).toBe(URL_A(50));
    const links = td.querySelectorAll('a');
    expect(links[0].getAttribute('target')).toBe('_blank');
    expect(links[0].getAttribute('href')).toBe(URL_A(50));
    expect(links[1].textContent).toBe('+2');
    expect(links[1].getAttribute('href')).toBe(URL_A(51));
    expect(links[1].getAttribute('target')).toBe('_blank');
  });

  test('duas fotos: "+1"; uma foto: sem "+N"', async () => {
    let td = await renderizarCelula('checklists', { id: 1, anexos: anexos(2) });
    expect([...td.querySelectorAll('a')].map((a) => a.textContent)).toEqual(['', '+1']);
    td = await renderizarCelula('checklists', { id: 1, anexos: anexos(1) });
    expect(td.querySelectorAll('a')).toHaveLength(1);
    expect(td.textContent).toBe('');
  });

  test('sem foto ("anexos" vazio ou ausente): "-"', async () => {
    let td = await renderizarCelula('abastecimentos', { id: 1, anexos: [] });
    expect(td.textContent).toBe('-');
    td = await renderizarCelula('abastecimentos', { id: 1 });
    expect(td.textContent).toBe('-');
    expect(td.querySelector('img')).toBeNull();
  });
});

describe('frotasApi — reduzirFoto e enviarFotoFrota', () => {
  test('foto pequena em jpeg/png/webp: vai como esta (nem tenta reduzir)', async () => {
    const f = foto('a.png', 'image/png', 1000);
    const criar = jest.spyOn(document, 'createElement');
    try {
      expect(await reduzirFoto(f)).toBe(f);
      expect(criar).not.toHaveBeenCalledWith('canvas');
    } finally {
      criar.mockRestore();
    }
  });

  test('acima de 1 MB ou HEIC, sem canvas no navegador (jsdom): devolve a original', async () => {
    const grande = foto('grande.jpg', 'image/jpeg', 1024 * 1024 + 1);
    const heic = foto('iphone.heic', 'image/heic', 100);
    const getContext = jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    try {
      expect(await reduzirFoto(grande)).toBe(grande);
      expect(await reduzirFoto(heic)).toBe(heic);
      expect(getContext).toHaveBeenCalledTimes(2); // tentou reduzir as duas
    } finally {
      getContext.mockRestore();
    }
  });

  test('com canvas: reconverte para JPEG 0,8 com o lado maior em 1600 px', async () => {
    const grande = foto('grande.png', 'image/png', 1024 * 1024 + 1);
    const ctx = { drawImage: jest.fn() };
    const getContext = jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);
    let argsToBlob;
    const toBlob = jest.spyOn(window.HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function fake(cb, ...resto) {
      argsToBlob = { largura: this.width, altura: this.height, resto };
      cb(new Blob([new Uint8Array(5)], { type: 'image/jpeg' }));
    });
    const close = jest.fn();
    global.createImageBitmap = jest.fn(() => Promise.resolve({ width: 4000, height: 3000, close }));
    try {
      const r = await reduzirFoto(grande);
      expect(r).not.toBe(grande);
      expect(r.type).toBe('image/jpeg');
      expect(r.name).toBe('grande.jpg');
      expect(argsToBlob).toEqual({ largura: 1600, altura: 1200, resto: ['image/jpeg', 0.8] });
      expect(close).toHaveBeenCalled();
    } finally {
      delete global.createImageBitmap;
      getContext.mockRestore();
      toBlob.mockRestore();
    }
  });

  test('decodificacao falha (formato que o navegador nao le): devolve a original', async () => {
    const heic = foto('iphone.heic', 'image/heic', 100);
    const getContext = jest.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: jest.fn() });
    const toBlob = jest.spyOn(window.HTMLCanvasElement.prototype, 'toBlob').mockImplementation(() => {});
    global.createImageBitmap = jest.fn(() => Promise.reject(new Error('InvalidStateError')));
    try {
      expect(await reduzirFoto(heic)).toBe(heic);
    } finally {
      delete global.createImageBitmap;
      getContext.mockRestore();
      toBlob.mockRestore();
    }
  });

  test('enviarFotoFrota: multipart no contrato, timeout de 120 s, devolve o corpo do 201', async () => {
    const corpo = { id: 3, entidade: 'registro', entidade_id: 41, url: URL_A(3), tipo_mime: 'image/jpeg', tamanho: 10, created_at: 'x' };
    api.post.mockResolvedValue({ data: corpo });
    const f = foto('a.jpg');
    const r = await enviarFotoFrota('registro', 41, f);
    expect(r).toBe(corpo);
    const [url, fd, opcoes] = api.post.mock.calls[0];
    expect(url).toBe('/frotas/anexos');
    expect(fd.get('entidade')).toBe('registro');
    expect(fd.get('entidade_id')).toBe('41');
    expect(fd.get('foto').name).toBe('a.jpg');
    expect(opcoes).toEqual({ timeout: 120000 });
  });
});
