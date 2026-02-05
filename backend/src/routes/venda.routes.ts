import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middleware/auth.middleware.js';

const router = Router();
const prisma = new PrismaClient();

// GET /api/vendas - Listar vendas
// Query params: ?usuarioId=xxx | ?todos=true | ?meus=true
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { usuarioId, todos, meus } = req.query;
    const usuario = req.usuario!;

    let where: any = {};

    // Se for Diretoria e pedir todos, mostra tudo
    if (todos === 'true' && usuario.perfil === 'Diretoria' && usuario.email === 'matheus@gmp.ind.br') {
      // Mostra todas as vendas
    } 
    // Se pedir vendas de um usuário específico (apenas Diretoria)
    else if (usuarioId && usuario.perfil === 'Diretoria' && usuario.email === 'matheus@gmp.ind.br') {
      where.usuarioId = usuarioId as string;
    }
    // Se pedir apenas minhas vendas
    else if (meus === 'true' || !todos) {
      where.usuarioId = usuario.id;
    }

    const vendas = await prisma.venda.findMany({
      where,
      include: {
        cliente: {
          select: {
            id: true,
            nome: true,
            empresa: true,
          },
        },
        usuario: {
          select: {
            id: true,
            nome: true,
            email: true,
          },
        },
        itens: {
          include: {
            produto: {
              select: {
                id: true,
                nome: true,
                codigo: true,
              },
            },
          },
        },
      },
      orderBy: {
        dataVenda: 'desc',
      },
    });

    res.json(vendas);
  } catch (error: any) {
    res.status(500).json({ erro: error.message });
  }
});

// GET /api/vendas/:id - Buscar venda por ID
router.get('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const usuario = req.usuario!;

    const venda = await prisma.venda.findUnique({
      where: { id },
      include: {
        cliente: true,
        usuario: {
          select: {
            id: true,
            nome: true,
            email: true,
          },
        },
        itens: {
          include: {
            produto: true,
          },
        },
      },
    });

    if (!venda) {
      return res.status(404).json({ erro: 'Venda não encontrada' });
    }

    // Verificar permissão: Diretoria vê tudo, outros só veem próprias vendas
    if (venda.usuarioId !== usuario.id && 
        !(usuario.perfil === 'Diretoria' && usuario.email === 'matheus@gmp.ind.br')) {
      return res.status(403).json({ erro: 'Acesso negado' });
    }

    res.json(venda);
  } catch (error: any) {
    res.status(500).json({ erro: error.message });
  }
});

// POST /api/vendas - Criar nova venda
router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const usuario = req.usuario!;
    const { clienteId, itens, subtotal, desconto, total, formaPagamento, observacoes } = req.body;

    // Gerar número da venda
    const ultimaVenda = await prisma.venda.findFirst({
      orderBy: { dataCriacao: 'desc' },
    });

    const numero = ultimaVenda
      ? `VND-${String(parseInt(ultimaVenda.numero.split('-')[1]) + 1).padStart(6, '0')}`
      : 'VND-000001';

    // Criar venda com itens
    const venda = await prisma.venda.create({
      data: {
        numero,
        clienteId,
        usuarioId: usuario.id,
        subtotal,
        desconto: desconto || 0,
        total,
        formaPagamento,
        observacoes,
        itens: {
          create: itens.map((item: any) => ({
            produtoId: item.produtoId,
            produtoNome: item.produtoNome,
            quantidade: item.quantidade,
            preco: item.preco,
            precoUnitario: item.precoUnitario || item.preco,
            desconto: item.desconto || 0,
            subtotal: item.subtotal,
            total: item.total || item.subtotal,
          })),
        },
      },
      include: {
        cliente: true,
        itens: {
          include: {
            produto: true,
          },
        },
      },
    });

    res.status(201).json(venda);
  } catch (error: any) {
    res.status(500).json({ erro: error.message });
  }
});

// PUT /api/vendas/:id - Atualizar venda
router.put('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const usuario = req.usuario!;
    const updates = req.body;

    // Verificar se a venda existe e se o usuário tem permissão
    const venda = await prisma.venda.findUnique({
      where: { id },
    });

    if (!venda) {
      return res.status(404).json({ erro: 'Venda não encontrada' });
    }

    if (venda.usuarioId !== usuario.id && 
        !(usuario.perfil === 'Diretoria' && usuario.email === 'matheus@gmp.ind.br')) {
      return res.status(403).json({ erro: 'Acesso negado' });
    }

    const vendaAtualizada = await prisma.venda.update({
      where: { id },
      data: updates,
      include: {
        cliente: true,
        itens: {
          include: {
            produto: true,
          },
        },
      },
    });

    res.json(vendaAtualizada);
  } catch (error: any) {
    res.status(500).json({ erro: error.message });
  }
});

export default router;

