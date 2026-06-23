const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const chatService = require('./chatService');

function initChatSocket(httpServer, db, jwtSecret) {
  const io = new Server(httpServer, {
    cors: {
      origin: true,
      credentials: true,
    },
    path: '/socket.io',
  });

  io.use((socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '') ||
      socket.handshake.query?.token;

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

module.exports = { initChatSocket };
