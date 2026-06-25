import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed do banco de dados...');

  const seedAdminEmail = process.env.SEED_ADMIN_EMAIL;
  const seedAdminPassword = process.env.SEED_ADMIN_PASSWORD;

  if (!seedAdminEmail || !seedAdminPassword) {
    console.log('ℹ️  Seed de administrador ignorado — configure SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD');
    console.log('✅ Seed concluído!');
    return;
  }

  const adminExiste = await prisma.usuario.findUnique({
    where: { email: seedAdminEmail },
  });

  if (!adminExiste) {
    const senhaHash = await bcrypt.hash(seedAdminPassword, 10);

    await prisma.usuario.create({
      data: {
        nome: 'Administrador',
        email: seedAdminEmail,
        senhaHash,
        perfil: 'Diretoria',
        ativo: true,
      },
    });

    console.log('✅ Usuário administrador criado (consulte o administrador para credenciais)');
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
