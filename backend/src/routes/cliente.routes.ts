import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middleware/auth.middleware.js';

const router = Router();
const prisma = new PrismaClient();

// GET /api/clientes
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const usuario = req.usuario!;
    const { todos } = req.query;

    let where: any = {};

    // Se não for Diretoria, mostra apenas próprios clientes
    if (todos !== 'true' || !(usuario.perfil === 'Diretoria' && usuario.email === 'matheus@gmp.ind.br')) {
      where.usuarioId = usuario.id;
    }

    const clientes = await prisma.cliente.findMany({
      where,
      include: {
        contatos: true,
        _count: {
          select: {
            vendas: true,
            oportunidades: true,
          },
        },
      },
      orderBy: {
        dataCriacao: 'desc',
      },
    });

    res.json(clientes);
  } catch (error: any) {
    res.status(500).json({ erro: error.message });
  }
});

// GET /api/clientes/:id
router.get('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const usuario = req.usuario!;

    const cliente = await prisma.cliente.findUnique({
      where: { id },
      include: {
        contatos: true,
        vendas: {
          include: {
            itens: true,
          },
        },
        oportunidades: true,
        atividades: true,
      },
    });

    if (!cliente) {
      return res.status(404).json({ erro: 'Cliente não encontrado' });
    }

    // Verificar permissão
    if (cliente.usuarioId !== usuario.id && 
        !(usuario.perfil === 'Diretoria' && usuario.email === 'matheus@gmp.ind.br')) {
      return res.status(403).json({ erro: 'Acesso negado' });
    }

    res.json(cliente);
  } catch (error: any) {
    res.status(500).json({ erro: error.message });
  }
});

// POST /api/clientes
router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const usuario = req.usuario!;
    const dadosCliente = req.body;

    const cliente = await prisma.cliente.create({
      data: {
        ...dadosCliente,
        usuarioId: usuario.id,
      },
      include: {
        contatos: true,
      },
    });

    res.status(201).json(cliente);
  } catch (error: any) {
    res.status(500).json({ erro: error.message });
  }
});

// PUT /api/clientes/:id
router.put('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const usuario = req.usuario!;
    const updates = req.body;

    const cliente = await prisma.cliente.findUnique({
      where: { id },
    });

    if (!cliente) {
      return res.status(404).json({ erro: 'Cliente não encontrado' });
    }

    if (cliente.usuarioId !== usuario.id && 
        !(usuario.perfil === 'Diretoria' && usuario.email === 'matheus@gmp.ind.br')) {
      return res.status(403).json({ erro: 'Acesso negado' });
    }

    const clienteAtualizado = await prisma.cliente.update({
      where: { id },
      data: updates,
      include: {
        contatos: true,
      },
    });

    res.json(clienteAtualizado);
  } catch (error: any) {
    res.status(500).json({ erro: error.message });
  }
});

// DELETE /api/clientes/:id
router.delete('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const usuario = req.usuario!;

    const cliente = await prisma.cliente.findUnique({
      where: { id },
    });

    if (!cliente) {
      return res.status(404).json({ erro: 'Cliente não encontrado' });
    }

    if (cliente.usuarioId !== usuario.id && 
        !(usuario.perfil === 'Diretoria' && usuario.email === 'matheus@gmp.ind.br')) {
      return res.status(403).json({ erro: 'Acesso negado' });
    }

    await prisma.cliente.delete({
      where: { id },
    });

    res.json({ mensagem: 'Cliente excluído com sucesso' });
  } catch (error: any) {
    res.status(500).json({ erro: error.message });
  }
});

export default router;

