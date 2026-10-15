/**
 * Portão de rota do cliente — "sem nenhuma linha de permissão" (Etapa 111, G17, RN-111.08).
 *
 * Escrito ANTES de `hasModuleAccess` passar a ler `MODULOS_LIBERADOS_SEM_PERMISSAO_PORTAO` de
 * `constants/modulosMeta.js`, verde no código antigo: sem linha nenhuma o portão libera Comercial **e Frota**
 * (a seleção libera só Comercial; o servidor, Comercial só sem grupo ativo). A divergência fica CONGELADA —
 * alinhar muda quem acessa o quê, decisão do P.O. (B63 de docs/compras-novidades-por-etapa.md).
 *
 * Executar: cd client && CI=true npx react-scripts test src/services/permissionsCache.semLinha --watchAll=false
 */
import { hasModuleAccess } from './permissionsCache';

jest.mock('./api', () => ({ __esModule: true, default: { get: jest.fn() } }));

const ONZE = ['comercial', 'compras', 'financeiro', 'operacional', 'engenharia', 'engenharia_projetos',
  'almoxarifado', 'frota', 'todolist', 'administrativo', 'admin'];
const COMUM = { id: 7, role: 'usuario' };
const liberados = (permissoes) => ONZE.filter((m) => hasModuleAccess(permissoes, m, COMUM));

test('RN-111.08 sem nenhuma linha (lista vazia, null ou undefined): Comercial e Frota — e Admin não', () => {
  expect(liberados([])).toEqual(['comercial', 'frota']);
  expect(liberados(null)).toEqual(['comercial', 'frota']);
  expect(liberados(undefined)).toEqual(['comercial', 'frota']);
});

test('RN-111.08 com qualquer linha, só o que a linha concede (Comercial e Frota deixam de vir de graça)', () => {
  expect(liberados([{ modulo: 'compras', permissao: 1 }])).toEqual(['compras']);
  expect(liberados([{ modulo: 'compras', permissao: 0 }])).toEqual([]);
  expect(liberados([{ modulo: 'admin', permissao: 1 }])).toEqual(['admin']);
});

test('RN-111.08 admin do sistema passa sempre (não chega à regra do "sem linha")', () => {
  expect(ONZE.filter((m) => hasModuleAccess([], m, { id: 1, role: 'admin' }))).toEqual(ONZE);
});
