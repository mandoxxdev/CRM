/**
 * Etapa 145 (C317, RN-145.01 a 04) — o portao das rotas `/api/propostas*`: a API passa a concordar com a TELA.
 *
 * Ate a 144 as 49 rotas de proposta so exigiam login: quem a tela barra do Comercial gerava proposta e gravava no preview pela API.
 * A regua aqui NAO e a do `checkModulePermission` (services/portaoDeModulo.js): aquela libera o Comercial a todo usuario sem grupo
 * ativo (B63) — no banco medido (0 grupos) nao mudaria nada, e os usuarios com permissoes diretas de outros modulos continuariam
 * gerando proposta. E a do portao de rota do client (`hasModuleAccess`, client/src/services/permissionsCache.js), sobre as MESMAS
 * linhas que a tela le (`GET /api/usuarios/:id/grupos`, services/leituraDeUsuarios.js): as dos grupos ATIVOS + as diretas com
 * `grupo_id IS NULL`. Quem abre o Comercial na tela passa; quem a tela barra, a API barra (B944).
 *
 * A tabela de casos `tests/fixtures/portaoComoATela.casos.json` roda contra `temModuloComoATela` (servidor) e contra o
 * `hasModuleAccess` (client) — se uma das duas mudar sozinha, um dos testes cai (RN-145.04).
 *
 * `desligado` (PROPOSTAS_PORTAO_DE_MODULO=desligado no ambiente — RN-145.03, B946): o portao passa todos, o de antes da etapa.
 *
 * Etapa 147 (C319, RN-147.01, B958): `exigir(modulos, { tambemAdminDoModuloCom: { admin, tela } })` — quando a tela abre a mesma coisa
 * por um segundo caminho. O modelo da proposta (ConfigTemplateProposta) abre em /comercial E embutido em /configuracoes (aba Comercial ->
 * Template de proposta), que exige o modulo `tela` (Administrativo) pela regua da tela e `canConfigureModule(user, admin)` — o
 * administrador do modulo `admin` (Comercial) em `admin_modulos`. Sem isto o portao trancaria fora quem a tela deixa editar o modelo.
 */
const { bypassModuleRestrictions, isModuleAdmin } = require('./systemPermissions');
const { MODULOS_LIBERADOS_SEM_LINHA_NA_TELA } = require('./modulosSistema');
const { isSqliteBusy, respondDbError } = require('./sqliteConcurrency');

// As linhas que a tela le, com as mesmas condicoes das duas consultas do GET /api/usuarios/:id/grupos: grupo ATIVO (o LEFT JOIN de la
// so aproveita a linha com permissao — aqui INNER JOIN, o mesmo conjunto) e a direta com grupo_id IS NULL (a de grupo_id = 0 nao conta).
const SQL_LINHAS_DA_TELA = `
  SELECT p.modulo, p.permissao FROM grupos_permissoes gp
    INNER JOIN usuarios_grupos ug ON gp.id = ug.grupo_id
    INNER JOIN permissoes p ON p.grupo_id = gp.id
   WHERE ug.usuario_id = ? AND gp.ativo = 1
  UNION ALL
  SELECT p.modulo, p.permissao FROM permissoes p WHERE p.usuario_id = ? AND p.grupo_id IS NULL`;

/**
 * A decisao da tela (hasModuleAccess), para um ou mais modulos (basta um): super ou role admin entra; com alguma linha, entra so com a
 * linha do modulo e `permissao === 1`; sem linha nenhuma, entra nos MODULOS_LIBERADOS_SEM_LINHA_NA_TELA (B63).
 */
function temModuloComoATela(user, linhas, modulos) {
  if (bypassModuleRestrictions(user)) return true;
  const mods = Array.isArray(modulos) ? modulos : [modulos];
  const lista = Array.isArray(linhas) ? linhas : [];
  if (lista.length > 0) {
    return lista.some((l) => l && mods.includes(l.modulo) && l.permissao === 1);
  }
  return mods.some((m) => MODULOS_LIBERADOS_SEM_LINHA_NA_TELA.includes(m));
}

