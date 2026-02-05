import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middleware/auth.middleware.js';

const router = Router();
const prisma = new PrismaClient();

// GET /api/oportunidades
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const usuario = req.usuario!;
    const { todos, clienteId } = req.query;

    let where: any = {};

    if (clienteId) {
      where.clienteId = clienteId as string;
    }

    if (todos !== 'true' || !(usuario.perfil === 'Diretoria' && usuario.email === 'matheus@gmp.ind.br')) {
      where.usuarioId = usuario.id;
    }

    const oportunidades = await prisma.oportunidade.findMany({
      where,
      include: {
        cliente: {
          select: {
            id: true,
            nome: true,
            empresa: true,
          },
        },
      },
      orderBy: {
        dataCriacao: 'desc',
      },
    });

    res.json(oportunidades);
  } catch (error: any) {
    res.status(500).json({ erro: error.message });
  }
});

// POST /api/oportunidades
router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const usuario = req.usuario!;

    const oportunidade = await prisma.oportunidade.create({
      data: {
        ...req.body,
        usuarioId: usuario.id,
      },
      include: {
        cliente: true,
      },
    });

    res.status(201).json(oportunidade);
  } catch (error: any) {
    res.status(500).json({ erro: error.message });
  }
});

export default router;

