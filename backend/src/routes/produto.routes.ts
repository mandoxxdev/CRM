import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/auth.middleware.js';

const router = Router();
const prisma = new PrismaClient();

// GET /api/produtos
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { ativo } = req.query;

    const where: any = {};
    if (ativo === 'true') {
      where.ativo = true;
    }

    const produtos = await prisma.produto.findMany({
      where,
      orderBy: {
        dataCriacao: 'desc',
      },
    });

    res.json(produtos);
  } catch (error: any) {
    res.status(500).json({ erro: error.message });
  }
});

// GET /api/produtos/:id
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const produto = await prisma.produto.findUnique({
      where: { id },
    });

    if (!produto) {
      return res.status(404).json({ erro: 'Produto não encontrado' });
    }

    res.json(produto);
  } catch (error: any) {
    res.status(500).json({ erro: error.message });
  }
});

// POST /api/produtos
router.post('/', authMiddleware, async (req, res) => {
  try {
    const produto = await prisma.produto.create({
      data: req.body,
    });

    res.status(201).json(produto);
  } catch (error: any) {
    res.status(500).json({ erro: error.message });
  }
});

// PUT /api/produtos/:id
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const produto = await prisma.produto.update({
      where: { id },
      data: req.body,
    });

    res.json(produto);
  } catch (error: any) {
    res.status(500).json({ erro: error.message });
  }
});

// DELETE /api/produtos/:id
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.produto.delete({
      where: { id },
    });

    res.json({ mensagem: 'Produto excluído com sucesso' });
  } catch (error: any) {
    res.status(500).json({ erro: error.message });
  }
});

export default router;