/**
 * Etapa 147 (RN-147.01): o segundo caminho da tela — o modulo `caminho.tela` pela regua da tela E administrador do modulo `caminho.admin`
 * (`admin_modulos`, o `canConfigureModule` do client sem o super/role admin, que nem chegam aqui). Sem `caminho`, ninguem passa por ele.
 */
function passaPeloCaminhoDeConfiguracoes(user, linhas, caminho) {
  if (!caminho || !caminho.admin || !caminho.tela) return false;
  return isModuleAdmin(user, caminho.admin) && temModuloComoATela(user, linhas, [caminho.tela]);
}

function criarPortaoDasPropostas({ getDb, registrar, desligado }) {
  function exigir(modulos, opcoes = {}) {
    const mods = Array.isArray(modulos) ? modulos.slice() : [modulos];
    const caminho = opcoes.tambemAdminDoModuloCom || null;
    // Etapa 152 (Fase 5 r3 A1): o portao leva os modulos na funcao — o teste le as camadas do Express de verdade
    // (tests/helpers/despejaCamadasDoExpress.js) e reconhece o portao de cada rota por eles. Nao muda a decisao.
    const portao = (req, res, next) => {
      if (desligado) return next();
      if (bypassModuleRestrictions(req.user)) return next();
      getDb().all(SQL_LINHAS_DA_TELA, [req.user.id, req.user.id], (err, linhas) => {
        if (err) {
          // Fase 2 I-2: o BUSY vira 503 (o client repete); o salvar() do preview faz quatro chamadas em sequencia.
          if (isSqliteBusy(err)) return respondDbError(res, err, 'portao:propostas');
          console.error('Erro ao verificar permissões (portão das propostas):', err);
          return res.status(500).json({ error: 'Erro ao verificar permissões' });
        }
        if (temModuloComoATela(req.user, linhas, mods)) return next();
        if (passaPeloCaminhoDeConfiguracoes(req.user, linhas, caminho)) return next();
        registrar(req, mods.join('|'));
        return res.status(403).json({ error: 'Acesso negado ao módulo', modulo: mods.length === 1 ? mods[0] : mods });
      });
    };
    portao.modulosDoPortao = mods.slice();
    portao.caminhoDoPortao = caminho;
    return portao;
  }

  /**
   * Etapa 153 (C352/C355, RN-153.02, B992) — o filtro POR TIPO de uma leitura que junta registros de varios modulos (a busca global).
   * Nao barra a rota: pendura em `req.tiposPermitidos` o conjunto dos tipos cujo modulo a regua da tela aceita (`null` = todos, sem ler
   * as linhas: desligado, super ou role admin). Quem nao tem tipo nenhum recebe o que o handler devolve para o conjunto vazio — sem log de
   * acesso negado (a busca dispara a cada tecla). BUSY ao ler as linhas -> 503 com o `contexto`; outro erro -> 500.
   * `tiposPorModulo`: { tipo: [modulos] } — basta um dos modulos.
   */
  function filtrarPorModulo(tiposPorModulo, { contexto = 'portao:filtro' } = {}) {
    const mapa = {};
    for (const [tipo, modulos] of Object.entries(tiposPorModulo)) mapa[tipo] = [].concat(modulos);
    const filtro = (req, res, next) => {
      if (desligado || bypassModuleRestrictions(req.user)) { req.tiposPermitidos = null; return next(); }
      getDb().all(SQL_LINHAS_DA_TELA, [req.user.id, req.user.id], (err, linhas) => {
        if (err) {
          if (isSqliteBusy(err)) return respondDbError(res, err, contexto);
          console.error('Erro ao verificar permissões (filtro por módulo):', err);
          return res.status(500).json({ error: 'Erro ao verificar permissões' });
        }
        req.tiposPermitidos = new Set(Object.keys(mapa).filter((tipo) => temModuloComoATela(req.user, linhas, mapa[tipo])));
        return next();
      });
    };
    filtro.tiposDoFiltro = mapa;
    return filtro;
  }
  return { exigir, filtrarPorModulo };
}

module.exports = { criarPortaoDasPropostas, temModuloComoATela, passaPeloCaminhoDeConfiguracoes, SQL_LINHAS_DA_TELA };
