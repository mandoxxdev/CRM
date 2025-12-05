import { db } from '../../db/database';
import { generateId } from '../helpers';
import { passwordService } from '../passwordService';
import type { Usuario } from '../../types';

export const usuarioService = {
  getAll: async (): Promise<Usuario[]> => {
    return await db.usuarios.orderBy('dataCriacao').reverse().toArray();
  },
  
  getById: async (id: string): Promise<Usuario | undefined> => {
    return await db.usuarios.get(id);
  },
  
  getByEmail: async (email: string): Promise<Usuario | undefined> => {
    return await db.usuarios.where('email').equals(email.toLowerCase()).first();
  },
  
  create: async (usuario: Omit<Usuario, 'id' | 'dataCriacao' | 'dataAtualizacao' | 'senhaHash'> & { senha: string }): Promise<string> => {
    const now = new Date().toISOString();
    
    // Hash da senha
    const senhaHash = await passwordService.hash(usuario.senha);
    
    const newUsuario: Usuario = {
      ...usuario,
      senhaHash,
      id: generateId(),
      email: usuario.email.toLowerCase(),
      dataCriacao: now,
      dataAtualizacao: now,
    };
    
    // Remover senha do objeto antes de salvar
    const { senha, ...usuarioSemSenha } = newUsuario as any;
    
    await db.usuarios.add(newUsuario);
    return newUsuario.id;
  },
  
  verificarSenha: async (email: string, senha: string): Promise<Usuario | null> => {
    const usuario = await db.usuarios.where('email').equals(email.toLowerCase()).first();
    if (!usuario || !usuario.ativo) {
      return null;
    }
    
    const senhaValida = await passwordService.verify(senha, usuario.senhaHash);
    if (!senhaValida) {
      return null;
    }
    
    return usuario;
  },
  
  alterarSenha: async (id: string, novaSenha: string): Promise<void> => {
    const senhaHash = await passwordService.hash(novaSenha);
    await db.usuarios.update(id, {
      senhaHash,
      dataAtualizacao: new Date().toISOString(),
    });
  },
  
  update: async (id: string, updates: Partial<Usuario>): Promise<void> => {
    await db.usuarios.update(id, {
      ...updates,
      dataAtualizacao: new Date().toISOString(),
    });
  },
  
  delete: async (id: string): Promise<void> => {
    await db.usuarios.delete(id);
  },
  
  // Criar usuário administrador padrão
  inicializarUsuariosPadrao: async (): Promise<void> => {
    const usuarios = await db.usuarios.toArray();
    
    // Verificar se o administrador já existe
    const adminExiste = usuarios.find(u => u.email === 'matheus@gmp.ind.br');
    
    if (!adminExiste) {
      // Criar administrador padrão
      await usuarioService.create({
        nome: 'Matheus Honrado',
        email: 'matheus@gmp.ind.br',
        senha: '597676',
        perfil: 'Diretoria',
        ativo: true,
      });
    }
  },
};

