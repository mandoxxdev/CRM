/**
 * Rota → módulo (Etapa 111, G17, RN-111.07).
 *
 * Até a 110 o mesmo mapa (11 `startsWith` escritos à mão) existia em `ProtectedModuleRoute.getModuloFromPath`,
 * `lazyModules.prefetchModuleByRoute` e `Layout.getActiveModuleFromPath` (este com `crm` no lugar de comercial).
 * A tabela abaixo foi escrita ANTES de os três passarem a ler `moduloDaRota` (derivado de `MODULOS_META.rota`)
 * e era verde nos três no código antigo — inclusive nos casos sem fronteira (`/frotas`, `/administrativo`), que
 * continuam como eram.
 *
 * Executar: cd client && CI=true npx react-scripts test src/constants/moduloDaRota --watchAll=false
 */
import * as meta from './modulosMeta';
import { getModuloFromPath } from '../components/ProtectedModuleRoute';
import { MODULE_PREFETCH, ROUTE_PREFETCH, prefetchModuleByRoute } from '../routes/lazyModules';

export const TABELA_ROTAS = [
  ['/comercial', 'comercial'],
  ['/comercial/clientes', 'comercial'],
  ['/frota', 'frota'],
  ['/frota/veiculos', 'frota'],
  ['/frotas', 'frota'],
  ['/todolist', 'todolist'],
  ['/compras', 'compras'],
  ['/compras/pedidos?aba=2', 'compras'],
  ['/financeiro', 'financeiro'],
  ['/fabrica/ordens-servico', 'operacional'],
  ['/configuracoes', 'administrativo'],
  ['/configuracoes/almoxarifado', 'administrativo'],
  ['/admin', 'admin'],
  ['/admin/usuarios', 'admin'],
  ['/administrativo', 'admin'],
  ['/engenharia-projetos', 'engenharia_projetos'],
  ['/engenharia-projetos/os', 'engenharia_projetos'],
  ['/engenharia', 'engenharia'],
  ['/engenharia/tampo', 'engenharia'],
  ['/engenhariaX', 'engenharia'],
  ['/almoxarifado/requisicoes', 'almoxarifado'],
  ['/chat', null],
  ['/', null],
  ['/minha-conta', null],
  ['', null],
];

test('RN-111.07 ProtectedModuleRoute.getModuloFromPath: a tabela de sempre', () => {
  const visto = TABELA_ROTAS.map(([p]) => [p, getModuloFromPath(p)]);
  expect(visto).toEqual(TABELA_ROTAS);
});

describe('RN-111.07 lazyModules.prefetchModuleByRoute: o chunk do módulo de sempre', () => {
  const originais = {};
  beforeEach(() => {
    for (const obj of [MODULE_PREFETCH, ROUTE_PREFETCH]) {
      for (const k of Object.keys(obj)) {
        originais[k] = originais[k] || obj[k];
        obj[k] = jest.fn(() => Promise.resolve());
      }
    }
  });
  test('cada rota da tabela aquece o módulo da tabela (e nenhum outro)', () => {
    const visto = TABELA_ROTAS.map(([p]) => {
      Object.values(MODULE_PREFETCH).forEach((f) => f.mockClear());
      prefetchModuleByRoute(p);
      const chamados = Object.keys(MODULE_PREFETCH).filter((k) => MODULE_PREFETCH[k].mock.calls.length > 0);
      return [p, chamados.length ? chamados.join(',') : null];
    });
    // `?aba=2` é cortado antes; '' não chega a procurar (retorna cedo) — os dois como antes.
    expect(visto).toEqual(TABELA_ROTAS);
  });
});

test('RN-111.07 moduloDaRota: a mesma tabela, derivada de MODULOS_META.rota', () => {
  expect(typeof meta.moduloDaRota).toBe('function');
  const visto = TABELA_ROTAS.map(([p]) => [p, meta.moduloDaRota(p)]);
  expect(visto).toEqual(TABELA_ROTAS);
});
