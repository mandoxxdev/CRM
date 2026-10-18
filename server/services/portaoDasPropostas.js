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
 */
const { bypassModuleRestrictions } = require('./systemPermissions');
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

function criarPortaoDasPropostas({ getDb, registrar, desligado }) {
  function exigir(modulos) {
    const mods = Array.isArray(modulos) ? modulos.slice() : [modulos];
    return (req, res, next) => {
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
        registrar(req, mods.join('|'));
        return res.status(403).json({ error: 'Acesso negado ao módulo', modulo: mods.length === 1 ? mods[0] : mods });
      });
    };
  }
  return { exigir };
}

module.exports = { criarPortaoDasPropostas, temModuloComoATela, SQL_LINHAS_DA_TELA };
