import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed do banco de dados...');

  // Criar usuário administrador
  const adminExiste = await prisma.usuario.findUnique({
    where: { email: 'matheus@gmp.ind.br' },
  });

  if (!adminExiste) {
    const senhaHash = await bcrypt.hash('597676', 10);
    
    await prisma.usuario.create({
      data: {
        nome: 'Matheus Honrado',
        email: 'matheus@gmp.ind.br',
        senhaHash,
        perfil: 'Diretoria',
        ativo: true,
      },
    });

    console.log('✅ Usuário administrador criado: matheus@gmp.ind.br');
  } else {
    console.log('ℹ️  Usuário administrador já existe');
  }

  console.log('✅ Seed concluído!');
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

