/**
 * Rotas REST do Chat Interno Orion
 */

const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const chatService = require('../services/chat/chatService');

const IMAGE_MIMES = /^image\/(jpeg|jpg|png|gif|webp)$/i;
const IMAGE_EXTS = /\.(jpe?g|png|gif|webp)$/i;

module.exports = function registerChatRoutes(app, db, authenticateToken, chatSocket, PERSISTENT_DATA_DIR) {
  const uploadsChatDir = path.join(PERSISTENT_DATA_DIR, 'uploads', 'chat');
  if (!fs.existsSync(uploadsChatDir)) {
    fs.mkdirSync(uploadsChatDir, { recursive: true });
  }

  app.use('/api/uploads/chat', express.static(uploadsChatDir));

  const storageChat = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsChatDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `chat-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    },
  });

  const uploadImagem = multer({
    storage: storageChat,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (IMAGE_MIMES.test(file.mimetype) || IMAGE_EXTS.test(ext)) {
        return cb(null, true);
      }
      cb(new Error('Formato não permitido. Use JPG, PNG, WebP ou GIF (máx. 10MB).'));
    },
  });

  const emitMessage = async (conversaId, mensagem) => {
    if (chatSocket?.emitNewMessage) {
      await chatSocket.emitNewMessage(conversaId, mensagem);
    }
  };

  app.get('/api/chat/conversas', authenticateToken, async (req, res) => {
    try {
      const conversas = await chatService.listConversations(db, req.user.id, {
        incluirArquivadas: req.query.arquivadas === '1',
      });
      res.json({ conversas });
    } catch (e) {
      console.error('[chat] list conversas:', e);
      res.status(500).json({ error: 'Erro ao listar conversas' });
    }
  });

  app.get('/api/chat/nao-lidas', authenticateToken, async (req, res) => {
    try {
      const total = await chatService.getTotalUnread(db, req.user.id);
      res.json({ total });
    } catch (e) {
      res.status(500).json({ error: 'Erro ao contar não lidas' });
    }
  });

  app.get('/api/chat/usuarios', authenticateToken, async (req, res) => {
    try {
      const usuarios = await chatService.listChatUsers(db, req.user.id, req.query.search, req.user);
      res.json({ usuarios });
    } catch (e) {
      res.status(500).json({ error: 'Erro ao listar usuários' });
    }
  });

  app.post('/api/chat/conversas/direta', authenticateToken, async (req, res) => {
    try {
      const conversaId = await chatService.createDirectConversation(
        db,
        req.user.id,
        Number(req.body.usuario_id),
        req.user
      );
      res.json({ conversa_id: conversaId });
    } catch (e) {
      res.status(400).json({ error: e.message || 'Erro ao criar conversa' });
    }
  });

  app.post('/api/chat/conversas/grupo', authenticateToken, async (req, res) => {
    try {
      const conversaId = await chatService.createGroupConversation(
        db,
        req.user.id,
        req.body.nome,
        req.body.membros || req.body.participantes,
        req.user
      );
      res.json({ conversa_id: conversaId });
    } catch (e) {
      res.status(400).json({ error: e.message || 'Erro ao criar grupo' });
    }
  });

  app.patch('/api/chat/conversas/:id/arquivar', authenticateToken, async (req, res) => {
    try {
      await chatService.setArchived(db, Number(req.params.id), req.user.id, !!req.body.arquivada);
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: e.message || 'Erro ao arquivar' });
    }
  });

  app.get('/api/chat/conversas/:id/mensagens', authenticateToken, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
      const before = req.query.before ? Number(req.query.before) : null;
      const result = await chatService.getMessages(db, Number(req.params.id), req.user.id, {
        limit,
        before,
      });
      res.json(result);
    } catch (e) {
      const status = e.message === 'Acesso negado' ? 403 : 500;
      res.status(status).json({ error: e.message || 'Erro ao buscar mensagens' });
    }
  });

  app.post('/api/chat/conversas/:id/mensagens', authenticateToken, async (req, res) => {
    try {
      const mensagem = await chatService.sendMessage(
        db,
        Number(req.params.id),
        req.user.id,
        req.body.conteudo || req.body.mensagem
      );
      await emitMessage(mensagem.conversa_id, mensagem);
      res.json({ mensagem });
    } catch (e) {
      res.status(400).json({ error: e.message || 'Erro ao enviar mensagem' });
    }
  });

  app.post(
    '/api/chat/conversas/:id/mensagens/imagem',
    authenticateToken,
    (req, res, next) => {
      uploadImagem.single('imagem')(req, res, (err) => {
        if (err) {
          console.error('[chat] upload imagem (multer):', err);
          const message =
            err.code === 'LIMIT_FILE_SIZE'
              ? 'Imagem muito grande. Máximo 10MB.'
              : err.message || 'Erro no upload';
          return res.status(400).json({ error: message });
        }
        next();
      });
    },
    async (req, res) => {
      try {
        if (!req.file) return res.status(400).json({ error: 'Imagem obrigatória' });
        const mensagem = await chatService.sendImageMessage(
          db,
          Number(req.params.id),
          req.user.id,
          {
            url: `/api/uploads/chat/${req.file.filename}`,
            nome: req.file.originalname,
            tamanho: req.file.size,
            legenda: req.body.conteudo || req.body.mensagem || req.body.legenda,
          }
        );
        await emitMessage(mensagem.conversa_id, mensagem);
        res.json({ mensagem });
      } catch (e) {
        console.error('[chat] send image:', e);
        res.status(400).json({ error: e.message || 'Erro ao enviar imagem' });
      }
    }
  );

  app.put('/api/chat/conversas/:id/lida', authenticateToken, async (req, res) => {
    try {
      const payload = await chatService.markAsRead(db, Number(req.params.id), req.user.id);
      chatSocket?.emitMessageRead?.(Number(req.params.id), payload);
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: e.message || 'Erro ao marcar como lida' });
    }
  });

  app.post('/api/chat/conversas/:id/marcar-lidas', authenticateToken, async (req, res) => {
    try {
      await chatService.markAsRead(db, Number(req.params.id), req.user.id);
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: e.message || 'Erro ao marcar como lidas' });
    }
  });

  app.delete('/api/chat/conversas/:id/mensagens/:msgId', authenticateToken, async (req, res) => {
    try {
      await chatService.softDeleteMessage(
        db,
        Number(req.params.id),
        Number(req.params.msgId),
        req.user.id
      );
      chatSocket?.io?.to(`conversa:${req.params.id}`).emit('mensagem_excluida', {
        id: Number(req.params.msgId),
        conversa_id: Number(req.params.id),
      });
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: e.message || 'Erro ao excluir mensagem' });
    }
  });
};
