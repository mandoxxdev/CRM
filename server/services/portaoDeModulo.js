/**
 * Etapa 111 (G17, revisao da Fase 5) — os dois portoes de modulo do servidor (`checkModulePermission`,
 * `checkAnyModulePermission`), movidos do index.js SEM mudar o corpo, para serem executados em teste com banco de
 * verdade (`tests/api/portaoDeModulo.api.test.js`). Antes nenhum teste rodava estes portoes (o harness `testApp`
 * usa um falso), entao a regra do "sem grupo" (MODULOS_LIBERADOS_SEM_GRUPO, B63) e o registro no log nao tinham
 * prova de comportamento.
 *
 * Unicas diferencas textuais: `db` vira `getDb()` (o index.js atribui o `db` depois, no callback de abertura) e
 * `registrarTentativaAcessoNegado` chega por parametro (`registrar`).
 */
const { bypassModuleRestrictions } = require('./systemPermissions');
const { MODULOS_LIBERADOS_SEM_GRUPO } = require('./modulosSistema');

function criarPortoesDeModulo({ getDb, registrar }) {
  // Middleware para verificar permissões de módulo (considera grupo E permissões diretas do usuário)
  function checkModulePermission(requiredModule) {
    return (req, res, next) => {
      if (bypassModuleRestrictions(req.user)) {
        return next();
      }

      const userId = req.user.id;

      // 1) Verificar permissão direta do usuário (usuario_id preenchido, grupo_id NULL)
      getDb().get(
        `SELECT 1 FROM permissoes
         WHERE usuario_id = ? AND (grupo_id IS NULL OR grupo_id = 0)
         AND modulo = ? AND permissao = 1 LIMIT 1`,
        [userId, requiredModule],
        (err, directRow) => {
          if (err) {
            console.error('Erro ao verificar permissão direta:', err);
            return res.status(500).json({ error: 'Erro ao verificar permissões' });
          }
          if (directRow) {
            return next();
          }

          // 2) Buscar grupos do usuário e verificar permissão via grupo
          getDb().all(
            `SELECT gp.id FROM grupos_permissoes gp
             INNER JOIN usuarios_grupos ug ON gp.id = ug.grupo_id
             WHERE ug.usuario_id = ? AND gp.ativo = 1`,
            [userId],
            (err, grupos) => {
              if (err) {
                console.error('Erro ao verificar permissões:', err);
                return res.status(500).json({ error: 'Erro ao verificar permissões' });
              }

              // Se não tem grupos, apenas comercial por padrão (MODULOS_LIBERADOS_SEM_GRUPO — Etapa 111, B63)
              if (!grupos || grupos.length === 0) {
                if (MODULOS_LIBERADOS_SEM_GRUPO.includes(requiredModule)) {
                  return next();
                }
                registrar(req, requiredModule);
                return res.status(403).json({ error: 'Acesso negado ao módulo', modulo: requiredModule });
              }

              const grupoIds = grupos.map(g => g.id);
              const placeholders = grupoIds.map(() => '?').join(',');

              getDb().get(
                `SELECT COUNT(*) as count FROM permissoes
                 WHERE grupo_id IN (${placeholders})
                 AND modulo = ? AND permissao = 1`,
                [...grupoIds, requiredModule],
                (err, row) => {
                  if (err) {
                    console.error('Erro ao verificar permissões:', err);
                    return res.status(500).json({ error: 'Erro ao verificar permissões' });
                  }
                  if (row && row.count > 0) {
                    return next();
                  }
                  registrar(req, requiredModule);
                  return res.status(403).json({ error: 'Acesso negado ao módulo', modulo: requiredModule });
                }
              );
            }
          );
        }
      );
    };
  }

  // Middleware: permite acesso se usuário tiver permissão em QUALQUER módulo da lista.
  // Útil para módulos "irmãos" que compartilham endpoints (ex: engenharia e engenharia_projetos).
  function checkAnyModulePermission(requiredModules) {
    const mods = Array.isArray(requiredModules) ? requiredModules.filter(Boolean) : [];
    if (mods.length === 0) return checkModulePermission('comercial');

    return (req, res, next) => {
      if (bypassModuleRestrictions(req.user)) {
        return next();
      }

      const userId = req.user.id;
      const placeholders = mods.map(() => '?').join(',');

      // 1) Permissão direta do usuário (usuario_id preenchido, grupo_id NULL)
      getDb().get(
        `SELECT 1 FROM permissoes
         WHERE usuario_id = ? AND (grupo_id IS NULL OR grupo_id = 0)
         AND modulo IN (${placeholders}) AND permissao = 1 LIMIT 1`,
        [userId, ...mods],
        (err, directRow) => {
          if (err) {
            console.error('Erro ao verificar permissão direta (any):', err);
            return res.status(500).json({ error: 'Erro ao verificar permissões' });
          }
          if (directRow) {
            return next();
          }

          // 2) Verificar permissão via grupos
          getDb().all(
            `SELECT gp.id FROM grupos_permissoes gp
             INNER JOIN usuarios_grupos ug ON gp.id = ug.grupo_id
             WHERE ug.usuario_id = ? AND gp.ativo = 1`,
            [userId],
            (err2, grupos) => {
              if (err2) {
                console.error('Erro ao verificar permissões (any):', err2);
                return res.status(500).json({ error: 'Erro ao verificar permissões' });
              }

              // Se não tem grupos, apenas comercial por padrão (MODULOS_LIBERADOS_SEM_GRUPO — Etapa 111, B63)
              if (!grupos || grupos.length === 0) {
                if (mods.some((m) => MODULOS_LIBERADOS_SEM_GRUPO.includes(m))) {
                  return next();
                }
                registrar(req, mods.join('|'));
                return res.status(403).json({ error: 'Acesso negado ao módulo', modulo: mods });
              }

              const grupoIds = grupos.map(g => g.id);
              const gPlaceholders = grupoIds.map(() => '?').join(',');

              getDb().get(
                `SELECT COUNT(*) as count FROM permissoes
                 WHERE grupo_id IN (${gPlaceholders})
                 AND modulo IN (${placeholders}) AND permissao = 1`,
                [...grupoIds, ...mods],
                (err3, row) => {
                  if (err3) {
                    console.error('Erro ao verificar permissões (any):', err3);
                    return res.status(500).json({ error: 'Erro ao verificar permissões' });
                  }
                  if (row && row.count > 0) {
                    return next();
                  }
                  registrar(req, mods.join('|'));
                  return res.status(403).json({ error: 'Acesso negado ao módulo', modulo: mods });
                }
              );
            }
          );
        }
      );
    };
  }

  return { checkModulePermission, checkAnyModulePermission };
}

module.exports = { criarPortoesDeModulo };
