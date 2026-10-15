/**
 * Etapa 100 (G10, RN-100.06c) — o par família/subfamília do material criado pelos atalhos de Sobras
 * e Remessas a partir de um material de origem.
 */
import { familiaDoNovoMaterial } from './familiaDoNovoMaterial';

const FAMILIAS = [
  { id: 5, parent_id: null, ativo: 1 },
  { id: 6, parent_id: 5, ativo: 1 },
  { id: 9, parent_id: 5, ativo: 0 },
];
const apiCom = (get) => ({ get: jest.fn(get) });

test('origem LEGADA (sub ativa no familia_id) → familia_id da principal e subfamilia_id da sub; lista pedida com ativo=all', async () => {
  const api = apiCom(() => Promise.resolve({ data: FAMILIAS }));
  await expect(familiaDoNovoMaterial(api, 6)).resolves.toEqual({ familia_id: 5, subfamilia_id: 6 });
  expect(api.get).toHaveBeenCalledWith('/almoxarifado/familias', { params: { ativo: 'all' } });
});

test('origem legada com sub INATIVA → só a principal (o servidor recusaria a sub inativa)', async () => {
  const api = apiCom(() => Promise.resolve({ data: FAMILIAS }));
  await expect(familiaDoNovoMaterial(api, 9)).resolves.toEqual({ familia_id: 5 });
});

test('[não-regressão] origem no padrão (raiz) → o mesmo familia_id, sem subfamilia_id', async () => {
  const api = apiCom(() => Promise.resolve({ data: FAMILIAS }));
  await expect(familiaDoNovoMaterial(api, '5')).resolves.toEqual({ familia_id: 5 });
});

test('lista que falhou → o valor da origem como está (o servidor decide)', async () => {
  const api = apiCom(() => Promise.reject(new Error('rede')));
  await expect(familiaDoNovoMaterial(api, 6)).resolves.toEqual({ familia_id: 6 });
});
