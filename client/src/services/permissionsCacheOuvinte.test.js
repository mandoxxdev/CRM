/**
 * Etapa 128 (T5, RN-21) — o ouvinte do cache de permissoes: `onPermissoesGravadas(fn)` e chamado quando uma busca REAL de
 * `/usuarios/:id/grupos` grava o cache, e so entao. E o que deixa o `AuthProvider` regravar o usuario do contexto (o perfil que
 * nao pisca, D (127) r2). So a fronteira HTTP e mockada.
 *
 * Executar: cd client && CI=true npx react-scripts test src/services/permissionsCacheOuvinte --watchAll=false
 */
import api from './api';
import {
  fetchUserPermissions, invalidatePermissionsCache, onPermissoesGravadas, seedPermissionsFromAuthUser,
} from './permissionsCache';

jest.mock('./api', () => ({ __esModule: true, default: { get: jest.fn() } }));

const USUARIO = { role: 'user', is_superadmin: false, admin_modulos: [], perfil_almoxarifado: null, perfil_frota: null };
const resposta = (usuario = USUARIO) => ({ data: { grupos: [], permissoes: [], usuario } });

let cancelar;
let chamadas;
beforeEach(() => {
  jest.clearAllMocks();
  invalidatePermissionsCache();
  chamadas = [];
  cancelar = onPermissoesGravadas((userId, data) => chamadas.push([userId, data]));
});
afterEach(() => { if (cancelar) cancelar(); invalidatePermissionsCache(); });

test('[RN-21] a busca real que grava o cache chama o ouvinte com (userId, data)', async () => {
  api.get.mockResolvedValue(resposta());
  const data = await fetchUserPermissions(7);
  expect(api.get).toHaveBeenCalledWith('/usuarios/7/grupos');
  expect(chamadas).toHaveLength(1);
  expect(chamadas[0][0]).toBe(7);
  expect(chamadas[0][1]).toBe(data);
  expect(chamadas[0][1].usuario).toEqual(USUARIO);
});

test('[RN-21] a leitura do cache valido nao chama de novo (metade positiva: a primeira chamou)', async () => {
  api.get.mockResolvedValue(resposta());
  await fetchUserPermissions(7);
  await fetchUserPermissions(7);
  expect(api.get).toHaveBeenCalledTimes(1);
  expect(chamadas).toHaveLength(1);
});

test('[RN-21] o seed (do usuario logado, sem ida ao servidor) nao chama', async () => {
  seedPermissionsFromAuthUser({ id: 3, role: 'admin', is_superadmin: 1 });
  const data = await fetchUserPermissions(3); // o cache semeado responde
  expect(api.get).not.toHaveBeenCalled();
  expect(data.usuario).toBeTruthy(); // metade positiva: o seed gravou
  expect(chamadas).toHaveLength(0);
});

test('[RN-21] a busca de geracao velha (invalidada no meio) nao chama; a seguinte chama', async () => {
  let soltar;
  api.get.mockImplementation(() => new Promise((resolve) => { soltar = () => resolve(resposta()); }));
  const emVoo = fetchUserPermissions(7);
  invalidatePermissionsCache(7);
  soltar();
  await emVoo;
  expect(chamadas).toHaveLength(0);
  api.get.mockResolvedValue(resposta());
  await fetchUserPermissions(7);
  expect(chamadas).toHaveLength(1);
});

test('[RN-21] (Fase 5 r3) o ouvinte recebe o MESMO objeto que a busca devolve, inclusive o substituto do corpo vazio', async () => {
  api.get.mockResolvedValue({});
  const data = await fetchUserPermissions(5);
  expect(chamadas).toHaveLength(1);
  expect(chamadas[0][1]).toBe(data);
  expect(chamadas[0][1]).toEqual({ permissoes: [], grupos: [], usuario: null });
});

test('[RN-21] a busca que falha nao chama', async () => {
  api.get.mockRejectedValue(new Error('rede'));
  await expect(fetchUserPermissions(7)).rejects.toThrow('rede');
  expect(chamadas).toHaveLength(0);
});

test('[RN-21] cancelado, o ouvinte nao e mais chamado; outro ouvinte continua; um ouvinte que lanca nao derruba a busca', async () => {
  const outros = [];
  const cancelarOutro = onPermissoesGravadas((id) => outros.push(id));
  const cancelarRuim = onPermissoesGravadas(() => { throw new Error('ouvinte quebrado'); });
  cancelar();
  cancelar = null;
  api.get.mockResolvedValue(resposta());
  const data = await fetchUserPermissions(8);
  expect(data.usuario).toEqual(USUARIO);
  expect(chamadas).toHaveLength(0);
  expect(outros).toEqual([8]);
  cancelarOutro();
  cancelarRuim();
});
