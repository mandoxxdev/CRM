import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { authMiddleware, isAdmin, AuthRequest } from '../middleware/auth.middleware.js';

const router = Router();
const prisma = new PrismaClient();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, senha } = req.body;

    const usuario = await prisma.usuario.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!usuario || !usuario.ativo) {
      return res.status(401).json({ erro: 'Email ou senha incorretos' });
    }

    const senhaValida = await bcrypt.compare(senha, usuario.senhaHash);
    if (!senhaValida) {
      return res.status(401).json({ erro: 'Email ou senha incorretos' });
    }

    const secret = process.env.JWT_SECRET || 'seu-secret-super-seguro';
    const token = jwt.sign(
      {
        id: usuario.id,
        email: usuario.email,
        perfil: usuario.perfil,
      },
      secret,
      { expiresIn: '7d' }
    );

    const { senhaHash, ...usuarioSemSenha } = usuario;

    res.json({
      token,
      usuario: usuarioSemSenha,
    });
  } catch (error: any) {
    res.status(500).json({ erro: error.message });
  }
});

// POST /api/auth/register (apenas admin)
router.post('/register', authMiddleware, isAdmin, async (req: AuthRequest, res) => {
  try {
    const { nome, email, senha, perfil, ativo } = req.body;

    const usuarioExiste = await prisma.usuario.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (usuarioExiste) {
      return res.status(400).json({ erro: 'Email já cadastrado' });
    }

    const senhaHash = await bcrypt.hash(senha, 10);

    const usuario = await prisma.usuario.create({
      data: {
        nome,
        email: email.toLowerCase(),
        senhaHash,
        perfil,
        ativo: ativo !== false,
      },
    });

    const { senhaHash: _, ...usuarioSemSenha } = usuario;

    res.status(201).json(usuarioSemSenha);
  } catch (error: any) {
    res.status(500).json({ erro: error.message });
  }
});

export default router;

