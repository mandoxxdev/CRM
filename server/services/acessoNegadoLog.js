/**
 * Etapa 111 (G17, RN-111.01/02) — registro do 403 de modulo no log de auditoria (`logs_auditoria`).
 *
 * Saiu do index.js (`registrarTentativaAcessoNegado`) para ser executado em teste com banco de verdade
 * (`tests/api/acessoNegadoLog.api.test.js`). O corpo e o de antes; o que mudou e o `nome_modulo`, que
 * vinha de um mapa proprio com 7 dos 11 modulos (almoxarifado, engenharia_projetos, frota e todolist iam
 * crus) e agora vem de `modulosSistema.nomeDoModulo`.
 *
 * Fire-and-forget para quem chama (os portoes nao esperam); devolve uma Promise que resolve depois do
 * INSERT (ou do erro, ja logado) so para o teste.
 */
const { nomeDoModulo } = require('./modulosSistema');

function registrarTentativaAcessoNegado(db, req, modulo) {
  const usuario_id = req.user.id;
  const ip_address = req.ip || req.connection.remoteAddress;
  const user_agent = req.get('user-agent') || '';
  const nome_modulo = nomeDoModulo(modulo);

  return new Promise((resolve) => {
    db.get('SELECT nome, email FROM usuarios WHERE id = ?', [usuario_id], (err, user) => {
      if (err) {
        console.error('Erro ao buscar usuário para log:', err);
        return resolve();
      }

      const usuario_nome = user?.nome || req.user.email || 'N/A';
      const usuario_email = user?.email || req.user.email || 'N/A';

      db.run(
        `INSERT INTO logs_auditoria 
         (usuario_id, usuario_nome, usuario_email, tipo, modulo, nome_modulo, ip_address, user_agent, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [usuario_id, usuario_nome, usuario_email, 'acesso_negado', modulo, nome_modulo, ip_address, user_agent],
        (err2) => {
          if (err2) {
            console.error('Erro ao registrar log de auditoria:', err2);
          }
          resolve();
        }
      );
    });
  });
}

module.exports = { registrarTentativaAcessoNegado };
