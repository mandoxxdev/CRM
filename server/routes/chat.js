/**
 * Rotas REST do Chat Interno Orion
 */

const path = require('path');
const fs = require('fs');
const express = require('express');
// Etapa 86 (RN-85.03 revista): multer embrulhado como os do index.js. O callback inline da rota de
// imagem continua recebendo o erro e respondendo a mensagem propria ("Imagem muito grande...").
const { multerComLimiteNoErro } = require('../services/imagemUpload');
const multer = multerComLimiteNoErro(require('multer'));
const chatService = require('../services/chat/chatService');
// Etapa 81: nosniff + CSP sandbox — um arquivo enviado ao chat nao executa script na origem do CRM.
// Etapa 82: o mesmo modulo assina a URL (RN-82.02) e da a extensao pelo MIME (RN-82.03). O
// `cabecalhosUploadSeguro` fica NESTA linha do require: a regua da 81 (uploadsProtegidos) a procura.
const { cabecalhosUploadSeguro, criarAssinadorUpload, extensaoSegura } = require('../services/almoxarifado/urlUpload');
const { resolveJwtSecret } = require('../services/runtimeSecrets');

// Etapa 82 (RN-82.03): o filtro aceita SO os MIMEs de imagem que o `extensaoSegura` conhece, e a
// extensao gravada sai do MIME. Antes era MIME **ou** extensao, com a extensao do nome original:
// `Content-Type: image/png` + `filename="x.html"` gravava `.html` (servido sob CSP sandbox desde a
// 81, mas ainda um .html na pasta). A lista do mapa evita o `.bin` de `image/pjpeg`/`x-png`.
const MIMES_IMAGEM_CHAT = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']);

// Validade por pasta (B37): a tela do chat fica aberta horas sem refetch e a miniatura e `lazy` —
// 15 min quebraria imagem abaixo da dobra. 8 h com balde de 1 h; o `onError` da tela reassina.
const ASSINATURA_CHAT = Object.freeze({
  prefixo: '/api/uploads/chat', dominio: 'chat-uploads-v1', minutos: 480, baldeMinutos: 60,
});

module.exports = function registerChatRoutes(app, db, authenticateToken, chatSocket, PERSISTENT_DATA_DIR) {
  const uploadsChatDir = path.join(PERSISTENT_DATA_DIR, 'uploads', 'chat');
  if (!fs.existsSync(uploadsChatDir)) {
    fs.mkdirSync(uploadsChatDir, { recursive: true });
  }

  // RN-82.02: so serve com assinatura valida; sem/errada/expirada/de outra pasta -> 404, como o
  // almoxarifado. O assinador e de MODULO no chatService porque `mapMessage` (REST, POST e socket)
  // e quem assina na saida.
  const assinadorChat = criarAssinadorUpload(resolveJwtSecret(PERSISTENT_DATA_DIR), ASSINATURA_CHAT);
  chatService.configurarAssinadorChat(assinadorChat);
  app.use('/api/uploads/chat', assinadorChat.middleware, express.static(uploadsChatDir, {
    index: false,
    dotfiles: 'deny',
    setHeaders: cabecalhosUploadSeguro,
  }));
  // FECHO: o static chama `next()` quando o arquivo nao existe; assinatura valida de nome
  // inexistente desceria para o proximo handler em vez de 404.
  app.use('/api/uploads/chat', (req, res) => res.status(404).end());

  const storageChat = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsChatDir),
    filename: (req, file, cb) => {
      const ext = extensaoSegura(file.mimetype);
      cb(null, `chat-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    },
  });

  const uploadImagem = multer({
    storage: storageChat,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (MIMES_IMAGEM_CHAT.has(String(file.mimetype || '').toLowerCase())) {
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

  // RN-82.03: reassina o anexo de uma mensagem (URL vencida na tela aberta ha horas). Mensagem
  // inexistente, apagada, de conversa alheia ou sem anexo: o MESMO 404, para nao confirmar que existe.
  app.get('/api/chat/mensagens/:id/anexo', authenticateToken, async (req, res) => {
    try {
      const anexoUrl = await chatService.getMessageAttachment(db, Number(req.params.id), req.user.id);
      if (!anexoUrl) return res.status(404).json({ error: 'Mensagem não encontrada' });
      res.json({ anexo_url: anexoUrl });
    } catch (e) {
      console.error('[chat] reassinar anexo:', e);
      res.status(500).json({ error: 'Erro ao buscar anexo' });
    }
  });

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

// Revisao adversarial da 82: exportada para o teste afirmar a config REAL (dominio, 480 min,
// balde de 60). Antes o teste montava a sua propria copia e trocar aqui para 15 min ou para o
// dominio de outra pasta deixava a suite verde.
module.exports.ASSINATURA_CHAT = ASSINATURA_CHAT;
