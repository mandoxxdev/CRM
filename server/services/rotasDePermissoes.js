/**
 * Etapa 133 (C273, B855, do nucleo) — as rotas de permissoes granulares: `/api/permissoes/*` (a aba Permissoes da Administracao e o
 * salvar dos modulos do UsuarioForm).
 *
 * Ate a Etapa 132 recusavam com `req.user.role !== 'admin'` EXATO: o super administrador com outro papel e o papel "Admin" com
 * maiuscula levavam 403, enquanto o cadastro de usuarios (`canManageUsers`) os aceitava — a aba Permissoes nao carregava e o salvar do
 * UsuarioForm gravava o usuario sem os modulos ("Usuario salvo, mas houve erro ao salvar permissoes de modulos"). Medido na Fase 0.
 * Agora: a gestao e de quem gerencia usuarios (`canManageUsers`: super com qualquer papel, ou papel admin sem diferenca de caixa); as
 * permissoes de um usuario, dele mesmo ou de quem gerencia; o `/verificar` responde "admin" para quem o portao de modulo deixa passar
 * sem consultar (`bypassModuleRestrictions`). Descartado: manter o exato; so o super (tiraria o role = 'admin' das proprias abas). O
 * administrador do modulo `admin` continua recusado (nao gerencia usuarios: o cadastro tambem o recusa).
 *
 * O CORPO das rotas e o mesmo do index.js (as mensagens de recusa literais de hoje, as respostas, os SQL) — so a regua mudou e o `db`
 * vem de `getDb()` na hora do pedido (o index.js atribui o `db` no callback de abertura, como `portaoDeModulo`). O index.js as
 * registra no MESMO ponto das antigas; o `DELETE /usuario/:id/modulos`, que morava mais abaixo, veio junto (nenhuma rota entre os dois
 * pontos casa o caminho). Teste: `tests/api/rotasDePermissoes.api.test.js` (o registrador) e `permissoesNoServidor.api.test.js` (o
 * index.js real).
 */
const { canManageUsers, bypassModuleRestrictions } = require('./systemPermissions');

const L_ACESSO_NEGADO = 'Acesso negado';
const L_GERENCIAR_PERMISSOES = 'Apenas administradores podem gerenciar permissões';

