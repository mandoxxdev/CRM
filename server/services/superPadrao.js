/**
 * Etapa 134 (C280) — o administrador padrao (`admin@gmp.com.br`) e o super administrador do boot.
 *
 * Ate a 133 o boot fazia super, a CADA reinicio, quem tivesse esse e-mail (`UPDATE … WHERE email = 'admin@gmp.com.br'`), sem olhar se
 * ja havia super — e quem gerencia usuarios trocava o proprio e-mail para esse (reproduzido pelo r2 da 133). A promocao existia para o
 * banco antigo: a coluna `is_superadmin` chega com 0 para todos e o administrador padrao virava o primeiro super. Agora ela e
 * RECUPERACAO: so quando nao ha nenhum super ativo (RN-01). Pela API nao se chega a zero super ativo (o ultimo nao se desativa nem se
 * exclui, e quem nao e super nao mexe no campo) — so banco antigo ou edicao direta do arquivo.
 *
 * "Super ativo" = super que ENTRA: `ativo = 1`, a regua do login (Fase 5 r1 M1: com `COALESCE(ativo, 1)`, um super gravado pela API com
 * `ativo` nulo — que nao entra — contava como ativo e travava a recuperacao, e a trava do ultimo super deixava o unico que entra se
 * rebaixar). A mesma regua vale em `countActiveSuperAdmins` (systemPermissions.js).
 */
const EMAIL_SUPER_PADRAO = 'admin@gmp.com.br';
const LITERAL_EMAIL_RESERVADO = 'O e-mail admin@gmp.com.br é reservado ao administrador padrão — só um Super Administrador pode atribuí-lo';
const SUPER_ATIVO_SQL = 'COALESCE(is_superadmin, 0) = 1 AND ativo = 1';

/** RN-03: sem espacos nas pontas e sem diferenca de caixa. Nao-texto -> false, nunca lanca (Fase 2 I2: roda dentro de callback). */
function ehEmailDoSuperPadrao(email) {
  if (typeof email !== 'string') return false;
  return email.trim().toLowerCase() === EMAIL_SUPER_PADRAO;
}

function haSuperAtivo(db) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT 1 AS ok FROM usuarios WHERE ${SUPER_ATIVO_SQL} LIMIT 1`, [], (err, row) => (err ? reject(err) : resolve(Boolean(row))));
  });
}

/**
 * RN-01: promove quem tem o e-mail exato (como hoje) so se nao ha super ativo — num comando so (a guarda no proprio WHERE).
 * @returns {Promise<number>} linhas promovidas
 */
function promoverSuperPadraoSemSuperAtivo(db) {
  return new Promise((resolve, reject) => {
    db.run(`UPDATE usuarios SET is_superadmin = 1
      WHERE email = ? AND COALESCE(is_superadmin, 0) = 0
        AND NOT EXISTS (SELECT 1 FROM usuarios s WHERE COALESCE(s.is_superadmin, 0) = 1 AND s.ativo = 1)`,
    [EMAIL_SUPER_PADRAO], function feito(err) { if (err) reject(err); else resolve(this.changes); });
  });
}

module.exports = {
  EMAIL_SUPER_PADRAO,
  LITERAL_EMAIL_RESERVADO,
  ehEmailDoSuperPadrao,
  haSuperAtivo,
  promoverSuperPadraoSemSuperAtivo,
};
