const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { LITERAL_SESSAO_ENCERRADA, idDoTokenValido } = require('../systemPermissions');

/**
 * Etapa 132 (C271): o que o servidor manda ao socket de quem ficou sem linha ativa (desativado ou apagado) antes de o
 * desconectar — o client (`client/src/services/chatSocket.js`) sai para `/login?sessao_encerrada=1`, como no 401 da 131.
 */
const PAYLOAD_SESSAO_ENCERRADA = Object.freeze({ error: LITERAL_SESSAO_ENCERRADA, code: 'USUARIO_INATIVO' });

// A regua da "linha ativa" e a do enrichUserFromDb (131): ativo = 1 exato — 0, NULL, 'true' e a linha apagada ficam de fora.
function lerLinhaAtiva(db, userId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT id FROM usuarios WHERE id = ? AND ativo = 1', [userId], (err, row) => (err ? reject(err) : resolve(!!row)));
  });
}

// join_conversa e typing: a linha ativa e a participacao numa leitura so.
function lerSituacaoNaConversa(db, conversaId, userId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT
         EXISTS (SELECT 1 FROM usuarios WHERE id = ? AND ativo = 1) AS ativo,
         EXISTS (SELECT 1 FROM chat_participantes WHERE conversa_id = ? AND usuario_id = ?) AS participa`,
      [userId, conversaId, userId],
      (err, row) => (err ? reject(err) : resolve({ ativo: !!(row && row.ativo), participa: !!(row && row.participa) }))
    );
  });
}

function encerrarSocket(socket) {
  socket.emit('sessao_encerrada', PAYLOAD_SESSAO_ENCERRADA);
  socket.disconnect(true);
}

/**
 * Etapa 84 (RN-84.05): o token do handshake vem so do `auth` (o que o client manda,
 * `client/src/services/chatSocket.js`) ou do header `Authorization: Bearer`. A query do handshake
 * NAO e lida: no transporte polling ela vira URL (`/socket.io/?token=...`) e o token vazaria em log
 * de proxy e de servidor — o mesmo motivo de o `authenticateToken` ter deixado de aceitar `?token=`.
 */
function tokenDoHandshake(handshake) {
  const h = handshake || {};
  return (h.auth && h.auth.token)
    || (h.headers && h.headers.authorization && h.headers.authorization.replace(/^Bearer\s+/i, ''))
    || null;
}

/**
 * Middleware do `io.use`: exportado para o teste exercitar com sockets falsos (a regua por fonte
 * deixava passar `socket.handshake['query']` e `socket.request._query`).
 */
function criarAuthSocket(jwtSecret, db) {
  // Etapa 132: sem o banco o handshake voltaria a ser "so o token" (o desativado entrando por 24 h) — numa fiacao errada isso
  // tem de quebrar no boot, nao passar em silencio.
  if (!db) throw new Error('criarAuthSocket: db obrigatorio');
  return function authSocket(socket, next) {
    const token = tokenDoHandshake(socket.handshake);

    if (!token) {
      return next(new Error('Token não fornecido'));
    }

    jwt.verify(token, jwtSecret, (err, user) => {
      if (err) return next(new Error('Token inválido'));
      const encerrada = () => {
        const e = new Error(LITERAL_SESSAO_ENCERRADA);
        e.data = { code: 'USUARIO_INATIVO' };
        return next(e);
      };
      if (!user || !idDoTokenValido(user.id)) return encerrada();
      lerLinhaAtiva(db, user.id).then((ativo) => {
        if (!ativo) return encerrada();
        socket.user = user;
        return next();
      }, (dbErr) => {
        // Etapa 132 (RN-01): banco com erro (BUSY ou outro) -> conecta, como antes. Recusar aqui deixaria um usuario ATIVO
        // sem tempo real ate o proximo clique no chat (o socket.io-client nao reconecta depois de recusa no middleware).
        // O conteudo continua atras do join_conversa, que rele a linha e nao deixa o desativado entrar.
        console.warn('[chat socket] handshake:', dbErr && dbErr.message);
        socket.user = user;
        return next();
      });
    });
  };
}

function initChatSocket(httpServer, db, jwtSecret) {
  const io = new Server(httpServer, {
    cors: {
      origin: true,
      credentials: true,
    },
    path: '/socket.io',
  });

  io.use(criarAuthSocket(jwtSecret, db));

  io.on('connection', (socket) => {
    const userId = socket.user.id;
    // Etapa 132 (M5): a sala pelo numero, a mesma chave de encerrarSocketsDoUsuario.
    socket.join(`user:${Number(userId)}`);

    socket.on('join_conversa', async (conversaId) => {
      try {
        const id = Number(conversaId);
        if (!id) return;
        // Etapa 132 (RN-02): rele a linha — o socket pode ter passado no handshake antes de o usuario ser desativado
        // (ou com o banco ocupado). Sem linha ativa: sessao_encerrada e fora, sem entrar.
        const { ativo, participa } = await lerSituacaoNaConversa(db, id, userId);
        if (!ativo) return encerrarSocket(socket);
        if (participa) socket.join(`conversa:${id}`);
      } catch (e) {
        console.error('[chat socket] join_conversa:', e.message);
      }
    });

    socket.on('leave_conversa', (conversaId) => {
      socket.leave(`conversa:${Number(conversaId)}`);
    });

    socket.on('typing', async (payload) => {
      try {
        // Etapa 132 (Fase 5 r1): sem payload a desestruturacao lancava fora do try (erro nao tratado no log a cada evento).
        const { conversa_id, typing } = payload || {};
        const id = Number(conversa_id);
        if (!id) return;
        const { ativo, participa } = await lerSituacaoNaConversa(db, id, userId);
        if (!ativo) return encerrarSocket(socket);
        if (!participa) return;
        socket.to(`conversa:${id}`).emit('typing', {
          conversa_id: id,
          usuario_id: userId,
          typing: !!typing,
        });
      } catch (e) {
        console.error('[chat socket] typing:', e.message);
      }
    });
  });

  function encerrarSocketsDoUsuario(userId) {
    const sala = `user:${Number(userId)}`;
    io.in(sala).emit('sessao_encerrada', PAYLOAD_SESSAO_ENCERRADA);
    io.in(sala).disconnectSockets(true);
  }

  return {
    io,
    async emitNewMessage(conversaId, message) {
      io.to(`conversa:${conversaId}`).emit('nova_mensagem', message);
      const participants = await new Promise((resolve, reject) => {
        db.all(
          'SELECT usuario_id FROM chat_participantes WHERE conversa_id = ?',
          [conversaId],
          (err, rows) => (err ? reject(err) : resolve(rows || []))
        );
      });
      for (const p of participants) {
        io.to(`user:${p.usuario_id}`).emit('conversa_atualizada', { conversa_id: conversaId });
      }
    },
    emitMessageRead(conversaId, payload) {
      io.to(`conversa:${conversaId}`).emit('mensagem_lida', payload);
    },
    /**
     * Etapa 132 (RN-04): derruba na hora todos os sockets do usuario (PATCH de status com ativo 0, DELETE), com o aviso de
     * sessao encerrada. O id e normalizado: '05' acharia a sala `user:05`, vazia.
     */
    encerrarSocketsDoUsuario,
    /**
     * Etapa 132 (RN-04): para o PUT, em que o `ativo` vem cru do corpo (NULL, 'true', 0) — so a releitura diz o que ficou.
     * Sem linha ativa -> como acima. Erro na releitura -> derruba SEM o aviso (Fase 2 I1): o ativo derrubado por engano nao e
     * deslogado, reconecta no proximo gesto e o handshake rele; o desativado nao fica recebendo a conversa em que ja estava.
     * Resolve sempre (nunca rejeita: o index.js nao trata unhandledRejection).
     */
    async encerrarSocketsSeInativo(userId) {
      const id = Number(userId);
      try {
        if (!(await lerLinhaAtiva(db, id))) encerrarSocketsDoUsuario(id);
      } catch (e) {
        console.warn('[chat socket] encerrar:', e && e.message);
        try { io.in(`user:${id}`).disconnectSockets(true); } catch (e2) { /* nada a fazer */ }
      }
    },
  };
}

module.exports = {
  initChatSocket, tokenDoHandshake, criarAuthSocket, PAYLOAD_SESSAO_ENCERRADA,
};