function registrarRotasDePermissoes(app, { getDb, authenticateToken }) {
  // Obter permissões de um usuário
  app.get('/api/permissoes/usuario/:id', authenticateToken, (req, res) => {
    const db = getDb();
    const { id } = req.params;
    
    // Apenas admin ou o próprio usuário
    if (!canManageUsers(req.user) && req.user.id !== parseInt(id)) {
      return res.status(403).json({ error: L_ACESSO_NEGADO });
    }

    db.all(
      `SELECT * FROM permissoes WHERE usuario_id = ?`,
      [id],
      (err, rows) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json(rows);
      }
    );
  });

  // Verificar permissão específica (incluindo grupos)
  app.get('/api/permissoes/verificar', authenticateToken, (req, res) => {
    const db = getDb();
    const { modulo, acao, cliente_id, regiao } = req.query;
    const userId = req.user.id;

    // Admin tem todas as permissões
    if (bypassModuleRestrictions(req.user)) {
      return res.json({ permitido: true, motivo: 'admin' });
    }

    // Verificar permissões diretas do usuário
    db.get(
      `SELECT p.* FROM permissoes p
       WHERE p.usuario_id = ?
         AND p.modulo = ?
         AND p.acao = ?
         AND (p.restricao_cliente_id IS NULL OR p.restricao_cliente_id = ?)
         AND (p.restricao_regiao IS NULL OR p.restricao_regiao = ?)
       LIMIT 1`,
      [userId, modulo, acao, cliente_id || null, regiao || null],
      (err, row) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        
        // Se encontrou permissão direta, retornar
        if (row) {
          return res.json({ 
            permitido: row.permissao === 1,
            motivo: row.permissao === 1 ? 'permissao_explicita' : 'negado_explicito'
          });
        }

        // Se não encontrou, verificar grupos do usuário
        db.get(
          `SELECT p.* FROM permissoes p
           INNER JOIN usuarios_grupos ug ON p.grupo_id = ug.grupo_id
           INNER JOIN grupos_permissoes gp ON ug.grupo_id = gp.id
           WHERE ug.usuario_id = ?
             AND gp.ativo = 1
             AND p.modulo = ?
             AND p.acao = ?
             AND (p.restricao_cliente_id IS NULL OR p.restricao_cliente_id = ?)
             AND (p.restricao_regiao IS NULL OR p.restricao_regiao = ?)
           LIMIT 1`,
          [userId, modulo, acao, cliente_id || null, regiao || null],
          (err, grupoRow) => {
            if (err) {
              return res.status(500).json({ error: err.message });
            }
            
            const permitido = grupoRow && grupoRow.permissao === 1;
            res.json({ 
              permitido,
              motivo: permitido ? 'permissao_grupo' : 'sem_permissao'
            });
          }
        );
      }
    );
  });

  // Criar/Atualizar permissão
  app.post('/api/permissoes', authenticateToken, (req, res) => {
    const db = getDb();
    if (!canManageUsers(req.user)) {
      return res.status(403).json({ error: L_GERENCIAR_PERMISSOES });
    }

    const { usuario_id, grupo_id, modulo, acao, permissao, restricao_cliente_id, restricao_regiao } = req.body;

    // Verificar se a permissão já existe
    const query = usuario_id 
      ? `SELECT id FROM permissoes 
         WHERE usuario_id = ? AND grupo_id IS NULL AND modulo = ? AND acao = ?`
      : `SELECT id FROM permissoes 
         WHERE usuario_id IS NULL AND grupo_id = ? AND modulo = ? AND acao = ?`;
    
    const params = usuario_id 
      ? [usuario_id, modulo, acao]
      : [grupo_id, modulo, acao];
    
    db.get(query, params, (err, existing) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }

        if (existing) {
          // Se permissão for false, deletar; caso contrário, atualizar
          if (!permissao) {
            db.run('DELETE FROM permissoes WHERE id = ?', [existing.id], (err) => {
              if (err) {
                return res.status(500).json({ error: err.message });
              }
              res.json({ message: 'Permissão removida com sucesso' });
            });
          } else {
            db.run(
              `UPDATE permissoes 
               SET permissao = ?, restricao_cliente_id = ?, restricao_regiao = ?
               WHERE id = ?`,
              [permissao ? 1 : 0, restricao_cliente_id, restricao_regiao, existing.id],
              (err) => {
                if (err) {
                  return res.status(500).json({ error: err.message });
                }
                res.json({ message: 'Permissão atualizada com sucesso', id: existing.id });
              }
            );
          }
        } else {
          // Se permissão for false, não criar (já que não existe)
          if (!permissao) {
            return res.json({ message: 'Permissão não existe, nada a fazer' });
          }
          
          // Criar nova permissão
          db.run(
            `INSERT INTO permissoes 
             (usuario_id, grupo_id, modulo, acao, permissao, restricao_cliente_id, restricao_regiao)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [usuario_id, grupo_id, modulo, acao, permissao ? 1 : 0, restricao_cliente_id, restricao_regiao],
            function(err) {
              if (err) {
                return res.status(500).json({ error: err.message });
              }
              res.json({ message: 'Permissão criada com sucesso', id: this.lastID });
            }
          );
        }
      }
    );
  });

  // Grupos de Permissões
  app.get('/api/permissoes/grupos', authenticateToken, (req, res) => {
    const db = getDb();
    if (!canManageUsers(req.user)) {
      return res.status(403).json({ error: L_ACESSO_NEGADO });
    }

    db.all('SELECT * FROM grupos_permissoes ORDER BY nome', [], (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json(rows);
    });
  });

  app.get('/api/permissoes/grupos/:id', authenticateToken, (req, res) => {
    const db = getDb();
    if (!canManageUsers(req.user)) {
      return res.status(403).json({ error: L_ACESSO_NEGADO });
    }

    const { id } = req.params;
    db.get('SELECT * FROM grupos_permissoes WHERE id = ?', [id], (err, row) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (!row) {
        return res.status(404).json({ error: 'Grupo não encontrado' });
      }
      res.json(row);
    });
  });

  app.post('/api/permissoes/grupos', authenticateToken, (req, res) => {
    const db = getDb();
    if (!canManageUsers(req.user)) {
      return res.status(403).json({ error: L_ACESSO_NEGADO });
    }

    const { nome, descricao, ativo } = req.body;
    db.run(
      'INSERT INTO grupos_permissoes (nome, descricao, ativo) VALUES (?, ?, ?)',
      [nome, descricao, ativo !== undefined ? (ativo ? 1 : 0) : 1],
      function(err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json({ message: 'Grupo criado com sucesso', id: this.lastID });
      }
    );
  });

  app.put('/api/permissoes/grupos/:id', authenticateToken, (req, res) => {
    const db = getDb();
    if (!canManageUsers(req.user)) {
      return res.status(403).json({ error: L_ACESSO_NEGADO });
    }

    const { id } = req.params;
    const { nome, descricao, ativo } = req.body;
    db.run(
      'UPDATE grupos_permissoes SET nome = ?, descricao = ?, ativo = ? WHERE id = ?',
      [nome, descricao, ativo !== undefined ? (ativo ? 1 : 0) : 1, id],
      function(err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json({ message: 'Grupo atualizado com sucesso' });
      }
    );
  });

  app.delete('/api/permissoes/grupos/:id', authenticateToken, (req, res) => {
    const db = getDb();
    if (!canManageUsers(req.user)) {
      return res.status(403).json({ error: L_ACESSO_NEGADO });
    }

    const { id } = req.params;
    db.run('DELETE FROM grupos_permissoes WHERE id = ?', [id], function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ message: 'Grupo excluído com sucesso' });
    });
  });

  // Usuários em Grupos
  app.get('/api/permissoes/grupos/:id/usuarios', authenticateToken, (req, res) => {
    const db = getDb();
    if (!canManageUsers(req.user)) {
      return res.status(403).json({ error: L_ACESSO_NEGADO });
    }

    const { id } = req.params;
    db.all(
      `SELECT u.id, u.nome, u.email, u.cargo, u.role, u.ativo, u.setor, u.departamento, u.is_oculto, u.created_at
       FROM usuarios u
       INNER JOIN usuarios_grupos ug ON u.id = ug.usuario_id
       WHERE ug.grupo_id = ?`,
      [id],
      (err, rows) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json(rows || []);
      }
    );
  });

  app.post('/api/permissoes/grupos/:id/usuarios', authenticateToken, (req, res) => {
    const db = getDb();
    if (!canManageUsers(req.user)) {
      return res.status(403).json({ error: L_ACESSO_NEGADO });
    }

    const { id } = req.params;
    const { usuario_id } = req.body;

    db.get('SELECT id FROM usuarios WHERE id = ?', [usuario_id], (ghostErr, target) => {
      if (ghostErr) return res.status(500).json({ error: ghostErr.message });
      if (!target) return res.status(404).json({ error: 'Usuário não encontrado' });

    db.run(
      'INSERT OR IGNORE INTO usuarios_grupos (usuario_id, grupo_id) VALUES (?, ?)',
      [usuario_id, id],
      function(err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json({ message: 'Usuário adicionado ao grupo com sucesso' });
      }
    );
    });
  });

  app.delete('/api/permissoes/grupos/:id/usuarios/:usuario_id', authenticateToken, (req, res) => {
    const db = getDb();
    if (!canManageUsers(req.user)) {
      return res.status(403).json({ error: L_ACESSO_NEGADO });
    }

    const { id, usuario_id } = req.params;
    db.run(
      'DELETE FROM usuarios_grupos WHERE grupo_id = ? AND usuario_id = ?',
      [id, usuario_id],
      function(err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json({ message: 'Usuário removido do grupo com sucesso' });
      }
    );
  });

  // Permissões de um Grupo
  app.get('/api/permissoes/grupos/:id/permissoes', authenticateToken, (req, res) => {
    const db = getDb();
    if (!canManageUsers(req.user)) {
      return res.status(403).json({ error: L_ACESSO_NEGADO });
    }

    const { id } = req.params;
    db.all(
      'SELECT * FROM permissoes WHERE grupo_id = ?',
      [id],
      (err, rows) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json(rows);
      }
    );
  });

  // Deletar todas as permissões de módulos de um usuário
  app.delete('/api/permissoes/usuario/:id/modulos', authenticateToken, (req, res) => {
    const db = getDb();
    if (!canManageUsers(req.user)) {
      return res.status(403).json({ error: L_ACESSO_NEGADO });
    }

    const { id } = req.params;
    db.run(
      'DELETE FROM permissoes WHERE usuario_id = ? AND grupo_id IS NULL',
      [id],
      function(err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json({ message: 'Permissões de módulos removidas com sucesso' });
      }
    );
  });
}

module.exports = { registrarRotasDePermissoes, L_ACESSO_NEGADO, L_GERENCIAR_PERMISSOES };
