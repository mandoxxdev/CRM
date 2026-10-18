/**
 * Etapa 145 (C317, RN-145.04) — o portao das propostas do servidor usa a regua do portao de rota da TELA. A mesma tabela de casos
 * (server/tests/fixtures/portaoComoATela.casos.json) roda aqui contra o `hasModuleAccess` e no servidor contra `temModuloComoATela`
 * (server/tests/api/propostaPortaoModulo.api.test.js). Se a regua da tela mudar sem a do servidor (ou o contrario), um dos dois cai.
 *
 * Executar: cd client && CI=true npx react-scripts test src/services/permissionsCache.portaoComoATela --watchAll=false
 */
import { hasModuleAccess } from './permissionsCache';

jest.mock('./api', () => ({ __esModule: true, default: { get: jest.fn() } }));

const fs = require('fs');
const path = require('path');

const ARQ = path.join(__dirname, '..', '..', '..', 'server', 'tests', 'fixtures', 'portaoComoATela.casos.json');
const { casos } = JSON.parse(fs.readFileSync(ARQ, 'utf8'));

test('[RN-145.04] a tabela compartilhada existe e tem casos dos dois lados (entra e nao entra)', () => {
  expect(casos.length).toBeGreaterThanOrEqual(10);
  expect(casos.some((c) => c.espera === true)).toBe(true);
  expect(casos.some((c) => c.espera === false)).toBe(true);
});

test.each(casos.map((c) => [c.nome, c]))('[RN-145.04] tela: %s', (_nome, c) => {
  // varios modulos = basta um (o GET /api/propostas/:id aceita Comercial ou Operacional)
  const entra = c.modulos.some((m) => hasModuleAccess(c.linhas, m, c.user));
  expect(entra).toBe(c.espera);
});
