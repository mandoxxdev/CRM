const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const chatService = require('./chatService');

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

function initChatSocket(httpServer, db, jwtSecret) {
  const io = new Server(httpServer, {
    cors: {
      origin: true,
      credentials: true,
    },
    path: '/socket.io',
  });

  io.use((socket, next) => {
    const token = tokenDoHandshake(socket.handshake);

    if (!token) {
      return next(new Error('Token não fornecido'));
    }

    jwt.verify(token, jwtSecret, (err, user) => {
      if (err) return next(new Error('Token inválido'));
      socket.user = user;
      next();
    });
  });

  io.on('connection', (socket) => {
    const userId = socket.user.id;
    socket.join(`user:${userId}`);

    socket.on('join_conversa', async (conversaId) => {
      try {
        const id = Number(conversaId);
        if (!id) return;
        const ok = await chatService.isParticipant(db, id, userId);
        if (ok) socket.join(`conversa:${id}`);
      } catch (e) {
        console.error('[chat socket] join_conversa:', e.message);
      }
    });

    socket.on('leave_conversa', (conversaId) => {
      socket.leave(`conversa:${Number(conversaId)}`);
    });

    socket.on('typing', async ({ conversa_id, typing }) => {
      try {
        const id = Number(conversa_id);
        if (!id) return;
        const ok = await chatService.isParticipant(db, id, userId);
        if (!ok) return;
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
  };
}

module.exports = { initChatSocket, tokenDoHandshake };
