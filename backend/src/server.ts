import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

// Importar rotas
import authRoutes from './routes/auth.routes.js';
import clienteRoutes from './routes/cliente.routes.js';
import produtoRoutes from './routes/produto.routes.js';
import vendaRoutes from './routes/venda.routes.js';
import oportunidadeRoutes from './routes/oportunidade.routes.js';
import atividadeRoutes from './routes/atividade.routes.js';

dotenv.config();

const app = express();
const prisma = new PrismaClient();

// Middleware
app.use(cors());
app.use(express.json());

// Rotas
app.use('/api/auth', authRoutes);
app.use('/api/clientes', clienteRoutes);
app.use('/api/produtos', produtoRoutes);
app.use('/api/vendas', vendaRoutes);
app.use('/api/oportunidades', oportunidadeRoutes);
app.use('/api/atividades', atividadeRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

export default app;

