/**
 * Frota Etapa 2 (T3) — tela "Perfis de acesso" (/frota/perfis): quem ve o painel (Consulta) e quem registra no portal (Motorista).
 *
 * So a fronteira HTTP (`api`) e mockada; o contrato e o do plano docs/superpowers/plans/2026-10-23-frotas-etapa2-perfis-pela-tela.md
 * (RN-F2.01/03/04/07/09/10/14, "Textos de tela (literais)" e "Contrato depois da Fase 2"). Os textos conferidos aqui sao os literais
 * do plano: mudar um deles e mudar o combinado.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/frotas/FrotasPerfisAcesso --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import FrotasPerfisAcesso from './FrotasPerfisAcesso';
import api from '../../services/api';
import { toast } from 'react-toastify';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));

const AVISO_LIGADO = 'Ligado ao motorista Jose da Silva: como Consulta, não registra no portal.';
const AVISO_VIAGEM = 'Tem saída sem retorno: como Consulta, não consegue registrar o retorno. Feche a viagem em Frota → Viagens ou '
  + 'volte o perfil para Motorista.';
const TEXTO_FORCADO = 'Para dar outro perfil, remova a condição de administrador no cadastro de usuário.';

const u = (over) => ({
  email: '', perfil_explicito: null, perfil_efetivo: 'MOTORISTA', origem: 'padrao', motorista: null, viagem_aberta: false, ...over,
});
const USUARIOS = [
  u({ id: 1, nome: 'Admin Geral', email: 'admin@x.com', perfil_explicito: 'ADMIN_FROTA', perfil_efetivo: 'ADMIN_FROTA', origem: 'forcado' }),
  u({ id: 2, nome: 'Ana Padrao', email: 'ana@x.com' }),
  u({ id: 3, nome: 'Carla Consulta', email: 'carla@x.com', perfil_explicito: 'CONSULTA', perfil_efetivo: 'CONSULTA', origem: 'explicito' }),
  u({ id: 4, nome: 'Jose Ligado', email: 'jose@x.com', perfil_explicito: 'CONSULTA', perfil_efetivo: 'CONSULTA', origem: 'explicito',
    motorista: { id: 9, nome: 'Jose da Silva' }, viagem_aberta: true }),
  u({ id: 5, nome: 'Mario Explicito', perfil_explicito: 'MOTORISTA', origem: 'explicito', motorista: { id: 8, nome: 'Mario M' } }),
  u({ id: 6, nome: 'Helena Sobra', perfil_explicito: 'ADMIN_FROTA', perfil_efetivo: 'ADMIN_FROTA', origem: 'explicito' }),
  u({ id: 12, nome: 'Torto Minusculo', perfil_explicito: 'consulta', perfil_efetivo: 'consulta', origem: 'explicito' }),
];

let container; let root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  api.get.mockImplementation((url) => {
    if (url === '/frotas/perfis-usuario') return Promise.resolve({ data: { perfis: ['CONSULTA', 'MOTORISTA'], usuarios: USUARIOS } });
    return Promise.reject(new Error(`url inesperada ${url}`));
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

async function render() {
  await act(async () => { root.render(<MemoryRouter><FrotasPerfisAcesso /></MemoryRouter>); });
  await act(async () => {});
}
const linha = (nome) => [...container.querySelectorAll('tbody tr')].find((tr) => tr.textContent.includes(nome));
const seletor = (nome) => linha(nome).querySelector('select');
async function escolher(select, valor) {
  await act(async () => {
    select.value = valor;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await act(async () => {});
}
async function digitar(input, texto) {
  const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  await act(async () => {
    setValue.call(input, texto);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('Perfis de acesso — a pagina', () => {
  test('titulo, subtitulo, breadcrumb, textos de ajuda e cabecalho da tabela', async () => {
    await render();
    expect(api.get).toHaveBeenCalledWith('/frotas/perfis-usuario');
    expect(container.querySelector('h1').textContent).toBe('Perfis de acesso');
    expect(container.textContent).toContain('Quem vê o painel e quem registra no portal');
    expect(container.querySelector('.frotas-breadcrumb-current').textContent).toBe('Perfis de acesso');
    expect(container.textContent).toContain('Ter acesso ao módulo Frota (no cadastro de usuário) permite abrir as telas; o perfil abaixo '
      + 'diz o que a pessoa faz dentro delas.');
    expect(container.textContent).toContain('Quem não tem perfil definido entra como Motorista.');
    const ths = [...container.querySelectorAll('thead th')].map((th) => th.textContent);
    expect(ths).toEqual(['Usuário', 'Perfil no Frota', 'O que isso permite', 'Motorista ligado']);
    // celular: a tabela rola dentro do wrap, nao a pagina
    expect(container.querySelector('.frotas-table-wrap table.frotas-table')).not.toBeNull();
    expect(container.querySelectorAll('tbody tr')).toHaveLength(USUARIOS.length);
  });

  test('descricao do que o perfil permite e a coluna Motorista ligado', async () => {
    await render();
    expect(linha('Ana Padrao').textContent).toContain('Registra saída, retorno, inspeção e abastecimento no portal; vê só o que é dele.');
    expect(linha('Carla Consulta').textContent).toContain('Vê o painel, os alertas, as listas e os relatórios, e exporta a planilha. '
      + 'Não registra nem altera nada.');
    expect(linha('Admin Geral').textContent).toContain('Faz tudo no módulo, inclusive dar perfis.');
    expect(linha('Ana Padrao').lastElementChild.textContent).toBe('—');
    expect(linha('Jose Ligado').lastElementChild.textContent).toBe('Jose da Silva');
  });

  test('forcado: etiqueta Administrador, o texto literal e NENHUM seletor (metade positiva: a Ana tem seletor)', async () => {
    await render();
    const admin = linha('Admin Geral');
    expect(admin.textContent).toContain('Administrador');
    expect(admin.textContent).toContain(TEXTO_FORCADO);
    expect(admin.querySelector('select')).toBeNull();
    expect(seletor('Ana Padrao')).not.toBeNull();
    expect(linha('Ana Padrao').textContent).not.toContain(TEXTO_FORCADO);
  });

  test('seletor (B29): so "Motorista (padrao)" e "Consulta"; MOTORISTA explicito aparece como o padrao', async () => {
    await render();
    const opcoes = (s) => [...s.options].map((o) => [o.value, o.textContent]);
    expect(opcoes(seletor('Ana Padrao'))).toEqual([['', 'Motorista (padrão)'], ['CONSULTA', 'Consulta']]);
    expect(seletor('Ana Padrao').value).toBe('');
    expect(seletor('Carla Consulta').value).toBe('CONSULTA');
    expect(seletor('Mario Explicito').value).toBe('');
    expect(opcoes(seletor('Mario Explicito'))).toHaveLength(2);
  });

  test('valor fora da lista: opcao extra "(valor invalido — escolha outro)"; ADMIN_FROTA nao forcado: "gravado a parte"', async () => {
    await render();
    const torto = seletor('Torto Minusculo');
    expect(torto.value).toBe('consulta');
    expect([...torto.options].map((o) => o.textContent)).toEqual(
      ['Motorista (padrão)', 'Consulta', 'consulta (valor inválido — escolha outro)']
    );
    const sobra = seletor('Helena Sobra');
    expect(sobra.value).toBe('ADMIN_FROTA');
    expect([...sobra.options].map((o) => o.textContent)).toEqual(
      ['Motorista (padrão)', 'Consulta', 'Administrador de Frota (gravado à parte)']
    );
  });

  test('avisos na linha: CONSULTA com motorista ligado e, com viagem aberta, o da saida sem retorno', async () => {
    await render();
    const jose = linha('Jose Ligado');
    expect(jose.textContent).toContain(AVISO_LIGADO);
    expect(jose.textContent).toContain(AVISO_VIAGEM);
    // CONSULTA sem motorista: sem aviso; MOTORISTA com motorista: sem aviso
    expect(linha('Carla Consulta').textContent).not.toContain('como Consulta');
    expect(linha('Mario Explicito').textContent).not.toContain('como Consulta');
  });

  test('busca por nome e por e-mail', async () => {
    await render();
    const busca = container.querySelector('.frotas-search input');
    await digitar(busca, 'carla');
    expect([...container.querySelectorAll('tbody tr')].map((tr) => tr.firstElementChild.textContent))
      .toEqual([expect.stringContaining('Carla Consulta')]);
    await digitar(busca, 'JOSE@X');
    expect(container.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(linha('Jose Ligado')).toBeTruthy();
    await digitar(busca, '');
    expect(container.querySelectorAll('tbody tr')).toHaveLength(USUARIOS.length);
  });
});

describe('Perfis de acesso — gravar', () => {
  test('Consulta: PUT com CONSULTA, toast "Perfil definido: Consulta" e a linha passa a mostrar o novo perfil', async () => {
    api.put.mockResolvedValue({ data: { usuario_id: 2, perfil_explicito: 'CONSULTA', perfil_efetivo: 'CONSULTA', origem: 'explicito' } });
    await render();
    await escolher(seletor('Ana Padrao'), 'CONSULTA');
    expect(api.put).toHaveBeenCalledWith('/frotas/perfis-usuario/2', { perfil: 'CONSULTA' });
    expect(toast.success).toHaveBeenCalledWith('Perfil definido: Consulta');
    expect(seletor('Ana Padrao').value).toBe('CONSULTA');
    expect(linha('Ana Padrao').textContent).toContain('Não registra nem altera nada.');
  });

  test('Motorista (padrao): PUT com perfil null e o toast de removido', async () => {
    api.put.mockResolvedValue({ data: { usuario_id: 3, perfil_explicito: null, perfil_efetivo: 'MOTORISTA', origem: 'padrao' } });
    await render();
    await escolher(seletor('Carla Consulta'), '');
    expect(api.put).toHaveBeenCalledWith('/frotas/perfis-usuario/3', { perfil: null });
    expect(toast.success).toHaveBeenCalledWith('Perfil removido — o usuário volta ao padrão (Motorista)');
    expect(seletor('Carla Consulta').value).toBe('');
  });

  test('o valor invalido e corrigido pelo seletor (PUT null) e a opcao extra some', async () => {
    api.put.mockResolvedValue({ data: { usuario_id: 12, perfil_explicito: null, perfil_efetivo: 'MOTORISTA', origem: 'padrao' } });
    await render();
    await escolher(seletor('Torto Minusculo'), '');
    expect(api.put).toHaveBeenCalledWith('/frotas/perfis-usuario/12', { perfil: null });
    expect(seletor('Torto Minusculo').options).toHaveLength(2);
  });

  test('erro do servidor: toast com o `error` e a linha fica como estava', async () => {
    const msg = 'Você não pode mudar o seu próprio perfil por esta tela.';
    api.put.mockRejectedValue({ response: { status: 409, data: { error: msg, code: 'PROPRIO_PERFIL' } } });
    await render();
    await escolher(seletor('Helena Sobra'), 'CONSULTA');
    expect(toast.error).toHaveBeenCalledWith(msg);
    expect(toast.success).not.toHaveBeenCalled();
    expect(seletor('Helena Sobra').value).toBe('ADMIN_FROTA');
  });
});

describe('Perfis de acesso — quem nao e ADMIN_FROTA', () => {
  test('GET 403: mostra o `error` do servidor no lugar da tabela', async () => {
    api.get.mockRejectedValue({ response: { status: 403, data: { error: 'Sem permissão para esta operação', acao: 'configurar' } } });
    await render();
    expect(container.textContent).toContain('Sem permissão para esta operação');
    expect(container.querySelector('table')).toBeNull();
    expect(container.querySelector('select')).toBeNull();
  });
});
