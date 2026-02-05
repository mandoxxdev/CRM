import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middleware/auth.middleware.js';

const router = Router();
const prisma = new PrismaClient();

// GET /api/atividades
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const usuario = req.usuario!;
    const { pendentes, clienteId } = req.query;

    let where: any = {};

    if (clienteId) {
      where.clienteId = clienteId as string;
    }

    if (pendentes === 'true') {
      where.concluida = false;
    }

    // Usuários normais veem apenas próprias atividades
    if (!(usuario.perfil === 'Diretoria' && usuario.email === 'matheus@gmp.ind.br')) {
      where.usuarioId = usuario.id;
    }

    const atividades = await prisma.atividade.findMany({
      where,
      include: {
        cliente: {
          select: {
            id: true,
            nome: true,
          },
        },
      },
      orderBy: {
        data: 'desc',
      },
    });

    res.json(atividades);
  } catch (error: any) {
    res.status(500).json({ erro: error.message });
  }
});

// POST /api/atividades
router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const usuario = req.usuario!;

    const atividade = await prisma.atividade.create({
      data: {
        ...req.body,
        usuarioId: usuario.id,
      },
      include: {
        cliente: true,
      },
    });

    res.status(201).json(atividade);
  } catch (error: any) {
    res.status(500).json({ erro: error.message });
  }
});

export default router;

